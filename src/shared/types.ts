export interface DocumentType {
  id: string
  name: string
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

export interface AppData {
  documentTypes: DocumentType[]
  fleets: Fleet[]
  vessels: Vessel[]
  vesselDocuments: VesselDocument[]
}
