import { contextBridge, ipcRenderer, webUtils } from 'electron'

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
  getVesselsPaginated: (params: any) => ipcRenderer.invoke('db:getVesselsPaginated', params),
  addVessel: (vessel) => ipcRenderer.invoke('db:addVessel', vessel),
  updateVessel: (id, updates) => ipcRenderer.invoke('db:updateVessel', id, updates),
  deleteVessel: (id) => ipcRenderer.invoke('db:deleteVessel', id),

  getVesselDocuments: (vesselId) => ipcRenderer.invoke('db:getVesselDocuments', vesselId),
  upsertVesselDocument: (doc) => ipcRenderer.invoke('db:upsertVesselDocument', doc),
  updateVesselDocumentExpiry: (vesselId, docTypeId, expiryDate) => ipcRenderer.invoke('db:updateVesselDocumentExpiry', vesselId, docTypeId, expiryDate),
  updateVesselDocumentReceivedDate: (vesselId, docTypeId, receivedDate) => ipcRenderer.invoke('db:updateVesselDocumentReceivedDate', vesselId, docTypeId, receivedDate),

  getEntities: () => ipcRenderer.invoke('db:getEntities'),
  getEntitiesPaginated: (params: any) => ipcRenderer.invoke('db:getEntitiesPaginated', params),
  addEntity: (entity) => ipcRenderer.invoke('db:addEntity', entity),
  updateEntity: (id, updates) => ipcRenderer.invoke('db:updateEntity', id, updates),
  deleteEntity: (id) => ipcRenderer.invoke('db:deleteEntity', id),
  purgeAllVesselsAndEntities: () => ipcRenderer.invoke('db:purgeAllVesselsAndEntities'),

  getAssuredRoles: () => ipcRenderer.invoke('db:getAssuredRoles'),
  addAssuredRole: (role) => ipcRenderer.invoke('db:addAssuredRole', role),
  updateAssuredRole: (id, updates) => ipcRenderer.invoke('db:updateAssuredRole', id, updates),
  deleteAssuredRole: (id) => ipcRenderer.invoke('db:deleteAssuredRole', id),

  getVesselAssureds: (vesselId) => ipcRenderer.invoke('db:getVesselAssureds', vesselId),
  addVesselAssured: (assured) => ipcRenderer.invoke('db:addVesselAssured', assured),
  deleteVesselAssured: (id) => ipcRenderer.invoke('db:deleteVesselAssured', id),

  getEntityUBOs: (assuredEntityId) => ipcRenderer.invoke('db:getEntityUBOs', assuredEntityId),
  addEntityUBO: (ubo) => ipcRenderer.invoke('db:addEntityUBO', ubo),
  deleteEntityUBO: (ubo) => ipcRenderer.invoke('db:deleteEntityUBO', ubo),

  fsExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  fsOpen: (filePath) => ipcRenderer.invoke('fs:open', filePath),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  dialogOpenFile: () => ipcRenderer.invoke('dialog:openFile'),
  excelImport: (filePath) => ipcRenderer.invoke('excel:import', filePath),
  dialogOpenFileWord: () => ipcRenderer.invoke('dialog:openFileWord'),
  importDefectsFromWord: (surveyId, filePath) => ipcRenderer.invoke('word:importDefects', surveyId, filePath),

  // Auth & Setup
  login: (username: string, password: string) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changePassword: (currentPassword: string, newPassword: string) => ipcRenderer.invoke('auth:changePassword', { currentPassword, newPassword }),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  authCreateUser: (userData) => ipcRenderer.invoke('auth:createUser', userData),
  getUsers: () => ipcRenderer.invoke('db:getUsers'),
  deleteUser: (id) => ipcRenderer.invoke('db:deleteUser', id),

  setupSelectDirectory: () => ipcRenderer.invoke('setup:selectDirectory'),
  setupSelectConfigFile: () => ipcRenderer.invoke('setup:selectConfigFile'),
  setupSaveConfig: (config: any, directory: string) => ipcRenderer.invoke('setup:saveConfig', { config, directory }),
  setupCheckConnection: () => ipcRenderer.invoke('setup:checkConnection'),
  setupGetConfigPath: () => ipcRenderer.invoke('setup:getConfigPath'),
  setupLoadConfigFromDir: (directory: string) => ipcRenderer.invoke('setup:loadConfigFromDir', directory),
  setupLoadConfigFromFile: (filePath: string) => ipcRenderer.invoke('setup:loadConfigFromFile', filePath),
  onDbStatus: (callback) => ipcRenderer.on('app:db-status', (_, status) => callback(status)),

  themeGet: () => ipcRenderer.invoke('theme:get'),
  themeSet: (theme) => ipcRenderer.invoke('theme:set', theme),
  updateUserWindowPreferences: (width: number, height: number, x?: number, y?: number) => ipcRenderer.invoke('users:updateWindowPreferences', width, height, x, y),
  updateSanctionsThreshold: (threshold: number) => ipcRenderer.invoke('users:updateSanctionsThreshold', threshold),

  // Window Preferences
  windowGetPreferences: () => ipcRenderer.invoke('window:getPreferences'),
  windowSavePreferences: () => ipcRenderer.invoke('window:savePreferences'),

  // File Type Settings
  fileTypesGetSettings: () => ipcRenderer.invoke('fileTypes:getSettings'),
  fileTypesSetSettings: (settings) => ipcRenderer.invoke('fileTypes:setSettings', settings),
  fileTypesValidateFile: (filePath) => ipcRenderer.invoke('fileTypes:validateFile', filePath),

  // OFAC/Sanctions Check
  checkSanctions: (name: string, threshold?: number, sources?: string[]) => ipcRenderer.invoke('ofac:checkSanctions', name, threshold, sources),

  // Compliance Schedule
  complianceGetScheduleSettings: () => ipcRenderer.invoke('compliance:getScheduleSettings'),
  complianceSetScheduleSettings: (settings) => ipcRenderer.invoke('compliance:setScheduleSettings', settings),
  complianceGetCheckLogs: () => ipcRenderer.invoke('compliance:getCheckLogs'),
  complianceGetCheckResults: (logId?: string, status?: string) => ipcRenderer.invoke('compliance:getCheckResults', logId, status),
  complianceGetCheckResultsPaginated: (params: any) => ipcRenderer.invoke('compliance:getCheckResultsPaginated', params),
  complianceGetPendingResults: () => ipcRenderer.invoke('compliance:getPendingResults'),
  complianceMarkResultReviewed: (resultId: string) => ipcRenderer.invoke('compliance:markResultReviewed', resultId),
  complianceDecideResult: (resultId: string, decision: 'sanctioned' | 'cleared') => ipcRenderer.invoke('compliance:decideResult', resultId, decision),
  complianceRunManualCheck: () => ipcRenderer.invoke('compliance:runManualCheck'),

  // Surveyors
  getSurveyors: () => ipcRenderer.invoke('db:getSurveyors'),
  getSurveyorsPaginated: (params: any) => ipcRenderer.invoke('db:getSurveyorsPaginated', params),
  addSurveyor: (surveyor) => ipcRenderer.invoke('db:addSurveyor', surveyor),
  updateSurveyor: (id, updates) => ipcRenderer.invoke('db:updateSurveyor', id, updates),
  deleteSurveyor: (id) => ipcRenderer.invoke('db:deleteSurveyor', id),

  // Condition Surveys
  getConditionSurveys: (vesselId) => ipcRenderer.invoke('db:getConditionSurveys', vesselId),
  addConditionSurvey: (survey) => ipcRenderer.invoke('db:addConditionSurvey', survey),
  updateConditionSurvey: (id, updates) => ipcRenderer.invoke('db:updateConditionSurvey', id, updates),
  deleteConditionSurvey: (id) => ipcRenderer.invoke('db:deleteConditionSurvey', id),
  getSurveyDefects: (surveyId) => ipcRenderer.invoke('db:getSurveyDefects', surveyId),
  addSurveyDefect: (defect) => ipcRenderer.invoke('db:addSurveyDefect', defect),
  updateSurveyDefect: (id, updates) => ipcRenderer.invoke('db:updateSurveyDefect', id, updates),
  deleteSurveyDefect: (id) => ipcRenderer.invoke('db:deleteSurveyDefect', id),
  closeDefect: (id, closedBy, closureNotes) => ipcRenderer.invoke('db:closeDefect', id, closedBy, closureNotes),
  reopenDefect: (id) => ipcRenderer.invoke('db:reopenDefect', id),
  getSurveyAttachments: (surveyId) => ipcRenderer.invoke('db:getSurveyAttachments', surveyId),
  addSurveyAttachment: (attachment) => ipcRenderer.invoke('db:addSurveyAttachment', attachment),
  deleteSurveyAttachment: (id) => ipcRenderer.invoke('db:deleteSurveyAttachment', id),
  getOpenDefectsByVessel: () => ipcRenderer.invoke('db:getOpenDefectsByVessel'),
  getSurveyHistory: (vesselId) => ipcRenderer.invoke('db:getSurveyHistory', vesselId),

  // Auto-Update
  updateCheckForUpdates: () => ipcRenderer.invoke('update:checkForUpdates'),
  updateQuitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
  updateGetCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
  onUpdateChecking: (callback) => ipcRenderer.on('update:checking', () => callback()),
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_, info) => callback(info)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update:not-available', (_, info) => callback(info)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update:download-progress', (_, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (_, info) => callback(info)),
  onUpdateError: (callback) => ipcRenderer.on('update:error', (_, error) => callback(error)),

  // Reminders
  remindersGetSettings: () => ipcRenderer.invoke('reminders:getSettings'),
  remindersSetSettings: (settings: any) => ipcRenderer.invoke('reminders:setSettings', settings),
  remindersGetVesselReminders: () => ipcRenderer.invoke('reminders:getVesselReminders'),
  remindersSnoozeVessel: (vesselId: string, username: string, periodDays: number) => ipcRenderer.invoke('reminders:snoozeVessel', vesselId, username, periodDays),
  remindersUnsnoozeVessel: (vesselId: string) => ipcRenderer.invoke('reminders:unsnoozeVessel', vesselId)
}

// Expose curated API to renderer via context bridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
}
