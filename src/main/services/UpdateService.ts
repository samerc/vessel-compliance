import { autoUpdater } from 'electron-updater'
import { BrowserWindow, app } from 'electron'
import log from 'electron-log'

/**
 * UpdateService manages automatic application updates using electron-updater.
 * 
 * Features:
 * - Automatic update checking on app startup
 * - Background download of updates
 * - User notification via renderer events
 * - Manual update checking
 * - Progress tracking during download
 */
export class UpdateService {
    private mainWindow: BrowserWindow | null = null
    private updateCheckInProgress = false

    constructor() {
        // Configure logging
        log.transports.file.level = 'info'
        autoUpdater.logger = log

        // Configure auto-updater
        autoUpdater.autoDownload = true // Automatically download updates
        autoUpdater.autoInstallOnAppQuit = true // Install on app quit
        autoUpdater.allowPrerelease = false // Skip prerelease (code-latest hot-updates)

        this.setupEventListeners()
    }

    /**
     * Set the main window to send update events to
     */
    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window
    }

    /**
     * Setup event listeners for auto-updater
     */
    private setupEventListeners(): void {
        // Checking for updates
        autoUpdater.on('checking-for-update', () => {
            log.info('Checking for updates...')
            this.sendToRenderer('update:checking')
        })

        // Update available
        autoUpdater.on('update-available', (info) => {
            log.info('Update available:', info.version)
            this.sendToRenderer('update:available', {
                version: info.version,
                releaseDate: info.releaseDate,
                releaseName: info.releaseName,
                releaseNotes: info.releaseNotes
            })
        })

        // No update available
        autoUpdater.on('update-not-available', (info) => {
            log.info('Update not available. Current version is latest:', info.version)
            this.sendToRenderer('update:not-available', { version: info.version })
            this.updateCheckInProgress = false
        })

        // Download progress
        autoUpdater.on('download-progress', (progressObj) => {
            log.info(`Download progress: ${progressObj.percent}%`)
            this.sendToRenderer('update:download-progress', {
                percent: progressObj.percent,
                bytesPerSecond: progressObj.bytesPerSecond,
                transferred: progressObj.transferred,
                total: progressObj.total
            })
        })

        // Update downloaded and ready to install
        autoUpdater.on('update-downloaded', (info) => {
            log.info('Update downloaded:', info.version)
            this.sendToRenderer('update:downloaded', {
                version: info.version,
                releaseDate: info.releaseDate
            })
            this.updateCheckInProgress = false
        })

        // Error occurred
        autoUpdater.on('error', (error) => {
            log.error('Update error:', error)
            this.sendToRenderer('update:error', {
                message: error.message || 'Unknown error occurred during update'
            })
            this.updateCheckInProgress = false
        })
    }

    /**
     * Send event to renderer process
     */
    private sendToRenderer(channel: string, data?: any): void {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data)
        }
    }

    /**
     * Check for updates
     * @param manual - Whether this is a manual check (will show "no updates" message)
     */
    async checkForUpdates(manual = false): Promise<void> {
        if (this.updateCheckInProgress) {
            log.info('Update check already in progress, skipping...')
            return
        }

        this.updateCheckInProgress = true

        try {
            log.info(`Checking for updates (manual: ${manual})...`)
            await autoUpdater.checkForUpdates()
        } catch (error) {
            log.error('Error checking for updates:', error)
            this.updateCheckInProgress = false

            if (manual) {
                this.sendToRenderer('update:error', {
                    message: 'Failed to check for updates. Please try again later.'
                })
            }
        }
    }

    /**
     * Quit the app and install the update
     */
    quitAndInstall(): void {
        log.info('Quitting and installing update...')
        // false, true = don't force quit, restart after install
        autoUpdater.quitAndInstall(false, true)
    }

    /**
     * Get current version
     */
    getCurrentVersion(): string {
        return app.getVersion()
    }

    /**
     * Fetch changelogs from GitHub Releases API
     */
    async getChangelogs(): Promise<any[]> {
        try {
            const response = await fetch('https://api.github.com/repos/samerc/vessel-compliance/releases')
            if (!response.ok) {
                throw new Error(`Failed to fetch releases: ${response.statusText}`)
            }
            const releases = await response.json() as any[]
            return releases.map(r => ({
                version: r.tag_name,
                name: r.name,
                date: r.published_at,
                notes: r.body,
                url: r.html_url
            }))
        } catch (error) {
            log.error('Error fetching changelogs:', error)
            throw error
        }
    }
}

// Export singleton instance
export const updateService = new UpdateService()
