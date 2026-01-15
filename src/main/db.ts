import Store from 'electron-store'
import { AppData, DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO } from '../shared/types'
import { v4 as uuidv4 } from 'uuid'

const schema = {
  documentTypes: {
    type: 'array',
    default: []
  },
  fleets: {
    type: 'array',
    default: []
  },
  vessels: {
    type: 'array',
    default: []
  },
  vesselDocuments: {
    type: 'array',
    default: []
  },
  entities: {
    type: 'array',
    default: []
  },
  assuredRoles: {
    type: 'array',
    default: []
  },
  vesselAssureds: {
    type: 'array',
    default: []
  },
  entityUBOs: {
    type: 'array',
    default: []
  }
}

const store = new Store<AppData>({ schema } as any)

export const db = {
  // Document Types
  getDocumentTypes: () => store.get('documentTypes'),
  addDocumentType: (docType: Omit<DocumentType, 'id'>) => {
    const list = store.get('documentTypes')
    const maxOrder = list.length > 0 ? Math.max(...list.map(d => d.order || 0)) : 0
    const newItem = {
      ...docType,
      id: uuidv4(),
      order: docType.order !== undefined ? docType.order : (maxOrder || 0) + 1
    }
    store.set('documentTypes', [...list, newItem])
    return newItem
  },
  updateDocumentType: (id: string, updates: Partial<DocumentType>) => {
    const list = store.get('documentTypes')
    const index = list.findIndex(d => d.id === id)
    if (index !== -1) {
      list[index] = { ...list[index], ...updates }
      store.set('documentTypes', list)
    }
  },
  deleteDocumentType: (id: string) => {
    const list = store.get('documentTypes')
    store.set('documentTypes', list.filter(d => d.id !== id))
  },

  // Fleets
  getFleets: () => store.get('fleets'),
  addFleet: (fleet: Omit<Fleet, 'id'>) => {
    const list = store.get('fleets')
    const newItem = { ...fleet, id: uuidv4() }
    store.set('fleets', [...list, newItem])
    return newItem
  },
  deleteFleet: (id: string) => {
    const list = store.get('fleets')
    store.set('fleets', list.filter(f => f.id !== id))
    // Also disconnect vessels
    const vessels = store.get('vessels')
    store.set('vessels', vessels.map(v => v.fleetId === id ? { ...v, fleetId: undefined } : v))
  },

  // Vessels
  getVessels: () => store.get('vessels'),
  addVessel: (vessel: Omit<Vessel, 'id'>) => {
    const list = store.get('vessels')
    const newItem = { ...vessel, id: uuidv4() }
    store.set('vessels', [...list, newItem])
    return newItem
  },
  updateVessel: (id: string, updates: Partial<Vessel>) => {
    const list = store.get('vessels')
    const index = list.findIndex(v => v.id === id)
    if (index !== -1) {
      list[index] = { ...list[index], ...updates }
      store.set('vessels', list)
    }
  },
  deleteVessel: (id: string) => {
    const list = store.get('vessels')
    store.set('vessels', list.filter(v => v.id !== id))
    // Also delete documents
    const docs = store.get('vesselDocuments')
    store.set('vesselDocuments', docs.filter(d => d.vesselId !== id))
  },

  // Vessel Documents
  getVesselDocuments: (vesselId?: string) => {
    const list = store.get('vesselDocuments')
    return vesselId ? list.filter(d => d.vesselId === vesselId) : list
  },
  upsertVesselDocument: (doc: VesselDocument) => {
    const list = store.get('vesselDocuments')
    const index = list.findIndex(d => d.vesselId === doc.vesselId && d.documentTypeId === doc.documentTypeId)
    if (index !== -1) {
      list[index] = doc
    } else {
      list.push(doc)
    }
    store.set('vesselDocuments', list)
  },

  updateVesselDocumentExpiry: (vesselId: string, docTypeId: string, expiryDate: string) => {
    const list = store.get('vesselDocuments')
    const index = list.findIndex(d => d.vesselId === vesselId && d.documentTypeId === docTypeId)
    if (index !== -1) {
      list[index].expiryDate = expiryDate
      store.set('vesselDocuments', list)
    } else {
      const newDoc: VesselDocument = {
        vesselId,
        documentTypeId: docTypeId,
        filePath: '',
        expiryDate,
        sent: false,
        required: store.get('documentTypes').find(t => t.id === docTypeId)?.required || false,
        uploadedDate: new Date().toISOString(),
        uploadedBy: 'System'
      }
      store.set('vesselDocuments', [...list, newDoc])
    }
  },

  updateVesselDocumentReceivedDate: (vesselId: string, docTypeId: string, receivedDate: string) => {
    const list = store.get('vesselDocuments')
    const index = list.findIndex(d => d.vesselId === vesselId && d.documentTypeId === docTypeId)
    if (index !== -1) {
      list[index].receivedDate = receivedDate
      store.set('vesselDocuments', list)
    } else {
      const newDoc: VesselDocument = {
        vesselId,
        documentTypeId: docTypeId,
        filePath: '',
        sent: false,
        required: store.get('documentTypes').find(t => t.id === docTypeId)?.required || false,
        receivedDate,
        uploadedDate: new Date().toISOString(),
        uploadedBy: 'System'
      }
      store.set('vesselDocuments', [...list, newDoc])
    }
  },

  // Entities (Assureds/UBOs)
  getEntities: () => store.get('entities'),
  addEntity: (entity: Omit<Entity, 'id'>) => {
    const list = store.get('entities')
    const newItem = { ...entity, id: uuidv4() }
    store.set('entities', [...list, newItem])
    return newItem
  },
  deleteEntity: (id: string) => {
    const list = store.get('entities')
    store.set('entities', list.filter(e => e.id !== id))
    // Cleanup relations
    const vAssocs = store.get('vesselAssureds')
    store.set('vesselAssureds', vAssocs.filter(v => v.entityId !== id))
    const uboAssocs = store.get('entityUBOs')
    store.set('entityUBOs', uboAssocs.filter(u => u.assuredEntityId !== id && u.uboEntityId !== id))
  },

  // Assured Roles
  getAssuredRoles: () => store.get('assuredRoles'),
  addAssuredRole: (role: Omit<AssuredRole, 'id'>) => {
    const list = store.get('assuredRoles')
    const newItem = { ...role, id: uuidv4() }
    store.set('assuredRoles', [...list, newItem])
    return newItem
  },
  deleteAssuredRole: (id: string) => {
    const list = store.get('assuredRoles')
    store.set('assuredRoles', list.filter(r => r.id !== id))
  },

  // Vessel Assureds
  getVesselAssureds: (vesselId?: string) => {
    const list = store.get('vesselAssureds')
    return vesselId ? list.filter(v => v.vesselId === vesselId) : list
  },
  addVesselAssured: (assured: Omit<VesselAssured, 'id'>) => {
    const list = store.get('vesselAssureds')
    const newItem = { ...assured, id: uuidv4() }
    store.set('vesselAssureds', [...list, newItem])
    return newItem
  },
  deleteVesselAssured: (id: string) => {
    const list = store.get('vesselAssureds')
    store.set('vesselAssureds', list.filter(v => v.id !== id))
  },

  // Entity UBOs (Relationship between Assured and UBO)
  getEntityUBOs: (assuredEntityId?: string) => {
    const list = store.get('entityUBOs')
    return assuredEntityId ? list.filter(u => u.assuredEntityId === assuredEntityId) : list
  },
  addEntityUBO: (ubo: EntityUBO) => {
    const list = store.get('entityUBOs')
    const exists = list.some(u => u.assuredEntityId === ubo.assuredEntityId && u.uboEntityId === ubo.uboEntityId)
    if (!exists) {
      store.set('entityUBOs', [...list, ubo])
    }
  },
  deleteEntityUBO: (ubo: EntityUBO) => {
    const list = store.get('entityUBOs')
    store.set('entityUBOs', list.filter(u => !(u.assuredEntityId === ubo.assuredEntityId && u.uboEntityId === ubo.uboEntityId)))
  }
}
