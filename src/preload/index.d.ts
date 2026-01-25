import { ElectronAPI } from '@electron-toolkit/preload'
import { DocumentType, Fleet, Vessel, VesselDocument, Entity, AssuredRole, VesselAssured, EntityUBO, User, SanctionsMatch, FileTypeSettings, ConditionSurvey, SurveyDefect, SurveyAttachment, Surveyor } from '../shared/types'

export interface Api {
  authLogin: (credentials: { username: string; password: string }) => Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; message?: string }>
  authGetSession: () => Promise<Omit<User, 'passwordHash'> | null>
  authLogout: () => Promise<void>
  authCreateUser: (userData: { username: string; password: string; role: 'admin' | 'user' }) => Promise<{ success: boolean; message?: string }>
  getUsers: () => Promise<User[]>
  deleteUser: (id: string) => Promise<void>
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

  getEntities: () => Promise<Entity[]>
  addEntity: (entity: Omit<Entity, 'id'>) => Promise<Entity>
  updateEntity: (id: string, updates: Partial<Entity>) => Promise<void>
  deleteEntity: (id: string) => Promise<void>

  getAssuredRoles: () => Promise<AssuredRole[]>
  addAssuredRole: (role: Omit<AssuredRole, 'id'>) => Promise<AssuredRole>
  updateAssuredRole: (id: string, updates: Partial<AssuredRole>) => Promise<void>
  deleteAssuredRole: (id: string) => Promise<void>

  getVesselAssureds: (vesselId?: string) => Promise<VesselAssured[]>
  addVesselAssured: (assured: Omit<VesselAssured, 'id'>) => Promise<VesselAssured>
  deleteVesselAssured: (id: string) => Promise<void>

  getEntityUBOs: (assuredEntityId?: string) => Promise<EntityUBO[]>
  addEntityUBO: (ubo: EntityUBO) => Promise<void>
  deleteEntityUBO: (ubo: EntityUBO) => Promise<void>

  fsExists: (filePath: string) => Promise<boolean>
  fsOpen: (filePath: string) => Promise<void>
  getFilePath: (file: File) => string

  dialogOpenFile: () => Promise<string | null>
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

  // Surveyors
  getSurveyors: () => Promise<Surveyor[]>
  addSurveyor: (surveyor: Omit<Surveyor, 'id'>) => Promise<Surveyor>
  updateSurveyor: (id: string, updates: Partial<Surveyor>) => Promise<void>
  deleteSurveyor: (id: string) => Promise<void>

  // Condition Surveys
  getConditionSurveys: (vesselId?: string) => Promise<ConditionSurvey[]>
  addConditionSurvey: (survey: Omit<ConditionSurvey, 'id'>) => Promise<ConditionSurvey>
  updateConditionSurvey: (id: string, updates: Partial<ConditionSurvey>) => Promise<void>
  deleteConditionSurvey: (id: string) => Promise<void>
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
