import { BrowserWindow, Notification } from 'electron'
import { db } from '../mysql/adapter'
import { sanctionsService } from '../sanctions/SanctionsService'

class ComplianceScheduler {
  private checkTimer: NodeJS.Timeout | null = null
  private stopped = false
  private _isRunning = false

  get isRunning(): boolean {
    return this._isRunning
  }

  calculateNextRunTime(dayOfWeek: number, timeOfDay: string): string {
    const now = new Date()
    const [hours, minutes] = timeOfDay.split(':').map(Number)

    // Find next occurrence of the specified day
    let daysUntilNext = dayOfWeek - now.getDay()
    if (daysUntilNext < 0) daysUntilNext += 7
    if (daysUntilNext === 0) {
      // Same day - check if time has passed
      const targetTime = new Date(now)
      targetTime.setHours(hours, minutes, 0, 0)
      if (now >= targetTime) {
        daysUntilNext = 7 // Next week
      }
    }

    const nextRun = new Date(now)
    nextRun.setDate(nextRun.getDate() + daysUntilNext)
    nextRun.setHours(hours, minutes, 0, 0)

    return nextRun.toISOString()
  }

  private sendProgress(current: number, total: number, entityName: string): void {
    try {
      const windows = BrowserWindow.getAllWindows()
      for (const win of windows) {
        if (!win.isDestroyed()) {
          win.webContents.send('compliance:checkProgress', { current, total, entityName })
        }
      }
    } catch {
      /* ignore */
    }
  }

  // trigger 'manual' = Run Now (always runs); 'scheduled' = the weekly slot (runs only when the
  // schedule is enabled and no other workstation has already run / is running this slot)
  async runComplianceCheck(trigger: 'manual' | 'scheduled' = 'manual'): Promise<void> {
    if (this._isRunning) {
      console.log('Compliance check already running, skipping')
      return
    }
    this._isRunning = true
    console.log(`Starting ${trigger} compliance check...`)
    let releaseLock: (() => Promise<void>) | null = null

    try {
      const settings = await db.getComplianceScheduleSettings()
      if (trigger === 'scheduled' && !settings.enabled) {
        console.log('Compliance check is disabled, skipping')
        return
      }
      // Every open app runs this scheduler: only ONE workstation may run the check
      releaseLock = await db.tryNamedLock('vc_compliance_run')
      if (!releaseLock) {
        if (trigger === 'manual')
          throw new Error('A compliance check is already running on another workstation')
        console.log('Compliance check is running on another workstation, skipping')
        return
      }
      if (trigger === 'scheduled' && settings.lastRunAt) {
        // Another workstation already ran this weekly slot (lastRunAt is shared in the DB)
        const sinceLast = Date.now() - new Date(settings.lastRunAt).getTime()
        if (sinceLast < 6 * 24 * 60 * 60 * 1000) {
          console.log('Compliance check already ran this week on another workstation, skipping')
          return
        }
      }
      await db.failStaleComplianceRuns().catch(() => 0)

      // Get all entities and optionally vessels
      const entities = await db.getEntities()
      const vessels = settings.includeVessels
        ? (await db.getVessels()).filter((v) => v.isActive)
        : []

      // Filter out already cleared if skipCleared is enabled
      const entitiesToCheck = settings.skipCleared
        ? entities.filter((e) => e.ofacStatus !== 'CLEARED' && e.ofacStatus !== 'MATCH')
        : entities
      const vesselsToCheck = settings.skipCleared
        ? vessels.filter((v) => v.ofacStatus !== 'CLEARED' && v.ofacStatus !== 'MATCH')
        : vessels

      const totalToCheck = entitiesToCheck.length + vesselsToCheck.length

      // Create log entry
      const logId = await db.createComplianceCheckLog({
        totalChecked: totalToCheck,
        status: 'running'
      })

      let matchesFound = 0
      let checkedCount = 0
      const threshold = settings.threshold / 100 // Convert to decimal

      // Check entities
      const yieldToEventLoop = (): Promise<void> => new Promise<void>((r) => setImmediate(r))
      for (const entity of entitiesToCheck) {
        checkedCount++
        this.sendProgress(checkedCount, totalToCheck, entity.name)
        await yieldToEventLoop()
        try {
          const data = sanctionsService.search(entity.name, {
            threshold: 0.6,
            limit: 10,
            mode: 'both',
            minScore: threshold
          })
          const highScoreMatches = data.results.filter((r) => r.score >= threshold)

          if (highScoreMatches.length > 0) {
            matchesFound++
            const bestScore = Math.max(...highScoreMatches.map((r) => r.score))

            await db.updateEntity(entity.id, {
              ofacCheckedAt: new Date().toISOString(),
              ofacMatchFound: true,
              ofacStatus: 'POTENTIAL_MATCH'
            })

            await db.addComplianceCheckResult({
              logId,
              entityType: 'entity',
              entityId: entity.id,
              entityName: entity.name,
              matchScore: bestScore * 100,
              matchDetails: JSON.stringify(
                highScoreMatches.map((r) => ({
                  id: r.entity.source_id || '',
                  target_type: r.entity.entity_type || 'unknown',
                  source: r.entity.source || 'unknown',
                  source_id: r.entity.source_id || '',
                  names: [r.entity.name, ...(r.entity.aliases || [])].filter(Boolean),
                  score: r.score
                }))
              )
            })

            db.notifyGroupsForEvent(
              'compliance_match',
              `Sanctions match found: ${entity.name}`,
              `Score: ${Math.round(bestScore * 100)}%`,
              'entity',
              entity.id
            ).catch(() => {})
          } else {
            await db.updateEntity(entity.id, {
              ofacCheckedAt: new Date().toISOString(),
              ofacMatchFound: false,
              ofacStatus: 'CLEARED'
            })
          }
        } catch (error) {
          console.error(`Error checking entity ${entity.name}:`, error)
        }
      }

      // Check vessels
      for (const vessel of vesselsToCheck) {
        checkedCount++
        this.sendProgress(checkedCount, totalToCheck, vessel.name)
        await yieldToEventLoop()
        try {
          const data = sanctionsService.search(vessel.name, {
            threshold: 0.6,
            limit: 10,
            mode: 'both',
            minScore: threshold
          })
          const highScoreMatches = data.results.filter((r) => r.score >= threshold)

          if (highScoreMatches.length > 0) {
            matchesFound++
            const bestScore = Math.max(...highScoreMatches.map((r) => r.score))

            await db.updateVessel(vessel.id, {
              ofacCheckedAt: new Date().toISOString(),
              ofacMatchFound: true,
              ofacStatus: 'POTENTIAL_MATCH'
            })

            await db.addComplianceCheckResult({
              logId,
              entityType: 'vessel',
              entityId: vessel.id,
              entityName: vessel.name,
              matchScore: bestScore * 100,
              matchDetails: JSON.stringify(
                highScoreMatches.map((r) => ({
                  id: r.entity.source_id || '',
                  target_type: r.entity.entity_type || 'unknown',
                  source: r.entity.source || 'unknown',
                  source_id: r.entity.source_id || '',
                  names: [r.entity.name, ...(r.entity.aliases || [])].filter(Boolean),
                  score: r.score
                }))
              )
            })

            db.notifyGroupsForEvent(
              'compliance_match',
              `Sanctions match found: ${vessel.name}`,
              `Score: ${Math.round(bestScore * 100)}%`,
              'vessel',
              vessel.id
            ).catch(() => {})
          } else {
            await db.updateVessel(vessel.id, {
              ofacCheckedAt: new Date().toISOString(),
              ofacMatchFound: false,
              ofacStatus: 'CLEARED'
            })
          }
        } catch (error) {
          console.error(`Error checking vessel ${vessel.name}:`, error)
        }
      }

      // Update log as completed
      await db.updateComplianceCheckLog(logId, {
        matchesFound,
        status: 'completed'
      })

      // Update schedule settings with last run time
      settings.lastRunAt = new Date().toISOString()
      settings.nextRunAt = this.calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
      await db.setComplianceScheduleSettings(settings)

      // Show notification if matches found
      if (matchesFound > 0 && Notification.isSupported()) {
        new Notification({
          title: 'Compliance Check Complete',
          body: `Found ${matchesFound} potential sanctions match${matchesFound > 1 ? 'es' : ''} requiring review.`
        }).show()
      }

      console.log(
        `Compliance check completed: ${totalToCheck} checked, ${matchesFound} matches found`
      )
    } catch (error) {
      console.error('Compliance check failed:', error)
      if (trigger === 'manual') throw error
    } finally {
      if (releaseLock) await releaseLock().catch(() => {})
      this._isRunning = false
      this.sendProgress(0, 0, '')
    }
  }

  async start(): Promise<void> {
    this.stopped = false
    // Clear existing timer
    if (this.checkTimer) {
      clearTimeout(this.checkTimer)
      this.checkTimer = null
    }

    if (!db.isConnected()) {
      // start() runs at launch BEFORE the database connects. It used to give up here and
      // nothing called it again, so the weekly check never ran. Retry until connected.
      console.log('Database not connected yet, compliance scheduler will retry in 30 s')
      this.checkTimer = setTimeout(() => {
        if (!this.stopped) this.start()
      }, 30000)
      return
    }

    try {
      const settings = await db.getComplianceScheduleSettings()
      if (!settings.enabled) return

      const now = new Date()
      let nextRun = settings.nextRunAt ? new Date(settings.nextRunAt) : new Date(NaN)
      const lastRun = settings.lastRunAt ? new Date(settings.lastRunAt).getTime() : 0
      const weekMs = 7 * 24 * 60 * 60 * 1000

      if (isNaN(nextRun.getTime()) || nextRun <= now) {
        // The slot passed while no app was open (or was never set): catch up shortly
        // after launch when the last run is more than a week old, else wait for the next slot
        if (now.getTime() - lastRun > weekMs) {
          nextRun = new Date(now.getTime() + 2 * 60 * 1000)
          console.log('Weekly compliance check was missed — running it in 2 minutes')
        } else {
          nextRun = new Date(this.calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay))
        }
      }

      const delay = Math.max(0, nextRun.getTime() - now.getTime())
      console.log(
        `Compliance check scheduled for ${nextRun.toLocaleString()} (in ${Math.round(delay / 1000 / 60)} mins)`
      )

      this.checkTimer = setTimeout(async () => {
        try {
          await this.runComplianceCheck('scheduled')
        } catch {
          /* logged inside */
        }
        // Reschedule only if not stopped mid-check
        if (!this.stopped) this.start()
      }, delay)
    } catch (error) {
      console.error('Failed to start compliance scheduler:', error)
    }
  }

  stop(): void {
    this.stopped = true
    if (this.checkTimer) {
      clearTimeout(this.checkTimer)
      this.checkTimer = null
    }
  }
}

export const complianceScheduler = new ComplianceScheduler()
