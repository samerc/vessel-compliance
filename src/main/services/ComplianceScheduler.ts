import { BrowserWindow, Notification } from 'electron'
import { db } from '../mysql/adapter'
import { sanctionsService } from '../sanctions/SanctionsService'

class ComplianceScheduler {
    private checkTimer: NodeJS.Timeout | null = null
    private stopped = false
    private _isRunning = false

    get isRunning(): boolean { return this._isRunning }

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
        } catch { /* ignore */ }
    }

    async runComplianceCheck(): Promise<void> {
        if (this._isRunning) {
            console.log('Compliance check already running, skipping')
            return
        }
        this._isRunning = true
        console.log('Starting scheduled compliance check...')

        try {
            const settings = await db.getComplianceScheduleSettings()
            if (!settings.enabled) {
                console.log('Compliance check is disabled, skipping')
                return
            }

            // Get all entities and optionally vessels
            const entities = await db.getEntities()
            const vessels = settings.includeVessels ? (await db.getVessels()).filter(v => v.isActive) : []

            // Filter out already cleared if skipCleared is enabled
            const entitiesToCheck = settings.skipCleared
                ? entities.filter((e: any) => e.ofacStatus !== 'CLEARED' && e.ofacStatus !== 'MATCH')
                : entities
            const vesselsToCheck = settings.skipCleared
                ? vessels.filter((v: any) => v.ofacStatus !== 'CLEARED' && v.ofacStatus !== 'MATCH')
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
            for (const entity of entitiesToCheck) {
                checkedCount++
                this.sendProgress(checkedCount, totalToCheck, entity.name)
                try {
                    const data = sanctionsService.search(entity.name, { threshold: 0.6, limit: 10, mode: 'both' })
                    const highScoreMatches = data.results.filter(r => r.score >= threshold)

                    if (highScoreMatches.length > 0) {
                        matchesFound++
                        const bestScore = Math.max(...highScoreMatches.map(r => r.score))

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
                            matchDetails: JSON.stringify(highScoreMatches.map(r => ({
                                id: r.entity.source_id || '',
                                target_type: r.entity.entity_type || 'unknown',
                                source: r.entity.source || 'unknown',
                                source_id: r.entity.source_id || '',
                                names: [r.entity.name, ...(r.entity.aliases || [])].filter(Boolean),
                                score: r.score
                            })))
                        })

                        db.notifyGroupsForEvent('compliance_match', `Sanctions match found: ${entity.name}`, `Score: ${Math.round(bestScore * 100)}%`, 'entity', entity.id).catch(() => {})
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
                try {
                    const data = sanctionsService.search(vessel.name, { threshold: 0.6, limit: 10, mode: 'both' })
                    const highScoreMatches = data.results.filter(r => r.score >= threshold)

                    if (highScoreMatches.length > 0) {
                        matchesFound++
                        const bestScore = Math.max(...highScoreMatches.map(r => r.score))

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
                            matchDetails: JSON.stringify(highScoreMatches.map(r => ({
                                id: r.entity.source_id || '',
                                target_type: r.entity.entity_type || 'unknown',
                                source: r.entity.source || 'unknown',
                                source_id: r.entity.source_id || '',
                                names: [r.entity.name, ...(r.entity.aliases || [])].filter(Boolean),
                                score: r.score
                            })))
                        })

                        db.notifyGroupsForEvent('compliance_match', `Sanctions match found: ${vessel.name}`, `Score: ${Math.round(bestScore * 100)}%`, 'vessel', vessel.id).catch(() => {})
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

            console.log(`Compliance check completed: ${totalToCheck} checked, ${matchesFound} matches found`)

        } catch (error: any) {
            console.error('Compliance check failed:', error)
        } finally {
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
            console.log('Database not connected, scheduler will start after connection')
            return
        }

        try {
            const settings = await db.getComplianceScheduleSettings()
            if (!settings.enabled) return

            const now = new Date()
            let nextRun = new Date(settings.nextRunAt)

            // If next run is in the past, calculate new next run
            if (nextRun <= now) {
                const calculatedNext = this.calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
                nextRun = new Date(calculatedNext)
            }

            const delay = nextRun.getTime() - now.getTime()
            console.log(`Compliance check scheduled for ${nextRun.toLocaleString()} (in ${Math.round(delay / 1000 / 60)} mins)`)

            this.checkTimer = setTimeout(async () => {
                await this.runComplianceCheck()
                // Reschedule only if not stopped mid-check
                if (!this.stopped) this.start()
            }, delay)
        } catch (error) {
            console.error('Failed to start compliance scheduler:', error)
        }
    }

    stop() {
        this.stopped = true
        if (this.checkTimer) {
            clearTimeout(this.checkTimer)
            this.checkTimer = null
        }
    }
}

export const complianceScheduler = new ComplianceScheduler()
