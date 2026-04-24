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

    if (existsSync(hotApp) && existsSync(hotVersion)) {
      // Validate the version file is readable JSON
      JSON.parse(readFileSync(hotVersion, 'utf-8'))

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

// eslint-disable-next-line @typescript-eslint/no-require-imports
require(appEntry)
