import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  getDocumentTypes: () => ipcRenderer.invoke('db:getDocumentTypes'),
  addDocumentType: (docType) => ipcRenderer.invoke('db:addDocumentType', docType),
  updateDocumentType: (id, updates) => ipcRenderer.invoke('db:updateDocumentType', id, updates),
  deleteDocumentType: (id) => ipcRenderer.invoke('db:deleteDocumentType', id),

  getFleets: () => ipcRenderer.invoke('db:getFleets'),
  addFleet: (fleet) => ipcRenderer.invoke('db:addFleet', fleet),
  deleteFleet: (id) => ipcRenderer.invoke('db:deleteFleet', id),

  getVessels: () => ipcRenderer.invoke('db:getVessels'),
  addVessel: (vessel) => ipcRenderer.invoke('db:addVessel', vessel),
  updateVessel: (id, updates) => ipcRenderer.invoke('db:updateVessel', id, updates),
  deleteVessel: (id) => ipcRenderer.invoke('db:deleteVessel', id),

  getVesselDocuments: (vesselId) => ipcRenderer.invoke('db:getVesselDocuments', vesselId),
  upsertVesselDocument: (doc) => ipcRenderer.invoke('db:upsertVesselDocument', doc),
  updateVesselDocumentExpiry: (vesselId, docTypeId, expiryDate) => ipcRenderer.invoke('db:updateVesselDocumentExpiry', vesselId, docTypeId, expiryDate),
  updateVesselDocumentReceivedDate: (vesselId, docTypeId, receivedDate) => ipcRenderer.invoke('db:updateVesselDocumentReceivedDate', vesselId, docTypeId, receivedDate),

  getEntities: () => ipcRenderer.invoke('db:getEntities'),
  addEntity: (entity) => ipcRenderer.invoke('db:addEntity', entity),
  deleteEntity: (id) => ipcRenderer.invoke('db:deleteEntity', id),

  getAssuredRoles: () => ipcRenderer.invoke('db:getAssuredRoles'),
  addAssuredRole: (role) => ipcRenderer.invoke('db:addAssuredRole', role),
  deleteAssuredRole: (id) => ipcRenderer.invoke('db:deleteAssuredRole', id),

  getVesselAssureds: (vesselId) => ipcRenderer.invoke('db:getVesselAssureds', vesselId),
  addVesselAssured: (assured) => ipcRenderer.invoke('db:addVesselAssured', assured),
  deleteVesselAssured: (id) => ipcRenderer.invoke('db:deleteVesselAssured', id),

  getEntityUBOs: (assuredEntityId) => ipcRenderer.invoke('db:getEntityUBOs', assuredEntityId),
  addEntityUBO: (ubo) => ipcRenderer.invoke('db:addEntityUBO', ubo),
  deleteEntityUBO: (ubo) => ipcRenderer.invoke('db:deleteEntityUBO', ubo),

  fsExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  fsOpen: (filePath) => ipcRenderer.invoke('fs:open', filePath),
  getFilePath: (file: File) => webUtils.getPathForFile(file)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
