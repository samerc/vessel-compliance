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
  ofacStatus?: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH'
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
  ofacCheckedAt?: string
  ofacMatchFound?: boolean
  ofacStatus?: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH'
}

export interface AssuredRole {
  id: string
  name: string
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
}

export interface FileTypeSettings {
  allowedExtensions: string[] // e.g., ['.pdf', '.jpg', '.zip']
  blockedExtensions: string[] // e.g., ['.exe', '.bat', '.sh']
}
