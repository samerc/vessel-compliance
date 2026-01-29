import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, dirname, resolve, normalize, extname } from 'path'
import { Worker } from 'worker_threads'
import { existsSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { db } from './mysql/adapter'
import { auth } from './auth'
import { complianceScheduler } from './services/ComplianceScheduler'
import { formatDateForMySQL } from './mysql/utils'
import Store from 'electron-store'
import { createPool } from 'mysql2/promise'

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

  // Save window state on change
  const saveState = async () => {
    const bounds = mainWindow.getBounds()
    store.set('windowState', bounds)

    // Also save to database if user is logged in
    const windowId = mainWindow.id
    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    if (user) {
      await db.updateUserWindowPreferences(user.id, bounds.width, bounds.height, bounds.x, bounds.y)
    }
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
    shell.openExternal(details.url)
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

  // Auth Handlers
  ipcMain.handle('auth:login', async (event, { username, password }) => {
    const result = await auth.login(username, password)
    if (result.success && result.sessionId) {
      // Store session ID for this window
      const webContents = event.sender
      const window = BrowserWindow.fromWebContents(webContents)
      const windowId = window?.id
      if (windowId) {
        windowSessions.set(windowId, result.sessionId)
      }

      // Apply user's window preferences if they exist
      const user = result.user
      if (user && window && user.windowWidth && user.windowHeight) {
        const bounds: { width: number; height: number; x?: number; y?: number } = {
          width: user.windowWidth,
          height: user.windowHeight
        }
        // Only include x and y if they're defined (not null from DB)
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

  ipcMain.handle('auth:getSession', async (event) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return null

    const sessionId = windowSessions.get(windowId)
    return auth.getCurrentUser(sessionId)
  })

  ipcMain.handle('auth:logout', async (event) => {
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

  // Theme Handlers (user-specific)
  ipcMain.handle('theme:get', async (event) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return 'dark'

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    return user?.themePreference || 'dark'
  })

  ipcMain.handle('theme:set', async (event, theme: 'light' | 'dark') => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    if (user) {
      await db.updateUserTheme(user.id, theme)
      // Update session with new theme preference
      const session = auth.getSessionData(sessionId)
      if (session) {
        session.user.themePreference = theme
      }
    }
  })

  // Window Preferences Handlers (user-specific)
  ipcMain.handle('window:getPreferences', async (event) => {
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

  ipcMain.handle('window:savePreferences', async (event) => {
    const webContents = event.sender
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) return

    const windowId = window.id
    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    if (user) {
      const bounds = window.getBounds()
      await db.updateUserWindowPreferences(user.id, bounds.width, bounds.height, bounds.x, bounds.y)
    }
  })

  // File Type Settings Handlers
  ipcMain.handle('fileTypes:getSettings', async (event) => {
    // Security: Only admins can view file type settings
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to get file type settings')
      return { allowedExtensions: [], blockedExtensions: [] }
    }
    return await db.getFileTypeSettings()
  })

  ipcMain.handle('fileTypes:setSettings', async (event, settings: { allowedExtensions: string[]; blockedExtensions: string[] }) => {
    // Security: Only admins can change file type settings
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to set file type settings')
      return { allowedExtensions: [], blockedExtensions: [] }
    }
    // Normalize extensions to lowercase and ensure they start with a dot
    const normalizeExtensions = (exts: string[]) => {
      return exts.map(ext => {
        ext = ext.toLowerCase().trim()
        return ext.startsWith('.') ? ext : `.${ext}`
      })
    }

    const normalized = {
      allowedExtensions: normalizeExtensions(settings.allowedExtensions),
      blockedExtensions: normalizeExtensions(settings.blockedExtensions)
    }

    // Save to database (centralized storage for all users)
    await db.setFileTypeSettings(normalized)
    return normalized
  })

  ipcMain.handle('fileTypes:validateFile', async (_, filePath: string) => {
    const settings = await db.getFileTypeSettings()
    const ext = extname(filePath).toLowerCase()

    // Check if blocked
    if (settings.blockedExtensions.includes(ext)) {
      return {
        valid: false,
        reason: `File type '${ext}' is blocked by administrator`
      }
    }

    // Check if allowed (only if allowed list has items)
    if (settings.allowedExtensions.length > 0 && !settings.allowedExtensions.includes(ext)) {
      return {
        valid: false,
        reason: `File type '${ext}' is not in the allowed list. Allowed types: ${settings.allowedExtensions.join(', ')}`
      }
    }

    return { valid: true }
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

  // Database IPC Handlers
  ipcMain.handle('db:getDocumentTypes', () => db.getDocumentTypes())
  ipcMain.handle('db:addDocumentType', (_, docType) => db.addDocumentType(docType))
  ipcMain.handle('db:updateDocumentType', (_, id, updates) => db.updateDocumentType(id, updates))
  ipcMain.handle('db:deleteDocumentType', (_, id) => db.deleteDocumentType(id))

  ipcMain.handle('db:getFleets', () => db.getFleets())
  ipcMain.handle('db:addFleet', (_, fleet) => db.addFleet(fleet))
  ipcMain.handle('db:deleteFleet', (_, id) => db.deleteFleet(id))

  ipcMain.handle('db:getVessels', () => db.getVessels())
  ipcMain.handle('db:getVesselsPaginated', (_, params) => db.getVesselsPaginated(params))
  ipcMain.handle('db:addVessel', async (_, vessel) => {
    try {
      const result = await db.addVessel(vessel)
      return { success: true, data: result }
    } catch (error: any) {
      // Return error as a value instead of throwing to avoid console noise
      return { success: false, message: error.message }
    }
  })
  ipcMain.handle('db:updateVessel', (_, id, updates) => db.updateVessel(id, updates))
  ipcMain.handle('db:deleteVessel', async (event, id) => {
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to delete vessel')
      return { success: false, message: 'Unauthorized' }
    }
    await db.deleteVessel(id)
    return { success: true }
  })

  ipcMain.handle('db:getVesselDocuments', (_, vesselId) => db.getVesselDocuments(vesselId))
  ipcMain.handle('db:upsertVesselDocument', (_, doc) => db.upsertVesselDocument(doc))
  ipcMain.handle('db:updateVesselDocumentExpiry', (_, vesselId, docTypeId, expiryDate) => db.updateVesselDocumentExpiry(vesselId, docTypeId, expiryDate))
  ipcMain.handle('db:updateVesselDocumentReceivedDate', (_, vesselId, docTypeId, receivedDate) => db.updateVesselDocumentReceivedDate(vesselId, docTypeId, receivedDate))

  // Entity IPC Handlers
  ipcMain.handle('db:getEntities', () => db.getEntities())
  ipcMain.handle('db:addEntity', (_, entity) => db.addEntity(entity))
  ipcMain.handle('db:updateEntity', (_, id, updates) => db.updateEntity(id, updates))
  ipcMain.handle('db:deleteEntity', (_, id) => db.deleteEntity(id))

  ipcMain.handle('db:getAssuredRoles', () => db.getAssuredRoles())
  ipcMain.handle('db:addAssuredRole', (_, role) => db.addAssuredRole(role))
  ipcMain.handle('db:updateAssuredRole', (_, id, updates) => db.updateAssuredRole(id, updates))
  ipcMain.handle('db:deleteAssuredRole', (_, id) => db.deleteAssuredRole(id))

  ipcMain.handle('db:getVesselAssureds', (_, vesselId) => db.getVesselAssureds(vesselId))
  ipcMain.handle('db:addVesselAssured', (_, assured) => db.addVesselAssured(assured))
  ipcMain.handle('db:deleteVesselAssured', (_, id) => db.deleteVesselAssured(id))

  ipcMain.handle('db:getEntityUBOs', (_, assuredEntityId) => db.getEntityUBOs(assuredEntityId))
  ipcMain.handle('db:addEntityUBO', (_, ubo) => db.addEntityUBO(ubo))
  ipcMain.handle('db:deleteEntityUBO', (_, ubo) => db.deleteEntityUBO(ubo))

  // Surveyors
  ipcMain.handle('db:getSurveyors', () => db.getSurveyors())
  ipcMain.handle('db:addSurveyor', (_, surveyor) => db.addSurveyor(surveyor))
  ipcMain.handle('db:updateSurveyor', (_, id, updates) => db.updateSurveyor(id, updates))
  ipcMain.handle('db:deleteSurveyor', (_, id) => db.deleteSurveyor(id))

  // Condition Surveys
  ipcMain.handle('db:getConditionSurveys', (_, vesselId) => db.getConditionSurveys(vesselId))
  ipcMain.handle('db:addConditionSurvey', (_, survey) => db.addConditionSurvey(survey))
  ipcMain.handle('db:updateConditionSurvey', (_, id, updates) => db.updateConditionSurvey(id, updates))
  ipcMain.handle('db:deleteConditionSurvey', (_, id) => db.deleteConditionSurvey(id))
  ipcMain.handle('db:getSurveyDefects', (_, surveyId) => db.getSurveyDefects(surveyId))
  ipcMain.handle('db:addSurveyDefect', (_, defect) => db.addSurveyDefect(defect))
  ipcMain.handle('db:updateSurveyDefect', (_, id, updates) => db.updateSurveyDefect(id, updates))
  ipcMain.handle('db:deleteSurveyDefect', (_, id) => db.deleteSurveyDefect(id))
  ipcMain.handle('db:closeDefect', (_, id, closedBy, closureNotes) => db.closeDefect(id, closedBy, closureNotes))
  ipcMain.handle('db:reopenDefect', (_, id) => db.reopenDefect(id))
  ipcMain.handle('db:getSurveyAttachments', (_, surveyId) => db.getSurveyAttachments(surveyId))
  ipcMain.handle('db:addSurveyAttachment', (_, attachment) => db.addSurveyAttachment(attachment))
  ipcMain.handle('db:deleteSurveyAttachment', (_, id) => db.deleteSurveyAttachment(id))
  ipcMain.handle('db:getOpenDefectsByVessel', () => db.getOpenDefectsByVessel())
  ipcMain.handle('db:getSurveyHistory', (_, vesselId) => db.getSurveyHistory(vesselId))

  // File System IPC Handlers
  ipcMain.handle('fs:exists', (_, filePath) => existsSync(filePath))
  ipcMain.handle('fs:open', (_, filePath) => shell.openPath(filePath))

  // Excel Import Handlers
  ipcMain.handle('dialog:openFile', async () => {
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

  ipcMain.handle('excel:import', async (_, filePath: string) => {
    const { ExcelImporter } = await import('./excelImporter')
    const importer = new ExcelImporter()
    return await importer.importFromExcel(filePath)
  })

  // Word Import Handlers
  ipcMain.handle('dialog:openFileWord', async () => {
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

  ipcMain.handle('word:importDefects', async (_, surveyId: string, filePath: string) => {
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
          console.error(`Worker stopped with exit code ${code}`)
          resolve({ success: false, message: 'Worker stopped unexpectedly', count: 0 })
        }
      })
    })
  })

  // User Management
  ipcMain.handle('auth:createUser', async (_, { username, password, role }) => {
    return auth.createUser(username, password, role)
  })

  ipcMain.handle('db:getUsers', async () => {
    return db.getUsers()
  })

  ipcMain.handle('db:deleteUser', async (_, id) => {
    return db.deleteUser(id)
  })

  // OFAC/Sanctions Check Handler
  ipcMain.handle('ofac:checkSanctions', async (_, name: string, threshold = 0.6, sources?: string[]) => {
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
  ipcMain.handle('compliance:getScheduleSettings', async (event) => {
    if (!isAdminRequest(event)) {
      return { enabled: false, dayOfWeek: 1, timeOfDay: '09:00', threshold: 85, includeVessels: true, skipCleared: true }
    }
    return await db.getComplianceScheduleSettings()
  })

  ipcMain.handle('compliance:setScheduleSettings', async (event, settings) => {
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to set compliance schedule settings')
      return { success: false, message: 'Unauthorized' }
    }

    // Calculate next run time
    const nextRunAt = complianceScheduler.calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
    settings.nextRunAt = nextRunAt

    await db.setComplianceScheduleSettings(settings)

    // Restart scheduler with new settings
    complianceScheduler.start()

    return { success: true }
  })

  ipcMain.handle('compliance:getCheckLogs', async () => {
    return await db.getComplianceCheckLogs()
  })

  ipcMain.handle('compliance:getCheckResults', async (_, logId?: string, status?: string) => {
    return await db.getComplianceCheckResults(logId, status)
  })

  ipcMain.handle('compliance:getPendingResults', async () => {
    return await db.getPendingComplianceResults()
  })

  ipcMain.handle('compliance:markResultReviewed', async (event, resultId: string) => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    if (user) {
      await db.markComplianceResultReviewed(resultId, user.username)
    }
  })

  ipcMain.handle('compliance:decideResult', async (event, resultId: string, decision: 'sanctioned' | 'cleared') => {
    const webContents = event.sender
    const windowId = BrowserWindow.fromWebContents(webContents)?.id
    if (!windowId) return { success: false, message: 'Invalid window context' }

    const sessionId = windowSessions.get(windowId)
    const user = auth.getCurrentUser(sessionId)
    if (user) {
      await db.decideComplianceResult(resultId, decision, user.username)
      return { success: true }
    }
    return { success: false, message: 'Unauthorized' }
  })

  ipcMain.handle('compliance:runManualCheck', async (event) => {
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to run manual compliance check')
      return { success: false, message: 'Unauthorized' }
    }

    try {
      await complianceScheduler.runComplianceCheck()
      return { success: true }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  createWindow()

  // Start the compliance scheduler after window is created
  // Start the compliance scheduler after window is created
  complianceScheduler.start()

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
