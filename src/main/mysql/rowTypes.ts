import type { FieldPacket, RowDataPacket } from 'mysql2/promise'
import type {
  AnalyticsPolicyCoverage,
  AnalyticsVesselRow,
  ComplianceScheduleSettings,
  Quotation,
  QuotationListRow,
  SurveyWarrantyTemplate
} from '../../shared/types'

/** Raw result of a SELECT through pool/connection.query(): [rows, fields]. */
export type QueryRows = [RowDataPacket[], FieldPacket[]]

/**
 * A mysql2 row whose selected columns (aliased in the SQL) match the domain type T.
 * Extra raw columns stay readable through RowDataPacket's index signature.
 */
export type Row<T> = T & RowDataPacket

/** An inserted record echoed back with its new id ({ id, ...data }) */
export type WithId<T> = T & { id: string }

/** T with the fields K always present, holding null instead of undefined when empty */
export type NullableFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: Exclude<T[P], undefined> | null
}

/** A value bound to a `?` placeholder (accepted by both pool.query and pool.execute). */
export type SqlValue =
  | string
  | number
  | bigint
  | boolean
  | Date
  | null
  | Buffer
  | Uint8Array
  | SqlValue[]
  | { [key: string]: SqlValue }

/** A quotation row of the lightweight list query (getQuotations). */
export type QuotationListItem = Omit<Quotation, 'vesselName'> & {
  vesselName: string | null
  vesselCount: number
  piClauseNames: null
  hullClauseCodes: null
}

/** A vessel reference (id, name, IMO) */
export interface VesselRef {
  id: string
  name: string
  imoNumber: string
}

/** A stored defect attachment (defect:getAttachments) */
export interface DefectAttachmentRow {
  id: string
  defectId: string
  filePath: string
  fileName: string
  uploadedAt: string
  uploadedBy: string
}

/** Dashboard activity lists (dashboard:getActivity) */
export interface DashboardActivity {
  recentVessels: {
    id: string
    name: string
    imoNumber: string
    fleetName?: string
    createdAt: string
    isActive: boolean
  }[]
  recentEntities: { id: string; name: string; type: string; createdAt: string }[]
  recentAuditEntries: {
    vesselId: string
    vesselName: string
    fieldName: string
    newValue?: string
    changedAt: string
  }[]
  weekRenewals: {
    vesselName: string
    imoNumber: string
    policyTypeName: string
    policyNumber?: string
    endDate: string
  }[]
}

/** Dated events of one month for the dashboard calendar (dashboard:getCalendarEvents) */
export interface CalendarEvents {
  policies: { vesselName: string; vesselId: string; policyTypeName: string; endDate: string }[]
  documents: { vesselName: string; vesselId: string; documentName: string; expiryDate: string }[]
  surveys: { vesselName: string; vesselId: string; surveyDate: string; surveyType: string }[]
  warranties: { vesselName: string; vesselId: string; description: string; deadlineDate: string }[]
}

/** Stored weekly compliance schedule: the defaults keep lastRunAt/nextRunAt as null. */
export type StoredComplianceSchedule = Omit<
  ComplianceScheduleSettings,
  'lastRunAt' | 'nextRunAt'
> & {
  lastRunAt?: string | null
  nextRunAt?: string | null
}

/** Totals shown above the paginated quotation list (quotation:getPaginated) */
export interface QuotationListStats {
  byStatus: Record<string, number>
  byType: { code: string; name: string; count: number }[]
  total: number
}

/** One page of the quotation list; stats is `{}` when nothing matches */
export interface QuotationListPage {
  rows: QuotationListRow[]
  total: number
  stats: QuotationListStats | Record<string, never>
}

/** A quotation group with its member count (quotationGroup:getAll / add) */
export interface QuotationGroup {
  id: string
  name: string
  userId: string | null
  color: string | null
  order: number
  memberCount: number
}

/** A P&I clause selected on a quotation (db:getQuotationClauses) */
export interface QuotationClauseRef {
  id: string
  piClauseId: string
  vesselScope?: string[] | null
  alternativeId?: string | null
}

/** A newly added quotation clause (db:addQuotationClause) */
export interface AddedQuotationClause {
  id: string
  quotationId: string
  piClauseId: string
  alternativeId: string | null
}

/** An additional clause on a quotation (db:getQuotationAdditionalClauses) */
export interface QuotationAdditionalClauseRow {
  id: string
  quotationId: string
  piAdditionalClauseId?: string
  customText?: string
  order: number
  vesselScope?: string[] | null
  alternativeId?: string | null
}

/** A P&I warranty selected on a quotation (db:getQuotationWarranties) */
export interface QuotationWarrantyRef {
  id: string
  piWarrantyId: string
  order: number
  vesselScope?: string[] | null
  alternativeId?: string | null
}

/** An exclusion selected on a quotation (db:getQuotationExclusions) */
export interface QuotationExclusionRef {
  id: string
  quotationId: string
  piExclusionId?: string
  customText?: string
  vesselScope?: string[] | null
  alternativeId?: string | null
  order?: number
}

/** A newly added quotation exclusion (db:addQuotationExclusion) */
export interface AddedQuotationExclusion {
  id: string
  quotationId: string
  piExclusionId: string
  alternativeId: string | null
  order: number
}

/** A per-vessel trading warranty intro override (trading:getIntros) */
export interface QuotationTradingIntro {
  id: string
  quotationId: string
  text: string
  vesselScope: string[] | null
  order: number
}

/** A line of the quotation "Information" section (db:getQuotationInformation) */
export interface QuotationInformationItem {
  id: string
  quotationId: string
  text: string
  order: number
}

/** A bank used on debit advices (bank:getAll) */
export interface BankRow {
  id: string
  name: string
  details: string
  order: number
}

/** One revision of a policy number (policy:getRevisions) */
export interface PolicyRevisionRow {
  id: string
  policyNumber: string
  revisionNumber: number
  status: string
  createdAt: string
  exportedAt: string | null
  createdByName: string
}

/** A stored file path of a vessel or entity, for remapping (vessel:getFilePaths) */
export interface StoredFilePath {
  id: string
  source: string
  filePath: string
  label: string
}

/** A Limit of Liability alternative (lol:getOptions) */
export interface QuotationLolOption {
  id: string
  quotationId: string
  label: string | null
  amount: number
  currency: string
  premiumAmount: number | null
  order: number
}

/** A free-text hull additional condition on a quotation (hull:getQuotationCustomConditions) */
export interface QuotationHullCustomCondition {
  id: string
  quotationId: string
  text: string
  title?: string
  order: number
  vesselScope?: string[] | null
  alternativeId?: string | null
}

/** One built-in data validation rule result (compliance:getDataValidation) */
export interface DataValidationRuleResult {
  id: string
  name: string
  description: string
  category: string
  count: number
  items: { id: string; name: string; type: string }[]
}

/** A survey warranty template as listed (title is null when not set) */
export type SurveyWarrantyTemplateRow = Omit<SurveyWarrantyTemplate, 'title'> & {
  title: string | null
}

/** Fleet analytics data set (analytics:getData); `{}` when not connected */
export type AnalyticsData =
  | { vessels: AnalyticsVesselRow[]; policyCoverage: AnalyticsPolicyCoverage[] }
  | Record<string, never>

/** Global search hits per category (search:global) */
export interface GlobalSearchResults {
  /** isActive is the raw TINYINT (0/1) */
  vessels: { id: string; name: string; imoNumber: string; isActive: number }[]
  entities: { id: string; name: string; type: string }[]
  quotations: {
    id: string
    referenceNumber: string
    quotationDate: string
    quotationTypeName: string
    quotationTypeCode: string
  }[]
  policies: {
    id: string
    policyNumber: string
    vesselId: string
    vesselName: string
    source: 'policy_document' | 'vessel_policy'
    status: string
  }[]
}

/** A user's stored signature image */
export interface UserSignatureRow {
  id: string
  userId: string
  imageData: Buffer
  fileName: string
  uploadedAt: string
}

/** A signature in the signer list (no image) */
export interface UserSignatureListRow {
  id: string
  userId: string
  fileName: string
  uploadedAt: string
  username: string
}
