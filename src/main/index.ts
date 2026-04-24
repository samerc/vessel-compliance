import { app, shell, BrowserWindow, ipcMain, screen, Menu } from 'electron'
import { join, dirname, resolve, normalize, extname, basename } from 'path'
import { Worker } from 'worker_threads'
import { existsSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { db } from './mysql/adapter'
import { auth } from './auth'
import { complianceScheduler } from './services/ComplianceScheduler'
import { FileManagerService } from './services/FileManagerService'
import { DailyAlertScheduler } from './services/DailyAlertScheduler'
import { updateService } from './services/UpdateService'
import { formatDateForMySQL } from './mysql/utils'
import { assignRegistryNumber, markRegistryCancelled } from './services/QuotationRegistryService'
import { hotUpdateService } from './services/HotUpdateService'
import Store from 'electron-store'
import { createPool } from 'mysql2/promise'
import * as bcrypt from 'bcryptjs'

// ── File Path Resolution (local ↔ network) ────────────────────────────────────
let filePathLocal = '' // e.g. C:\folder1
let filePathNetwork = '' // e.g. \\192.168.10.1\folder1
let isRemoteUser = false // true when db host is not localhost

function initFilePathSettings(): void {
  // Determine if this is a remote user from the db config
  try {
    const cfgPath = db.getConfigPath?.() || ''
    if (cfgPath && existsSync(cfgPath)) {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'))
      const host = (cfg.host || '').toLowerCase()
      isRemoteUser = host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
    }
  } catch { /* default to local */ }
}

async function loadFilePathSettings(): Promise<void> {
  try {
    const raw = await db.getSetting('filePathSettings')
    if (raw) {
      const parsed = JSON.parse(raw)
      filePathLocal = (parsed.localPath || '').replace(/[\\/]+$/, '')
      filePathNetwork = (parsed.networkPath || '').replace(/[\\/]+$/, '')
    }
  } catch { /* ignore */ }
}

/** Resolve a DB path for the current user (local→network for remote users) */
function resolveFilePath(dbPath: string): string {
  if (!dbPath || !filePathLocal || !filePathNetwork || !isRemoteUser) return dbPath
  const normalLocal = normalize(filePathLocal).toLowerCase()
  const normalDbPath = normalize(dbPath).toLowerCase()
  if (normalDbPath.startsWith(normalLocal)) {
    return filePathNetwork + dbPath.substring(filePathLocal.length)
  }
  return dbPath
}

/** Canonicalize a user-selected path to the DB form (network→local for remote users) */
function canonicalizeFilePath(userPath: string): string {
  if (!userPath || !filePathLocal || !filePathNetwork) return userPath
  const normalNetwork = normalize(filePathNetwork).toLowerCase()
  const normalUserPath = normalize(userPath).toLowerCase()
  if (normalUserPath.startsWith(normalNetwork)) {
    return filePathLocal + userPath.substring(filePathNetwork.length)
  }
  // If already canonical (local path), keep as-is
  const normalLocal = normalize(filePathLocal).toLowerCase()
  if (normalUserPath.startsWith(normalLocal)) return userPath
  return userPath
}

/** Check if a file path is on the shared folder (local or network) */
function isSharedPath(userPath: string): boolean {
  if (!filePathLocal && !filePathNetwork) return true // no settings = allow all
  const normalPath = normalize(userPath).toLowerCase()
  if (filePathLocal && normalPath.startsWith(normalize(filePathLocal).toLowerCase())) return true
  if (filePathNetwork && normalPath.startsWith(normalize(filePathNetwork).toLowerCase())) return true
  return false
}

/** Assign quotation number via registry Excel (if configured) or DB fallback */
async function assignQuotationNumberViaRegistry(quotationId: string): Promise<string> {
  const registryPath = await db.getSetting('quotationRegistryPath')
  if (!registryPath) {
    // No registry configured — use DB-based numbering
    return db.assignQuotationNumber(quotationId)
  }

  const resolvedPath = resolveFilePath(registryPath)

  // Load quotation data for registry entry
  const q = await db.getQuotation(quotationId)
  if (!q) throw new Error('Quotation not found')
  if (q.referenceNumber && !q.referenceNumber.startsWith('DRAFT-')) return q.referenceNumber

  // Get vessels, assureds, customer info
  const vessels = await db.getQuotationVessels(quotationId)
  const vesselNames = vessels.map((v: any) => v.name || v.vesselLabel).filter(Boolean)
  const vesselIMOs = vessels.map((v: any) => v.imoNumber).filter(Boolean)
  const vesselTypes = vessels.map((v: any) => v.vesselType).filter(Boolean)

  // Get customer/broker name
  let broker = ''
  if (q.customerEntityId) {
    try {
      const entities = await db.getEntities()
      const entity = entities.find((e: any) => e.id === q.customerEntityId)
      broker = entity?.name || ''
    } catch {}
  }

  // Get managers from assureds
  let managers = ''
  try {
    const assureds = await db.getQuotationAssureds(quotationId)
    const mgr = (Array.isArray(assureds) ? assureds : []).find((a: any) => a.role?.toLowerCase().includes('manager'))
    managers = mgr?.name || (Array.isArray(assureds) && assureds.length > 0 ? assureds[0].name : '')
  } catch {}

  try {
    const result = assignRegistryNumber(resolvedPath, {
      isRenewal: q.isRenewal || false,
      typeCode: q.quotationTypeCode || 'P',
      managers,
      vessel: vesselNames.join(' / '),
      imo: vesselIMOs.join(' / '),
      vesselType: vesselTypes[0] || '',
      broker
    })

    // Update quotation with the assigned reference
    await db.updateQuotation(quotationId, { referenceNumber: result.reference } as any)
    // Also update the DB counter to stay in sync
    await db.setSetting('real_quotation_seq', String(result.serial))

    return result.reference
  } catch (err: any) {
    throw new Error(`Failed to write to quotation registry: ${err.message}. Check the file is not open in Excel.`)
  }
}

// Force hardware acceleration even over Remote Desktop (RDP)
// RDP disables GPU by default, causing fuzzy SVG/text rendering
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('force-device-scale-factor', '1')

// Global error handlers - prevent silent crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
})

const store = new Store()

// Security: Track dialog-selected config files to prevent path injection
const allowedConfigPaths = new Set<string>()

// Security: Track session IDs by window
const windowSessions = new Map<number, string>()

// Security: Prevent concurrent setup operations
let setupInProgress = false

// Security: Helper to check if request is from an admin
function isAdminRequest(event: Electron.IpcMainInvokeEvent): boolean {
  const webContents = event.sender
  const windowId = BrowserWindow.fromWebContents(webContents)?.id
  if (!windowId) return false

  const sessionId = windowSessions.get(windowId)
  return auth.isAdmin(sessionId)
}

// Security: Allow setup operations during initial setup or for admins
function isSetupAllowed(event: Electron.IpcMainInvokeEvent): boolean {
  // Allow during initial setup (no database connection)
  if (!db.isConnected()) return true

  // Otherwise, require admin authentication
  return isAdminRequest(event)
}

// Security: Require a valid session, returns the user or throws
function requireSession(event: Electron.IpcMainInvokeEvent): Omit<import('../shared/types').User, 'passwordHash'> {
  const webContents = event.sender
  const windowId = BrowserWindow.fromWebContents(webContents)?.id
  if (!windowId) throw new Error('Authentication required')

  const sessionId = windowSessions.get(windowId)
  const user = auth.getCurrentUser(sessionId)
  if (!user) throw new Error('Authentication required')
  return user
}

// Security: Require admin role, returns the user or throws (kept for backward compat)
// @ts-ignore kept for backward compatibility
function requireAdmin(event: Electron.IpcMainInvokeEvent): Omit<import('../shared/types').User, 'passwordHash'> {
  const user = requireSession(event)
  if (user.role !== 'admin') throw new Error('Admin privileges required')
  return user
}

// Permission cache: userId → Set<permissionKey>
const permissionCache = new Map<string, Set<string>>()

async function loadUserPermissions(userId: string): Promise<Set<string>> {
  const perms = await db.resolveUserPermissions(userId)
  const set = new Set(perms)
  permissionCache.set(userId, set)
  return set
}

async function requirePermission(event: Electron.IpcMainInvokeEvent, ...keys: string[]): Promise<Omit<import('../shared/types').User, 'passwordHash'>> {
  const user = requireSession(event)
  // Admin role always passes (backward compat during migration)
  if (user.role === 'admin') return user
  let perms = permissionCache.get(user.id)
  if (!perms) perms = await loadUserPermissions(user.id)
  for (const key of keys) {
    if (perms.has(key)) return user
  }
  throw new Error(`Permission required: ${keys.join(' or ')}`)
}

function invalidatePermissionCache(userId?: string) {
  if (userId) permissionCache.delete(userId)
  else permissionCache.clear()
}

// Safe IPC handler wrapper - catches errors and returns them as values
function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any> | any
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error: any) {
      console.error(`IPC handler error[${channel}]: `, error?.message || error)
      return { error: true, message: error?.message || 'An unexpected error occurred' }
    }
  })
}

// Security: Validate database configuration structure
interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
  sanctionsApiKey?: string
}

function isValidDbConfig(obj: any): obj is DbConfig {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.host === 'string' && obj.host.length > 0 &&
    typeof obj.port === 'number' && obj.port > 0 && obj.port < 65536 &&
    typeof obj.user === 'string' && obj.user.length > 0 &&
    typeof obj.password === 'string' &&
    typeof obj.database === 'string' && obj.database.length > 0
  )
}

const getConfigPath = () => {
  // 1. Portable Mode: Check next to executable or in project root (dev)
  const portablePath = is.dev
    ? join(process.cwd(), 'db-config.json')
    : join(dirname(process.execPath), 'db-config.json')

  if (existsSync(portablePath)) {
    console.log('Using portable config at:', portablePath)
    return portablePath
  }

  // 2. Local Memory: Check electron-store
  const configDir = store.get('dbConfigDir') as string
  return configDir ? join(configDir, 'db-config.json') : null
}

const getSanctionsApiKey = (): string | null => {
  const configPath = getConfigPath()
  if (!configPath || !existsSync(configPath)) return null

  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'))
    return config.sanctionsApiKey || null
  } catch {
    return null
  }
}

function createWindow(): void {
  const windowState = store.get('windowState', {
    width: 1200,
    height: 850,
    x: undefined,
    y: undefined
  }) as { width: number, height: number, x?: number, y?: number }

  // Validate stored position against connected displays to avoid off-screen window
  let validX: number | undefined
  let validY: number | undefined
  if (windowState.x !== undefined && windowState.y !== undefined) {
    const displays = screen.getAllDisplays()
    const isOnScreen = displays.some(d => {
      const { x, y, width, height } = d.bounds
      return windowState.x! >= x && windowState.y! >= y &&
        windowState.x! < x + width && windowState.y! < y + height
    })
    if (isOnScreen) {
      validX = windowState.x
      validY = windowState.y
    }
  }

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: validX,
    y: validY,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Save window state on change (debounced to avoid excessive writes)
  let saveStateTimeout: ReturnType<typeof setTimeout> | null = null

  const saveState = () => {
    if (saveStateTimeout) clearTimeout(saveStateTimeout)
    saveStateTimeout = setTimeout(async () => {
      try {
        const bounds = mainWindow.getBounds()
        store.set('windowState', bounds)

        const windowId = mainWindow.id
        const sessionId = windowSessions.get(windowId)
        const user = auth.getCurrentUser(sessionId)
        if (user) {
          await db.updateUserWindowPreferences(user.id, bounds.width, bounds.height, bounds.x, bounds.y)
        }
      } catch (error) {
        console.error('Failed to save window state:', error)
      }
    }, 500)
  }

  mainWindow.on('resize', saveState)
  mainWindow.on('move', saveState)

  mainWindow.on('ready-to-show', async () => {
    // If stored position was off-screen, center the window
    if (validX === undefined) {
      mainWindow.center()
    }
    try {
      // Check DB Connection
      const configPath = getConfigPath()
      if (configPath) {
        db.setConfigPath(configPath)
      }
      const connected = await db.connect()

      if (!connected) {
        mainWindow.webContents.send('app:db-status', { connected: false })
      } else {
        // Schema init is non-fatal: if it fails the app still opens as connected
        try {
          await db.initSchema()
          await auth.createInitialAdmin()
        } catch (schemaError) {
          console.error('Schema init error (non-fatal):', schemaError)
        }
        // Load file path resolution settings
        initFilePathSettings()
        await loadFilePathSettings()

        // Hot-update: check + auto-apply on startup, then periodic checks
        try {
          const startupResult = await hotUpdateService.checkAndStage()
          if (startupResult.updated) {
            // Update downloaded — restart to load it
            app.relaunch()
            app.exit(0)
            return
          }
          // Start periodic checks for updates deployed while the app is running
          hotUpdateService.startPeriodicCheck((version) => {
            mainWindow.webContents.send('hotUpdate:available', version)
          })
        } catch {
          // Hot-update is non-fatal
        }

        // Cleanup old activity log entries based on retention setting
        try {
          const retentionDays = await db.getActivityLogRetention()
          if (retentionDays > 0) {
            const deleted = await db.cleanupActivityLog(retentionDays)
            if (deleted > 0) console.log(`Activity log cleanup: removed ${deleted} entries older than ${retentionDays} days`)
          }
        } catch (cleanupErr) {
          console.error('Activity log cleanup error (non-fatal):', cleanupErr)
        }
        // Validate restored sessions against live DB (clears sessions for deleted users)
        await auth.validateRestoredSessions().catch(() => {})
        // Update last_login for auto-restored sessions (no password re-entry on startup)
        const restoredSession = auth.getFirstSession()
        if (restoredSession) {
          db.updateUserLastLogin(restoredSession.user.id).catch(() => {})
        }
        mainWindow.webContents.send('app:db-status', { connected: true })
      }
    } catch (error) {
      console.error('Startup error:', error)
      mainWindow.webContents.send('app:db-status', { connected: false })
    } finally {
      mainWindow.show()
    }
  })

  // Right-click context menu (Cut/Copy/Paste/Select All)
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Cut', role: 'cut', enabled: params.editFlags.canCut },
      { label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste },
      { type: 'separator' },
      { label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll },
    ])
    menu.popup()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    try {
      const parsed = new URL(details.url)
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        shell.openExternal(details.url)
      } else {
        console.warn('Blocked openExternal with non-http(s) scheme:', parsed.protocol)
      }
    } catch {
      console.warn('Blocked openExternal with invalid URL:', details.url)
    }
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}



// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Update Handlers
  safeHandle('update:checkForUpdates', async () => {
    await updateService.checkForUpdates(true)
  })

  safeHandle('update:quitAndInstall', () => {
    updateService.quitAndInstall()
  })

  safeHandle('update:getCurrentVersion', () => {
    return updateService.getCurrentVersion()
  })

  safeHandle('update:getChangelogs', async () => {
    return await updateService.getChangelogs()
  })

  // Auth Handlers (no session required - these create/destroy sessions)
  safeHandle('auth:login', async (event, { username, password }) => {
    const result = await auth.login(username, password)
    if (result.success && result.sessionId) {
      const webContents = event.sender
      const window = BrowserWindow.fromWebContents(webContents)
      const windowId = window?.id
      if (windowId) {
        windowSessions.set(windowId, result.sessionId)
      }

      const user = result.user
      if (user && window && user.windowWidth && user.windowHeight) {
        const bounds: { width: number; height: number; x?: number; y?: number } = {
          width: user.windowWidth,
          height: user.windowHeight
        }
        // Only restore position if it falls within a currently connected display.
        // If the saved position is off-screen (e.g. secondary monitor disconnected),
        // resize to the saved dimensions and center on the primary display.
        let positionValid = false
        if (user.windowX !== null && user.windowX !== undefined &&
            user.windowY !== null && user.windowY !== undefined) {
          const displays = screen.getAllDisplays()
          positionValid = displays.some(d => {
            const { x, y, width, height } = d.bounds
            return (
              user.windowX! >= x &&
              user.windowY! >= y &&
              user.windowX! < x + width &&
              user.windowY! < y + height
            )
          })
          if (positionValid) {
            bounds.x = user.windowX
            bounds.y = user.windowY
          }
        }
        window.setBounds(bounds)
        if (!positionValid) {
          window.center()
        }
      }
    }
    if (result.success && result.user) {
      db.logActivity({
        userId: result.user.id,
        username: result.user.username,
        action: 'LOGIN',
        module: 'Auth',
        details: 'User logged in'
      }).catch(() => {})
    }
    return result
  })

  safeHandle('auth:getSession', async (event) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return null

    // Check if we have a session for this window
    let sessionId = windowSessions.get(windowId)

    // If not, try to restore from persistent storage
    if (!sessionId) {
      const restoredSession = auth.getFirstSession()
      if (restoredSession) {
        console.log(`[IPC] Restoring session ${restoredSession.sessionId} for window ${windowId}`)
        windowSessions.set(windowId, restoredSession.sessionId)
        sessionId = restoredSession.sessionId
      } else {
        console.log(`[IPC] No session found to restore for window ${windowId}`)
      }
    }

    return auth.getCurrentUser(sessionId)
  })

  safeHandle('auth:changePassword', async (event, { currentPassword, newPassword }) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return { success: false, message: 'No active session' }

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)

    if (!user) {
      return { success: false, message: 'Not authenticated' }
    }

    return await auth.changePassword(user.id, currentPassword, newPassword)
  })

  safeHandle('auth:resetPassword', async (event, { username }) => {
    await requirePermission(event, 'admin:users')
    return await auth.resetPassword(username)
  })

  safeHandle('auth:logout', async (event) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (windowId) {
      const sessionId = windowSessions.get(windowId)
      if (sessionId) {
        auth.logout(sessionId)
        windowSessions.delete(windowId)
      }
    }
  })

  // Force Password Reset Handlers
  safeHandle('auth:isPasswordResetRequired', async (event) => {
    const user = requireSession(event)
    return db.isPasswordResetRequired(user.id)
  })

  safeHandle('auth:forceResetPassword', async (event, newPassword) => {
    const user = requireSession(event)
    if (!newPassword || newPassword.length < 6) throw new Error('Password must be at least 6 characters')
    const hash = await bcrypt.hash(newPassword, 10)
    await db.updateUserPassword(user.id, hash)
    return { success: true }
  })

  safeHandle('admin:forcePasswordResetAll', async (event) => {
    await requirePermission(event, 'admin:users')
    await db.forcePasswordResetAll()
    return { success: true }
  })
  safeHandle('admin:forcePasswordResetUsers', async (event, userIds: string[]) => {
    await requirePermission(event, 'admin:users')
    await db.forcePasswordResetUsers(userIds)
    return { success: true }
  })

  // Theme Handlers (user-specific, session required)
  safeHandle('theme:get', async (event) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return 'dark'

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    return user?.themePreference || 'dark'
  })

  safeHandle('theme:set', async (event, theme: 'light' | 'dark') => {
    const user = requireSession(event)
    await db.updateUserTheme(user.id, theme)
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (windowId) {
      const sessionId = windowSessions.get(windowId)
      const session = auth.getSessionData(sessionId)
      if (session) {
        session.user.themePreference = theme
      }
    }
  })

  // Window Preferences Handlers (user-specific, session required)
  safeHandle('window:getPreferences', async (event) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return null

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    if (user && user.windowWidth && user.windowHeight) {
      return {
        width: user.windowWidth,
        height: user.windowHeight,
        x: user.windowX,
        y: user.windowY
      }
    }
    return null
  })

  safeHandle('window:savePreferences', async (event) => {
    const user = requireSession(event)
    const webContents = event.sender
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) return

    const bounds = window.getBounds()
    await db.updateUserWindowPreferences(user.id, bounds.width, bounds.height, bounds.x, bounds.y)
  })

  // File Type Settings Handlers
  safeHandle('fileTypes:getSettings', async (event) => {
    await requirePermission(event, 'admin:settings')
    return await db.getFileTypeSettings()
  })

  safeHandle('fileTypes:setSettings', async (event, settings: { allowedExtensions: string[]; blockedExtensions: string[] }) => {
    await requirePermission(event, 'admin:settings')
    const normalizeExtensions = (exts: string[]) => {
      return exts.map(ext => {
        ext = ext.toLowerCase().trim()
        return ext.startsWith('.') ? ext : `.${ext} `
      })
    }

    const normalized = {
      allowedExtensions: normalizeExtensions(settings.allowedExtensions),
      blockedExtensions: normalizeExtensions(settings.blockedExtensions)
    }

    await db.setFileTypeSettings(normalized)
    return normalized
  })

  safeHandle('fileTypes:validateFile', async (event, filePath: string) => {
    requireSession(event)
    // Block remote users from uploading files outside the shared folder
    if (isRemoteUser && filePathLocal && filePathNetwork && !isSharedPath(filePath)) {
      return { valid: false, reason: `Files must be located in the shared folder (${filePathNetwork})` }
    }
    const result = await db.validateFileExtension(filePath)
    // Return canonical path alongside validation so drag-drop uploads use DB-canonical paths
    if (result.valid) (result as any).canonicalPath = canonicalizeFilePath(filePath)
    return result
  })

  ipcMain.handle('setup:selectDirectory', async (event) => {
    // Security: Allow during initial setup or for admins only
    if (!isSetupAllowed(event)) {
      console.error('Unauthorized attempt to select database directory')
      return null
    }

    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('setup:saveConfig', async (event, { config, directory }) => {
    // Security: Allow during initial setup or for admins only
    if (!isSetupAllowed(event)) {
      console.error('Unauthorized attempt to save database configuration')
      return { success: false, message: 'Unauthorized: Admin access required' }
    }

    // Security: Prevent concurrent setup operations
    if (setupInProgress) {
      return { success: false, message: 'Setup operation already in progress' }
    }

    setupInProgress = true

    try {
      // Security: Validate config structure
      if (!isValidDbConfig(config)) {
        return { success: false, message: 'Invalid configuration format' }
      }

      // Security: Validate directory path
      if (typeof directory !== 'string' || !directory) {
        return { success: false, message: 'Invalid directory path' }
      }

      // Security: Test connection BEFORE saving to disk
      const testPool = createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 1,
        connectTimeout: 10000
      })

      try {
        // Test the connection
        const connection = await testPool.getConnection()
        connection.release()
        await testPool.end()
      } catch (error) {
        await testPool.end().catch(() => { })
        console.error('Database connection test failed:', error)
        return { success: false, message: 'Could not connect to database with provided settings' }
      }

      // Connection successful - NOW save to disk and update state
      const configPath = join(directory, 'db-config.json')

      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true })
      }

      writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })

      store.set('dbConfigDir', directory)
      db.setConfigPath(configPath)

      // Connect with main adapter
      const connected = await db.connect()
      if (connected) {
        await db.initSchema()
        await auth.createInitialAdmin()
        initFilePathSettings()
        await loadFilePathSettings()
        return { success: true }
      } else {
        // Rollback: delete created file and state
        try {
          const { unlinkSync } = require('fs')
          unlinkSync(configPath)
        } catch { }
        store.delete('dbConfigDir')
        return { success: false, message: 'Database connection failed' }
      }
    } catch (error: any) {
      // Security: Sanitize error messages
      console.error('Config save error:', error)
      return { success: false, message: 'Failed to save configuration' }
    } finally {
      setupInProgress = false
    }
  })

  ipcMain.handle('setup:checkConnection', async () => {
    return await db.connect()
  })

  ipcMain.handle('setup:getConfigPath', () => {
    return getConfigPath()
  })

  ipcMain.handle('setup:loadConfigFromDir', async (event, directory: string) => {
    // Security: Only admins can change database configuration
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to load database configuration from directory')
      return { success: false, message: 'Unauthorized: Admin access required' }
    }

    // Security: Prevent concurrent setup operations
    if (setupInProgress) {
      return { success: false, message: 'Setup operation already in progress' }
    }

    setupInProgress = true

    try {
      // Security: Validate directory input
      if (typeof directory !== 'string' || !directory) {
        return { success: false, message: 'Invalid directory path' }
      }

      const configPath = join(directory, 'db-config.json')

      if (!existsSync(configPath)) {
        return { success: false, message: 'No db-config.json found in this directory' }
      }

      // Security: Check file size
      try {
        const stats = statSync(configPath)
        if (stats.size > 1024 * 1024) {
          return { success: false, message: 'Configuration file is too large' }
        }
        if (stats.size === 0) {
          return { success: false, message: 'Configuration file is empty' }
        }
      } catch (error) {
        console.error('Error reading file stats:', error)
        return { success: false, message: 'Cannot read configuration file' }
      }

      // Parse and validate configuration
      let config: DbConfig
      try {
        const content = readFileSync(configPath, 'utf-8')
        const parsed = JSON.parse(content)

        // Security: Validate configuration schema
        if (!isValidDbConfig(parsed)) {
          return { success: false, message: 'Invalid configuration file format' }
        }

        config = parsed
      } catch (error) {
        console.error('JSON parse error:', error)
        return { success: false, message: 'Invalid JSON configuration file' }
      }

      // Security: Test connection BEFORE saving state
      const testPool = createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 1,
        connectTimeout: 10000
      })

      try {
        const connection = await testPool.getConnection()
        connection.release()
        await testPool.end()
      } catch (error) {
        await testPool.end().catch(() => { })
        console.error('Database connection test failed:', error)
        return { success: false, message: 'Could not connect to database with provided settings' }
      }

      // Connection successful - NOW update state
      store.set('dbConfigDir', directory)
      db.setConfigPath(configPath)

      const connected = await db.connect()
      if (connected) {
        await db.initSchema()
        await auth.createInitialAdmin()

        // Notify windows of connection status
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('app:db-status', { connected: true })
        })

        return { success: true }
      } else {
        // Rollback state changes
        store.delete('dbConfigDir')
        return { success: false, message: 'Database connection failed' }
      }
    } catch (error: any) {
      // Security: Sanitize error messages
      console.error('Config load error:', error)
      return { success: false, message: 'Failed to load configuration' }
    } finally {
      setupInProgress = false
    }
  })

  ipcMain.handle('setup:selectConfigFile', async (event) => {
    // Security: Allow during initial setup or for admins only
    if (!isSetupAllowed(event)) {
      console.error('Unauthorized attempt to select database config file')
      return null
    }

    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'JSON Config Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })

    if (!result.canceled && result.filePaths[0]) {
      const selectedPath = result.filePaths[0]
      // Security: Track this path as allowed for subsequent loading
      allowedConfigPaths.add(selectedPath)
      // Auto-expire after 5 minutes to prevent stale paths
      setTimeout(() => allowedConfigPaths.delete(selectedPath), 5 * 60 * 1000)
      return selectedPath
    }

    return null
  })

  ipcMain.handle('setup:loadConfigFromFile', async (event, filePath: string) => {
    // Security: Allow during initial setup or for admins only
    if (!isSetupAllowed(event)) {
      console.error('Unauthorized attempt to load database configuration from file')
      return { success: false, message: 'Unauthorized: Admin access required' }
    }

    // Security: Prevent concurrent setup operations
    if (setupInProgress) {
      return { success: false, message: 'Setup operation already in progress' }
    }

    setupInProgress = true

    try {
      // Security: Validate input is a string
      if (typeof filePath !== 'string' || !filePath) {
        return { success: false, message: 'Invalid file path' }
      }

      // Security: Validate path was selected via dialog
      if (!allowedConfigPaths.has(filePath)) {
        console.error('Attempted to load config from unauthorized path:', filePath)
        return { success: false, message: 'Unauthorized file path' }
      }

      // Security: Remove from allowed set (one-time use)
      allowedConfigPaths.delete(filePath)

      // Security: Validate path doesn't contain traversal
      const normalizedPath = normalize(filePath)
      const resolvedPath = resolve(filePath)
      if (normalizedPath !== filePath && resolvedPath !== filePath) {
        console.error('Path traversal attempt detected:', filePath)
        return { success: false, message: 'Invalid file path' }
      }

      // Security: Validate file extension
      const ext = extname(filePath).toLowerCase()
      if (ext !== '.json') {
        return { success: false, message: 'Configuration file must be a .json file' }
      }

      // Check file exists
      if (!existsSync(filePath)) {
        return { success: false, message: 'Configuration file not found' }
      }

      // Security: Check file size (limit to 1MB)
      try {
        const stats = statSync(filePath)
        if (stats.size > 1024 * 1024) {
          return { success: false, message: 'Configuration file is too large' }
        }
        if (stats.size === 0) {
          return { success: false, message: 'Configuration file is empty' }
        }
      } catch (error) {
        console.error('Error reading file stats:', error)
        return { success: false, message: 'Cannot read configuration file' }
      }

      // Parse and validate JSON structure
      let config: DbConfig
      try {
        const content = readFileSync(filePath, 'utf-8')
        const parsed = JSON.parse(content)

        // Security: Validate configuration schema
        if (!isValidDbConfig(parsed)) {
          return { success: false, message: 'Invalid configuration file format' }
        }

        config = parsed
      } catch (error) {
        console.error('JSON parse error:', error)
        return { success: false, message: 'Invalid JSON configuration file' }
      }

      // Security: Test connection BEFORE saving state
      // This prevents corrupting the stored config on failed connections
      const testPool = createPool({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: true,
        connectionLimit: 1,
        connectTimeout: 10000
      })

      try {
        // Test the connection
        const connection = await testPool.getConnection()
        connection.release()
        await testPool.end()
      } catch (error) {
        await testPool.end().catch(() => { })
        console.error('Database connection test failed:', error)
        return { success: false, message: 'Could not connect to database with provided settings' }
      }

      // Connection successful - NOW update persistent state
      const directory = dirname(filePath)
      store.set('dbConfigDir', directory)
      db.setConfigPath(filePath)

      // Connect with main adapter
      const connected = await db.connect()
      if (connected) {
        await db.initSchema()
        await auth.createInitialAdmin()

        // Notify windows of connection status
        BrowserWindow.getAllWindows().forEach(win => {
          win.webContents.send('app:db-status', { connected: true })
        })

        return { success: true }
      } else {
        // Rollback state changes
        store.delete('dbConfigDir')
        return { success: false, message: 'Database connection failed' }
      }
    } catch (error: any) {
      // Security: Sanitize error messages - don't expose internal details
      console.error('Config load error:', error)
      return { success: false, message: 'Failed to load configuration' }
    } finally {
      setupInProgress = false
    }
  })

  // Database IPC Handlers - Read operations require session, deletes require admin
  safeHandle('db:getDocumentTypes', (event) => { requireSession(event); return db.getDocumentTypes() })
  safeHandle('db:addDocumentType', async (event, docType) => { await requirePermission(event, 'admin:settings'); return db.addDocumentType(docType) })
  safeHandle('db:updateDocumentType', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateDocumentType(id, updates) })
  safeHandle('db:deleteDocumentType', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteDocumentType(id) })

  safeHandle('db:getVesselCustomDocTypes', (event, vesselId: string) => { requireSession(event); return db.getVesselCustomDocTypes(vesselId) })
  safeHandle('db:addVesselCustomDocType', async (event, docType) => { await requirePermission(event, 'documents:upload'); return db.addVesselCustomDocType(docType) })
  safeHandle('db:deleteVesselCustomDocType', async (event, id: string) => { await requirePermission(event, 'documents:delete'); return db.deleteVesselCustomDocType(id) })

  safeHandle('db:getFleets', (event) => { requireSession(event); return db.getFleets() })
  safeHandle('db:addFleet', async (event, fleet) => {
    const user = await requirePermission(event, 'fleets:manage')
    const result = await db.addFleet(fleet)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Fleets',
      entityType: 'fleet',
      entityName: fleet.name,
      details: `Created fleet ${fleet.name}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:deleteFleet', async (event, id) => {
    const user = await requirePermission(event, 'fleets:manage')
    const [fleetRows] = await (db as any).pool.query('SELECT name FROM fleets WHERE id = ?', [id])
    const fleetName = (fleetRows as any[])[0]?.name || id
    const result = await db.deleteFleet(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Fleets',
      entityType: 'fleet',
      entityId: id,
      entityName: fleetName,
      details: `Deleted fleet ${fleetName}`
    }).catch(() => {})
    return result
  })

  safeHandle('db:getVessels', (event) => { requireSession(event); return db.getVessels() })
  safeHandle('db:getVesselsPaginated', (event, params) => { requireSession(event); return db.getVesselsPaginated(params) })
  safeHandle('db:addVessel', async (event, vessel) => {
    const user = await requirePermission(event, 'vessels:create')
    try {
      const result = await db.addVessel(vessel)
      db.logActivity({
        userId: user.id,
        username: user.username,
        action: 'CREATE',
        module: 'Vessels',
        entityType: 'vessel',
        entityId: result?.id || vessel.id,
        entityName: vessel.name,
        details: `Created vessel ${vessel.name}`
      }).catch(() => {})
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })
  safeHandle('db:updateVessel', async (event, id, updates) => {
    const user = await requirePermission(event, 'vessels:edit')
    const [vRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [id])
    const vessel = (vRows as any[])[0]
    const vesselName = updates.name || vessel?.name || id
    const result = await db.updateVessel(id, updates, user.username)
    const changedFields = Object.keys(updates).filter(k => updates[k] !== undefined)
    const changeSummary = changedFields.map(k => {
      if (k === 'isActive' || k === 'is_active') return updates[k] ? 'Activated' : 'Deactivated'
      if (k === 'name') return `Name → ${updates[k]}`
      if (k === 'flagStateId') return 'Flag state changed'
      if (k === 'customerId') return updates[k] ? 'Customer assigned' : 'Customer removed'
      return `${k} changed`
    }).join(', ')
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'UPDATE',
      module: 'Vessels',
      entityType: 'vessel',
      entityId: id,
      entityName: vesselName,
      details: changeSummary || `Updated ${vesselName}`
    }).catch(() => {})
    // Notify on vessel active status change
    if (updates.isActive !== undefined || updates.is_active !== undefined) {
      const isNowActive = updates.isActive ?? updates.is_active
      const action = isNowActive ? 'activated' : 'deactivated'
      db.notifyGroupsForEvent('vessel_status_change', `Vessel ${vesselName} ${action}`, undefined, 'vessel', id, user.id).catch(() => {})
    }
    return result
  })
  safeHandle('db:getVesselNameHistory', (event, vesselId) => { requireSession(event); return db.getVesselNameHistory(vesselId) })
  safeHandle('db:deleteVessel', async (event, id) => {
    const user = await requirePermission(event, 'vessels:delete')
    const [vRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [id])
    const vessel = (vRows as any[])[0]
    const vesselName = vessel?.name || id
    await db.deleteVessel(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Vessels',
      entityType: 'vessel',
      entityId: id,
      entityName: vesselName,
      details: `Deleted vessel ${vesselName}`
    }).catch(() => {})
    return { success: true }
  })

  safeHandle('db:getVesselDocuments', (event, vesselId) => { requireSession(event); return db.getVesselDocuments(vesselId) })
  safeHandle('db:upsertVesselDocument', async (event, doc) => {
    const user = await requirePermission(event, 'documents:upload')
    await db.upsertVesselDocument(doc)
    if (doc.filePath) {
      await db.autoSnoozeVessel(doc.vesselId)
    }
    const [vDocRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [doc.vesselId])
    const vDocName = (vDocRows as any[])[0]?.name || doc.vesselId
    const [dtRows] = await (db as any).pool.query(
      'SELECT name FROM document_types WHERE id = ? UNION SELECT name FROM vessel_custom_doc_types WHERE id = ?',
      [doc.docTypeId, doc.docTypeId]
    )
    const docTypeName = (dtRows as any[])[0]?.name || 'document'
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'UPLOAD',
      module: 'Documents',
      entityType: 'vessel_document',
      entityId: doc.vesselId,
      entityName: vDocName,
      details: `Uploaded ${docTypeName} for vessel ${vDocName}`
    }).catch(() => {})
  })
  safeHandle('db:updateVesselDocumentExpiry', async (event, vesselId, docTypeId, expiryDate) => {
    const user = await requirePermission(event, 'documents:upload')
    const result = await db.updateVesselDocumentExpiry(vesselId, docTypeId, expiryDate)
    try {
      const [vRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [vesselId])
      const vesselName = (vRows as any[])[0]?.name || vesselId
      const [dtRows] = await (db as any).pool.query('SELECT name FROM document_types WHERE id = ? UNION SELECT name FROM vessel_custom_doc_types WHERE id = ?', [docTypeId, docTypeId])
      const docTypeName = (dtRows as any[])[0]?.name || 'document'
      db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Documents', entityType: 'vessel_document', entityId: vesselId, entityName: vesselName, details: `${docTypeName} expiry ${expiryDate ? 'set to ' + expiryDate : 'cleared'} for ${vesselName}` }).catch(() => {})
    } catch { /* do not block */ }
    return result
  })
  safeHandle('db:updateVesselDocumentReceivedDate', async (event, vesselId, docTypeId, receivedDate) => { await requirePermission(event, 'documents:upload'); return db.updateVesselDocumentReceivedDate(vesselId, docTypeId, receivedDate) })
  safeHandle('db:duplicateVesselDocument', async (event, docId, uploadedBy) => { await requirePermission(event, 'documents:upload'); return db.duplicateVesselDocument(docId, uploadedBy) })
  safeHandle('db:deleteVesselDocumentById', async (event, docId) => { await requirePermission(event, 'documents:delete'); return db.deleteVesselDocumentById(docId) })

  // Entity IPC Handlers
  safeHandle('db:getEntities', (event) => { requireSession(event); return db.getEntities() })
  safeHandle('db:getEntitiesPaginated', (event, params) => { requireSession(event); return db.getEntitiesPaginated(params) })
  safeHandle('db:addEntity', async (event, entity) => {
    const user = await requirePermission(event, 'entities:create')
    const result = await db.addEntity(entity)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Entities',
      entityType: 'entity',
      entityId: result?.id || entity.id,
      entityName: entity.name,
      details: `Created entity ${entity.name}`
    }).catch(() => {})
    db.notifyGroupsForEvent('entity_change', `New entity: ${entity.name}`, 'Entity created', 'entity', result?.id || entity.id, user.id).catch(() => {})
    return result
  })
  safeHandle('db:updateEntity', async (event, id, updates) => {
    const user = await requirePermission(event, 'entities:edit')
    const [eRows] = await (db as any).pool.query('SELECT name, email, phone, type FROM entities WHERE id = ?', [id])
    const old = (eRows as any[])[0] || {}
    const entityName = updates.name || old.name || id
    const docFields = ['passportFilePath', 'certificateOfIncorporationPath', 'articlesOfAssociationPath', 'kycFilePath']
    const hasDocChange = docFields.some(f => updates[f] !== undefined)
    await db.updateEntity(id, updates)
    if (hasDocChange) {
      await db.autoSnoozeVesselsForEntity(id)
    }
    const changes: string[] = []
    if (updates.name && updates.name !== old.name) changes.push(`name: ${old.name} → ${updates.name}`)
    if (updates.email !== undefined && updates.email !== old.email) changes.push('email changed')
    if (updates.phone !== undefined && updates.phone !== old.phone) changes.push('phone changed')
    if (updates.type && updates.type !== old.type) changes.push(`type: ${old.type} → ${updates.type}`)
    const nonDocFields = Object.keys(updates).filter(k => updates[k] !== undefined && !docFields.includes(k) && !['name', 'email', 'phone', 'type'].includes(k))
    if (nonDocFields.length > 0) changes.push(...nonDocFields.map(k => `${k} changed`))
    const summary = changes.length > 0 ? changes.join(', ') : hasDocChange ? 'Documents updated' : `Updated ${entityName}`
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'UPDATE',
      module: 'Entities',
      entityType: 'entity',
      entityId: id,
      entityName: entityName,
      details: summary
    }).catch(() => {})
  })
  safeHandle('db:deleteEntity', async (event, id) => {
    const user = await requirePermission(event, 'entities:delete')
    const [eDelRows] = await (db as any).pool.query('SELECT name FROM entities WHERE id = ?', [id])
    const entityName = (eDelRows as any[])[0]?.name || id
    db.notifyGroupsForEvent('entity_change', `Entity deleted: ${entityName}`, undefined, 'entity', id, user.id).catch(() => {})
    const result = await db.deleteEntity(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Entities',
      entityType: 'entity',
      entityId: id,
      entityName: entityName,
      details: `Deleted entity ${entityName}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:mergeEntities', async (event, sourceId, targetId, keepName) => { await requirePermission(event, 'entities:edit'); return db.mergeEntities(sourceId, targetId, keepName) })
  safeHandle('maintenance:syncSettings', async (event) => { await requirePermission(event, 'admin:settings'); return db.syncAssuredRoles() })

  // Entity Document Types
  safeHandle('entityDocTypes:getAll', (event) => { requireSession(event); return db.getEntityDocumentTypes() })
  safeHandle('entityDocTypes:add', async (event, dt) => { await requirePermission(event, 'admin:settings'); return db.addEntityDocumentType(dt) })
  safeHandle('entityDocTypes:update', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateEntityDocumentType(id, updates) })
  safeHandle('entityDocTypes:delete', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteEntityDocumentType(id) })

  // Entity Documents
  safeHandle('entityDocs:getByEntity', (event, entityId) => { requireSession(event); return db.getEntityDocuments(entityId) })
  safeHandle('entityDocs:getAll', (event) => { requireSession(event); return db.getEntityDocuments() })
  safeHandle('entityDocs:upsert', async (event, doc) => { await requirePermission(event, 'entities:edit'); return db.upsertEntityDocument(doc) })
  safeHandle('entityDocs:updateExpiry', async (event, entityId, documentTypeId, expiryDate) => { await requirePermission(event, 'entities:edit'); return db.updateEntityDocumentExpiry(entityId, documentTypeId, expiryDate) })
  safeHandle('entityDocs:delete', async (event, entityId, documentTypeId) => { await requirePermission(event, 'entities:edit'); return db.deleteEntityDocument(entityId, documentTypeId) })

  safeHandle('db:getAssuredRoles', (event) => { requireSession(event); return db.getAssuredRoles() })
  safeHandle('db:addAssuredRole', async (event, role) => { await requirePermission(event, 'admin:settings'); return db.addAssuredRole(role) })
  safeHandle('db:updateAssuredRole', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateAssuredRole(id, updates) })
  safeHandle('db:deleteAssuredRole', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteAssuredRole(id) })
  safeHandle('db:reorderAssuredRoles', async (event, orderedIds) => { await requirePermission(event, 'admin:settings'); return db.reorderAssuredRoles(orderedIds) })
  safeHandle('db:getVesselsByRole', (event, roleName) => { requireSession(event); return db.getVesselsByRole(roleName) })

  // Flag States
  safeHandle('db:getFlagStates', (event) => { requireSession(event); return db.getFlagStates() })
  safeHandle('db:addFlagState', async (event, flagState) => { await requirePermission(event, 'admin:settings'); return db.addFlagState(flagState) })
  safeHandle('db:updateFlagState', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateFlagState(id, updates) })
  safeHandle('db:deleteFlagState', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteFlagState(id) })
  safeHandle('db:getVesselsByFlagState', (event, flagStateId) => { requireSession(event); return db.getVesselsByFlagState(flagStateId) })

  // Flag State Ports
  safeHandle('flagState:getPorts', (event, flagStateId) => { requireSession(event); return db.getFlagStatePorts(flagStateId) })
  safeHandle('flagState:addPort', async (event, flagStateId, name, isDefault) => { await requirePermission(event, 'admin:settings'); return db.addFlagStatePort(flagStateId, name, isDefault) })
  safeHandle('flagState:updatePort', async (event, id, name, isDefault) => { await requirePermission(event, 'admin:settings'); return db.updateFlagStatePort(id, name, isDefault) })
  safeHandle('flagState:deletePort', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteFlagStatePort(id) })

  // Policy Types
  safeHandle('db:getPolicyTypes', (event) => { requireSession(event); return db.getPolicyTypes() })
  safeHandle('db:addPolicyType', async (event, name, code) => { await requirePermission(event, 'admin:settings'); return db.addPolicyType(name, code) })
  safeHandle('db:updatePolicyType', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updatePolicyType(id, updates) })
  safeHandle('db:deletePolicyType', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deletePolicyType(id) })
  safeHandle('db:reorderPolicyTypes', async (event, orderedIds) => { await requirePermission(event, 'admin:settings'); return db.reorderPolicyTypes(orderedIds) })

  // Vessel Policies
  safeHandle('db:getVesselPolicies', (event, vesselId) => { requireSession(event); return db.getVesselPolicies(vesselId) })
  safeHandle('db:addVesselPolicy', async (event, vesselId, policyTypeId) => { await requirePermission(event, 'policies:manage'); return db.addVesselPolicy(vesselId, policyTypeId) })
  safeHandle('db:deleteVesselPolicy', async (event, id) => { await requirePermission(event, 'policies:manage'); return db.deleteVesselPolicy(id) })

  // Dynamic Address Book
  safeHandle('db:queryDAB', (event, criteria) => { requireSession(event); return db.queryDAB(criteria) })

  safeHandle('db:getVesselAssureds', (event, vesselId) => { requireSession(event); return db.getVesselAssureds(vesselId) })
  safeHandle('db:addVesselAssured', async (event, assured) => {
    const user = await requirePermission(event, 'assureds:manage')
    const result = await db.addVesselAssured(assured)
    try {
      const [vRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [assured.vesselId])
      const vesselName = (vRows as any[])[0]?.name || assured.vesselId
      const [entRows] = await (db as any).pool.query('SELECT name FROM entities WHERE id = ?', [assured.entityId])
      const entityName = (entRows as any[])[0]?.name || assured.entityId
      db.logActivity({ userId: user.id, username: user.username, action: 'CREATE', module: 'Assureds', entityType: 'vessel_assured', entityId: assured.vesselId, entityName: vesselName, details: `Added ${entityName} as ${assured.role || 'assured'} on ${vesselName}` }).catch(() => {})
    } catch { /* do not block */ }
    return result
  })
  safeHandle('db:deleteVesselAssured', async (event, id) => {
    const user = await requirePermission(event, 'assureds:manage')
    let vesselName = ''
    let entityName = ''
    let role = ''
    try {
      const [rows] = await (db as any).pool.query('SELECT va.vessel_id, va.role, e.name AS entity_name, v.name AS vessel_name FROM vessel_assureds va LEFT JOIN entities e ON e.id = va.entity_id LEFT JOIN vessels v ON v.id = va.vessel_id WHERE va.id = ?', [id])
      const row = (rows as any[])[0]
      vesselName = row?.vessel_name || ''
      entityName = row?.entity_name || ''
      role = row?.role || ''
    } catch { /* do not block */ }
    const result = await db.deleteVesselAssured(id)
    db.logActivity({ userId: user.id, username: user.username, action: 'DELETE', module: 'Assureds', entityType: 'vessel_assured', entityName: vesselName, details: `Removed ${entityName}${role ? ' (' + role + ')' : ''} from ${vesselName}` }).catch(() => {})
    return result
  })
  safeHandle('db:updateVesselAssuredRole', async (event, id, role) => { await requirePermission(event, 'assureds:manage'); return db.updateVesselAssuredRole(id, role) })

  safeHandle('db:getEntityUBOs', (event, assuredEntityId) => { requireSession(event); return db.getEntityUBOs(assuredEntityId) })
  safeHandle('db:addEntityUBO', async (event, ubo) => { await requirePermission(event, 'entities:edit'); return db.addEntityUBO(ubo) })
  safeHandle('db:deleteEntityUBO', async (event, ubo) => { await requirePermission(event, 'entities:edit'); return db.deleteEntityUBO(ubo) })

  // Entity Addresses
  safeHandle('entityAddress:getByEntity', (event, entityId) => { requireSession(event); return db.getEntityAddresses(entityId) })
  safeHandle('entityAddress:getAll', (event) => { requireSession(event); return db.getEntityAddresses() })
  safeHandle('entityAddress:add', async (event, addr) => { await requirePermission(event, 'entities:addresses'); return db.addEntityAddress(addr) })
  safeHandle('entityAddress:update', async (event, id, updates) => { await requirePermission(event, 'entities:addresses'); return db.updateEntityAddress(id, updates) })
  safeHandle('entityAddress:delete', async (event, id) => { await requirePermission(event, 'entities:addresses'); return db.deleteEntityAddress(id) })
  safeHandle('vesselAssured:updateAddress', async (event, id, addressId) => { await requirePermission(event, 'assureds:manage'); return db.updateVesselAssuredAddress(id, addressId) })

  // RBAC: User Groups & Permissions
  safeHandle('rbac:getGroups', (event) => { requireSession(event); return db.getUserGroups() })
  safeHandle('rbac:addGroup', async (event, name, description) => {
    const user = await requirePermission(event, 'admin:groups')
    const result = await db.addUserGroup(name, description)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE_GROUP',
      module: 'RBAC',
      entityType: 'user_group',
      entityName: name,
      details: `Created permission group ${name}`
    }).catch(() => {})
    return result
  })
  safeHandle('rbac:updateGroup', async (event, id, name, description) => { await requirePermission(event, 'admin:groups'); return db.updateUserGroup(id, name, description) })
  safeHandle('rbac:deleteGroup', async (event, id) => {
    const user = await requirePermission(event, 'admin:groups')
    const [grpRows] = await (db as any).pool.query('SELECT name FROM user_groups WHERE id = ?', [id])
    const groupName = (grpRows as any[])[0]?.name || id
    const result = await db.deleteUserGroup(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE_GROUP',
      module: 'RBAC',
      entityType: 'user_group',
      entityId: id,
      entityName: groupName,
      details: `Deleted permission group ${groupName}`
    }).catch(() => {})
    return result
  })
  safeHandle('rbac:getGroupPermissions', (event, groupId) => { requireSession(event); return db.getGroupPermissions(groupId) })
  safeHandle('rbac:setGroupPermissions', async (event, groupId, keys) => { await requirePermission(event, 'admin:groups'); invalidatePermissionCache(); return db.setGroupPermissions(groupId, keys) })
  safeHandle('rbac:getUserGroupIds', (event, userId) => { requireSession(event); return db.getUserGroupIds(userId) })
  safeHandle('rbac:setUserGroups', async (event, userId, groupIds) => { await requirePermission(event, 'admin:users', 'admin:groups'); invalidatePermissionCache(userId); return db.setUserGroups(userId, groupIds) })
  safeHandle('rbac:getUserPermissionOverrides', (event, userId) => { requireSession(event); return db.getUserPermissionOverrides(userId) })
  safeHandle('rbac:setUserPermissionOverrides', async (event, userId, overrides) => { await requirePermission(event, 'admin:users', 'admin:groups'); invalidatePermissionCache(userId); return db.setUserPermissionOverrides(userId, overrides) })
  safeHandle('rbac:resolveUserPermissions', async (event, userId) => { requireSession(event); return db.resolveUserPermissions(userId) })
  safeHandle('rbac:getMyPermissions', async (event) => { const user = requireSession(event); return db.resolveUserPermissions(user.id) })

  // Surveyors
  safeHandle('db:getSurveyors', (event) => { requireSession(event); return db.getSurveyors() })
  safeHandle('db:getSurveyorsPaginated', (event, params) => { requireSession(event); return db.getSurveyorsPaginated(params) })
  safeHandle('db:addSurveyor', async (event, surveyor) => {
    const user = await requirePermission(event, 'surveys:manage')
    const result = await db.addSurveyor(surveyor)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Surveyors',
      entityType: 'surveyor',
      entityName: surveyor.name,
      details: `Created surveyor ${surveyor.name}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:updateSurveyor', async (event, id, updates) => {
    const user = await requirePermission(event, 'surveys:manage')
    const result = await db.updateSurveyor(id, updates)
    const surveyorName = updates.name || id
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'UPDATE',
      module: 'Surveyors',
      entityType: 'surveyor',
      entityId: id,
      entityName: surveyorName,
      details: `Updated surveyor ${surveyorName}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:deleteSurveyor', async (event, id) => {
    const user = await requirePermission(event, 'surveys:manage')
    const [survRows] = await (db as any).pool.query('SELECT name FROM surveyors WHERE id = ?', [id])
    const surveyorName = (survRows as any[])[0]?.name || id
    const result = await db.deleteSurveyor(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Surveyors',
      entityType: 'surveyor',
      entityId: id,
      entityName: surveyorName,
      details: `Deleted surveyor ${surveyorName}`
    }).catch(() => {})
    return result
  })

  // Condition Surveys
  safeHandle('db:getConditionSurveys', (event, vesselId) => { requireSession(event); return db.getConditionSurveys(vesselId) })
  safeHandle('db:addConditionSurvey', async (event, survey) => {
    const user = await requirePermission(event, 'surveys:manage')
    const result = await db.addConditionSurvey(survey)
    const [vSurvRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [survey.vesselId])
    const vSurvName = (vSurvRows as any[])[0]?.name || survey.vesselId
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Surveys',
      entityType: 'survey',
      entityId: result?.id || survey.id,
      entityName: vSurvName,
      details: `Created condition survey for vessel ${vSurvName}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:updateConditionSurvey', async (event, id, updates) => { await requirePermission(event, 'surveys:manage'); return db.updateConditionSurvey(id, updates) })
  safeHandle('db:deleteConditionSurvey', async (event, id) => {
    const user = await requirePermission(event, 'surveys:manage')
    const [survDelRows] = await (db as any).pool.query(
      'SELECT cs.id, v.name AS vesselName FROM condition_surveys cs LEFT JOIN vessels v ON cs.vessel_id = v.id WHERE cs.id = ?', [id]
    )
    const survVesselName = (survDelRows as any[])[0]?.vesselName || id
    const result = await db.deleteConditionSurvey(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Surveys',
      entityType: 'survey',
      entityId: id,
      entityName: survVesselName,
      details: `Deleted condition survey for vessel ${survVesselName}`
    }).catch(() => {})
    return result
  })

  // Condition Survey Types
  safeHandle('db:getConditionSurveyTypes', async (event) => {
    requireSession(event)
    return db.getConditionSurveyTypes()
  })

  safeHandle('db:addConditionSurveyType', async (event, name) => {
    await requirePermission(event, 'admin:settings')
    return db.addConditionSurveyType(name)
  })

  safeHandle('db:deleteConditionSurveyType', async (event, id) => {
    await requirePermission(event, 'admin:settings')
    return db.deleteConditionSurveyType(id)
  })
  safeHandle('db:getSurveyDefects', (event, surveyId) => { requireSession(event); return db.getSurveyDefects(surveyId) })
  safeHandle('db:addSurveyDefect', async (event, defect) => {
    const user = await requirePermission(event, 'surveys:defects')
    const result = await db.addSurveyDefect(defect)
    const [svRows] = await (db as any).pool.query(
      'SELECT v.name FROM condition_surveys cs JOIN vessels v ON v.id = cs.vessel_id WHERE cs.id = ?',
      [defect.surveyId]
    )
    const vesselName = (svRows as any[])[0]?.name || defect.surveyId
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE_DEFECT',
      module: 'Surveys',
      entityType: 'defect',
      entityName: vesselName,
      details: `Added defect to survey on vessel ${vesselName}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:updateSurveyDefect', async (event, id, updates) => { await requirePermission(event, 'surveys:defects'); return db.updateSurveyDefect(id, updates) })
  safeHandle('db:deleteSurveyDefect', async (event, id) => { await requirePermission(event, 'surveys:defects'); return db.deleteSurveyDefect(id) })
  safeHandle('db:closeDefect', async (event, id, closedBy, closureNotes) => {
    const user = await requirePermission(event, 'surveys:defects')
    const result = await db.closeDefect(id, closedBy, closureNotes)
    const [dfRows] = await (db as any).pool.query(
      'SELECT v.name FROM survey_defects sd JOIN condition_surveys cs ON cs.id = sd.survey_id JOIN vessels v ON v.id = cs.vessel_id WHERE sd.id = ?',
      [id]
    )
    const vesselName = (dfRows as any[])[0]?.name || id
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CLOSE_DEFECT',
      module: 'Surveys',
      entityType: 'defect',
      entityId: id,
      entityName: vesselName,
      details: `Closed defect on vessel ${vesselName}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:reopenDefect', async (event, id) => { await requirePermission(event, 'surveys:defects'); return db.reopenDefect(id) })
  safeHandle('db:getSurveyAttachments', (event, surveyId) => { requireSession(event); return db.getSurveyAttachments(surveyId) })
  safeHandle('db:addSurveyAttachment', async (event, attachment) => { await requirePermission(event, 'surveys:manage'); return db.addSurveyAttachment(attachment) })
  safeHandle('db:deleteSurveyAttachment', async (event, id) => { await requirePermission(event, 'surveys:manage'); return db.deleteSurveyAttachment(id) })
  safeHandle('db:getOpenDefectsByVessel', (event) => { requireSession(event); return db.getOpenDefectsByVessel() })
  safeHandle('db:getSurveyHistory', (event, vesselId) => { requireSession(event); return db.getSurveyHistory(vesselId) })
  safeHandle('db:closeSurvey', async (event, surveyId, userId) => { await requirePermission(event, 'surveys:manage'); return db.closeSurvey(surveyId, userId) })
  safeHandle('db:updateConditionSurveyEndorsement', async (event, surveyId, issued) => { await requirePermission(event, 'surveys:manage'); return db.updateConditionSurveyEndorsement(surveyId, issued) })

  // Dashboard
  safeHandle('dashboard:getActivity', (event) => { requireSession(event); return db.getDashboardActivity() })
  safeHandle('dashboard:getDataQualityAlerts', (event) => { requireSession(event); return db.getDataQualityAlerts() })
  safeHandle('dashboard:getCalendarEvents', (event, year: number, month: number) => { requireSession(event); return db.getCalendarEvents(year, month) })
  safeHandle('compliance:getDataValidation', (event) => { requireSession(event); return db.getDataValidationResults() })

  // Custom Validation Rules
  safeHandle('validationRules:getAll', (event) => { requireSession(event); return db.getCustomValidationRules() })
  safeHandle('validationRules:add', async (event, rule) => { await requirePermission(event, 'admin:settings'); return db.addCustomValidationRule(rule) })
  safeHandle('validationRules:update', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateCustomValidationRule(id, updates) })
  safeHandle('validationRules:delete', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteCustomValidationRule(id) })
  safeHandle('validationRules:reorder', async (event, ids) => { await requirePermission(event, 'admin:settings'); return db.reorderCustomValidationRules(ids) })
  safeHandle('validationRules:run', (event) => { requireSession(event); return db.runCustomValidationRules() })

  safeHandle('dashboard:getLayout', async (event) => {
    const user = requireSession(event)
    const val = await db.getSetting(`dashboard_layout_${user.id}`)
    if (!val) return null
    try { return JSON.parse(val) } catch { return null }
  })

  safeHandle('dashboard:saveLayout', async (event, layout: any) => {
    const user = requireSession(event)
    await db.setSetting(`dashboard_layout_${user.id}`, JSON.stringify(layout))
  })

  safeHandle('dashboard:setOnboarded', async (event) => {
    const user = requireSession(event)
    await db.updateUserDashboardOnboarded(user.id, true)
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (windowId) {
      const sessionId = windowSessions.get(windowId)
      const session = auth.getSessionData(sessionId)
      if (session) session.user.dashboardOnboarded = true
    }
  })

  // Survey Warranties
  safeHandle('survey_warranty:getByVessel', (event, vesselId) => { requireSession(event); return db.getSurveyWarrantiesByVessel(vesselId) })
  safeHandle('survey_warranty:getAll', (event) => { requireSession(event); return db.getAllSurveyWarranties() })
  safeHandle('survey_warranty:getDueToday', (event) => { requireSession(event); return db.getSurveyWarrantiesDueToday() })
  safeHandle('survey_warranty:getEndorsementsDue', (event) => { requireSession(event); return db.getEndorsementsDue() })
  safeHandle('survey_warranty:create', async (event, data) => { await requirePermission(event, 'surveys:manage'); return db.createSurveyWarranty(data) })
  safeHandle('survey_warranty:update', async (event, id, data) => { await requirePermission(event, 'surveys:manage'); return db.updateSurveyWarranty(id, data) })
  safeHandle('survey_warranty:delete', async (event, id) => { await requirePermission(event, 'surveys:manage'); return db.deleteSurveyWarranty(id) })
  safeHandle('survey_warranty:logReminder', async (event, data) => { await requirePermission(event, 'surveys:manage'); return db.logWarrantyReminder(data) })
  safeHandle('survey_warranty:getReminders', (event, warrantyId) => { requireSession(event); return db.getWarrantyReminders(warrantyId) })
  safeHandle('survey_warranty:waive', async (event, id, reason) => { await requirePermission(event, 'surveys:manage'); return db.waiverSurveyWarranty(id, reason) })
  safeHandle('survey_warranty:completeWithSurvey', async (event, warrantyId, completionNotes, userId) => { await requirePermission(event, 'surveys:manage'); return db.completeWarrantyAndSurvey(warrantyId, completionNotes, userId) })



  // File Path Remap
  safeHandle('vessel:getFilePaths', (event, vesselId: string) => {
    requireSession(event)
    return db.getVesselFilePaths(vesselId)
  })

  safeHandle('vessel:remapFilePaths', async (event, remaps: { source: string; id: string; newPath: string }[]) => {
    await requirePermission(event, 'vessels:edit')
    if (!Array.isArray(remaps)) throw new Error('Invalid remaps payload')
    return db.remapVesselFilePaths(remaps)
  })

  safeHandle('entity:getFilePaths', (event, entityId: string) => {
    requireSession(event)
    return db.getEntityFilePaths(entityId)
  })

  safeHandle('entity:remapFilePaths', async (event, remaps: { source: string; id: string; newPath: string }[]) => {
    await requirePermission(event, 'entities:edit')
    if (!Array.isArray(remaps)) throw new Error('Invalid remaps payload')
    return db.remapEntityFilePaths(remaps)
  })

  safeHandle('dialog:openFolder', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  safeHandle('dialog:locateFile', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // File path resolution IPC
  safeHandle('filePath:canonicalize', (event, filePath: string) => {
    requireSession(event)
    if (!filePath) return filePath
    if (isRemoteUser && filePathLocal && filePathNetwork && !isSharedPath(filePath)) {
      throw new Error(`Files must be located in the shared folder (${filePathNetwork})`)
    }
    return canonicalizeFilePath(filePath)
  })

  safeHandle('filePath:resolve', (event, filePath: string) => {
    requireSession(event)
    return resolveFilePath(filePath)
  })

  safeHandle('filePath:getSettings', (event) => {
    requireSession(event)
    return { localPath: filePathLocal, networkPath: filePathNetwork, isRemoteUser }
  })

  safeHandle('filePath:setSettings', async (event, settings: { localPath: string; networkPath: string }) => {
    await requirePermission(event, 'admin:settings')
    filePathLocal = (settings.localPath || '').replace(/[\\/]+$/, '')
    filePathNetwork = (settings.networkPath || '').replace(/[\\/]+$/, '')
    await db.setSetting('filePathSettings', JSON.stringify({ localPath: filePathLocal, networkPath: filePathNetwork }))
    initFilePathSettings()
    return { success: true }
  })

  // ── Hot-Update (GitHub-based) ─────────────────────────────────────────────────
  safeHandle('hotUpdate:getInfo', async (event) => {
    requireSession(event)
    return hotUpdateService.getInfo()
  })

  safeHandle('hotUpdate:check', async (event) => {
    requireSession(event)
    return hotUpdateService.checkAndStage()
  })

  safeHandle('hotUpdate:clearCache', async (event) => {
    await requirePermission(event, 'admin:settings')
    hotUpdateService.clearCache()
    return { success: true }
  })

  safeHandle('hotUpdate:restart', (event) => {
    requireSession(event)
    app.relaunch()
    app.exit(0)
  })

  safeHandle('shell:showItemInFolder', (event, filePath: string) => {
    requireSession(event)
    if (typeof filePath !== 'string' || !filePath) return
    shell.showItemInFolder(normalize(resolveFilePath(filePath)))
  })

  // War Breach Records
  safeHandle('warBreach:save', async (event, record: any) => {
    await requirePermission(event, 'quotations:edit')
    return db.saveWarBreachRecord(record)
  })
  safeHandle('warBreach:getAll', (event) => {
    requireSession(event)
    return db.getWarBreachRecords()
  })
  safeHandle('warBreach:delete', async (event, id: string) => {
    await requirePermission(event, 'quotations:edit')
    return db.deleteWarBreachRecord(id)
  })

  // ── Analytics Presets ──
  safeHandle('analytics:getPresets', (event) => {
    const user = requireSession(event)
    return db.getAnalyticsPresets(user.id)
  })
  safeHandle('analytics:addPreset', async (event, name: string, filters: any) => {
    const user = await requirePermission(event, 'analytics:presets')
    return db.addAnalyticsPreset({ userId: user.id, name, filters })
  })
  safeHandle('analytics:updatePreset', async (event, id: string, name: string, filters: any) => {
    await requirePermission(event, 'analytics:presets')
    return db.updateAnalyticsPreset(id, name, filters)
  })
  safeHandle('analytics:deletePreset', async (event, id: string) => {
    await requirePermission(event, 'analytics:presets')
    return db.deleteAnalyticsPreset(id)
  })
  safeHandle('analytics:getData', async (event, filters: any) => {
    await requirePermission(event, 'analytics:view')
    return db.getAnalyticsData(filters)
  })

  // File System IPC Handlers (session required, path validation)
  safeHandle('fs:exists', (event, filePath: string) => {
    requireSession(event)
    if (typeof filePath !== 'string' || !filePath) return false
    return existsSync(normalize(filePath))
  })

  safeHandle('fs:open', async (event, filePath: string) => {
    requireSession(event)
    if (typeof filePath !== 'string' || !filePath) {
      throw new Error('Invalid file path')
    }
    const resolved = resolveFilePath(filePath)
    const normalized = normalize(resolved)
    if (!existsSync(normalized)) {
      throw new Error('File not accessible. Check your network connection.')
    }
    const validation = await db.validateFileExtension(normalized)
    if (!validation.valid) {
      throw new Error(validation.reason || 'File type not allowed')
    }
    return shell.openPath(normalized)
  })

  // General file picker (for document uploads)
  safeHandle('dialog:openImageFile', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const filePath = result.filePaths[0]
    const fileName = basename(filePath)
    return { filePath, fileName }
  })

  safeHandle('dialog:openFileAny', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (result.canceled) return null
    const filePath = result.filePaths[0]
    if (isRemoteUser && filePathLocal && filePathNetwork && !isSharedPath(filePath)) {
      throw new Error(`Files must be located in the shared folder (${filePathNetwork})`)
    }
    return canonicalizeFilePath(filePath)
  })

  // Excel Import Handlers (session required)
  safeHandle('dialog:openFile', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Excel Files', extensions: ['xlsx', 'xls'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  safeHandle('excel:import', async (event, filePath: string) => {
    requireSession(event)
    const { ExcelImporter } = await import('./excelImporter')
    const importer = new ExcelImporter()
    return await importer.importFromExcel(filePath)
  })

  // Word Import Handlers (session required)
  safeHandle('dialog:openFileWord', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Word Documents', extensions: ['docx', 'doc'] },
        { name: 'PDF Documents', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  safeHandle('word:importDefects', async (event, surveyId: string, filePath: string) => {
    requireSession(event)
    return new Promise((resolve) => {
      // In production/dev, the worker file will be in the same output directory
      const workerPath = join(__dirname, 'parser.js')
      const worker = new Worker(workerPath)

      worker.postMessage({ filePath })

      worker.on('message', async (message) => {
        if (message.success) {
          try {
            // Import defects into database
            let importCount = 0
            for (const defect of message.defects) {
              await db.addSurveyDefect({
                surveyId,
                defectNumber: defect.number,
                description: defect.description,
                severity: defect.severity as any,
                status: 'OPEN',
                dueDate: defect.dueDate
              })
              importCount++
            }
            resolve({ success: true, count: importCount })
          } catch (error: any) {
            resolve({ success: false, message: error.message, count: 0 })
          }
        } else {
          resolve({ success: false, message: message.error, count: 0 })
        }
        worker.terminate()
      })

      worker.on('error', (error) => {
        console.error('Worker error:', error)
        resolve({ success: false, message: error.message, count: 0 })
        worker.terminate()
      })

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`Worker stopped with exit code ${code} `)
          resolve({ success: false, message: 'Worker stopped unexpectedly', count: 0 })
        }
      })
    })
  })

  // User Management (admin only)
  safeHandle('auth:createUser', async (event, { username, password, role }) => {
    const user = await requirePermission(event, 'admin:users')
    const result = await auth.createUser(username, password, role)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Users',
      entityType: 'user',
      entityName: username,
      details: `Created user ${username} with role ${role}`
    }).catch(() => {})
    return result
  })

  safeHandle('db:getUsers', async (event) => {
    await requirePermission(event, 'admin:users')
    return db.getUsers()
  })

  safeHandle('db:deleteUser', async (event, id) => {
    const user = await requirePermission(event, 'admin:users')
    const [userRows] = await (db as any).pool.query('SELECT username FROM users WHERE id = ?', [id])
    const targetUsername = (userRows as any[])[0]?.username || id
    const result = await db.deleteUser(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Users',
      entityType: 'user',
      entityId: id,
      entityName: targetUsername,
      details: `Deleted user ${targetUsername}`
    }).catch(() => {})
    return result
  })

  safeHandle('db:updateUser', async (event, userId: string, updates: { username?: string; fullName?: string }) => {
    await requirePermission(event, 'admin:users')
    await db.updateUser(userId, updates)
    return { success: true }
  })

  safeHandle('db:updateUserRole', async (event, userId: string, role: 'admin' | 'user') => {
    const user = await requirePermission(event, 'admin:users')
    const [roleRows] = await (db as any).pool.query('SELECT username, role FROM users WHERE id = ?', [userId])
    const target = (roleRows as any[])[0]
    const targetUsername = target?.username || userId
    const oldRole = target?.role || 'unknown'
    const result = await db.updateUserRole(userId, role)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'UPDATE',
      module: 'Users',
      entityType: 'user',
      entityId: userId,
      entityName: targetUsername,
      details: `Changed role of ${targetUsername} from ${oldRole} to ${role}`
    }).catch(() => {})
    return result
  })

  safeHandle('users:updateSanctionsThreshold', async (event, threshold: number) => {
    const user = requireSession(event)
    await db.updateUserSanctionsThreshold(user.id, threshold)
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (windowId) {
      const sessionId = windowSessions.get(windowId)
      const session = auth.getSessionData(sessionId)
      if (session) {
        session.user.sanctionsThreshold = threshold
      }
    }
  })

  safeHandle('users:updateSidebarState', async (event, sidebarCollapsed: boolean, collapsedGroups: string) => {
    const user = requireSession(event)
    await db.updateUserSidebarState(user.id, sidebarCollapsed, collapsedGroups)
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (windowId) {
      const sessionId = windowSessions.get(windowId)
      const session = auth.getSessionData(sessionId)
      if (session) {
        session.user.sidebarCollapsed = sidebarCollapsed
        session.user.collapsedGroups = collapsedGroups
      }
    }
  })

  safeHandle('users:updateAppVersion', async (event, version: string) => {
    const user = requireSession(event)
    await db.updateUserAppVersion(user.id, version)
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (windowId) {
      const sessionId = windowSessions.get(windowId)
      const session = auth.getSessionData(sessionId)
      if (session) {
        session.user.lastAppVersion = version
      }
    }
  })

  // OFAC/Sanctions Check Handler (session required)
  safeHandle('ofac:checkSanctions', async (event, name: string, threshold?: number, sources?: string[]) => {
    requireSession(event)
    try {
      // Load compliance settings to get the configured threshold and auto-mark preference
      const compSettings = await db.getComplianceScheduleSettings()
      const effectiveThreshold = threshold ?? (compSettings.threshold || 85) / 100
      const autoMarkCleanOnCheck = compSettings.autoMarkCleanOnCheck ?? true

      const apiKey = getSanctionsApiKey()
      if (!apiKey) {
        console.error('Sanctions API key not configured')
        return {
          status: 'ERROR',
          matchFound: false,
          timestamp: formatDateForMySQL(new Date()),
          matches: [],
          autoMarkCleanOnCheck,
          error: 'Sanctions API key not configured. Add sanctionsApiKey to db-config.json'
        }
      }

      const params = new URLSearchParams({
        q: name,
        mode: 'both',
        threshold: effectiveThreshold.toString(),
        limit: '20'
      })

      // Add source filtering if provided
      if (sources && sources.length > 0) {
        params.append('sources', sources.join(','))
      }

      const response = await fetch(`https://sanctions.fancyshark.com/api/search?${params}`, {
        headers: {
          'X-API-Key': apiKey
        }
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const data = await response.json()

      // Transform results to match existing SanctionsMatch interface
      const matches = (data.results || [])
        .map((result: any) => {
          // Extract IMO number if available in entity metadata (often in details or remarks)
          let imoNumber: string | undefined
          if (result.entity?.details) {
            const detailsStr = JSON.stringify(result.entity.details)
            const imoMatch = detailsStr.match(/IMO\s*(\d{7})/i)
            if (imoMatch) imoNumber = imoMatch[1]
          }

          return {
            id: result.entity?.source_id || '',
            target_type: result.entity?.entity_type || 'unknown',
            source: result.entity?.source || 'unknown',
            source_id: result.entity?.source_id || '',
            names: [
              result.entity?.name,
              ...(result.entity?.aliases || [])
            ].filter(Boolean),
            positions: result.entity?.programs || [],
            remarks: result.entity?.addresses?.join(', ') || null,
            listed_on: null,
            created_at: formatDateForMySQL(new Date()),
            score: result.score,
            imo_number: result.entity?.vessel_imo || imoNumber
          }
        })
        // Strict filtering: Ensure API or mapping didn't include matches below threshold
        .filter((match: any) => (match.score || 0) >= effectiveThreshold)

      const matchFound = matches.length > 0

      return {
        status: matchFound ? 'POTENTIAL_MATCH' : 'CLEARED',
        matchFound,
        timestamp: formatDateForMySQL(new Date()),
        matches,
        autoMarkCleanOnCheck
      }
    } catch (error) {
      console.error('OFAC check failed:', error)
      return {
        status: 'ERROR',
        matchFound: false,
        timestamp: formatDateForMySQL(new Date()),
        matches: [],
        autoMarkCleanOnCheck: true
      }
    }
  })

  // Compliance Schedule Handlers
  safeHandle('compliance:getScheduleSettings', async (event) => {
    await requirePermission(event, 'admin:settings')
    return await db.getComplianceScheduleSettings()
  })

  safeHandle('compliance:setScheduleSettings', async (event, settings) => {
    const user = await requirePermission(event, 'admin:settings')
    const nextRunAt = complianceScheduler.calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
    settings.nextRunAt = nextRunAt
    await db.setComplianceScheduleSettings(settings)
    complianceScheduler.start()
    db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Settings', entityType: 'compliance_schedule', entityName: 'Compliance Schedule', details: `Updated compliance schedule: ${settings.enabled ? 'enabled' : 'disabled'}, threshold ${settings.matchThreshold}%` }).catch(() => {})
    return { success: true }
  })

  safeHandle('compliance:getCheckLogs', async (event) => {
    requireSession(event)
    return await db.getComplianceCheckLogs()
  })

  safeHandle('compliance:getCheckResults', async (event, logId?: string, status?: string) => {
    requireSession(event)
    return await db.getComplianceCheckResults(logId, status)
  })
  safeHandle('compliance:getCheckResultsPaginated', (event, params) => { requireSession(event); return db.getComplianceCheckResultsPaginated(params) })

  safeHandle('compliance:getPendingResults', async (event) => {
    requireSession(event)
    return await db.getPendingComplianceResults()
  })

  safeHandle('compliance:markResultReviewed', async (event, resultId: string) => {
    const user = await requirePermission(event, 'compliance:review')
    await db.markComplianceResultReviewed(resultId, user.username)
  })

  safeHandle('compliance:decideResult', async (event, resultId: string, decision: 'sanctioned' | 'cleared') => {
    const user = await requirePermission(event, 'compliance:review')
    await db.decideComplianceResult(resultId, decision, user.username)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DECIDE',
      module: 'Compliance',
      entityType: 'compliance_result',
      entityId: resultId,
      details: `Marked compliance result as ${decision}`
    }).catch(() => {})
    return { success: true }
  })

  safeHandle('compliance:runManualCheck', async (event) => {
    const user = await requirePermission(event, 'admin:settings')
    await complianceScheduler.runComplianceCheck()
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'RUN_CHECK',
      module: 'Compliance',
      details: 'Triggered manual compliance check'
    }).catch(() => {})
    return { success: true }
  })

  // Reminder IPC Handlers
  safeHandle('reminders:getSettings', (event) => { requireSession(event); return db.getReminderSettings() })
  safeHandle('reminders:setSettings', async (event, settings) => { await requirePermission(event, 'reminders:manage'); return db.setReminderSettings(settings) })
  safeHandle('reminders:getVesselReminders', (event) => { requireSession(event); return db.getVesselReminders() })
  safeHandle('reminders:snoozeVessel', async (event, vesselId, username, periodDays) => { await requirePermission(event, 'reminders:manage'); return db.snoozeVessel(vesselId, username, periodDays) })
  safeHandle('reminders:unsnoozeVessel', async (event, vesselId) => { await requirePermission(event, 'reminders:manage'); return db.unsnoozeVessel(vesselId) })

  // P&I Clauses
  safeHandle('pi:getClauses', (event) => { requireSession(event); return db.getPIClauses() })
  safeHandle('pi:addClause', async (event, clause) => { await requirePermission(event, 'quotations:settings'); return db.addPIClause(clause) })
  safeHandle('pi:updateClause', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePIClause(id, updates) })
  safeHandle('pi:deleteClause', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIClause(id) })
  safeHandle('pi:reorderClauses', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPIClauses(orderedIds) })

  // P&I Clause Sets
  safeHandle('pi:getClauseSets', (event) => { requireSession(event); return db.getPIClauseSets() })
  safeHandle('pi:addClauseSet', async (event, name, clauseIds, descOverrides) => { await requirePermission(event, 'quotations:settings'); return db.addPIClauseSet(name, clauseIds, descOverrides) })
  safeHandle('pi:updateClauseSet', async (event, id, name, clauseIds, descOverrides) => { await requirePermission(event, 'quotations:settings'); return db.updatePIClauseSet(id, name, clauseIds, descOverrides) })
  safeHandle('pi:deleteClauseSet', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIClauseSet(id) })

  // Hull Agreed Value Texts
  safeHandle('hull:getAgreedValueTexts', (event) => { requireSession(event); return db.getHullAgreedValueTexts() })
  safeHandle('hull:addAgreedValueText', async (event, text, defaultSelected, section) => { await requirePermission(event, 'quotations:settings'); return db.addHullAgreedValueText(text, defaultSelected, section) })
  safeHandle('hull:updateAgreedValueText', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateHullAgreedValueText(id, updates) })
  safeHandle('hull:deleteAgreedValueText', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteHullAgreedValueText(id) })
  safeHandle('hull:reorderAgreedValueTexts', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderHullAgreedValueTexts(ids) })

  // Hull Clauses
  safeHandle('hull:getClauses', (event) => { requireSession(event); return db.getHullClauses() })
  safeHandle('hull:addClause', async (event, name, code, description, conditionSection) => { await requirePermission(event, 'quotations:settings'); return db.addHullClause(name, code, description, conditionSection) })
  safeHandle('hull:updateClause', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateHullClause(id, updates) })
  safeHandle('hull:deleteClause', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteHullClause(id) })
  safeHandle('hull:reorderClauses', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderHullClauses(ids) })

  // Hull Clause Conditions
  safeHandle('hull:getClauseConditions', (event, hullClauseId) => { requireSession(event); return db.getHullClauseConditions(hullClauseId) })
  safeHandle('hull:addClauseCondition', async (event, hullClauseId, conditionNumber, text, defaultSelected, conditionSection, hasAmount, amountPlaceholder) => { await requirePermission(event, 'quotations:settings'); return db.addHullClauseCondition(hullClauseId, conditionNumber, text, defaultSelected, conditionSection, hasAmount, amountPlaceholder) })
  safeHandle('hull:updateClauseCondition', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateHullClauseCondition(id, updates) })
  safeHandle('hull:deleteClauseCondition', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteHullClauseCondition(id) })
  safeHandle('hull:reorderClauseConditions', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderHullClauseConditions(ids) })

  // Hull Additional Conditions
  safeHandle('hull:getAdditionalConditions', (event) => { requireSession(event); return db.getHullAdditionalConditions() })
  safeHandle('hull:addAdditionalCondition', async (event, title, text, defaultSelected, hullClauseIds, hasAmount, amountPlaceholder) => { await requirePermission(event, 'quotations:settings'); return db.addHullAdditionalCondition(title, text, defaultSelected, hullClauseIds, hasAmount, amountPlaceholder) })
  safeHandle('hull:updateAdditionalCondition', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateHullAdditionalCondition(id, updates) })
  safeHandle('hull:deleteAdditionalCondition', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteHullAdditionalCondition(id) })
  safeHandle('hull:reorderAdditionalConditions', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderHullAdditionalConditions(ids) })

  // Quotation Hull Data
  safeHandle('hull:getQuotationAgreedValueItems', (event, qId) => { requireSession(event); return db.getQuotationAgreedValueItems(qId) })
  safeHandle('hull:setQuotationAgreedValueItems', async (event, qId, items) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationAgreedValueItems(qId, items) })
  // P&I Alternatives
  safeHandle('pi:getQuotationAlternatives', (event, qId) => { requireSession(event); return db.getQuotationPIAlternatives(qId) })
  safeHandle('pi:addQuotationAlternative', async (event, qId, label) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationPIAlternative(qId, label) })
  safeHandle('pi:migrateSharedToAlternative', async (event, qId, altId) => { await requirePermission(event, 'quotations:edit'); return db.piMigrateSharedToAlternative(qId, altId) })
  safeHandle('pi:updateQuotationAlternative', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationPIAlternative(id, updates) })
  safeHandle('pi:deleteQuotationAlternative', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationPIAlternative(id) })
  safeHandle('pi:reorderQuotationAlternatives', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationPIAlternatives(ids) })
  safeHandle('quotation:updateItemAlternativeId', async (event, table, id, alternativeId) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationItemAlternativeId(table, id, alternativeId) })
  safeHandle('quotation:copySections', async (event, targetId, sourceId, sections) => { await requirePermission(event, 'quotations:edit'); return db.copyQuotationSections(targetId, sourceId, sections) })

  // Agreed Value Options
  safeHandle('hull:getAgreedValueOptions', (event, qId) => { requireSession(event); return db.getQuotationAgreedValueOptions(qId) })
  safeHandle('hull:addAgreedValueOption', async (event, qId, amount, currency, label) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationAgreedValueOption(qId, amount, currency, label) })
  safeHandle('hull:updateAgreedValueOption', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationAgreedValueOption(id, updates) })
  safeHandle('hull:deleteAgreedValueOption', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationAgreedValueOption(id) })
  safeHandle('hull:reorderAgreedValueOptions', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationAgreedValueOptions(ids) })

  // LOL Options
  safeHandle('lol:getOptions', (event, qId) => { requireSession(event); return db.getQuotationLolOptions(qId) })
  safeHandle('lol:addOption', async (event, qId, amount, currency, label) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationLolOption(qId, amount, currency, label) })
  safeHandle('lol:updateOption', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationLolOption(id, updates) })
  safeHandle('lol:deleteOption', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationLolOption(id) })

  // Hull Alternatives
  safeHandle('hull:getQuotationAlternatives', (event, qId) => { requireSession(event); return db.getQuotationHullAlternatives(qId) })
  safeHandle('hull:addQuotationAlternative', async (event, qId, hullClauseId, label, vesselScopeId) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationHullAlternative(qId, hullClauseId, label, vesselScopeId) })
  safeHandle('hull:updateQuotationAlternative', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationHullAlternative(id, updates) })
  safeHandle('hull:deleteQuotationAlternative', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationHullAlternative(id) })
  safeHandle('hull:reorderQuotationAlternatives', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationHullAlternatives(ids) })
  safeHandle('hull:getQuotationHullConditions', (event, qId) => { requireSession(event); return db.getQuotationHullConditions(qId) })
  safeHandle('hull:setQuotationHullConditions', async (event, qId, items) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationHullConditions(qId, items) })
  safeHandle('hull:getQuotationHullAdditionalConditions', (event, qId) => { requireSession(event); return db.getQuotationHullAdditionalConditions(qId) })
  safeHandle('hull:setQuotationHullAdditionalConditions', async (event, qId, items) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationHullAdditionalConditions(qId, items) })

  // Custom Hull Additional Conditions (per quotation)
  safeHandle('hull:getQuotationCustomConditions', (event, qId) => { requireSession(event); return db.getQuotationHullCustomConditions(qId) })
  safeHandle('hull:addQuotationCustomCondition', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationHullCustomCondition(data) })
  safeHandle('hull:updateQuotationCustomCondition', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationHullCustomCondition(id, updates) })
  safeHandle('hull:deleteQuotationCustomCondition', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationHullCustomCondition(id) })
  safeHandle('hull:reorderQuotationCustomConditions', async (event, qId, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationHullCustomConditions(qId, ids) })

  // War Risk Conditions
  safeHandle('war:getConditions', (event) => { requireSession(event); return db.getWarConditions() })
  safeHandle('war:addCondition', async (event, text, defaultSelected) => { await requirePermission(event, 'quotations:settings'); return db.addWarCondition(text, defaultSelected) })
  safeHandle('war:updateCondition', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateWarCondition(id, updates) })
  safeHandle('war:deleteCondition', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteWarCondition(id) })
  safeHandle('war:reorderConditions', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderWarConditions(ids) })
  safeHandle('war:getQuotationWarConditions', (event, qId) => { requireSession(event); return db.getQuotationWarConditions(qId) })
  safeHandle('war:setQuotationWarConditions', async (event, qId, items) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationWarConditions(qId, items) })

  // War Risk Settings
  safeHandle('war:getSettings', (event) => { requireSession(event); return db.getWarSettings() })
  safeHandle('war:setSettings', async (event, settings) => { await requirePermission(event, 'quotations:settings'); return db.setWarSettings(settings) })

  // ==================== Cargo ====================
  safeHandle('cargo:getClauses', (event, section) => { requireSession(event); return db.getCargoClausesBySection(section) })
  safeHandle('cargo:getAllClauses', (event) => { requireSession(event); return db.getAllCargoClauses() })
  safeHandle('cargo:addClause', async (event, section, title, text, code, hasAmount, amountPlaceholder) => { await requirePermission(event, 'quotations:settings'); return db.addCargoClause(section, title, text, code, hasAmount, amountPlaceholder) })
  safeHandle('cargo:updateClause', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateCargoClause(id, updates) })
  safeHandle('cargo:deleteClause', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteCargoClause(id) })
  safeHandle('cargo:reorderClauses', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderCargoClauses(ids) })

  safeHandle('cargo:getQuotationClauses', (event, qId, section) => { requireSession(event); return db.getQuotationCargoClauses(qId, section) })
  safeHandle('cargo:setQuotationClauses', async (event, qId, section, items) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationCargoClauses(qId, section, items) })
  safeHandle('cargo:getQuotationCustomClauses', (event, qId, section) => { requireSession(event); return db.getQuotationCargoCustomClauses(qId, section) })
  safeHandle('cargo:addQuotationCustomClause', async (event, qId, section, text) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationCargoCustomClause(qId, section, text) })
  safeHandle('cargo:updateQuotationCustomClause', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationCargoCustomClause(id, updates) })
  safeHandle('cargo:deleteQuotationCustomClause', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationCargoCustomClause(id) })
  safeHandle('cargo:reorderQuotationCustomClauses', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationCargoCustomClauses(ids) })

  // Cargo Institute Clauses
  safeHandle('cargo:getInstituteClauses', (event) => { requireSession(event); return db.getCargoInstituteClauses() })
  safeHandle('cargo:addInstituteClause', async (event, name, code, description) => { await requirePermission(event, 'quotations:settings'); return db.addCargoInstituteClause(name, code, description) })
  safeHandle('cargo:updateInstituteClause', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateCargoInstituteClause(id, updates) })
  safeHandle('cargo:deleteInstituteClause', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteCargoInstituteClause(id) })
  safeHandle('cargo:reorderInstituteClauses', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderCargoInstituteClauses(ids) })

  // P&I Warranty Tags
  safeHandle('pi:getWarrantyTags', (event) => { requireSession(event); return db.getPIWarrantyTags() })
  safeHandle('pi:addWarrantyTag', async (event, name) => { await requirePermission(event, 'quotations:settings'); return db.addPIWarrantyTag(name) })
  safeHandle('pi:updateWarrantyTag', async (event, id, name) => { await requirePermission(event, 'quotations:settings'); return db.updatePIWarrantyTag(id, name) })
  safeHandle('pi:deleteWarrantyTag', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIWarrantyTag(id) })
  safeHandle('pi:reorderWarrantyTags', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPIWarrantyTags(orderedIds) })

  // P&I Warranties
  safeHandle('pi:getWarranties', (event) => { requireSession(event); return db.getPIWarranties() })
  safeHandle('pi:addWarranty', async (event, warranty) => { await requirePermission(event, 'quotations:settings'); return db.addPIWarranty(warranty) })
  safeHandle('pi:updateWarranty', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePIWarranty(id, updates) })
  safeHandle('pi:deleteWarranty', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIWarranty(id) })
  safeHandle('pi:reorderWarranties', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPIWarranties(orderedIds) })

  // P&I Warranty Sets
  safeHandle('pi:getWarrantySets', (event) => { requireSession(event); return db.getPIWarrantySets() })
  safeHandle('pi:addWarrantySet', async (event, name, warrantyIds, defaultSelected) => { await requirePermission(event, 'quotations:settings'); return db.addPIWarrantySet(name, warrantyIds, defaultSelected) })
  safeHandle('pi:updateWarrantySet', async (event, id, name, warrantyIds, defaultSelected) => { await requirePermission(event, 'quotations:settings'); return db.updatePIWarrantySet(id, name, warrantyIds, defaultSelected) })
  safeHandle('pi:deleteWarrantySet', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIWarrantySet(id) })

  // P&I Deductibles
  safeHandle('pi:getDeductibles', (event) => { requireSession(event); return db.getPIDeductibles() })
  safeHandle('pi:addDeductible', async (event, ded) => { await requirePermission(event, 'quotations:settings'); return db.addPIDeductible(ded) })
  safeHandle('pi:updateDeductible', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePIDeductible(id, updates) })
  safeHandle('pi:deleteDeductible', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIDeductible(id) })
  safeHandle('pi:reorderDeductibles', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPIDeductibles(orderedIds) })

  // P&I Deductible Sets
  safeHandle('pi:getDeductibleSets', (event) => { requireSession(event); return db.getPIDeductibleSets() })
  safeHandle('pi:getDeductibleSetItems', (event, setId) => { requireSession(event); return db.getPIDeductibleSetItems(setId) })
  safeHandle('pi:addDeductibleSet', async (event, name, items) => { await requirePermission(event, 'quotations:settings'); return db.addPIDeductibleSet(name, items) })
  safeHandle('pi:updateDeductibleSet', async (event, id, name, items) => { await requirePermission(event, 'quotations:settings'); return db.updatePIDeductibleSet(id, name, items) })
  safeHandle('pi:deleteDeductibleSet', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIDeductibleSet(id) })

  // P&I Text Deductibles (Master)
  safeHandle('pi:getTextDeductibles', (event) => { requireSession(event); return db.getPITextDeductibles() })
  safeHandle('pi:addTextDeductible', async (event, data) => { await requirePermission(event, 'quotations:settings'); return db.addPITextDeductible(data) })
  safeHandle('pi:updateTextDeductible', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePITextDeductible(id, updates) })
  safeHandle('pi:deleteTextDeductible', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePITextDeductible(id) })
  safeHandle('pi:reorderTextDeductibles', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPITextDeductibles(orderedIds) })

  // P&I Exclusions
  safeHandle('pi:getExclusions', (event) => { requireSession(event); return db.getPIExclusions() })
  safeHandle('pi:addExclusion', async (event, exclusion) => { await requirePermission(event, 'quotations:settings'); return db.addPIExclusion(exclusion) })
  safeHandle('pi:updateExclusion', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePIExclusion(id, updates) })
  safeHandle('pi:deleteExclusion', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIExclusion(id) })
  safeHandle('pi:reorderExclusions', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPIExclusions(orderedIds) })

  // P&I Sub-Limit Templates
  safeHandle('pi:getSubLimitTemplates', (event) => { requireSession(event); return db.getPISubLimitTemplates() })
  safeHandle('pi:addSubLimitTemplate', async (event, tmpl) => { await requirePermission(event, 'quotations:settings'); return db.addPISubLimitTemplate(tmpl) })
  safeHandle('pi:updateSubLimitTemplate', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePISubLimitTemplate(id, updates) })
  safeHandle('pi:deleteSubLimitTemplate', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePISubLimitTemplate(id) })
  safeHandle('pi:reorderSubLimitTemplates', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPISubLimitTemplates(orderedIds) })

  // P&I Additional Clauses
  safeHandle('pi:getAdditionalClauses', (event) => { requireSession(event); return db.getPIAdditionalClauses() })
  safeHandle('pi:addAdditionalClause', async (event, title, code, text) => { await requirePermission(event, 'quotations:settings'); return db.addPIAdditionalClause(title, code, text) })
  safeHandle('pi:updateAdditionalClause', async (event, id, title, code, text) => { await requirePermission(event, 'quotations:settings'); return db.updatePIAdditionalClause(id, title, code, text) })
  safeHandle('pi:deleteAdditionalClause', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePIAdditionalClause(id) })
  safeHandle('pi:reorderAdditionalClauses', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPIAdditionalClauses(orderedIds) })
  safeHandle('pi:toggleAdditionalClauseDefault', async (event, id, defaultSelected) => { await requirePermission(event, 'quotations:settings'); return db.togglePIAdditionalClauseDefault(id, defaultSelected) })
  safeHandle('pi:getAdditionalClauseSets', (event) => { requireSession(event); return db.piGetAdditionalClauseSets() })
  safeHandle('pi:addAdditionalClauseSet', async (event, name, clauseIds, defaultSelected) => { await requirePermission(event, 'quotations:settings'); return db.piAddAdditionalClauseSet(name, clauseIds, defaultSelected) })
  safeHandle('pi:updateAdditionalClauseSet', async (event, id, name, clauseIds, defaultSelected) => { await requirePermission(event, 'quotations:settings'); return db.piUpdateAdditionalClauseSet(id, name, clauseIds, defaultSelected) })
  safeHandle('pi:deleteAdditionalClauseSet', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.piDeleteAdditionalClauseSet(id) })

  // Trading Excluded Countries
  safeHandle('pi:getTradingExcludedCountries', (event) => { requireSession(event); return db.getTradingExcludedCountries() })
  safeHandle('pi:addTradingExcludedCountry', async (event, country) => { await requirePermission(event, 'quotations:settings'); return db.addTradingExcludedCountry(country) })
  safeHandle('pi:updateTradingExcludedCountry', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateTradingExcludedCountry(id, updates) })
  safeHandle('pi:deleteTradingExcludedCountry', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteTradingExcludedCountry(id) })

  // Trading Warranty Templates
  safeHandle('pi:getTradingWarrantyTemplates', (event) => { requireSession(event); return db.getTradingWarrantyTemplates() })
  safeHandle('pi:addTradingWarrantyTemplate', async (event, name, text) => { await requirePermission(event, 'quotations:settings'); return db.addTradingWarrantyTemplate(name, text) })
  safeHandle('pi:updateTradingWarrantyTemplate', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateTradingWarrantyTemplate(id, updates) })
  safeHandle('pi:deleteTradingWarrantyTemplate', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteTradingWarrantyTemplate(id) })
  safeHandle('pi:reorderTradingWarrantyTemplates', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderTradingWarrantyTemplates(ids) })

  // Trading Custom Texts
  safeHandle('pi:getTradingCustomTexts', (event) => { requireSession(event); return db.getTradingCustomTexts() })
  safeHandle('pi:addTradingCustomText', async (event, name, text) => { await requirePermission(event, 'quotations:settings'); return db.addTradingCustomText(name, text) })
  safeHandle('pi:updateTradingCustomText', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateTradingCustomText(id, updates) })
  safeHandle('pi:deleteTradingCustomText', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteTradingCustomText(id) })
  safeHandle('pi:reorderTradingCustomTexts', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderTradingCustomTexts(ids) })

  // Premium Text Templates (NCB / UPCC)
  safeHandle('premium:getTextTemplates', (event, type) => { requireSession(event); return db.getPremiumTextTemplates(type) })
  safeHandle('premium:addTextTemplate', async (event, data) => { await requirePermission(event, 'quotations:settings'); return db.addPremiumTextTemplate(data) })
  safeHandle('premium:updateTextTemplate', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePremiumTextTemplate(id, updates) })
  safeHandle('premium:deleteTextTemplate', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePremiumTextTemplate(id) })
  safeHandle('premium:reorderTextTemplates', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderPremiumTextTemplates(ids) })

  // P&I Section Texts
  safeHandle('pi:getSectionTexts', (event) => { requireSession(event); return db.getPISectionTexts() })
  safeHandle('pi:setSectionTexts', async (event, texts) => { await requirePermission(event, 'quotations:settings'); return db.setPISectionTexts(texts) })

  // Instalment Defaults & Logo
  safeHandle('pi:getInstalmentDefaults', (event) => { requireSession(event); return db.getInstalmentDefaults() })
  safeHandle('pi:setInstalmentDefaults', async (event, defaults) => { await requirePermission(event, 'quotations:settings'); return db.setInstalmentDefaults(defaults) })
  safeHandle('pi:getQuotationLogoPath', (event) => { requireSession(event); return db.getQuotationLogoPath() })
  safeHandle('pi:setQuotationLogoPath', async (event, path) => { await requirePermission(event, 'quotations:settings'); return db.setQuotationLogoPath(path) })

  // P&I Sanctions Versions
  safeHandle('pi:getSanctionsVersions', (event) => { requireSession(event); return db.getPISanctionsVersions() })
  safeHandle('pi:addSanctionsVersion', async (event, data) => { await requirePermission(event, 'quotations:settings'); return db.addPISanctionsVersion(data) })
  safeHandle('pi:updateSanctionsVersion', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updatePISanctionsVersion(id, updates) })
  safeHandle('pi:deleteSanctionsVersion', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePISanctionsVersion(id) })
  safeHandle('pi:reorderSanctionsVersions', async (event, orderedIds) => { await requirePermission(event, 'quotations:settings'); return db.reorderPISanctionsVersions(orderedIds) })

  // Vessel Insurance Policies (imported)
  safeHandle('vessels:getInsurancePolicies', (event, vesselId) => { requireSession(event); return db.getVesselInsurancePolicies(vesselId) })
  safeHandle('vessels:importInsurancePoliciesFromExcel', async (event, filePath: string) => {
    await requirePermission(event, 'vessels:edit')
    const { parseVesselExcel } = await import('./vesselExcelImport')
    const parsed = parseVesselExcel(filePath)
    const vessels = await db.getVessels()
    const imoMap = new Map<string, string>()
    for (const v of vessels) {
      if (v.imoNumber) imoMap.set(v.imoNumber, v.id)
    }
    // Build flag state name → id map for matching
    const flagStates = await db.getFlagStates()
    const flagNameMap = new Map<string, string>()
    for (const fs of flagStates) {
      flagNameMap.set(fs.name.toLowerCase(), fs.id)
    }

    // Build policy type name → id map and load characteristics
    const policyTypes = await db.getPolicyTypes()
    const ptMap = new Map<string, string>() // lowercase name → id
    for (const pt of policyTypes) {
      ptMap.set(pt.name.toLowerCase(), pt.id)
    }

    // Field mappings for each policy category → characteristic names
    const hullFields = [
      { key: 'coverageCode', name: 'Coverage Code', type: 'text' },
      { key: 'inceptionDate', name: 'Inception Date', type: 'date' },
      { key: 'endDate', name: 'End Date', type: 'date' },
      { key: 'hmValue', name: 'H&M Value', type: 'amount' },
      { key: 'ivValue', name: 'IV Value', type: 'amount' },
      { key: 'hmPremium', name: 'H&M Premium', type: 'amount' },
      { key: 'ivPremium', name: 'IV Premium', type: 'amount' },
      { key: 'deductible', name: 'Deductible', type: 'amount' },
      { key: 'amd', name: 'AMD', type: 'amount' },
      { key: 'generalAverage', name: 'General Average', type: 'amount' },
      { key: 'upcc', name: 'UPCC', type: 'text' },
      { key: 'ncb', name: 'NCB', type: 'text' },
      { key: 'ourShare', name: 'Our Share', type: 'text' }
    ]
    const piFields = [
      { key: 'coverageCode', name: 'Coverage Code', type: 'text' },
      { key: 'inceptionDate', name: 'Inception Date', type: 'date' },
      { key: 'endDate', name: 'End Date', type: 'date' },
      { key: 'limitOfLiability', name: 'Limit of Liability', type: 'amount' },
      { key: 'premium', name: 'Premium', type: 'amount' },
      { key: 'upcc', name: 'UPCC', type: 'text' },
      { key: 'ncb', name: 'NCB', type: 'text' },
      { key: 'ourShare', name: 'Our Share', type: 'text' }
    ]
    const warFields = [
      { key: 'policyNumber', name: 'Policy Number', type: 'text' },
      { key: 'warRate', name: 'War Rate', type: 'text' },
      { key: 'ourShare', name: 'Our Share', type: 'text' }
    ]

    const categoryFieldMap: Record<string, { key: string; name: string; type: string }[]> = {
      hull: hullFields,
      pi: piFields,
      war: warFields
    }
    const categoryNameMap: Record<string, string> = { hull: 'Hull', pi: 'P&I', war: 'War' }

    // Ensure policy types exist and build characteristic maps
    const charMaps: Record<string, Map<string, string>> = {} // category → (charName → charId)
    for (const cat of ['hull', 'pi', 'war']) {
      const ptName = categoryNameMap[cat]
      let ptId = ptMap.get(ptName.toLowerCase())
      if (!ptId) {
        const newPt = await db.addPolicyType(ptName)
        ptId = newPt.id
        ptMap.set(ptName.toLowerCase(), ptId)
      }

      // Get existing characteristics
      const existingChars = await db.getPolicyTypeCharacteristics(ptId)
      const charNameMap = new Map<string, string>()
      for (const c of existingChars) {
        charNameMap.set(c.name.toLowerCase(), c.id)
      }

      // Auto-create missing characteristics
      const fields = categoryFieldMap[cat]
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i]
        if (!charNameMap.has(f.name.toLowerCase())) {
          const newChar = await db.addPolicyTypeCharacteristic({
            policyTypeId: ptId,
            name: f.name,
            fieldType: f.type as any,
            isRequired: false,
            order: existingChars.length + i
          })
          charNameMap.set(f.name.toLowerCase(), newChar.id)
        }
      }
      charMaps[cat] = charNameMap
    }

    // Build entity name → id map for broker matching
    const entities = await db.getEntities()
    const entityNameMap = new Map<string, string>()
    for (const e of entities) {
      entityNameMap.set(e.name.toLowerCase(), e.id)
    }

    // Build surveyor map for condition survey creation
    const surveyors = await db.getSurveyors()
    const surveyorNameMap = new Map<string, string>()
    for (const s of surveyors) {
      surveyorNameMap.set(s.companyName.toLowerCase(), s.id)
    }

    const unmatched: { ship: string; imo: string; broker: string; fleet: string }[] = []
    let imported = 0
    const processedVessels = new Set<string>()

    for (const row of parsed) {
      const vesselId = row.imo ? imoMap.get(row.imo) : undefined
      if (!vesselId) {
        unmatched.push({ ship: row.shipName, imo: row.imo, broker: row.broker, fleet: row.fleetName })
        continue
      }

      // Update vessel details if currently missing
      const vessel = vessels.find(v => v.id === vesselId)
      if (vessel) {
        const updates: Record<string, any> = {}
        if ((!vessel.grossTonnage || vessel.grossTonnage === 0) && row.grossTonnage) updates.grossTonnage = row.grossTonnage
        if ((!vessel.builtYear || vessel.builtYear === 0) && row.year) updates.builtYear = row.year
        if (!vessel.vesselTypeId && row.vesselType) {
          // Resolve vessel type name to ID
          const vtypes = await db.getVesselTypes()
          let vtMatch = vtypes.find(vt => vt.name.toLowerCase() === row.vesselType.toLowerCase())
          if (!vtMatch) {
            vtMatch = await db.addVesselType({ name: row.vesselType, order: vtypes.length })
          }
          updates.vesselTypeId = vtMatch.id
        }
        if (!vessel.classificationSociety && row.classification) updates.classificationSociety = row.classification
        if (!vessel.flagStateId && row.flag) {
          const matchedFlagId = flagNameMap.get(row.flag.toLowerCase())
          if (matchedFlagId) updates.flagStateId = matchedFlagId
        }
        if (Object.keys(updates).length > 0) {
          await db.updateVessel(vesselId, updates)
        }
      }

      // Clear existing dynamic policies for this vessel on first encounter
      if (!processedVessels.has(vesselId)) {
        const existingPolicies = await db.getVesselDynamicPolicies(vesselId)
        for (const ep of existingPolicies) {
          await db.deleteVesselDynamicPolicy(ep.id)
        }
        processedVessels.add(vesselId)
      }

      // Match broker
      const brokerId = row.broker ? entityNameMap.get(row.broker.toLowerCase()) : undefined

      // Import each policy record as a dynamic policy
      const records = [row.hull, row.pi, row.war].filter(Boolean) as any[]
      for (const r of records) {
        const cat = r.policyCategory as string
        const ptName = categoryNameMap[cat]
        const ptId = ptMap.get(ptName.toLowerCase())
        if (!ptId) continue

        const charMap = charMaps[cat]
        const fields = categoryFieldMap[cat]

        // Create the dynamic policy
        const policyId = await db.addVesselDynamicPolicy({
          vesselId,
          policyTypeId: ptId,
          policyNumber: cat === 'war' ? undefined : (r.policyNumber || undefined),
          status: 'active',
          currency: r.currency || 'USD',
          brokerEntityId: brokerId || undefined,
          notes: r.notes || undefined
        })

        // Set characteristic values
        const charValues: { characteristicId: string; valueText?: string; valueAmount?: number; valueDate?: string; valueBoolean?: boolean }[] = []
        for (const f of fields) {
          const charId = charMap.get(f.name.toLowerCase())
          if (!charId) continue
          const val = r[f.key]
          if (val == null || val === '' || val === undefined) continue

          if (f.type === 'amount') {
            charValues.push({ characteristicId: charId, valueAmount: typeof val === 'number' ? val : parseFloat(val) })
          } else if (f.type === 'date') {
            charValues.push({ characteristicId: charId, valueDate: String(val) })
          } else {
            charValues.push({ characteristicId: charId, valueText: String(val) })
          }
        }
        if (charValues.length > 0) {
          await db.setVesselPolicyValues(policyId, charValues)
        }
        imported++
      }

      // Create condition survey if survey data exists (#2 - separate from policies)
      if (row.conditionSurvey || row.surveyDate || row.surveyReference) {
        try {
          // Find or use a default surveyor
          let surveyorId = ''
          if (row.conditionSurvey) {
            surveyorId = surveyorNameMap.get(row.conditionSurvey.toLowerCase()) || ''
          }
          if (surveyorId && row.surveyDate) {
            await db.addConditionSurvey({
              vesselId,
              surveyDate: row.surveyDate,
              surveyorId,
              surveyType: 'Condition Survey',
              reference: row.surveyReference || undefined,
              notes: row.surveyDone ? `Survey Done: ${row.surveyDone}` : undefined
            })
          }
        } catch { /* skip survey creation errors */ }
      }
    }

    return { imported, skippedCancelled: 0, totalRows: parsed.length, unmatched }
  })

  // Re-import vessel type, flag, and class from Excel
  safeHandle('vessels:reimportVesselDetails', async (event, filePath: string) => {
    await requirePermission(event, 'vessels:edit')
    const { parseVesselExcel } = await import('./vesselExcelImport')
    const parsed = parseVesselExcel(filePath)
    const vessels = await db.getVessels()
    const imoMap = new Map<string, any>()
    for (const v of vessels) {
      if (v.imoNumber) imoMap.set(v.imoNumber, v)
    }

    // Build lookup maps
    const flagStates = await db.getFlagStates()
    const flagNameMap = new Map<string, string>()
    for (const fs of flagStates) {
      flagNameMap.set(fs.name.toLowerCase(), fs.id)
    }

    const classSocieties = await db.getClassificationSocieties()
    const classNameMap = new Map<string, string>()
    for (const cs of classSocieties) {
      classNameMap.set(cs.name.toLowerCase(), cs.name)
      if (cs.abbreviation) classNameMap.set(cs.abbreviation.toLowerCase(), cs.name)
    }

    const vesselTypes = await db.getVesselTypes()
    const vtIdMap = new Map<string, string>()
    for (const vt of vesselTypes) {
      vtIdMap.set(vt.name.toLowerCase(), vt.id)
    }

    let updated = 0
    let createdFlags = 0, createdClasses = 0, createdTypes = 0

    for (const row of parsed) {
      const vessel = row.imo ? imoMap.get(row.imo) : undefined
      if (!vessel) continue

      const updates: Record<string, any> = {}

      // Flag state - auto-create if missing
      if (row.flag) {
        let flagId = flagNameMap.get(row.flag.toLowerCase())
        if (!flagId) {
          const created = await db.addFlagState({ name: row.flag, iso3Code: '' })
          flagId = created.id as string
          flagNameMap.set(row.flag.toLowerCase(), flagId)
          createdFlags++
        }
        updates.flagStateId = flagId
      }

      // Classification society - auto-create if missing
      if (row.classification) {
        let className = classNameMap.get(row.classification.toLowerCase())
        if (!className) {
          const created = await db.addClassificationSociety({ name: row.classification, abbreviation: row.classification, isIacs: false, order: classSocieties.length + createdClasses })
          className = created.name
          classNameMap.set(row.classification.toLowerCase(), className)
          createdClasses++
        }
        updates.classificationSociety = className
      }

      // Vessel type - auto-create if missing, store as FK
      if (row.vesselType) {
        let typeId = vtIdMap.get(row.vesselType.toLowerCase())
        if (!typeId) {
          const created = await db.addVesselType({ name: row.vesselType, order: vesselTypes.length + createdTypes })
          typeId = created.id
          vtIdMap.set(row.vesselType.toLowerCase(), typeId)
          createdTypes++
        }
        updates.vesselTypeId = typeId
      }

      if (Object.keys(updates).length > 0) {
        await db.updateVessel(vessel.id, updates)
        updated++
      }
    }

    return {
      updated,
      totalRows: parsed.length,
      createdFlags,
      createdClasses,
      createdTypes
    }
  })

  // Classification Societies
  safeHandle('db:getClassificationSocieties', (event) => { requireSession(event); return db.getClassificationSocieties() })
  safeHandle('db:addClassificationSociety', async (event, cs) => { await requirePermission(event, 'admin:settings'); return db.addClassificationSociety(cs) })
  safeHandle('db:updateClassificationSociety', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateClassificationSociety(id, updates) })
  safeHandle('db:deleteClassificationSociety', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteClassificationSociety(id) })
  safeHandle('db:reorderClassificationSocieties', async (event, ids) => { await requirePermission(event, 'admin:settings'); return db.reorderClassificationSocieties(ids) })
  safeHandle('vessels:getClassifications', (event, vesselId) => { requireSession(event); return db.getVesselClassifications(vesselId) })
  safeHandle('vessels:setClassifications', async (event, vesselId, csIds) => { await requirePermission(event, 'vessels:edit'); return db.setVesselClassifications(vesselId, csIds) })

  // Vessel Types
  safeHandle('db:getVesselTypes', (event) => { requireSession(event); return db.getVesselTypes() })
  safeHandle('db:addVesselType', async (event, vt) => { await requirePermission(event, 'admin:settings'); return db.addVesselType(vt) })
  safeHandle('db:updateVesselType', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateVesselType(id, updates) })
  safeHandle('db:deleteVesselType', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteVesselType(id) })
  safeHandle('db:reorderVesselTypes', async (event, ids) => { await requirePermission(event, 'admin:settings'); return db.reorderVesselTypes(ids) })

  // Vessel Audit Log
  safeHandle('vessels:getAuditLog', (event, vesselId) => { requireSession(event); return db.getVesselAuditLog(vesselId) })

  // Policy Type Characteristics
  safeHandle('db:getPolicyTypeCharacteristics', (event, policyTypeId) => { requireSession(event); return db.getPolicyTypeCharacteristics(policyTypeId) })
  safeHandle('db:addPolicyTypeCharacteristic', async (event, c) => { await requirePermission(event, 'admin:settings'); return db.addPolicyTypeCharacteristic(c) })
  safeHandle('db:updatePolicyTypeCharacteristic', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updatePolicyTypeCharacteristic(id, updates) })
  safeHandle('db:deletePolicyTypeCharacteristic', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deletePolicyTypeCharacteristic(id) })
  safeHandle('db:reorderPolicyTypeCharacteristics', async (event, ids) => { await requirePermission(event, 'admin:settings'); return db.reorderPolicyTypeCharacteristics(ids) })

  // Policy Type Conditions
  safeHandle('db:getPolicyTypeConditions', (event, policyTypeId) => { requireSession(event); return db.getPolicyTypeConditions(policyTypeId) })
  safeHandle('db:addPolicyTypeCondition', async (event, c) => { await requirePermission(event, 'admin:settings'); return db.addPolicyTypeCondition(c) })
  safeHandle('db:updatePolicyTypeCondition', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updatePolicyTypeCondition(id, updates) })
  safeHandle('db:deletePolicyTypeCondition', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deletePolicyTypeCondition(id) })

  // Vessel Dynamic Policies
  safeHandle('vessels:getDynamicPolicies', (event, vesselId) => { requireSession(event); return db.getVesselDynamicPolicies(vesselId) })
  safeHandle('vessels:getAllDynamicPolicies', (event) => { requireSession(event); return db.getAllVesselDynamicPolicies() })
  safeHandle('policies:getList', (event) => { requireSession(event); return db.getPoliciesList() })
  safeHandle('vessels:addDynamicPolicy', async (event, policy) => {
    const user = await requirePermission(event, 'policies:manage')
    const result = await db.addVesselDynamicPolicy(policy)
    const [vPolRows] = await (db as any).pool.query('SELECT name FROM vessels WHERE id = ?', [policy.vesselId])
    const vPolName = (vPolRows as any[])[0]?.name || policy.vesselId
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Policies',
      entityType: 'policy',
      entityId: result || policy.id,
      entityName: vPolName,
      details: `Created policy for vessel ${vPolName}`
    }).catch(() => {})
    return result
  })
  safeHandle('vessels:updateDynamicPolicy', async (event, id, updates) => { await requirePermission(event, 'policies:manage'); return db.updateVesselDynamicPolicy(id, updates) })
  safeHandle('vessels:deleteDynamicPolicy', async (event, id) => {
    const user = await requirePermission(event, 'policies:manage')
    const [polDelRows] = await (db as any).pool.query(
      'SELECT vdp.id, v.name AS vesselName FROM vessel_dynamic_policies vdp LEFT JOIN vessels v ON vdp.vessel_id = v.id WHERE vdp.id = ?', [id]
    )
    const polVesselName = (polDelRows as any[])[0]?.vesselName || id
    const result = await db.deleteVesselDynamicPolicy(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Policies',
      entityType: 'policy',
      entityId: id,
      entityName: polVesselName,
      details: `Deleted policy for vessel ${polVesselName}`
    }).catch(() => {})
    return result
  })
  safeHandle('vessels:setDynamicPolicyValues', async (event, policyId, values) => { await requirePermission(event, 'policies:manage'); return db.setVesselPolicyValues(policyId, values) })

  // Banks
  safeHandle('bank:getAll', (event) => { requireSession(event); return db.getBanks() })
  safeHandle('bank:add', async (event, name, details) => { await requirePermission(event, 'admin:settings'); return db.addBank(name, details) })
  safeHandle('bank:update', async (event, id, updates) => { await requirePermission(event, 'admin:settings'); return db.updateBank(id, updates) })
  safeHandle('bank:delete', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.deleteBank(id) })
  safeHandle('bank:reorder', async (event, ids) => { await requirePermission(event, 'admin:settings'); return db.reorderBanks(ids) })

  // Commission defaults & overrides
  safeHandle('commission:getDefaults', (event) => { requireSession(event); return db.getCommissionDefaults() })
  safeHandle('commission:setDefault', async (event, policyTypeId, commissionPercent) => { await requirePermission(event, 'admin:settings'); return db.setCommissionDefault(policyTypeId, commissionPercent) })
  safeHandle('commission:getOverrides', (event, entityId) => { requireSession(event); return db.getEntityCommissionOverrides(entityId || undefined) })
  safeHandle('commission:setOverride', async (event, entityId, policyTypeId, commissionPercent) => { await requirePermission(event, 'admin:settings'); return db.setEntityCommissionOverride(entityId, policyTypeId, commissionPercent) })
  safeHandle('commission:deleteOverride', async (event, entityId, policyTypeId) => { await requirePermission(event, 'admin:settings'); return db.deleteEntityCommissionOverride(entityId, policyTypeId) })
  safeHandle('commission:resolve', (event, entityId, policyTypeId) => { requireSession(event); return db.resolveCommission(entityId, policyTypeId) })

  // Policy Document methods
  safeHandle('policy:getById', (event, id) => { requireSession(event); return db.getPolicyDocumentById(id) })
  safeHandle('policy:getInstalments', (event, policyId) => { requireSession(event); return db.getPolicyInstalments(policyId) })
  safeHandle('policy:getAddresses', (event, policyId) => { requireSession(event); return db.getPolicyAddresses(policyId) })
  safeHandle('policy:getBlueCards', (event, policyId) => { requireSession(event); return db.getPolicyBlueCards(policyId) })
  safeHandle('policy:getRevisions', (event, policyNumber) => { requireSession(event); return db.getPolicyRevisions(policyNumber) })
  safeHandle('policy:addBlueCard', async (event, data) => {
    const user = requireSession(event)
    const result = await db.addPolicyBlueCard(data)
    db.logActivity({ userId: user.id, username: user.username, action: 'CREATE', module: 'Policies', entityType: 'blue_card', entityId: data.policyDocumentId, entityName: data.cardType || 'Blue Card', details: `Added ${data.cardType || 'blue card'}${data.policyNumber ? ' for policy ' + data.policyNumber : ''}` }).catch(() => {})
    return result
  })
  safeHandle('policy:updateBlueCard', (event, id, data) => { requireSession(event); return db.updatePolicyBlueCard(id, data) })
  safeHandle('policy:supersedeBlueCard', async (event, id) => {
    const user = requireSession(event)
    const result = await db.supersedePolicyBlueCard(id)
    db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Policies', entityType: 'blue_card', entityId: id, entityName: 'Blue Card', details: 'Superseded blue card' }).catch(() => {})
    return result
  })
  safeHandle('policy:convertFromQuotation', async (event, quotationId, options) => {
    const session = requireSession(event)
    const result = await db.convertQuotationToPolicy(quotationId, { ...options, createdBy: session.id })
    // Notify quotation creator about conversion
    try {
      const [qRows] = await (db as any).pool.query('SELECT created_by, reference_number FROM quotations WHERE id = ?', [quotationId])
      const q = (qRows as any[])[0]
      const refLabel = q?.reference_number || ''
      if (q?.created_by && q.created_by !== session.id) {
        await db.notifyUser(q.created_by, 'policy_created', `Your quotation ${refLabel} has been converted to a policy`, undefined, 'quotation', quotationId)
      }
      // Also notify groups subscribed to policy_created
      db.notifyGroupsForEvent('policy_created', `Quotation ${refLabel} converted to policy`, undefined, 'quotation', quotationId, session.id).catch(() => {})
    } catch (err) { console.error('Policy conversion notification error:', err) }
    return result
  })

  safeHandle('policy:update', async (event, id, fields) => {
    const user = await requirePermission(event, 'policies:manage')
    const result = await db.updatePolicyDocument(id, fields)
    try {
      const changedKeys = Object.keys(fields).filter(k => fields[k] !== undefined)
      const policyLabel = fields.policyNumber || id
      db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Policies', entityType: 'policy_document', entityId: id, entityName: String(policyLabel), details: `Updated policy fields: ${changedKeys.join(', ')}` }).catch(() => {})
    } catch { /* do not block */ }
    return result
  })
  safeHandle('policy:setInstalments', async (event, policyId, instalments) => { await requirePermission(event, 'policies:manage'); return db.setPolicyInstalments(policyId, instalments) })
  safeHandle('policy:setAddresses', async (event, policyId, addresses) => { await requirePermission(event, 'policies:manage'); return db.setPolicyAddresses(policyId, addresses) })
  safeHandle('policy:createRevision', async (event, policyId) => { const session = requireSession(event); await requirePermission(event, 'policies:manage'); return db.createPolicyRevision(policyId, session.id) })
  safeHandle('policy:delete', async (event, id) => { await requirePermission(event, 'policies:manage'); return db.deletePolicyDocument(id) })

  safeHandle('policy:findActiveForVessel', async (event, vesselId: string, quotationTypeCode: string) => {
    requireSession(event)
    return db.findActivePolicyDocForVessel(vesselId, quotationTypeCode)
  })

  safeHandle('policy:renew', async (event, policyId: string) => {
    const user = await requirePermission(event, 'quotations:create')
    const quotationId = await db.renewPolicy(policyId, user.id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'RENEW',
      module: 'Policies',
      details: `Created renewal quotation from policy ${policyId}`
    })
    // Resolve policy number for notification
    let policyNumber = policyId
    try {
      const [pnRows] = await (db as any).pool.query('SELECT policy_number FROM policy_documents WHERE id = ?', [policyId]) as any[]
      if (pnRows.length > 0 && pnRows[0].policy_number) policyNumber = pnRows[0].policy_number
    } catch { /* use policyId */ }
    db.notifyGroupsForEvent('policy_renewed', `Policy ${policyNumber} renewed`, 'A renewal quotation has been created', 'policy', policyId, user.id).catch(() => {})
    return { quotationId }
  })

  safeHandle('policy:renewFleet', async (event, vesselIds: string[], quotationTypeCode: string) => {
    const user = await requirePermission(event, 'quotations:create')
    const quotationId = await db.renewFleetPolicies(vesselIds, quotationTypeCode, user.id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'RENEW',
      module: 'Policies',
      details: `Created fleet renewal quotation for ${vesselIds.length} vessels`
    })
    return { quotationId }
  })

  // ── Signatures ─────────────────────────────────────────────
  safeHandle('signature:get', async (event) => {
    const user = requireSession(event)
    return db.getUserSignature(user.id)
  })
  safeHandle('signature:getForUser', async (event, userId: string) => {
    requireSession(event)
    const sig = await db.getUserSignature(userId)
    if (sig && sig.imageData) {
      return { ...sig, imageData: Array.from(Buffer.isBuffer(sig.imageData) ? sig.imageData : Buffer.from(sig.imageData)) }
    }
    return sig
  })
  safeHandle('signature:upload', async (event, imageData: number[], fileName: string) => {
    const user = await requirePermission(event, 'policies:sign')
    const buf = Buffer.from(imageData)
    return db.uploadUserSignature(user.id, buf, fileName)
  })
  safeHandle('signature:uploadForUser', async (event, userId: string, filePath: string) => {
    await requirePermission(event, 'admin:settings')
    if (!filePath || !existsSync(filePath)) throw new Error('File not found')
    const buf = readFileSync(filePath)
    const fileName = basename(filePath)
    return db.uploadUserSignature(userId, buf, fileName)
  })
  safeHandle('signature:delete', async (event) => {
    const user = await requirePermission(event, 'policies:sign')
    return db.deleteUserSignature(user.id)
  })
  safeHandle('signature:deleteForUser', async (event, userId: string) => {
    await requirePermission(event, 'admin:users')
    return db.deleteUserSignature(userId)
  })
  safeHandle('signature:getAll', async (event) => {
    requireSession(event)
    return db.getAllUserSignatures()
  })
  safeHandle('policy:sign', async (event, policyId: string) => {
    const user = await requirePermission(event, 'policies:sign')
    // Verify user has a signature uploaded
    const sig = await db.getUserSignature(user.id)
    if (!sig) throw new Error('No signature uploaded. Please upload your signature first.')
    await db.signPolicy(policyId, user.id)
    // Assign real policy number if still a draft number
    let policyNumber = policyId
    try {
      policyNumber = await db.assignPolicyNumber(policyId)
    } catch (e) { console.error('Failed to assign policy number:', e) }
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'SIGN',
      module: 'Policies',
      entityType: 'policy',
      entityId: policyId,
      details: `Signed policy ${policyNumber}`
    }).catch(() => {})
    return { success: true, policyNumber }
  })
  safeHandle('policy:getSignature', async (event, policyId: string) => {
    requireSession(event)
    const sig = await db.getPolicySignature(policyId)
    if (sig && sig.imageData) {
      return { ...sig, imageData: Array.from(Buffer.isBuffer(sig.imageData) ? sig.imageData : Buffer.from(sig.imageData)) }
    }
    return sig
  })

  // Policy Expiry Alerts
  safeHandle('policies:getExpiredActive', (event) => { requireSession(event); return db.getExpiredActivePolicies() })
  safeHandle('policies:getExpiringSoon', (event, days?: number) => { requireSession(event); return db.getExpiringSoonPolicies(days || 90) })
  safeHandle('policies:getRenewalsByMonth', (event, year: number, month: number) => { requireSession(event); return db.getPolicyRenewalsByMonth(year, month) })
  safeHandle('policies:setQuotationSentDate', async (event, policyId: string, date: string | null) => { await requirePermission(event, 'policies:manage'); return db.setQuotationSentDate(policyId, date) })
  safeHandle('renewals:getPipeline', (event, dateFrom: string, dateTo: string) => { requireSession(event); return db.getRenewalPipeline(dateFrom, dateTo) })

  // Renewal Status Types
  safeHandle('renewalStates:getAll', (event) => { requireSession(event); return db.getRenewalStatusTypes() })
  safeHandle('renewalStates:add', async (event, name: string, color: string) => {
    const user = await requirePermission(event, 'renewals:manage')
    const result = await db.addRenewalStatusType(name, color)
    db.logActivity({ userId: user.id, username: user.username, action: 'CREATE', module: 'Renewals', entityType: 'renewal_status', entityName: name, details: `Created renewal status "${name}"` }).catch(() => {})
    return result
  })
  safeHandle('renewalStates:update', async (event, id: string, name: string, color: string) => {
    const user = await requirePermission(event, 'renewals:manage')
    const result = await db.updateRenewalStatusType(id, name, color)
    db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Renewals', entityType: 'renewal_status', entityName: name, details: `Updated renewal status "${name}"` }).catch(() => {})
    return result
  })
  safeHandle('renewalStates:delete', async (event, id: string) => {
    const user = await requirePermission(event, 'renewals:manage')
    const result = await db.deleteRenewalStatusType(id)
    db.logActivity({ userId: user.id, username: user.username, action: 'DELETE', module: 'Renewals', entityType: 'renewal_status', entityId: id, details: 'Deleted renewal status' }).catch(() => {})
    return result
  })
  safeHandle('renewalStates:setForPolicy', async (event, policyId: string, statusId: string | null) => {
    const user = await requirePermission(event, 'renewals:manage')
    // Resolve policy number and status name
    let policyNumber = policyId
    let statusName = statusId ? 'changed' : 'cleared'
    try {
      const [pRows] = await db.pool!.query('SELECT policy_number FROM vessel_dynamic_policies WHERE id = ?', [policyId]) as any[]
      if (pRows.length > 0) policyNumber = pRows[0].policy_number || policyId
      if (statusId) {
        const [sRows] = await db.pool!.query('SELECT name FROM renewal_status_types WHERE id = ?', [statusId]) as any[]
        if (sRows.length > 0) statusName = sRows[0].name
      }
    } catch { /* use defaults */ }
    const result = await db.setRenewalStatusForPolicy(policyId, statusId)
    db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Renewals', entityType: 'policy', entityName: policyNumber, details: `Set renewal status to "${statusName}" for ${policyNumber}` }).catch(() => {})
    return result
  })

  // Policy Renewal Notes
  safeHandle('renewalNotes:get', (event, policyId: string, policyNumber: string) => { requireSession(event); return db.getPolicyRenewalNotes(policyId, policyNumber) })
  safeHandle('renewalNotes:add', async (event, policyId: string, policyNumber: string, note: string) => {
    const user = await requirePermission(event, 'renewals:notes')
    const result = await db.addPolicyRenewalNote(policyId, policyNumber, note, user.id, user.username)
    db.logActivity({ userId: user.id, username: user.username, action: 'CREATE', module: 'Renewals', entityType: 'renewal_note', entityName: policyNumber, details: `Added note on ${policyNumber}: ${note.substring(0, 100)}${note.length > 100 ? '...' : ''}` }).catch(() => {})
    return result
  })
  safeHandle('renewalNotes:delete', async (event, noteId: string) => {
    const user = await requirePermission(event, 'renewals:notes')
    const result = await db.deletePolicyRenewalNote(noteId, user.id)
    db.logActivity({ userId: user.id, username: user.username, action: 'DELETE', module: 'Renewals', entityType: 'renewal_note', entityId: noteId, details: 'Deleted renewal note' }).catch(() => {})
    return result
  })

  // Vessel Notes
  safeHandle('vesselNotes:get', (event, vesselId: string) => { requireSession(event); return db.getVesselNotes(vesselId) })
  safeHandle('vesselNotes:add', async (event, vesselId: string, note: string, parentNoteId?: string) => {
    const user = await requirePermission(event, 'vessels:edit')
    return db.addVesselNote(vesselId, note, user.id, user.username, parentNoteId)
  })
  safeHandle('vesselNotes:delete', async (event, noteId: string) => {
    const user = await requirePermission(event, 'vessels:edit')
    return db.deleteVesselNote(noteId, user.id)
  })

  // Quotation Types
  safeHandle('db:getQuotationTypes', (event) => { requireSession(event); return db.getQuotationTypes() })
  safeHandle('db:addQuotationType', async (event, data) => { await requirePermission(event, 'quotations:settings'); return db.addQuotationType(data) })
  safeHandle('db:updateQuotationType', async (event, id, updates) => { await requirePermission(event, 'quotations:settings'); return db.updateQuotationType(id, updates) })
  safeHandle('db:deleteQuotationType', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deleteQuotationType(id) })
  safeHandle('db:reorderQuotationTypes', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderQuotationTypes(ids) })

  // Quotations
  safeHandle('db:getQuotations', (event) => { requireSession(event); return db.getQuotations() })
  safeHandle('vessel:getQuotations', (event, vesselId: string) => { requireSession(event); return db.getQuotationsForVessel(vesselId) })
  safeHandle('quotation:getPaginated', (event, params) => { requireSession(event); return db.getQuotationsPaginated(params) })
  safeHandle('quotation:getCreators', (event) => { requireSession(event); return db.getQuotationCreators() })
  safeHandle('quotation:getSavedFilters', (event) => { const user = requireSession(event); return db.getQuotationSavedFilters(user.id) })
  safeHandle('quotation:saveFilter', (event, name: string, filters: any) => { const user = requireSession(event); return db.saveQuotationFilter(user.id, name, filters) })
  safeHandle('quotation:deleteFilter', (event, id: string) => { requireSession(event); return db.deleteQuotationSavedFilter(id) })
  safeHandle('quotation:getFavorites', (event) => { const user = requireSession(event); return db.getQuotationFavorites(user.id) })
  safeHandle('quotation:toggleFavorite', (event, quotationId: string) => { const user = requireSession(event); return db.toggleQuotationFavorite(user.id, quotationId) })
  safeHandle('quotation:bulkDelete', async (event, ids: string[]) => {
    await requirePermission(event, 'quotations:bulkDelete')
    return db.bulkDeleteQuotations(ids)
  })

  // Quotation Groups
  safeHandle('quotationGroup:getAll', (event) => { const user = requireSession(event); return db.getQuotationGroups(user.id) })
  safeHandle('quotationGroup:add', async (event, name: string, userId: string | null, color?: string) => {
    await requirePermission(event, 'quotations:edit')
    return db.addQuotationGroup(name, userId, color)
  })
  safeHandle('quotationGroup:update', async (event, id: string, updates: { name?: string; color?: string }) => {
    await requirePermission(event, 'quotations:edit')
    return db.updateQuotationGroup(id, updates)
  })
  safeHandle('quotationGroup:delete', async (event, id: string) => {
    await requirePermission(event, 'quotations:edit')
    return db.deleteQuotationTagGroup(id)
  })
  safeHandle('quotationGroup:getMembers', (event, groupId: string) => { requireSession(event); return db.getQuotationGroupMembers(groupId) })
  safeHandle('quotationGroup:addMember', async (event, groupId: string, quotationId: string) => {
    await requirePermission(event, 'quotations:edit')
    return db.addQuotationToGroup(groupId, quotationId)
  })
  safeHandle('quotationGroup:removeMember', async (event, groupId: string, quotationId: string) => {
    await requirePermission(event, 'quotations:edit')
    return db.removeQuotationFromGroup(groupId, quotationId)
  })
  safeHandle('quotationGroup:bulkAdd', async (event, groupId: string, quotationIds: string[]) => {
    await requirePermission(event, 'quotations:edit')
    return db.bulkAddQuotationsToGroup(groupId, quotationIds)
  })

  safeHandle('db:getQuotation', (event, id) => { requireSession(event); return db.getQuotation(id) })
  safeHandle('quotation:lock', async (event, id) => { const user = requireSession(event); return db.lockQuotation(id, user.id) })
  safeHandle('quotation:unlock', async (event, id) => { const user = requireSession(event); return db.unlockQuotation(id, user.id) })
  safeHandle('quotation:heartbeat', async (event, id) => { const user = requireSession(event); return db.quotationHeartbeat(id, user.id) })
  safeHandle('quotation:forceUnlock', async (event, id) => { await requirePermission(event, 'admin:settings'); return db.forceUnlockQuotation(id) })
  safeHandle('quotation:getLock', (event, id) => { requireSession(event); return db.getQuotationLock(id) })
  safeHandle('db:addQuotation', async (event, q) => {
    const user = await requirePermission(event, 'quotations:create')
    const result = await db.addQuotation(q)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Quotations',
      entityType: 'quotation',
      entityId: result?.id || q.id,
      entityName: q.reference,
      details: `Created quotation ${q.reference || ''}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:updateQuotation', async (event, id, updates) => {
    await requirePermission(event, 'quotations:edit')
    return db.updateQuotation(id, updates)
  })
  safeHandle('db:deleteQuotation', async (event, id) => {
    const user = await requirePermission(event, 'quotations:delete')
    const existing = await db.getQuotation(id)
    const ref = existing?.referenceNumber || id
    const result = await db.deleteQuotation(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Quotations',
      entityType: 'quotation',
      entityId: id,
      entityName: ref,
      details: `Deleted quotation ${ref}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:getQuotationRevisionCount', async (event, revisionGroupId) => {
    requireSession(event)
    return db.getQuotationRevisionCount(revisionGroupId)
  })
  safeHandle('db:deleteQuotationGroup', async (event, revisionGroupId) => {
    const user = await requirePermission(event, 'quotations:delete')
    const result = await db.deleteQuotationGroup(revisionGroupId)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Quotations',
      entityType: 'quotation',
      entityId: revisionGroupId,
      entityName: revisionGroupId,
      details: `Deleted all revisions in group ${revisionGroupId}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:createQuotationRevision', async (event, sourceId) => {
    const user = await requirePermission(event, 'quotations:create')
    const source = await db.getQuotation(sourceId)
    const sourceRef = source?.referenceNumber || sourceId
    const result = await db.createQuotationRevision(sourceId)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE_REVISION',
      module: 'Quotations',
      entityType: 'quotation',
      entityId: sourceId,
      entityName: sourceRef,
      details: `Created revision of quotation ${sourceRef}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:stripNonSelectedAlternative', async (event, quotationId, keepAlternativeId) => {
    await requirePermission(event, 'quotations:edit')
    return db.stripNonSelectedAlternative(quotationId, keepAlternativeId)
  })
  safeHandle('db:duplicateQuotation', async (event, sourceId) => {
    const user = await requirePermission(event, 'quotations:create')
    const source = await db.getQuotation(sourceId)
    const sourceRef = source?.referenceNumber || sourceId
    const result = await db.duplicateQuotation(sourceId)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DUPLICATE',
      module: 'Quotations',
      entityType: 'quotation',
      entityId: sourceId,
      entityName: sourceRef,
      details: `Duplicated quotation ${sourceRef}`
    }).catch(() => {})
    return result
  })
  safeHandle('db:getQuotationRevisions', (event, revisionGroupId) => { requireSession(event); return db.getQuotationRevisions(revisionGroupId) })
  safeHandle('db:saveExportSnapshot', async (event, quotationId, snapshot) => { await requirePermission(event, 'quotations:export'); return db.saveExportSnapshot(quotationId, snapshot) })
  safeHandle('db:clearExportSnapshot', async (event, quotationId) => { await requirePermission(event, 'quotations:export'); return db.clearExportSnapshot(quotationId) })

  // Quotation Sub-Tables
  safeHandle('db:getQuotationAssureds', (event, qId) => { requireSession(event); return db.getQuotationAssureds(qId) })
  safeHandle('db:addQuotationAssured', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationAssured(data) })
  safeHandle('db:updateQuotationAssured', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationAssured(id, updates) })
  safeHandle('db:deleteQuotationAssured', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationAssured(id) })
  safeHandle('db:reorderQuotationAssureds', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationAssureds(ids) })

  // Quotation Assured Groups
  safeHandle('db:getQuotationAssuredGroups', (event, qId) => { requireSession(event); return db.getQuotationAssuredGroups(qId) })
  safeHandle('db:addQuotationAssuredGroup', async (event, qId, name) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationAssuredGroup(qId, name) })
  safeHandle('db:updateQuotationAssuredGroup', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationAssuredGroup(id, updates) })
  safeHandle('db:deleteQuotationAssuredGroup', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationAssuredGroup(id) })
  safeHandle('db:reorderQuotationAssuredGroups', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationAssuredGroups(ids) })

  safeHandle('db:getQuotationVessels', (event, qId) => { requireSession(event); return db.getQuotationVessels(qId) })
  safeHandle('db:addQuotationVessel', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationVessel(data) })
  safeHandle('db:updateQuotationVessel', async (event, id, data) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationVessel(id, data) })
  safeHandle('db:deleteQuotationVessel', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationVessel(id) })
  safeHandle('db:reorderQuotationVessels', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationVessels(ids) })

  safeHandle('db:getQuotationNewVessel', (event, qId) => { requireSession(event); return db.getQuotationNewVessel(qId) })
  safeHandle('db:upsertQuotationNewVessel', async (event, qId, data) => { await requirePermission(event, 'quotations:edit'); return db.upsertQuotationNewVessel(qId, data) })
  safeHandle('db:deleteQuotationNewVessel', async (event, qId) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationNewVessel(qId) })

  safeHandle('db:getQuotationSubLimits', (event, qId) => { requireSession(event); return db.getQuotationSubLimits(qId) })
  safeHandle('db:addQuotationSubLimit', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationSubLimit(data) })
  safeHandle('db:updateQuotationSubLimit', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationSubLimit(id, updates) })
  safeHandle('db:deleteQuotationSubLimit', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationSubLimit(id) })

  safeHandle('db:getQuotationClauses', (event, qId) => { requireSession(event); return db.getQuotationClauses(qId) })
  safeHandle('db:setQuotationClauses', async (event, qId, ids, overrides) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationClauses(qId, ids, overrides) })
  safeHandle('db:addQuotationClause', async (event, qId, piClauseId, alternativeId) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationClause(qId, piClauseId, alternativeId) })
  safeHandle('db:deleteQuotationClause', async (event, qId, piClauseId, alternativeId) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationClause(qId, piClauseId, alternativeId) })
  safeHandle('db:getQuotationClauseOverrides', (event, qId) => { requireSession(event); return db.getQuotationClauseOverrides(qId) })
  safeHandle('db:updateQuotationClauseOverride', async (event, qId, clauseId, override, alternativeId) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationClauseOverride(qId, clauseId, override, alternativeId) })

  safeHandle('db:getQuotationAdditionalClauses', (event, qId) => { requireSession(event); return db.getQuotationAdditionalClauses(qId) })
  safeHandle('db:addQuotationAdditionalClause', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationAdditionalClause(data) })
  safeHandle('db:deleteQuotationAdditionalClause', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationAdditionalClause(id) })

  safeHandle('db:getQuotationWarranties', (event, qId) => { requireSession(event); return db.getQuotationWarranties(qId) })
  safeHandle('db:setQuotationWarranties', async (event, qId, ids) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationWarranties(qId, ids) })
  safeHandle('db:updateQuotationWarrantyVesselScope', async (event, qId, piWarrantyId, vesselScope) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationWarrantyVesselScope(qId, piWarrantyId, vesselScope) })
  safeHandle('db:updateQuotationClauseVesselScope', async (event, qId, piClauseId, vesselScope) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationClauseVesselScope(qId, piClauseId, vesselScope) })

  safeHandle('db:getQuotationCustomWarranties', (event, qId) => { requireSession(event); return db.getQuotationCustomWarranties(qId) })
  safeHandle('db:addQuotationCustomWarranty', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationCustomWarranty(data) })
  safeHandle('db:updateQuotationCustomWarranty', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationCustomWarranty(id, updates) })
  safeHandle('db:deleteQuotationCustomWarranty', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationCustomWarranty(id) })
  safeHandle('db:reorderQuotationCustomWarranties', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationCustomWarranties(ids) })

  safeHandle('db:getQuotationDeductibles', (event, qId) => { requireSession(event); return db.getQuotationDeductibles(qId) })
  safeHandle('db:addQuotationDeductible', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationDeductible(data) })
  safeHandle('db:updateQuotationDeductible', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationDeductible(id, updates) })
  safeHandle('db:deleteQuotationDeductible', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationDeductible(id) })
  safeHandle('db:reorderQuotationDeductibles', async (event, orderedIds) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationDeductibles(orderedIds) })

  safeHandle('db:getQuotationTextDeductibles', (event, qId) => { requireSession(event); return db.getQuotationTextDeductibles(qId) })
  safeHandle('db:addQuotationTextDeductible', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationTextDeductible(data) })
  safeHandle('db:updateQuotationTextDeductible', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationTextDeductible(id, updates) })
  safeHandle('db:deleteQuotationTextDeductible', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationTextDeductible(id) })
  safeHandle('db:reorderQuotationTextDeductibles', async (event, orderedIds) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationTextDeductibles(orderedIds) })

  safeHandle('db:getQuotationExclusions', (event, qId) => { requireSession(event); return db.getQuotationExclusions(qId) })
  safeHandle('db:setQuotationExclusions', async (event, qId, items) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationExclusions(qId, items) })
  safeHandle('db:addQuotationExclusion', async (event, qId, piExclusionId, altId) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationExclusion(qId, piExclusionId, altId) })
  safeHandle('db:deleteQuotationExclusion', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationExclusion(id) })
  safeHandle('db:reorderQuotationExclusions', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationExclusions(ids) })
  safeHandle('db:getQuotationCustomExclusions', (event, qId) => { requireSession(event); return db.getQuotationCustomExclusions(qId) })
  safeHandle('db:addQuotationCustomExclusion', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationCustomExclusion(data) })
  safeHandle('db:updateQuotationCustomExclusion', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationCustomExclusion(id, updates) })
  safeHandle('db:deleteQuotationCustomExclusion', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationCustomExclusion(id) })
  safeHandle('db:reorderQuotationCustomExclusions', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationCustomExclusions(ids) })

  safeHandle('db:updateQuotationItemVesselScope', async (event, table, id, vesselScope) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationItemVesselScope(table, id, vesselScope) })

  safeHandle('db:getQuotationCustomSections', (event, qId) => { requireSession(event); return db.getQuotationCustomSections(qId) })
  safeHandle('db:addQuotationCustomSection', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationCustomSection(data) })
  safeHandle('db:updateQuotationCustomSection', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationCustomSection(id, updates) })
  safeHandle('db:deleteQuotationCustomSection', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationCustomSection(id) })
  safeHandle('db:reorderQuotationCustomSections', async (event, ids) => { await requirePermission(event, 'quotations:edit'); return db.reorderQuotationCustomSections(ids) })
  safeHandle('pi:getSectionOrderDefaults', (event) => { requireSession(event); return db.getSectionOrderDefaults() })
  safeHandle('pi:setSectionOrderDefaults', async (event, order) => { await requirePermission(event, 'quotations:settings'); return db.setSectionOrderDefaults(order) })
  safeHandle('pi:getSectionOrderDefaultsByType', (event, typeCode) => { requireSession(event); return db.getSectionOrderDefaultsByType(typeCode) })
  safeHandle('pi:setSectionOrderDefaultsByType', async (event, typeCode, order) => { await requirePermission(event, 'quotations:settings'); return db.setSectionOrderDefaultsByType(typeCode, order) })

  safeHandle('db:getQuotationExcludedCountries', (event, qId) => { requireSession(event); return db.getQuotationExcludedCountries(qId) })
  safeHandle('db:setQuotationExcludedCountries', async (event, qId, countries) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationExcludedCountries(qId, countries) })

  safeHandle('db:getPISubjectivities', (event) => { requireSession(event); return db.getPISubjectivities() })
  safeHandle('db:addPISubjectivity', async (event, data) => { await requirePermission(event, 'quotations:settings'); return db.addPISubjectivity(data) })
  safeHandle('db:updatePISubjectivity', async (event, id, data) => { await requirePermission(event, 'quotations:settings'); return db.updatePISubjectivity(id, data) })
  safeHandle('db:deletePISubjectivity', async (event, id) => { await requirePermission(event, 'quotations:settings'); return db.deletePISubjectivity(id) })
  safeHandle('db:reorderPISubjectivities', async (event, ids) => { await requirePermission(event, 'quotations:settings'); return db.reorderPISubjectivities(ids) })

  safeHandle('db:getQuotationSubjectivities', (event, qId) => { requireSession(event); return db.getQuotationSubjectivities(qId) })
  safeHandle('db:addQuotationSubjectivity', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationSubjectivity(data) })
  safeHandle('db:updateQuotationSubjectivity', async (event, id, data) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationSubjectivity(id, data) })
  safeHandle('db:deleteQuotationSubjectivity', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationSubjectivity(id) })

  safeHandle('db:getQuotationInstalments', (event, qId) => { requireSession(event); return db.getQuotationInstalments(qId) })
  safeHandle('db:setQuotationInstalments', async (event, qId, instalments) => { await requirePermission(event, 'quotations:edit'); return db.setQuotationInstalments(qId, instalments) })

  safeHandle('db:getQuotationInformation', (event, qId) => { requireSession(event); return db.getQuotationInformation(qId) })
  safeHandle('db:addQuotationInformation', async (event, data) => { await requirePermission(event, 'quotations:edit'); return db.addQuotationInformation(data) })
  safeHandle('db:deleteQuotationInformation', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationInformation(id) })

  safeHandle('db:getQuotationNotes', (event, qId) => { requireSession(event); return db.getQuotationNotes(qId) })
  safeHandle('db:addQuotationNote', async (event, data) => {
    const user = await requirePermission(event, 'quotations:edit')
    const noteData = { ...data, authorUserId: user.id, authorUsername: user.username }
    const result = await db.addQuotationNote(noteData)
    // Handle reply notifications
    if (data.parentNoteId) {
      try {
        const allNotes = await db.getQuotationNotes(data.quotationId)
        const parentNote = allNotes.find((n: any) => n.id === data.parentNoteId)
        const notifiedUserIds = new Set<string>()
        // Notify the parent note author
        if (parentNote?.authorUserId && parentNote.authorUserId !== user.id) {
          await db.notifyUser(parentNote.authorUserId, 'note_reply', `${user.username} replied to your note`, data.content || data.title, 'quotation', data.quotationId)
          notifiedUserIds.add(parentNote.authorUserId)
        }
        // Notify other thread participants
        const threadReplies = allNotes.filter((n: any) => n.parentNoteId === data.parentNoteId && n.authorUserId && n.authorUserId !== user.id && !notifiedUserIds.has(n.authorUserId))
        for (const reply of threadReplies) {
          if (!notifiedUserIds.has(reply.authorUserId)) {
            await db.notifyUser(reply.authorUserId, 'note_reply', `${user.username} replied in a thread you participated in`, data.content || data.title, 'quotation', data.quotationId)
            notifiedUserIds.add(reply.authorUserId)
          }
        }
      } catch (err) { console.error('Reply notification error:', err) }
    }
    // Handle @mention notifications
    const text = (data.content || '') + ' ' + (data.title || '')
    const mentionMatches = text.match(/@(\w+)/g)
    if (mentionMatches) {
      try {
        const usernames = [...new Set(mentionMatches.map((m: string) => m.slice(1)))]
        const mentionedUsers = await db.getUsersByUsername(usernames)
        for (const mu of mentionedUsers) {
          if (mu.id !== user.id) {
            await db.notifyUser(mu.id, 'note_mention', `${user.username} mentioned you in a note`, data.content || data.title, 'quotation', data.quotationId)
          }
        }
      } catch (err) { console.error('Mention notification error:', err) }
    }
    return result
  })
  safeHandle('db:updateQuotationNote', async (event, id, updates) => { await requirePermission(event, 'quotations:edit'); return db.updateQuotationNote(id, updates) })
  safeHandle('db:deleteQuotationNote', async (event, id) => { await requirePermission(event, 'quotations:edit'); return db.deleteQuotationNote(id) })

  // Report Settings
  const REPORT_SETTINGS_KEY = 'reportSettings'
  const REPORT_SETTINGS_DEFAULTS = {
    companyName: 'Al Bahriah Insurance & Reinsurance SAL',
    companySubtitle: '',
    footerText: 'Al Bahriah Insurance & Reinsurance SAL — Confidential',
    primaryColor: [28, 52, 95],
    currency: 'USD',
    showReserves: true,
    showClaimSubtotals: true,
  }
  safeHandle('reportSettings:get', async (event) => {
    requireSession(event)
    const raw = await db.getSetting(REPORT_SETTINGS_KEY)
    return raw ? { ...REPORT_SETTINGS_DEFAULTS, ...JSON.parse(raw) } : REPORT_SETTINGS_DEFAULTS
  })
  safeHandle('reportSettings:set', async (event, settings) => {
    const user = await requirePermission(event, 'admin:settings')
    await db.setSetting(REPORT_SETTINGS_KEY, JSON.stringify(settings))
    db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Settings', entityType: 'report_settings', entityName: 'Report Settings', details: `Updated report settings${settings.companyName ? ': company "' + settings.companyName + '"' : ''}` }).catch(() => {})
  })

  // Generic settings get/set
  safeHandle('settings:get', (event, key) => { requireSession(event); return db.getSetting(key) })
  safeHandle('settings:set', async (event, key, value) => { await requirePermission(event, 'admin:settings'); return db.setSetting(key, value) })

  safeHandle('settings:getUserSectionAccess', async (event) => {
    requireSession(event)
    const raw = await db.getSetting('userSectionAccess')
    return raw ? JSON.parse(raw) : []
  })

  safeHandle('settings:setUserSectionAccess', async (event, sectionIds: string[]) => {
    await requirePermission(event, 'admin:settings')
    await db.setSetting('userSectionAccess', JSON.stringify(sectionIds))
  })

  // Generic file save (for exports that need save dialog in Electron)
  safeHandle('file:saveDocx', async (_event, data: number[], defaultName: string) => {
    const { dialog } = require('electron')
    const result = await dialog.showSaveDialog({
      title: 'Save Document',
      defaultPath: defaultName,
      filters: [{ name: 'Word Documents', extensions: ['docx'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }
    writeFileSync(result.filePath, Buffer.from(data))
    return { success: true, filePath: result.filePath }
  })

  // Database Backup & Restore
  safeHandle('db:backup', async (event) => {
    const user = await requirePermission(event, 'admin:backup')
    const { dialog } = require('electron')
    const result = await dialog.showSaveDialog({
      title: 'Save Database Backup',
      defaultPath: `vessel-compliance-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, message: 'Cancelled' }

    const backup = await db.backupDatabase()
    writeFileSync(result.filePath, JSON.stringify(backup, null, 2), 'utf-8')
    await db.setSetting('lastBackupDate', new Date().toISOString())
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'EXPORT',
      module: 'System',
      details: `Database backup exported to ${result.filePath}`
    }).catch(() => {})
    return { success: true, filePath: result.filePath }
  })

  safeHandle('db:restore', async (event) => {
    const user = await requirePermission(event, 'admin:backup')
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      title: 'Select Backup File to Restore',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths[0]) return { success: false, message: 'Cancelled' }

    const filePath = result.filePaths[0]
    const raw = readFileSync(filePath, 'utf-8')
    let data: any
    try {
      data = JSON.parse(raw)
    } catch {
      return { success: false, message: 'Invalid JSON file' }
    }

    if (!data.tables || typeof data.tables !== 'object') {
      return { success: false, message: 'Invalid backup format: missing tables' }
    }

    await db.restoreDatabase(data)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'RESTORE',
      module: 'System',
      details: `Database restored from ${filePath}`
    }).catch(() => {})
    return { success: true }
  })

  safeHandle('db:getLastBackupDate', async (event) => {
    requireSession(event)
    return db.getSetting('lastBackupDate')
  })

  // Activity Log
  safeHandle('activity:getLog', async (event, filters) => {
    await requirePermission(event, 'admin:activityLog')
    return await db.getActivityLog(filters || {})
  })

  safeHandle('activity:log', async (event, entry) => {
    const user = requireSession(event)
    return await db.logActivity({ ...entry, userId: user.id, username: user.username })
  })

  safeHandle('activity:getDistinctModules', async (event) => {
    requireSession(event)
    return await db.getActivityLogDistinctModules()
  })

  safeHandle('activity:getDistinctActions', async (event) => {
    requireSession(event)
    return await db.getActivityLogDistinctActions()
  })

  safeHandle('activity:getDistinctUsers', async (event) => {
    requireSession(event)
    return await db.getActivityLogDistinctUsers()
  })

  safeHandle('activity:getRetention', async (event) => {
    await requirePermission(event, 'admin:settings')
    return await db.getActivityLogRetention()
  })

  safeHandle('activity:setRetention', async (event, days: number) => {
    await requirePermission(event, 'admin:settings')
    await db.setActivityLogRetention(days)
    if (days > 0) {
      const deleted = await db.cleanupActivityLog(days)
      return { deleted }
    }
    return { deleted: 0 }
  })

  safeHandle('activity:cleanup', async (event) => {
    await requirePermission(event, 'admin:settings')
    const retention = await db.getActivityLogRetention()
    if (retention > 0) {
      const deleted = await db.cleanupActivityLog(retention)
      return { deleted }
    }
    return { deleted: 0 }
  })

  safeHandle('activity:getCount', async (event) => {
    requireSession(event)
    return await db.getActivityLogCount()
  })

  // Email Templates
  safeHandle('email:getTemplates', async (event, category?: string) => {
    requireSession(event)
    return db.getEmailTemplates(category || undefined)
  })

  safeHandle('email:addTemplate', async (event, template) => {
    const user = await requirePermission(event, 'email:manage')
    const result = await db.addEmailTemplate({ ...template, createdBy: user.id })
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'CREATE',
      module: 'Email',
      entityType: 'email_template',
      entityName: template.name,
      details: `Created email template ${template.name}`
    }).catch(() => {})
    return result
  })

  safeHandle('email:updateTemplate', async (event, id: string, updates) => {
    const user = await requirePermission(event, 'email:manage')
    const result = await db.updateEmailTemplate(id, updates)
    const templateName = updates.name || id
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'UPDATE',
      module: 'Email',
      entityType: 'email_template',
      entityId: id,
      entityName: templateName,
      details: `Updated email template ${templateName}`
    }).catch(() => {})
    return result
  })

  safeHandle('email:deleteTemplate', async (event, id: string) => {
    const user = await requirePermission(event, 'email:manage')
    const [tmplRows] = await (db as any).pool.query('SELECT name FROM email_templates WHERE id = ?', [id])
    const templateName = (tmplRows as any[])[0]?.name || id
    const result = await db.deleteEmailTemplate(id)
    db.logActivity({
      userId: user.id,
      username: user.username,
      action: 'DELETE',
      module: 'Email',
      entityType: 'email_template',
      entityId: id,
      entityName: templateName,
      details: `Deleted email template ${templateName}`
    }).catch(() => {})
    return result
  })

  safeHandle('email:reorderTemplates', async (event, orderedIds: string[]) => {
    await requirePermission(event, 'email:manage')
    return db.reorderEmailTemplates(orderedIds)
  })

  // ── Workflow Steps & Transitions ──
  safeHandle('workflow:getSteps', async (event) => {
    requireSession(event)
    return db.getWorkflowSteps()
  })

  safeHandle('workflow:addStep', async (event, step) => {
    await requirePermission(event, 'admin:settings')
    return db.addWorkflowStep(step)
  })

  safeHandle('workflow:updateStep', async (event, id: string, updates) => {
    await requirePermission(event, 'admin:settings')
    return db.updateWorkflowStep(id, updates)
  })

  safeHandle('workflow:deleteStep', async (event, id: string) => {
    await requirePermission(event, 'admin:settings')
    return db.deleteWorkflowStep(id)
  })

  safeHandle('workflow:reorderSteps', async (event, orderedIds: string[]) => {
    await requirePermission(event, 'admin:settings')
    return db.reorderWorkflowSteps(orderedIds)
  })

  safeHandle('workflow:getTransitions', async (event) => {
    requireSession(event)
    return db.getWorkflowTransitions()
  })

  safeHandle('workflow:addTransition', async (event, t) => {
    await requirePermission(event, 'admin:settings')
    return db.addWorkflowTransition(t)
  })

  safeHandle('workflow:updateTransition', async (event, id: string, updates) => {
    await requirePermission(event, 'admin:settings')
    return db.updateWorkflowTransition(id, updates)
  })

  safeHandle('workflow:deleteTransition', async (event, id: string) => {
    await requirePermission(event, 'admin:settings')
    return db.deleteWorkflowTransition(id)
  })

  safeHandle('workflow:moveQuotation', async (event, quotationId: string, toStepId: string, comment?: string) => {
    const user = requireSession(event)
    // Get current step
    const transitions = await db.getWorkflowTransitions()
    const [qRows] = await (db as any).pool.query('SELECT workflow_step_id FROM quotations WHERE id = ?', [quotationId])
    const currentStepId = (qRows as any[])[0]?.workflow_step_id
    // Find valid path (BFS)
    const userPerms = await db.resolveUserPermissions(user.id)
    const reachable = await db.getReachableSteps(currentStepId, userPerms)
    if (!reachable.some(s => s.id === toStepId)) throw new Error('Cannot transition to this step')
    // Check if any transition in the path requires auto-revision
    const directTransition = transitions.find(t => t.fromStepId === currentStepId && t.toStepId === toStepId)
    if (directTransition?.autoCreateRevision) {
      await db.createQuotationRevision(quotationId)
    }
    await db.moveQuotationToStep(quotationId, toStepId, user.id, user.username, comment)
    // Log activity
    const steps = await db.getWorkflowSteps()
    const toStep = steps.find(s => s.id === toStepId)

    // Assign real quotation number when moving TO "Approved" step
    let assignedRef: string | undefined
    if (toStep && toStep.name.toLowerCase() === 'approved') {
      try {
        assignedRef = await assignQuotationNumberViaRegistry(quotationId)
        // Update quotation status to approved
        await db.updateQuotation(quotationId, { status: 'approved' } as any)
      } catch (e: any) {
        // If registry write fails, don't complete the move
        return { success: false, message: e.message || 'Failed to assign quotation number' }
      }
    }

    // Get the current step info to check if we're moving FROM "Approved"
    const fromStep = steps.find(s => s.id === currentStepId)
    if (fromStep && fromStep.name.toLowerCase() === 'approved' && toStep && toStep.name.toLowerCase() !== 'approved') {
      // Moving away from Approved — release the number, mark cancelled in registry, revert status
      try {
        // Get reference before releasing
        const qData = await db.getQuotation(quotationId)
        const releasedRef = qData?.referenceNumber
        await db.releaseQuotationNumber(quotationId)
        await db.updateQuotation(quotationId, { status: 'draft' } as any)
        // Mark as cancelled in registry
        if (releasedRef && !releasedRef.startsWith('DRAFT-')) {
          const registryPath = await db.getSetting('quotationRegistryPath')
          if (registryPath) {
            try { markRegistryCancelled(resolveFilePath(registryPath), releasedRef) } catch {}
          }
        }
      } catch (e) { console.error('Failed to release quotation number:', e) }
    }

    db.logActivity({ userId: user.id, username: user.username, action: 'WORKFLOW', module: 'Quotations', entityType: 'quotation', entityId: quotationId, entityName: assignedRef || '', details: `Moved to ${toStep?.name || 'unknown'}${comment ? ': ' + comment : ''}` }).catch(() => {})
    // Notify users with relevant permissions about workflow transitions
    try {
      const toStepName = toStep?.name || 'unknown'
      db.notifyUsersWithPermission(
        'quotations:approve',
        'workflow_action_needed',
        `Quotation moved to ${toStepName}`,
        comment || undefined,
        'quotation',
        quotationId,
        user.id
      ).catch(() => {})
      // Also notify groups subscribed to quotation_workflow
      db.notifyGroupsForEvent('quotation_workflow', `Quotation moved to ${toStepName}`, comment || undefined, 'quotation', quotationId, user.id).catch(() => {})
      // If the target step requires approval permission, also fire approval event
      const transitionsToStep = transitions.filter(t => t.toStepId === toStepId)
      const needsApproval = transitionsToStep.some(t => t.permissionKey === 'quotations:approve')
      if (needsApproval) {
        db.notifyGroupsForEvent('quotation_approval_needed', `Quotation requires approval (${toStepName})`, comment || undefined, 'quotation', quotationId, user.id).catch(() => {})
      }
    } catch (err) { console.error('Workflow notification error:', err) }
    return { success: true }
  })

  safeHandle('workflow:assignQuotationNumber', async (event, quotationId: string) => {
    await requirePermission(event, 'quotations:approve')
    const ref = await assignQuotationNumberViaRegistry(quotationId)
    await db.updateQuotation(quotationId, { status: 'approved' } as any)
    return { referenceNumber: ref }
  })

  safeHandle('quotationRegistry:getPath', async (event) => {
    requireSession(event)
    return db.getSetting('quotationRegistryPath') || ''
  })
  safeHandle('quotationRegistry:setPath', async (event, path: string) => {
    await requirePermission(event, 'admin:settings')
    await db.setSetting('quotationRegistryPath', path || '')
    return { success: true }
  })
  safeHandle('quotationRegistry:browse', async (event) => {
    await requirePermission(event, 'admin:settings')
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  safeHandle('workflow:getQuotationLog', async (event, quotationId: string) => {
    requireSession(event)
    return db.getQuotationWorkflowLog(quotationId)
  })

  safeHandle('workflow:getReachableSteps', async (event, quotationId: string) => {
    const user = requireSession(event)
    const [qRows] = await (db as any).pool.query('SELECT workflow_step_id FROM quotations WHERE id = ?', [quotationId])
    const currentStepId = (qRows as any[])[0]?.workflow_step_id || null
    const userPerms = await db.resolveUserPermissions(user.id)
    return db.getReachableSteps(currentStepId, userPerms)
  })

  // Survey Warranty Templates (Quotation Settings)
  safeHandle('surveyWarrantyTemplate:getAll', (event) => { requireSession(event); return db.getSurveyWarrantyTemplates() })
  safeHandle('surveyWarrantyTemplate:add', async (event, text: string, title?: string) => { await requirePermission(event, 'quotations:settings'); return db.addSurveyWarrantyTemplate(text, title) })
  safeHandle('surveyWarrantyTemplate:update', async (event, id: string, text: string, title?: string) => { await requirePermission(event, 'quotations:settings'); return db.updateSurveyWarrantyTemplate(id, text, title) })
  safeHandle('surveyWarrantyTemplate:delete', async (event, id: string) => { await requirePermission(event, 'quotations:settings'); return db.deleteSurveyWarrantyTemplate(id) })
  safeHandle('surveyWarrantyTemplate:reorder', async (event, ids: string[]) => { await requirePermission(event, 'quotations:settings'); return db.reorderSurveyWarrantyTemplates(ids) })

  // Survey Warranty Template Sets
  safeHandle('surveyWarrantyTemplateSet:getAll', (event) => { requireSession(event); return db.getSurveyWarrantyTemplateSets() })
  safeHandle('surveyWarrantyTemplateSet:add', async (event, name: string, templateIds: string[]) => { await requirePermission(event, 'quotations:settings'); return db.addSurveyWarrantyTemplateSet(name, templateIds) })
  safeHandle('surveyWarrantyTemplateSet:update', async (event, id: string, name: string, templateIds: string[]) => { await requirePermission(event, 'quotations:settings'); return db.updateSurveyWarrantyTemplateSet(id, name, templateIds) })
  safeHandle('surveyWarrantyTemplateSet:delete', async (event, id: string) => { await requirePermission(event, 'quotations:settings'); return db.deleteSurveyWarrantyTemplateSet(id) })

  // Quotation Survey Warranties
  safeHandle('quotationSurveyWarranty:getAll', (event, quotationId: string) => { requireSession(event); return db.getQuotationSurveyWarranties(quotationId) })
  safeHandle('quotationSurveyWarranty:set', async (event, quotationId: string, items: any[]) => { requireSession(event); return db.setQuotationSurveyWarranties(quotationId, items) })
  safeHandle('quotationSurveyWarranty:add', async (event, data: any) => { requireSession(event); return db.addQuotationSurveyWarranty(data) })
  safeHandle('quotationSurveyWarranty:update', async (event, id: string, data: any) => { requireSession(event); return db.updateQuotationSurveyWarranty(id, data) })
  safeHandle('quotationSurveyWarranty:delete', async (event, id: string) => { requireSession(event); return db.deleteQuotationSurveyWarranty(id) })

  // ==================== Notifications ====================
  safeHandle('notifications:get', async (event, opts?: { unreadOnly?: boolean; limit?: number; offset?: number }) => {
    const user = requireSession(event)
    return db.getNotifications(user.id, opts)
  })

  safeHandle('notifications:getUnreadCount', async (event) => {
    const user = requireSession(event)
    return db.getUnreadNotificationCount(user.id)
  })

  safeHandle('notifications:markRead', async (event, id: string) => {
    requireSession(event)
    return db.markNotificationRead(id)
  })

  safeHandle('notifications:markAllRead', async (event) => {
    const user = requireSession(event)
    return db.markAllNotificationsRead(user.id)
  })

  safeHandle('notifications:delete', async (event, id: string) => {
    const user = requireSession(event)
    return db.deleteNotification(id, user.id)
  })

  safeHandle('notifications:getUsernames', async (event) => {
    requireSession(event)
    const users = await db.getUsers()
    return users.map((u: any) => ({ id: u.id, username: u.username }))
  })

  // ==================== Database Health ====================
  safeHandle('db:getHealth', async (event) => {
    await requirePermission(event, 'admin:settings')
    return db.getDatabaseHealth()
  })

  // ==================== Recent Items ====================
  safeHandle('recent:get', async (event) => {
    const user = requireSession(event)
    return db.getRecentItems(user.id)
  })

  safeHandle('recent:add', async (event, itemType: string, itemId: string, itemLabel: string, itemSublabel?: string) => {
    const user = requireSession(event)
    return db.addRecentItem(user.id, itemType, itemId, itemLabel, itemSublabel)
  })

  // ==================== Notification Groups ====================
  safeHandle('notifGroup:getAll', async (event) => {
    requireSession(event)
    return db.getNotificationGroups()
  })

  safeHandle('notifGroup:add', async (event, name: string, description?: string) => {
    await requirePermission(event, 'admin:settings')
    return db.addNotificationGroup(name, description)
  })

  safeHandle('notifGroup:update', async (event, id: string, name: string, description?: string) => {
    await requirePermission(event, 'admin:settings')
    return db.updateNotificationGroup(id, name, description)
  })

  safeHandle('notifGroup:delete', async (event, id: string) => {
    await requirePermission(event, 'admin:settings')
    return db.deleteNotificationGroup(id)
  })

  safeHandle('notifGroup:reorder', async (event, ids: string[]) => {
    await requirePermission(event, 'admin:settings')
    return db.reorderNotificationGroups(ids)
  })

  safeHandle('notifGroup:getMembers', async (event, groupId: string) => {
    requireSession(event)
    return db.getNotificationGroupMembers(groupId)
  })

  safeHandle('notifGroup:setMembers', async (event, groupId: string, userIds: string[]) => {
    await requirePermission(event, 'admin:settings')
    return db.setNotificationGroupMembers(groupId, userIds)
  })

  safeHandle('notifGroup:getSubscriptions', async (event, groupId: string) => {
    requireSession(event)
    return db.getNotificationGroupSubscriptions(groupId)
  })

  safeHandle('notifGroup:setSubscriptions', async (event, groupId: string, eventTypes: string[]) => {
    await requirePermission(event, 'admin:settings')
    return db.setNotificationGroupSubscriptions(groupId, eventTypes)
  })

  // Cleanup old read notifications on startup
  db.deleteOldNotifications(90).catch(() => {})

  createWindow()

  // Start the compliance scheduler after window is created
  complianceScheduler.start()

  // Start the daily alert scheduler
  const dailyAlertScheduler = new DailyAlertScheduler(db)
  dailyAlertScheduler.start()

  safeHandle('dailyAlerts:runNow', async (event) => {
    await requirePermission(event, 'admin:settings')
    await dailyAlertScheduler.run()
    return { success: true }
  })

  safeHandle('dailyAlerts:getLastRun', async (event) => {
    requireSession(event)
    return db.getSetting('daily_alerts_last_run')
  })

  // Global Search
  safeHandle('global:search', async (event, query: string) => {
    requireSession(event)
    return db.globalSearch(query)
  })

  // ==================== Column Preferences ====================
  safeHandle('columnPrefs:get', async (event, pageKey: string) => {
    const user = requireSession(event)
    return db.getUserColumnPrefs(user.id, pageKey)
  })

  safeHandle('columnPrefs:set', async (event, pageKey: string, columnIds: string[]) => {
    const user = requireSession(event)
    return db.setUserColumnPrefs(user.id, pageKey, columnIds)
  })

  // ==================== Bulk Operations ====================
  safeHandle('bulk:assignFleet', async (event, vesselIds: string[], fleetId: string) => {
    const user = await requirePermission(event, 'vessels:edit')
    await db.bulkAssignFleet(vesselIds, fleetId)
    try {
      const [fRows] = await (db as any).pool.query('SELECT name FROM fleets WHERE id = ?', [fleetId])
      const fleetName = (fRows as any[])[0]?.name || fleetId
      db.logActivity({ userId: user.id, username: user.username, action: 'UPDATE', module: 'Fleets', entityType: 'fleet', entityId: fleetId, entityName: fleetName, details: `Bulk assigned ${vesselIds.length} vessel(s) to fleet ${fleetName}` }).catch(() => {})
    } catch { /* do not block */ }
  })

  safeHandle('bulk:setVesselStatus', async (event, vesselIds: string[], isActive: boolean) => {
    await requirePermission(event, 'vessels:edit')
    await db.bulkSetVesselStatus(vesselIds, isActive)
  })

  safeHandle('bulk:deleteEntities', async (event, entityIds: string[]) => {
    await requirePermission(event, 'entities:delete')
    return db.bulkDeleteEntities(entityIds)
  })

  // ==================== Report Builder ====================
  safeHandle('reports:getSaved', async (event) => {
    const user = requireSession(event)
    return db.getSavedReports(user.id)
  })

  safeHandle('reports:save', async (event, data: {
    id?: string
    name: string
    description?: string | null
    dataSource: string
    config: any
    isShared?: boolean
  }) => {
    const user = requireSession(event)
    if (data.id) {
      await db.updateSavedReport(data.id, {
        name: data.name,
        description: data.description,
        config: data.config,
        isShared: data.isShared
      })
      return { id: data.id }
    } else {
      return db.addSavedReport({
        name: data.name,
        description: data.description,
        dataSource: data.dataSource,
        config: data.config,
        createdBy: user.id,
        isShared: data.isShared
      })
    }
  })

  safeHandle('reports:delete', async (event, id: string) => {
    requireSession(event)
    return db.deleteSavedReport(id)
  })

  safeHandle('reports:run', async (event, dataSource: string, config: any) => {
    requireSession(event)
    return db.runReport(dataSource, config)
  })

  // ==================== Document Templates ====================
  safeHandle('docTemplate:getAll', (event, category?: string) => {
    requireSession(event)
    return db.getDocumentTemplates(category)
  })

  safeHandle('docTemplate:getById', (event, id: string) => {
    requireSession(event)
    return db.getDocumentTemplateById(id)
  })

  safeHandle('docTemplate:add', async (event, data: {
    name: string
    description?: string | null
    category: string
    fileName?: string | null
    fileData?: number[] | null // Uint8Array serialized as number array through IPC
    placeholders?: string[] | null
    body?: string | null
  }) => {
    const user = await requirePermission(event, 'admin:settings')
    const buf = data.fileData && Array.isArray(data.fileData) ? Buffer.from(data.fileData) : null
    return db.addDocumentTemplate({
      name: data.name,
      description: data.description,
      category: data.category,
      fileName: data.fileName || null,
      fileData: buf,
      placeholders: data.placeholders,
      body: data.body,
      createdBy: user.id
    })
  })

  safeHandle('docTemplate:update', async (event, id: string, data: {
    name?: string
    description?: string | null
    category?: string
    body?: string | null
  }) => {
    await requirePermission(event, 'admin:settings')
    return db.updateDocumentTemplate(id, data)
  })

  safeHandle('docTemplate:replaceFile', async (event, id: string, data: {
    fileName: string
    fileData: number[]
    placeholders: string[] | null
  }) => {
    await requirePermission(event, 'admin:settings')
    const buf = Buffer.from(data.fileData)
    return db.updateDocumentTemplateFile(id, data.fileName, buf, data.placeholders)
  })

  safeHandle('docTemplate:delete', async (event, id: string) => {
    await requirePermission(event, 'admin:settings')
    return db.deleteDocumentTemplate(id)
  })

  safeHandle('docTemplate:reorder', async (event, ids: string[]) => {
    await requirePermission(event, 'admin:settings')
    return db.reorderDocumentTemplates(ids)
  })

  safeHandle('docTemplate:generate', async (event, templateId: string, context: {
    vesselId?: string
    policyId?: string
    entityId?: string
  }) => {
    const user = requireSession(event)
    const template = await db.getDocumentTemplateById(templateId)
    if (!template) throw new Error('Template not found')

    // Build replacement map from context
    const replacements: Record<string, string> = {
      '{{today}}': new Date().toISOString().split('T')[0],
      '{{userName}}': user.username
    }

    // Load company name from report settings
    try {
      const settingsJson = await db.getSetting('reportSettings')
      if (settingsJson) {
        const settings = JSON.parse(settingsJson)
        if (settings.companyName) replacements['{{companyName}}'] = settings.companyName
      }
    } catch {}

    // Load vessel data if provided
    if (context.vesselId) {
      try {
        const [vesselRows] = await (db as any).pool.query(
          'SELECT v.*, fs.name AS flagStateName FROM vessels v LEFT JOIN flag_states fs ON v.flag_state_id = fs.id WHERE v.id = ?',
          [context.vesselId]
        )
        const vessel = (vesselRows as any[])[0]
        if (vessel) {
          replacements['{{vesselName}}'] = vessel.name || ''
          replacements['{{imoNumber}}'] = vessel.imo_number || ''
          replacements['{{vesselType}}'] = vessel.vessel_type || ''
          replacements['{{flagState}}'] = vessel.flagStateName || ''
          replacements['{{grossTonnage}}'] = vessel.gross_tonnage ? String(vessel.gross_tonnage) : ''
          replacements['{{builtYear}}'] = vessel.built_year ? String(vessel.built_year) : ''
          replacements['{{rebuiltYear}}'] = vessel.rebuilt_year ? String(vessel.rebuilt_year) : ''
          replacements['{{classification}}'] = vessel.classification_society || ''

          // Load customer entity
          if (vessel.customer_id) {
            const [entityRows] = await (db as any).pool.query(
              'SELECT name, email FROM entities WHERE id = ?',
              [vessel.customer_id]
            )
            const entity = (entityRows as any[])[0]
            if (entity) {
              if (vessel.customer_type === 'broker') {
                replacements['{{brokerName}}'] = entity.name || ''
              } else {
                replacements['{{customerName}}'] = entity.name || ''
                replacements['{{customerEmail}}'] = entity.email || ''
              }
            }
          }
        }
      } catch (e) { console.error('Template generate - vessel load error:', e) }
    }

    // Load entity data if provided
    if (context.entityId) {
      try {
        const [entityRows] = await (db as any).pool.query(
          'SELECT name, email, phone FROM entities WHERE id = ?',
          [context.entityId]
        )
        const entity = (entityRows as any[])[0]
        if (entity) {
          replacements['{{customerName}}'] = entity.name || ''
          replacements['{{customerEmail}}'] = entity.email || ''
        }
      } catch (e) { console.error('Template generate - entity load error:', e) }
    }

    // Load policy data if provided
    if (context.policyId) {
      try {
        const [policyRows] = await (db as any).pool.query(
          `SELECT vdp.*, pt.name AS policyTypeName
           FROM vessel_dynamic_policies vdp
           LEFT JOIN policy_types pt ON vdp.policy_type_id = pt.id
           WHERE vdp.id = ?`,
          [context.policyId]
        )
        const policy = (policyRows as any[])[0]
        if (policy) {
          replacements['{{policyNumber}}'] = policy.policy_number || ''
          replacements['{{policyType}}'] = policy.policyTypeName || ''

          // Load policy values for inception/expiry
          const [valueRows] = await (db as any).pool.query(
            `SELECT vpv.value_text, vpv.value_date, ptc.name AS charName
             FROM vessel_policy_values vpv
             JOIN policy_type_characteristics ptc ON vpv.characteristic_id = ptc.id
             WHERE vpv.dynamic_policy_id = ?`,
            [context.policyId]
          )
          for (const v of (valueRows as any[])) {
            const nameL = (v.charName || '').toLowerCase()
            if (nameL.includes('inception') || nameL.includes('start')) {
              replacements['{{inceptionDate}}'] = v.value_date || v.value_text || ''
            }
            if (nameL.includes('end') || nameL.includes('expiry')) {
              replacements['{{expiryDate}}'] = v.value_date || v.value_text || ''
            }
            if (nameL.includes('premium')) {
              replacements['{{premiumAmount}}'] = v.value_text || ''
            }
            if (nameL.includes('currency')) {
              replacements['{{currency}}'] = v.value_text || ''
            }
          }
        }
      } catch (e) { console.error('Template generate - policy load error:', e) }
    }

    // Process the docx using JSZip
    const JSZip = require('jszip')
    const zip = await JSZip.loadAsync(template.fileData)

    // Process all XML parts that may contain text (document.xml, headers, footers)
    const xmlParts = Object.keys(zip.files).filter(
      (name: string) => name.startsWith('word/') && name.endsWith('.xml')
    )

    for (const partName of xmlParts) {
      let xml: string = await zip.file(partName)!.async('string')

      // Handle split runs: Word may split {{placeholder}} across multiple <w:t> elements
      // Strategy: find <w:r> sequences where concatenated <w:t> text contains {{...}}
      // First, try simple replacement for non-split placeholders
      for (const [placeholder, value] of Object.entries(replacements)) {
        xml = xml.split(placeholder).join(value)
      }

      // Handle split runs: concatenate <w:t> elements within <w:p> paragraphs,
      // replace placeholders, then reconstruct
      xml = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (paragraph: string) => {
        // Extract all text from <w:t> elements in this paragraph
        const textParts: { fullMatch: string; text: string }[] = []
        const tRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g
        let tMatch: RegExpExecArray | null
        while ((tMatch = tRegex.exec(paragraph)) !== null) {
          textParts.push({ fullMatch: tMatch[0], text: tMatch[1] })
        }
        if (textParts.length < 2) return paragraph

        const combined = textParts.map(t => t.text).join('')
        // Check if the combined text contains any unreplaced placeholder
        if (!combined.includes('{{')) return paragraph

        // Replace in the combined text
        let replaced = combined
        for (const [placeholder, value] of Object.entries(replacements)) {
          replaced = replaced.split(placeholder).join(value)
        }

        if (replaced === combined) return paragraph

        // Put the replaced text into the first <w:t> and empty the rest
        let result = paragraph
        let first = true
        for (const part of textParts) {
          if (first) {
            const preserveSpace = '<w:t xml:space="preserve">' + replaced + '</w:t>'
            result = result.replace(part.fullMatch, preserveSpace)
            first = false
          } else {
            result = result.replace(part.fullMatch, '<w:t></w:t>')
          }
        }
        return result
      })

      zip.file(partName, xml)
    }

    const outputBuffer = await zip.generateAsync({ type: 'nodebuffer' })
    return { data: Array.from(outputBuffer as Buffer), fileName: template.fileName }
  })

  // --- T&C Templates ---
  safeHandle('tc:getTemplate', async (event, typeCode: string) => {
    requireSession(event)
    return db.getTcTemplate(typeCode)
  })

  safeHandle('tc:getTemplateFile', async (event, typeCode: string) => {
    requireSession(event)
    const buf = await db.getTcTemplateFile(typeCode)
    if (!buf) return null
    return Array.from(buf as Buffer)
  })

  safeHandle('tc:getAllTemplates', async (event) => {
    requireSession(event)
    return db.getAllTcTemplates()
  })

  safeHandle('tc:upload', async (event, data: { typeCode: string; fileName: string; fileData: number[] }) => {
    await requirePermission(event, 'admin:settings')
    const buf = Buffer.from(data.fileData)
    await db.uploadTcTemplate(data.typeCode, buf, data.fileName, 0)
    return db.getTcTemplate(data.typeCode)
  })

  safeHandle('tc:delete', async (event, typeCode: string) => {
    await requirePermission(event, 'admin:settings')
    await db.deleteTcTemplate(typeCode)
  })

  // --- DOCX-to-PDF Conversion & Merging ---
  safeHandle('convert:docxToPdf', async (event, docxPath: string) => {
    requireSession(event)
    const { convertDocxToPdf } = await import('./services/DocxToPdfService')
    return convertDocxToPdf(docxPath)
  })

  safeHandle('convert:countPdfPages', async (event, pdfPath: string) => {
    requireSession(event)
    const { countPdfPages } = await import('./services/DocxToPdfService')
    return countPdfPages(pdfPath)
  })

  safeHandle('convert:mergePdfs', async (event, pdfPaths: string[], outputPath: string) => {
    requireSession(event)
    const { mergePdfs } = await import('./services/DocxToPdfService')
    await mergePdfs(pdfPaths, outputPath)
    return outputPath
  })

  safeHandle('convert:setDocxPageStart', async (event, data: { fileData: number[]; startPage: number }) => {
    requireSession(event)
    const { setDocxPageStart } = await import('./services/DocxToPdfService')
    const buf = Buffer.from(data.fileData)
    const result = await setDocxPageStart(buf, data.startPage)
    return Array.from(result)
  })

  safeHandle('convert:buildPolicyWithTC', async (event, data: {
    policyDocxData: number[]
    tcTypeCode: string
    filePrefix: string
  }) => {
    requireSession(event)
    const { buildPolicyWithTC } = await import('./services/DocxToPdfService')
    const os = require('os')
    const fs = require('fs')

    const policyBuf = Buffer.from(data.policyDocxData)

    // Get the T&C template file from DB
    const tcBuf = await db.getTcTemplateFile(data.tcTypeCode)
    if (!tcBuf) {
      throw new Error('No T&C template found for this policy type')
    }

    const outputDir = os.tmpdir()
    const { pdfPath, tempFiles } = await buildPolicyWithTC(
      policyBuf,
      tcBuf as Buffer,
      outputDir,
      data.filePrefix
    )

    // Read the merged PDF and return as array
    const pdfData = fs.readFileSync(pdfPath)

    // Clean up temp files
    for (const f of tempFiles) {
      try { fs.unlinkSync(f) } catch { /* ignore */ }
    }

    return { data: Array.from(pdfData as Buffer), fileName: `${data.filePrefix}.pdf` }
  })

  // ==================== File Manager ====================
  safeHandle('fileManager:getRoot', async (event) => {
    requireSession(event)
    return db.getSetting('file_manager_root')
  })
  safeHandle('fileManager:setRoot', async (event, rootPath: string) => {
    await requirePermission(event, 'admin:settings')
    return db.setSetting('file_manager_root', rootPath)
  })
  safeHandle('fileManager:readDirectory', (event, dirPath: string) => {
    requireSession(event)
    return FileManagerService.readDirectory(dirPath)
  })
  safeHandle('fileManager:readTree', (event, dirPath: string, depth?: number) => {
    requireSession(event)
    return FileManagerService.readTree(dirPath, depth)
  })
  safeHandle('fileManager:moveFolder', async (event, sourcePath: string, destParentPath: string) => {
    await requirePermission(event, 'fileManager:manage')
    const result = FileManagerService.moveItem(sourcePath, destParentPath)
    const remapped = await db.remapAllFilePaths(result.oldPath, result.newPath)
    return { ...result, remapped: remapped.remapped }
  })
  safeHandle('fileManager:renameFolder', async (event, folderPath: string, newName: string) => {
    await requirePermission(event, 'fileManager:manage')
    const result = FileManagerService.renameItem(folderPath, newName)
    const remapped = await db.remapAllFilePaths(result.oldPath, result.newPath)
    return { ...result, remapped: remapped.remapped }
  })
  safeHandle('fileManager:createFolder', async (event, parentPath: string, name: string) => {
    await requirePermission(event, 'fileManager:manage')
    return FileManagerService.createFolder(parentPath, name)
  })
  safeHandle('fileManager:exists', (event, filePath: string) => {
    requireSession(event)
    return FileManagerService.exists(filePath)
  })
  safeHandle('fileManager:healthCheck', async (event) => {
    requireSession(event)
    const allPaths = await db.getAllStoredFilePaths()
    return allPaths.map((p) => ({ ...p, exists: FileManagerService.exists(p.path) }))
  })
  safeHandle('fileManager:openInExplorer', (event, filePath: string) => {
    requireSession(event)
    shell.showItemInFolder(filePath)
  })
  safeHandle('fileManager:openFile', (event, filePath: string) => {
    requireSession(event)
    return shell.openPath(filePath)
  })

  // Initialize update service with main window
  const mainWindow = BrowserWindow.getAllWindows()[0]
  if (mainWindow) {
    updateService.setMainWindow(mainWindow)
    // Check for updates 5 seconds after startup (give time for UI to load)
    setTimeout(() => {
      updateService.checkForUpdates(false)
    }, 5000)
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
