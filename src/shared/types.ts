export interface DocumentType {
  id: string
  name: string
  required: boolean
  order: number
  description?: string
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
  customerId?: string
  customerType?: 'broker' | 'direct'
}

export interface VesselDocument {
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
  windowWidth?: number
  windowHeight?: number
  windowX?: number
  windowY?: number
  createdAt?: string
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

export interface ConditionSurvey {
  id: string
  vesselId: string
  surveyDate: string
  surveyorId: string
  surveyType: string
  location?: string
  notes?: string
  createdAt?: string
  createdBy?: string
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
