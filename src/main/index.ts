import { app, shell, BrowserWindow, ipcMain, Notification } from 'electron'
import { join, dirname, resolve, normalize, extname } from 'path'
import { existsSync, writeFileSync, mkdirSync, readFileSync, statSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { db } from './mysql/adapter'
import { auth } from './auth'
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

// Compliance Scheduler
let complianceCheckTimer: NodeJS.Timeout | null = null

function calculateNextRunTime(dayOfWeek: number, timeOfDay: string): string {
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

async function runComplianceCheck(): Promise<void> {
  console.log('Starting scheduled compliance check...')

  const settings = await db.getComplianceScheduleSettings()
  if (!settings.enabled) {
    console.log('Compliance check is disabled, skipping')
    return
  }

  const apiKey = getSanctionsApiKey()
  if (!apiKey) {
    console.error('Sanctions API key not configured, skipping compliance check')
    return
  }

  // Get all entities and optionally vessels
  const entities = await db.getEntities()
  const vessels = settings.includeVessels ? await db.getVessels() : []

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

  try {
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
    settings.nextRunAt = calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
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
    await db.updateComplianceCheckLog(logId, {
      status: 'failed',
      error: error.message
    })
  }
}

async function startComplianceScheduler(): Promise<void> {
  // Clear existing timer
  if (complianceCheckTimer) {
    clearTimeout(complianceCheckTimer)
    complianceCheckTimer = null
  }

  if (!db.isConnected()) {
    console.log('Database not connected, scheduler will start after connection')
    return
  }

  const settings = await db.getComplianceScheduleSettings()
  if (!settings.enabled) {
    console.log('Compliance scheduler is disabled')
    return
  }

  const nextRunAt = settings.nextRunAt || calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
  const nextRunTime = new Date(nextRunAt)
  const now = new Date()
  const msUntilNextRun = nextRunTime.getTime() - now.getTime()

  if (msUntilNextRun <= 0) {
    // Run immediately and schedule next
    console.log('Scheduled compliance check is overdue, running now...')
    await runComplianceCheck()
    startComplianceScheduler() // Reschedule
    return
  }

  // Cap at 24 hours to avoid timer overflow issues
  const maxDelay = 24 * 60 * 60 * 1000
  const delay = Math.min(msUntilNextRun, maxDelay)

  console.log(`Next compliance check scheduled for ${nextRunTime.toLocaleString()} (in ${Math.round(delay / 1000 / 60)} minutes)`)

  complianceCheckTimer = setTimeout(async () => {
    if (msUntilNextRun > maxDelay) {
      // Haven't reached the target time yet, reschedule
      startComplianceScheduler()
    } else {
      // Time to run
      await runComplianceCheck()
      startComplianceScheduler() // Schedule next run
    }
  }, delay)
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
        await testPool.end().catch(() => {})
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
        } catch {}
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
        await testPool.end().catch(() => {})
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
        await testPool.end().catch(() => {})
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
  ipcMain.handle('db:addVessel', (_, vessel) => db.addVessel(vessel))
  ipcMain.handle('db:updateVessel', (_, id, updates) => db.updateVessel(id, updates))
  ipcMain.handle('db:deleteVessel', (_, id) => db.deleteVessel(id))

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
    try {
      const fs = await import('fs')
      const path = await import('path')

      let text = ''
      const ext = path.extname(filePath).toLowerCase()

      // Extract text based on file type
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse')
        const dataBuffer = fs.readFileSync(filePath)
        const pdfData = await pdfParse(dataBuffer)
        text = pdfData.text
      } else {
        // Word document
        const mammoth = await import('mammoth')
        const buffer = fs.readFileSync(filePath)
        const result = await mammoth.extractRawText({ buffer })
        text = result.value
      }

      // Parse defects from text - Two-pass approach for complex PDF layouts
      const lines = text.split('\n')
      const defects: Array<{ number: string; description: string; dueDate?: string; severity: string }> = []

      // Pass 1: Collect standalone defect numbers (before LIST OF DEFICIENCIES)
      const standaloneNumbers: string[] = []
      let foundRef = false
      let foundListOfDeficiencies = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        if (line.includes('Ref')) {
          foundRef = true
          continue
        }
        if (line.includes('LIST OF DEFICIENCIES')) {
          foundListOfDeficiencies = true
          break
        }

        if (foundRef && !foundListOfDeficiencies) {
          const numberMatch = line.match(/^(\d+\.?\d*)$/)
          if (numberMatch) {
            standaloneNumbers.push(numberMatch[1])
          }
        }
      }

      // Pass 2: Process main deficiencies section
      const descriptions: string[] = []
      const itemsNotSurveyedNumbers: string[] = []
      const itemsNotSurveyedDescriptions: string[] = []
      let inDeficienciesSection = false
      let inObservationSection = false
      let inItemsNotSurveyedSection = false
      let beforeItemsNotSurveyed = false

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()

        // Detect sections
        if (line.includes('LIST OF DEFICIENCIES')) {
          inDeficienciesSection = true
          inObservationSection = false
          inItemsNotSurveyedSection = false
          beforeItemsNotSurveyed = false
          continue
        }
        if (line.includes('OBSERVATION') && !line.includes('for the observations')) {
          inDeficienciesSection = false
          inObservationSection = true
          inItemsNotSurveyedSection = false
          beforeItemsNotSurveyed = false
          continue
        }
        if (line.includes('ITEMS NOT SURVEYED')) {
          inDeficienciesSection = false
          inObservationSection = false
          inItemsNotSurveyedSection = true
          beforeItemsNotSurveyed = false
          continue
        }
        if (line.includes('NOTE') && line.includes('defects are not rectified')) {
          inDeficienciesSection = false
          continue
        }
        // Don't break on "Vessel's Master" - it can appear in middle of text
        // Only break on second occurrence of signature sections (after ITEMS NOT SURVEYED)
        if ((line.includes('Vesse\'sMaster') || line.includes('Attending Surveyor')) && inItemsNotSurveyedSection) {
          break
        }

        if (!inDeficienciesSection && !inObservationSection && !inItemsNotSurveyedSection && !beforeItemsNotSurveyed) continue
        if (!line) continue

        // Skip headers and non-relevant lines (but allow short numbers in deficiencies or beforeItemsNotSurveyed)
        if (line.includes('Vessel') || line.includes('Date') || line.includes('Place of Survey') ||
            line.includes('Master') || line.includes('Surveyor') || line.includes('Superintendent') ||
            line.includes('BJ EXPRESS') || line.includes('Istanbul') || line.includes('DEFICIENCIES & RECOMMENDATIONS') ||
            line.includes('If the defects') || line.includes('Capt.') ||
            line.includes('This section is for')) {
          continue
        }
        // Allow short lines if they could be defect numbers (in deficiencies or beforeItemsNotSurveyed sections)
        if (line.length < 10 && !beforeItemsNotSurveyed && !inDeficienciesSection) {
          continue
        }

        // Try inline format: "20.9 Hydraulic pumps..." or "7.5/7/6/7.7 Date of..." (only in deficiencies section)
        const inlineMatch = line.match(/^([\d\.\/]+)\s+([a-zA-Z].{10,})/)
        if (inlineMatch && inDeficienciesSection) {
          let defectNumber = inlineMatch[1]
          let description = inlineMatch[2].trim()
          let dueDate: string | undefined

          // Check for due date at end
          const dueDateMatch = description.match(/\s+((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(?:\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}))$/)
          if (dueDateMatch) {
            dueDate = dueDateMatch[1]
            description = description.substring(0, description.length - dueDateMatch[0].length).trim()

            const parts = dueDate.split(/[\/\-\.]/)
            if (parts.length === 3) {
              if (parts[0].length === 4) {
                dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
              } else if (parts[2].length === 4) {
                dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
              } else {
                dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
              }
            }
          }

          defects.push({
            number: defectNumber,
            description,
            dueDate,
            severity: ''
          })
          continue
        }

        // Check if it's a standalone number or compound number like "7.5/7/" that continues on next line
        const numberMatch = line.match(/^([\d\.\/]+)$/)
        if (numberMatch) {
          let defectNumber = numberMatch[1]

          // Check if next line completes the number (like "7.5/7/" followed by "6/7.7")
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim()
            const continueNumberMatch = nextLine.match(/^([\d\.\/]+)$/)
            if (continueNumberMatch) {
              defectNumber = defectNumber + continueNumberMatch[1]
              i++ // Skip the next line
            }
          }

          // Look ahead for description
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim()
            if (nextLine && !nextLine.match(/^[\d\.\/]+$/) &&
                !nextLine.includes('Vessel') && !nextLine.includes('Master') &&
                !nextLine.startsWith('-') && nextLine.length > 10) {
              let description = nextLine

              // Collect multi-line descriptions
              for (let k = j + 1; k < lines.length; k++) {
                const contLine = lines[k].trim()
                if (!contLine || contLine.match(/^[\d\.\/]+/) || contLine.includes('NOTE')) {
                  break
                }
                // Stop at bullets or new sections
                if (contLine.startsWith('-') || contLine.match(/^[A-Z][a-z]+ [a-z]+ [a-z]+ [a-z]+/)) {
                  break
                }
                description += ' ' + contLine
                j = k
              }

              let dueDate: string | undefined
              const dueDateMatch = description.match(/\s+((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(?:\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}))$/)
              if (dueDateMatch) {
                dueDate = dueDateMatch[1]
                description = description.substring(0, description.length - dueDateMatch[0].length).trim()

                const parts = dueDate.split(/[\/\-\.]/)
                if (parts.length === 3) {
                  if (parts[0].length === 4) {
                    dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
                  } else if (parts[2].length === 4) {
                    dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                  } else {
                    dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                  }
                }
              }

              defects.push({
                number: defectNumber,
                description,
                dueDate,
                severity: ''
              })
              i = j // Skip processed lines
              break
            }
          }
          continue
        }

        // Collect items before "ITEMS NOT SURVEYED" header (between OBSERVATION and ITEMS NOT SURVEYED)
        if (beforeItemsNotSurveyed) {
          // Standalone number like "17.2" or "21"
          const standaloneMatch = line.match(/^(\d+\.?\d*)$/)
          if (standaloneMatch) {
            itemsNotSurveyedNumbers.push(standaloneMatch[1])
            continue
          }

          // Compound format like "15.14/ Pressure test..."
          const compoundMatch = line.match(/^(\d+\.?\d*\/)\s*(.+)/)
          if (compoundMatch) {
            let fullDesc = compoundMatch[2].trim()
            let compoundNum = compoundMatch[1]

            // Next line has "17.3 and strict..."
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim()
              const secondPartMatch = nextLine.match(/^(\d+\.?\d*)\s+(.+)/)
              if (secondPartMatch) {
                compoundNum = compoundMatch[1] + secondPartMatch[1]
                fullDesc += ' ' + secondPartMatch[2]
                i++

                // Collect continuation lines
                for (let j = i + 1; j < lines.length; j++) {
                  const contLine = lines[j].trim()
                  if (!contLine || contLine.match(/^\d+\.?\d*$/) || contLine.includes('ITEMS NOT SURVEYED')) {
                    break
                  }
                  fullDesc += ' ' + contLine
                  i = j
                }
              }
            }

            defects.push({
              number: compoundNum,
              description: fullDesc,
              dueDate: undefined,
              severity: ''
            })
            continue
          }
          continue
        }

        // Collect descriptions after "ITEMS NOT SURVEYED" header
        if (inItemsNotSurveyedSection) {
          if (line.length > 20 && !line.includes('Vesse\'sMaster') && !line.includes('Capt.')) {
            let fullDesc = line
            // Collect continuation lines
            for (let j = i + 1; j < lines.length; j++) {
              const nextLine = lines[j].trim()
              if (!nextLine || nextLine.includes('Vesse\'sMaster') || nextLine.includes('Capt.')) {
                break
              }
              // If next line looks like start of new description (Function test, Fire hose test, etc.)
              if (nextLine.match(/^(Function|Fire|Pressure)/)) {
                break
              }
              fullDesc += ' ' + nextLine
              i = j
            }
            if (fullDesc.length > 30) {
              itemsNotSurveyedDescriptions.push(fullDesc)
            }
          }
          continue
        }

        // Handle OBSERVATION section - collect multi-line descriptions
        if (inObservationSection) {
          // Skip "This section is for..." line and switch to beforeItemsNotSurveyed mode
          if (line.includes('This section is for')) {
            inObservationSection = false
            beforeItemsNotSurveyed = true
            continue
          }

          // Build full observation text from multiple lines
          let observationText = line
          for (let j = i + 1; j < lines.length; j++) {
            const nextLine = lines[j].trim()
            if (nextLine.includes('ITEMS NOT SURVEYED') ||
                nextLine.includes('This section is for') ||
                nextLine.includes('Vessel\'s Master') ||
                nextLine.match(/^\d+\.?\d*\/?/) ||
                !nextLine) {
              break
            }
            observationText += ' ' + nextLine
            i = j
          }

          if (observationText.length > 20) {
            defects.push({
              number: 'OBS',
              description: observationText,
              dueDate: undefined,
              severity: ''
            })
          }

          // After collecting observation, switch to beforeItemsNotSurveyed mode
          inObservationSection = false
          beforeItemsNotSurveyed = true
          continue
        }

        // Collect potential standalone descriptions (for PDF with separated layout)
        if (!line.match(/^\d+/) && line.length > 15 &&
            line.endsWith('.') &&
            !line.includes('rectified') &&
            !line.includes('Insurer')) {
          descriptions.push(line)
        }
      }

      // Pass 2.5: Match items not surveyed numbers with descriptions
      const minItems = Math.min(itemsNotSurveyedNumbers.length, itemsNotSurveyedDescriptions.length)
      for (let i = 0; i < minItems; i++) {
        defects.push({
          number: itemsNotSurveyedNumbers[i],
          description: itemsNotSurveyedDescriptions[i],
          dueDate: undefined,
          severity: 'Minor'
        })
      }

      // Pass 3: Match standalone numbers with descriptions (for complex PDF layouts)
      if (standaloneNumbers.length > 0 && descriptions.length > 0) {
        const minLength = Math.min(standaloneNumbers.length, descriptions.length)
        for (let i = 0; i < minLength; i++) {
          // Check if this number hasn't been added yet
          if (!defects.find(d => d.number === standaloneNumbers[i])) {
            let description = descriptions[i]
            let dueDate: string | undefined

            const dueDateMatch = description.match(/\s+((?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})|(?:\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}))$/)
            if (dueDateMatch) {
              dueDate = dueDateMatch[1]
              description = description.substring(0, description.length - dueDateMatch[0].length).trim()

              const parts = dueDate.split(/[\/\-\.]/)
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  dueDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
                } else if (parts[2].length === 4) {
                  dueDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                } else {
                  dueDate = `20${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
                }
              }
            }

            defects.push({
              number: standaloneNumbers[i],
              description,
              dueDate,
              severity: ''
            })
          }
        }
      }

      // Sort defects by number for better organization
      defects.sort((a, b) => {
        const numA = parseFloat(a.number)
        const numB = parseFloat(b.number)
        return numA - numB
      })

      // Import defects into database
      let importCount = 0
      for (const defect of defects) {
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

      return { success: true, count: importCount }
    } catch (error: any) {
      console.error('Word import error:', error)
      return { success: false, message: error.message, count: 0 }
    }
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
  ipcMain.handle('ofac:checkSanctions', async (_, name: string) => {
    try {
      const apiKey = getSanctionsApiKey()
      if (!apiKey) {
        console.error('Sanctions API key not configured')
        return {
          status: 'ERROR',
          matchFound: false,
          timestamp: new Date().toISOString(),
          matches: [],
          error: 'Sanctions API key not configured. Add sanctionsApiKey to db-config.json'
        }
      }

      const params = new URLSearchParams({
        q: name,
        mode: 'both',
        threshold: '0.6',
        limit: '20'
      })

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
      const matches = (data.results || []).map((result: any) => ({
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
        created_at: new Date().toISOString(),
        score: result.score
      }))

      const matchFound = matches.length > 0

      return {
        status: matchFound ? 'POTENTIAL_MATCH' : 'CLEARED',
        matchFound,
        timestamp: new Date().toISOString(),
        matches
      }
    } catch (error) {
      console.error('OFAC check failed:', error)
      return {
        status: 'ERROR',
        matchFound: false,
        timestamp: new Date().toISOString(),
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
    const nextRunAt = calculateNextRunTime(settings.dayOfWeek, settings.timeOfDay)
    settings.nextRunAt = nextRunAt

    await db.setComplianceScheduleSettings(settings)

    // Restart scheduler with new settings
    startComplianceScheduler()

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

  ipcMain.handle('compliance:runManualCheck', async (event) => {
    if (!isAdminRequest(event)) {
      console.error('Unauthorized attempt to run manual compliance check')
      return { success: false, message: 'Unauthorized' }
    }

    try {
      await runComplianceCheck()
      return { success: true }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  createWindow()

  // Start the compliance scheduler after window is created
  startComplianceScheduler()

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
