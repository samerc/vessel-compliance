import { Notification } from 'electron'
import { db } from '../mysql/adapter'

class ComplianceScheduler {
    private checkTimer: NodeJS.Timeout | null = null

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

    async runComplianceCheck(): Promise<void> {
        console.log('Starting scheduled compliance check...')

        try {
            const settings = await db.getComplianceScheduleSettings()
            if (!settings.enabled) {
                console.log('Compliance check is disabled, skipping')
                return
            }

            const apiKey = db.getSanctionsApiKey()
            if (!apiKey) {
                console.error('Sanctions API key not configured, skipping compliance check')
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
            const threshold = settings.threshold / 100 // Convert to decimal

            // Check entities
            for (const entity of entitiesToCheck) {
                try {
                    const params = new URLSearchParams({
                        q: entity.name,
                        mode: 'both',
                        threshold: '0.6',
                        limit: '10'
                    })

                    const response = await fetch(`https://sanctions.fancyshark.com/api/search?${params}`, {
                        headers: { 'X-API-Key': apiKey }
                    })

                    if (response.ok) {
                        const data = await response.json()
                        const highScoreMatches = (data.results || []).filter((r: any) => r.score >= threshold)

                        if (highScoreMatches.length > 0) {
                            matchesFound++
                            const bestScore = Math.max(...highScoreMatches.map((r: any) => r.score))

                            // Update entity status
                            await db.updateEntity(entity.id, {
                                ofacCheckedAt: new Date().toISOString(),
                                ofacMatchFound: true,
                                ofacStatus: 'POTENTIAL_MATCH'
                            })

                            // Save result
                            await db.addComplianceCheckResult({
                                logId,
                                entityType: 'entity',
                                entityId: entity.id,
                                entityName: entity.name,
                                matchScore: bestScore * 100,
                                matchDetails: JSON.stringify(highScoreMatches.map((r: any) => ({
                                    id: r.entity?.source_id || '',
                                    target_type: r.entity?.entity_type || 'unknown',
                                    source: r.entity?.source || 'unknown',
                                    source_id: r.entity?.source_id || '',
                                    names: [r.entity?.name, ...(r.entity?.aliases || [])].filter(Boolean),
                                    score: r.score
                                })))
                            })
                        } else {
                            // No high-score matches - update as cleared
                            await db.updateEntity(entity.id, {
                                ofacCheckedAt: new Date().toISOString(),
                                ofacMatchFound: false,
                                ofacStatus: 'CLEARED'
                            })
                        }
                    }

                    // Rate limiting - wait between requests
                    await new Promise(resolve => setTimeout(resolve, 200))
                } catch (error) {
                    console.error(`Error checking entity ${entity.name}:`, error)
                }
            }

            // Check vessels
            for (const vessel of vesselsToCheck) {
                try {
                    const params = new URLSearchParams({
                        q: vessel.name,
                        mode: 'both',
                        threshold: '0.6',
                        limit: '10'
                    })

                    const response = await fetch(`https://sanctions.fancyshark.com/api/search?${params}`, {
                        headers: { 'X-API-Key': apiKey }
                    })

                    if (response.ok) {
                        const data = await response.json()
                        const highScoreMatches = (data.results || []).filter((r: any) => r.score >= threshold)

                        if (highScoreMatches.length > 0) {
                            matchesFound++
                            const bestScore = Math.max(...highScoreMatches.map((r: any) => r.score))

                            // Update vessel status
                            await db.updateVessel(vessel.id, {
                                ofacCheckedAt: new Date().toISOString(),
                                ofacMatchFound: true,
                                ofacStatus: 'POTENTIAL_MATCH'
                            })

                            // Save result
                            await db.addComplianceCheckResult({
                                logId,
                                entityType: 'vessel',
                                entityId: vessel.id,
                                entityName: vessel.name,
                                matchScore: bestScore * 100,
                                matchDetails: JSON.stringify(highScoreMatches.map((r: any) => ({
                                    id: r.entity?.source_id || '',
                                    target_type: r.entity?.entity_type || 'unknown',
                                    source: r.entity?.source || 'unknown',
                                    source_id: r.entity?.source_id || '',
                                    names: [r.entity?.name, ...(r.entity?.aliases || [])].filter(Boolean),
                                    score: r.score
                                })))
                            })
                        } else {
                            // No high-score matches - update as cleared
                            await db.updateVessel(vessel.id, {
                                ofacCheckedAt: new Date().toISOString(),
                                ofacMatchFound: false,
                                ofacStatus: 'CLEARED'
                            })
                        }
                    }

                    // Rate limiting
                    await new Promise(resolve => setTimeout(resolve, 200))
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
        }
    }

    async start(): Promise<void> {
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
                // Reschedule by restarting
                this.start()
            }, delay)
        } catch (error) {
            console.error('Failed to start compliance scheduler:', error)
        }
    }

    stop() {
        if (this.checkTimer) {
            clearTimeout(this.checkTimer)
            this.checkTimer = null
        }
    }
}

export const complianceScheduler = new ComplianceScheduler()
