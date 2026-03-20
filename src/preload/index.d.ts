import { DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO, User, SanctionsMatch, FileTypeSettings, ConditionSurvey, SurveyDefect, SurveyAttachment, Surveyor, ComplianceScheduleSettings, ComplianceCheckLog, ComplianceCheckResult, PaginatedResult, EntityQueryParams, SurveyorQueryParams, ComplianceResultQueryParams, ReminderSettings, VesselReminder, VesselNameHistory, FlagState, VesselCustomDocType, PolicyType, VesselPolicy, DABQueryCriteria, PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIWarrantySet, PIDeductible, PIDeductibleSet, PIDeductibleSetItem, PITextDeductible, PIExclusion, PISubLimitTemplate, PIAdditionalClause, PIAdditionalClauseSet, TradingExcludedCountry, TradingWarrantyTemplate, Quotation, QuotationNewVessel, QuotationAssured, QuotationSubLimit, QuotationVessel, QuotationDeductible, QuotationTextDeductible, QuotationExcludedCountry, QuotationCustomWarranty, QuotationInstalment, QuotationNote, PISectionTexts, PISanctionsVersion, InstalmentDefaults, VesselInsurancePolicy, ClassificationSociety, VesselClassification, VesselType, VesselAuditEntry, PolicyTypeCharacteristic, PolicyTypeCondition, VesselDynamicPolicy, VesselPolicyValue, ReportSettings, SurveyWarranty, SurveyWarrantyReminder, PISubjectivity, QuotationSubjectivity, QuotationCustomExclusion, QuotationCustomSection, QuotationType, HullAgreedValueText, HullClause, HullClauseCondition, HullAdditionalCondition, QuotationAgreedValueItem, QuotationHullCondition, QuotationHullAdditionalCondition, QuotationHullAlternative, QuotationPIAlternative, WarCondition, QuotationWarCondition, WarSettings, EntityAddress, UserGroup, WorkflowStep, WorkflowTransition, QuotationWorkflowLog, PremiumTextTemplate, SurveyWarrantyTemplate, SurveyWarrantyTemplateSet, QuotationSurveyWarranty, TradingCustomText } from '../shared/types'

export interface Api {
  login: (username: string, password: string) => Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; message?: string }>
  getSession: () => Promise<Omit<User, 'passwordHash'> | null>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>
  authLogin: (credentials: { username: string; password: string }) => Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; message?: string }>
  authGetSession: () => Promise<Omit<User, 'passwordHash'> | null>
  authResetPassword: (username: string) => Promise<{ success: boolean; message?: string; newPassword?: string }>
  authLogout: () => Promise<void>
  authCreateUser: (userData: { username: string; password: string; role: 'admin' | 'user' }) => Promise<{ success: boolean; message?: string; userId?: string }>
  getUsers: () => Promise<User[]>
  deleteUser: (id: string) => Promise<void>
  updateUserRole: (userId: string, role: 'admin' | 'user') => Promise<void>
  setupSelectDirectory: () => Promise<string | null>
  setupSelectConfigFile: () => Promise<string | null>
  setupSaveConfig: (config: any, directory: string) => Promise<{ success: boolean; message?: string }>
  setupCheckConnection: () => Promise<boolean>
  setupGetConfigPath: () => Promise<string | null>
  setupLoadConfigFromDir: (directory: string) => Promise<{ success: boolean; message?: string }>
  setupLoadConfigFromFile: (filePath: string) => Promise<{ success: boolean; message?: string }>
  onDbStatus: (callback: (status: { connected: boolean }) => void) => void
  getDocumentTypes: () => Promise<DocumentType[]>
  addDocumentType: (docType: Omit<DocumentType, 'id'>) => Promise<DocumentType>
  updateDocumentType: (id: string, updates: Partial<DocumentType>) => Promise<void>
  deleteDocumentType: (id: string) => Promise<void>

  getVesselCustomDocTypes: (vesselId: string) => Promise<VesselCustomDocType[]>
  addVesselCustomDocType: (docType: Omit<VesselCustomDocType, 'id'>) => Promise<VesselCustomDocType>
  deleteVesselCustomDocType: (id: string) => Promise<void>

  getFleets: () => Promise<Fleet[]>
  addFleet: (fleet: Omit<Fleet, 'id'>) => Promise<Fleet>
  deleteFleet: (id: string) => Promise<void>

  getVessels: () => Promise<Vessel[]>
  addVessel: (vessel: Omit<Vessel, 'id'>) => Promise<{ success: boolean; data?: Vessel; message?: string }>
  updateVessel: (id: string, updates: Partial<Vessel>) => Promise<void>
  getVesselNameHistory: (vesselId: string) => Promise<VesselNameHistory[]>
  deleteVessel: (id: string) => Promise<{ success: boolean; message?: string }>

  getVesselDocuments: (vesselId?: string) => Promise<VesselDocument[]>
  upsertVesselDocument: (doc: VesselDocument) => Promise<void>
  updateVesselDocumentExpiry: (vesselId: string, docTypeId: string, expiryDate: string | null) => Promise<void>
  updateVesselDocumentReceivedDate: (vesselId: string, docTypeId: string, receivedDate: string) => Promise<void>
  duplicateVesselDocument: (docId: string, uploadedBy: string) => Promise<void>
  deleteVesselDocumentById: (docId: string) => Promise<void>

  getEntities: () => Promise<Entity[]>
  getEntitiesPaginated: (params: EntityQueryParams) => Promise<PaginatedResult<Entity>>
  addEntity: (entity: Omit<Entity, 'id'>) => Promise<Entity>
  updateEntity: (id: string, updates: Partial<Entity>) => Promise<void>
  deleteEntity: (id: string) => Promise<void>
  mergeEntities: (sourceId: string, targetId: string, keepName?: string) => Promise<{ mergedAssuredLinks: number; mergedUBOLinks: number; mergedCustomerLinks: number }>


  getAssuredRoles: () => Promise<AssuredRole[]>
  addAssuredRole: (role: Omit<AssuredRole, 'id'>) => Promise<AssuredRole>
  updateAssuredRole: (id: string, updates: Partial<AssuredRole>) => Promise<void>
  deleteAssuredRole: (id: string) => Promise<void>
  reorderAssuredRoles: (orderedIds: string[]) => Promise<void>
  getVesselsByRole: (roleName: string) => Promise<{ id: string; name: string; imoNumber: string }[]>

  getVesselAssureds: (vesselId?: string) => Promise<VesselAssured[]>
  addVesselAssured: (assured: Omit<VesselAssured, 'id'>) => Promise<VesselAssured>
  deleteVesselAssured: (id: string) => Promise<void>
  updateVesselAssuredRole: (id: string, role: string) => Promise<void>

  getEntityUBOs: (assuredEntityId?: string) => Promise<EntityUBO[]>
  addEntityUBO: (ubo: EntityUBO) => Promise<void>
  deleteEntityUBO: (ubo: EntityUBO) => Promise<void>

  // Entity Addresses
  getEntityAddresses: (entityId: string) => Promise<EntityAddress[]>
  getAllEntityAddresses: () => Promise<EntityAddress[]>
  addEntityAddress: (addr: Omit<EntityAddress, 'id'>) => Promise<EntityAddress>
  updateEntityAddress: (id: string, updates: Partial<Omit<EntityAddress, 'id' | 'entityId'>>) => Promise<void>
  deleteEntityAddress: (id: string) => Promise<void>
  updateVesselAssuredAddress: (id: string, addressId: string | null) => Promise<void>

  // RBAC
  rbacGetGroups: () => Promise<UserGroup[]>
  rbacAddGroup: (name: string, description?: string) => Promise<UserGroup>
  rbacUpdateGroup: (id: string, name: string, description?: string) => Promise<void>
  rbacDeleteGroup: (id: string) => Promise<void>
  rbacGetGroupPermissions: (groupId: string) => Promise<string[]>
  rbacSetGroupPermissions: (groupId: string, keys: string[]) => Promise<void>
  rbacGetUserGroupIds: (userId: string) => Promise<string[]>
  rbacSetUserGroups: (userId: string, groupIds: string[]) => Promise<void>
  rbacGetUserPermissionOverrides: (userId: string) => Promise<{ permissionKey: string; granted: boolean }[]>
  rbacSetUserPermissionOverrides: (userId: string, overrides: { permissionKey: string; granted: boolean }[]) => Promise<void>
  rbacResolveUserPermissions: (userId: string) => Promise<string[]>
  rbacGetMyPermissions: () => Promise<string[]>

  maintenanceSyncSettings: () => Promise<{ added: number }>


  fsExists: (filePath: string) => Promise<boolean>
  fsOpen: (filePath: string) => Promise<void>
  getFilePath: (file: File) => string

  dialogOpenFile: () => Promise<string | null>
  dialogOpenFileAny: () => Promise<string | null>
  excelImport: (filePath: string) => Promise<{ success: boolean; message: string; stats?: any }>
  dialogOpenFileWord: () => Promise<string | null>
  importDefectsFromWord: (surveyId: string, filePath: string) => Promise<{ success: boolean; message?: string; count: number }>

  themeGet: () => Promise<'light' | 'dark' | 'premium'>
  themeSet: (theme: 'light' | 'dark' | 'premium') => Promise<void>

  windowGetPreferences: () => Promise<{ width: number; height: number; x?: number; y?: number } | null>
  windowSavePreferences: () => Promise<void>

  fileTypesGetSettings: () => Promise<FileTypeSettings>
  fileTypesSetSettings: (settings: FileTypeSettings) => Promise<FileTypeSettings>
  fileTypesValidateFile: (filePath: string) => Promise<{ valid: boolean; reason?: string }>

  checkSanctions: (name: string) => Promise<{
    status: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH'
    matchFound: boolean
    timestamp: string
    matches: SanctionsMatch[]
  }>

  // Compliance Schedule
  complianceGetScheduleSettings: () => Promise<ComplianceScheduleSettings>
  complianceSetScheduleSettings: (settings: ComplianceScheduleSettings) => Promise<{ success: boolean; message?: string }>
  complianceGetCheckLogs: () => Promise<ComplianceCheckLog[]>
  complianceGetCheckResults: (logId?: string, status?: string) => Promise<ComplianceCheckResult[]>
  complianceGetCheckResultsPaginated: (params: ComplianceResultQueryParams) => Promise<PaginatedResult<ComplianceCheckResult>>
  complianceGetPendingResults: () => Promise<ComplianceCheckResult[]>
  complianceMarkResultReviewed: (resultId: string) => Promise<void>
  complianceDecideResult: (resultId: string, decision: 'sanctioned' | 'cleared') => Promise<{ success: boolean, message?: string }>
  complianceRunManualCheck: () => Promise<{ success: boolean; message?: string }>
  onComplianceCheckProgress: (callback: (data: { current: number; total: number; entityName: string }) => void) => () => void

  // Flag States
  getFlagStates: () => Promise<FlagState[]>
  addFlagState: (flagState: Omit<FlagState, 'id' | 'vesselCount'>) => Promise<FlagState>
  updateFlagState: (id: string, updates: Partial<FlagState>) => Promise<void>
  deleteFlagState: (id: string) => Promise<void>
  getVesselsByFlagState: (flagStateId: string) => Promise<{ id: string; name: string; imoNumber: string }[]>

  // Policy Types
  getPolicyTypes: () => Promise<PolicyType[]>
  addPolicyType: (name: string) => Promise<PolicyType>
  updatePolicyType: (id: string, updates: { name?: string }) => Promise<void>
  deletePolicyType: (id: string) => Promise<void>
  reorderPolicyTypes: (orderedIds: string[]) => Promise<void>

  // Vessel Policies
  getVesselPolicies: (vesselId: string) => Promise<VesselPolicy[]>
  addVesselPolicy: (vesselId: string, policyTypeId: string) => Promise<VesselPolicy>
  deleteVesselPolicy: (id: string) => Promise<void>

  // Dynamic Address Book
  queryDAB: (criteria: DABQueryCriteria) => Promise<any[]>

  // Surveyors
  getSurveyors: () => Promise<Surveyor[]>
  getSurveyorsPaginated: (params: SurveyorQueryParams) => Promise<PaginatedResult<Surveyor>>
  addSurveyor: (surveyor: Omit<Surveyor, 'id'>) => Promise<Surveyor>
  updateSurveyor: (id: string, updates: Partial<Surveyor>) => Promise<void>
  deleteSurveyor: (id: string) => Promise<void>

  // Condition Surveys
  getConditionSurveys: (vesselId?: string) => Promise<ConditionSurvey[]>
  addConditionSurvey: (survey: Omit<ConditionSurvey, 'id'>) => Promise<ConditionSurvey>
  updateConditionSurvey: (id: string, updates: Partial<ConditionSurvey>) => Promise<void>
  deleteConditionSurvey: (id: string) => Promise<void>
  getConditionSurveyTypes: () => Promise<{ id: string; name: string }[]>
  addConditionSurveyType: (name: string) => Promise<{ id: string; name: string }>
  deleteConditionSurveyType: (id: string) => Promise<void>
  getSurveyDefects: (surveyId?: string) => Promise<SurveyDefect[]>
  addSurveyDefect: (defect: Omit<SurveyDefect, 'id'>) => Promise<SurveyDefect>
  updateSurveyDefect: (id: string, updates: Partial<SurveyDefect>) => Promise<void>
  deleteSurveyDefect: (id: string) => Promise<void>
  closeDefect: (id: string, closedBy: string, closureNotes?: string) => Promise<void>
  reopenDefect: (id: string) => Promise<void>
  getSurveyAttachments: (surveyId?: string) => Promise<SurveyAttachment[]>
  addSurveyAttachment: (attachment: Omit<SurveyAttachment, 'id'>) => Promise<SurveyAttachment>
  deleteSurveyAttachment: (id: string) => Promise<void>
  getOpenDefectsByVessel: () => Promise<any[]>
  getSurveyHistory: (vesselId: string) => Promise<any[]>
  closeSurvey: (surveyId: string, userId: string) => Promise<void>
  updateConditionSurveyEndorsement: (surveyId: string, issued: boolean) => Promise<void>

  // Dashboard
  dashboardGetActivity: () => Promise<{
    recentVessels: Array<{ id: string; name: string; imoNumber: string; fleetName?: string; createdAt: string; isActive: boolean }>
    recentEntities: Array<{ id: string; name: string; type: string; createdAt: string }>
    recentAuditEntries: Array<{ vesselId: string; vesselName: string; fieldName: string; newValue?: string; changedAt: string }>
    weekRenewals: Array<{ vesselName: string; imoNumber: string; policyTypeName: string; policyNumber?: string; endDate: string }>
  }>
  dashboardGetDataQualityAlerts: () => Promise<{
    vesselsNoCustomer: number
    entitiesNoEmail: number
    entitiesNoPhone: number
    policiesNoEndDate: number
  }>

  // Survey Warranties
  surveyWarrantyGetByVessel: (vesselId: string) => Promise<SurveyWarranty[]>
  surveyWarrantyGetAll: () => Promise<SurveyWarranty[]>
  surveyWarrantyGetDueToday: () => Promise<SurveyWarranty[]>
  surveyWarrantyGetEndorsementsDue: () => Promise<any[]>
  surveyWarrantyCreate: (data: Omit<SurveyWarranty, 'id' | 'status' | 'createdAt'>) => Promise<SurveyWarranty>
  surveyWarrantyUpdate: (id: string, data: Partial<SurveyWarranty>) => Promise<void>
  surveyWarrantyDelete: (id: string) => Promise<void>
  surveyWarrantyLogReminder: (data: Omit<SurveyWarrantyReminder, 'id' | 'createdAt'>) => Promise<SurveyWarrantyReminder>
  surveyWarrantyGetReminders: (warrantyId: string) => Promise<SurveyWarrantyReminder[]>
  surveyWarrantyWaive: (id: string, reason: string) => Promise<void>
  surveyWarrantyCompleteWithSurvey: (warrantyId: string, completionNotes: string | null, userId: string) => Promise<void>

  // Reminders
  remindersGetSettings: () => Promise<ReminderSettings>
  remindersSetSettings: (settings: ReminderSettings) => Promise<void>
  remindersGetVesselReminders: () => Promise<VesselReminder[]>
  remindersSnoozeVessel: (vesselId: string, username: string, periodDays: number) => Promise<void>
  remindersUnsnoozeVessel: (vesselId: string) => Promise<void>

  // P&I Settings
  piGetClauses: () => Promise<PIClause[]>
  piAddClause: (clause: Omit<PIClause, 'id'>) => Promise<PIClause>
  piUpdateClause: (id: string, updates: Partial<PIClause>) => Promise<void>
  piDeleteClause: (id: string) => Promise<void>
  piReorderClauses: (orderedIds: string[]) => Promise<void>

  piGetClauseSets: () => Promise<PIClauseSet[]>
  piAddClauseSet: (name: string, clauseIds: string[], descOverrides?: Record<string, string>) => Promise<PIClauseSet>
  piUpdateClauseSet: (id: string, name: string, clauseIds: string[], descOverrides?: Record<string, string>) => Promise<void>
  piDeleteClauseSet: (id: string) => Promise<void>

  // Hull settings
  hullGetAgreedValueTexts: () => Promise<HullAgreedValueText[]>
  hullAddAgreedValueText: (text: string, defaultSelected: boolean, section?: string) => Promise<HullAgreedValueText>
  hullUpdateAgreedValueText: (id: string, updates: Partial<HullAgreedValueText>) => Promise<void>
  hullDeleteAgreedValueText: (id: string) => Promise<void>
  hullReorderAgreedValueTexts: (ids: string[]) => Promise<void>

  hullGetClauses: () => Promise<HullClause[]>
  hullAddClause: (name: string, code: string, description?: string, conditionSection?: string) => Promise<HullClause>
  hullUpdateClause: (id: string, updates: Partial<HullClause>) => Promise<void>
  hullDeleteClause: (id: string) => Promise<void>
  hullReorderClauses: (ids: string[]) => Promise<void>

  hullGetClauseConditions: (hullClauseId?: string) => Promise<HullClauseCondition[]>
  hullAddClauseCondition: (hullClauseId: string, conditionNumber: string, text: string, defaultSelected: boolean, conditionSection?: string, hasAmount?: boolean, amountPlaceholder?: string) => Promise<HullClauseCondition>
  hullUpdateClauseCondition: (id: string, updates: Partial<HullClauseCondition>) => Promise<void>
  hullDeleteClauseCondition: (id: string) => Promise<void>
  hullReorderClauseConditions: (ids: string[]) => Promise<void>

  hullGetAdditionalConditions: () => Promise<HullAdditionalCondition[]>
  hullAddAdditionalCondition: (title: string | null, text: string, defaultSelected: boolean, hullClauseIds?: string[], hasAmount?: boolean, amountPlaceholder?: string) => Promise<HullAdditionalCondition>
  hullUpdateAdditionalCondition: (id: string, updates: { title?: string | null; text?: string; defaultSelected?: boolean; hullClauseIds?: string[]; hasAmount?: boolean; amountPlaceholder?: string }) => Promise<void>
  hullDeleteAdditionalCondition: (id: string) => Promise<void>
  hullReorderAdditionalConditions: (ids: string[]) => Promise<void>

  hullGetQuotationAgreedValueItems: (qId: string) => Promise<QuotationAgreedValueItem[]>
  hullSetQuotationAgreedValueItems: (qId: string, items: { hullTextId?: string; text: string; vesselScope?: string[] | null }[]) => Promise<void>
  // P&I Alternatives
  piGetQuotationAlternatives: (qId: string) => Promise<QuotationPIAlternative[]>
  piAddQuotationAlternative: (qId: string, label?: string) => Promise<QuotationPIAlternative>
  piMigrateSharedToAlternative: (qId: string, altId: string) => Promise<void>
  piUpdateQuotationAlternative: (id: string, updates: { label?: string; premiumAmount?: number | null }) => Promise<void>
  piDeleteQuotationAlternative: (id: string) => Promise<void>
  piReorderQuotationAlternatives: (ids: string[]) => Promise<void>
  updateQuotationItemAlternativeId: (table: string, id: string, alternativeId: string | null) => Promise<void>
  // Hull Alternatives
  hullGetQuotationAlternatives: (qId: string) => Promise<QuotationHullAlternative[]>
  hullAddQuotationAlternative: (qId: string, hullClauseId: string, label?: string) => Promise<QuotationHullAlternative>
  hullUpdateQuotationAlternative: (id: string, updates: { hullClauseId?: string; label?: string; premiumAmount?: number | null }) => Promise<void>
  hullDeleteQuotationAlternative: (id: string) => Promise<void>
  hullReorderQuotationAlternatives: (ids: string[]) => Promise<void>
  hullGetQuotationHullConditions: (qId: string) => Promise<QuotationHullCondition[]>
  hullSetQuotationHullConditions: (qId: string, items: { hullConditionId: string; textOverride?: string; vesselScope?: string[] | null; alternativeId?: string | null }[]) => Promise<void>
  hullGetQuotationHullAdditionalConditions: (qId: string) => Promise<QuotationHullAdditionalCondition[]>
  hullSetQuotationHullAdditionalConditions: (qId: string, items: { hullAdditionalConditionId: string; textOverride?: string; vesselScope?: string[] | null; alternativeId?: string | null; amount?: number | null }[]) => Promise<void>

  warGetConditions: () => Promise<WarCondition[]>
  warAddCondition: (text: string, defaultSelected: boolean) => Promise<WarCondition>
  warUpdateCondition: (id: string, updates: Partial<WarCondition>) => Promise<void>
  warDeleteCondition: (id: string) => Promise<void>
  warReorderConditions: (ids: string[]) => Promise<void>
  warGetQuotationWarConditions: (qId: string) => Promise<QuotationWarCondition[]>
  warSetQuotationWarConditions: (qId: string, items: { warConditionId: string; textOverride?: string; vesselScope?: string[] | null }[]) => Promise<void>
  warGetSettings: () => Promise<WarSettings>
  warSetSettings: (settings: WarSettings) => Promise<void>

  piGetWarrantyTags: () => Promise<PIWarrantyTag[]>
  piAddWarrantyTag: (name: string) => Promise<PIWarrantyTag>
  piUpdateWarrantyTag: (id: string, name: string) => Promise<void>
  piDeleteWarrantyTag: (id: string) => Promise<void>
  piReorderWarrantyTags: (orderedIds: string[]) => Promise<void>

  piGetWarranties: () => Promise<PIWarranty[]>
  piAddWarranty: (warranty: Omit<PIWarranty, 'id'>) => Promise<PIWarranty>
  piUpdateWarranty: (id: string, updates: Partial<PIWarranty>) => Promise<void>
  piDeleteWarranty: (id: string) => Promise<void>
  piReorderWarranties: (orderedIds: string[]) => Promise<void>

  piGetWarrantySets: () => Promise<PIWarrantySet[]>
  piAddWarrantySet: (name: string, warrantyIds: string[], defaultSelected?: boolean) => Promise<PIWarrantySet>
  piUpdateWarrantySet: (id: string, name: string, warrantyIds: string[], defaultSelected?: boolean) => Promise<void>
  piDeleteWarrantySet: (id: string) => Promise<void>

  piGetDeductibles: () => Promise<PIDeductible[]>
  piAddDeductible: (ded: Omit<PIDeductible, 'id'>) => Promise<PIDeductible>
  piUpdateDeductible: (id: string, updates: Partial<PIDeductible>) => Promise<void>
  piDeleteDeductible: (id: string) => Promise<void>
  piReorderDeductibles: (orderedIds: string[]) => Promise<void>

  piGetDeductibleSets: () => Promise<PIDeductibleSet[]>
  piGetDeductibleSetItems: (setId: string) => Promise<PIDeductibleSetItem[]>
  piAddDeductibleSet: (name: string, items: { deductibleId: string; amount: number; currency: string; secondaryAmount?: number }[]) => Promise<PIDeductibleSet>
  piUpdateDeductibleSet: (id: string, name: string, items: { deductibleId: string; amount: number; currency: string; secondaryAmount?: number }[]) => Promise<void>
  piDeleteDeductibleSet: (id: string) => Promise<void>

  piGetTextDeductibles: () => Promise<PITextDeductible[]>
  piAddTextDeductible: (data: { title?: string; text: string; defaultIncluded?: boolean }) => Promise<PITextDeductible>
  piUpdateTextDeductible: (id: string, updates: { title?: string; text?: string; defaultIncluded?: boolean }) => Promise<void>
  piDeleteTextDeductible: (id: string) => Promise<void>
  piReorderTextDeductibles: (orderedIds: string[]) => Promise<void>

  piGetExclusions: () => Promise<PIExclusion[]>
  piAddExclusion: (exclusion: { text: string; isCargoRelated?: boolean; vesselTypeIds?: string[] }) => Promise<PIExclusion>
  piUpdateExclusion: (id: string, updates: { text?: string; isCargoRelated?: boolean; vesselTypeIds?: string[] }) => Promise<void>
  piDeleteExclusion: (id: string) => Promise<void>
  piReorderExclusions: (orderedIds: string[]) => Promise<void>

  piGetSubLimitTemplates: () => Promise<PISubLimitTemplate[]>
  piAddSubLimitTemplate: (tmpl: Omit<PISubLimitTemplate, 'id'>) => Promise<PISubLimitTemplate>
  piUpdateSubLimitTemplate: (id: string, updates: Partial<PISubLimitTemplate>) => Promise<void>
  piDeleteSubLimitTemplate: (id: string) => Promise<void>
  piReorderSubLimitTemplates: (orderedIds: string[]) => Promise<void>

  piGetAdditionalClauses: () => Promise<PIAdditionalClause[]>
  piAddAdditionalClause: (title: string | null, code: string | null, text: string) => Promise<PIAdditionalClause>
  piUpdateAdditionalClause: (id: string, title: string | null, code: string | null, text: string) => Promise<void>
  piDeleteAdditionalClause: (id: string) => Promise<void>
  piReorderAdditionalClauses: (orderedIds: string[]) => Promise<void>
  piToggleAdditionalClauseDefault: (id: string, defaultSelected: boolean) => Promise<void>
  piGetAdditionalClauseSets: () => Promise<PIAdditionalClauseSet[]>
  piAddAdditionalClauseSet: (name: string, clauseIds: string[], defaultSelected?: boolean) => Promise<PIAdditionalClauseSet>
  piUpdateAdditionalClauseSet: (id: string, name: string, clauseIds: string[], defaultSelected?: boolean) => Promise<void>
  piDeleteAdditionalClauseSet: (id: string) => Promise<void>

  piGetTradingExcludedCountries: () => Promise<TradingExcludedCountry[]>
  piAddTradingExcludedCountry: (country: Omit<TradingExcludedCountry, 'id'>) => Promise<TradingExcludedCountry>
  piUpdateTradingExcludedCountry: (id: string, updates: Partial<TradingExcludedCountry>) => Promise<void>
  piDeleteTradingExcludedCountry: (id: string) => Promise<void>

  // Trading Warranty Templates
  piGetTradingWarrantyTemplates: () => Promise<TradingWarrantyTemplate[]>
  piAddTradingWarrantyTemplate: (name: string, text: string) => Promise<TradingWarrantyTemplate>
  piUpdateTradingWarrantyTemplate: (id: string, updates: Partial<{ name: string; text: string }>) => Promise<void>
  piDeleteTradingWarrantyTemplate: (id: string) => Promise<void>
  piReorderTradingWarrantyTemplates: (ids: string[]) => Promise<void>

  // Trading Custom Texts
  piGetTradingCustomTexts: () => Promise<TradingCustomText[]>
  piAddTradingCustomText: (name: string, text: string) => Promise<TradingCustomText>
  piUpdateTradingCustomText: (id: string, updates: Partial<{ name: string; text: string }>) => Promise<void>
  piDeleteTradingCustomText: (id: string) => Promise<void>
  piReorderTradingCustomTexts: (ids: string[]) => Promise<void>

  // Premium Text Templates (NCB / UPCC)
  premiumGetTextTemplates: (type?: string) => Promise<PremiumTextTemplate[]>
  premiumAddTextTemplate: (data: { name: string; text: string; type: string }) => Promise<PremiumTextTemplate>
  premiumUpdateTextTemplate: (id: string, updates: Partial<{ name: string; text: string }>) => Promise<void>
  premiumDeleteTextTemplate: (id: string) => Promise<void>
  premiumReorderTextTemplates: (ids: string[]) => Promise<void>

  // P&I Section Texts
  piGetSectionTexts: () => Promise<PISectionTexts>
  piSetSectionTexts: (texts: PISectionTexts) => Promise<void>

  // Instalment Defaults & Logo
  piGetInstalmentDefaults: () => Promise<InstalmentDefaults>
  piSetInstalmentDefaults: (defaults: InstalmentDefaults) => Promise<void>
  piGetQuotationLogoPath: () => Promise<string | null>
  piSetQuotationLogoPath: (path: string) => Promise<void>

  // P&I Sanctions Versions
  piGetSanctionsVersions: () => Promise<PISanctionsVersion[]>
  piAddSanctionsVersion: (data: { name: string; key: string; text: string }) => Promise<PISanctionsVersion>
  piUpdateSanctionsVersion: (id: string, updates: { name?: string; key?: string; text?: string }) => Promise<void>
  piDeleteSanctionsVersion: (id: string) => Promise<void>
  piReorderSanctionsVersions: (orderedIds: string[]) => Promise<void>

  // Vessel Insurance Policies (imported)
  getVesselInsurancePolicies: (vesselId: string) => Promise<VesselInsurancePolicy[]>
  importInsurancePoliciesFromExcel: (filePath: string) => Promise<{ imported: number; skippedCancelled: number; totalRows: number; unmatched: { ship: string; imo: string; broker: string; fleet: string }[] }>

  // Classification Societies
  getClassificationSocieties: () => Promise<ClassificationSociety[]>
  addClassificationSociety: (cs: Omit<ClassificationSociety, 'id'>) => Promise<ClassificationSociety>
  updateClassificationSociety: (id: string, updates: Partial<ClassificationSociety>) => Promise<void>
  deleteClassificationSociety: (id: string) => Promise<void>
  reorderClassificationSocieties: (ids: string[]) => Promise<void>
  getVesselClassifications: (vesselId: string) => Promise<VesselClassification[]>
  setVesselClassifications: (vesselId: string, csIds: string[]) => Promise<void>

  // Vessel Types
  getVesselTypes: () => Promise<VesselType[]>
  addVesselType: (vt: Omit<VesselType, 'id'>) => Promise<VesselType>
  updateVesselType: (id: string, updates: Partial<VesselType>) => Promise<void>
  deleteVesselType: (id: string) => Promise<void>
  reorderVesselTypes: (ids: string[]) => Promise<void>

  // Re-import vessel details
  reimportVesselDetails: (filePath: string) => Promise<{ updated: number; totalRows: number; createdFlags: number; createdClasses: number; createdTypes: number }>

  // Vessel Audit Log
  getVesselAuditLog: (vesselId: string) => Promise<VesselAuditEntry[]>

  // Policy Type Characteristics
  getPolicyTypeCharacteristics: (policyTypeId?: string) => Promise<PolicyTypeCharacteristic[]>
  addPolicyTypeCharacteristic: (c: Omit<PolicyTypeCharacteristic, 'id'>) => Promise<PolicyTypeCharacteristic>
  updatePolicyTypeCharacteristic: (id: string, updates: Partial<PolicyTypeCharacteristic>) => Promise<void>
  deletePolicyTypeCharacteristic: (id: string) => Promise<void>
  reorderPolicyTypeCharacteristics: (ids: string[]) => Promise<void>

  // Policy Type Conditions
  getPolicyTypeConditions: (policyTypeId?: string) => Promise<PolicyTypeCondition[]>
  addPolicyTypeCondition: (c: Omit<PolicyTypeCondition, 'id'>) => Promise<PolicyTypeCondition>
  updatePolicyTypeCondition: (id: string, updates: Partial<PolicyTypeCondition>) => Promise<void>
  deletePolicyTypeCondition: (id: string) => Promise<void>

  // Vessel Dynamic Policies
  getVesselDynamicPolicies: (vesselId: string) => Promise<VesselDynamicPolicy[]>
  getAllVesselDynamicPolicies: () => Promise<VesselDynamicPolicy[]>
  addVesselDynamicPolicy: (policy: Omit<VesselDynamicPolicy, 'id' | 'createdAt' | 'updatedAt' | 'policyTypeName' | 'conditionName' | 'brokerName' | 'values'>) => Promise<string>
  updateVesselDynamicPolicy: (id: string, updates: Partial<VesselDynamicPolicy>) => Promise<void>
  deleteVesselDynamicPolicy: (id: string) => Promise<void>
  setVesselDynamicPolicyValues: (policyId: string, values: Omit<VesselPolicyValue, 'id' | 'policyId' | 'characteristicName' | 'fieldType'>[]) => Promise<void>

  // Policy List
  getPoliciesList: () => Promise<any[]>

  // Policy Expiry Alerts
  getExpiredActivePolicies: () => Promise<any[]>
  getPolicyRenewalsByMonth: (year: number, month: number) => Promise<any[]>
  setQuotationSentDate: (policyId: string, date: string | null) => Promise<void>
  getRenewalPipeline: (dateFrom: string, dateTo: string) => Promise<any[]>

  // Renewal Status Types
  getRenewalStatusTypes: () => Promise<any[]>
  addRenewalStatusType: (name: string, color: string) => Promise<any>
  updateRenewalStatusType: (id: string, name: string, color: string) => Promise<void>
  deleteRenewalStatusType: (id: string) => Promise<void>
  setRenewalStatusForPolicy: (policyId: string, statusId: string | null) => Promise<void>

  // Policy Renewal Notes
  getPolicyRenewalNotes: (policyId: string, policyNumber: string) => Promise<any[]>
  addPolicyRenewalNote: (policyId: string, policyNumber: string, note: string) => Promise<any>
  deletePolicyRenewalNote: (noteId: string) => Promise<void>

  // Vessel Notes
  getVesselNotes: (vesselId: string) => Promise<any[]>
  addVesselNote: (vesselId: string, note: string) => Promise<any>
  deleteVesselNote: (noteId: string) => Promise<void>

  // Quotation Types
  getQuotationTypes: () => Promise<QuotationType[]>
  addQuotationType: (data: { name: string; code: string }) => Promise<QuotationType>
  updateQuotationType: (id: string, updates: { name?: string; code?: string }) => Promise<void>
  deleteQuotationType: (id: string) => Promise<void>
  reorderQuotationTypes: (ids: string[]) => Promise<void>

  // Quotations
  getQuotations: () => Promise<Quotation[]>
  getQuotation: (id: string) => Promise<Quotation | null>
  addQuotation: (q: Partial<Quotation>) => Promise<Quotation>
  updateQuotation: (id: string, updates: Partial<Quotation>) => Promise<void>
  deleteQuotation: (id: string) => Promise<void>
  createQuotationRevision: (sourceId: string) => Promise<Quotation>
  duplicateQuotation: (sourceId: string) => Promise<Quotation>
  getQuotationRevisions: (revisionGroupId: string) => Promise<Quotation[]>
  saveExportSnapshot: (quotationId: string, snapshot: string) => Promise<void>
  clearExportSnapshot: (quotationId: string) => Promise<void>

  // Quotation Sub-Tables
  getQuotationAssureds: (qId: string) => Promise<QuotationAssured[]>
  addQuotationAssured: (data: { quotationId: string; entityId?: string; name: string; role?: string; vesselLabel?: string; order?: number }) => Promise<QuotationAssured>
  updateQuotationAssured: (id: string, updates: { name?: string; role?: string; vesselLabel?: string; order?: number }) => Promise<void>
  deleteQuotationAssured: (id: string) => Promise<void>
  reorderQuotationAssureds: (ids: string[]) => Promise<void>

  getQuotationVessels: (qId: string) => Promise<QuotationVessel[]>
  addQuotationVessel: (data: { quotationId: string; vesselId?: string; vesselLabel: string; order: number; name?: string; imoNumber?: string; builtYear?: number; grossTonnage?: number; flag?: string; vesselType?: string; classification?: string; callSign?: string }) => Promise<QuotationVessel>
  updateQuotationVessel: (id: string, data: Partial<QuotationVessel>) => Promise<void>
  deleteQuotationVessel: (id: string) => Promise<void>
  reorderQuotationVessels: (ids: string[]) => Promise<void>

  getQuotationNewVessel: (qId: string) => Promise<QuotationNewVessel | null>
  upsertQuotationNewVessel: (qId: string, data: Partial<QuotationNewVessel>) => Promise<QuotationNewVessel>
  deleteQuotationNewVessel: (qId: string) => Promise<void>

  getQuotationSubLimits: (qId: string) => Promise<QuotationSubLimit[]>
  addQuotationSubLimit: (data: { quotationId: string; text: string; amount: number; currency: string }) => Promise<QuotationSubLimit>
  updateQuotationSubLimit: (id: string, updates: { text?: string; amount?: number; currency?: string }) => Promise<void>
  deleteQuotationSubLimit: (id: string) => Promise<void>

  getQuotationClauses: (qId: string) => Promise<{ id: string; piClauseId: string; vesselScope?: string[] | null; alternativeId?: string | null }[]>
  setQuotationClauses: (qId: string, ids: string[], overrides?: Record<string, string>) => Promise<void>
  addQuotationClause: (qId: string, piClauseId: string, alternativeId?: string | null) => Promise<any>
  deleteQuotationClause: (qId: string, piClauseId: string, alternativeId?: string | null) => Promise<void>
  getQuotationClauseOverrides: (qId: string) => Promise<Record<string, string>>
  updateQuotationClauseOverride: (qId: string, clauseId: string, override: string | null, alternativeId?: string | null) => Promise<void>

  getQuotationAdditionalClauses: (qId: string) => Promise<{ id: string; quotationId: string; piAdditionalClauseId?: string; customText?: string; order: number; vesselScope?: string[] | null }[]>
  addQuotationAdditionalClause: (data: { quotationId: string; piAdditionalClauseId?: string; customText?: string; order?: number; vesselScope?: string[] }) => Promise<any>
  deleteQuotationAdditionalClause: (id: string) => Promise<void>

  getQuotationWarranties: (qId: string) => Promise<{ id: string; piWarrantyId: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]>
  setQuotationWarranties: (qId: string, ids: string[]) => Promise<void>
  updateQuotationWarrantyVesselScope: (qId: string, piWarrantyId: string, vesselScope: string[] | null) => Promise<void>
  updateQuotationClauseVesselScope: (qId: string, piClauseId: string, vesselScope: string[] | null) => Promise<void>
  getQuotationCustomWarranties: (qId: string) => Promise<QuotationCustomWarranty[]>
  addQuotationCustomWarranty: (data: { quotationId: string; text: string; order?: number; vesselScope?: string[] }) => Promise<QuotationCustomWarranty>
  updateQuotationCustomWarranty: (id: string, updates: { text?: string; vesselScope?: string[] | null }) => Promise<void>
  deleteQuotationCustomWarranty: (id: string) => Promise<void>
  reorderQuotationCustomWarranties: (ids: string[]) => Promise<void>

  getQuotationDeductibles: (qId: string) => Promise<QuotationDeductible[]>
  addQuotationDeductible: (data: { quotationId: string; piDeductibleId?: string; title?: string; description: string; amount: number; currency: string; secondaryAmount?: number; secondaryDescription?: string; order?: number; vesselScope?: string[] }) => Promise<QuotationDeductible>
  updateQuotationDeductible: (id: string, updates: { title?: string; description?: string; amount?: number; currency?: string; secondaryAmount?: number; secondaryDescription?: string; vesselScope?: string[] | null }) => Promise<void>
  deleteQuotationDeductible: (id: string) => Promise<void>
  reorderQuotationDeductibles: (orderedIds: string[]) => Promise<void>

  getQuotationTextDeductibles: (qId: string) => Promise<QuotationTextDeductible[]>
  addQuotationTextDeductible: (data: { quotationId: string; piTextDeductibleId?: string; title?: string; text: string; order?: number; vesselScope?: string[] }) => Promise<QuotationTextDeductible>
  updateQuotationTextDeductible: (id: string, updates: { title?: string; text?: string; vesselScope?: string[] | null }) => Promise<void>
  deleteQuotationTextDeductible: (id: string) => Promise<void>
  reorderQuotationTextDeductibles: (orderedIds: string[]) => Promise<void>

  getQuotationExclusions: (qId: string) => Promise<{ id: string; quotationId: string; piExclusionId?: string; customText?: string; vesselScope?: string[] | null }[]>
  setQuotationExclusions: (qId: string, items: { piExclusionId?: string; customText?: string }[]) => Promise<void>
  addQuotationExclusion: (qId: string, piExclusionId: string, altId?: string | null) => Promise<any>
  deleteQuotationExclusion: (id: string) => Promise<void>
  getQuotationCustomExclusions: (qId: string) => Promise<QuotationCustomExclusion[]>
  addQuotationCustomExclusion: (data: { quotationId: string; text: string; order?: number }) => Promise<QuotationCustomExclusion>
  updateQuotationCustomExclusion: (id: string, updates: { text?: string }) => Promise<void>
  deleteQuotationCustomExclusion: (id: string) => Promise<void>
  reorderQuotationCustomExclusions: (ids: string[]) => Promise<void>

  updateQuotationItemVesselScope: (table: string, id: string, vesselScope: string[] | null) => Promise<void>

  getQuotationCustomSections: (qId: string) => Promise<QuotationCustomSection[]>
  addQuotationCustomSection: (data: { quotationId: string; title: string; text?: string; order?: number }) => Promise<QuotationCustomSection>
  updateQuotationCustomSection: (id: string, updates: { title?: string; text?: string }) => Promise<void>
  deleteQuotationCustomSection: (id: string) => Promise<void>
  reorderQuotationCustomSections: (ids: string[]) => Promise<void>
  piGetSectionOrderDefaults: () => Promise<string[]>
  piSetSectionOrderDefaults: (order: string[]) => Promise<void>
  piGetSectionOrderDefaultsByType: (typeCode: string) => Promise<string[]>
  piSetSectionOrderDefaultsByType: (typeCode: string, order: string[]) => Promise<void>

  getQuotationExcludedCountries: (qId: string) => Promise<QuotationExcludedCountry[]>
  setQuotationExcludedCountries: (qId: string, countries: { name: string; listType: string }[]) => Promise<void>

  getPISubjectivities: () => Promise<PISubjectivity[]>
  addPISubjectivity: (data: { text: string; docTypeIds?: string[]; typeScope?: string; order?: number }) => Promise<PISubjectivity>
  updatePISubjectivity: (id: string, data: { text: string; docTypeIds?: string[]; typeScope?: string }) => Promise<void>
  deletePISubjectivity: (id: string) => Promise<void>
  reorderPISubjectivities: (ids: string[]) => Promise<void>

  getQuotationSubjectivities: (qId: string) => Promise<QuotationSubjectivity[]>
  addQuotationSubjectivity: (data: { quotationId: string; piSubjectivityId?: string; text: string; isCustom?: boolean; isAutoPopulated?: boolean; order?: number; vesselScope?: string[] }) => Promise<any>
  updateQuotationSubjectivity: (id: string, data: { text?: string; order?: number; vesselScope?: string[] | null }) => Promise<void>
  deleteQuotationSubjectivity: (id: string) => Promise<void>

  getQuotationInstalments: (qId: string) => Promise<QuotationInstalment[]>
  setQuotationInstalments: (qId: string, instalments: { instalmentNumber: number; daysFromInception: number }[]) => Promise<void>

  getQuotationInformation: (qId: string) => Promise<{ id: string; quotationId: string; text: string; order: number }[]>
  addQuotationInformation: (data: { quotationId: string; text: string; order?: number }) => Promise<any>
  deleteQuotationInformation: (id: string) => Promise<void>

  getQuotationNotes: (qId: string) => Promise<QuotationNote[]>
  addQuotationNote: (data: { quotationId: string; title: string; content?: string; order?: number }) => Promise<QuotationNote>
  updateQuotationNote: (id: string, updates: { title?: string; content?: string }) => Promise<void>
  deleteQuotationNote: (id: string) => Promise<void>

  // Report Settings
  reportSettingsGet: () => Promise<ReportSettings>
  reportSettingsSet: (settings: ReportSettings) => Promise<void>

  getUserSectionAccess: () => Promise<string[]>
  setUserSectionAccess: (sectionIds: string[]) => Promise<void>

  // Survey Warranty Templates (Quotation Settings)
  surveyWarrantyTemplateGetAll: () => Promise<SurveyWarrantyTemplate[]>
  surveyWarrantyTemplateAdd: (text: string) => Promise<SurveyWarrantyTemplate>
  surveyWarrantyTemplateUpdate: (id: string, text: string) => Promise<void>
  surveyWarrantyTemplateDelete: (id: string) => Promise<void>
  surveyWarrantyTemplateReorder: (ids: string[]) => Promise<void>

  surveyWarrantyTemplateSetGetAll: () => Promise<SurveyWarrantyTemplateSet[]>
  surveyWarrantyTemplateSetAdd: (name: string, templateIds: string[]) => Promise<SurveyWarrantyTemplateSet>
  surveyWarrantyTemplateSetUpdate: (id: string, name: string, templateIds: string[]) => Promise<void>
  surveyWarrantyTemplateSetDelete: (id: string) => Promise<void>

  quotationSurveyWarrantyGetAll: (quotationId: string) => Promise<QuotationSurveyWarranty[]>
  quotationSurveyWarrantySet: (quotationId: string, items: QuotationSurveyWarranty[]) => Promise<void>
  quotationSurveyWarrantyAdd: (data: Partial<QuotationSurveyWarranty>) => Promise<QuotationSurveyWarranty>
  quotationSurveyWarrantyUpdate: (id: string, data: Partial<QuotationSurveyWarranty>) => Promise<void>
  quotationSurveyWarrantyDelete: (id: string) => Promise<void>

  // Database Backup & Restore
  dbBackup: () => Promise<{ success: boolean; filePath?: string; message?: string; error?: boolean }>
  dbRestore: () => Promise<{ success: boolean; message?: string; error?: boolean }>
  dbGetLastBackupDate: () => Promise<string | null>

  // Auto-Update
  updateCheckForUpdates: () => Promise<void>
  updateQuitAndInstall: () => Promise<void>
  updateGetCurrentVersion: () => Promise<string>
  updateGetChangelogs: () => Promise<any>

  vesselGetFilePaths: (vesselId: string) => Promise<{ id: string; source: string; filePath: string; label: string }[]>
  vesselRemapFilePaths: (remaps: { source: string; id: string; newPath: string }[]) => Promise<void>
  dialogOpenFolder: () => Promise<string | null>
  dialogLocateFile: () => Promise<string | null>
  shellShowItemInFolder: (filePath: string) => Promise<void>
  warBreachSave: (record: any) => Promise<{ id: string }>
  warBreachGetAll: () => Promise<any[]>
  warBreachDelete: (id: string) => Promise<void>
  analyticsGetPresets: () => Promise<import('../shared/types').AnalyticsPreset[]>
  analyticsAddPreset: (name: string, filters: any) => Promise<import('../shared/types').AnalyticsPreset>
  analyticsUpdatePreset: (id: string, name: string, filters: any) => Promise<void>
  analyticsDeletePreset: (id: string) => Promise<void>
  analyticsGetData: (filters: any) => Promise<{ vessels: any[]; policyCoverage: any[] }>
  activityGetLog: (filters: import('../shared/types').ActivityLogFilters) => Promise<import('../shared/types').PaginatedResult<import('../shared/types').ActivityLogEntry>>
  activityLog: (entry: { action: string; module: string; entityType?: string; entityId?: string; entityName?: string; details?: string }) => Promise<void>
  activityGetDistinctModules: () => Promise<string[]>
  activityGetDistinctActions: () => Promise<string[]>
  activityGetDistinctUsers: () => Promise<{ id: string; username: string }[]>
  activityGetRetention: () => Promise<number>
  activitySetRetention: (days: number) => Promise<{ deleted: number }>
  activityCleanup: () => Promise<{ deleted: number }>
  activityGetCount: () => Promise<number>
  updateUserAppVersion: (version: string) => Promise<void>
  updateUserSidebarState: (sidebarCollapsed: boolean, collapsedGroups: string) => Promise<void>
  onUpdateChecking: (callback: () => void) => void
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseName?: string; releaseNotes?: string }) => void) => void
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => void
  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void
  onUpdateDownloaded: (callback: (info: { version: string; releaseDate?: string }) => void) => void
  onUpdateError: (callback: (error: { message: string }) => void) => void

  // Email Templates
  emailGetTemplates: (category?: string) => Promise<import('../shared/types').EmailTemplate[]>
  emailAddTemplate: (template: Omit<import('../shared/types').EmailTemplate, 'id' | 'order' | 'isSystem' | 'createdBy'>) => Promise<import('../shared/types').EmailTemplate>
  emailUpdateTemplate: (id: string, updates: Partial<{ name: string; subject: string | null; body: string; category: string }>) => Promise<void>
  emailDeleteTemplate: (id: string) => Promise<void>
  emailReorderTemplates: (orderedIds: string[]) => Promise<void>

  // Workflow
  workflowGetSteps: () => Promise<WorkflowStep[]>
  workflowAddStep: (step: { name: string; color: string; canEdit: boolean; canExport: boolean; isLockPoint: boolean; isInitial: boolean }) => Promise<WorkflowStep>
  workflowUpdateStep: (id: string, updates: Partial<{ name: string; color: string; canEdit: boolean; canExport: boolean; isLockPoint: boolean; isInitial: boolean }>) => Promise<void>
  workflowDeleteStep: (id: string) => Promise<void>
  workflowReorderSteps: (orderedIds: string[]) => Promise<void>
  workflowGetTransitions: () => Promise<WorkflowTransition[]>
  workflowAddTransition: (t: { fromStepId: string; toStepId: string; permissionKey: string | null; autoCreateRevision: boolean }) => Promise<WorkflowTransition>
  workflowUpdateTransition: (id: string, updates: Partial<{ permissionKey: string | null; autoCreateRevision: boolean }>) => Promise<void>
  workflowDeleteTransition: (id: string) => Promise<void>
  workflowMoveQuotation: (quotationId: string, toStepId: string, comment?: string) => Promise<{ success: boolean }>
  workflowGetQuotationLog: (quotationId: string) => Promise<QuotationWorkflowLog[]>
  workflowGetReachableSteps: (quotationId: string) => Promise<WorkflowStep[]>

  // Banks
  bankGetAll: () => Promise<{ id: string; name: string; details: string; order: number }[]>
  bankAdd: (name: string, details: string) => Promise<{ id: string; name: string; details: string; order: number }>
  bankUpdate: (id: string, data: { name: string; details: string }) => Promise<void>
  bankDelete: (id: string) => Promise<void>
  bankReorder: (ids: string[]) => Promise<void>

  // Policy document methods
  policyGetById: (id: string) => Promise<any>
  policyGetInstalments: (policyId: string) => Promise<any[]>
  policyGetAddresses: (policyId: string) => Promise<any[]>
  policyGetBlueCards: (policyId: string) => Promise<any[]>
  policyConvertFromQuotation: (quotationId: string, options: {
    vesselIds: string[]
    inceptionDate: string
    inceptionTime: string
    expiryDate: string
    expiryTime: string
    timezone: string
    instalments: { dueDate: string; premiumAmount: number; commissionAmount: number; isNonRefundable: boolean }[]
    commissionPercent: number | null
    bankId: string | null
    showAddresses: boolean
    blueCards: string[]
  }) => Promise<any[]>
}

declare global {
  interface Window {
    api: Api
  }
}
