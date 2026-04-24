/**
 * Hot-Update Service
 *
 * Checks GitHub for a newer code-only release (tagged "code-latest")
 * and downloads + caches it in %APPDATA%/vessel-compliance/hot-update/.
 * On next app restart, the bootstrap loads the cached code instead of
 * the bundled ASAR default.
 */
import { app } from 'electron'
import { net } from 'electron'
import {
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync
} from 'fs'
import { join } from 'path'

const USER_DATA = app.getPath('userData')
const HOT_UPDATE_DIR = join(USER_DATA, 'hot-update')
const VERSION_FILE = 'version.json'

const GITHUB_OWNER = 'samerc'
const GITHUB_REPO = 'vessel-compliance'
const CODE_RELEASE_TAG = 'code-latest'

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
  availableBuild: number | null
  updateReady: boolean
}

/** Simple HTTPS GET that returns a buffer */
function httpsGet(url: string, headers: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const request = net.request(url)
    for (const [k, v] of Object.entries(headers)) {
      request.setHeader(k, v)
    }
    request.on('response', (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const location = Array.isArray(response.headers.location)
          ? response.headers.location[0]
          : response.headers.location
        httpsGet(location, headers).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    })
    request.on('error', reject)
    request.end()
  })
}

class HotUpdateService {
  private checkInterval: ReturnType<typeof setInterval> | null = null

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

  /** Fetch the code-latest release info from GitHub */
  async getRemoteVersion(): Promise<HotUpdateVersion | null> {
    try {
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${CODE_RELEASE_TAG}`
      const buf = await httpsGet(url, {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'vessel-compliance-updater'
      })
      const release = JSON.parse(buf.toString('utf-8'))
      if (!release.body) return null

      // Parse version info from the release body (first line is JSON)
      try {
        const lines = release.body.split('\n')
        const versionLine = lines.find((l: string) => l.trim().startsWith('{'))
        if (versionLine) {
          return JSON.parse(versionLine.trim())
        }
      } catch { /* parse error */ }
      return null
    } catch {
      return null
    }
  }

  /** Find the code-update.zip download URL from the release */
  async getDownloadUrl(): Promise<string | null> {
    try {
      const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/tags/${CODE_RELEASE_TAG}`
      const buf = await httpsGet(url, {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'vessel-compliance-updater'
      })
      const release = JSON.parse(buf.toString('utf-8'))
      const asset = release.assets?.find((a: any) => a.name === 'code-update.zip')
      return asset?.browser_download_url || null
    } catch {
      return null
    }
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
  async getInfo(): Promise<HotUpdateInfo> {
    const localVersion = this.getLocalVersion()
    const source = this.getSource()
    const currentBuild = localVersion?.buildNumber ?? 0
    const currentVersion = localVersion?.version ?? app.getVersion()

    let availableBuild: number | null = null
    let updateReady = false
    try {
      const remote = await this.getRemoteVersion()
      if (remote) {
        availableBuild = remote.buildNumber
        updateReady = remote.buildNumber > currentBuild
      }
    } catch { /* offline */ }

    return {
      currentBuild,
      currentVersion,
      source,
      availableBuild,
      updateReady
    }
  }

  /** Synchronous version for quick status (no network call) */
  getInfoSync(): Omit<HotUpdateInfo, 'availableBuild' | 'updateReady'> {
    const localVersion = this.getLocalVersion()
    const source = this.getSource()
    return {
      currentBuild: localVersion?.buildNumber ?? 0,
      currentVersion: localVersion?.version ?? app.getVersion(),
      source
    }
  }

  /**
   * Check GitHub for updates, download and stage if available.
   * Returns true if a new update was staged (restart needed).
   */
  async checkAndStage(): Promise<{ updated: boolean; version?: HotUpdateVersion; error?: string }> {
    try {
      const remoteVersion = await this.getRemoteVersion()
      if (!remoteVersion) {
        return { updated: false }
      }

      const localVersion = this.getLocalVersion()
      const localBuild = localVersion?.buildNumber ?? 0

      if (remoteVersion.buildNumber <= localBuild) {
        return { updated: false }
      }

      // Newer version available — download the zip
      const downloadUrl = await this.getDownloadUrl()
      if (!downloadUrl) {
        return { updated: false, error: 'No code-update.zip found in release' }
      }

      const zipBuffer = await httpsGet(downloadUrl, {
        'User-Agent': 'vessel-compliance-updater'
      })

      // Extract to staging directory
      const stagingDir = join(USER_DATA, 'hot-update-staging')
      if (existsSync(stagingDir)) {
        rmSync(stagingDir, { recursive: true, force: true })
      }
      mkdirSync(stagingDir, { recursive: true })

      // Use JSZip (already a dependency) to extract
      const JSZip = require('jszip')
      const zip = await JSZip.loadAsync(zipBuffer)
      const entries = Object.keys(zip.files)

      for (const entryPath of entries) {
        const entry = zip.files[entryPath]
        if (entry.dir) {
          mkdirSync(join(stagingDir, entryPath), { recursive: true })
        } else {
          const dir = join(stagingDir, entryPath, '..')
          mkdirSync(dir, { recursive: true })
          const content = await entry.async('nodebuffer')
          writeFileSync(join(stagingDir, entryPath), content)
        }
      }

      // Write version.json into staging
      writeFileSync(
        join(stagingDir, VERSION_FILE),
        JSON.stringify(remoteVersion, null, 2),
        'utf-8'
      )

      // Atomic-ish swap: old → backup, staging → current, delete backup
      const backupDir = join(USER_DATA, 'hot-update-old')
      if (existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true })
      }
      if (existsSync(HOT_UPDATE_DIR)) {
        const { renameSync } = require('fs')
        renameSync(HOT_UPDATE_DIR, backupDir)
      }
      const { renameSync } = require('fs')
      renameSync(stagingDir, HOT_UPDATE_DIR)
      if (existsSync(backupDir)) {
        rmSync(backupDir, { recursive: true, force: true })
      }

      return { updated: true, version: remoteVersion }
    } catch (err: any) {
      return { updated: false, error: err.message || 'Update failed' }
    }
  }

  /** Start periodic background checks (call after app is ready) */
  startPeriodicCheck(onUpdateAvailable: (version: HotUpdateVersion) => void): void {
    if (this.checkInterval) return

    // Initial check after 60 seconds (let the app finish loading)
    setTimeout(async () => {
      try {
        const remote = await this.getRemoteVersion()
        const local = this.getLocalVersion()
        const localBuild = local?.buildNumber ?? 0
        if (remote && remote.buildNumber > localBuild) {
          onUpdateAvailable(remote)
        }
      } catch { /* silent */ }
    }, 60 * 1000)

    // Then check every 30 minutes
    this.checkInterval = setInterval(async () => {
      try {
        const remote = await this.getRemoteVersion()
        const local = this.getLocalVersion()
        const localBuild = local?.buildNumber ?? 0
        if (remote && remote.buildNumber > localBuild) {
          onUpdateAvailable(remote)
        }
      } catch { /* silent */ }
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
