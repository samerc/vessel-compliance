import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, dirname } from 'path'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { db } from './mysql/adapter'
import { auth } from './auth'
import Store from 'electron-store'

const store = new Store()

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
  const saveState = () => {
    const bounds = mainWindow.getBounds()
    store.set('windowState', bounds)
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
  ipcMain.handle('auth:login', async (_, { username, password }) => {
    const result = await auth.login(username, password)
    if (result.success && result.user) {
      store.set('currentUser', result.user)
    }
    return result
  })

  ipcMain.handle('auth:getSession', async () => {
    return store.get('currentUser') || null
  })

  ipcMain.handle('auth:logout', async () => {
    store.delete('currentUser')
  })

  // Setup Handlers
  ipcMain.handle('theme:get', () => {
    return store.get('theme', 'dark')
  })

  ipcMain.handle('theme:set', (_, theme: 'light' | 'dark') => {
    store.set('theme', theme)
  })

  ipcMain.handle('setup:selectDirectory', async () => {
    const { dialog } = require('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('setup:saveConfig', async (_, { config, directory }) => {
    try {
      const configPath = join(directory, 'db-config.json')
      if (!existsSync(directory)) {
        mkdirSync(directory, { recursive: true })
      }
      writeFileSync(configPath, JSON.stringify(config, null, 2))

      store.set('dbConfigDir', directory)
      db.setConfigPath(configPath)

      // Try to connect
      const connected = await db.connect()
      if (connected) {
        await db.initSchema()
        await auth.createInitialAdmin()
        return { success: true }
      } else {
        return { success: false, message: 'Could not connect with these settings' }
      }
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('setup:checkConnection', async () => {
    return await db.connect()
  })

  ipcMain.handle('setup:getConfigPath', () => {
    return getConfigPath()
  })

  ipcMain.handle('setup:loadConfigFromDir', async (_, directory: string) => {
    try {
      const configPath = join(directory, 'db-config.json')
      if (!existsSync(configPath)) {
        return { success: false, message: 'No db-config.json found in this directory' }
      }

      // Update store
      store.set('dbConfigDir', directory)
      db.setConfigPath(configPath)

      // Try to connect
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
        return { success: false, message: 'Could not connect with these settings' }
      }
    } catch (error: any) {
      return { success: false, message: error.message }
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
      // Common words to strip for better search precision
      const stopWords = [
        'shipping', 'maritime', 'marine', 'vessel', 'ship', 'tanker', 'cargo',
        'ltd', 'limited', 'inc', 'incorporated', 'corp', 'corporation', 'co',
        'llc', 'plc', 'sa', 'ag', 'gmbh', 'bv', 'nv', 'pte', 'pvt', 'private',
        'international', 'intl', 'global', 'worldwide', 'group', 'holdings',
        'the', 'and', 'of', 'for'
      ]

      // Clean the search term
      const cleanName = name
        .toLowerCase()
        .split(/\s+/)
        .filter(word => !stopWords.includes(word.replace(/[.,]/g, '')))
        .join(' ')
        .trim()

      // Use cleaned name if it has content, otherwise use original
      const searchTerm = cleanName.length >= 2 ? cleanName : name

      const response = await fetch('https://api.sanctions.network/rpc/search_sanctions', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: searchTerm })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const results = await response.json()

      // Filter results by relevance - check if any result name contains our search words
      const searchWords = searchTerm.toLowerCase().split(/\s+/).filter(w => w.length >= 2)
      const filteredResults = Array.isArray(results) ? results.filter((result: any) => {
        const resultNames = (result.names || []).map((n: string) => n.toLowerCase())
        // Check if any search word appears in any of the result's names
        return searchWords.some(searchWord =>
          resultNames.some((resultName: string) =>
            resultName.includes(searchWord) || searchWord.includes(resultName.split(/\s+/)[0])
          )
        )
      }).slice(0, 20) : [] // Limit to 20 most relevant results

      const matchFound = filteredResults.length > 0

      return {
        status: matchFound ? 'POTENTIAL_MATCH' : 'CLEARED',
        matchFound,
        timestamp: new Date().toISOString(),
        matches: filteredResults
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

  createWindow()

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
