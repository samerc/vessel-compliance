import { app, shell, BrowserWindow, ipcMain } from 'electron'
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

  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
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
    // Check DB Connection
    const configPath = getConfigPath()
    if (configPath) {
      db.setConfigPath(configPath)
    }
    const connected = await db.connect()

    // If not connected, we should probably inform the renderer
    // We can use a query param or execute JS
    if (!connected) {
      mainWindow.webContents.send('app:db-status', { connected: false })
    } else {
      await db.initSchema()
      await auth.createInitialAdmin()
      mainWindow.webContents.send('app:db-status', { connected: true })
    }

    mainWindow.show()
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
        if (user.windowX !== null && user.windowX !== undefined) {
          bounds.x = user.windowX
        }
        if (user.windowY !== null && user.windowY !== undefined) {
          bounds.y = user.windowY
        }
        window.setBounds(bounds)
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
  safeHandle('db:updateVessel', (event, id, updates) => { requireSession(event); return db.updateVessel(id, updates) })
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
  safeHandle('db:deleteEntity', (event, id) => { requireAdmin(event); return db.deleteEntity(id) })
  safeHandle('db:purgeAllVesselsAndEntities', (event) => { requireAdmin(event); return db.purgeAllVesselsAndEntities() })
  safeHandle('maintenance:syncSettings', (event) => { requireAdmin(event); return db.syncAssuredRoles() })

  safeHandle('db:getAssuredRoles', (event) => { requireSession(event); return db.getAssuredRoles() })
  safeHandle('db:addAssuredRole', (event, role) => { requireSession(event); return db.addAssuredRole(role) })
  safeHandle('db:updateAssuredRole', (event, id, updates) => { requireSession(event); return db.updateAssuredRole(id, updates) })
  safeHandle('db:deleteAssuredRole', (event, id) => { requireAdmin(event); return db.deleteAssuredRole(id) })

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
  safeHandle('db:deleteSurveyor', (event, id) => { requireAdmin(event); return db.deleteSurveyor(id) })

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
  safeHandle('db:deleteSurveyDefect', (event, id) => { requireAdmin(event); return db.deleteSurveyDefect(id) })
  safeHandle('db:closeDefect', (event, id, closedBy, closureNotes) => { requireSession(event); return db.closeDefect(id, closedBy, closureNotes) })
  safeHandle('db:reopenDefect', (event, id) => { requireSession(event); return db.reopenDefect(id) })
  safeHandle('db:getSurveyAttachments', (event, surveyId) => { requireSession(event); return db.getSurveyAttachments(surveyId) })
  safeHandle('db:addSurveyAttachment', (event, attachment) => { requireSession(event); return db.addSurveyAttachment(attachment) })
  safeHandle('db:deleteSurveyAttachment', (event, id) => { requireAdmin(event); return db.deleteSurveyAttachment(id) })
  safeHandle('db:getOpenDefectsByVessel', (event) => { requireSession(event); return db.getOpenDefectsByVessel() })
  safeHandle('db:getSurveyHistory', (event, vesselId) => { requireSession(event); return db.getSurveyHistory(vesselId) })

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

  // OFAC/Sanctions Check Handler (session required)
  safeHandle('ofac:checkSanctions', async (event, name: string, threshold = 0.6, sources?: string[]) => {
    requireSession(event)
    try {
      const apiKey = getSanctionsApiKey()
      if (!apiKey) {
        console.error('Sanctions API key not configured')
        return {
          status: 'ERROR',
          matchFound: false,
          timestamp: formatDateForMySQL(new Date()),
          matches: [],
          error: 'Sanctions API key not configured. Add sanctionsApiKey to db-config.json'
        }
      }

      const params = new URLSearchParams({
        q: name,
        mode: 'both',
        threshold: threshold.toString(),
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
        .filter((match: any) => (match.score || 0) >= threshold)

      const matchFound = matches.length > 0

      return {
        status: matchFound ? 'POTENTIAL_MATCH' : 'CLEARED',
        matchFound,
        timestamp: formatDateForMySQL(new Date()),
        matches
      }
    } catch (error) {
      console.error('OFAC check failed:', error)
      return {
        status: 'ERROR',
        matchFound: false,
        timestamp: formatDateForMySQL(new Date()),
        matches: []
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
