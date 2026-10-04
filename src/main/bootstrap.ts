/**
 * Bootstrap entry point for vessel-compliance.
 *
 * This file is the Electron "main" entry. It checks for a hot-update
 * cache in %APPDATA% and loads the actual application code from there
 * (if present and valid) or from the bundled ASAR (default).
 *
 * Keep this file minimal — it should rarely change so that the ASAR
 * version can always bootstrap newer hot-update code.
 */
import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const HOT_UPDATE_DIR = join(app.getPath('userData'), 'hot-update')

let appEntry = join(__dirname, 'index.js')

if (app.isPackaged) {
  try {
    const hotApp = join(HOT_UPDATE_DIR, 'out', 'main', 'index.js')
    const hotVersion = join(HOT_UPDATE_DIR, 'version.json')

    // A hot-update built for an OLDER app version must not override a newer full installer
    // (it would run old code against the new Electron and node_modules)
    const olderThanInstalled = (v: unknown): boolean => {
      const a = String(v || '0').split('.').map(n => parseInt(n, 10) || 0)
      const b = app.getVersion().split('.').map(n => parseInt(n, 10) || 0)
      for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0)
      return false
    }

    if (existsSync(hotApp) && existsSync(hotVersion)) {
      // Validate the version file is readable JSON
      const info = JSON.parse(readFileSync(hotVersion, 'utf-8'))
      if (olderThanInstalled(info.version)) throw new Error('hot-update cache is older than the installed app')

      // Ensure externalized modules (mysql2) resolve from the ASAR node_modules
      const asarNodeModules = join(app.getAppPath(), 'node_modules')
      process.env.NODE_PATH = [process.env.NODE_PATH, asarNodeModules]
        .filter(Boolean)
        .join(require('path').delimiter)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('module').Module._initPaths()

      appEntry = hotApp
    }
  } catch {
    // Hot-update check failed — fall back to ASAR
  }
}

const bundledEntry = join(__dirname, 'index.js')
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(appEntry)
} catch (err) {
  if (appEntry === bundledEntry) throw err
  // A broken hot-update must not crash the app on every launch: disable the cache and start the
  // bundled code instead. Its build number is BLOCKED (hot-update-blocked.json) so the updater does
  // not download the same broken build again and restart into it (an endless restart loop).
  // Only the latest broken copy is kept, for diagnosis.
  console.error('[bootstrap] Hot-update failed to load, falling back to bundled code:', err)
  try {
    const fs = require('fs')
    const userData = app.getPath('userData')
    let info: any = {}
    try { info = JSON.parse(fs.readFileSync(join(HOT_UPDATE_DIR, 'version.json'), 'utf-8')) } catch { /* unknown build */ }
    fs.writeFileSync(join(userData, 'hot-update-blocked.json'), JSON.stringify({
      buildNumber: info.buildNumber ?? null, version: info.version ?? null,
      at: new Date().toISOString(), error: String((err as Error)?.message || err).slice(0, 500)
    }))
    const brokenDir = `${HOT_UPDATE_DIR}-broken`
    fs.rmSync(brokenDir, { recursive: true, force: true })
    fs.renameSync(HOT_UPDATE_DIR, brokenDir)
  } catch { /* ignore — fallback still proceeds */ }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require(bundledEntry)
}
