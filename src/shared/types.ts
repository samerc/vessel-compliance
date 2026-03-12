export interface DocumentType {
  id: string
  name: string
  required: boolean
  annualRenewal?: boolean
  order: number
  description?: string
}

export interface VesselCustomDocType {
  id: string
  vesselId: string
  name: string
  description?: string
  order: number
}

export interface Fleet {
  id: string
  name: string
}

export interface Vessel {
  id: string
  name: string
  imoNumber: string
  fleetId?: string
  ofacCheckedAt?: string
  ofacMatchFound?: boolean
  ofacStatus?: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH' | 'SANCTIONED'
  isActive: boolean
  policyExpiryDate?: string
  customerId?: string
  customerType?: 'broker' | 'direct'
  notes?: string
  flagStateId?: string
  builtYear?: number
  grossTonnage?: number
  vesselType?: string
  classificationSociety?: string
  callSign?: string
}

export interface VesselDocument {
  id?: string
  vesselId: string
  documentTypeId: string
  filePath: string
  sent: boolean
  required: boolean
  expiryDate?: string
  receivedDate?: string
  uploadedDate: string
  uploadedBy: string
}

export interface Entity {
  id: string
  name: string
  type: 'company' | 'person'
  identifier?: string // Optional note to distinguish between same-named entities
  email?: string
  phone?: string
  passportFilePath?: string // Path to ID/passport document (for persons)
  certificateOfIncorporationPath?: string // Path to Certificate of Incorporation (for companies)
  articlesOfAssociationPath?: string // Path to Articles of Association (for companies)
  kycFilePath?: string // Path to KYC document (for all entities)
  ofacCheckedAt?: string
  ofacMatchFound?: boolean
  ofacStatus?: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH' | 'SANCTIONED'
}

export interface AssuredRole {
  id: string
  name: string
  vesselCount?: number
  order?: number
}

export interface VesselAssured {
  id: string
  vesselId: string
  entityId: string
  role: string
}

export interface EntityUBO {
  assuredEntityId: string
  uboEntityId: string
}

export interface VesselNameHistory {
  id: string
  vesselId: string
  previousName: string
  changedAt: string
  changedBy?: string
}

export interface FlagState {
  id: string
  name: string
  iso3Code: string
  address?: string
  email?: string
  vesselCount?: number
}

export interface AppData {
  documentTypes: DocumentType[]
  fleets: Fleet[]
  vessels: Vessel[]
  vesselDocuments: VesselDocument[]
  entities: Entity[]
  assuredRoles: AssuredRole[]
  vesselAssureds: VesselAssured[]
  entityUBOs: EntityUBO[]
}

export interface User {
  id: string
  username: string
  passwordHash: string
  role: 'admin' | 'user'
  themePreference?: 'light' | 'dark'
  sanctionsThreshold?: number // 0-100
  lastAppVersion?: string
  windowWidth?: number
  windowHeight?: number
  windowX?: number
  windowY?: number
  sidebarCollapsed?: boolean
  collapsedGroups?: string // JSON array of collapsed group IDs
  createdAt?: string
  lastLoginAt?: string
}

export interface SanctionsMatch {
  id: string
  target_type: string
  source: string
  source_id: string
  names: string[]
  positions: string[]
  remarks: string | null
  listed_on: string | null
  created_at: string
  score?: number
  imo_number?: string
}

export interface FileTypeSettings {
  allowedExtensions: string[] // e.g., ['.pdf', '.jpg', '.zip']
  blockedExtensions: string[] // e.g., ['.exe', '.bat', '.sh']
}

export interface ConditionSurveyType {
  id: string
  name: string
}

export interface ConditionSurvey {
  id: string
  vesselId: string
  surveyDate: string
  surveyorId: string
  surveyType: string
  reference?: string
  location?: string
  notes?: string
  completedAt?: string
  completedBy?: string
  endorsementIssued?: boolean | null
  endorsementReminderDate?: string | null
  createdAt?: string
  createdBy?: string
}

export type WarrantyStatus = 'pending' | 'survey_done' | 'completed' | 'waived'
export type DeadlineType = 'days' | 'event'

export interface SurveyWarranty {
  id: string
  vesselId: string
  policyId?: string | null
  description: string
  deadlineType: DeadlineType
  deadlineDays?: number | null
  deadlineEvent?: string | null
  inceptionDate: string
  notes?: string | null
  status: WarrantyStatus
  waiverReason?: string | null
  completedAt?: string | null
  completionNotes?: string | null
  conditionSurveyId?: string | null
  createdAt?: string
  // joined fields from queries
  vesselName?: string
  imoNumber?: string
  customerName?: string
  fleetName?: string
  policyTypeName?: string
  lastReminderDate?: string | null
  nextReminderDate?: string | null
  reminderCount?: number
}

export interface SurveyWarrantyReminder {
  id: string
  warrantyId: string
  sentAt: string
  channel: 'email' | 'phone' | 'other'
  reference?: string | null
  notes?: string | null
  nextReminderDate?: string | null
  loggedBy?: string | null
  loggedByName?: string | null
  createdAt?: string
}

export interface SurveyDefect {
  id: string
  surveyId: string
  defectNumber: string
  description: string
  severity?: 'Critical' | 'Major' | 'Minor' | 'Observation'
  status: 'OPEN' | 'CLOSED'
  dueDate?: string
  notes?: string
  closedAt?: string
  closedBy?: string
  closureNotes?: string
  createdAt?: string
}

export interface SurveyAttachment {
  id: string
  surveyId: string
  filePath: string
  fileName: string
  fileType?: 'report' | 'photo' | 'certificate' | 'other'
  uploadedAt?: string
  uploadedBy?: string
}

export interface Surveyor {
  id: string
  companyName: string
  country: string
  contactPerson?: string
  contactDetails?: string
  notes?: string
  createdAt?: string
}

export interface ComplianceScheduleSettings {
  enabled: boolean
  dayOfWeek: number // 0 = Sunday, 1 = Monday, etc.
  timeOfDay: string // HH:mm format
  threshold: number // Match score threshold (0-100)
  includeVessels: boolean
  skipCleared: boolean // Skip entities already marked as CLEARED
  autoMarkCleanOnCheck?: boolean // Auto-mark as CLEARED when pill check finds no matches above threshold
  lastRunAt?: string
  nextRunAt?: string
}

export interface ComplianceCheckLog {
  id: string
  runAt: string
  totalChecked: number
  matchesFound: number
  status: 'completed' | 'failed' | 'running'
  error?: string
  createdAt?: string
}

export interface ComplianceCheckResult {
  id: string
  logId: string
  entityType: 'entity' | 'vessel'
  entityId: string
  entityName: string
  matchScore: number
  matchDetails: string // JSON string of SanctionsMatch[]
  status: 'pending_review' | 'reviewed'
  reviewedBy?: string
  reviewedAt?: string
  createdAt?: string
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface VesselQueryParams {
  page?: number
  limit?: number
  search?: string
  fleetId?: string
  status?: 'all' | 'active' | 'inactive'
  customerId?: string
  sortField?: 'name' | 'imoNumber'
  sortOrder?: 'asc' | 'desc'
}

export interface EntityQueryParams {
  page?: number
  limit?: number
  search?: string
  type?: 'all' | 'company' | 'person'
  ofacStatus?: 'all' | 'CLEARED' | 'MATCH' | 'PENDING' | 'POTENTIAL_MATCH'
  sortField?: 'name' | 'type'
  sortOrder?: 'asc' | 'desc'
  customersOnly?: boolean
}

export interface SurveyorQueryParams {
  page?: number
  limit?: number
  search?: string
  country?: string
  sortField?: 'companyName' | 'country'
  sortOrder?: 'asc' | 'desc'
}

export interface ComplianceResultQueryParams {
  page?: number
  limit?: number
  logId?: string
  status?: 'all' | 'pending_review' | 'reviewed'
  entityType?: 'all' | 'entity' | 'vessel'
  sortField?: 'matchScore' | 'createdAt' | 'entityName'
  sortOrder?: 'asc' | 'desc'
}

export interface ReminderSettings {
  periodDays: number
  reminderTemplate: string
}

export interface VesselReminderSnooze {
  vesselId: string
  snoozedAt: string
  snoozedBy: string
  snoozeUntil: string
}

export interface AssuredDocAlert {
  assuredId: string
  entityId: string
  entityName: string
  roleName: string
  entityType: 'company' | 'person'
  missingDocs: string[]
}

export interface VesselReminder {
  vesselId: string
  vesselName: string
  imoNumber: string
  fleetId: string | null
  fleetName: string | null
  missingVesselDocs: { docTypeName: string; status: 'missing' | 'expired'; expiryDate?: string }[]
  assuredAlerts: AssuredDocAlert[]
  isSnoozed: boolean
  snoozeUntil?: string
  snoozedBy?: string
  totalIssues: number
}

export interface PolicyType {
  id: string
  name: string
  order: number
}

export interface VesselPolicy {
  id: string
  vesselId: string
  policyTypeId: string
}

export interface DABQueryCriteria {
  logic: 'AND' | 'OR'
  policyTypeIds?: string[]
  flagStateIds?: string[]
  flagStateUnassigned?: boolean
  customerIds?: string[]
  customerType?: 'broker' | 'direct' | 'both'
  exportType: 'email' | 'phone' | 'both'
  vesselStatus?: 'active' | 'inactive' | 'all'
}

// ==================== P&I Quotation Settings ====================

export interface PIClause {
  id: string
  clauseNumber: number
  name: string
  description?: string
  isCargoRelated: boolean
  order: number
}

export interface PIClauseSet {
  id: string
  name: string
  clauseIds?: string[]
  descriptionOverrides?: Record<string, string>
}

export interface PIWarrantyTag {
  id: string
  name: string
  order: number
}

export type QuotationTypeScope = 'pi' | 'hull' | 'both'

export interface PIWarranty {
  id: string
  text: string
  isCargoRelated: boolean
  defaultSelected: boolean
  tagIds?: string[]
  typeScope: QuotationTypeScope
  order: number
}

export interface PIWarrantySet {
  id: string
  name: string
  warrantyIds?: string[]
  defaultSelected?: boolean
}

export interface QuotationCustomWarranty {
  id: string
  quotationId: string
  text: string
  order: number
  vesselScope?: string[] | null
}

export interface PIDeductible {
  id: string
  title: string
  description: string
  defaultAmount: number
  defaultCurrency: string
  hasSecondary: boolean
  secondaryDescription?: string
  secondaryDefaultAmount?: number
  order: number
}

export interface PIDeductibleSet {
  id: string
  name: string
}

export interface PIDeductibleSetItem {
  id: string
  setId: string
  deductibleId: string
  amount: number
  currency: string
  secondaryAmount?: number
}

export interface PIExclusion {
  id: string
  text: string
  isCargoRelated: boolean
  vesselTypeIds?: string[]
  order: number
}

export interface QuotationCustomExclusion {
  id: string
  quotationId: string
  text: string
  order: number
  vesselScope?: string[] | null
}

export interface QuotationCustomSection {
  id: string
  quotationId: string
  title: string
  text?: string
  order: number
}

export interface PISubjectivity {
  id: string
  text: string
  docTypeIds: string[]
  typeScope: QuotationTypeScope
  order: number
}

export interface QuotationSubjectivity {
  id: string
  quotationId: string
  piSubjectivityId?: string
  text: string
  isCustom: boolean
  isAutoPopulated: boolean
  order: number
  vesselScope?: string[] | null
}

export interface PISubLimitTemplate {
  id: string
  textTemplate: string
  defaultAmount: number
  defaultCurrency: string
  order: number
}

export interface PIAdditionalClause {
  id: string
  title?: string
  code?: string
  text: string
  order: number
  defaultSelected?: boolean
}

export interface PIAdditionalClauseSet {
  id: string
  name: string
  clauseIds?: string[]
}

export interface TradingExcludedCountry {
  id: string
  name: string
  iso3Code: string
  listType: 'excluded' | 'ddq'
}

// ==================== Hull Quotation Settings ====================

export interface HullAgreedValueText {
  id: string
  text: string
  defaultSelected: boolean
  order: number
}

export interface HullClause {
  id: string
  name: string
  code: string
  description?: string
  order: number
}

export interface HullClauseCondition {
  id: string
  hullClauseId: string
  conditionNumber: string
  text: string
  defaultSelected: boolean
  order: number
}

export interface HullAdditionalCondition {
  id: string
  title?: string
  text: string
  defaultSelected: boolean
  order: number
}

export interface QuotationAgreedValueItem {
  id: string
  quotationId: string
  hullTextId?: string
  text: string
  order: number
  vesselScope?: string[] | null
}

export interface QuotationHullCondition {
  id: string
  quotationId: string
  hullConditionId: string
  textOverride?: string
  order: number
  vesselScope?: string[] | null
}

export interface QuotationHullAdditionalCondition {
  id: string
  quotationId: string
  hullAdditionalConditionId: string
  textOverride?: string
  order: number
  vesselScope?: string[] | null
}

// ==================== Quotation ====================

export interface QuotationType {
  id: string
  name: string
  code: string
  orderIndex: number
  createdAt?: string
}

export type QuotationStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'converted'

export interface Quotation {
  id: string
  referenceNumber: string
  quotationDate: string
  quotationTypeId?: string
  quotationTypeName?: string
  quotationTypeCode?: string
  policyTypeId: string
  policyTypeName?: string
  vesselId?: string
  vesselName?: string
  isRenewal: boolean
  status: QuotationStatus
  periodText?: string
  limitOfLiabilityAmount?: number
  limitOfLiabilityCurrency?: string
  limitOfLiabilityText?: string
  premiumAmount?: number
  premiumCurrency?: string
  numInstalments?: number
  tradingWarrantyIntro?: string
  tradingShowDdqList: boolean
  tradingShowDdqWarranties: boolean
  tradingShowIsrael: boolean
  tradingCustomText?: string
  sanctionsClauseVersion: string
  vdrDeductibleEnabled: boolean
  deductibleAggregateEnabled: boolean
  deductibleAggregateText?: string
  validityDays: number
  premiumAdditionalText?: string
  ncbEnabled: boolean
  ncbDiscountType?: 'percentage' | 'amount'
  ncbDiscountPercent?: number
  ncbDiscountAmount?: number
  ncbText?: string
  upccEnabled: boolean
  upccDiscountType?: 'percentage' | 'amount'
  upccDiscountPercent?: number
  upccDiscountAmount?: number
  upccText?: string
  nonRefundableType?: 'first_instalment' | 'percentage' | null
  nonRefundablePercent?: number
  agreedValue?: number
  agreedValueCurrency?: string
  hullClauseId?: string
  coName?: string
  title?: string
  sectionTextsOverride?: PISectionTexts
  sanctionsTextOverride?: string
  sectionOrder?: string[]
  createdAt?: string
  updatedAt?: string
  createdBy?: string
}

export interface QuotationNewVessel {
  id: string
  quotationId: string
  name: string
  imoNumber?: string
  builtYear?: number
  grossTonnage?: number
  flag?: string
  vesselType?: string
  classification?: string
  callSign?: string
}

export interface QuotationAssured {
  id: string
  quotationId: string
  entityId?: string
  name: string
  role: string
  vesselLabel?: string
  order: number
}

export interface QuotationVessel {
  id: string
  quotationId: string
  vesselId?: string
  vesselLabel: string
  order: number
  // populated from vessels table when vesselId is set
  name?: string
  imoNumber?: string
  builtYear?: number
  grossTonnage?: number
  flag?: string
  vesselType?: string
  classification?: string
  callSign?: string
  premiumAmount?: number
}

export interface QuotationSubLimit {
  id: string
  quotationId: string
  text: string
  amount: number
  currency: string
}

export interface QuotationDeductible {
  id: string
  quotationId: string
  piDeductibleId?: string
  title: string
  description: string
  amount: number
  currency: string
  secondaryAmount?: number
  secondaryDescription?: string
  order: number
  vesselScope?: string[] | null
}

export interface PITextDeductible {
  id: string
  title: string
  text: string
  defaultIncluded: boolean
  order: number
}

export interface QuotationTextDeductible {
  id: string
  quotationId: string
  piTextDeductibleId?: string
  title: string
  text: string
  order: number
  vesselScope?: string[] | null
}

export interface QuotationExcludedCountry {
  id: string
  quotationId: string
  name: string
  listType: 'excluded' | 'ddq'
}

export interface QuotationInstalment {
  id: string
  quotationId: string
  instalmentNumber: number
  daysFromInception: number
}

export interface QuotationNote {
  id: string
  quotationId: string
  title: string
  content: string
  order: number
}

export interface PISectionTexts {
  docHeader?: string
  docHeaderSpacing?: number
  docFooter?: string
  docFooterSpacing?: number
  insuredFooter?: string
  conditionsIntro?: string
  limitOfLiabilityDefaultText?: string
  tradingIntro?: string
  tradingConditionA?: string
  tradingConditionB?: string
  tradingConditionC?: string
  tradingConditionD?: string
  tradingConditionE?: string
  tradingConditionF?: string
  tradingConditionG?: string
  tradingIsrael?: string
  ddqCountriesIntro?: string
  warrantiesBreach?: string
  warrantiesAdditionalText?: string
  warrantiesNote?: string
  deductiblesAdditionalText?: string
  deductiblesAggregate?: string
  deductiblesVDR?: string
  subjectivitiesIntro?: string
  subjectivitiesNote?: string
  premiumPaymentIntro?: string
  premiumCondition?: string
  premiumEarned?: string
  ncbDefaultText?: string
  upccDefaultText?: string
  continuationPiClubText?: string
  informationNote?: string
  importantNotice?: string
}

export interface PISanctionsVersion {
  id: string
  name: string
  key: string
  text: string
  order: number
}

export interface InstalmentDefaults {
  [count: string]: number[] // e.g. { "2": [0, 180], "3": [0, 90, 180] }
}

// ==================== Vessel Types ====================

export interface VesselType {
  id: string
  name: string
  description?: string
  order: number
}

// ==================== Classification Societies ====================

export interface ClassificationSociety {
  id: string
  name: string
  abbreviation: string
  isIacs: boolean
  order: number
}

export interface VesselClassification {
  id: string
  vesselId: string
  classificationSocietyId: string
  classificationSocietyName?: string
  abbreviation?: string
  isIacs?: boolean
}

// ==================== Vessel Audit Log ====================

export interface VesselAuditEntry {
  id: string
  vesselId: string
  fieldName: string
  oldValue: string | null
  newValue: string | null
  changedBy: string
  changedAt: string
}

// ==================== Dynamic Policy System ====================

export interface PolicyTypeCharacteristic {
  id: string
  policyTypeId: string
  name: string
  fieldType: 'date' | 'amount' | 'text' | 'boolean' | 'select'
  selectOptions?: string[] // For 'select' type
  isRequired: boolean
  order: number
}

export interface PolicyTypeCondition {
  id: string
  policyTypeId: string
  name: string
  order: number
}

export interface VesselDynamicPolicy {
  id: string
  vesselId: string
  policyTypeId: string
  policyTypeName?: string
  policyNumber?: string
  conditionId?: string
  conditionName?: string
  status: 'active' | 'expired' | 'cancelled' | 'inactive'
  currency: string
  brokerEntityId?: string
  brokerName?: string
  notes?: string
  createdAt?: string
  updatedAt?: string
  values?: VesselPolicyValue[]
}

export interface VesselPolicyValue {
  id: string
  policyId: string
  characteristicId: string
  characteristicName?: string
  fieldType?: string
  valueText?: string
  valueAmount?: number
  valueDate?: string
  valueBoolean?: boolean
}

export interface VesselInsurancePolicy {
  id: string
  vesselId: string
  policyCategory: 'hull' | 'pi' | 'war'
  policyNumber?: string
  coverageCode?: string
  inceptionDate?: string
  inceptionTime?: string
  endDate?: string
  endTime?: string
  currency: string
  hmValue?: number
  ivValue?: number
  hmPremium?: number
  ivPremium?: number
  deductible?: number
  amd?: number
  generalAverage?: number
  limitOfLiability?: number
  premium?: number
  warRate?: string
  upcc?: string
  ncb?: string
  ourShare?: string
  notes?: string
  conditionSurvey?: string
  surveyDone?: string
  surveyDate?: string
  surveyReference?: string
  broker?: string
  fleetName?: string
}

export interface ReportSettings {
  companyName: string
  companySubtitle: string
  footerText: string
  primaryColor: [number, number, number]
}
