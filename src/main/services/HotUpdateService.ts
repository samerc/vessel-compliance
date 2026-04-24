/**
 * Hot-Update Service
 *
 * Checks a network share for newer application code and stages it
 * in %APPDATA%/vessel-compliance/hot-update/. On next app restart,
 * the bootstrap loads the staged code instead of the ASAR default.
 */
import { app } from 'electron'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  renameSync,
  rmSync,
  mkdirSync
} from 'fs'
import { join } from 'path'

const USER_DATA = app.getPath('userData')
const HOT_UPDATE_DIR = join(USER_DATA, 'hot-update')
const SETTINGS_FILE = join(USER_DATA, 'hot-update-settings.json')
const VERSION_FILE = 'version.json'

export interface HotUpdateVersion {
  buildNumber: number
  version: string
  timestamp: string
  notes?: string
}

export interface HotUpdateInfo {
  currentBuild: number
  currentVersion: string
  source: 'asar' | 'hot-update'
  networkPath: string | null
  availableBuild: number | null
  updateReady: boolean
}

class HotUpdateService {
  private networkPath: string | null = null
  private checkInterval: ReturnType<typeof setInterval> | null = null

  /** Load the saved network path from the local settings file */
  loadSettings(): void {
    try {
      if (existsSync(SETTINGS_FILE)) {
        const data = JSON.parse(readFileSync(SETTINGS_FILE, 'utf-8'))
        this.networkPath = data.networkPath || null
      }
    } catch {
      this.networkPath = null
    }
  }

  /** Save the network path (called from IPC when admin sets it) */
  saveSettings(networkPath: string): void {
    this.networkPath = networkPath || null
    try {
      writeFileSync(SETTINGS_FILE, JSON.stringify({ networkPath: this.networkPath }), 'utf-8')
    } catch {
      // Non-critical — settings will be re-saved next time
    }
  }

  /** Get the currently configured network path */
  getNetworkPath(): string | null {
    return this.networkPath
  }

  /** Get the local cache version (or null if no cache) */
  getLocalVersion(): HotUpdateVersion | null {
    try {
      const file = join(HOT_UPDATE_DIR, VERSION_FILE)
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf-8'))
      }
    } catch { /* no cache */ }
    return null
  }

  /** Get the network share version (or null if unreachable) */
  getNetworkVersion(): HotUpdateVersion | null {
    if (!this.networkPath) return null
    try {
      const file = join(this.networkPath, VERSION_FILE)
      if (existsSync(file)) {
        return JSON.parse(readFileSync(file, 'utf-8'))
      }
    } catch { /* unreachable */ }
    return null
  }

  /** Determine which source the app is currently running from */
  getSource(): 'asar' | 'hot-update' {
    try {
      if (existsSync(join(HOT_UPDATE_DIR, VERSION_FILE))) {
        const hotApp = join(HOT_UPDATE_DIR, 'out', 'main', 'index.js')
        if (existsSync(hotApp)) return 'hot-update'
      }
    } catch { /* fall through */ }
    return 'asar'
  }

  /** Get current running version info */
  getInfo(): HotUpdateInfo {
    const localVersion = this.getLocalVersion()
    const networkVersion = this.getNetworkVersion()
    const source = this.getSource()
    const currentBuild = localVersion?.buildNumber ?? 0
    const currentVersion = localVersion?.version ?? app.getVersion()

    return {
      currentBuild,
      currentVersion,
      source,
      networkPath: this.networkPath,
      availableBuild: networkVersion?.buildNumber ?? null,
      updateReady: networkVersion !== null && networkVersion.buildNumber > currentBuild
    }
  }

  /**
   * Check for updates and stage them if available.
   * Returns true if a new update was staged (restart needed).
   */
  checkAndStage(): { updated: boolean; version?: HotUpdateVersion; error?: string } {
    if (!this.networkPath) {
      return { updated: false }
    }

    try {
      const networkVersion = this.getNetworkVersion()
      if (!networkVersion) {
        return { updated: false }
      }

      const localVersion = this.getLocalVersion()
      const localBuild = localVersion?.buildNumber ?? 0

      if (networkVersion.buildNumber <= localBuild) {
        return { updated: false }
      }

      // Newer version available — stage it
      const networkOut = join(this.networkPath, 'out')
      if (!existsSync(networkOut)) {
        return { updated: false, error: 'Network share missing out/ directory' }
      }

      // Copy to temp directory first
      const tempDir = join(USER_DATA, 'hot-update-staging')
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true, force: true })
      }
      mkdirSync(join(tempDir, 'out'), { recursive: true })

      // Copy the out/ directory
      cpSync(networkOut, join(tempDir, 'out'), { recursive: true })

      // Copy version.json
      cpSync(
        join(this.networkPath, VERSION_FILE),
        join(tempDir, VERSION_FILE)
      )

      // Atomic-ish swap: old → backup, staging → current, delete backup
      const backupDir = join(USER_DATA, 'hot-update-old')
      if (existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true })
      }
      if (existsSync(HOT_UPDATE_DIR)) {
        renameSync(HOT_UPDATE_DIR, backupDir)
      }
      renameSync(tempDir, HOT_UPDATE_DIR)
      if (existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true })
      }

      return { updated: true, version: networkVersion }
    } catch (err: any) {
      return { updated: false, error: err.message || 'Update failed' }
    }
  }

  /** Start periodic background checks (call after DB is connected) */
  startPeriodicCheck(onUpdateAvailable: (version: HotUpdateVersion) => void): void {
    if (this.checkInterval) return

    // Check every 30 minutes
    this.checkInterval = setInterval(() => {
      if (!this.networkPath) return
      const networkVersion = this.getNetworkVersion()
      const localVersion = this.getLocalVersion()
      const localBuild = localVersion?.buildNumber ?? 0

      if (networkVersion && networkVersion.buildNumber > localBuild) {
        onUpdateAvailable(networkVersion)
      }
    }, 30 * 60 * 1000)
  }

  /** Stop periodic checks */
  stopPeriodicCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }

  /** Clear the hot-update cache (revert to ASAR version) */
  clearCache(): void {
    try {
      if (existsSync(HOT_UPDATE_DIR)) {
        rmSync(HOT_UPDATE_DIR, { recursive: true, force: true })
      }
    } catch { /* non-critical */ }
  }
}

export const hotUpdateService = new HotUpdateService()
