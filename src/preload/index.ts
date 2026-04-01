import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Custom APIs for renderer
const api = {
  getDocumentTypes: () => ipcRenderer.invoke('db:getDocumentTypes'),
  addDocumentType: (docType) => ipcRenderer.invoke('db:addDocumentType', docType),
  updateDocumentType: (id, updates) => ipcRenderer.invoke('db:updateDocumentType', id, updates),
  deleteDocumentType: (id) => ipcRenderer.invoke('db:deleteDocumentType', id),

  getVesselCustomDocTypes: (vesselId: string) => ipcRenderer.invoke('db:getVesselCustomDocTypes', vesselId),
  addVesselCustomDocType: (docType: any) => ipcRenderer.invoke('db:addVesselCustomDocType', docType),
  deleteVesselCustomDocType: (id: string) => ipcRenderer.invoke('db:deleteVesselCustomDocType', id),

  getFleets: () => ipcRenderer.invoke('db:getFleets'),
  addFleet: (fleet) => ipcRenderer.invoke('db:addFleet', fleet),
  deleteFleet: (id) => ipcRenderer.invoke('db:deleteFleet', id),

  getVessels: () => ipcRenderer.invoke('db:getVessels'),
  getVesselsPaginated: (params: any) => ipcRenderer.invoke('db:getVesselsPaginated', params),
  addVessel: (vessel) => ipcRenderer.invoke('db:addVessel', vessel),
  updateVessel: (id, updates) => ipcRenderer.invoke('db:updateVessel', id, updates),
  getVesselNameHistory: (vesselId) => ipcRenderer.invoke('db:getVesselNameHistory', vesselId),
  deleteVessel: (id) => ipcRenderer.invoke('db:deleteVessel', id),

  getVesselDocuments: (vesselId) => ipcRenderer.invoke('db:getVesselDocuments', vesselId),
  upsertVesselDocument: (doc) => ipcRenderer.invoke('db:upsertVesselDocument', doc),
  updateVesselDocumentExpiry: (vesselId, docTypeId, expiryDate) => ipcRenderer.invoke('db:updateVesselDocumentExpiry', vesselId, docTypeId, expiryDate),
  updateVesselDocumentReceivedDate: (vesselId, docTypeId, receivedDate) => ipcRenderer.invoke('db:updateVesselDocumentReceivedDate', vesselId, docTypeId, receivedDate),
  duplicateVesselDocument: (docId, uploadedBy) => ipcRenderer.invoke('db:duplicateVesselDocument', docId, uploadedBy),
  deleteVesselDocumentById: (docId) => ipcRenderer.invoke('db:deleteVesselDocumentById', docId),

  getEntities: () => ipcRenderer.invoke('db:getEntities'),
  getEntitiesPaginated: (params: any) => ipcRenderer.invoke('db:getEntitiesPaginated', params),
  addEntity: (entity) => ipcRenderer.invoke('db:addEntity', entity),
  updateEntity: (id, updates) => ipcRenderer.invoke('db:updateEntity', id, updates),
  deleteEntity: (id) => ipcRenderer.invoke('db:deleteEntity', id),
  mergeEntities: (sourceId, targetId, keepName?) => ipcRenderer.invoke('db:mergeEntities', sourceId, targetId, keepName),


  getAssuredRoles: () => ipcRenderer.invoke('db:getAssuredRoles'),
  addAssuredRole: (role) => ipcRenderer.invoke('db:addAssuredRole', role),
  updateAssuredRole: (id, updates) => ipcRenderer.invoke('db:updateAssuredRole', id, updates),
  deleteAssuredRole: (id) => ipcRenderer.invoke('db:deleteAssuredRole', id),
  reorderAssuredRoles: (orderedIds) => ipcRenderer.invoke('db:reorderAssuredRoles', orderedIds),
  getVesselsByRole: (roleName) => ipcRenderer.invoke('db:getVesselsByRole', roleName),

  getVesselAssureds: (vesselId) => ipcRenderer.invoke('db:getVesselAssureds', vesselId),
  addVesselAssured: (assured) => ipcRenderer.invoke('db:addVesselAssured', assured),
  deleteVesselAssured: (id) => ipcRenderer.invoke('db:deleteVesselAssured', id),
  updateVesselAssuredRole: (id, role) => ipcRenderer.invoke('db:updateVesselAssuredRole', id, role),

  getEntityUBOs: (assuredEntityId) => ipcRenderer.invoke('db:getEntityUBOs', assuredEntityId),
  addEntityUBO: (ubo) => ipcRenderer.invoke('db:addEntityUBO', ubo),
  deleteEntityUBO: (ubo) => ipcRenderer.invoke('db:deleteEntityUBO', ubo),

  // Entity Addresses
  getEntityAddresses: (entityId) => ipcRenderer.invoke('entityAddress:getByEntity', entityId),
  getAllEntityAddresses: () => ipcRenderer.invoke('entityAddress:getAll'),
  addEntityAddress: (addr) => ipcRenderer.invoke('entityAddress:add', addr),
  updateEntityAddress: (id, updates) => ipcRenderer.invoke('entityAddress:update', id, updates),
  deleteEntityAddress: (id) => ipcRenderer.invoke('entityAddress:delete', id),
  updateVesselAssuredAddress: (id, addressId) => ipcRenderer.invoke('vesselAssured:updateAddress', id, addressId),

  // RBAC
  rbacGetGroups: () => ipcRenderer.invoke('rbac:getGroups'),
  rbacAddGroup: (name: string, description?: string) => ipcRenderer.invoke('rbac:addGroup', name, description),
  rbacUpdateGroup: (id: string, name: string, description?: string) => ipcRenderer.invoke('rbac:updateGroup', id, name, description),
  rbacDeleteGroup: (id: string) => ipcRenderer.invoke('rbac:deleteGroup', id),
  rbacGetGroupPermissions: (groupId: string) => ipcRenderer.invoke('rbac:getGroupPermissions', groupId),
  rbacSetGroupPermissions: (groupId: string, keys: string[]) => ipcRenderer.invoke('rbac:setGroupPermissions', groupId, keys),
  rbacGetUserGroupIds: (userId: string) => ipcRenderer.invoke('rbac:getUserGroupIds', userId),
  rbacSetUserGroups: (userId: string, groupIds: string[]) => ipcRenderer.invoke('rbac:setUserGroups', userId, groupIds),
  rbacGetUserPermissionOverrides: (userId: string) => ipcRenderer.invoke('rbac:getUserPermissionOverrides', userId),
  rbacSetUserPermissionOverrides: (userId: string, overrides: { permissionKey: string; granted: boolean }[]) => ipcRenderer.invoke('rbac:setUserPermissionOverrides', userId, overrides),
  rbacResolveUserPermissions: (userId: string) => ipcRenderer.invoke('rbac:resolveUserPermissions', userId),
  rbacGetMyPermissions: () => ipcRenderer.invoke('rbac:getMyPermissions'),

  maintenanceSyncSettings: () => ipcRenderer.invoke('maintenance:syncSettings'),


  fsExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  fsOpen: (filePath) => ipcRenderer.invoke('fs:open', filePath),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  dialogOpenFile: () => ipcRenderer.invoke('dialog:openFile'),
  dialogOpenImageFile: () => ipcRenderer.invoke('dialog:openImageFile'),
  dialogOpenFileAny: () => ipcRenderer.invoke('dialog:openFileAny'),
  excelImport: (filePath) => ipcRenderer.invoke('excel:import', filePath),
  dialogOpenFileWord: () => ipcRenderer.invoke('dialog:openFileWord'),
  importDefectsFromWord: (surveyId, filePath) => ipcRenderer.invoke('word:importDefects', surveyId, filePath),

  // Auth & Setup
  login: (username: string, password: string) => ipcRenderer.invoke('auth:login', { username, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  changePassword: (currentPassword: string, newPassword: string) => ipcRenderer.invoke('auth:changePassword', { currentPassword, newPassword }),
  getSession: () => ipcRenderer.invoke('auth:getSession'),
  authResetPassword: (username: string) => ipcRenderer.invoke('auth:resetPassword', { username }),
  authIsPasswordResetRequired: () => ipcRenderer.invoke('auth:isPasswordResetRequired'),
  authForceResetPassword: (newPassword: string) => ipcRenderer.invoke('auth:forceResetPassword', newPassword),
  adminForcePasswordResetAll: () => ipcRenderer.invoke('admin:forcePasswordResetAll'),
  adminForcePasswordResetUsers: (userIds: string[]) => ipcRenderer.invoke('admin:forcePasswordResetUsers', userIds),
  authCreateUser: (userData) => ipcRenderer.invoke('auth:createUser', userData),
  getUsers: () => ipcRenderer.invoke('db:getUsers'),
  deleteUser: (id) => ipcRenderer.invoke('db:deleteUser', id),
  updateUserRole: (userId: string, role: 'admin' | 'user') => ipcRenderer.invoke('db:updateUserRole', userId, role),

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
  updateSanctionsThreshold: (threshold: number) => ipcRenderer.invoke('users:updateSanctionsThreshold', threshold),
  updateUserAppVersion: (version: string) => ipcRenderer.invoke('users:updateAppVersion', version),
  updateUserSidebarState: (sidebarCollapsed: boolean, collapsedGroups: string) => ipcRenderer.invoke('users:updateSidebarState', sidebarCollapsed, collapsedGroups),

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
  onComplianceCheckProgress: (callback: (data: { current: number; total: number; entityName: string }) => void) => {
    const handler = (_: any, data: any) => callback(data)
    ipcRenderer.on('compliance:checkProgress', handler)
    return () => { ipcRenderer.removeListener('compliance:checkProgress', handler) }
  },

  // Flag States
  getFlagStates: () => ipcRenderer.invoke('db:getFlagStates'),
  addFlagState: (flagState: any) => ipcRenderer.invoke('db:addFlagState', flagState),
  updateFlagState: (id: string, updates: any) => ipcRenderer.invoke('db:updateFlagState', id, updates),
  deleteFlagState: (id: string) => ipcRenderer.invoke('db:deleteFlagState', id),
  getVesselsByFlagState: (flagStateId: string) => ipcRenderer.invoke('db:getVesselsByFlagState', flagStateId),

  // Flag State Ports
  flagStateGetPorts: (flagStateId: string) => ipcRenderer.invoke('flagState:getPorts', flagStateId),
  flagStateAddPort: (flagStateId: string, name: string, isDefault: boolean) => ipcRenderer.invoke('flagState:addPort', flagStateId, name, isDefault),
  flagStateUpdatePort: (id: string, name: string, isDefault: boolean) => ipcRenderer.invoke('flagState:updatePort', id, name, isDefault),
  flagStateDeletePort: (id: string) => ipcRenderer.invoke('flagState:deletePort', id),

  // Policy Types
  getPolicyTypes: () => ipcRenderer.invoke('db:getPolicyTypes'),
  addPolicyType: (name: string) => ipcRenderer.invoke('db:addPolicyType', name),
  updatePolicyType: (id: string, updates: any) => ipcRenderer.invoke('db:updatePolicyType', id, updates),
  deletePolicyType: (id: string) => ipcRenderer.invoke('db:deletePolicyType', id),
  reorderPolicyTypes: (orderedIds: string[]) => ipcRenderer.invoke('db:reorderPolicyTypes', orderedIds),

  // Vessel Policies
  getVesselPolicies: (vesselId: string) => ipcRenderer.invoke('db:getVesselPolicies', vesselId),
  addVesselPolicy: (vesselId: string, policyTypeId: string) => ipcRenderer.invoke('db:addVesselPolicy', vesselId, policyTypeId),
  deleteVesselPolicy: (id: string) => ipcRenderer.invoke('db:deleteVesselPolicy', id),

  // Dynamic Address Book
  queryDAB: (criteria: any) => ipcRenderer.invoke('db:queryDAB', criteria),

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

  getConditionSurveyTypes: () => ipcRenderer.invoke('db:getConditionSurveyTypes'),
  addConditionSurveyType: (name) => ipcRenderer.invoke('db:addConditionSurveyType', name),
  deleteConditionSurveyType: (id) => ipcRenderer.invoke('db:deleteConditionSurveyType', id),

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
  closeSurvey: (surveyId, userId) => ipcRenderer.invoke('db:closeSurvey', surveyId, userId),
  updateConditionSurveyEndorsement: (surveyId, issued) => ipcRenderer.invoke('db:updateConditionSurveyEndorsement', surveyId, issued),

  // Dashboard
  dashboardGetActivity: () => ipcRenderer.invoke('dashboard:getActivity'),
  dashboardGetDataQualityAlerts: () => ipcRenderer.invoke('dashboard:getDataQualityAlerts'),
  dashboardGetCalendarEvents: (year: number, month: number) => ipcRenderer.invoke('dashboard:getCalendarEvents', year, month),
  complianceGetDataValidation: () => ipcRenderer.invoke('compliance:getDataValidation'),
  dashboardGetLayout: () => ipcRenderer.invoke('dashboard:getLayout'),
  dashboardSaveLayout: (layout: any) => ipcRenderer.invoke('dashboard:saveLayout', layout),
  dashboardSetOnboarded: () => ipcRenderer.invoke('dashboard:setOnboarded'),

  // Survey Warranties
  surveyWarrantyGetByVessel: (vesselId) => ipcRenderer.invoke('survey_warranty:getByVessel', vesselId),
  surveyWarrantyGetAll: () => ipcRenderer.invoke('survey_warranty:getAll'),
  surveyWarrantyGetDueToday: () => ipcRenderer.invoke('survey_warranty:getDueToday'),
  surveyWarrantyGetEndorsementsDue: () => ipcRenderer.invoke('survey_warranty:getEndorsementsDue'),
  surveyWarrantyCreate: (data) => ipcRenderer.invoke('survey_warranty:create', data),
  surveyWarrantyUpdate: (id, data) => ipcRenderer.invoke('survey_warranty:update', id, data),
  surveyWarrantyDelete: (id) => ipcRenderer.invoke('survey_warranty:delete', id),
  surveyWarrantyLogReminder: (data) => ipcRenderer.invoke('survey_warranty:logReminder', data),
  surveyWarrantyGetReminders: (warrantyId) => ipcRenderer.invoke('survey_warranty:getReminders', warrantyId),
  surveyWarrantyWaive: (id, reason) => ipcRenderer.invoke('survey_warranty:waive', id, reason),
  surveyWarrantyCompleteWithSurvey: (warrantyId, completionNotes, userId) => ipcRenderer.invoke('survey_warranty:completeWithSurvey', warrantyId, completionNotes, userId),

  // Auto-Update
  updateCheckForUpdates: () => ipcRenderer.invoke('update:checkForUpdates'),
  updateQuitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
  updateGetCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
  updateGetChangelogs: () => ipcRenderer.invoke('update:getChangelogs'),
  onUpdateChecking: (callback) => { const h = () => callback(); ipcRenderer.on('update:checking', h); return () => ipcRenderer.removeListener('update:checking', h) },
  onUpdateAvailable: (callback) => { const h = (_, info) => callback(info); ipcRenderer.on('update:available', h); return () => ipcRenderer.removeListener('update:available', h) },
  onUpdateNotAvailable: (callback) => { const h = (_, info) => callback(info); ipcRenderer.on('update:not-available', h); return () => ipcRenderer.removeListener('update:not-available', h) },
  onUpdateDownloadProgress: (callback) => { const h = (_, progress) => callback(progress); ipcRenderer.on('update:download-progress', h); return () => ipcRenderer.removeListener('update:download-progress', h) },
  onUpdateDownloaded: (callback) => { const h = (_, info) => callback(info); ipcRenderer.on('update:downloaded', h); return () => ipcRenderer.removeListener('update:downloaded', h) },
  onUpdateError: (callback) => { const h = (_, error) => callback(error); ipcRenderer.on('update:error', h); return () => ipcRenderer.removeListener('update:error', h) },

  // Reminders
  remindersGetSettings: () => ipcRenderer.invoke('reminders:getSettings'),
  remindersSetSettings: (settings: any) => ipcRenderer.invoke('reminders:setSettings', settings),
  remindersGetVesselReminders: () => ipcRenderer.invoke('reminders:getVesselReminders'),
  remindersSnoozeVessel: (vesselId: string, username: string, periodDays: number) => ipcRenderer.invoke('reminders:snoozeVessel', vesselId, username, periodDays),
  remindersUnsnoozeVessel: (vesselId: string) => ipcRenderer.invoke('reminders:unsnoozeVessel', vesselId),

  // P&I Settings
  piGetClauses: () => ipcRenderer.invoke('pi:getClauses'),
  piAddClause: (clause: any) => ipcRenderer.invoke('pi:addClause', clause),
  piUpdateClause: (id: string, updates: any) => ipcRenderer.invoke('pi:updateClause', id, updates),
  piDeleteClause: (id: string) => ipcRenderer.invoke('pi:deleteClause', id),
  piReorderClauses: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderClauses', orderedIds),

  piGetClauseSets: () => ipcRenderer.invoke('pi:getClauseSets'),
  piAddClauseSet: (name: string, clauseIds: string[], descOverrides?: Record<string, string>) => ipcRenderer.invoke('pi:addClauseSet', name, clauseIds, descOverrides),
  piUpdateClauseSet: (id: string, name: string, clauseIds: string[], descOverrides?: Record<string, string>) => ipcRenderer.invoke('pi:updateClauseSet', id, name, clauseIds, descOverrides),
  piDeleteClauseSet: (id: string) => ipcRenderer.invoke('pi:deleteClauseSet', id),

  // Hull settings
  hullGetAgreedValueTexts: () => ipcRenderer.invoke('hull:getAgreedValueTexts'),
  hullAddAgreedValueText: (text: string, defaultSelected: boolean, section?: string) => ipcRenderer.invoke('hull:addAgreedValueText', text, defaultSelected, section),
  hullUpdateAgreedValueText: (id: string, updates: any) => ipcRenderer.invoke('hull:updateAgreedValueText', id, updates),
  hullDeleteAgreedValueText: (id: string) => ipcRenderer.invoke('hull:deleteAgreedValueText', id),
  hullReorderAgreedValueTexts: (ids: string[]) => ipcRenderer.invoke('hull:reorderAgreedValueTexts', ids),

  hullGetClauses: () => ipcRenderer.invoke('hull:getClauses'),
  hullAddClause: (name: string, code: string, description?: string, conditionSection?: string) => ipcRenderer.invoke('hull:addClause', name, code, description, conditionSection),
  hullUpdateClause: (id: string, updates: any) => ipcRenderer.invoke('hull:updateClause', id, updates),
  hullDeleteClause: (id: string) => ipcRenderer.invoke('hull:deleteClause', id),
  hullReorderClauses: (ids: string[]) => ipcRenderer.invoke('hull:reorderClauses', ids),

  hullGetClauseConditions: (hullClauseId?: string) => ipcRenderer.invoke('hull:getClauseConditions', hullClauseId),
  hullAddClauseCondition: (hullClauseId: string, conditionNumber: string, text: string, defaultSelected: boolean, conditionSection?: string, hasAmount?: boolean, amountPlaceholder?: string) => ipcRenderer.invoke('hull:addClauseCondition', hullClauseId, conditionNumber, text, defaultSelected, conditionSection, hasAmount, amountPlaceholder),
  hullUpdateClauseCondition: (id: string, updates: any) => ipcRenderer.invoke('hull:updateClauseCondition', id, updates),
  hullDeleteClauseCondition: (id: string) => ipcRenderer.invoke('hull:deleteClauseCondition', id),
  hullReorderClauseConditions: (ids: string[]) => ipcRenderer.invoke('hull:reorderClauseConditions', ids),

  hullGetAdditionalConditions: () => ipcRenderer.invoke('hull:getAdditionalConditions'),
  hullAddAdditionalCondition: (title: string | null, text: string, defaultSelected: boolean, hullClauseIds?: string[], hasAmount?: boolean, amountPlaceholder?: string) => ipcRenderer.invoke('hull:addAdditionalCondition', title, text, defaultSelected, hullClauseIds, hasAmount, amountPlaceholder),
  hullUpdateAdditionalCondition: (id: string, updates: any) => ipcRenderer.invoke('hull:updateAdditionalCondition', id, updates),
  hullDeleteAdditionalCondition: (id: string) => ipcRenderer.invoke('hull:deleteAdditionalCondition', id),
  hullReorderAdditionalConditions: (ids: string[]) => ipcRenderer.invoke('hull:reorderAdditionalConditions', ids),

  hullGetQuotationAgreedValueItems: (qId: string) => ipcRenderer.invoke('hull:getQuotationAgreedValueItems', qId),
  hullSetQuotationAgreedValueItems: (qId: string, items: any[]) => ipcRenderer.invoke('hull:setQuotationAgreedValueItems', qId, items),
  // P&I Alternatives
  piGetQuotationAlternatives: (qId: string) => ipcRenderer.invoke('pi:getQuotationAlternatives', qId),
  piAddQuotationAlternative: (qId: string, label?: string) => ipcRenderer.invoke('pi:addQuotationAlternative', qId, label),
  piMigrateSharedToAlternative: (qId: string, altId: string) => ipcRenderer.invoke('pi:migrateSharedToAlternative', qId, altId),
  piUpdateQuotationAlternative: (id: string, updates: any) => ipcRenderer.invoke('pi:updateQuotationAlternative', id, updates),
  piDeleteQuotationAlternative: (id: string) => ipcRenderer.invoke('pi:deleteQuotationAlternative', id),
  piReorderQuotationAlternatives: (ids: string[]) => ipcRenderer.invoke('pi:reorderQuotationAlternatives', ids),
  updateQuotationItemAlternativeId: (table: string, id: string, alternativeId: string | null) => ipcRenderer.invoke('quotation:updateItemAlternativeId', table, id, alternativeId),
  // Agreed Value Options
  hullGetAgreedValueOptions: (qId: string) => ipcRenderer.invoke('hull:getAgreedValueOptions', qId),
  hullAddAgreedValueOption: (qId: string, amount: number, currency?: string, label?: string) => ipcRenderer.invoke('hull:addAgreedValueOption', qId, amount, currency, label),
  hullUpdateAgreedValueOption: (id: string, updates: { label?: string; amount?: number; currency?: string; premiumAmount?: number | null }) => ipcRenderer.invoke('hull:updateAgreedValueOption', id, updates),
  hullDeleteAgreedValueOption: (id: string) => ipcRenderer.invoke('hull:deleteAgreedValueOption', id),
  hullReorderAgreedValueOptions: (ids: string[]) => ipcRenderer.invoke('hull:reorderAgreedValueOptions', ids),
  // Hull Alternatives
  hullGetQuotationAlternatives: (qId: string) => ipcRenderer.invoke('hull:getQuotationAlternatives', qId),
  hullAddQuotationAlternative: (qId: string, hullClauseId?: string | null, label?: string, vesselScopeId?: string | null) => ipcRenderer.invoke('hull:addQuotationAlternative', qId, hullClauseId, label, vesselScopeId),
  hullUpdateQuotationAlternative: (id: string, updates: any) => ipcRenderer.invoke('hull:updateQuotationAlternative', id, updates),
  hullDeleteQuotationAlternative: (id: string) => ipcRenderer.invoke('hull:deleteQuotationAlternative', id),
  hullReorderQuotationAlternatives: (ids: string[]) => ipcRenderer.invoke('hull:reorderQuotationAlternatives', ids),
  hullGetQuotationHullConditions: (qId: string) => ipcRenderer.invoke('hull:getQuotationHullConditions', qId),
  hullSetQuotationHullConditions: (qId: string, items: any[]) => ipcRenderer.invoke('hull:setQuotationHullConditions', qId, items),
  hullGetQuotationHullAdditionalConditions: (qId: string) => ipcRenderer.invoke('hull:getQuotationHullAdditionalConditions', qId),
  hullSetQuotationHullAdditionalConditions: (qId: string, items: any[]) => ipcRenderer.invoke('hull:setQuotationHullAdditionalConditions', qId, items),

  warGetConditions: () => ipcRenderer.invoke('war:getConditions'),
  warAddCondition: (text: string, defaultSelected: boolean) => ipcRenderer.invoke('war:addCondition', text, defaultSelected),
  warUpdateCondition: (id: string, updates: any) => ipcRenderer.invoke('war:updateCondition', id, updates),
  warDeleteCondition: (id: string) => ipcRenderer.invoke('war:deleteCondition', id),
  warReorderConditions: (ids: string[]) => ipcRenderer.invoke('war:reorderConditions', ids),
  warGetQuotationWarConditions: (qId: string) => ipcRenderer.invoke('war:getQuotationWarConditions', qId),
  warSetQuotationWarConditions: (qId: string, items: any[]) => ipcRenderer.invoke('war:setQuotationWarConditions', qId, items),
  warGetSettings: () => ipcRenderer.invoke('war:getSettings'),
  warSetSettings: (settings: any) => ipcRenderer.invoke('war:setSettings', settings),

  // Cargo
  cargoGetInstituteClauses: () => ipcRenderer.invoke('cargo:getInstituteClauses'),
  cargoAddInstituteClause: (name: string, code?: string, description?: string) => ipcRenderer.invoke('cargo:addInstituteClause', name, code, description),
  cargoUpdateInstituteClause: (id: string, updates: any) => ipcRenderer.invoke('cargo:updateInstituteClause', id, updates),
  cargoDeleteInstituteClause: (id: string) => ipcRenderer.invoke('cargo:deleteInstituteClause', id),
  cargoReorderInstituteClauses: (ids: string[]) => ipcRenderer.invoke('cargo:reorderInstituteClauses', ids),
  cargoGetClauses: (section: string) => ipcRenderer.invoke('cargo:getClauses', section),
  cargoGetAllClauses: () => ipcRenderer.invoke('cargo:getAllClauses'),
  cargoAddClause: (section: string, title: string, text?: string, code?: string, hasAmount?: boolean, amountPlaceholder?: string) => ipcRenderer.invoke('cargo:addClause', section, title, text, code, hasAmount, amountPlaceholder),
  cargoUpdateClause: (id: string, updates: any) => ipcRenderer.invoke('cargo:updateClause', id, updates),
  cargoDeleteClause: (id: string) => ipcRenderer.invoke('cargo:deleteClause', id),
  cargoReorderClauses: (ids: string[]) => ipcRenderer.invoke('cargo:reorderClauses', ids),
  cargoGetQuotationClauses: (qId: string, section: string) => ipcRenderer.invoke('cargo:getQuotationClauses', qId, section),
  cargoSetQuotationClauses: (qId: string, section: string, items: any[]) => ipcRenderer.invoke('cargo:setQuotationClauses', qId, section, items),
  cargoGetQuotationCustomClauses: (qId: string, section: string) => ipcRenderer.invoke('cargo:getQuotationCustomClauses', qId, section),
  cargoAddQuotationCustomClause: (qId: string, section: string, text: string) => ipcRenderer.invoke('cargo:addQuotationCustomClause', qId, section, text),
  cargoUpdateQuotationCustomClause: (id: string, updates: any) => ipcRenderer.invoke('cargo:updateQuotationCustomClause', id, updates),
  cargoDeleteQuotationCustomClause: (id: string) => ipcRenderer.invoke('cargo:deleteQuotationCustomClause', id),
  cargoReorderQuotationCustomClauses: (ids: string[]) => ipcRenderer.invoke('cargo:reorderQuotationCustomClauses', ids),

  piGetWarrantyTags: () => ipcRenderer.invoke('pi:getWarrantyTags'),
  piAddWarrantyTag: (name: string) => ipcRenderer.invoke('pi:addWarrantyTag', name),
  piUpdateWarrantyTag: (id: string, name: string) => ipcRenderer.invoke('pi:updateWarrantyTag', id, name),
  piDeleteWarrantyTag: (id: string) => ipcRenderer.invoke('pi:deleteWarrantyTag', id),
  piReorderWarrantyTags: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderWarrantyTags', orderedIds),

  piGetWarranties: () => ipcRenderer.invoke('pi:getWarranties'),
  piAddWarranty: (warranty: any) => ipcRenderer.invoke('pi:addWarranty', warranty),
  piUpdateWarranty: (id: string, updates: any) => ipcRenderer.invoke('pi:updateWarranty', id, updates),
  piDeleteWarranty: (id: string) => ipcRenderer.invoke('pi:deleteWarranty', id),
  piReorderWarranties: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderWarranties', orderedIds),

  piGetWarrantySets: () => ipcRenderer.invoke('pi:getWarrantySets'),
  piAddWarrantySet: (name: string, warrantyIds: string[], defaultSelected?: boolean) => ipcRenderer.invoke('pi:addWarrantySet', name, warrantyIds, defaultSelected),
  piUpdateWarrantySet: (id: string, name: string, warrantyIds: string[], defaultSelected?: boolean) => ipcRenderer.invoke('pi:updateWarrantySet', id, name, warrantyIds, defaultSelected),
  piDeleteWarrantySet: (id: string) => ipcRenderer.invoke('pi:deleteWarrantySet', id),

  piGetDeductibles: () => ipcRenderer.invoke('pi:getDeductibles'),
  piAddDeductible: (ded: any) => ipcRenderer.invoke('pi:addDeductible', ded),
  piUpdateDeductible: (id: string, updates: any) => ipcRenderer.invoke('pi:updateDeductible', id, updates),
  piDeleteDeductible: (id: string) => ipcRenderer.invoke('pi:deleteDeductible', id),
  piReorderDeductibles: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderDeductibles', orderedIds),

  piGetDeductibleSets: () => ipcRenderer.invoke('pi:getDeductibleSets'),
  piGetDeductibleSetItems: (setId: string) => ipcRenderer.invoke('pi:getDeductibleSetItems', setId),
  piAddDeductibleSet: (name: string, items: any[]) => ipcRenderer.invoke('pi:addDeductibleSet', name, items),
  piUpdateDeductibleSet: (id: string, name: string, items: any[]) => ipcRenderer.invoke('pi:updateDeductibleSet', id, name, items),
  piDeleteDeductibleSet: (id: string) => ipcRenderer.invoke('pi:deleteDeductibleSet', id),

  piGetTextDeductibles: () => ipcRenderer.invoke('pi:getTextDeductibles'),
  piAddTextDeductible: (data: { text: string; defaultIncluded?: boolean }) => ipcRenderer.invoke('pi:addTextDeductible', data),
  piUpdateTextDeductible: (id: string, updates: { text?: string; defaultIncluded?: boolean }) => ipcRenderer.invoke('pi:updateTextDeductible', id, updates),
  piDeleteTextDeductible: (id: string) => ipcRenderer.invoke('pi:deleteTextDeductible', id),
  piReorderTextDeductibles: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderTextDeductibles', orderedIds),

  piGetExclusions: () => ipcRenderer.invoke('pi:getExclusions'),
  piAddExclusion: (exclusion: { text: string; isCargoRelated?: boolean; vesselTypeIds?: string[] }) => ipcRenderer.invoke('pi:addExclusion', exclusion),
  piUpdateExclusion: (id: string, updates: { text?: string; isCargoRelated?: boolean; vesselTypeIds?: string[] }) => ipcRenderer.invoke('pi:updateExclusion', id, updates),
  piDeleteExclusion: (id: string) => ipcRenderer.invoke('pi:deleteExclusion', id),
  piReorderExclusions: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderExclusions', orderedIds),

  piGetSubLimitTemplates: () => ipcRenderer.invoke('pi:getSubLimitTemplates'),
  piAddSubLimitTemplate: (tmpl: any) => ipcRenderer.invoke('pi:addSubLimitTemplate', tmpl),
  piUpdateSubLimitTemplate: (id: string, updates: any) => ipcRenderer.invoke('pi:updateSubLimitTemplate', id, updates),
  piDeleteSubLimitTemplate: (id: string) => ipcRenderer.invoke('pi:deleteSubLimitTemplate', id),
  piReorderSubLimitTemplates: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderSubLimitTemplates', orderedIds),

  piGetAdditionalClauses: () => ipcRenderer.invoke('pi:getAdditionalClauses'),
  piAddAdditionalClause: (title: string | null, code: string | null, text: string) => ipcRenderer.invoke('pi:addAdditionalClause', title, code, text),
  piUpdateAdditionalClause: (id: string, title: string | null, code: string | null, text: string) => ipcRenderer.invoke('pi:updateAdditionalClause', id, title, code, text),
  piDeleteAdditionalClause: (id: string) => ipcRenderer.invoke('pi:deleteAdditionalClause', id),
  piReorderAdditionalClauses: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderAdditionalClauses', orderedIds),
  piToggleAdditionalClauseDefault: (id: string, defaultSelected: boolean) => ipcRenderer.invoke('pi:toggleAdditionalClauseDefault', id, defaultSelected),
  piGetAdditionalClauseSets: () => ipcRenderer.invoke('pi:getAdditionalClauseSets'),
  piAddAdditionalClauseSet: (name: string, clauseIds: string[], defaultSelected?: boolean) => ipcRenderer.invoke('pi:addAdditionalClauseSet', name, clauseIds, defaultSelected),
  piUpdateAdditionalClauseSet: (id: string, name: string, clauseIds: string[], defaultSelected?: boolean) => ipcRenderer.invoke('pi:updateAdditionalClauseSet', id, name, clauseIds, defaultSelected),
  piDeleteAdditionalClauseSet: (id: string) => ipcRenderer.invoke('pi:deleteAdditionalClauseSet', id),

  piGetTradingExcludedCountries: () => ipcRenderer.invoke('pi:getTradingExcludedCountries'),
  piAddTradingExcludedCountry: (country: any) => ipcRenderer.invoke('pi:addTradingExcludedCountry', country),
  piUpdateTradingExcludedCountry: (id: string, updates: any) => ipcRenderer.invoke('pi:updateTradingExcludedCountry', id, updates),
  piDeleteTradingExcludedCountry: (id: string) => ipcRenderer.invoke('pi:deleteTradingExcludedCountry', id),

  // Trading Warranty Templates
  piGetTradingWarrantyTemplates: () => ipcRenderer.invoke('pi:getTradingWarrantyTemplates'),
  piAddTradingWarrantyTemplate: (name: string, text: string) => ipcRenderer.invoke('pi:addTradingWarrantyTemplate', name, text),
  piUpdateTradingWarrantyTemplate: (id: string, updates: any) => ipcRenderer.invoke('pi:updateTradingWarrantyTemplate', id, updates),
  piDeleteTradingWarrantyTemplate: (id: string) => ipcRenderer.invoke('pi:deleteTradingWarrantyTemplate', id),
  piReorderTradingWarrantyTemplates: (ids: string[]) => ipcRenderer.invoke('pi:reorderTradingWarrantyTemplates', ids),

  // Trading Custom Texts
  piGetTradingCustomTexts: () => ipcRenderer.invoke('pi:getTradingCustomTexts'),
  piAddTradingCustomText: (name: string, text: string) => ipcRenderer.invoke('pi:addTradingCustomText', name, text),
  piUpdateTradingCustomText: (id: string, updates: any) => ipcRenderer.invoke('pi:updateTradingCustomText', id, updates),
  piDeleteTradingCustomText: (id: string) => ipcRenderer.invoke('pi:deleteTradingCustomText', id),
  piReorderTradingCustomTexts: (ids: string[]) => ipcRenderer.invoke('pi:reorderTradingCustomTexts', ids),

  // Generic Settings
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),

  // Premium Text Templates (NCB / UPCC)
  premiumGetTextTemplates: (type?: string) => ipcRenderer.invoke('premium:getTextTemplates', type),
  premiumAddTextTemplate: (data: { name: string; text: string; type: string }) => ipcRenderer.invoke('premium:addTextTemplate', data),
  premiumUpdateTextTemplate: (id: string, updates: any) => ipcRenderer.invoke('premium:updateTextTemplate', id, updates),
  premiumDeleteTextTemplate: (id: string) => ipcRenderer.invoke('premium:deleteTextTemplate', id),
  premiumReorderTextTemplates: (ids: string[]) => ipcRenderer.invoke('premium:reorderTextTemplates', ids),

  // P&I Section Texts
  piGetSectionTexts: () => ipcRenderer.invoke('pi:getSectionTexts'),
  piSetSectionTexts: (texts: any) => ipcRenderer.invoke('pi:setSectionTexts', texts),

  // Instalment Defaults & Logo
  piGetInstalmentDefaults: () => ipcRenderer.invoke('pi:getInstalmentDefaults'),
  piSetInstalmentDefaults: (defaults: any) => ipcRenderer.invoke('pi:setInstalmentDefaults', defaults),
  piGetQuotationLogoPath: () => ipcRenderer.invoke('pi:getQuotationLogoPath'),
  piSetQuotationLogoPath: (path: string) => ipcRenderer.invoke('pi:setQuotationLogoPath', path),

  // P&I Sanctions Versions
  piGetSanctionsVersions: () => ipcRenderer.invoke('pi:getSanctionsVersions'),
  piAddSanctionsVersion: (data: any) => ipcRenderer.invoke('pi:addSanctionsVersion', data),
  piUpdateSanctionsVersion: (id: string, updates: any) => ipcRenderer.invoke('pi:updateSanctionsVersion', id, updates),
  piDeleteSanctionsVersion: (id: string) => ipcRenderer.invoke('pi:deleteSanctionsVersion', id),
  piReorderSanctionsVersions: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderSanctionsVersions', orderedIds),

  // Vessel Insurance Policies (imported)
  getVesselInsurancePolicies: (vesselId: string) => ipcRenderer.invoke('vessels:getInsurancePolicies', vesselId),
  importInsurancePoliciesFromExcel: (filePath: string) => ipcRenderer.invoke('vessels:importInsurancePoliciesFromExcel', filePath),

  // Classification Societies
  getClassificationSocieties: () => ipcRenderer.invoke('db:getClassificationSocieties'),
  addClassificationSociety: (cs: any) => ipcRenderer.invoke('db:addClassificationSociety', cs),
  updateClassificationSociety: (id: string, updates: any) => ipcRenderer.invoke('db:updateClassificationSociety', id, updates),
  deleteClassificationSociety: (id: string) => ipcRenderer.invoke('db:deleteClassificationSociety', id),
  reorderClassificationSocieties: (ids: string[]) => ipcRenderer.invoke('db:reorderClassificationSocieties', ids),
  getVesselClassifications: (vesselId: string) => ipcRenderer.invoke('vessels:getClassifications', vesselId),
  setVesselClassifications: (vesselId: string, csIds: string[]) => ipcRenderer.invoke('vessels:setClassifications', vesselId, csIds),

  // Vessel Types
  getVesselTypes: () => ipcRenderer.invoke('db:getVesselTypes'),
  addVesselType: (vt: any) => ipcRenderer.invoke('db:addVesselType', vt),
  updateVesselType: (id: string, updates: any) => ipcRenderer.invoke('db:updateVesselType', id, updates),
  deleteVesselType: (id: string) => ipcRenderer.invoke('db:deleteVesselType', id),
  reorderVesselTypes: (ids: string[]) => ipcRenderer.invoke('db:reorderVesselTypes', ids),

  // Re-import vessel details (type, flag, class) from Excel
  reimportVesselDetails: (filePath: string) => ipcRenderer.invoke('vessels:reimportVesselDetails', filePath),

  // Vessel Audit Log
  getVesselAuditLog: (vesselId: string) => ipcRenderer.invoke('vessels:getAuditLog', vesselId),

  // Policy Type Characteristics
  getPolicyTypeCharacteristics: (policyTypeId?: string) => ipcRenderer.invoke('db:getPolicyTypeCharacteristics', policyTypeId),
  addPolicyTypeCharacteristic: (c: any) => ipcRenderer.invoke('db:addPolicyTypeCharacteristic', c),
  updatePolicyTypeCharacteristic: (id: string, updates: any) => ipcRenderer.invoke('db:updatePolicyTypeCharacteristic', id, updates),
  deletePolicyTypeCharacteristic: (id: string) => ipcRenderer.invoke('db:deletePolicyTypeCharacteristic', id),
  reorderPolicyTypeCharacteristics: (ids: string[]) => ipcRenderer.invoke('db:reorderPolicyTypeCharacteristics', ids),

  // Policy Type Conditions
  getPolicyTypeConditions: (policyTypeId?: string) => ipcRenderer.invoke('db:getPolicyTypeConditions', policyTypeId),
  addPolicyTypeCondition: (c: any) => ipcRenderer.invoke('db:addPolicyTypeCondition', c),
  updatePolicyTypeCondition: (id: string, updates: any) => ipcRenderer.invoke('db:updatePolicyTypeCondition', id, updates),
  deletePolicyTypeCondition: (id: string) => ipcRenderer.invoke('db:deletePolicyTypeCondition', id),

  // Vessel Dynamic Policies
  getVesselDynamicPolicies: (vesselId: string) => ipcRenderer.invoke('vessels:getDynamicPolicies', vesselId),
  getAllVesselDynamicPolicies: () => ipcRenderer.invoke('vessels:getAllDynamicPolicies'),
  addVesselDynamicPolicy: (policy: any) => ipcRenderer.invoke('vessels:addDynamicPolicy', policy),
  updateVesselDynamicPolicy: (id: string, updates: any) => ipcRenderer.invoke('vessels:updateDynamicPolicy', id, updates),
  deleteVesselDynamicPolicy: (id: string) => ipcRenderer.invoke('vessels:deleteDynamicPolicy', id),
  setVesselDynamicPolicyValues: (policyId: string, values: any[]) => ipcRenderer.invoke('vessels:setDynamicPolicyValues', policyId, values),

  // Policy List
  getPoliciesList: () => ipcRenderer.invoke('policies:getList'),

  // Policy Expiry Alerts
  getExpiredActivePolicies: () => ipcRenderer.invoke('policies:getExpiredActive'),
  getPolicyRenewalsByMonth: (year: number, month: number) => ipcRenderer.invoke('policies:getRenewalsByMonth', year, month),
  setQuotationSentDate: (policyId: string, date: string | null) => ipcRenderer.invoke('policies:setQuotationSentDate', policyId, date),
  getRenewalPipeline: (dateFrom: string, dateTo: string) => ipcRenderer.invoke('renewals:getPipeline', dateFrom, dateTo),

  // Renewal Status Types
  getRenewalStatusTypes: () => ipcRenderer.invoke('renewalStates:getAll'),
  addRenewalStatusType: (name: string, color: string) => ipcRenderer.invoke('renewalStates:add', name, color),
  updateRenewalStatusType: (id: string, name: string, color: string) => ipcRenderer.invoke('renewalStates:update', id, name, color),
  deleteRenewalStatusType: (id: string) => ipcRenderer.invoke('renewalStates:delete', id),
  setRenewalStatusForPolicy: (policyId: string, statusId: string | null) => ipcRenderer.invoke('renewalStates:setForPolicy', policyId, statusId),

  // Policy Renewal Notes
  getPolicyRenewalNotes: (policyId: string, policyNumber: string) => ipcRenderer.invoke('renewalNotes:get', policyId, policyNumber),
  addPolicyRenewalNote: (policyId: string, policyNumber: string, note: string) => ipcRenderer.invoke('renewalNotes:add', policyId, policyNumber, note),
  deletePolicyRenewalNote: (noteId: string) => ipcRenderer.invoke('renewalNotes:delete', noteId),

  // Vessel Notes
  getVesselNotes: (vesselId: string) => ipcRenderer.invoke('vesselNotes:get', vesselId),
  addVesselNote: (vesselId: string, note: string, parentNoteId?: string) => ipcRenderer.invoke('vesselNotes:add', vesselId, note, parentNoteId),
  deleteVesselNote: (noteId: string) => ipcRenderer.invoke('vesselNotes:delete', noteId),

  // Quotation Types
  getQuotationTypes: () => ipcRenderer.invoke('db:getQuotationTypes'),
  addQuotationType: (data: any) => ipcRenderer.invoke('db:addQuotationType', data),
  updateQuotationType: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationType', id, updates),
  deleteQuotationType: (id: string) => ipcRenderer.invoke('db:deleteQuotationType', id),
  reorderQuotationTypes: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationTypes', ids),

  // Quotations
  getQuotations: () => ipcRenderer.invoke('db:getQuotations'),
  quotationGetPaginated: (params: any) => ipcRenderer.invoke('quotation:getPaginated', params),
  quotationGetCreators: () => ipcRenderer.invoke('quotation:getCreators'),
  quotationGetSavedFilters: () => ipcRenderer.invoke('quotation:getSavedFilters'),
  quotationSaveFilter: (name: string, filters: any) => ipcRenderer.invoke('quotation:saveFilter', name, filters),
  quotationDeleteFilter: (id: string) => ipcRenderer.invoke('quotation:deleteFilter', id),
  quotationGetFavorites: () => ipcRenderer.invoke('quotation:getFavorites'),
  quotationToggleFavorite: (quotationId: string) => ipcRenderer.invoke('quotation:toggleFavorite', quotationId),
  getQuotation: (id: string) => ipcRenderer.invoke('db:getQuotation', id),
  addQuotation: (q: any) => ipcRenderer.invoke('db:addQuotation', q),
  updateQuotation: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotation', id, updates),
  deleteQuotation: (id: string) => ipcRenderer.invoke('db:deleteQuotation', id),
  getQuotationRevisionCount: (revisionGroupId: string) => ipcRenderer.invoke('db:getQuotationRevisionCount', revisionGroupId),
  deleteQuotationGroup: (revisionGroupId: string) => ipcRenderer.invoke('db:deleteQuotationGroup', revisionGroupId),
  createQuotationRevision: (sourceId: string) => ipcRenderer.invoke('db:createQuotationRevision', sourceId),
  stripNonSelectedAlternative: (quotationId: string, keepAlternativeId: string) => ipcRenderer.invoke('db:stripNonSelectedAlternative', quotationId, keepAlternativeId),
  duplicateQuotation: (sourceId: string) => ipcRenderer.invoke('db:duplicateQuotation', sourceId),
  copyQuotationSections: (targetId: string, sourceId: string, sections: string[]) => ipcRenderer.invoke('quotation:copySections', targetId, sourceId, sections),
  getQuotationRevisions: (revisionGroupId: string) => ipcRenderer.invoke('db:getQuotationRevisions', revisionGroupId),
  saveExportSnapshot: (quotationId: string, snapshot: string) => ipcRenderer.invoke('db:saveExportSnapshot', quotationId, snapshot),
  clearExportSnapshot: (quotationId: string) => ipcRenderer.invoke('db:clearExportSnapshot', quotationId),

  // Quotation Sub-Tables
  getQuotationAssureds: (qId: string) => ipcRenderer.invoke('db:getQuotationAssureds', qId),
  addQuotationAssured: (data: any) => ipcRenderer.invoke('db:addQuotationAssured', data),
  updateQuotationAssured: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationAssured', id, updates),
  deleteQuotationAssured: (id: string) => ipcRenderer.invoke('db:deleteQuotationAssured', id),
  reorderQuotationAssureds: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationAssureds', ids),

  // Quotation Assured Groups
  getQuotationAssuredGroups: (qId: string) => ipcRenderer.invoke('db:getQuotationAssuredGroups', qId),
  addQuotationAssuredGroup: (qId: string, name: string) => ipcRenderer.invoke('db:addQuotationAssuredGroup', qId, name),
  updateQuotationAssuredGroup: (id: string, updates: { name?: string }) => ipcRenderer.invoke('db:updateQuotationAssuredGroup', id, updates),
  deleteQuotationAssuredGroup: (id: string) => ipcRenderer.invoke('db:deleteQuotationAssuredGroup', id),
  reorderQuotationAssuredGroups: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationAssuredGroups', ids),

  getQuotationVessels: (qId: string) => ipcRenderer.invoke('db:getQuotationVessels', qId),
  addQuotationVessel: (data: any) => ipcRenderer.invoke('db:addQuotationVessel', data),
  updateQuotationVessel: (id: string, data: any) => ipcRenderer.invoke('db:updateQuotationVessel', id, data),
  deleteQuotationVessel: (id: string) => ipcRenderer.invoke('db:deleteQuotationVessel', id),
  reorderQuotationVessels: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationVessels', ids),

  getQuotationNewVessel: (qId: string) => ipcRenderer.invoke('db:getQuotationNewVessel', qId),
  upsertQuotationNewVessel: (qId: string, data: any) => ipcRenderer.invoke('db:upsertQuotationNewVessel', qId, data),
  deleteQuotationNewVessel: (qId: string) => ipcRenderer.invoke('db:deleteQuotationNewVessel', qId),

  getQuotationSubLimits: (qId: string) => ipcRenderer.invoke('db:getQuotationSubLimits', qId),
  addQuotationSubLimit: (data: any) => ipcRenderer.invoke('db:addQuotationSubLimit', data),
  updateQuotationSubLimit: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationSubLimit', id, updates),
  deleteQuotationSubLimit: (id: string) => ipcRenderer.invoke('db:deleteQuotationSubLimit', id),

  getQuotationClauses: (qId: string) => ipcRenderer.invoke('db:getQuotationClauses', qId),
  setQuotationClauses: (qId: string, ids: string[], overrides?: Record<string, string>) => ipcRenderer.invoke('db:setQuotationClauses', qId, ids, overrides),
  addQuotationClause: (qId: string, piClauseId: string, alternativeId?: string | null) => ipcRenderer.invoke('db:addQuotationClause', qId, piClauseId, alternativeId),
  deleteQuotationClause: (qId: string, piClauseId: string, alternativeId?: string | null) => ipcRenderer.invoke('db:deleteQuotationClause', qId, piClauseId, alternativeId),
  getQuotationClauseOverrides: (qId: string) => ipcRenderer.invoke('db:getQuotationClauseOverrides', qId),
  updateQuotationClauseOverride: (qId: string, clauseId: string, override: string | null, alternativeId?: string | null) => ipcRenderer.invoke('db:updateQuotationClauseOverride', qId, clauseId, override, alternativeId),

  getQuotationAdditionalClauses: (qId: string) => ipcRenderer.invoke('db:getQuotationAdditionalClauses', qId),
  addQuotationAdditionalClause: (data: any) => ipcRenderer.invoke('db:addQuotationAdditionalClause', data),
  deleteQuotationAdditionalClause: (id: string) => ipcRenderer.invoke('db:deleteQuotationAdditionalClause', id),

  getQuotationWarranties: (qId: string) => ipcRenderer.invoke('db:getQuotationWarranties', qId),
  setQuotationWarranties: (qId: string, ids: string[]) => ipcRenderer.invoke('db:setQuotationWarranties', qId, ids),
  updateQuotationWarrantyVesselScope: (qId: string, piWarrantyId: string, vesselScope: string[] | null) => ipcRenderer.invoke('db:updateQuotationWarrantyVesselScope', qId, piWarrantyId, vesselScope),
  updateQuotationClauseVesselScope: (qId: string, piClauseId: string, vesselScope: string[] | null) => ipcRenderer.invoke('db:updateQuotationClauseVesselScope', qId, piClauseId, vesselScope),
  getQuotationCustomWarranties: (qId: string) => ipcRenderer.invoke('db:getQuotationCustomWarranties', qId),
  addQuotationCustomWarranty: (data: { quotationId: string; text: string; order?: number }) => ipcRenderer.invoke('db:addQuotationCustomWarranty', data),
  updateQuotationCustomWarranty: (id: string, updates: { text?: string }) => ipcRenderer.invoke('db:updateQuotationCustomWarranty', id, updates),
  deleteQuotationCustomWarranty: (id: string) => ipcRenderer.invoke('db:deleteQuotationCustomWarranty', id),
  reorderQuotationCustomWarranties: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationCustomWarranties', ids),

  getQuotationDeductibles: (qId: string) => ipcRenderer.invoke('db:getQuotationDeductibles', qId),
  addQuotationDeductible: (data: any) => ipcRenderer.invoke('db:addQuotationDeductible', data),
  updateQuotationDeductible: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationDeductible', id, updates),
  deleteQuotationDeductible: (id: string) => ipcRenderer.invoke('db:deleteQuotationDeductible', id),
  reorderQuotationDeductibles: (orderedIds: string[]) => ipcRenderer.invoke('db:reorderQuotationDeductibles', orderedIds),

  getQuotationTextDeductibles: (qId: string) => ipcRenderer.invoke('db:getQuotationTextDeductibles', qId),
  addQuotationTextDeductible: (data: any) => ipcRenderer.invoke('db:addQuotationTextDeductible', data),
  updateQuotationTextDeductible: (id: string, updates: { text?: string }) => ipcRenderer.invoke('db:updateQuotationTextDeductible', id, updates),
  deleteQuotationTextDeductible: (id: string) => ipcRenderer.invoke('db:deleteQuotationTextDeductible', id),
  reorderQuotationTextDeductibles: (orderedIds: string[]) => ipcRenderer.invoke('db:reorderQuotationTextDeductibles', orderedIds),

  getQuotationExclusions: (qId: string) => ipcRenderer.invoke('db:getQuotationExclusions', qId),
  setQuotationExclusions: (qId: string, items: any[]) => ipcRenderer.invoke('db:setQuotationExclusions', qId, items),
  addQuotationExclusion: (qId: string, piExclusionId: string, altId?: string | null) => ipcRenderer.invoke('db:addQuotationExclusion', qId, piExclusionId, altId),
  deleteQuotationExclusion: (id: string) => ipcRenderer.invoke('db:deleteQuotationExclusion', id),
  getQuotationCustomExclusions: (qId: string) => ipcRenderer.invoke('db:getQuotationCustomExclusions', qId),
  addQuotationCustomExclusion: (data: { quotationId: string; text: string; order?: number }) => ipcRenderer.invoke('db:addQuotationCustomExclusion', data),
  updateQuotationCustomExclusion: (id: string, updates: { text?: string }) => ipcRenderer.invoke('db:updateQuotationCustomExclusion', id, updates),
  deleteQuotationCustomExclusion: (id: string) => ipcRenderer.invoke('db:deleteQuotationCustomExclusion', id),
  reorderQuotationCustomExclusions: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationCustomExclusions', ids),

  updateQuotationItemVesselScope: (table: string, id: string, vesselScope: string[] | null) => ipcRenderer.invoke('db:updateQuotationItemVesselScope', table, id, vesselScope),

  getQuotationCustomSections: (qId: string) => ipcRenderer.invoke('db:getQuotationCustomSections', qId),
  addQuotationCustomSection: (data: { quotationId: string; title: string; text?: string; order?: number }) => ipcRenderer.invoke('db:addQuotationCustomSection', data),
  updateQuotationCustomSection: (id: string, updates: { title?: string; text?: string }) => ipcRenderer.invoke('db:updateQuotationCustomSection', id, updates),
  deleteQuotationCustomSection: (id: string) => ipcRenderer.invoke('db:deleteQuotationCustomSection', id),
  reorderQuotationCustomSections: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationCustomSections', ids),
  piGetSectionOrderDefaults: () => ipcRenderer.invoke('pi:getSectionOrderDefaults'),
  piSetSectionOrderDefaults: (order: string[]) => ipcRenderer.invoke('pi:setSectionOrderDefaults', order),
  piGetSectionOrderDefaultsByType: (typeCode: string) => ipcRenderer.invoke('pi:getSectionOrderDefaultsByType', typeCode),
  piSetSectionOrderDefaultsByType: (typeCode: string, order: string[]) => ipcRenderer.invoke('pi:setSectionOrderDefaultsByType', typeCode, order),

  getQuotationExcludedCountries: (qId: string) => ipcRenderer.invoke('db:getQuotationExcludedCountries', qId),
  setQuotationExcludedCountries: (qId: string, countries: any[]) => ipcRenderer.invoke('db:setQuotationExcludedCountries', qId, countries),

  getPISubjectivities: () => ipcRenderer.invoke('db:getPISubjectivities'),
  addPISubjectivity: (data: any) => ipcRenderer.invoke('db:addPISubjectivity', data),
  updatePISubjectivity: (id: string, data: any) => ipcRenderer.invoke('db:updatePISubjectivity', id, data),
  deletePISubjectivity: (id: string) => ipcRenderer.invoke('db:deletePISubjectivity', id),
  reorderPISubjectivities: (ids: string[]) => ipcRenderer.invoke('db:reorderPISubjectivities', ids),

  getQuotationSubjectivities: (qId: string) => ipcRenderer.invoke('db:getQuotationSubjectivities', qId),
  addQuotationSubjectivity: (data: any) => ipcRenderer.invoke('db:addQuotationSubjectivity', data),
  updateQuotationSubjectivity: (id: string, data: any) => ipcRenderer.invoke('db:updateQuotationSubjectivity', id, data),
  deleteQuotationSubjectivity: (id: string) => ipcRenderer.invoke('db:deleteQuotationSubjectivity', id),

  getQuotationInstalments: (qId: string) => ipcRenderer.invoke('db:getQuotationInstalments', qId),
  setQuotationInstalments: (qId: string, instalments: any[]) => ipcRenderer.invoke('db:setQuotationInstalments', qId, instalments),

  getQuotationInformation: (qId: string) => ipcRenderer.invoke('db:getQuotationInformation', qId),
  addQuotationInformation: (data: any) => ipcRenderer.invoke('db:addQuotationInformation', data),
  deleteQuotationInformation: (id: string) => ipcRenderer.invoke('db:deleteQuotationInformation', id),

  getQuotationNotes: (qId: string) => ipcRenderer.invoke('db:getQuotationNotes', qId),
  addQuotationNote: (data: any) => ipcRenderer.invoke('db:addQuotationNote', data),
  updateQuotationNote: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationNote', id, updates),
  deleteQuotationNote: (id: string) => ipcRenderer.invoke('db:deleteQuotationNote', id),



  // File Path Remap
  vesselGetFilePaths: (vesselId: string) => ipcRenderer.invoke('vessel:getFilePaths', vesselId),
  vesselRemapFilePaths: (remaps: { source: string; id: string; newPath: string }[]) => ipcRenderer.invoke('vessel:remapFilePaths', remaps),
  entityGetFilePaths: (entityId: string) => ipcRenderer.invoke('entity:getFilePaths', entityId),
  entityRemapFilePaths: (remaps: { source: string; id: string; newPath: string }[]) => ipcRenderer.invoke('entity:remapFilePaths', remaps),
  dialogOpenFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  dialogLocateFile: () => ipcRenderer.invoke('dialog:locateFile'),
  shellShowItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  warBreachSave: (record: any) => ipcRenderer.invoke('warBreach:save', record),
  warBreachGetAll: () => ipcRenderer.invoke('warBreach:getAll'),
  warBreachDelete: (id: string) => ipcRenderer.invoke('warBreach:delete', id),

  // Analytics
  analyticsGetPresets: () => ipcRenderer.invoke('analytics:getPresets'),
  analyticsAddPreset: (name: string, filters: any) => ipcRenderer.invoke('analytics:addPreset', name, filters),
  analyticsUpdatePreset: (id: string, name: string, filters: any) => ipcRenderer.invoke('analytics:updatePreset', id, name, filters),
  analyticsDeletePreset: (id: string) => ipcRenderer.invoke('analytics:deletePreset', id),
  analyticsGetData: (filters: any) => ipcRenderer.invoke('analytics:getData', filters),

  // Activity Log
  activityGetLog: (filters: any) => ipcRenderer.invoke('activity:getLog', filters),
  activityLog: (entry: any) => ipcRenderer.invoke('activity:log', entry),
  activityGetDistinctModules: () => ipcRenderer.invoke('activity:getDistinctModules'),
  activityGetDistinctActions: () => ipcRenderer.invoke('activity:getDistinctActions'),
  activityGetDistinctUsers: () => ipcRenderer.invoke('activity:getDistinctUsers'),
  activityGetRetention: () => ipcRenderer.invoke('activity:getRetention'),
  activitySetRetention: (days: number) => ipcRenderer.invoke('activity:setRetention', days),
  activityCleanup: () => ipcRenderer.invoke('activity:cleanup'),
  activityGetCount: () => ipcRenderer.invoke('activity:getCount'),

  // Report Settings
  reportSettingsGet: () => ipcRenderer.invoke('reportSettings:get'),
  reportSettingsSet: (settings: any) => ipcRenderer.invoke('reportSettings:set', settings),
  getUserSectionAccess: () => ipcRenderer.invoke('settings:getUserSectionAccess'),
  setUserSectionAccess: (sectionIds: string[]) => ipcRenderer.invoke('settings:setUserSectionAccess', sectionIds),

  // Email Templates
  emailGetTemplates: (category?: string) => ipcRenderer.invoke('email:getTemplates', category),
  emailAddTemplate: (template: any) => ipcRenderer.invoke('email:addTemplate', template),
  emailUpdateTemplate: (id: string, updates: any) => ipcRenderer.invoke('email:updateTemplate', id, updates),
  emailDeleteTemplate: (id: string) => ipcRenderer.invoke('email:deleteTemplate', id),
  emailReorderTemplates: (orderedIds: string[]) => ipcRenderer.invoke('email:reorderTemplates', orderedIds),

  // Workflow Steps & Transitions
  workflowGetSteps: () => ipcRenderer.invoke('workflow:getSteps'),
  workflowAddStep: (step: any) => ipcRenderer.invoke('workflow:addStep', step),
  workflowUpdateStep: (id: string, updates: any) => ipcRenderer.invoke('workflow:updateStep', id, updates),
  workflowDeleteStep: (id: string) => ipcRenderer.invoke('workflow:deleteStep', id),
  workflowReorderSteps: (orderedIds: string[]) => ipcRenderer.invoke('workflow:reorderSteps', orderedIds),
  workflowGetTransitions: () => ipcRenderer.invoke('workflow:getTransitions'),
  workflowAddTransition: (t: any) => ipcRenderer.invoke('workflow:addTransition', t),
  workflowUpdateTransition: (id: string, updates: any) => ipcRenderer.invoke('workflow:updateTransition', id, updates),
  workflowDeleteTransition: (id: string) => ipcRenderer.invoke('workflow:deleteTransition', id),
  workflowMoveQuotation: (quotationId: string, toStepId: string, comment?: string) => ipcRenderer.invoke('workflow:moveQuotation', quotationId, toStepId, comment),
  workflowAssignQuotationNumber: (quotationId: string) => ipcRenderer.invoke('workflow:assignQuotationNumber', quotationId),
  workflowGetQuotationLog: (quotationId: string) => ipcRenderer.invoke('workflow:getQuotationLog', quotationId),
  workflowGetReachableSteps: (quotationId: string) => ipcRenderer.invoke('workflow:getReachableSteps', quotationId),

  // Survey Warranty Templates (Quotation Settings)
  surveyWarrantyTemplateGetAll: () => ipcRenderer.invoke('surveyWarrantyTemplate:getAll'),
  surveyWarrantyTemplateAdd: (text: string) => ipcRenderer.invoke('surveyWarrantyTemplate:add', text),
  surveyWarrantyTemplateUpdate: (id: string, text: string) => ipcRenderer.invoke('surveyWarrantyTemplate:update', id, text),
  surveyWarrantyTemplateDelete: (id: string) => ipcRenderer.invoke('surveyWarrantyTemplate:delete', id),
  surveyWarrantyTemplateReorder: (ids: string[]) => ipcRenderer.invoke('surveyWarrantyTemplate:reorder', ids),

  surveyWarrantyTemplateSetGetAll: () => ipcRenderer.invoke('surveyWarrantyTemplateSet:getAll'),
  surveyWarrantyTemplateSetAdd: (name: string, templateIds: string[]) => ipcRenderer.invoke('surveyWarrantyTemplateSet:add', name, templateIds),
  surveyWarrantyTemplateSetUpdate: (id: string, name: string, templateIds: string[]) => ipcRenderer.invoke('surveyWarrantyTemplateSet:update', id, name, templateIds),
  surveyWarrantyTemplateSetDelete: (id: string) => ipcRenderer.invoke('surveyWarrantyTemplateSet:delete', id),

  quotationSurveyWarrantyGetAll: (quotationId: string) => ipcRenderer.invoke('quotationSurveyWarranty:getAll', quotationId),
  quotationSurveyWarrantySet: (quotationId: string, items: any[]) => ipcRenderer.invoke('quotationSurveyWarranty:set', quotationId, items),
  quotationSurveyWarrantyAdd: (data: any) => ipcRenderer.invoke('quotationSurveyWarranty:add', data),
  quotationSurveyWarrantyUpdate: (id: string, data: any) => ipcRenderer.invoke('quotationSurveyWarranty:update', id, data),
  quotationSurveyWarrantyDelete: (id: string) => ipcRenderer.invoke('quotationSurveyWarranty:delete', id),

  // Database Backup & Restore
  dbBackup: () => ipcRenderer.invoke('db:backup'),
  dbRestore: () => ipcRenderer.invoke('db:restore'),
  dbGetLastBackupDate: () => ipcRenderer.invoke('db:getLastBackupDate'),

  // Banks
  bankGetAll: () => ipcRenderer.invoke('bank:getAll'),
  bankAdd: (name: string, details: string) => ipcRenderer.invoke('bank:add', name, details),
  bankUpdate: (id: string, data: { name: string; details: string }) => ipcRenderer.invoke('bank:update', id, data),
  bankDelete: (id: string) => ipcRenderer.invoke('bank:delete', id),
  bankReorder: (ids: string[]) => ipcRenderer.invoke('bank:reorder', ids),

  // Policy document methods
  policyGetById: (id: string) => ipcRenderer.invoke('policy:getById', id),
  policyGetInstalments: (policyId: string) => ipcRenderer.invoke('policy:getInstalments', policyId),
  policyGetAddresses: (policyId: string) => ipcRenderer.invoke('policy:getAddresses', policyId),
  policyGetBlueCards: (policyId: string) => ipcRenderer.invoke('policy:getBlueCards', policyId),
  policyGetRevisions: (policyNumber: string) => ipcRenderer.invoke('policy:getRevisions', policyNumber),
  policyAddBlueCard: (data: any) => ipcRenderer.invoke('policy:addBlueCard', data),
  policyUpdateBlueCard: (id: string, data: any) => ipcRenderer.invoke('policy:updateBlueCard', id, data),
  policySupersedeBlueCard: (id: string) => ipcRenderer.invoke('policy:supersedeBlueCard', id),
  policyUpdate: (id: string, fields: any) => ipcRenderer.invoke('policy:update', id, fields),
  policySetInstalments: (policyId: string, instalments: any[]) => ipcRenderer.invoke('policy:setInstalments', policyId, instalments),
  policySetAddresses: (policyId: string, addresses: any[]) => ipcRenderer.invoke('policy:setAddresses', policyId, addresses),
  policyCreateRevision: (policyId: string) => ipcRenderer.invoke('policy:createRevision', policyId),
  policyDelete: (id: string) => ipcRenderer.invoke('policy:delete', id),
  policyConvertFromQuotation: (quotationId: string, options: any) => ipcRenderer.invoke('policy:convertFromQuotation', quotationId, options),
  policyRenew: (policyId: string) => ipcRenderer.invoke('policy:renew', policyId),
  policySign: (policyId: string) => ipcRenderer.invoke('policy:sign', policyId),
  policyGetSignature: (policyId: string) => ipcRenderer.invoke('policy:getSignature', policyId),

  // Signatures
  signatureGet: () => ipcRenderer.invoke('signature:get'),
  signatureGetForUser: (userId: string) => ipcRenderer.invoke('signature:getForUser', userId),
  signatureUpload: (imageData: number[], fileName: string) => ipcRenderer.invoke('signature:upload', imageData, fileName),
  signatureUploadForUser: (userId: string, filePath: string) => ipcRenderer.invoke('signature:uploadForUser', userId, filePath),
  signatureDelete: () => ipcRenderer.invoke('signature:delete'),
  signatureDeleteForUser: (userId: string) => ipcRenderer.invoke('signature:deleteForUser', userId),
  signatureGetAll: () => ipcRenderer.invoke('signature:getAll'),

  // Notification Groups
  notifGroupGetAll: () => ipcRenderer.invoke('notifGroup:getAll'),
  notifGroupAdd: (name: string, description?: string) => ipcRenderer.invoke('notifGroup:add', name, description),
  notifGroupUpdate: (id: string, name: string, description?: string) => ipcRenderer.invoke('notifGroup:update', id, name, description),
  notifGroupDelete: (id: string) => ipcRenderer.invoke('notifGroup:delete', id),
  notifGroupReorder: (ids: string[]) => ipcRenderer.invoke('notifGroup:reorder', ids),
  notifGroupGetMembers: (groupId: string) => ipcRenderer.invoke('notifGroup:getMembers', groupId),
  notifGroupSetMembers: (groupId: string, userIds: string[]) => ipcRenderer.invoke('notifGroup:setMembers', groupId, userIds),
  notifGroupGetSubscriptions: (groupId: string) => ipcRenderer.invoke('notifGroup:getSubscriptions', groupId),
  notifGroupSetSubscriptions: (groupId: string, eventTypes: string[]) => ipcRenderer.invoke('notifGroup:setSubscriptions', groupId, eventTypes),

  // Daily Alerts
  dailyAlertsRunNow: () => ipcRenderer.invoke('dailyAlerts:runNow'),
  dailyAlertsGetLastRun: () => ipcRenderer.invoke('dailyAlerts:getLastRun'),

  // Notifications
  notificationsGet: (opts?: any) => ipcRenderer.invoke('notifications:get', opts),
  notificationsGetUnreadCount: () => ipcRenderer.invoke('notifications:getUnreadCount'),
  notificationsMarkRead: (id: string) => ipcRenderer.invoke('notifications:markRead', id),
  notificationsMarkAllRead: () => ipcRenderer.invoke('notifications:markAllRead'),
  notificationsDelete: (id: string) => ipcRenderer.invoke('notifications:delete', id),
  notificationsGetUsernames: () => ipcRenderer.invoke('notifications:getUsernames'),

  // Database Health
  getDatabaseHealth: () => ipcRenderer.invoke('db:getHealth'),

  // Column Preferences
  columnPrefsGet: (pageKey: string) => ipcRenderer.invoke('columnPrefs:get', pageKey),
  columnPrefsSet: (pageKey: string, columnIds: string[]) => ipcRenderer.invoke('columnPrefs:set', pageKey, columnIds),

  // Bulk Operations
  bulkAssignFleet: (vesselIds: string[], fleetId: string) => ipcRenderer.invoke('bulk:assignFleet', vesselIds, fleetId),
  bulkSetVesselStatus: (vesselIds: string[], isActive: boolean) => ipcRenderer.invoke('bulk:setVesselStatus', vesselIds, isActive),
  bulkDeleteEntities: (entityIds: string[]) => ipcRenderer.invoke('bulk:deleteEntities', entityIds),

  // Report Builder
  reportBuilderGetSaved: () => ipcRenderer.invoke('reports:getSaved'),
  reportBuilderSave: (data: any) => ipcRenderer.invoke('reports:save', data),
  reportBuilderDelete: (id: string) => ipcRenderer.invoke('reports:delete', id),
  reportBuilderRun: (dataSource: string, config: any) => ipcRenderer.invoke('reports:run', dataSource, config),

  // Document Templates
  fileSaveDocx: (data: number[], defaultName: string) => ipcRenderer.invoke('file:saveDocx', data, defaultName),
  docTemplateGetAll: (category?: string) => ipcRenderer.invoke('docTemplate:getAll', category),
  docTemplateGetById: (id: string) => ipcRenderer.invoke('docTemplate:getById', id),
  docTemplateAdd: (data: any) => ipcRenderer.invoke('docTemplate:add', data),
  docTemplateUpdate: (id: string, data: any) => ipcRenderer.invoke('docTemplate:update', id, data),
  docTemplateReplaceFile: (id: string, data: any) => ipcRenderer.invoke('docTemplate:replaceFile', id, data),
  docTemplateDelete: (id: string) => ipcRenderer.invoke('docTemplate:delete', id),
  docTemplateReorder: (ids: string[]) => ipcRenderer.invoke('docTemplate:reorder', ids),
  docTemplateGenerate: (templateId: string, context: { vesselId?: string; policyId?: string; entityId?: string }) => ipcRenderer.invoke('docTemplate:generate', templateId, context),

  // Custom Validation Rules
  validationRulesGetAll: () => ipcRenderer.invoke('validationRules:getAll'),
  validationRulesAdd: (rule: any) => ipcRenderer.invoke('validationRules:add', rule),
  validationRulesUpdate: (id: string, updates: any) => ipcRenderer.invoke('validationRules:update', id, updates),
  validationRulesDelete: (id: string) => ipcRenderer.invoke('validationRules:delete', id),
  validationRulesReorder: (ids: string[]) => ipcRenderer.invoke('validationRules:reorder', ids),
  validationRulesRun: () => ipcRenderer.invoke('validationRules:run'),

  // Global Search
  globalSearch: (query: string) => ipcRenderer.invoke('global:search', query),

  // Recent Items
  recentItemsGet: () => ipcRenderer.invoke('recent:get'),
  recentItemsAdd: (itemType: string, itemId: string, itemLabel: string, itemSublabel?: string) => ipcRenderer.invoke('recent:add', itemType, itemId, itemLabel, itemSublabel),

  // T&C Templates
  tcGetTemplate: (typeCode: string) => ipcRenderer.invoke('tc:getTemplate', typeCode),
  tcGetTemplateFile: (typeCode: string) => ipcRenderer.invoke('tc:getTemplateFile', typeCode),
  tcGetAllTemplates: () => ipcRenderer.invoke('tc:getAllTemplates'),
  tcUpload: (data: { typeCode: string; fileName: string; fileData: number[] }) => ipcRenderer.invoke('tc:upload', data),
  tcDelete: (typeCode: string) => ipcRenderer.invoke('tc:delete', typeCode),

  // File Manager
  fileManagerGetRoot: () => ipcRenderer.invoke('fileManager:getRoot'),
  fileManagerSetRoot: (rootPath: string) => ipcRenderer.invoke('fileManager:setRoot', rootPath),
  fileManagerReadDirectory: (dirPath: string) => ipcRenderer.invoke('fileManager:readDirectory', dirPath),
  fileManagerReadTree: (dirPath: string, depth?: number) => ipcRenderer.invoke('fileManager:readTree', dirPath, depth),
  fileManagerMoveFolder: (sourcePath: string, destParentPath: string) => ipcRenderer.invoke('fileManager:moveFolder', sourcePath, destParentPath),
  fileManagerRenameFolder: (folderPath: string, newName: string) => ipcRenderer.invoke('fileManager:renameFolder', folderPath, newName),
  fileManagerCreateFolder: (parentPath: string, name: string) => ipcRenderer.invoke('fileManager:createFolder', parentPath, name),
  fileManagerExists: (filePath: string) => ipcRenderer.invoke('fileManager:exists', filePath),
  fileManagerHealthCheck: () => ipcRenderer.invoke('fileManager:healthCheck'),
  fileManagerOpenInExplorer: (filePath: string) => ipcRenderer.invoke('fileManager:openInExplorer', filePath),
  fileManagerOpenFile: (filePath: string) => ipcRenderer.invoke('fileManager:openFile', filePath),

  // DOCX-to-PDF Conversion
  convertDocxToPdf: (docxPath: string) => ipcRenderer.invoke('convert:docxToPdf', docxPath),
  convertCountPdfPages: (pdfPath: string) => ipcRenderer.invoke('convert:countPdfPages', pdfPath),
  convertMergePdfs: (pdfPaths: string[], outputPath: string) => ipcRenderer.invoke('convert:mergePdfs', pdfPaths, outputPath),
  convertSetDocxPageStart: (data: { fileData: number[]; startPage: number }) => ipcRenderer.invoke('convert:setDocxPageStart', data),
  convertBuildPolicyWithTC: (data: { policyDocxData: number[]; tcTypeCode: string; filePrefix: string }) => ipcRenderer.invoke('convert:buildPolicyWithTC', data),
}

// Expose curated API to renderer via context bridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
}
