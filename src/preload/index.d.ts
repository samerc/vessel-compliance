import { DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO, User, SanctionsMatch, FileTypeSettings, ConditionSurvey, SurveyDefect, SurveyAttachment, Surveyor, ComplianceScheduleSettings, ComplianceCheckLog, ComplianceCheckResult, PaginatedResult, EntityQueryParams, SurveyorQueryParams, ComplianceResultQueryParams, ReminderSettings, VesselReminder, VesselNameHistory, FlagState, VesselCustomDocType, PolicyType, VesselPolicy, DABQueryCriteria, PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIDeductible, PIDeductibleSet, PIDeductibleSetItem, PIExclusion, PISubLimitTemplate, PIAdditionalClause, TradingExcludedCountry, Quotation, QuotationNewVessel, QuotationAssured, QuotationSubLimit, QuotationDeductible, QuotationTextDeductible, QuotationExcludedCountry, QuotationInstalment, QuotationNote, PISectionTexts, PISanctionsVersion, InstalmentDefaults, VesselInsurancePolicy, ClassificationSociety, VesselClassification, VesselType, VesselAuditEntry, PolicyTypeCharacteristic, PolicyTypeCondition, VesselDynamicPolicy, VesselPolicyValue, ReportSettings, SurveyWarranty, SurveyWarrantyReminder } from '../shared/types'

export interface Api {
  login: (username: string, password: string) => Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; message?: string }>
  getSession: () => Promise<Omit<User, 'passwordHash'> | null>
  logout: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>
  authLogin: (credentials: { username: string; password: string }) => Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; message?: string }>
  authGetSession: () => Promise<Omit<User, 'passwordHash'> | null>
  authResetPassword: (username: string) => Promise<{ success: boolean; message?: string; newPassword?: string }>
  authLogout: () => Promise<void>
  authCreateUser: (userData: { username: string; password: string; role: 'admin' | 'user' }) => Promise<{ success: boolean; message?: string }>
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
  purgeAllVesselsAndEntities: () => Promise<{ vesselsDeleted: number; entitiesDeleted: number }>

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
  maintenanceSyncSettings: () => Promise<{ added: number }>
  maintenanceAddOneDayToAllPolicies: () => Promise<{ updatedValues: number; updatedVessels: number }>

  fsExists: (filePath: string) => Promise<boolean>
  fsOpen: (filePath: string) => Promise<void>
  getFilePath: (file: File) => string

  dialogOpenFile: () => Promise<string | null>
  dialogOpenFileAny: () => Promise<string | null>
  excelImport: (filePath: string) => Promise<{ success: boolean; message: string; stats?: any }>
  dialogOpenFileWord: () => Promise<string | null>
  importDefectsFromWord: (surveyId: string, filePath: string) => Promise<{ success: boolean; message?: string; count: number }>

  themeGet: () => Promise<'light' | 'dark'>
  themeSet: (theme: 'light' | 'dark') => Promise<void>

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
  piAddClauseSet: (name: string, clauseIds: string[]) => Promise<PIClauseSet>
  piUpdateClauseSet: (id: string, name: string, clauseIds: string[]) => Promise<void>
  piDeleteClauseSet: (id: string) => Promise<void>

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

  piGetExclusions: () => Promise<PIExclusion[]>
  piAddExclusion: (text: string) => Promise<PIExclusion>
  piUpdateExclusion: (id: string, text: string) => Promise<void>
  piDeleteExclusion: (id: string) => Promise<void>
  piReorderExclusions: (orderedIds: string[]) => Promise<void>

  piGetSubLimitTemplates: () => Promise<PISubLimitTemplate[]>
  piAddSubLimitTemplate: (tmpl: Omit<PISubLimitTemplate, 'id'>) => Promise<PISubLimitTemplate>
  piUpdateSubLimitTemplate: (id: string, updates: Partial<PISubLimitTemplate>) => Promise<void>
  piDeleteSubLimitTemplate: (id: string) => Promise<void>
  piReorderSubLimitTemplates: (orderedIds: string[]) => Promise<void>

  piGetAdditionalClauses: () => Promise<PIAdditionalClause[]>
  piAddAdditionalClause: (text: string) => Promise<PIAdditionalClause>
  piUpdateAdditionalClause: (id: string, text: string) => Promise<void>
  piDeleteAdditionalClause: (id: string) => Promise<void>
  piReorderAdditionalClauses: (orderedIds: string[]) => Promise<void>

  piGetTradingExcludedCountries: () => Promise<TradingExcludedCountry[]>
  piAddTradingExcludedCountry: (country: Omit<TradingExcludedCountry, 'id'>) => Promise<TradingExcludedCountry>
  piUpdateTradingExcludedCountry: (id: string, updates: Partial<TradingExcludedCountry>) => Promise<void>
  piDeleteTradingExcludedCountry: (id: string) => Promise<void>

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

  // Policy Expiry Alerts
  getExpiredActivePolicies: () => Promise<any[]>
  getPolicyRenewalsByMonth: (year: number, month: number) => Promise<any[]>
  setQuotationSentDate: (policyId: string, date: string | null) => Promise<void>

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

  // Quotations
  getQuotations: () => Promise<Quotation[]>
  addQuotation: (q: Partial<Quotation>) => Promise<Quotation>
  updateQuotation: (id: string, updates: Partial<Quotation>) => Promise<void>
  deleteQuotation: (id: string) => Promise<void>

  // Quotation Sub-Tables
  getQuotationAssureds: (qId: string) => Promise<QuotationAssured[]>
  addQuotationAssured: (data: { quotationId: string; entityId?: string; name: string; role?: string; order?: number }) => Promise<QuotationAssured>
  updateQuotationAssured: (id: string, updates: { name?: string; role?: string; order?: number }) => Promise<void>
  deleteQuotationAssured: (id: string) => Promise<void>
  reorderQuotationAssureds: (ids: string[]) => Promise<void>

  getQuotationNewVessel: (qId: string) => Promise<QuotationNewVessel | null>
  upsertQuotationNewVessel: (qId: string, data: Partial<QuotationNewVessel>) => Promise<QuotationNewVessel>
  deleteQuotationNewVessel: (qId: string) => Promise<void>

  getQuotationSubLimits: (qId: string) => Promise<QuotationSubLimit[]>
  addQuotationSubLimit: (data: { quotationId: string; text: string; amount: number; currency: string }) => Promise<QuotationSubLimit>
  updateQuotationSubLimit: (id: string, updates: { text?: string; amount?: number; currency?: string }) => Promise<void>
  deleteQuotationSubLimit: (id: string) => Promise<void>

  getQuotationClauses: (qId: string) => Promise<string[]>
  setQuotationClauses: (qId: string, ids: string[], overrides?: Record<string, string>) => Promise<void>
  getQuotationClauseOverrides: (qId: string) => Promise<Record<string, string>>
  updateQuotationClauseOverride: (qId: string, clauseId: string, override: string | null) => Promise<void>

  getQuotationAdditionalClauses: (qId: string) => Promise<{ id: string; quotationId: string; piAdditionalClauseId?: string; customText?: string; order: number }[]>
  addQuotationAdditionalClause: (data: { quotationId: string; piAdditionalClauseId?: string; customText?: string; order?: number }) => Promise<any>
  deleteQuotationAdditionalClause: (id: string) => Promise<void>

  getQuotationWarranties: (qId: string) => Promise<string[]>
  setQuotationWarranties: (qId: string, ids: string[]) => Promise<void>

  getQuotationDeductibles: (qId: string) => Promise<QuotationDeductible[]>
  addQuotationDeductible: (data: { quotationId: string; piDeductibleId?: string; description: string; amount: number; currency: string; secondaryAmount?: number; secondaryDescription?: string; order?: number }) => Promise<QuotationDeductible>
  updateQuotationDeductible: (id: string, updates: { description?: string; amount?: number; currency?: string; secondaryAmount?: number; secondaryDescription?: string }) => Promise<void>
  deleteQuotationDeductible: (id: string) => Promise<void>

  getQuotationTextDeductibles: (qId: string) => Promise<QuotationTextDeductible[]>
  addQuotationTextDeductible: (data: { quotationId: string; text: string; order?: number }) => Promise<QuotationTextDeductible>
  deleteQuotationTextDeductible: (id: string) => Promise<void>

  getQuotationExclusions: (qId: string) => Promise<{ id: string; quotationId: string; piExclusionId?: string; customText?: string }[]>
  setQuotationExclusions: (qId: string, items: { piExclusionId?: string; customText?: string }[]) => Promise<void>

  getQuotationExcludedCountries: (qId: string) => Promise<QuotationExcludedCountry[]>
  setQuotationExcludedCountries: (qId: string, countries: { name: string; listType: string }[]) => Promise<void>

  getQuotationSubjectivities: (qId: string) => Promise<{ id: string; quotationId: string; text: string; order: number }[]>
  addQuotationSubjectivity: (data: { quotationId: string; text: string; order?: number }) => Promise<any>
  updateQuotationSubjectivity: (id: string, text: string) => Promise<void>
  deleteQuotationSubjectivity: (id: string) => Promise<void>

  getQuotationInstalments: (qId: string) => Promise<QuotationInstalment[]>
  setQuotationInstalments: (qId: string, instalments: { instalmentNumber: number; daysFromInception: number; description?: string; nonRefundable?: boolean; nonRefundablePercent?: number }[]) => Promise<void>

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

  // Auto-Update
  updateCheckForUpdates: () => Promise<void>
  updateQuitAndInstall: () => Promise<void>
  updateGetCurrentVersion: () => Promise<string>
  updateGetChangelogs: () => Promise<any>
  updateUserAppVersion: (version: string) => Promise<void>
  updateUserSidebarState: (sidebarCollapsed: boolean, collapsedGroups: string) => Promise<void>
  onUpdateChecking: (callback: () => void) => void
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseName?: string; releaseNotes?: string }) => void) => void
  onUpdateNotAvailable: (callback: (info: { version: string }) => void) => void
  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => void
  onUpdateDownloaded: (callback: (info: { version: string; releaseDate?: string }) => void) => void
  onUpdateError: (callback: (error: { message: string }) => void) => void
}

declare global {
  interface Window {
    api: Api
  }
}
