export interface DocumentType {
  id: string
  name: string
  required: boolean
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
  passportFilePath?: string // Path to ID/passport document (for persons)
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
