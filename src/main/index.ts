import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { db } from './db'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
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
  ipcMain.handle('db:deleteEntity', (_, id) => db.deleteEntity(id))

  ipcMain.handle('db:getAssuredRoles', () => db.getAssuredRoles())
  ipcMain.handle('db:addAssuredRole', (_, role) => db.addAssuredRole(role))
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
