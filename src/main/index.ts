import { app, shell, BrowserWindow, ipcMain, screen } from 'electron'
import { join, dirname, resolve, normalize, extname } from 'path'
import { Worker } from 'worker_threads'
import { existsSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { db } from './mysql/adapter'
import { auth } from './auth'
import { complianceScheduler } from './services/ComplianceScheduler'
import { updateService } from './services/UpdateService'
import { formatDateForMySQL } from './mysql/utils'
import Store from 'electron-store'
import { createPool } from 'mysql2/promise'

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

// Security: Require admin role, returns the user or throws
function requireAdmin(event: Electron.IpcMainInvokeEvent): Omit<import('../shared/types').User, 'passwordHash'> {
  const user = requireSession(event)
  if (user.role !== 'admin') throw new Error('Admin privileges required')
  return user
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

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

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

  safeHandle('auth:resetPassword', async (_event, { username }) => {
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
    requireAdmin(event)
    return await db.getFileTypeSettings()
  })

  safeHandle('fileTypes:setSettings', async (event, settings: { allowedExtensions: string[]; blockedExtensions: string[] }) => {
    requireAdmin(event)
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
    return await db.validateFileExtension(filePath)
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
  safeHandle('db:addDocumentType', (event, docType) => { requireSession(event); return db.addDocumentType(docType) })
  safeHandle('db:updateDocumentType', (event, id, updates) => { requireSession(event); return db.updateDocumentType(id, updates) })
  safeHandle('db:deleteDocumentType', (event, id) => { requireAdmin(event); return db.deleteDocumentType(id) })

  safeHandle('db:getVesselCustomDocTypes', (event, vesselId: string) => { requireSession(event); return db.getVesselCustomDocTypes(vesselId) })
  safeHandle('db:addVesselCustomDocType', (event, docType) => { requireSession(event); return db.addVesselCustomDocType(docType) })
  safeHandle('db:deleteVesselCustomDocType', (event, id: string) => { requireSession(event); return db.deleteVesselCustomDocType(id) })

  safeHandle('db:getFleets', (event) => { requireSession(event); return db.getFleets() })
  safeHandle('db:addFleet', (event, fleet) => { requireSession(event); return db.addFleet(fleet) })
  safeHandle('db:deleteFleet', (event, id) => { requireAdmin(event); return db.deleteFleet(id) })

  safeHandle('db:getVessels', (event) => { requireSession(event); return db.getVessels() })
  safeHandle('db:getVesselsPaginated', (event, params) => { requireSession(event); return db.getVesselsPaginated(params) })
  safeHandle('db:addVessel', async (event, vessel) => {
    requireSession(event)
    try {
      const result = await db.addVessel(vessel)
      return { success: true, data: result }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })
  safeHandle('db:updateVessel', (event, id, updates) => { const user = requireSession(event); return db.updateVessel(id, updates, user.username) })
  safeHandle('db:getVesselNameHistory', (event, vesselId) => { requireSession(event); return db.getVesselNameHistory(vesselId) })
  safeHandle('db:deleteVessel', async (event, id) => {
    requireAdmin(event)
    await db.deleteVessel(id)
    return { success: true }
  })

  safeHandle('db:getVesselDocuments', (event, vesselId) => { requireSession(event); return db.getVesselDocuments(vesselId) })
  safeHandle('db:upsertVesselDocument', async (event, doc) => {
    requireSession(event)
    await db.upsertVesselDocument(doc)
    if (doc.filePath) {
      await db.autoSnoozeVessel(doc.vesselId)
    }
  })
  safeHandle('db:updateVesselDocumentExpiry', (event, vesselId, docTypeId, expiryDate) => { requireSession(event); return db.updateVesselDocumentExpiry(vesselId, docTypeId, expiryDate) })
  safeHandle('db:updateVesselDocumentReceivedDate', (event, vesselId, docTypeId, receivedDate) => { requireSession(event); return db.updateVesselDocumentReceivedDate(vesselId, docTypeId, receivedDate) })
  safeHandle('db:duplicateVesselDocument', (event, docId, uploadedBy) => { requireSession(event); return db.duplicateVesselDocument(docId, uploadedBy) })
  safeHandle('db:deleteVesselDocumentById', (event, docId) => { requireSession(event); return db.deleteVesselDocumentById(docId) })

  // Entity IPC Handlers
  safeHandle('db:getEntities', (event) => { requireSession(event); return db.getEntities() })
  safeHandle('db:getEntitiesPaginated', (event, params) => { requireSession(event); return db.getEntitiesPaginated(params) })
  safeHandle('db:addEntity', (event, entity) => { requireSession(event); return db.addEntity(entity) })
  safeHandle('db:updateEntity', async (event, id, updates) => {
    requireSession(event)
    const docFields = ['passportFilePath', 'certificateOfIncorporationPath', 'articlesOfAssociationPath', 'kycFilePath']
    const hasDocChange = docFields.some(f => updates[f] !== undefined)
    await db.updateEntity(id, updates)
    if (hasDocChange) {
      await db.autoSnoozeVesselsForEntity(id)
    }
  })
  safeHandle('db:deleteEntity', (event, id) => { requireSession(event); return db.deleteEntity(id) })
  safeHandle('db:mergeEntities', (event, sourceId, targetId, keepName) => { requireSession(event); return db.mergeEntities(sourceId, targetId, keepName) })
  safeHandle('db:purgeAllVesselsAndEntities', (event) => { requireAdmin(event); return db.purgeAllVesselsAndEntities() })
  safeHandle('maintenance:syncSettings', (event) => { requireAdmin(event); return db.syncAssuredRoles() })
  safeHandle('maintenance:addOneDayToAllPolicies', (event) => { requireAdmin(event); return db.addOneDayToAllPolicies() })

  safeHandle('db:getAssuredRoles', (event) => { requireSession(event); return db.getAssuredRoles() })
  safeHandle('db:addAssuredRole', (event, role) => { requireSession(event); return db.addAssuredRole(role) })
  safeHandle('db:updateAssuredRole', (event, id, updates) => { requireSession(event); return db.updateAssuredRole(id, updates) })
  safeHandle('db:deleteAssuredRole', (event, id) => { requireSession(event); return db.deleteAssuredRole(id) })
  safeHandle('db:reorderAssuredRoles', (event, orderedIds) => { requireSession(event); return db.reorderAssuredRoles(orderedIds) })
  safeHandle('db:getVesselsByRole', (event, roleName) => { requireSession(event); return db.getVesselsByRole(roleName) })

  // Flag States
  safeHandle('db:getFlagStates', (event) => { requireSession(event); return db.getFlagStates() })
  safeHandle('db:addFlagState', (event, flagState) => { requireSession(event); return db.addFlagState(flagState) })
  safeHandle('db:updateFlagState', (event, id, updates) => { requireSession(event); return db.updateFlagState(id, updates) })
  safeHandle('db:deleteFlagState', (event, id) => { requireSession(event); return db.deleteFlagState(id) })
  safeHandle('db:getVesselsByFlagState', (event, flagStateId) => { requireSession(event); return db.getVesselsByFlagState(flagStateId) })

  // Policy Types
  safeHandle('db:getPolicyTypes', (event) => { requireSession(event); return db.getPolicyTypes() })
  safeHandle('db:addPolicyType', (event, name) => { requireAdmin(event); return db.addPolicyType(name) })
  safeHandle('db:updatePolicyType', (event, id, updates) => { requireAdmin(event); return db.updatePolicyType(id, updates) })
  safeHandle('db:deletePolicyType', (event, id) => { requireAdmin(event); return db.deletePolicyType(id) })
  safeHandle('db:reorderPolicyTypes', (event, orderedIds) => { requireAdmin(event); return db.reorderPolicyTypes(orderedIds) })

  // Vessel Policies
  safeHandle('db:getVesselPolicies', (event, vesselId) => { requireSession(event); return db.getVesselPolicies(vesselId) })
  safeHandle('db:addVesselPolicy', (event, vesselId, policyTypeId) => { requireSession(event); return db.addVesselPolicy(vesselId, policyTypeId) })
  safeHandle('db:deleteVesselPolicy', (event, id) => { requireSession(event); return db.deleteVesselPolicy(id) })

  // Dynamic Address Book
  safeHandle('db:queryDAB', (event, criteria) => { requireSession(event); return db.queryDAB(criteria) })

  safeHandle('db:getVesselAssureds', (event, vesselId) => { requireSession(event); return db.getVesselAssureds(vesselId) })
  safeHandle('db:addVesselAssured', (event, assured) => { requireSession(event); return db.addVesselAssured(assured) })
  safeHandle('db:deleteVesselAssured', (event, id) => { requireSession(event); return db.deleteVesselAssured(id) })
  safeHandle('db:updateVesselAssuredRole', (event, id, role) => { requireSession(event); return db.updateVesselAssuredRole(id, role) })

  safeHandle('db:getEntityUBOs', (event, assuredEntityId) => { requireSession(event); return db.getEntityUBOs(assuredEntityId) })
  safeHandle('db:addEntityUBO', (event, ubo) => { requireSession(event); return db.addEntityUBO(ubo) })
  safeHandle('db:deleteEntityUBO', (event, ubo) => { requireSession(event); return db.deleteEntityUBO(ubo) })

  // Surveyors
  safeHandle('db:getSurveyors', (event) => { requireSession(event); return db.getSurveyors() })
  safeHandle('db:getSurveyorsPaginated', (event, params) => { requireSession(event); return db.getSurveyorsPaginated(params) })
  safeHandle('db:addSurveyor', (event, surveyor) => { requireSession(event); return db.addSurveyor(surveyor) })
  safeHandle('db:updateSurveyor', (event, id, updates) => { requireSession(event); return db.updateSurveyor(id, updates) })
  safeHandle('db:deleteSurveyor', (event, id) => { requireSession(event); return db.deleteSurveyor(id) })

  // Condition Surveys
  safeHandle('db:getConditionSurveys', (event, vesselId) => { requireSession(event); return db.getConditionSurveys(vesselId) })
  safeHandle('db:addConditionSurvey', (event, survey) => { requireSession(event); return db.addConditionSurvey(survey) })
  safeHandle('db:updateConditionSurvey', (event, id, updates) => { requireSession(event); return db.updateConditionSurvey(id, updates) })
  safeHandle('db:deleteConditionSurvey', async (event, id) => {
    requireSession(event)
    return db.deleteConditionSurvey(id)
  })

  // Condition Survey Types
  safeHandle('db:getConditionSurveyTypes', async (event) => {
    requireSession(event)
    return db.getConditionSurveyTypes()
  })

  safeHandle('db:addConditionSurveyType', async (event, name) => {
    requireAdmin(event)
    return db.addConditionSurveyType(name)
  })

  safeHandle('db:deleteConditionSurveyType', async (event, id) => {
    requireAdmin(event)
    return db.deleteConditionSurveyType(id)
  })
  safeHandle('db:getSurveyDefects', (event, surveyId) => { requireSession(event); return db.getSurveyDefects(surveyId) })
  safeHandle('db:addSurveyDefect', (event, defect) => { requireSession(event); return db.addSurveyDefect(defect) })
  safeHandle('db:updateSurveyDefect', (event, id, updates) => { requireSession(event); return db.updateSurveyDefect(id, updates) })
  safeHandle('db:deleteSurveyDefect', (event, id) => { requireSession(event); return db.deleteSurveyDefect(id) })
  safeHandle('db:closeDefect', (event, id, closedBy, closureNotes) => { requireSession(event); return db.closeDefect(id, closedBy, closureNotes) })
  safeHandle('db:reopenDefect', (event, id) => { requireSession(event); return db.reopenDefect(id) })
  safeHandle('db:getSurveyAttachments', (event, surveyId) => { requireSession(event); return db.getSurveyAttachments(surveyId) })
  safeHandle('db:addSurveyAttachment', (event, attachment) => { requireSession(event); return db.addSurveyAttachment(attachment) })
  safeHandle('db:deleteSurveyAttachment', (event, id) => { requireAdmin(event); return db.deleteSurveyAttachment(id) })
  safeHandle('db:getOpenDefectsByVessel', (event) => { requireSession(event); return db.getOpenDefectsByVessel() })
  safeHandle('db:getSurveyHistory', (event, vesselId) => { requireSession(event); return db.getSurveyHistory(vesselId) })
  safeHandle('db:closeSurvey', (event, surveyId, userId) => { requireSession(event); return db.closeSurvey(surveyId, userId) })
  safeHandle('db:updateConditionSurveyEndorsement', (event, surveyId, issued) => { requireSession(event); return db.updateConditionSurveyEndorsement(surveyId, issued) })

  // Dashboard
  safeHandle('dashboard:getActivity', (event) => { requireSession(event); return db.getDashboardActivity() })

  // Survey Warranties
  safeHandle('survey_warranty:getByVessel', (event, vesselId) => { requireSession(event); return db.getSurveyWarrantiesByVessel(vesselId) })
  safeHandle('survey_warranty:getAll', (event) => { requireSession(event); return db.getAllSurveyWarranties() })
  safeHandle('survey_warranty:getDueToday', (event) => { requireSession(event); return db.getSurveyWarrantiesDueToday() })
  safeHandle('survey_warranty:getEndorsementsDue', (event) => { requireSession(event); return db.getEndorsementsDue() })
  safeHandle('survey_warranty:create', (event, data) => { requireSession(event); return db.createSurveyWarranty(data) })
  safeHandle('survey_warranty:update', (event, id, data) => { requireSession(event); return db.updateSurveyWarranty(id, data) })
  safeHandle('survey_warranty:delete', (event, id) => { requireAdmin(event); return db.deleteSurveyWarranty(id) })
  safeHandle('survey_warranty:logReminder', (event, data) => { requireSession(event); return db.logWarrantyReminder(data) })
  safeHandle('survey_warranty:getReminders', (event, warrantyId) => { requireSession(event); return db.getWarrantyReminders(warrantyId) })
  safeHandle('survey_warranty:waive', (event, id, reason) => { requireSession(event); return db.waiverSurveyWarranty(id, reason) })

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
    const normalized = normalize(filePath)
    const validation = await db.validateFileExtension(normalized)
    if (!validation.valid) {
      throw new Error(validation.reason || 'File type not allowed')
    }
    return shell.openPath(normalized)
  })

  // General file picker (for document uploads)
  safeHandle('dialog:openFileAny', async (event) => {
    requireSession(event)
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    return result.canceled ? null : result.filePaths[0]
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
    requireAdmin(event)
    return auth.createUser(username, password, role)
  })

  safeHandle('db:getUsers', async (event) => {
    requireAdmin(event)
    return db.getUsers()
  })

  safeHandle('db:deleteUser', async (event, id) => {
    requireAdmin(event)
    return db.deleteUser(id)
  })

  safeHandle('db:updateUserRole', async (event, userId: string, role: 'admin' | 'user') => {
    requireAdmin(event)
    return db.updateUserRole(userId, role)
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
    requireAdmin(event)
    return await db.getComplianceScheduleSettings()
  })

  safeHandle('compliance:setScheduleSettings', async (event, settings) => {
    requireAdmin(event)
    const nextRunAt = complianceScheduler.calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
    settings.nextRunAt = nextRunAt
    await db.setComplianceScheduleSettings(settings)
    complianceScheduler.start()
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
    const user = requireSession(event)
    await db.markComplianceResultReviewed(resultId, user.username)
  })

  safeHandle('compliance:decideResult', async (event, resultId: string, decision: 'sanctioned' | 'cleared') => {
    const user = requireSession(event)
    await db.decideComplianceResult(resultId, decision, user.username)
    return { success: true }
  })

  safeHandle('compliance:runManualCheck', async (event) => {
    requireAdmin(event)
    await complianceScheduler.runComplianceCheck()
    return { success: true }
  })

  // Reminder IPC Handlers
  safeHandle('reminders:getSettings', (event) => { requireSession(event); return db.getReminderSettings() })
  safeHandle('reminders:setSettings', (event, settings) => { requireSession(event); return db.setReminderSettings(settings) })
  safeHandle('reminders:getVesselReminders', (event) => { requireSession(event); return db.getVesselReminders() })
  safeHandle('reminders:snoozeVessel', (event, vesselId, username, periodDays) => { requireSession(event); return db.snoozeVessel(vesselId, username, periodDays) })
  safeHandle('reminders:unsnoozeVessel', (event, vesselId) => { requireSession(event); return db.unsnoozeVessel(vesselId) })

  // P&I Clauses
  safeHandle('pi:getClauses', (event) => { requireSession(event); return db.getPIClauses() })
  safeHandle('pi:addClause', (event, clause) => { requireAdmin(event); return db.addPIClause(clause) })
  safeHandle('pi:updateClause', (event, id, updates) => { requireAdmin(event); return db.updatePIClause(id, updates) })
  safeHandle('pi:deleteClause', (event, id) => { requireAdmin(event); return db.deletePIClause(id) })
  safeHandle('pi:reorderClauses', (event, orderedIds) => { requireAdmin(event); return db.reorderPIClauses(orderedIds) })

  // P&I Clause Sets
  safeHandle('pi:getClauseSets', (event) => { requireSession(event); return db.getPIClauseSets() })
  safeHandle('pi:addClauseSet', (event, name, clauseIds) => { requireAdmin(event); return db.addPIClauseSet(name, clauseIds) })
  safeHandle('pi:updateClauseSet', (event, id, name, clauseIds) => { requireAdmin(event); return db.updatePIClauseSet(id, name, clauseIds) })
  safeHandle('pi:deleteClauseSet', (event, id) => { requireAdmin(event); return db.deletePIClauseSet(id) })

  // P&I Warranty Tags
  safeHandle('pi:getWarrantyTags', (event) => { requireSession(event); return db.getPIWarrantyTags() })
  safeHandle('pi:addWarrantyTag', (event, name) => { requireAdmin(event); return db.addPIWarrantyTag(name) })
  safeHandle('pi:updateWarrantyTag', (event, id, name) => { requireAdmin(event); return db.updatePIWarrantyTag(id, name) })
  safeHandle('pi:deleteWarrantyTag', (event, id) => { requireAdmin(event); return db.deletePIWarrantyTag(id) })
  safeHandle('pi:reorderWarrantyTags', (event, orderedIds) => { requireAdmin(event); return db.reorderPIWarrantyTags(orderedIds) })

  // P&I Warranties
  safeHandle('pi:getWarranties', (event) => { requireSession(event); return db.getPIWarranties() })
  safeHandle('pi:addWarranty', (event, warranty) => { requireAdmin(event); return db.addPIWarranty(warranty) })
  safeHandle('pi:updateWarranty', (event, id, updates) => { requireAdmin(event); return db.updatePIWarranty(id, updates) })
  safeHandle('pi:deleteWarranty', (event, id) => { requireAdmin(event); return db.deletePIWarranty(id) })
  safeHandle('pi:reorderWarranties', (event, orderedIds) => { requireAdmin(event); return db.reorderPIWarranties(orderedIds) })

  // P&I Deductibles
  safeHandle('pi:getDeductibles', (event) => { requireSession(event); return db.getPIDeductibles() })
  safeHandle('pi:addDeductible', (event, ded) => { requireAdmin(event); return db.addPIDeductible(ded) })
  safeHandle('pi:updateDeductible', (event, id, updates) => { requireAdmin(event); return db.updatePIDeductible(id, updates) })
  safeHandle('pi:deleteDeductible', (event, id) => { requireAdmin(event); return db.deletePIDeductible(id) })
  safeHandle('pi:reorderDeductibles', (event, orderedIds) => { requireAdmin(event); return db.reorderPIDeductibles(orderedIds) })

  // P&I Deductible Sets
  safeHandle('pi:getDeductibleSets', (event) => { requireSession(event); return db.getPIDeductibleSets() })
  safeHandle('pi:getDeductibleSetItems', (event, setId) => { requireSession(event); return db.getPIDeductibleSetItems(setId) })
  safeHandle('pi:addDeductibleSet', (event, name, items) => { requireAdmin(event); return db.addPIDeductibleSet(name, items) })
  safeHandle('pi:updateDeductibleSet', (event, id, name, items) => { requireAdmin(event); return db.updatePIDeductibleSet(id, name, items) })
  safeHandle('pi:deleteDeductibleSet', (event, id) => { requireAdmin(event); return db.deletePIDeductibleSet(id) })

  // P&I Exclusions
  safeHandle('pi:getExclusions', (event) => { requireSession(event); return db.getPIExclusions() })
  safeHandle('pi:addExclusion', (event, text) => { requireAdmin(event); return db.addPIExclusion(text) })
  safeHandle('pi:updateExclusion', (event, id, text) => { requireAdmin(event); return db.updatePIExclusion(id, text) })
  safeHandle('pi:deleteExclusion', (event, id) => { requireAdmin(event); return db.deletePIExclusion(id) })
  safeHandle('pi:reorderExclusions', (event, orderedIds) => { requireAdmin(event); return db.reorderPIExclusions(orderedIds) })

  // P&I Sub-Limit Templates
  safeHandle('pi:getSubLimitTemplates', (event) => { requireSession(event); return db.getPISubLimitTemplates() })
  safeHandle('pi:addSubLimitTemplate', (event, tmpl) => { requireAdmin(event); return db.addPISubLimitTemplate(tmpl) })
  safeHandle('pi:updateSubLimitTemplate', (event, id, updates) => { requireAdmin(event); return db.updatePISubLimitTemplate(id, updates) })
  safeHandle('pi:deleteSubLimitTemplate', (event, id) => { requireAdmin(event); return db.deletePISubLimitTemplate(id) })
  safeHandle('pi:reorderSubLimitTemplates', (event, orderedIds) => { requireAdmin(event); return db.reorderPISubLimitTemplates(orderedIds) })

  // P&I Additional Clauses
  safeHandle('pi:getAdditionalClauses', (event) => { requireSession(event); return db.getPIAdditionalClauses() })
  safeHandle('pi:addAdditionalClause', (event, text) => { requireAdmin(event); return db.addPIAdditionalClause(text) })
  safeHandle('pi:updateAdditionalClause', (event, id, text) => { requireAdmin(event); return db.updatePIAdditionalClause(id, text) })
  safeHandle('pi:deleteAdditionalClause', (event, id) => { requireAdmin(event); return db.deletePIAdditionalClause(id) })
  safeHandle('pi:reorderAdditionalClauses', (event, orderedIds) => { requireAdmin(event); return db.reorderPIAdditionalClauses(orderedIds) })

  // Trading Excluded Countries
  safeHandle('pi:getTradingExcludedCountries', (event) => { requireSession(event); return db.getTradingExcludedCountries() })
  safeHandle('pi:addTradingExcludedCountry', (event, country) => { requireAdmin(event); return db.addTradingExcludedCountry(country) })
  safeHandle('pi:updateTradingExcludedCountry', (event, id, updates) => { requireAdmin(event); return db.updateTradingExcludedCountry(id, updates) })
  safeHandle('pi:deleteTradingExcludedCountry', (event, id) => { requireAdmin(event); return db.deleteTradingExcludedCountry(id) })

  // P&I Section Texts
  safeHandle('pi:getSectionTexts', (event) => { requireSession(event); return db.getPISectionTexts() })
  safeHandle('pi:setSectionTexts', (event, texts) => { requireAdmin(event); return db.setPISectionTexts(texts) })

  // Instalment Defaults & Logo
  safeHandle('pi:getInstalmentDefaults', (event) => { requireSession(event); return db.getInstalmentDefaults() })
  safeHandle('pi:setInstalmentDefaults', (event, defaults) => { requireAdmin(event); return db.setInstalmentDefaults(defaults) })
  safeHandle('pi:getQuotationLogoPath', (event) => { requireSession(event); return db.getQuotationLogoPath() })
  safeHandle('pi:setQuotationLogoPath', (event, path) => { requireAdmin(event); return db.setQuotationLogoPath(path) })

  // P&I Sanctions Versions
  safeHandle('pi:getSanctionsVersions', (event) => { requireSession(event); return db.getPISanctionsVersions() })
  safeHandle('pi:addSanctionsVersion', (event, data) => { requireAdmin(event); return db.addPISanctionsVersion(data) })
  safeHandle('pi:updateSanctionsVersion', (event, id, updates) => { requireAdmin(event); return db.updatePISanctionsVersion(id, updates) })
  safeHandle('pi:deleteSanctionsVersion', (event, id) => { requireAdmin(event); return db.deletePISanctionsVersion(id) })
  safeHandle('pi:reorderSanctionsVersions', (event, orderedIds) => { requireAdmin(event); return db.reorderPISanctionsVersions(orderedIds) })

  // Vessel Insurance Policies (imported)
  safeHandle('vessels:getInsurancePolicies', (event, vesselId) => { requireSession(event); return db.getVesselInsurancePolicies(vesselId) })
  safeHandle('vessels:importInsurancePoliciesFromExcel', async (event, filePath: string) => {
    requireAdmin(event)
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
        if (!vessel.vesselType && row.vesselType) updates.vesselType = row.vesselType
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
    requireAdmin(event)
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
    const vtNameMap = new Map<string, string>()
    for (const vt of vesselTypes) {
      vtNameMap.set(vt.name.toLowerCase(), vt.name)
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

      // Vessel type - auto-create if missing
      if (row.vesselType) {
        let typeName = vtNameMap.get(row.vesselType.toLowerCase())
        if (!typeName) {
          const created = await db.addVesselType({ name: row.vesselType, order: vesselTypes.length + createdTypes })
          typeName = created.name
          vtNameMap.set(row.vesselType.toLowerCase(), typeName)
          createdTypes++
        }
        updates.vesselType = typeName
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
  safeHandle('db:addClassificationSociety', (event, cs) => { requireAdmin(event); return db.addClassificationSociety(cs) })
  safeHandle('db:updateClassificationSociety', (event, id, updates) => { requireAdmin(event); return db.updateClassificationSociety(id, updates) })
  safeHandle('db:deleteClassificationSociety', (event, id) => { requireAdmin(event); return db.deleteClassificationSociety(id) })
  safeHandle('db:reorderClassificationSocieties', (event, ids) => { requireAdmin(event); return db.reorderClassificationSocieties(ids) })
  safeHandle('vessels:getClassifications', (event, vesselId) => { requireSession(event); return db.getVesselClassifications(vesselId) })
  safeHandle('vessels:setClassifications', (event, vesselId, csIds) => { requireSession(event); return db.setVesselClassifications(vesselId, csIds) })

  // Vessel Types
  safeHandle('db:getVesselTypes', (event) => { requireSession(event); return db.getVesselTypes() })
  safeHandle('db:addVesselType', (event, vt) => { requireAdmin(event); return db.addVesselType(vt) })
  safeHandle('db:updateVesselType', (event, id, updates) => { requireAdmin(event); return db.updateVesselType(id, updates) })
  safeHandle('db:deleteVesselType', (event, id) => { requireAdmin(event); return db.deleteVesselType(id) })
  safeHandle('db:reorderVesselTypes', (event, ids) => { requireAdmin(event); return db.reorderVesselTypes(ids) })

  // Vessel Audit Log
  safeHandle('vessels:getAuditLog', (event, vesselId) => { requireSession(event); return db.getVesselAuditLog(vesselId) })

  // Policy Type Characteristics
  safeHandle('db:getPolicyTypeCharacteristics', (event, policyTypeId) => { requireSession(event); return db.getPolicyTypeCharacteristics(policyTypeId) })
  safeHandle('db:addPolicyTypeCharacteristic', (event, c) => { requireAdmin(event); return db.addPolicyTypeCharacteristic(c) })
  safeHandle('db:updatePolicyTypeCharacteristic', (event, id, updates) => { requireAdmin(event); return db.updatePolicyTypeCharacteristic(id, updates) })
  safeHandle('db:deletePolicyTypeCharacteristic', (event, id) => { requireAdmin(event); return db.deletePolicyTypeCharacteristic(id) })
  safeHandle('db:reorderPolicyTypeCharacteristics', (event, ids) => { requireAdmin(event); return db.reorderPolicyTypeCharacteristics(ids) })

  // Policy Type Conditions
  safeHandle('db:getPolicyTypeConditions', (event, policyTypeId) => { requireSession(event); return db.getPolicyTypeConditions(policyTypeId) })
  safeHandle('db:addPolicyTypeCondition', (event, c) => { requireAdmin(event); return db.addPolicyTypeCondition(c) })
  safeHandle('db:updatePolicyTypeCondition', (event, id, updates) => { requireAdmin(event); return db.updatePolicyTypeCondition(id, updates) })
  safeHandle('db:deletePolicyTypeCondition', (event, id) => { requireAdmin(event); return db.deletePolicyTypeCondition(id) })

  // Vessel Dynamic Policies
  safeHandle('vessels:getDynamicPolicies', (event, vesselId) => { requireSession(event); return db.getVesselDynamicPolicies(vesselId) })
  safeHandle('vessels:getAllDynamicPolicies', (event) => { requireSession(event); return db.getAllVesselDynamicPolicies() })
  safeHandle('vessels:addDynamicPolicy', (event, policy) => { requireSession(event); return db.addVesselDynamicPolicy(policy) })
  safeHandle('vessels:updateDynamicPolicy', (event, id, updates) => { requireSession(event); return db.updateVesselDynamicPolicy(id, updates) })
  safeHandle('vessels:deleteDynamicPolicy', (event, id) => { requireSession(event); return db.deleteVesselDynamicPolicy(id) })
  safeHandle('vessels:setDynamicPolicyValues', (event, policyId, values) => { requireSession(event); return db.setVesselPolicyValues(policyId, values) })

  // Policy Expiry Alerts
  safeHandle('policies:getExpiredActive', (event) => { requireSession(event); return db.getExpiredActivePolicies() })
  safeHandle('policies:getRenewalsByMonth', (event, year: number, month: number) => { requireSession(event); return db.getPolicyRenewalsByMonth(year, month) })
  safeHandle('policies:setQuotationSentDate', (event, policyId: string, date: string | null) => { requireSession(event); return db.setQuotationSentDate(policyId, date) })

  // Renewal Status Types
  safeHandle('renewalStates:getAll', (event) => { requireSession(event); return db.getRenewalStatusTypes() })
  safeHandle('renewalStates:add', (event, name: string, color: string) => { requireSession(event); return db.addRenewalStatusType(name, color) })
  safeHandle('renewalStates:update', (event, id: string, name: string, color: string) => { requireSession(event); return db.updateRenewalStatusType(id, name, color) })
  safeHandle('renewalStates:delete', (event, id: string) => { requireSession(event); return db.deleteRenewalStatusType(id) })
  safeHandle('renewalStates:setForPolicy', (event, policyId: string, statusId: string | null) => { requireSession(event); return db.setRenewalStatusForPolicy(policyId, statusId) })

  // Policy Renewal Notes
  safeHandle('renewalNotes:get', (event, policyId: string, policyNumber: string) => { requireSession(event); return db.getPolicyRenewalNotes(policyId, policyNumber) })
  safeHandle('renewalNotes:add', (event, policyId: string, policyNumber: string, note: string) => {
    const user = requireSession(event)
    return db.addPolicyRenewalNote(policyId, policyNumber, note, user.id, user.username)
  })
  safeHandle('renewalNotes:delete', (event, noteId: string) => {
    const user = requireSession(event)
    return db.deletePolicyRenewalNote(noteId, user.id)
  })

  // Vessel Notes
  safeHandle('vesselNotes:get', (event, vesselId: string) => { requireSession(event); return db.getVesselNotes(vesselId) })
  safeHandle('vesselNotes:add', (event, vesselId: string, note: string) => {
    const user = requireSession(event)
    return db.addVesselNote(vesselId, note, user.id, user.username)
  })
  safeHandle('vesselNotes:delete', (event, noteId: string) => {
    const user = requireSession(event)
    return db.deleteVesselNote(noteId, user.id)
  })

  // Quotations
  safeHandle('db:getQuotations', (event) => { requireSession(event); return db.getQuotations() })
  safeHandle('db:addQuotation', (event, q) => { requireSession(event); return db.addQuotation(q) })
  safeHandle('db:updateQuotation', (event, id, updates) => { requireSession(event); return db.updateQuotation(id, updates) })
  safeHandle('db:deleteQuotation', (event, id) => { requireSession(event); return db.deleteQuotation(id) })

  // Quotation Sub-Tables
  safeHandle('db:getQuotationAssureds', (event, qId) => { requireSession(event); return db.getQuotationAssureds(qId) })
  safeHandle('db:addQuotationAssured', (event, data) => { requireSession(event); return db.addQuotationAssured(data) })
  safeHandle('db:updateQuotationAssured', (event, id, updates) => { requireSession(event); return db.updateQuotationAssured(id, updates) })
  safeHandle('db:deleteQuotationAssured', (event, id) => { requireSession(event); return db.deleteQuotationAssured(id) })
  safeHandle('db:reorderQuotationAssureds', (event, ids) => { requireSession(event); return db.reorderQuotationAssureds(ids) })

  safeHandle('db:getQuotationNewVessel', (event, qId) => { requireSession(event); return db.getQuotationNewVessel(qId) })
  safeHandle('db:upsertQuotationNewVessel', (event, qId, data) => { requireSession(event); return db.upsertQuotationNewVessel(qId, data) })
  safeHandle('db:deleteQuotationNewVessel', (event, qId) => { requireSession(event); return db.deleteQuotationNewVessel(qId) })

  safeHandle('db:getQuotationSubLimits', (event, qId) => { requireSession(event); return db.getQuotationSubLimits(qId) })
  safeHandle('db:addQuotationSubLimit', (event, data) => { requireSession(event); return db.addQuotationSubLimit(data) })
  safeHandle('db:updateQuotationSubLimit', (event, id, updates) => { requireSession(event); return db.updateQuotationSubLimit(id, updates) })
  safeHandle('db:deleteQuotationSubLimit', (event, id) => { requireSession(event); return db.deleteQuotationSubLimit(id) })

  safeHandle('db:getQuotationClauses', (event, qId) => { requireSession(event); return db.getQuotationClauses(qId) })
  safeHandle('db:setQuotationClauses', (event, qId, ids, overrides) => { requireSession(event); return db.setQuotationClauses(qId, ids, overrides) })
  safeHandle('db:getQuotationClauseOverrides', (event, qId) => { requireSession(event); return db.getQuotationClauseOverrides(qId) })
  safeHandle('db:updateQuotationClauseOverride', (event, qId, clauseId, override) => { requireSession(event); return db.updateQuotationClauseOverride(qId, clauseId, override) })

  safeHandle('db:getQuotationAdditionalClauses', (event, qId) => { requireSession(event); return db.getQuotationAdditionalClauses(qId) })
  safeHandle('db:addQuotationAdditionalClause', (event, data) => { requireSession(event); return db.addQuotationAdditionalClause(data) })
  safeHandle('db:deleteQuotationAdditionalClause', (event, id) => { requireSession(event); return db.deleteQuotationAdditionalClause(id) })

  safeHandle('db:getQuotationWarranties', (event, qId) => { requireSession(event); return db.getQuotationWarranties(qId) })
  safeHandle('db:setQuotationWarranties', (event, qId, ids) => { requireSession(event); return db.setQuotationWarranties(qId, ids) })

  safeHandle('db:getQuotationDeductibles', (event, qId) => { requireSession(event); return db.getQuotationDeductibles(qId) })
  safeHandle('db:addQuotationDeductible', (event, data) => { requireSession(event); return db.addQuotationDeductible(data) })
  safeHandle('db:updateQuotationDeductible', (event, id, updates) => { requireSession(event); return db.updateQuotationDeductible(id, updates) })
  safeHandle('db:deleteQuotationDeductible', (event, id) => { requireSession(event); return db.deleteQuotationDeductible(id) })

  safeHandle('db:getQuotationTextDeductibles', (event, qId) => { requireSession(event); return db.getQuotationTextDeductibles(qId) })
  safeHandle('db:addQuotationTextDeductible', (event, data) => { requireSession(event); return db.addQuotationTextDeductible(data) })
  safeHandle('db:deleteQuotationTextDeductible', (event, id) => { requireSession(event); return db.deleteQuotationTextDeductible(id) })

  safeHandle('db:getQuotationExclusions', (event, qId) => { requireSession(event); return db.getQuotationExclusions(qId) })
  safeHandle('db:setQuotationExclusions', (event, qId, items) => { requireSession(event); return db.setQuotationExclusions(qId, items) })

  safeHandle('db:getQuotationExcludedCountries', (event, qId) => { requireSession(event); return db.getQuotationExcludedCountries(qId) })
  safeHandle('db:setQuotationExcludedCountries', (event, qId, countries) => { requireSession(event); return db.setQuotationExcludedCountries(qId, countries) })

  safeHandle('db:getQuotationSubjectivities', (event, qId) => { requireSession(event); return db.getQuotationSubjectivities(qId) })
  safeHandle('db:addQuotationSubjectivity', (event, data) => { requireSession(event); return db.addQuotationSubjectivity(data) })
  safeHandle('db:updateQuotationSubjectivity', (event, id, text) => { requireSession(event); return db.updateQuotationSubjectivity(id, text) })
  safeHandle('db:deleteQuotationSubjectivity', (event, id) => { requireSession(event); return db.deleteQuotationSubjectivity(id) })

  safeHandle('db:getQuotationInstalments', (event, qId) => { requireSession(event); return db.getQuotationInstalments(qId) })
  safeHandle('db:setQuotationInstalments', (event, qId, instalments) => { requireSession(event); return db.setQuotationInstalments(qId, instalments) })

  safeHandle('db:getQuotationInformation', (event, qId) => { requireSession(event); return db.getQuotationInformation(qId) })
  safeHandle('db:addQuotationInformation', (event, data) => { requireSession(event); return db.addQuotationInformation(data) })
  safeHandle('db:deleteQuotationInformation', (event, id) => { requireSession(event); return db.deleteQuotationInformation(id) })

  safeHandle('db:getQuotationNotes', (event, qId) => { requireSession(event); return db.getQuotationNotes(qId) })
  safeHandle('db:addQuotationNote', (event, data) => { requireSession(event); return db.addQuotationNote(data) })
  safeHandle('db:updateQuotationNote', (event, id, updates) => { requireSession(event); return db.updateQuotationNote(id, updates) })
  safeHandle('db:deleteQuotationNote', (event, id) => { requireSession(event); return db.deleteQuotationNote(id) })

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
    requireSession(event)
    await db.setSetting(REPORT_SETTINGS_KEY, JSON.stringify(settings))
  })

  safeHandle('settings:getUserSectionAccess', async (event) => {
    requireSession(event)
    const raw = await db.getSetting('userSectionAccess')
    return raw ? JSON.parse(raw) : []
  })

  safeHandle('settings:setUserSectionAccess', async (event, sectionIds: string[]) => {
    requireAdmin(event)
    await db.setSetting('userSectionAccess', JSON.stringify(sectionIds))
  })

  createWindow()

  // Start the compliance scheduler after window is created
  complianceScheduler.start()

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
