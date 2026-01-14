import { ElectronAPI } from '@electron-toolkit/preload'
import { DocumentType, Fleet, Vessel, VesselDocument } from '../shared/types'

export interface Api {
  getDocumentTypes: () => Promise<DocumentType[]>
  addDocumentType: (docType: Omit<DocumentType, 'id'>) => Promise<DocumentType>
  updateDocumentType: (id: string, updates: Partial<DocumentType>) => Promise<void>
  deleteDocumentType: (id: string) => Promise<void>
  
  getFleets: () => Promise<Fleet[]>
  addFleet: (fleet: Omit<Fleet, 'id'>) => Promise<Fleet>
  deleteFleet: (id: string) => Promise<void>
  
  getVessels: () => Promise<Vessel[]>
  addVessel: (vessel: Omit<Vessel, 'id'>) => Promise<Vessel>
  updateVessel: (id: string, updates: Partial<Vessel>) => Promise<void>
  deleteVessel: (id: string) => Promise<void>
  
  getVesselDocuments: (vesselId?: string) => Promise<VesselDocument[]>
  upsertVesselDocument: (doc: VesselDocument) => Promise<void>
  updateVesselDocumentExpiry: (vesselId: string, docTypeId: string, expiryDate: string) => Promise<void>
  updateVesselDocumentReceivedDate: (vesselId: string, docTypeId: string, receivedDate: string) => Promise<void>

  fsExists: (filePath: string) => Promise<boolean>
  fsOpen: (filePath: string) => Promise<void>
  getFilePath: (file: File) => string
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
