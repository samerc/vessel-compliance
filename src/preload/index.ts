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
  purgeAllVesselsAndEntities: () => ipcRenderer.invoke('db:purgeAllVesselsAndEntities'),

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
  maintenanceSyncSettings: () => ipcRenderer.invoke('maintenance:syncSettings'),
  maintenanceAddOneDayToAllPolicies: () => ipcRenderer.invoke('maintenance:addOneDayToAllPolicies'),

  fsExists: (filePath) => ipcRenderer.invoke('fs:exists', filePath),
  fsOpen: (filePath) => ipcRenderer.invoke('fs:open', filePath),
  getFilePath: (file: File) => webUtils.getPathForFile(file),

  dialogOpenFile: () => ipcRenderer.invoke('dialog:openFile'),
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
  updateUserWindowPreferences: (width: number, height: number, x?: number, y?: number) => ipcRenderer.invoke('users:updateWindowPreferences', width, height, x, y),
  updateSanctionsThreshold: (threshold: number) => ipcRenderer.invoke('users:updateSanctionsThreshold', threshold),
  updateUserAppVersion: (version: string) => ipcRenderer.invoke('users:updateAppVersion', version),

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

  // Flag States
  getFlagStates: () => ipcRenderer.invoke('db:getFlagStates'),
  addFlagState: (flagState: any) => ipcRenderer.invoke('db:addFlagState', flagState),
  updateFlagState: (id: string, updates: any) => ipcRenderer.invoke('db:updateFlagState', id, updates),
  deleteFlagState: (id: string) => ipcRenderer.invoke('db:deleteFlagState', id),
  getVesselsByFlagState: (flagStateId: string) => ipcRenderer.invoke('db:getVesselsByFlagState', flagStateId),

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

  // Auto-Update
  updateCheckForUpdates: () => ipcRenderer.invoke('update:checkForUpdates'),
  updateQuitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
  updateGetCurrentVersion: () => ipcRenderer.invoke('update:getCurrentVersion'),
  updateGetChangelogs: () => ipcRenderer.invoke('update:getChangelogs'),
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
  remindersUnsnoozeVessel: (vesselId: string) => ipcRenderer.invoke('reminders:unsnoozeVessel', vesselId),

  // P&I Settings
  piGetClauses: () => ipcRenderer.invoke('pi:getClauses'),
  piAddClause: (clause: any) => ipcRenderer.invoke('pi:addClause', clause),
  piUpdateClause: (id: string, updates: any) => ipcRenderer.invoke('pi:updateClause', id, updates),
  piDeleteClause: (id: string) => ipcRenderer.invoke('pi:deleteClause', id),
  piReorderClauses: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderClauses', orderedIds),

  piGetClauseSets: () => ipcRenderer.invoke('pi:getClauseSets'),
  piAddClauseSet: (name: string, clauseIds: string[]) => ipcRenderer.invoke('pi:addClauseSet', name, clauseIds),
  piUpdateClauseSet: (id: string, name: string, clauseIds: string[]) => ipcRenderer.invoke('pi:updateClauseSet', id, name, clauseIds),
  piDeleteClauseSet: (id: string) => ipcRenderer.invoke('pi:deleteClauseSet', id),

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

  piGetExclusions: () => ipcRenderer.invoke('pi:getExclusions'),
  piAddExclusion: (text: string) => ipcRenderer.invoke('pi:addExclusion', text),
  piUpdateExclusion: (id: string, text: string) => ipcRenderer.invoke('pi:updateExclusion', id, text),
  piDeleteExclusion: (id: string) => ipcRenderer.invoke('pi:deleteExclusion', id),
  piReorderExclusions: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderExclusions', orderedIds),

  piGetSubLimitTemplates: () => ipcRenderer.invoke('pi:getSubLimitTemplates'),
  piAddSubLimitTemplate: (tmpl: any) => ipcRenderer.invoke('pi:addSubLimitTemplate', tmpl),
  piUpdateSubLimitTemplate: (id: string, updates: any) => ipcRenderer.invoke('pi:updateSubLimitTemplate', id, updates),
  piDeleteSubLimitTemplate: (id: string) => ipcRenderer.invoke('pi:deleteSubLimitTemplate', id),
  piReorderSubLimitTemplates: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderSubLimitTemplates', orderedIds),

  piGetAdditionalClauses: () => ipcRenderer.invoke('pi:getAdditionalClauses'),
  piAddAdditionalClause: (text: string) => ipcRenderer.invoke('pi:addAdditionalClause', text),
  piUpdateAdditionalClause: (id: string, text: string) => ipcRenderer.invoke('pi:updateAdditionalClause', id, text),
  piDeleteAdditionalClause: (id: string) => ipcRenderer.invoke('pi:deleteAdditionalClause', id),
  piReorderAdditionalClauses: (orderedIds: string[]) => ipcRenderer.invoke('pi:reorderAdditionalClauses', orderedIds),

  piGetTradingExcludedCountries: () => ipcRenderer.invoke('pi:getTradingExcludedCountries'),
  piAddTradingExcludedCountry: (country: any) => ipcRenderer.invoke('pi:addTradingExcludedCountry', country),
  piUpdateTradingExcludedCountry: (id: string, updates: any) => ipcRenderer.invoke('pi:updateTradingExcludedCountry', id, updates),
  piDeleteTradingExcludedCountry: (id: string) => ipcRenderer.invoke('pi:deleteTradingExcludedCountry', id),

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

  // Policy Expiry Alerts
  getExpiredActivePolicies: () => ipcRenderer.invoke('policies:getExpiredActive'),
  getPolicyRenewalsByMonth: (year: number, month: number) => ipcRenderer.invoke('policies:getRenewalsByMonth', year, month),

  // Quotations
  getQuotations: () => ipcRenderer.invoke('db:getQuotations'),
  addQuotation: (q: any) => ipcRenderer.invoke('db:addQuotation', q),
  updateQuotation: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotation', id, updates),
  deleteQuotation: (id: string) => ipcRenderer.invoke('db:deleteQuotation', id),

  // Quotation Sub-Tables
  getQuotationAssureds: (qId: string) => ipcRenderer.invoke('db:getQuotationAssureds', qId),
  addQuotationAssured: (data: any) => ipcRenderer.invoke('db:addQuotationAssured', data),
  updateQuotationAssured: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationAssured', id, updates),
  deleteQuotationAssured: (id: string) => ipcRenderer.invoke('db:deleteQuotationAssured', id),
  reorderQuotationAssureds: (ids: string[]) => ipcRenderer.invoke('db:reorderQuotationAssureds', ids),

  getQuotationNewVessel: (qId: string) => ipcRenderer.invoke('db:getQuotationNewVessel', qId),
  upsertQuotationNewVessel: (qId: string, data: any) => ipcRenderer.invoke('db:upsertQuotationNewVessel', qId, data),
  deleteQuotationNewVessel: (qId: string) => ipcRenderer.invoke('db:deleteQuotationNewVessel', qId),

  getQuotationSubLimits: (qId: string) => ipcRenderer.invoke('db:getQuotationSubLimits', qId),
  addQuotationSubLimit: (data: any) => ipcRenderer.invoke('db:addQuotationSubLimit', data),
  updateQuotationSubLimit: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationSubLimit', id, updates),
  deleteQuotationSubLimit: (id: string) => ipcRenderer.invoke('db:deleteQuotationSubLimit', id),

  getQuotationClauses: (qId: string) => ipcRenderer.invoke('db:getQuotationClauses', qId),
  setQuotationClauses: (qId: string, ids: string[], overrides?: Record<string, string>) => ipcRenderer.invoke('db:setQuotationClauses', qId, ids, overrides),
  getQuotationClauseOverrides: (qId: string) => ipcRenderer.invoke('db:getQuotationClauseOverrides', qId),
  updateQuotationClauseOverride: (qId: string, clauseId: string, override: string | null) => ipcRenderer.invoke('db:updateQuotationClauseOverride', qId, clauseId, override),

  getQuotationAdditionalClauses: (qId: string) => ipcRenderer.invoke('db:getQuotationAdditionalClauses', qId),
  addQuotationAdditionalClause: (data: any) => ipcRenderer.invoke('db:addQuotationAdditionalClause', data),
  deleteQuotationAdditionalClause: (id: string) => ipcRenderer.invoke('db:deleteQuotationAdditionalClause', id),

  getQuotationWarranties: (qId: string) => ipcRenderer.invoke('db:getQuotationWarranties', qId),
  setQuotationWarranties: (qId: string, ids: string[]) => ipcRenderer.invoke('db:setQuotationWarranties', qId, ids),

  getQuotationDeductibles: (qId: string) => ipcRenderer.invoke('db:getQuotationDeductibles', qId),
  addQuotationDeductible: (data: any) => ipcRenderer.invoke('db:addQuotationDeductible', data),
  updateQuotationDeductible: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationDeductible', id, updates),
  deleteQuotationDeductible: (id: string) => ipcRenderer.invoke('db:deleteQuotationDeductible', id),

  getQuotationTextDeductibles: (qId: string) => ipcRenderer.invoke('db:getQuotationTextDeductibles', qId),
  addQuotationTextDeductible: (data: any) => ipcRenderer.invoke('db:addQuotationTextDeductible', data),
  deleteQuotationTextDeductible: (id: string) => ipcRenderer.invoke('db:deleteQuotationTextDeductible', id),

  getQuotationExclusions: (qId: string) => ipcRenderer.invoke('db:getQuotationExclusions', qId),
  setQuotationExclusions: (qId: string, items: any[]) => ipcRenderer.invoke('db:setQuotationExclusions', qId, items),

  getQuotationExcludedCountries: (qId: string) => ipcRenderer.invoke('db:getQuotationExcludedCountries', qId),
  setQuotationExcludedCountries: (qId: string, countries: any[]) => ipcRenderer.invoke('db:setQuotationExcludedCountries', qId, countries),

  getQuotationSubjectivities: (qId: string) => ipcRenderer.invoke('db:getQuotationSubjectivities', qId),
  addQuotationSubjectivity: (data: any) => ipcRenderer.invoke('db:addQuotationSubjectivity', data),
  updateQuotationSubjectivity: (id: string, text: string) => ipcRenderer.invoke('db:updateQuotationSubjectivity', id, text),
  deleteQuotationSubjectivity: (id: string) => ipcRenderer.invoke('db:deleteQuotationSubjectivity', id),

  getQuotationInstalments: (qId: string) => ipcRenderer.invoke('db:getQuotationInstalments', qId),
  setQuotationInstalments: (qId: string, instalments: any[]) => ipcRenderer.invoke('db:setQuotationInstalments', qId, instalments),

  getQuotationInformation: (qId: string) => ipcRenderer.invoke('db:getQuotationInformation', qId),
  addQuotationInformation: (data: any) => ipcRenderer.invoke('db:addQuotationInformation', data),
  deleteQuotationInformation: (id: string) => ipcRenderer.invoke('db:deleteQuotationInformation', id),

  getQuotationNotes: (qId: string) => ipcRenderer.invoke('db:getQuotationNotes', qId),
  addQuotationNote: (data: any) => ipcRenderer.invoke('db:addQuotationNote', data),
  updateQuotationNote: (id: string, updates: any) => ipcRenderer.invoke('db:updateQuotationNote', id, updates),
  deleteQuotationNote: (id: string) => ipcRenderer.invoke('db:deleteQuotationNote', id)
}

// Expose curated API to renderer via context bridge
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
}
