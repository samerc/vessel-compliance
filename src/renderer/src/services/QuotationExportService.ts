import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, VerticalAlign,
  ImageRun, PageOrientation, TableLayoutType, LevelFormat,
  Header, Footer, PageNumber
} from 'docx'

// A4 page geometry in DXA (twentieths of a point / twips)
const PAGE_W_DXA = 11906  // A4 width
const PAGE_H_DXA = 16838  // A4 height
const MARGIN_LR_DXA = 850   // ~1.5 cm left/right margins (print-friendly)
const MARGIN_TOP_DXA = 900  // ~1.6 cm top margin
const MARGIN_BOT_DXA = 850  // ~1.5 cm bottom margin
const HEADER_DXA = 450      // header distance from page edge
const FOOTER_DXA = 450      // footer distance from page edge
const CONTENT_W = PAGE_W_DXA - 2 * MARGIN_LR_DXA  // ~10206 DXA usable width
const TITLE_W = Math.round(CONTENT_W * 0.20)
const BODY_W = CONTENT_W - TITLE_W
import {
  Quotation, Vessel, QuotationAssured, QuotationSubLimit, QuotationDeductible,
  QuotationTextDeductible, QuotationExcludedCountry, QuotationInstalment, QuotationNote,
  PIClause, PIWarranty, PIExclusion, PIAdditionalClause, PISectionTexts,
  PISanctionsVersion, QuotationVessel, QuotationCustomWarranty, QuotationCustomExclusion, QuotationCustomSection, QuotationSubjectivity,
  HullClause, HullClauseCondition, HullAdditionalCondition,
  QuotationAgreedValueItem, QuotationHullCondition, QuotationHullAdditionalCondition, QuotationHullAlternative,
  QuotationPIAlternative, WarCondition, QuotationWarCondition, WarSettings
} from '../../../shared/types'
import { DEFAULT_SECTION_TEXTS, getDefaultSectionOrder } from '../components/quotationSettingsConstants'
import { parseHtmlToParagraphs, htmlToPlainText } from '../utils/htmlToDocx'
import { stripHtml } from '../utils/htmlToPdfText'

// ==================== Export Snapshot ====================

interface ExportSnapshot {
  sectionTexts: PISectionTexts
  allClauses: PIClause[]
  allWarranties: PIWarranty[]
  allExclusions: PIExclusion[]
  allAdditionalClauses: PIAdditionalClause[]
  sanctionsVersions: PISanctionsVersion[]
  clauseOverrides: Record<string, string>
  logoPath: string | null
  allHullConditions: HullClauseCondition[]
  allHullAdditionalConditions: HullAdditionalCondition[]
  hullClauses: HullClause[]
  allWarConditions: WarCondition[]
  warSettings: WarSettings | null
}

// ==================== Data Gathering ====================

interface QuotationData {
  quotation: Quotation
  quotationVessels: QuotationVessel[]
  allVessels: Vessel[]
  assureds: QuotationAssured[]
  subLimits: QuotationSubLimit[]
  selectedClauseIds: string[]
  clauseVesselScopes: Record<string, string[] | null>
  clauseAltIds: Record<string, (string | null)[]>
  allClauses: PIClause[]
  additionalClauses: { id: string; piAdditionalClauseId?: string; customText?: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]
  allAdditionalClauses: PIAdditionalClause[]
  selectedWarrantyIds: string[]
  warrantyVesselScopes: Record<string, string[] | null>
  warrantyAltIds: Record<string, string | null>
  allWarranties: PIWarranty[]
  customWarranties: QuotationCustomWarranty[]
  deductibles: QuotationDeductible[]
  textDeductibles: QuotationTextDeductible[]
  selectedExclusions: { id: string; piExclusionId?: string; customText?: string; vesselScope?: string[] | null; alternativeId?: string | null }[]
  allExclusions: PIExclusion[]
  customExclusions: QuotationCustomExclusion[]
  piAlternatives: QuotationPIAlternative[]
  customSections: QuotationCustomSection[]
  excludedCountries: QuotationExcludedCountry[]
  subjectivities: QuotationSubjectivity[]
  instalments: QuotationInstalment[]
  information: { id: string; text: string; order: number }[]
  notes: QuotationNote[]
  sectionTexts: PISectionTexts
  sanctionsVersions: PISanctionsVersion[]
  clauseOverrides: Record<string, string>
  logoPath: string | null
  vesselIacsMap: Record<string, boolean>  // quotation vessel ID → is IACS classed
  // Hull-specific data
  hullAgreedValueItems: QuotationAgreedValueItem[]
  hullClauses: HullClause[]
  hullConditions: QuotationHullCondition[]
  allHullConditions: HullClauseCondition[]
  hullAdditionalConditions: QuotationHullAdditionalCondition[]
  allHullAdditionalConditions: HullAdditionalCondition[]
  hullAlternatives: QuotationHullAlternative[]
  // War-specific data
  warConditions: QuotationWarCondition[]
  allWarConditions: WarCondition[]
  warSettings: WarSettings | null
}

async function gatherData(quotation: Quotation): Promise<QuotationData> {
  const [
    quotationVessels, allVessels, assureds, subLimits,
    clauseRows, allClauses, additionalClauses, allAdditionalClauses,
    warrantyRows, allWarranties, customWarranties,
    deductibles, textDeductibles,
    selectedExclusions, allExclusions, customExclusions, customSections,
    excludedCountries, subjectivities, instalments, information, notes,
    sectionTexts, sanctionsVersions, clauseOverridesArr, logoPath,
    hullAgreedValueItems, hullClausesRaw, hullConditionsRaw, allHullConditionsRaw,
    hullAdditionalConditionsRaw, allHullAdditionalConditionsRaw, hullAlternativesRaw,
    warConditionsRaw, allWarConditionsRaw, warSettingsRaw
  ] = await Promise.all([
    window.api.getQuotationVessels(quotation.id),
    window.api.getVessels(),
    window.api.getQuotationAssureds(quotation.id),
    window.api.getQuotationSubLimits(quotation.id),
    window.api.getQuotationClauses(quotation.id),
    window.api.piGetClauses(),
    window.api.getQuotationAdditionalClauses(quotation.id),
    window.api.piGetAdditionalClauses(),
    window.api.getQuotationWarranties(quotation.id),
    window.api.piGetWarranties(),
    window.api.getQuotationCustomWarranties(quotation.id),
    window.api.getQuotationDeductibles(quotation.id),
    window.api.getQuotationTextDeductibles(quotation.id),
    window.api.getQuotationExclusions(quotation.id),
    window.api.piGetExclusions(),
    window.api.getQuotationCustomExclusions(quotation.id),
    window.api.getQuotationCustomSections(quotation.id),
    window.api.getQuotationExcludedCountries(quotation.id),
    window.api.getQuotationSubjectivities(quotation.id),
    window.api.getQuotationInstalments(quotation.id),
    window.api.getQuotationInformation(quotation.id),
    window.api.getQuotationNotes(quotation.id),
    window.api.piGetSectionTexts(),
    window.api.piGetSanctionsVersions(),
    window.api.getQuotationClauseOverrides(quotation.id),
    window.api.piGetQuotationLogoPath(),
    // Hull-specific data
    window.api.hullGetQuotationAgreedValueItems(quotation.id),
    window.api.hullGetClauses(),
    window.api.hullGetQuotationHullConditions(quotation.id),
    window.api.hullGetClauseConditions(),
    window.api.hullGetQuotationHullAdditionalConditions(quotation.id),
    window.api.hullGetAdditionalConditions(),
    window.api.hullGetQuotationAlternatives(quotation.id),
    // War-specific data
    window.api.warGetQuotationWarConditions(quotation.id),
    window.api.warGetConditions(),
    window.api.warGetSettings()
  ])

  // Extract IDs and vessel scope / alternative maps from new object return format
  const safeClauseRows = Array.isArray(clauseRows) ? clauseRows : []
  const selectedClauseIds = safeClauseRows.map((r: any) => r.piClauseId)
  const clauseVesselScopes: Record<string, string[] | null> = {}
  const clauseAltIds: Record<string, (string | null)[]> = {}
  for (const r of safeClauseRows) {
    if (r.vesselScope) clauseVesselScopes[r.piClauseId] = r.vesselScope
    if (!clauseAltIds[r.piClauseId]) clauseAltIds[r.piClauseId] = []
    clauseAltIds[r.piClauseId].push(r.alternativeId || null)
  }

  const safeWarrantyRows = Array.isArray(warrantyRows) ? warrantyRows : []
  const selectedWarrantyIds = safeWarrantyRows.map((r: any) => r.piWarrantyId)
  const warrantyVesselScopes: Record<string, string[] | null> = {}
  const warrantyAltIds: Record<string, string | null> = {}
  for (const r of safeWarrantyRows) {
    if (r.vesselScope) warrantyVesselScopes[r.piWarrantyId] = r.vesselScope
    warrantyAltIds[r.piWarrantyId] = r.alternativeId || null
  }

  // Fetch PI alternatives
  const piAlternativesRaw = quotation.quotationTypeCode === 'P'
    ? await window.api.piGetQuotationAlternatives(quotation.id)
    : []

  // Check for existing export snapshot
  let snapshot: ExportSnapshot | null = null
  if (quotation.exportSnapshot) {
    try { snapshot = JSON.parse(quotation.exportSnapshot) } catch { /* ignore */ }
  }

  // Three-layer merge: defaults -> global settings -> per-quotation overrides
  const mergedTexts: PISectionTexts = snapshot
    ? snapshot.sectionTexts
    : { ...DEFAULT_SECTION_TEXTS, ...(sectionTexts || {}), ...(quotation.sectionTextsOverride || {}) }

  // Build clause overrides map: clauseId -> description override
  const clauseOverrides: Record<string, string> = snapshot
    ? snapshot.clauseOverrides
    : (clauseOverridesArr && typeof clauseOverridesArr === 'object' && !Array.isArray(clauseOverridesArr)
      ? clauseOverridesArr as Record<string, string>
      : {})

  // Resolve settings data from snapshot or live
  const resolvedAllClauses = snapshot ? snapshot.allClauses : allClauses
  const resolvedAllWarranties = snapshot ? snapshot.allWarranties : allWarranties
  const resolvedAllExclusions = snapshot ? snapshot.allExclusions : allExclusions
  const resolvedAllAdditionalClauses = snapshot ? snapshot.allAdditionalClauses : allAdditionalClauses
  const resolvedSanctionsVersions = snapshot ? snapshot.sanctionsVersions : sanctionsVersions
  const resolvedLogoPath = snapshot ? snapshot.logoPath : (logoPath || null)
  const resolvedHullClauses = snapshot ? snapshot.hullClauses : (Array.isArray(hullClausesRaw) ? hullClausesRaw : [])
  const resolvedAllHullConditions = snapshot ? snapshot.allHullConditions : (Array.isArray(allHullConditionsRaw) ? allHullConditionsRaw : [])
  const resolvedAllHullAdditionalConditions = snapshot ? snapshot.allHullAdditionalConditions : (Array.isArray(allHullAdditionalConditionsRaw) ? allHullAdditionalConditionsRaw : [])
  const resolvedAllWarConditions = snapshot ? snapshot.allWarConditions : (Array.isArray(allWarConditionsRaw) ? allWarConditionsRaw : [])
  const resolvedWarSettings = snapshot ? snapshot.warSettings : (warSettingsRaw && !(warSettingsRaw as any).error ? warSettingsRaw : null)

  // Determine IACS status per quotation vessel
  const vesselIacsMap: Record<string, boolean> = {}
  const safeQVessels = Array.isArray(quotationVessels) ? quotationVessels : []
  const classSocieties = await window.api.getClassificationSocieties()
  const iacsIds = new Set((Array.isArray(classSocieties) ? classSocieties : []).filter(cs => cs.isIacs).map(cs => cs.id))
  for (const qv of safeQVessels) {
    if (qv.vesselId) {
      try {
        const vcs = await window.api.getVesselClassifications(qv.vesselId)
        const hasIacs = (Array.isArray(vcs) ? vcs : []).some((vc: any) => iacsIds.has(vc.classificationSocietyId))
        vesselIacsMap[qv.id] = hasIacs
      } catch { vesselIacsMap[qv.id] = false }
    } else {
      vesselIacsMap[qv.id] = false
    }
  }

  // Save snapshot on first export (if not already saved)
  if (!quotation.exportSnapshot) {
    const newSnapshot: ExportSnapshot = {
      sectionTexts: mergedTexts,
      allClauses: resolvedAllClauses,
      allWarranties: resolvedAllWarranties,
      allExclusions: resolvedAllExclusions,
      allAdditionalClauses: resolvedAllAdditionalClauses,
      sanctionsVersions: resolvedSanctionsVersions,
      clauseOverrides,
      logoPath: resolvedLogoPath,
      allHullConditions: resolvedAllHullConditions,
      allHullAdditionalConditions: resolvedAllHullAdditionalConditions,
      hullClauses: resolvedHullClauses,
      allWarConditions: resolvedAllWarConditions,
      warSettings: resolvedWarSettings
    }
    try { await window.api.saveExportSnapshot(quotation.id, JSON.stringify(newSnapshot)) } catch { /* non-critical */ }
  }

  return {
    quotation, quotationVessels, allVessels, assureds, subLimits,
    selectedClauseIds, clauseVesselScopes, clauseAltIds,
    allClauses: resolvedAllClauses,
    additionalClauses,
    allAdditionalClauses: resolvedAllAdditionalClauses,
    selectedWarrantyIds, warrantyVesselScopes, warrantyAltIds,
    allWarranties: resolvedAllWarranties,
    piAlternatives: Array.isArray(piAlternativesRaw) ? piAlternativesRaw : [],
    customWarranties,
    deductibles, textDeductibles,
    selectedExclusions,
    allExclusions: resolvedAllExclusions,
    customExclusions,
    customSections: Array.isArray(customSections) ? customSections : [],
    excludedCountries, subjectivities, instalments, information, notes,
    sectionTexts: mergedTexts,
    sanctionsVersions: resolvedSanctionsVersions,
    clauseOverrides,
    logoPath: resolvedLogoPath,
    vesselIacsMap,
    hullAgreedValueItems: Array.isArray(hullAgreedValueItems) ? hullAgreedValueItems : [],
    hullClauses: resolvedHullClauses,
    hullConditions: Array.isArray(hullConditionsRaw) ? hullConditionsRaw : [],
    allHullConditions: resolvedAllHullConditions,
    hullAdditionalConditions: Array.isArray(hullAdditionalConditionsRaw) ? hullAdditionalConditionsRaw : [],
    allHullAdditionalConditions: resolvedAllHullAdditionalConditions,
    hullAlternatives: Array.isArray(hullAlternativesRaw) ? hullAlternativesRaw : [],
    warConditions: Array.isArray(warConditionsRaw) ? warConditionsRaw : [],
    allWarConditions: resolvedAllWarConditions,
    warSettings: resolvedWarSettings
  }
}

// ==================== P&I Alternative Helpers ====================

/** Check if any items are scoped to a specific alternative */
function hasAltScoping<T extends { alternativeId?: string | null }>(items: T[]): boolean {
  return items.some(i => i.alternativeId)
}

// ==================== Helpers ====================

/**
 * Resolve vessel scope to a display suffix like " (VESSEL A, VESSEL B)".
 * Returns empty string when scope is null/undefined (all vessels) or only 1 vessel exists.
 */
function vesselScopeSuffix(vesselScope: string[] | null | undefined, quotationVessels: QuotationVessel[]): string {
  if (!vesselScope || vesselScope.length === 0 || quotationVessels.length < 2) return ''
  if (vesselScope.length === quotationVessels.length) return ''
  const names = vesselScope
    .map(id => quotationVessels.find(v => v.id === id))
    .filter(Boolean)
    .map(v => (v!.name || v!.vesselLabel).toUpperCase())
  return names.length > 0 ? ` (${names.join(', ')})` : ''
}

function fmtPct(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return n % 1 === 0 ? String(Math.round(n)) : String(n)
}

function formatCurrency(amount: number | undefined, currency: string | undefined): string {
  if (amount == null) return '-'
  const c = currency || 'USD'
  return `${c} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function formatAmountOnly(amount: number | undefined): string {
  if (amount == null) return '-'
  const isWhole = Number.isInteger(amount)
  return amount.toLocaleString('en-US', { minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: 2 })
}

interface VesselInfo { imo?: string; built?: number; gt?: number; type?: string; flag?: string; classification?: string; callSign?: string; name: string }

function getVesselInfo(qv: QuotationVessel, allVessels: Vessel[]): VesselInfo {
  const reg = qv.vesselId ? allVessels.find(v => v.id === qv.vesselId) : null
  if (reg) return { name: reg.name, imo: reg.imoNumber, built: reg.builtYear, gt: reg.grossTonnage, type: reg.vesselType, flag: undefined, classification: reg.classificationSociety, callSign: reg.callSign }
  return { name: qv.name || 'Unknown', imo: qv.imoNumber, built: qv.builtYear, gt: qv.grossTonnage, type: qv.vesselType, flag: qv.flag, classification: qv.classification, callSign: qv.callSign }
}

/**
 * Resolve IACS-aware warranty text. Returns one or two entries:
 * - If text doesn't contain "vessel classed": returns original unchanged
 * - If all relevant vessels are IACS: returns one entry with "vessel IACS classed"
 * - If none are IACS: returns one entry unchanged
 * - If mixed: returns TWO entries — one "vessel IACS classed" scoped to IACS vessels,
 *   one unchanged scoped to non-IACS vessels
 */
function resolveIacsWarranty(
  text: string,
  vesselScope: string[] | null | undefined,
  data: QuotationData
): { text: string; vesselScope: string[] | null }[] {
  if (!text || !/vessel\s+classed/i.test(text) || data.quotationVessels.length === 0) {
    return [{ text, vesselScope: vesselScope || null }]
  }
  const relevantVessels = (vesselScope && vesselScope.length > 0)
    ? data.quotationVessels.filter(qv => vesselScope.includes(qv.id))
    : data.quotationVessels
  if (relevantVessels.length === 0) return [{ text, vesselScope: vesselScope || null }]

  const iacsVessels = relevantVessels.filter(qv => data.vesselIacsMap[qv.id])
  const nonIacsVessels = relevantVessels.filter(qv => !data.vesselIacsMap[qv.id])

  // All IACS
  if (nonIacsVessels.length === 0) {
    return [{ text: text.replace(/vessel\s+classed/i, 'vessel IACS classed'), vesselScope: vesselScope || null }]
  }
  // None IACS
  if (iacsVessels.length === 0) {
    return [{ text, vesselScope: vesselScope || null }]
  }
  // Mixed — split into two lines (only when multi-vessel quotation)
  if (data.quotationVessels.length < 2) return [{ text, vesselScope: vesselScope || null }]
  return [
    { text: text.replace(/vessel\s+classed/i, 'vessel IACS classed'), vesselScope: iacsVessels.map(v => v.id) },
    { text, vesselScope: nonIacsVessels.map(v => v.id) }
  ]
}

function vesselName(data: QuotationData): string {
  if (data.quotationVessels.length === 0) return 'Unknown Vessel'
  if (data.quotationVessels.length === 1) return getVesselInfo(data.quotationVessels[0], data.allVessels).name
  return data.quotationVessels.map(qv => `${qv.vesselLabel} ${getVesselInfo(qv, data.allVessels).name}`).join(' / ')
}

function getFileName(data: QuotationData, ext: string): string {
  const ref = data.quotation.referenceNumber || 'Quotation'
  const name = (data.quotationVessels.length > 0 ? getVesselInfo(data.quotationVessels[0], data.allVessels).name : 'Quotation').replace(/[^a-zA-Z0-9]/g, '_')
  return `${ref}_${name}.${ext}`
}

function getExclusionTexts(data: QuotationData): string[] {
  const texts: string[] = []
  for (const se of data.selectedExclusions) {
    const eScope = vesselScopeSuffix(se.vesselScope, data.quotationVessels)
    if (se.customText) texts.push(se.customText + eScope)
    else if (se.piExclusionId) {
      const found = data.allExclusions.find(e => e.id === se.piExclusionId)
      if (found) texts.push(found.text + eScope)
    }
  }
  // Append custom exclusions
  for (const ce of data.customExclusions) {
    const ceScope = vesselScopeSuffix(ce.vesselScope, data.quotationVessels)
    texts.push(ce.text + ceScope)
  }
  return texts
}

async function resolveSectionOrder(data: QuotationData): Promise<string[]> {
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const typeDefaultOrder = getDefaultSectionOrder(typeCode)

  let order: string[] | null = null
  if (data.quotation.sectionOrder && data.quotation.sectionOrder.length > 0) {
    order = [...data.quotation.sectionOrder]
  } else {
    const typeDefaults = await window.api.piGetSectionOrderDefaultsByType(typeCode)
    if (Array.isArray(typeDefaults) && typeDefaults.length > 0) {
      order = [...typeDefaults]
    } else {
      const defaults = await window.api.piGetSectionOrderDefaults()
      if (Array.isArray(defaults) && defaults.length > 0) order = [...defaults]
    }
  }
  if (!order) order = [...typeDefaultOrder]

  // Add custom sections not yet in the order
  for (const cs of data.customSections) {
    const key = `custom:${cs.id}`
    if (!order.includes(key)) order.push(key)
  }

  // Ensure all type-relevant default keys are present
  for (const dk of typeDefaultOrder) {
    if (!order.includes(dk)) order.push(dk)
  }

  // Remove stale custom keys and sections not relevant to this type
  const validCustomIds = new Set(data.customSections.map(s => s.id))
  const typeKeys = new Set(typeDefaultOrder)
  return order.filter(k => {
    if (k.startsWith('custom:')) return validCustomIds.has(k.replace('custom:', ''))
    return typeKeys.has(k)
  })
}

function st(data: QuotationData, key: keyof PISectionTexts): string {
  const raw = String(data.sectionTexts[key] || '')
  return raw.replace(/\{quotation_type\}/g, data.quotation.quotationTypeName || 'P&I')
}

function getSanctionsText(data: QuotationData): string {
  // Per-quotation override takes priority
  if (data.quotation.sanctionsTextOverride) return data.quotation.sanctionsTextOverride
  // Look up named version
  const versionKey = data.quotation.sanctionsClauseVersion
  if (!versionKey) return ''
  const version = data.sanctionsVersions.find(v => v.key === versionKey)
  return version?.text || ''
}

function getBrokerName(data: QuotationData): string | null {
  const broker = data.assureds.find(a => a.role && a.role.toLowerCase().includes('broker'))
  return broker ? broker.name : null
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function isHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

// Strip leading "Section B Cl.N –" reference prefix from a clause name to avoid duplication
function stripClauseRef(name: string): string {
  return (name || '').replace(/^Section\s*B\s*Cl\.?\s*\d+\s*[-–—]?\s*/i, '').trim()
}

async function loadLogoAsBase64(logoPath: string): Promise<{ data: string; width: number; height: number } | null> {
  try {
    const resp = await fetch(`safe-file://${logoPath}`)
    const blob = await resp.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result as string
        const img = new Image()
        img.onload = () => resolve({ data: base64, width: img.naturalWidth, height: img.naturalHeight })
        img.onerror = () => resolve(null)
        img.src = base64
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

async function loadLogoAsBuffer(logoPath: string): Promise<{ buffer: ArrayBuffer; width: number; height: number } | null> {
  try {
    const resp = await fetch(`safe-file://${logoPath}`)
    const blob = await resp.blob()
    const buffer = await blob.arrayBuffer()
    // Get dimensions
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.readAsDataURL(blob)
    })
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ buffer, width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = base64
    })
  } catch {
    return null
  }
}

// ==================== PDF Export ====================

export async function exportQuotationToPDF(quotation: Quotation): Promise<void> {
  const data = await gatherData(quotation)
  const doc = new jsPDF()
  const pageWidth = 210
  const margin = 14

  const vName = vesselName(data)
  const selectedClauses = data.allClauses.filter(c => data.selectedClauseIds.includes(c.id))
  const ddqCountries = data.excludedCountries.filter(c => c.listType === 'ddq')
  const exclusionTexts = getExclusionTexts(data)
  const dateStr = data.quotation.quotationDate
    ? new Date(data.quotation.quotationDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  let startY = 18

  // Logo
  if (data.logoPath) {
    const logo = await loadLogoAsBase64(data.logoPath)
    if (logo) {
      const maxH = 20
      const maxW = 60
      const scale = Math.min(maxW / logo.width, maxH / logo.height)
      const w = logo.width * scale
      const h = logo.height * scale
      doc.addImage(logo.data, 'PNG', (pageWidth - w) / 2, 10, w, h)
      startY = 10 + h + 6
    }
  }

  // Header - centered title
  const docTitle = (data.quotation.title || vName).toUpperCase()
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  const typeLabel = data.quotation.quotationTypeCode === 'H' ? 'HULL AND MACHINERY' : data.quotation.quotationTypeCode === 'W' ? 'WAR / PIRACY' : 'PROTECTION AND INDEMNITY'
  doc.text(`${typeLabel} QUOTATION FOR ${docTitle}`, pageWidth / 2, startY, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(dateStr, pageWidth - margin, startY + 10, { align: 'right' })
  doc.text(`Ref: ${data.quotation.referenceNumber || '-'}`, margin, startY + 18)

  // Build two-column sections into a map keyed by section ID
  const sectionMap = new Map<string, [string, string]>()

  // Insured
  {
    const hasVesselLabels = data.quotationVessels.length > 1 && data.assureds.some(a => a.vesselLabel)
    let insuredText = ''
    const pdfSeenLabels = new Set<string>()
    for (const a of data.assureds) {
      const labelKey = a.vesselLabel || ''
      const isFirstOfLabel = !pdfSeenLabels.has(labelKey)
      pdfSeenLabels.add(labelKey)
      if (hasVesselLabels && isFirstOfLabel && labelKey) insuredText += `[${labelKey}]\n`
      insuredText += `${a.name}\n`
      if (a.role) insuredText += `"as ${a.role}"\n`
      insuredText += '\n'
    }
    if (st(data, 'insuredFooter')) insuredText += stripHtml(st(data, 'insuredFooter'))
    const coName = data.quotation.coName || getBrokerName(data)
    if (coName) insuredText += `\n\nc/o ${coName}`
    sectionMap.set('insured', ['Insured', insuredText.trim()])
  }

  // Insured Vessel(s)
  {
    const vesselLines = data.quotationVessels.map(qv => {
      const vi = getVesselInfo(qv, data.allVessels)
      const prefix = data.quotationVessels.length > 1 ? `${qv.vesselLabel}: ` : ''
      return `${prefix}${vi.name}  |  IMO: ${vi.imo || '-'}  |  Built: ${vi.built || '-'}  |  GT: ${vi.gt ? Number(vi.gt).toLocaleString() : '-'}  |  Type: ${vi.type || '-'}  |  Class: ${vi.classification || '-'}`
    })
    if (vesselLines.length > 0) sectionMap.set('vessel', ['Insured Vessel', vesselLines.join('\n')])
  }

  // Limit of Liability
  {
    let liabilityText = ''
    if (data.quotation.limitOfLiabilityText) {
      liabilityText = data.quotation.limitOfLiabilityText
    } else if (st(data, 'limitOfLiabilityDefaultText') && data.quotation.limitOfLiabilityAmount != null) {
      liabilityText = stripHtml(st(data, 'limitOfLiabilityDefaultText'))
        .replace('{amount}', formatAmountOnly(data.quotation.limitOfLiabilityAmount))
        .replace('{currency}', data.quotation.limitOfLiabilityCurrency || 'USD')
    } else if (data.quotation.limitOfLiabilityAmount != null) {
      liabilityText = `${formatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency)} all claims in the aggregate.`
    }
    const pdfSubLimitLines = data.subLimits.map(sl =>
      sl.text.replace('{amount}', formatAmountOnly(sl.amount)).replace('{currency}', sl.currency || 'USD')
    )
    if (liabilityText.includes('{sub_limits}')) {
      liabilityText = liabilityText.replace('{sub_limits}', pdfSubLimitLines.join('\n'))
    } else if (pdfSubLimitLines.length > 0) {
      liabilityText += '\n\n' + pdfSubLimitLines.join('\n')
      liabilityText += '\n\nUnder no circumstances is the Combined Single Limit detailed above to be exceeded.'
    }
    if (liabilityText) sectionMap.set('liability', ['Limit of Liability', liabilityText.trim()])
  }

  // Period
  if (data.quotation.periodText) {
    sectionMap.set('period', ['Period', data.quotation.periodText])
  }

  // Conditions
  if (selectedClauses.length > 0 || data.additionalClauses.length > 0) {
    let condText = ''
    if (st(data, 'conditionsIntro')) condText += stripHtml(st(data, 'conditionsIntro')) + '\n\n'

    const piMultiAlt = data.piAlternatives.length > 1

    const renderClauseList = (clauseIds: string[], altId?: string | null) => {
      let t = ''
      for (const cid of clauseIds) {
        const c = data.allClauses.find(cl => cl.id === cid)
        if (!c) continue
        const desc = (altId ? data.clauseOverrides[`${c.id}::${altId}`] : undefined) || data.clauseOverrides[c.id] || c.description
        const clauseDesc = desc ? ` \u2013 ${desc}` : ''
        const displayName = stripClauseRef(c.name || '')
        const cScope = vesselScopeSuffix(data.clauseVesselScopes[c.id], data.quotationVessels)
        t += `Section B Cl.${c.clauseNumber}${displayName ? ` \u2013 ${displayName}` : ''}${clauseDesc}${cScope}\n`
      }
      return t
    }

    const renderAddlList = (addls: typeof data.additionalClauses) => {
      let t = ''
      for (const ac of addls) {
        const def = data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        const acScope = vesselScopeSuffix(ac.vesselScope, data.quotationVessels)
        if (text) t += `- ${code ? code + ' ' : ''}${text}${acScope}\n`
      }
      return t
    }

    if (piMultiAlt) {
      // Group clauses by alternative — shared clauses appear under each alternative
      const sharedClauseIds = selectedClauses.filter(c => (data.clauseAltIds[c.id] || []).includes(null)).map(c => c.id)
      for (const alt of data.piAlternatives) {
        const altIdx = data.piAlternatives.indexOf(alt)
        const altClauseIds = selectedClauses.filter(c => (data.clauseAltIds[c.id] || []).includes(alt.id)).map(c => c.id)
        const combinedIds = [...new Set([...altClauseIds, ...sharedClauseIds])]
        if (combinedIds.length > 0) {
          condText += `Alternative ${altIdx + 1}:\n`
          condText += renderClauseList(combinedIds, alt.id)
          condText += '\n'
        }
      }
      // Additional clauses grouped by alternative
      const scopedAddls = data.additionalClauses.filter(ac => ac.alternativeId)
      const sharedAddls = data.additionalClauses.filter(ac => !ac.alternativeId)
      if (scopedAddls.length > 0) {
        for (const alt of data.piAlternatives) {
          const altAddls = scopedAddls.filter(ac => ac.alternativeId === alt.id)
          if (altAddls.length > 0) {
            condText += `Applicable to Alternative ${data.piAlternatives.indexOf(alt) + 1}:\n`
            condText += renderAddlList(altAddls) + '\n'
          }
        }
      }
      if (sharedAddls.length > 0) {
        condText += `Applicable to both alternatives:\n`
        condText += renderAddlList(sharedAddls)
      }
    } else {
      condText += renderClauseList(selectedClauses.map(c => c.id))
      if (data.additionalClauses.length > 0) {
        condText += '\n' + renderAddlList(data.additionalClauses)
      }
    }
    sectionMap.set('conditions', ['Conditions', condText.trim()])
  }

  // Agreed Value / Interest (Hull only — War uses sumInsured)
  if (data.quotation.quotationTypeCode !== 'W') {
    const avItems = data.hullAgreedValueItems
    const hasHm = data.quotation.agreedValue != null
    const hasIv = data.quotation.ivEnabled && data.quotation.ivValue != null

    if (hasIv) {
      // Interest section — A) H&M text inline, B) IV text inline
      const hmTextItems = avItems.filter(it => (it.section || 'hm') === 'hm')
      const ivTextItems = avItems.filter(it => it.section === 'iv')
      if (hmTextItems.length > 0 || ivTextItems.length > 0) {
        let intText = ''
        if (hmTextItems.length > 0) {
          intText += 'A) ' + hmTextItems.map(it => it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels)).join('\n') + '\n'
        }
        if (ivTextItems.length > 0) {
          intText += 'B) ' + ivTextItems.map(it => it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels)).join('\n') + '\n'
        }
        sectionMap.set('interest', ['Interest', intText.trim()])
      }
      // Agreed Insured Value — amounts only for IV
      let avText = ''
      if (hasHm) avText += `Section A: ${formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')}\n`
      avText += `Section B: ${formatCurrency(data.quotation.ivValue, data.quotation.ivCurrency || 'USD')}\n`
      sectionMap.set('agreedValue', ['Agreed Insured Value', avText.trim()])
    } else if (avItems.length > 0 || hasHm) {
      // Standard agreed value — value not bold (body column), spacing between value and texts
      let avText = ''
      if (hasHm) {
        avText += formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD') + '\n\n'
      }
      for (const it of avItems) {
        avText += it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels) + '\n'
      }
      sectionMap.set('agreedValue', ['Agreed Insured Value', avText.trim()])
    }
  }

  // Hull Conditions
  {
    const hc = data.hullConditions
    const ha = data.hullAdditionalConditions
    const alts = data.hullAlternatives
    if (hc.length > 0 || ha.length > 0) {
      const ivClauseId = data.quotation.ivClauseId
      const selectedIvClause = ivClauseId ? data.hullClauses.find(c => c.id === ivClauseId) : null
      const multiAlt = alts.length > 1

      const getCondClauseId = (qc: typeof hc[0]) => {
        const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
        return def?.hullClauseId || ''
      }

      // Resolve amount: check the condition itself, then any sibling with the same conditionId
      const resolveAmount = (qc: typeof hc[0]): number | null | undefined => {
        if (qc.amount != null) return qc.amount
        const sibling = hc.find(c => c.hullConditionId === qc.hullConditionId && c.id !== qc.id && c.amount != null)
        return sibling?.amount
      }

      // Returns array of [ref, text] pairs for table-like rendering
      const getCondPairs = (conds: typeof hc): [string, string][] => {
        const pairs: [string, string][] = []
        for (const qc of conds) {
          const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
          if (!def) continue
          let t = qc.textOverride || def.text
          const amount = resolveAmount(qc)
          if (def.hasAmount && def.amountPlaceholder && amount != null) {
            const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            t = t.replace(new RegExp(escaped, 'g'), formatCurrency(amount, data.quotation.premiumCurrency || 'USD'))
          }
          const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
          pairs.push([`Cl. ${def.conditionNumber}`, `${t}${scope}`])
        }
        return pairs
      }

      // Determine where each additional condition belongs
      const getAddlBelonging = (qa: typeof ha[0]): { type: 'alt'; altId: string } | { type: 'allAlts' } | { type: 'iv' } | { type: 'both' } => {
        const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
        if (!def) return { type: 'both' }
        const ids = def.hullClauseIds || []
        if (ids.length === 0) return { type: 'both' }
        const matchedAlts = alts.filter(a => ids.includes(a.hullClauseId))
        const matchesIv = ivClauseId && ids.includes(ivClauseId)
        if (matchedAlts.length === alts.length && matchesIv) return { type: 'both' }
        if (matchedAlts.length === alts.length && !matchesIv) return multiAlt ? { type: 'allAlts' } : { type: 'both' }
        if (matchedAlts.length === 0 && matchesIv) return { type: 'iv' }
        if (matchedAlts.length === 0 && !matchesIv) return { type: 'both' }
        if (matchedAlts.length === 1) return { type: 'alt', altId: matchedAlts[0].id }
        return { type: 'allAlts' }
      }

      const renderAddlForSection = (filterFn: (b: ReturnType<typeof getAddlBelonging>) => boolean) => {
        let text = ''
        for (const qa of ha) {
          const belonging = getAddlBelonging(qa)
          if (!filterFn(belonging)) continue
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) continue
          const condText = qa.textOverride || def.text
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          text += `- ${condText}${scope}\n`
        }
        return text
      }

      const ivConds = hc.filter(qc => ivClauseId && getCondClauseId(qc) === ivClauseId)
      const hasIvSection = data.quotation.ivEnabled && (ivConds.length > 0 || selectedIvClause)

      // Merge alt-specific + null-scoped conditions, dedup by conditionId (prefer alt-specific)
      const getAltCondsResolved = (alt: typeof alts[0]) => {
        const ownConds = hc.filter(qc => qc.alternativeId === alt.id)
        const nullConds = hc.filter(qc =>
          !qc.alternativeId &&
          getCondClauseId(qc) === alt.hullClauseId &&
          !(ivClauseId && getCondClauseId(qc) === ivClauseId)
        )
        const merged = [...ownConds]
        for (const nc of nullConds) {
          if (!merged.some(c => c.hullConditionId === nc.hullConditionId)) merged.push(nc)
        }
        // Sort by condition number
        merged.sort((a, b) => {
          const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
          const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
          return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
        })
        return merged
      }

      // Build structured hull conditions data for table rendering
      type HcBlock = { title?: string; underline?: boolean; desc?: string; condPairs?: [string, string][]; addl?: string }
      const hcBlocks: HcBlock[] = []

      if (multiAlt) {
        for (let i = 0; i < alts.length; i++) {
          const alt = alts[i]
          const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
          const altConds = getAltCondsResolved(alt)
          hcBlocks.push({ title: `Alternative ${i + 1}`, underline: true, desc: clause ? (clause.description || clause.name) : undefined, condPairs: getCondPairs(altConds), addl: renderAddlForSection(b => b.type === 'alt' && b.altId === alt.id) })
        }
        const allAltsAddl = renderAddlForSection(b => b.type === 'allAlts')
        if (allAltsAddl) hcBlocks.push({ title: 'Applicable to all alternatives', underline: true, addl: allAltsAddl })
        if (hasIvSection) {
          hcBlocks.push({ title: 'Increased Value', underline: true, desc: selectedIvClause ? (selectedIvClause.description || selectedIvClause.name) : undefined, condPairs: getCondPairs(ivConds), addl: renderAddlForSection(b => b.type === 'iv') })
        }
        const bothAddl = renderAddlForSection(b => b.type === 'both')
        if (bothAddl) hcBlocks.push({ title: hasIvSection ? 'Applicable to all sections' : 'Applicable to all alternatives', underline: true, addl: bothAddl })
      } else if (hasIvSection) {
        const singleAlt = alts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        const hmClauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
        const hmConds = hc.filter(qc => hmClauseId && getCondClauseId(qc) === hmClauseId)
        hcBlocks.push({ title: 'Hull and Machinery', underline: true, desc: selectedClause ? (selectedClause.description || selectedClause.name) : undefined, condPairs: getCondPairs(hmConds), addl: renderAddlForSection(b => b.type === 'alt' || b.type === 'allAlts') })
        hcBlocks.push({ title: 'Increased Value', underline: true, desc: selectedIvClause ? (selectedIvClause.description || selectedIvClause.name) : undefined, condPairs: getCondPairs(ivConds), addl: renderAddlForSection(b => b.type === 'iv') })
        const bothAddl = renderAddlForSection(b => b.type === 'both')
        if (bothAddl) hcBlocks.push({ title: 'Applicable to both sections', underline: true, addl: bothAddl })
      } else {
        const singleAlt = alts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        let addl = ''
        for (const qa of ha) {
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) continue
          const condText = qa.textOverride || def.text
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          addl += `- ${condText}${scope}\n`
        }
        hcBlocks.push({ desc: selectedClause ? (selectedClause.description || selectedClause.name) : undefined, condPairs: getCondPairs(hc), addl })
      }

      // Render as text for sectionMap — condition pairs as sub-table rendered inline
      let hcText = ''
      for (const blk of hcBlocks) {
        if (blk.title) hcText += `${blk.title}\n\n`
        if (blk.desc) hcText += `${blk.desc}\n\n`
        if (blk.condPairs && blk.condPairs.length > 0) {
          for (const [ref, txt] of blk.condPairs) hcText += `${ref}\t${txt}\n`
          hcText += '\n'
        }
        if (blk.addl) hcText += blk.addl + '\n'
      }
      // Store blocks for PDF sub-table rendering
      ;(data as any)._hullCondBlocks = hcBlocks
      sectionMap.set('hullConditions', ['Conditions', hcText.trim()])
    }
  }

  // Sum Insured (War)
  if (data.quotation.quotationTypeCode === 'W' && data.quotation.agreedValue != null) {
    sectionMap.set('sumInsured', ['Sum Insured', formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')])
  }

  // War Conditions
  {
    const wc = data.warConditions
    if (wc.length > 0) {
      const resolveWarText = (text: string): string => {
        if (!data.warSettings) return text
        return text
          .replace(/\{jwla_code\}/g, data.warSettings.jwlaCode)
          .replace(/\{jwla_date\}/g, data.warSettings.jwlaDate)
          .replace(/\{tc_text\}/g, data.warSettings.tcText)
      }
      let wcText = ''
      for (const qc of wc) {
        const def = data.allWarConditions.find(c => c.id === qc.warConditionId)
        if (!def) continue
        const text = resolveWarText(qc.textOverride || def.text)
        const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
        wcText += `- ${text}${scope}\n`
      }
      // T&C line
      if (data.warSettings?.tcText) {
        wcText += '\n' + data.warSettings.tcText
      }
      sectionMap.set('warConditions', ['Conditions', wcText.trim()])
    }
  }

  // War Trading Warranty
  if (data.quotation.quotationTypeCode === 'W' && data.quotation.tradingWarrantyIntro) {
    sectionMap.set('warTrading', ['Trading Warranty', data.quotation.tradingWarrantyIntro])
  }

  // Trading Warranty (not for War — War uses warTrading)
  if (data.quotation.quotationTypeCode !== 'W') {
    const q = data.quotation
    let tradingText = ''
    const excCountries = data.excludedCountries.filter(c => c.listType === 'excluded')
    const ddqListStr = ddqCountries.map(c => c.name).join(', ')

    if (q.tradingWarrantyIntro) {
      tradingText += stripHtml(q.tradingWarrantyIntro) + '\n\n'
    }
    if (q.tradingCustomText) {
      tradingText += stripHtml(q.tradingCustomText) + '\n\n'
    }
    if (excCountries.length > 0) {
      tradingText += 'Excluding ' + excCountries.map(c => c.name).join(', ') + '.\n\n'
    }
    let sectionNum = 1
    if (q.tradingShowDdqList && ddqCountries.length > 0) {
      const ddqIntro = stripHtml(st(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
      const hasPh = ddqIntro.includes('{ddq_countries}')
      if (hasPh) {
        tradingText += sectionNum + ') ' + ddqIntro.replace(/\{ddq_countries\}/g, ddqListStr) + '\n\n'
      } else {
        tradingText += sectionNum + ') ' + ddqIntro + '\n\tExcluding ' + ddqListStr + '.\n\n'
      }
      sectionNum++
    }
    if (q.tradingShowDdqWarranties) {
      const intro = st(data, 'tradingConditionA')
      if (intro) tradingText += sectionNum + ') ' + stripHtml(intro) + '\n\n'
      sectionNum++
      const condKeys: (keyof PISectionTexts)[] = ['tradingConditionB', 'tradingConditionC', 'tradingConditionD', 'tradingConditionE', 'tradingConditionF', 'tradingConditionG']
      const labels = ['a)', 'b)', 'c)', 'd)', 'e)', 'f)']
      for (let i = 0; i < condKeys.length; i++) {
        const txt = st(data, condKeys[i])
        if (txt) tradingText += '   ' + labels[i] + ' ' + stripHtml(txt) + '\n'
      }
      tradingText += '\n'
    }
    if (q.tradingShowIsrael && st(data, 'tradingIsrael')) {
      tradingText += '\n' + sectionNum + ') ' + stripHtml(st(data, 'tradingIsrael')) + '\n\n'
    }
    if (tradingText.trim()) {
      sectionMap.set('trading', ['Trading Warranty', tradingText.trim()])
    }
  }

  // Warranties
  {
    const orderedWarranties = data.selectedWarrantyIds.map(id => data.allWarranties.find(w => w.id === id)).filter(Boolean)
    const sortedCustom = [...data.customWarranties].sort((a, b) => a.order - b.order)
    if (orderedWarranties.length > 0 || sortedCustom.length > 0) {
      let warText = ''
      const piMultiAltW = data.piAlternatives.length > 1

      const renderWarrantyList = (warIds: string[], customs: QuotationCustomWarranty[]) => {
        let t = ''
        for (const wid of warIds) {
          const w = data.allWarranties.find(ww => ww.id === wid)
          if (!w) continue
          const wVesselScope = data.warrantyVesselScopes[wid]
          for (const entry of resolveIacsWarranty(w.text, wVesselScope, data)) {
            t += `- ${entry.text}${vesselScopeSuffix(entry.vesselScope, data.quotationVessels)}\n`
          }
        }
        for (const cw of customs) {
          for (const entry of resolveIacsWarranty(cw.text, cw.vesselScope, data)) {
            t += `- ${entry.text}${vesselScopeSuffix(entry.vesselScope, data.quotationVessels)}\n`
          }
        }
        return t
      }

      if (piMultiAltW) {
        // Shared warranties first
        const sharedWarIds = data.selectedWarrantyIds.filter(id => !data.warrantyAltIds[id])
        const sharedCustom = sortedCustom.filter(cw => !cw.alternativeId)
        warText += renderWarrantyList(sharedWarIds, sharedCustom)
        // Per-alternative warranties
        for (const alt of data.piAlternatives) {
          const altWarIds = data.selectedWarrantyIds.filter(id => data.warrantyAltIds[id] === alt.id)
          const altCustom = sortedCustom.filter(cw => cw.alternativeId === alt.id)
          if (altWarIds.length > 0 || altCustom.length > 0) {
            warText += `\nAdditional Warranties Applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:\n`
            warText += renderWarrantyList(altWarIds, altCustom)
          }
        }
      } else {
        warText += renderWarrantyList(data.selectedWarrantyIds, sortedCustom)
      }

      if (st(data, 'warrantiesAdditionalText')) warText += '\n' + stripHtml(st(data, 'warrantiesAdditionalText')) + '\n'
      if (st(data, 'warrantiesBreach')) warText += '\n' + stripHtml(st(data, 'warrantiesBreach')) + '\n'
      if (st(data, 'warrantiesNote')) warText += '\n' + stripHtml(st(data, 'warrantiesNote'))
      sectionMap.set('warranties', ['Warranties', warText.trim()])
    }
  }

  // Deductibles
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    let dedText = ''
    const piMultiAltD = data.piAlternatives.length > 1

    const renderDedList = (deds: QuotationDeductible[]) => {
      let t = ''
      for (const d of deds) {
        const dScope = vesselScopeSuffix(d.vesselScope, data.quotationVessels)
        const mainDesc = d.description
          .replace(/\{currency\}/g, d.currency)
          .replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___')
        t += `${formatCurrency(d.amount, d.currency)}  \u2014  ${mainDesc}${dScope}\n`
        if (d.secondaryDescription) {
          const secDesc = d.secondaryDescription
            .replace(/\{currency\}/g, d.currency)
            .replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___')
          t += `${d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : ''}  \u2014  ${secDesc}\n`
        }
      }
      return t
    }

    const dedAggText = data.quotation.deductibleAggregateEnabled
      ? (data.quotation.deductibleAggregateText || (st(data, 'deductiblesAggregate') ? stripHtml(st(data, 'deductiblesAggregate')) : ''))
      : ''

    if (piMultiAltD && hasAltScoping(data.deductibles)) {
      const sharedDeds = data.deductibles.filter(d => !d.alternativeId)
      dedText += renderDedList(sharedDeds)
      if (dedAggText) dedText += '\n' + dedAggText + '\n'
      for (const alt of data.piAlternatives) {
        const altDeds = data.deductibles.filter(d => d.alternativeId === alt.id)
        if (altDeds.length > 0) {
          dedText += `\nAdditional Deductibles applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:\n`
          dedText += renderDedList(altDeds)
        }
      }
    } else {
      dedText += renderDedList(data.deductibles)
      if (dedAggText) dedText += '\n' + dedAggText + '\n'
    }

    dedText += '\n'

    if (piMultiAltD && hasAltScoping(data.textDeductibles)) {
      const sharedTds = data.textDeductibles.filter(td => !td.alternativeId)
      for (const td of sharedTds) { const tdScope = vesselScopeSuffix(td.vesselScope, data.quotationVessels); dedText += '\n' + td.text + tdScope + '\n\n' }
      for (const alt of data.piAlternatives) {
        const altTds = data.textDeductibles.filter(td => td.alternativeId === alt.id)
        if (altTds.length > 0) {
          dedText += `Applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:\n`
          for (const td of altTds) { const tdScope = vesselScopeSuffix(td.vesselScope, data.quotationVessels); dedText += td.text + tdScope + '\n\n' }
        }
      }
    } else {
      for (const td of data.textDeductibles) { const tdScope = vesselScopeSuffix(td.vesselScope, data.quotationVessels); dedText += '\n' + td.text + tdScope + '\n\n' }
    }

    if (st(data, 'deductiblesAdditionalText')) dedText += '\n' + stripHtml(st(data, 'deductiblesAdditionalText')) + '\n\n'
    sectionMap.set('deductibles', ['Deductibles', dedText.trim()])
  }

  // Exclusions
  if (exclusionTexts.length > 0) {
    const piMultiAltE = data.piAlternatives.length > 1
    const hasExclAltScoping = piMultiAltE && (data.selectedExclusions.some(e => e.alternativeId) || data.customExclusions.some(e => e.alternativeId))

    if (hasExclAltScoping) {
      let exclText = ''
      // Build text per exclusion item with alternativeId
      const allExclItems: { text: string; altId: string | null }[] = []
      for (const se of data.selectedExclusions) {
        const eScope = vesselScopeSuffix(se.vesselScope, data.quotationVessels)
        const t = se.customText ? se.customText + eScope : (se.piExclusionId ? ((data.allExclusions.find(e => e.id === se.piExclusionId)?.text || '') + eScope) : '')
        if (t) allExclItems.push({ text: t, altId: se.alternativeId || null })
      }
      for (const ce of data.customExclusions) {
        const ceScope = vesselScopeSuffix(ce.vesselScope, data.quotationVessels)
        allExclItems.push({ text: ce.text + ceScope, altId: ce.alternativeId || null })
      }

      const shared = allExclItems.filter(e => !e.altId)
      exclText += shared.map(e => `- ${e.text}`).join('\n')

      for (const alt of data.piAlternatives) {
        const altItems = allExclItems.filter(e => e.altId === alt.id)
        if (altItems.length > 0) {
          exclText += `\n\nApplicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:\n`
          exclText += altItems.map(e => `- ${e.text}`).join('\n')
        }
      }
      sectionMap.set('exclusions', ['Exclusions', exclText.trim()])
    } else {
      sectionMap.set('exclusions', ['Exclusions', exclusionTexts.map(t => `- ${t}`).join('\n')])
    }
  }

  // Sanctions
  {
    const sanctionsText = getSanctionsText(data)
    if (sanctionsText) {
      sectionMap.set('sanctions', ['Sanction Limitation\nand Exclusion Clause', stripHtml(sanctionsText)])
    }
  }

  // Subjectivities
  if (data.subjectivities.length > 0) {
    let subjText = ''
    if (st(data, 'subjectivitiesIntro')) subjText += stripHtml(st(data, 'subjectivitiesIntro')) + '\n\n'
    for (const s of data.subjectivities) { const sScope = vesselScopeSuffix(s.vesselScope, data.quotationVessels); subjText += `- ${s.text}${sScope}\n` }
    if (st(data, 'subjectivitiesNote')) subjText += '\n' + stripHtml(st(data, 'subjectivitiesNote'))
    sectionMap.set('subjectivities', ['Subjectivities', subjText.trim()])
  }

  // Premium
  {
    let premText = ''
    const q = data.quotation
    const hasDiscount = q.ncbEnabled || q.upccEnabled
    const ncbType = q.ncbDiscountType || 'percentage'
    const ncbPct = q.ncbDiscountPercent || 0
    const ncbFixedAmt = q.ncbDiscountAmount || 0
    const upccType = q.upccDiscountType || 'percentage'
    const upccPct = q.upccDiscountPercent || 0
    const upccFixedAmt = q.upccDiscountAmount || 0
    // Compute payable given a technical premium
    const computePayable = (tech: number) => {
      const ncbDed = ncbType === 'amount' ? ncbFixedAmt : tech * ncbPct / 100
      const afterNcb = tech - ncbDed
      const upccDed = upccType === 'amount' ? upccFixedAmt : afterNcb * upccPct / 100
      return afterNcb - upccDed
    }
    const isMultiVessel = data.quotationVessels.length >= 2
    const hasVesselPremiums = isMultiVessel && data.quotationVessels.some(v => v.premiumAmount)

    // Build premium line items
    type PDFPremLine = { label: string; tech: number }
    const pdfPremLines: PDFPremLine[] = []
    const hullMultiAlt = data.hullAlternatives.length > 1
    const piMultiAltPrem = data.piAlternatives.length > 1

    if (hasVesselPremiums) {
      for (const v of data.quotationVessels) {
        pdfPremLines.push({ label: (v.name || v.vesselLabel).toUpperCase(), tech: v.premiumAmount || 0 })
      }
    } else if (piMultiAltPrem) {
      for (let ai = 0; ai < data.piAlternatives.length; ai++) {
        const alt = data.piAlternatives[ai]
        pdfPremLines.push({ label: alt.label || `Alternative ${ai + 1}`, tech: alt.premiumAmount || 0 })
      }
    } else if (q.premiumAmount != null || hullMultiAlt) {
      if (hullMultiAlt) {
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
          pdfPremLines.push({ label: `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`, tech: alt.premiumAmount || 0 })
        }
        if (q.ivEnabled && q.ivPremiumAmount != null) pdfPremLines.push({ label: 'IV', tech: q.ivPremiumAmount })
      } else if (q.ivEnabled) {
        pdfPremLines.push({ label: 'Section A', tech: q.premiumAmount || 0 })
        if (q.ivPremiumAmount != null) pdfPremLines.push({ label: 'Section B', tech: q.ivPremiumAmount })
      } else {
        pdfPremLines.push({ label: '', tech: q.premiumAmount || 0 })
      }
    }

    const useTable = pdfPremLines.length > 1 || (pdfPremLines.length === 1 && hasDiscount)
    if (useTable) {
      const fc = (n: number) => formatCurrency(n, q.premiumCurrency)
      const pa = ' per annum'
      if (hasDiscount) {
        if (pdfPremLines.length > 1) premText += 'Technical Premium\n'
        for (const l of pdfPremLines) {
          premText += `${l.label || 'Technical Premium'}:  ${fc(l.tech)}${pa}\n`
        }
        if (hasVesselPremiums) {
          const totalTech = pdfPremLines.reduce((s, l) => s + l.tech, 0)
          premText += `Total:  ${fc(totalTech)}${pa}\n`
        }
        premText += '\n'
        if (pdfPremLines.length > 1) premText += 'Payable Premium\n'
        for (const l of pdfPremLines) {
          premText += `${l.label || 'Payable Premium'}:  ${fc(computePayable(l.tech))}${pa}\n`
        }
        if (hasVesselPremiums) {
          const totalPayable = computePayable(pdfPremLines.reduce((s, l) => s + l.tech, 0))
          premText += `Total:  ${fc(totalPayable)}${pa}\n`
        }
      } else {
        for (const l of pdfPremLines) {
          premText += `${l.label}:  ${fc(l.tech)}${pa}\n`
        }
        if (hasVesselPremiums) {
          const totalTech = pdfPremLines.reduce((s, l) => s + l.tech, 0)
          premText += `Total:  ${fc(totalTech)}${pa}\n`
        }
      }
      premText += '\n'
    } else if (pdfPremLines.length === 1) {
      premText += `${formatCurrency(pdfPremLines[0].tech, q.premiumCurrency)} per annum\n\n`
    }
    const numInst = q.numInstalments || 1
    const firstInstDays = data.instalments.length > 0 ? data.instalments[0].daysFromInception : 0
    const singleTiming = firstInstDays === 0 ? 'at inception' : `within ${firstInstDays} days of inception`
    if (numInst === 1 && st(data, 'premiumPaymentIntroSingle')) {
      premText += stripHtml(st(data, 'premiumPaymentIntroSingle')).replace(/\{timing\}/g, singleTiming) + '\n\n'
      // Non-refundable sentence right after for single instalment
      if (q.nonRefundableType) {
        let nrText = ''
        if (q.nonRefundableType === 'first_instalment') {
          nrText = st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.'
        } else if (q.nonRefundableType === 'percentage' && q.nonRefundablePercent) {
          nrText = (st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(q.nonRefundablePercent!))
        }
        if (nrText) premText += nrText + '\n\n'
      }
    } else {
      if (st(data, 'premiumPaymentIntro')) {
        premText += stripHtml(st(data, 'premiumPaymentIntro')).replace('{instalments}', String(numInst)) + '\n\n'
      }
      for (const inst of data.instalments) {
        const timing = inst.daysFromInception === 0 ? 'prior inception' : `within ${inst.daysFromInception} days of inception`
        let instLine = `${ordinal(inst.instalmentNumber)} Instalment ${timing}`
        if (inst.instalmentNumber === 1 && q.nonRefundableType) {
          let nrText = ''
          if (q.nonRefundableType === 'first_instalment') {
            nrText = st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.'
          } else if (q.nonRefundableType === 'percentage' && q.nonRefundablePercent) {
            nrText = (st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(q.nonRefundablePercent!))
          }
          if (nrText) instLine += ' \u2014 ' + nrText
        }
        premText += instLine + '\n'
      }
      if (data.instalments.length > 0) premText += '\n'
    }
    if (st(data, 'premiumCondition')) premText += stripHtml(st(data, 'premiumCondition')) + '\n\n'
    if (st(data, 'premiumEarned')) premText += stripHtml(st(data, 'premiumEarned')) + '\n\n'
    if (q.premiumAdditionalText) premText += stripHtml(q.premiumAdditionalText)
    sectionMap.set('premium', ['Premium Payment\nCondition Precedent', premText.trim()])

    // NCB as separate section
    if (q.ncbEnabled) {
      const techPrem = q.premiumAmount || 0
      const ncbAmt = ncbType === 'amount' ? ncbFixedAmt : techPrem * ncbPct / 100
      const ncbAmtStr = formatCurrency(ncbAmt, q.premiumCurrency)
      const ncbPctStr = `${ncbPct}%`
      const ncbDisplay = ncbType === 'amount' ? ncbAmtStr : ncbPctStr
      let ncbText = ''
      if (q.ncbText) ncbText = stripHtml(q.ncbText).replace(/\{ncb_amount\}/g, ncbDisplay).replace(/\{ncb_percent\}/g, ncbPctStr)
      sectionMap.set('ncb', ['No Claims Bonus\n(NCB)', ncbText.trim()])
    }

    // UPCC as separate section
    if (q.upccEnabled) {
      const afterNcbPrem = (q.premiumAmount || 0) - (ncbType === 'amount' ? ncbFixedAmt : (q.premiumAmount || 0) * ncbPct / 100)
      const upccAmt = upccType === 'amount' ? upccFixedAmt : afterNcbPrem * upccPct / 100
      const upccAmtStr = formatCurrency(upccAmt, q.premiumCurrency)
      const upccPctStr = `${upccPct}%`
      const upccDisplay = upccType === 'amount' ? upccAmtStr : upccPctStr
      let upccText = ''
      if (q.upccText) upccText = stripHtml(q.upccText).replace(/\{upcc_amount\}/g, upccDisplay).replace(/\{upcc_percent\}/g, upccPctStr)
      sectionMap.set('upcc', ['Upfront Continuity\n(UPCC)', upccText.trim()])
    }
  }

  // Information
  {
    let infoText = ''
    if (data.quotation.validityDays) infoText += `- Quote open for ${data.quotation.validityDays} days\n`
    for (const info of data.information) { infoText += `- ${info.text}\n` }
    sectionMap.set('information', ['Information', infoText.trim() || '-'])
  }

  // Custom sections
  for (const cs of data.customSections) {
    const text = cs.text ? stripHtml(cs.text) : ''
    if (text || cs.title) sectionMap.set(`custom:${cs.id}`, [cs.title, text])
  }

  // Resolve section order and build final sections array
  const sectionOrder = await resolveSectionOrder(data)
  const sections: [string, string][] = []
  for (const key of sectionOrder) {
    const entry = sectionMap.get(key)
    if (entry) sections.push(entry)
  }
  // Append any sections not in the order (safety net)
  for (const [key, entry] of sectionMap) {
    if (!sectionOrder.includes(key)) sections.push(entry)
  }

  // Find hull conditions row for special rendering
  const hullCondBlocks: any[] = (data as any)._hullCondBlocks || []
  const hullCondRowIdx = sections.findIndex(s => s[0] === 'Conditions' && hullCondBlocks.length > 0)

  // Render main two-column table
  const premiumRowIdx = sections.findIndex(s => s[0].startsWith('Premium'))
  autoTable(doc, {
    startY: startY + 26,
    body: sections,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 36, valign: 'top' as any },
      1: { valign: 'top' as any }
    },
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: { top: 5, right: 5, bottom: 9, left: 5 }, lineColor: [0, 0, 0], lineWidth: 0.25, overflow: 'linebreak', textColor: [0, 0, 0], font: 'helvetica' },
    margin: { left: margin, right: margin },
    didParseCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.column.index === 1 && hookData.row.index === premiumRowIdx) {
        hookData.cell.styles.fontStyle = 'bold'
      }
      // Bold + underline section titles in hull conditions cell
      if (hookData.section === 'body' && hookData.column.index === 1 && hookData.row.index === hullCondRowIdx && hullCondBlocks.length > 0) {
        // Will be handled by didDrawCell
      }
    },
    didDrawCell: (hookData: any) => {
      if (hookData.section !== 'body' || hookData.column.index !== 1 || hookData.row.index !== hullCondRowIdx || hullCondBlocks.length === 0) return
      // Draw hull conditions with sub-tables over the cell content
      const cellX = hookData.cell.x + hookData.cell.padding('left')
      const cellW = hookData.cell.width - hookData.cell.padding('left') - hookData.cell.padding('right')
      let cy = hookData.cell.y + hookData.cell.padding('top')
      const col1W = cellW * 0.30
      const col2W = cellW * 0.70

      // Clear existing text by drawing a white rect
      doc.setFillColor(255, 255, 255)
      doc.rect(hookData.cell.x + 0.25, hookData.cell.y + 0.25, hookData.cell.width - 0.5, hookData.cell.height - 0.5, 'F')

      doc.setTextColor(0, 0, 0)

      for (const blk of hullCondBlocks) {
        // Title (bold + underline)
        if (blk.title) {
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.text(blk.title, cellX, cy + 4)
          // Underline
          const tw = doc.getTextWidth(blk.title)
          doc.setLineWidth(0.3)
          doc.setDrawColor(0, 0, 0)
          doc.line(cellX, cy + 5, cellX + tw, cy + 5)
          cy += 9
        }
        // Description
        if (blk.desc) {
          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')
          const descLines = doc.splitTextToSize(blk.desc, cellW)
          for (const dl of descLines) {
            doc.text(dl, cellX, cy + 4)
            cy += 5
          }
          cy += 3
        }
        // Condition pairs as mini table
        if (blk.condPairs && blk.condPairs.length > 0) {
          doc.setFontSize(10)
          doc.setFont('helvetica', 'normal')
          for (const [ref, txt] of blk.condPairs) {
            const txtLines = doc.splitTextToSize(txt, col2W - 2)
            doc.text(ref, cellX, cy + 4)
            for (let li = 0; li < txtLines.length; li++) {
              doc.text(txtLines[li], cellX + col1W, cy + 4 + li * 4.5)
            }
            cy += Math.max(1, txtLines.length) * 4.5 + 1
          }
          cy += 2
        }
        // Additional conditions
        if (blk.addl) {
          doc.setFontSize(11)
          doc.setFont('helvetica', 'normal')
          const addlLines = doc.splitTextToSize(blk.addl.trim(), cellW)
          for (const al of addlLines) {
            doc.text(al, cellX, cy + 4)
            cy += 5
          }
          cy += 2
        }
      }
    }
  })

  let y = (doc as any).lastAutoTable.finalY + 8

  // After-table: informationNote
  const addWrappedText = (text: string, bold = false, centered = false) => {
    if (!text) return
    const plainText = stripHtml(text)
    doc.setFontSize(11)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setTextColor(0, 0, 0)
    const lines = doc.splitTextToSize(plainText, pageWidth - margin * 2)
    for (const line of lines) {
      if (y + 6 > 280) { doc.addPage(); y = 20 }
      if (centered) {
        doc.text(line, pageWidth / 2, y, { align: 'center' })
      } else {
        doc.text(line, margin, y)
      }
      y += 5.5
    }
    y += 3
  }

  if (st(data, 'informationNote')) addWrappedText(st(data, 'informationNote'))

  // Important Notice - centered
  if (st(data, 'importantNotice')) {
    const notice = st(data, 'importantNotice')
    const plainNotice = stripHtml(notice)
    if (plainNotice.startsWith('IMPORTANT NOTICE')) {
      addWrappedText('IMPORTANT NOTICE', true, true)
      addWrappedText(plainNotice.replace(/^IMPORTANT NOTICE\n*/, ''), false, true)
    } else {
      addWrappedText(notice, false, true)
    }
  }

  // Notes
  for (const note of data.notes) {
    addWrappedText(note.title, true)
    if (note.content) addWrappedText(note.content)
  }

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 150, 150)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: 'center' })
  }

  doc.save(getFileName(data, 'pdf'))
}

// ==================== Word Export ====================

export async function exportQuotationToWord(quotation: Quotation): Promise<void> {
  const data = await gatherData(quotation)
  const vName = vesselName(data)
  const selectedClauses = data.allClauses.filter(c => data.selectedClauseIds.includes(c.id))
  void data.selectedWarrantyIds // warranties resolved in renderWarBullets
  const sortedWordCustom = [...data.customWarranties].sort((a, b) => a.order - b.order)
  const ddqCountries = data.excludedCountries.filter(c => c.listType === 'ddq')
  const exclusionTexts = getExclusionTexts(data)
  const dateStr = data.quotation.quotationDate
    ? new Date(data.quotation.quotationDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  // Paragraph helpers - 11pt Arial black, line spacing 1.0
  const np = (text: string) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })

  const bp = (text: string) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true })]
  })
  const bup = (text: string) => new Paragraph({
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true, underline: {} })]
  })

  const bulletP = (text: string) => new Paragraph({
    numbering: { reference: 'dash-bullet', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 40, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })

  const emptyP = () => new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [] })

  const mp = (text: string): Paragraph[] => {
    if (!text) return []
    if (isHtml(text)) return parseHtmlToParagraphs(text, { size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
    return text.split('\n').map(p =>
      p.trim() ? np(p) : emptyP()
    )
  }

  // Border helpers for main table
  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  const thinBorders = () => ({ top: thin, bottom: thin, left: thin, right: thin })

  function makeRow(title: string, content: (Paragraph | Table)[]): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: TITLE_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: title, bold: true, size: 22, font: 'Arial', color: '000000' })]
          })]
        }),
        new TableCell({
          width: { size: BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [...(content.length > 0 ? content : [emptyP()]), emptyP()]
        })
      ]
    })
  }

  // Build rows into a map keyed by section ID for dynamic ordering
  const rowMap = new Map<string, TableRow>()

  // ---- Insured ----
  {
    const insuredContent: (Paragraph | Table)[] = []
    if (data.assureds.length > 0) {
      const wordHasVesselLabels = data.quotationVessels.length > 1 && data.assureds.some(a => a.vesselLabel)
      const wordSeenLabels = new Set<string>()
      insuredContent.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.AUTOFIT,
        rows: data.assureds.map(a => {
          const labelKey = a.vesselLabel || ''
          const isFirstOfLabel = !wordSeenLabels.has(labelKey)
          wordSeenLabels.add(labelKey)
          return new TableRow({
            children: [
              ...(wordHasVesselLabels ? [new TableCell({
                borders: noBorders(),
                width: { size: 0, type: WidthType.AUTO },
                children: [new Paragraph({ children: [new TextRun({ text: isFirstOfLabel ? labelKey : '', size: 22, font: 'Arial', color: '000000', bold: true })] })]
              })] : []),
              new TableCell({
                borders: noBorders(),
                width: { size: 0, type: WidthType.AUTO },
                children: [new Paragraph({ children: [new TextRun({ text: a.name, size: 22, font: 'Arial', color: '000000' })] })]
              }),
              new TableCell({
                borders: noBorders(),
                width: { size: 0, type: WidthType.AUTO },
                children: [new Paragraph({ children: [new TextRun({ text: a.role ? `"as ${a.role}"` : '', size: 22, font: 'Arial', color: '000000' })] })]
              })
            ]
          })
        })
      }))
    }
    if (st(data, 'insuredFooter')) {
      insuredContent.push(emptyP())
      insuredContent.push(...mp(st(data, 'insuredFooter')))
    }
    const wordCoName = data.quotation.coName || getBrokerName(data)
    if (wordCoName) {
      insuredContent.push(emptyP())
      insuredContent.push(np(`c/o ${wordCoName}`))
    }
    rowMap.set('insured', makeRow('Insured', insuredContent))
  }

  // ---- Insured Vessel ----
  if (data.quotationVessels.length > 0) {
    const showVesselLabel = data.quotationVessels.length > 1
    const makeVCell = (text: string, header = false) => new TableCell({
      width: { size: 0, type: WidthType.AUTO },
      children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: 20, font: 'Arial', color: '000000' })] })],
      ...(header ? { shading: { type: ShadingType.SOLID, color: 'F0F0F0' } } : {})
    })
    const vesselHeaders = showVesselLabel
      ? ['', 'Name', 'IMO', 'Built', 'GT', 'Flag', 'Type', 'Class']
      : ['Name', 'IMO', 'Built', 'GT', 'Flag', 'Type', 'Class']
    const vesselTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.AUTOFIT,
      rows: [
        new TableRow({
          tableHeader: true,
          children: vesselHeaders.map(h => makeVCell(h, true))
        }),
        ...data.quotationVessels.map(qv => {
          const vi = getVesselInfo(qv, data.allVessels)
          const cells = showVesselLabel
            ? [qv.vesselLabel, vi.name, vi.imo || '-', vi.built ? String(vi.built) : '-', vi.gt ? Number(vi.gt).toLocaleString() : '-', vi.flag || '-', vi.type || '-', vi.classification || '-']
            : [vi.name, vi.imo || '-', vi.built ? String(vi.built) : '-', vi.gt ? Number(vi.gt).toLocaleString() : '-', vi.flag || '-', vi.type || '-', vi.classification || '-']
          return new TableRow({ children: cells.map(v => makeVCell(v)) })
        })
      ]
    })
    rowMap.set('vessel', makeRow('Insured Vessel', [vesselTable]))
  }

  // ---- Limit of Liability ----
  {
    const liabContent: (Paragraph | Table)[] = []
    const resolveSlText = (sl: typeof data.subLimits[0]) =>
      sl.text.replace('{amount}', formatAmountOnly(sl.amount)).replace('{currency}', sl.currency || 'USD')
    const slPara = (text: string) => new Paragraph({
      spacing: { after: 0, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
    })
    const wordSubLimitParas: Paragraph[] = data.subLimits.map(sl => slPara(resolveSlText(sl)))
    const injectSubLimits = (rawText: string): (Paragraph | Table)[] => {
      if (!rawText.includes('{sub_limits}')) return mp(rawText)
      const parts = rawText.split('{sub_limits}')
      const out: (Paragraph | Table)[] = []
      if (parts[0]?.trim()) out.push(...mp(parts[0].trim()))
      out.push(...wordSubLimitParas)
      out.push(emptyP())
      if (parts[1]?.trim()) out.push(...mp(parts[1].trim()))
      return out
    }
    if (data.quotation.limitOfLiabilityText) {
      liabContent.push(...injectSubLimits(data.quotation.limitOfLiabilityText))
    } else if (st(data, 'limitOfLiabilityDefaultText') && data.quotation.limitOfLiabilityAmount != null) {
      const lolText = st(data, 'limitOfLiabilityDefaultText')
        .replace('{amount}', formatAmountOnly(data.quotation.limitOfLiabilityAmount))
        .replace('{currency}', data.quotation.limitOfLiabilityCurrency || 'USD')
      liabContent.push(...injectSubLimits(lolText))
    } else if (data.quotation.limitOfLiabilityAmount != null) {
      liabContent.push(np(`${formatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency)} all claims in the aggregate.`))
    }
    const lolRawHasPlaceholder = (data.quotation.limitOfLiabilityText || st(data, 'limitOfLiabilityDefaultText') || '').includes('{sub_limits}')
    if (!lolRawHasPlaceholder && wordSubLimitParas.length > 0) {
      liabContent.push(...wordSubLimitParas)
      liabContent.push(emptyP())
      liabContent.push(np('Under no circumstances is the Combined Single Limit detailed above to be exceeded.'))
    }
    if (liabContent.length > 0) rowMap.set('liability', makeRow('Limit of Liability', liabContent))
  }

  // ---- Period ----
  if (data.quotation.periodText) {
    rowMap.set('period', makeRow('Period', mp(data.quotation.periodText)))
  }

  // ---- Conditions ----
  if (selectedClauses.length > 0 || data.additionalClauses.length > 0) {
    const condContent: (Paragraph | Table)[] = []
    if (st(data, 'conditionsIntro')) condContent.push(...mp(st(data, 'conditionsIntro')))

    const clauseRefW = Math.round(BODY_W * 0.32)
    const clauseDescW = BODY_W - clauseRefW

    const makeClauseTable = (clauses: PIClause[], altId?: string | null) => new Table({
      width: { size: BODY_W, type: WidthType.DXA },
      columnWidths: [clauseRefW, clauseDescW],
      layout: TableLayoutType.FIXED,
      rows: clauses.map(c => {
        const desc = (altId ? data.clauseOverrides[`${c.id}::${altId}`] : undefined) || data.clauseOverrides[c.id] || c.description
        const clauseDesc = desc ? ` \u2013 ${desc}` : ''
        const displayName = stripClauseRef(c.name || '')
        const cScope = vesselScopeSuffix(data.clauseVesselScopes[c.id], data.quotationVessels)
        const rightText = (displayName ? `${displayName}${clauseDesc}` : (desc || '')) + cScope
        return new TableRow({
          children: [
            new TableCell({ width: { size: clauseRefW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: `Section B Cl.${c.clauseNumber}`, size: 22, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: clauseDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: rightText, size: 22, font: 'Arial', color: '000000' })] })] })
          ]
        })
      })
    })

    const makeAddlBullets = (addls: typeof data.additionalClauses): Paragraph[] => {
      return addls.map(ac => {
        const def = data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        const acScope = vesselScopeSuffix(ac.vesselScope, data.quotationVessels)
        if (!text) return null
        return new Paragraph({
          numbering: { reference: 'dash-bullet', level: 0 },
          spacing: { after: 40 },
          children: [
            ...(code ? [new TextRun({ text: code + ' ', size: 22, font: 'Arial', color: '000000' })] : []),
            new TextRun({ text: text + acScope, size: 22, font: 'Arial', color: '000000' })
          ]
        })
      }).filter(Boolean) as Paragraph[]
    }

    const dPiMultiAlt = data.piAlternatives.length > 1

    if (dPiMultiAlt) {
      // Per-alternative clauses — shared clauses appear under each alternative
      const dSharedClauseIds = selectedClauses.filter(c => (data.clauseAltIds[c.id] || []).includes(null)).map(c => c.id)
      for (const alt of data.piAlternatives) {
        const altIdx = data.piAlternatives.indexOf(alt)
        const altClauseIds = selectedClauses.filter(c => (data.clauseAltIds[c.id] || []).includes(alt.id)).map(c => c.id)
        const combinedIds = [...new Set([...altClauseIds, ...dSharedClauseIds])]
        const combinedClauses = combinedIds.map(id => data.allClauses.find(c => c.id === id)).filter(Boolean) as PIClause[]
        if (combinedClauses.length > 0) {
          condContent.push(bup(`Alternative ${altIdx + 1}:`))
          condContent.push(makeClauseTable(combinedClauses, alt.id))
          condContent.push(emptyP())
        }
      }
      // Additional clauses grouped by alternative
      const dScopedAddls = data.additionalClauses.filter(ac => ac.alternativeId)
      const dSharedAddls = data.additionalClauses.filter(ac => !ac.alternativeId)
      if (dScopedAddls.length > 0) {
        for (const alt of data.piAlternatives) {
          const altAddls = dScopedAddls.filter(ac => ac.alternativeId === alt.id)
          if (altAddls.length > 0) {
            condContent.push(bup(`Applicable to Alternative ${data.piAlternatives.indexOf(alt) + 1}:`))
            condContent.push(...makeAddlBullets(altAddls))
            condContent.push(emptyP())
          }
        }
      }
      if (dSharedAddls.length > 0) {
        condContent.push(bup('Applicable to both alternatives:'))
        condContent.push(...makeAddlBullets(dSharedAddls))
      }
    } else {
      if (selectedClauses.length > 0) condContent.push(makeClauseTable(selectedClauses))
      if (data.additionalClauses.length > 0) {
        condContent.push(emptyP())
        condContent.push(...makeAddlBullets(data.additionalClauses))
      }
    }
    rowMap.set('conditions', makeRow('Conditions', condContent))
  }

  // ---- Agreed Value / Interest (Hull only — War uses sumInsured) ----
  if (data.quotation.quotationTypeCode !== 'W') {
    const avItems = data.hullAgreedValueItems
    const dHasHm = data.quotation.agreedValue != null
    const dHasIv = data.quotation.ivEnabled && data.quotation.ivValue != null

    if (dHasIv) {
      // Interest section — A) H&M texts, B) IV texts (labels as bullets)
      const dHmItems = avItems.filter(it => (it.section || 'hm') === 'hm')
      const dIvItems = avItems.filter(it => it.section === 'iv')
      if (dHmItems.length > 0 || dIvItems.length > 0) {
        const intContent: Paragraph[] = []
        if (dHmItems.length > 0) {
          const hmText = dHmItems.map(it => it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels)).join('\n')
          intContent.push(np('A) ' + hmText))
        }
        if (dIvItems.length > 0) {
          const ivText = dIvItems.map(it => it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels)).join('\n')
          intContent.push(np('B) ' + ivText))
        }
        rowMap.set('interest', makeRow('Interest', intContent))
      }
      // Agreed Insured Value — amounts only for IV
      const avContent: Paragraph[] = []
      if (dHasHm) avContent.push(np(`Section A: ${formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')}`))
      avContent.push(np(`Section B: ${formatCurrency(data.quotation.ivValue, data.quotation.ivCurrency || 'USD')}`))
      rowMap.set('agreedValue', makeRow('Agreed Insured Value', avContent))
    } else if (avItems.length > 0 || dHasHm) {
      // Standard agreed value — value not bold, spacing between value and texts
      const avContent: Paragraph[] = []
      if (dHasHm) {
        avContent.push(np(formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')))
        avContent.push(emptyP())
      }
      for (const it of avItems) {
        avContent.push(np(it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels)))
      }
      rowMap.set('agreedValue', makeRow('Agreed Insured Value', avContent))
    }
  }

  // ---- Hull Conditions ----
  {
    const hc = data.hullConditions
    const ha = data.hullAdditionalConditions
    const dAlts = data.hullAlternatives
    if (hc.length > 0 || ha.length > 0) {
      const hcContent: (Paragraph | Table)[] = []
      const condTableW = BODY_W
      const condCol1W = Math.round(condTableW * 0.30)
      const condCol2W = condTableW - condCol1W
      const noBordersObj = () => ({ top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } })
      const dIvClauseId = data.quotation.ivClauseId
      const dSelectedIvClause = dIvClauseId ? data.hullClauses.find(c => c.id === dIvClauseId) : null
      const dMultiAlt = dAlts.length > 1

      // Resolve amount: check the condition itself, then any sibling with the same conditionId
      const dResolveAmount = (qc: typeof hc[0]): number | null | undefined => {
        if (qc.amount != null) return qc.amount
        const sibling = hc.find(c => c.hullConditionId === qc.hullConditionId && c.id !== qc.id && c.amount != null)
        return sibling?.amount
      }

      const makeCondTable = (conds: typeof hc) => new Table({
        width: { size: condTableW, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [condCol1W, condCol2W],
        rows: conds.map(qc => {
          const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
          if (!def) return null
          let text = qc.textOverride || def.text
          const amount = dResolveAmount(qc)
          if (def.hasAmount && def.amountPlaceholder && amount != null) {
            const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            text = text.replace(new RegExp(escaped, 'g'), formatCurrency(amount, data.quotation.premiumCurrency || 'USD'))
          }
          const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
          return new TableRow({
            children: [
              new TableCell({ width: { size: condCol1W, type: WidthType.DXA }, borders: noBordersObj(), children: [new Paragraph({ children: [new TextRun({ text: `Cl. ${def.conditionNumber}`, size: 22, font: 'Arial', color: '000000' })] })] }),
              new TableCell({ width: { size: condCol2W, type: WidthType.DXA }, borders: noBordersObj(), children: [new Paragraph({ children: [new TextRun({ text: text + scope, size: 22, font: 'Arial', color: '000000' })] })] })
            ]
          })
        }).filter(Boolean) as TableRow[]
      })

      const dGetCondClauseId = (qc: typeof hc[0]) => {
        const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
        return def?.hullClauseId || ''
      }

      const dAddlBullet = (condText: string) => new Paragraph({
        numbering: { reference: 'dash-bullet', level: 0 },
        spacing: { after: 40 },
        children: [new TextRun({ text: condText, size: 22, font: 'Arial', color: '000000' })]
      })

      // Determine where each additional condition belongs
      const dGetAddlBelonging = (qa: typeof ha[0]): { type: 'alt'; altId: string } | { type: 'allAlts' } | { type: 'iv' } | { type: 'both' } => {
        const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
        if (!def) return { type: 'both' }
        const ids = def.hullClauseIds || []
        if (ids.length === 0) return { type: 'both' }
        const matchedAlts = dAlts.filter(a => ids.includes(a.hullClauseId))
        const matchesIv = dIvClauseId && ids.includes(dIvClauseId)
        if (matchedAlts.length === dAlts.length && matchesIv) return { type: 'both' }
        if (matchedAlts.length === dAlts.length && !matchesIv) return dMultiAlt ? { type: 'allAlts' } : { type: 'both' }
        if (matchedAlts.length === 0 && matchesIv) return { type: 'iv' }
        if (matchedAlts.length === 0 && !matchesIv) return { type: 'both' }
        if (matchedAlts.length === 1) return { type: 'alt', altId: matchedAlts[0].id }
        return { type: 'allAlts' }
      }

      const dRenderAddlForSection = (filterFn: (b: ReturnType<typeof dGetAddlBelonging>) => boolean) => {
        const paras: Paragraph[] = []
        for (const qa of ha) {
          const belonging = dGetAddlBelonging(qa)
          if (!filterFn(belonging)) continue
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) continue
          const condText = qa.textOverride || def.text
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          paras.push(dAddlBullet(condText + scope))
        }
        return paras
      }

      const dIvConds = hc.filter(qc => dIvClauseId && dGetCondClauseId(qc) === dIvClauseId)
      const dHasIvSection = data.quotation.ivEnabled && (dIvConds.length > 0 || dSelectedIvClause)

      // Merge alt-specific + null-scoped conditions, dedup by conditionId (prefer alt-specific)
      const dGetAltCondsResolved = (alt: typeof dAlts[0]) => {
        const ownConds = hc.filter(qc => qc.alternativeId === alt.id)
        const nullConds = hc.filter(qc =>
          !qc.alternativeId &&
          dGetCondClauseId(qc) === alt.hullClauseId &&
          !(dIvClauseId && dGetCondClauseId(qc) === dIvClauseId)
        )
        const merged = [...ownConds]
        for (const nc of nullConds) {
          if (!merged.some(c => c.hullConditionId === nc.hullConditionId)) merged.push(nc)
        }
        merged.sort((a, b) => {
          const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
          const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
          return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
        })
        return merged
      }

      if (dMultiAlt) {
        // Multiple alternatives
        for (let i = 0; i < dAlts.length; i++) {
          const alt = dAlts[i]
          const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
          const altConds = dGetAltCondsResolved(alt)
          hcContent.push(bup(`Alternative ${i + 1}`))
          hcContent.push(emptyP())
          if (clause) { hcContent.push(np(clause.description || clause.name)); hcContent.push(emptyP()) }
          if (altConds.length > 0) hcContent.push(makeCondTable(altConds))
          const altAddl = dRenderAddlForSection(b => b.type === 'alt' && b.altId === alt.id)
          if (altAddl.length > 0) { hcContent.push(emptyP()); hcContent.push(...altAddl) }
          hcContent.push(emptyP())
        }

        // Applicable to all alternatives
        const allAltsAddl = dRenderAddlForSection(b => b.type === 'allAlts')
        if (allAltsAddl.length > 0) {
          hcContent.push(bup('Applicable to all alternatives'))
          hcContent.push(emptyP())
          hcContent.push(...allAltsAddl)
          hcContent.push(emptyP())
        }

        // IV section
        if (dHasIvSection) {
          if (dSelectedIvClause) {
            hcContent.push(bup('Increased Value'))
            hcContent.push(emptyP())
            hcContent.push(np(dSelectedIvClause.description || dSelectedIvClause.name))
            hcContent.push(emptyP())
          } else {
            hcContent.push(bup('Increased Value'))
            hcContent.push(emptyP())
          }
          if (dIvConds.length > 0) hcContent.push(makeCondTable(dIvConds))
          const dIvAddl = dRenderAddlForSection(b => b.type === 'iv')
          if (dIvAddl.length > 0) { hcContent.push(emptyP()); hcContent.push(...dIvAddl) }
          hcContent.push(emptyP())
        }

        // Applicable to all sections
        const dBothAddl = dRenderAddlForSection(b => b.type === 'both')
        if (dBothAddl.length > 0) {
          hcContent.push(bup(dHasIvSection ? 'Applicable to all sections' : 'Applicable to all alternatives'))
          hcContent.push(emptyP())
          hcContent.push(...dBothAddl)
        }
      } else if (dHasIvSection) {
        // Single alternative with IV
        const singleAlt = dAlts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        const dHmClauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
        const dHmConds = hc.filter(qc => dHmClauseId && dGetCondClauseId(qc) === dHmClauseId)

        if (selectedClause) {
          hcContent.push(bup('Hull and Machinery'))
          hcContent.push(emptyP())
          hcContent.push(np(selectedClause.description || selectedClause.name))
          hcContent.push(emptyP())
        } else {
          hcContent.push(bup('Hull and Machinery'))
          hcContent.push(emptyP())
        }
        if (dHmConds.length > 0) hcContent.push(makeCondTable(dHmConds))
        const dHmAddl = dRenderAddlForSection(b => b.type === 'alt' || b.type === 'allAlts')
        if (dHmAddl.length > 0) { hcContent.push(emptyP()); hcContent.push(...dHmAddl) }

        hcContent.push(emptyP())
        if (dSelectedIvClause) {
          hcContent.push(bup('Increased Value'))
          hcContent.push(emptyP())
          hcContent.push(np(dSelectedIvClause.description || dSelectedIvClause.name))
          hcContent.push(emptyP())
        } else {
          hcContent.push(bup('Increased Value'))
          hcContent.push(emptyP())
        }
        if (dIvConds.length > 0) hcContent.push(makeCondTable(dIvConds))
        const dIvAddl = dRenderAddlForSection(b => b.type === 'iv')
        if (dIvAddl.length > 0) { hcContent.push(emptyP()); hcContent.push(...dIvAddl) }

        const dBothAddl = dRenderAddlForSection(b => b.type === 'both')
        if (dBothAddl.length > 0) {
          hcContent.push(emptyP())
          hcContent.push(bup('Applicable to both sections:'))
          hcContent.push(emptyP())
          hcContent.push(...dBothAddl)
        }
      } else {
        // Single alternative, no IV
        const singleAlt = dAlts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        if (selectedClause) {
          hcContent.push(np(selectedClause.description || selectedClause.name))
          hcContent.push(emptyP())
        }
        if (hc.length > 0) hcContent.push(makeCondTable(hc))
        if (ha.length > 0) {
          hcContent.push(emptyP())
          for (const qa of ha) {
            const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
            if (!def) continue
            const condText = qa.textOverride || def.text
            const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
            hcContent.push(dAddlBullet(condText + scope))
          }
        }
      }
      rowMap.set('hullConditions', makeRow('Conditions', hcContent))
    }
  }

  // ---- Sum Insured (War) ----
  if (data.quotation.quotationTypeCode === 'W' && data.quotation.agreedValue != null) {
    rowMap.set('sumInsured', makeRow('Sum Insured', [
      bp(formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD'))
    ]))
  }

  // ---- War Conditions ----
  {
    const wc = data.warConditions
    if (wc.length > 0) {
      const resolveWarText = (text: string): string => {
        if (!data.warSettings) return text
        return text
          .replace(/\{jwla_code\}/g, data.warSettings.jwlaCode)
          .replace(/\{jwla_date\}/g, data.warSettings.jwlaDate)
          .replace(/\{tc_text\}/g, data.warSettings.tcText)
      }
      const wcContent: Paragraph[] = []
      for (const qc of wc) {
        const def = data.allWarConditions.find(c => c.id === qc.warConditionId)
        if (!def) continue
        const text = resolveWarText(qc.textOverride || def.text)
        const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
        wcContent.push(bulletP(text + scope))
      }
      // T&C line
      if (data.warSettings?.tcText) {
        wcContent.push(emptyP())
        wcContent.push(np(data.warSettings.tcText))
      }
      rowMap.set('warConditions', makeRow('Conditions', wcContent))
    }
  }

  // ---- War Trading Warranty ----
  if (data.quotation.quotationTypeCode === 'W' && data.quotation.tradingWarrantyIntro) {
    rowMap.set('warTrading', makeRow('Trading Warranty', [np(data.quotation.tradingWarrantyIntro)]))
  }

  // ---- Trading Warranty (not for War — War uses warTrading) ----
  if (data.quotation.quotationTypeCode !== 'W') {
    const wq = data.quotation
    const tradContent: (Paragraph | Table)[] = []
    const wExcCountries = data.excludedCountries.filter(c => c.listType === 'excluded')
    const wDdqListStr = ddqCountries.map(c => c.name).join(', ')
    const numP = (text: string, level: number) => new Paragraph({
      numbering: { reference: 'trading-numbered', level },
      spacing: { after: 80, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
    })
    if (wq.tradingWarrantyIntro) tradContent.push(...mp(wq.tradingWarrantyIntro))
    if (wq.tradingCustomText) {
      tradContent.push(emptyP())
      tradContent.push(...mp(wq.tradingCustomText))
    }
    if (wExcCountries.length > 0) {
      tradContent.push(emptyP())
      tradContent.push(np('Excluding ' + wExcCountries.map(c => c.name).join(', ') + '.'))
    }
    if (wq.tradingShowDdqList && ddqCountries.length > 0) {
      let ddqIntroText = stripHtml(st(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
      const hasPh = ddqIntroText.includes('{ddq_countries}')
      if (hasPh) {
        ddqIntroText = ddqIntroText.replace(/\{ddq_countries\}/g, wDdqListStr)
        tradContent.push(emptyP())
        tradContent.push(numP(ddqIntroText, 0))
      } else {
        tradContent.push(emptyP())
        tradContent.push(numP(ddqIntroText, 0))
        tradContent.push(new Paragraph({
          spacing: { after: 80, line: 240, lineRule: 'auto' as any },
          indent: { left: 720 },
          children: [new TextRun({ text: 'Excluding ' + wDdqListStr + '.', size: 22, font: 'Arial', color: '000000' })]
        }))
      }
    }
    if (wq.tradingShowDdqWarranties) {
      const intro = st(data, 'tradingConditionA')
      if (intro) tradContent.push(numP(stripHtml(intro), 0))
      const condKeys: (keyof PISectionTexts)[] = ['tradingConditionB', 'tradingConditionC', 'tradingConditionD', 'tradingConditionE', 'tradingConditionF', 'tradingConditionG']
      for (const key of condKeys) {
        const txt = st(data, key)
        if (txt) tradContent.push(new Paragraph({
          numbering: { reference: 'trading-numbered', level: 1 },
          spacing: { after: 0, line: 240, lineRule: 'auto' as any },
          children: [new TextRun({ text: stripHtml(txt), size: 22, font: 'Arial', color: '000000' })]
        }))
      }
    }
    if (wq.tradingShowIsrael && st(data, 'tradingIsrael')) {
      tradContent.push(emptyP())
      tradContent.push(numP(stripHtml(st(data, 'tradingIsrael')), 0))
    }
    if (tradContent.length > 0) rowMap.set('trading', makeRow('Trading Warranty', tradContent))
  }

  // ---- Warranties ----
  {
    const warContent: (Paragraph | Table)[] = []
    const dPiMultiAltW = data.piAlternatives.length > 1

    const renderWarBullets = (warIds: string[], customs: QuotationCustomWarranty[]) => {
      const paras: Paragraph[] = []
      for (const wid of warIds) {
        const w = data.allWarranties.find(ww => ww.id === wid)
        if (!w) continue
        const wVesselScope = data.warrantyVesselScopes[wid]
        for (const entry of resolveIacsWarranty(w.text, wVesselScope, data)) {
          paras.push(bulletP(entry.text + vesselScopeSuffix(entry.vesselScope, data.quotationVessels)))
        }
      }
      for (const cw of customs) {
        for (const entry of resolveIacsWarranty(cw.text, cw.vesselScope, data)) {
          paras.push(bulletP(entry.text + vesselScopeSuffix(entry.vesselScope, data.quotationVessels)))
        }
      }
      return paras
    }

    if (dPiMultiAltW) {
      const sharedWarIds = data.selectedWarrantyIds.filter(id => !data.warrantyAltIds[id])
      const sharedCustom = sortedWordCustom.filter(cw => !cw.alternativeId)
      warContent.push(...renderWarBullets(sharedWarIds, sharedCustom))
      for (const alt of data.piAlternatives) {
        const altWarIds = data.selectedWarrantyIds.filter(id => data.warrantyAltIds[id] === alt.id)
        const altCustom = sortedWordCustom.filter(cw => cw.alternativeId === alt.id)
        if (altWarIds.length > 0 || altCustom.length > 0) {
          warContent.push(emptyP())
          warContent.push(bup(`Additional Warranties Applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:`))
          warContent.push(...renderWarBullets(altWarIds, altCustom))
        }
      }
    } else {
      warContent.push(...renderWarBullets(data.selectedWarrantyIds, sortedWordCustom))
    }

    if (st(data, 'warrantiesAdditionalText')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesAdditionalText')))
    }
    if (st(data, 'warrantiesBreach')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesBreach')))
    }
    if (st(data, 'warrantiesNote')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesNote')))
    }
    if (warContent.length > 0) rowMap.set('warranties', makeRow('Warranties', warContent))
  }

  // ---- Deductibles ----
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    const dedContent: (Paragraph | Table)[] = []
    const dedAmtW = Math.round(BODY_W * 0.20)
    const dedDescW = BODY_W - dedAmtW

    const makeDedTable = (deds: QuotationDeductible[]) => {
      const dedRows: TableRow[] = []
      for (const d of deds) {
        const dScope = vesselScopeSuffix(d.vesselScope, data.quotationVessels)
        dedRows.push(new TableRow({
          children: [
            new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(d.amount, d.currency), size: 22, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.description.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___') + dScope, size: 22, font: 'Arial', color: '000000' })] })] })
          ]
        }))
        if (d.secondaryDescription) {
          const secDesc = d.secondaryDescription.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___')
          dedRows.push(new TableRow({
            children: [
              new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '', size: 22, font: 'Arial', color: '000000' })] })] }),
              new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: secDesc, size: 22, font: 'Arial', color: '000000' })] })] })
            ]
          }))
        }
      }
      return new Table({ width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [dedAmtW, dedDescW], layout: TableLayoutType.FIXED, rows: dedRows })
    }

    const dPiMultiAltD = data.piAlternatives.length > 1 && hasAltScoping(data.deductibles)

    const dDedAggText = data.quotation.deductibleAggregateEnabled
      ? (data.quotation.deductibleAggregateText || st(data, 'deductiblesAggregate') || '')
      : ''

    if (dPiMultiAltD) {
      const sharedDeds = data.deductibles.filter(d => !d.alternativeId)
      if (sharedDeds.length > 0) { dedContent.push(makeDedTable(sharedDeds)); dedContent.push(emptyP()) }
      if (dDedAggText) { dedContent.push(...mp(dDedAggText)); dedContent.push(emptyP()) }
      for (const alt of data.piAlternatives) {
        const altDeds = data.deductibles.filter(d => d.alternativeId === alt.id)
        if (altDeds.length > 0) {
          dedContent.push(bup(`Additional Deductibles applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:`))
          dedContent.push(makeDedTable(altDeds))
          dedContent.push(emptyP())
        }
      }
    } else if (data.deductibles.length > 0) {
      dedContent.push(makeDedTable(data.deductibles))
      dedContent.push(emptyP())
      if (dDedAggText) { dedContent.push(...mp(dDedAggText)); dedContent.push(emptyP()) }
    }

    const dPiMultiAltTD = data.piAlternatives.length > 1 && hasAltScoping(data.textDeductibles)
    if (dPiMultiAltTD) {
      const sharedTds = data.textDeductibles.filter(td => !td.alternativeId)
      for (const td of sharedTds) { dedContent.push(emptyP()); dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels))) }
      for (const alt of data.piAlternatives) {
        const altTds = data.textDeductibles.filter(td => td.alternativeId === alt.id)
        if (altTds.length > 0) {
          dedContent.push(emptyP())
          dedContent.push(bup(`Applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:`))
          for (const td of altTds) { dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels))) }
        }
      }
    } else {
      for (const td of data.textDeductibles) { dedContent.push(emptyP()); dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels))) }
    }
    if (st(data, 'deductiblesAdditionalText')) { dedContent.push(emptyP()); dedContent.push(...mp(st(data, 'deductiblesAdditionalText'))) }
    rowMap.set('deductibles', makeRow('Deductibles', dedContent))
  }

  // ---- Exclusions ----
  if (exclusionTexts.length > 0) {
    const dPiMultiAltEx = data.piAlternatives.length > 1
    const dHasExclAltScoping = dPiMultiAltEx && (data.selectedExclusions.some(e => e.alternativeId) || data.customExclusions.some(e => e.alternativeId))

    if (dHasExclAltScoping) {
      const exclContent: (Paragraph | Table)[] = []
      const allExclItems: { text: string; altId: string | null }[] = []
      for (const se of data.selectedExclusions) {
        const eScope = vesselScopeSuffix(se.vesselScope, data.quotationVessels)
        const t = se.customText ? se.customText + eScope : (se.piExclusionId ? ((data.allExclusions.find(e => e.id === se.piExclusionId)?.text || '') + eScope) : '')
        if (t) allExclItems.push({ text: t, altId: se.alternativeId || null })
      }
      for (const ce of data.customExclusions) {
        const ceScope = vesselScopeSuffix(ce.vesselScope, data.quotationVessels)
        allExclItems.push({ text: ce.text + ceScope, altId: ce.alternativeId || null })
      }
      const shared = allExclItems.filter(e => !e.altId)
      exclContent.push(...shared.map(e => bulletP(e.text)))
      for (const alt of data.piAlternatives) {
        const altItems = allExclItems.filter(e => e.altId === alt.id)
        if (altItems.length > 0) {
          exclContent.push(emptyP())
          exclContent.push(bup(`Applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:`))
          exclContent.push(...altItems.map(e => bulletP(e.text)))
        }
      }
      rowMap.set('exclusions', makeRow('Exclusions', exclContent))
    } else {
      rowMap.set('exclusions', makeRow('Exclusions', exclusionTexts.map(t => bulletP(t))))
    }
  }

  // ---- Sanctions ----
  {
    const wordSanctionsText = getSanctionsText(data)
    if (wordSanctionsText) {
      rowMap.set('sanctions', makeRow('Sanction Limitation and Exclusion Clause', mp(wordSanctionsText)))
    }
  }

  // ---- Subjectivities ----
  if (data.subjectivities.length > 0) {
    const subjContent: (Paragraph | Table)[] = []
    if (st(data, 'subjectivitiesIntro')) subjContent.push(...mp(st(data, 'subjectivitiesIntro')))
    for (const s of data.subjectivities) { subjContent.push(bulletP(s.text + vesselScopeSuffix(s.vesselScope, data.quotationVessels))) }
    if (st(data, 'subjectivitiesNote')) {
      subjContent.push(emptyP())
      subjContent.push(...mp(st(data, 'subjectivitiesNote')))
    }
    rowMap.set('subjectivities', makeRow('Subjectivities', subjContent))
  }

  // ---- Premium ----
  {
    const premContent: (Paragraph | Table)[] = []
    const wq = data.quotation
    const wHasDiscount = wq.ncbEnabled || wq.upccEnabled
    const wNcbType = wq.ncbDiscountType || 'percentage'
    const wNcbPct = wq.ncbDiscountPercent || 0
    const wNcbFixedAmt = wq.ncbDiscountAmount || 0
    const wUpccType = wq.upccDiscountType || 'percentage'
    const wUpccPct = wq.upccDiscountPercent || 0
    const wUpccFixedAmt = wq.upccDiscountAmount || 0
    const wComputePayable = (tech: number) => {
      const ncbDed = wNcbType === 'amount' ? wNcbFixedAmt : tech * wNcbPct / 100
      const afterNcb = tech - ncbDed
      const upccDed = wUpccType === 'amount' ? wUpccFixedAmt : afterNcb * wUpccPct / 100
      return afterNcb - upccDed
    }
    const wIsMultiVessel = data.quotationVessels.length >= 2
    const wHasVesselPremiums = wIsMultiVessel && data.quotationVessels.some(v => v.premiumAmount)

    if (wHasVesselPremiums) {
      const techLabel = wHasDiscount ? 'Technical Premium' : 'Premium'
      const headerCells = [
        new TableCell({ width: { size: 3000, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: 'Vessel', size: 20, font: 'Arial', bold: true, color: '000000' })] })] }),
        new TableCell({ width: { size: 2500, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: techLabel, size: 20, font: 'Arial', bold: true, color: '000000' })] })] })
      ]
      if (wHasDiscount) {
        headerCells.push(new TableCell({ width: { size: 2500, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Payable Premium', size: 20, font: 'Arial', bold: true, color: '000000' })] })] }))
      }
      const premTableRows = [new TableRow({ children: headerCells })]
      for (const v of data.quotationVessels) {
        const pvName = (v.name || v.vesselLabel).toUpperCase()
        const vPrem = v.premiumAmount || 0
        const rowCells = [
          new TableCell({ borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: pvName, size: 22, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ borders: noBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatCurrency(vPrem, wq.premiumCurrency), size: 22, font: 'Arial', color: '000000' })] })] })
        ]
        if (wHasDiscount) {
          const vPayable = wComputePayable(vPrem)
          rowCells.push(new TableCell({ borders: noBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: vPrem > 0 ? formatCurrency(vPayable, wq.premiumCurrency) : '-', size: 22, font: 'Arial', color: '000000' })] })] }))
        }
        premTableRows.push(new TableRow({ children: rowCells }))
      }
      const totalTech = data.quotationVessels.reduce((s, v) => s + (v.premiumAmount || 0), 0)
      const totalCells = [
        new TableCell({ borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: 'Total', size: 22, font: 'Arial', bold: true, color: '000000' })] })] }),
        new TableCell({ borders: noBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatCurrency(totalTech, wq.premiumCurrency), size: 22, font: 'Arial', bold: true, color: '000000' })] })] })
      ]
      if (wHasDiscount) {
        const totalPayable = wComputePayable(totalTech)
        totalCells.push(new TableCell({ borders: noBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatCurrency(totalPayable, wq.premiumCurrency), size: 22, font: 'Arial', bold: true, color: '000000' })] })] }))
      }
      premTableRows.push(new TableRow({ children: totalCells }))
      premContent.push(new Table({ rows: premTableRows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      premContent.push(np('per annum'))
      premContent.push(emptyP())
    } else if (wq.premiumAmount != null || data.hullAlternatives.length > 1 || data.piAlternatives.length > 1) {
      const wMultiAlt = data.hullAlternatives.length > 1
      const wPiMultiAlt = data.piAlternatives.length > 1
      const premLabelW = Math.round(BODY_W * 0.30)
      const premAmtW = BODY_W - premLabelW
      const premCell = (text: string, bold = false, align?: typeof AlignmentType.RIGHT, w?: number) => new TableCell({
        borders: noBorders(),
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 22, font: 'Arial', bold, color: '000000' })] })]
      })
      const premRow = (label: string, amount: string, boldLabel = false) => new TableRow({
        children: [
          premCell(label, boldLabel, undefined, premLabelW),
          premCell(amount, true, undefined, premAmtW)
        ]
      })
      const premTable = (rows: TableRow[]) => new Table({
        width: { size: BODY_W, type: WidthType.DXA },
        columnWidths: [premLabelW, premAmtW],
        layout: TableLayoutType.FIXED,
        rows
      })

      // Build premium line items: { label, tech, payable? }
      type PremLine = { label: string; tech: number }
      const lines: PremLine[] = []
      if (wPiMultiAlt) {
        for (let ai = 0; ai < data.piAlternatives.length; ai++) {
          const alt = data.piAlternatives[ai]
          lines.push({ label: alt.label || `Alternative ${ai + 1}`, tech: alt.premiumAmount || 0 })
        }
      } else if (wMultiAlt) {
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
          lines.push({ label: `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`, tech: alt.premiumAmount || 0 })
        }
        if (wq.ivEnabled && wq.ivPremiumAmount != null) lines.push({ label: 'IV', tech: wq.ivPremiumAmount })
      } else if (wq.ivEnabled) {
        lines.push({ label: 'Section A', tech: wq.premiumAmount || 0 })
        if (wq.ivPremiumAmount != null) lines.push({ label: 'Section B', tech: wq.ivPremiumAmount })
      } else {
        lines.push({ label: '', tech: wq.premiumAmount || 0 })
      }

      const useTable = lines.length > 1 || wHasDiscount
      if (useTable) {
        if (wHasDiscount) {
          // Two-section table: Technical then Payable
          const rows: TableRow[] = []
          rows.push(premRow(lines.length > 1 ? 'Technical Premium' : '', '', true))
          for (const l of lines) {
            rows.push(premRow(l.label || 'Technical Premium', `${formatCurrency(l.tech, wq.premiumCurrency)} per annum`))
          }
          rows.push(premRow('', '')) // spacer
          rows.push(premRow(lines.length > 1 ? 'Payable Premium' : '', '', true))
          for (const l of lines) {
            rows.push(premRow(l.label || 'Payable Premium', `${formatCurrency(wComputePayable(l.tech), wq.premiumCurrency)} per annum`))
          }
          premContent.push(premTable(rows))
        } else {
          // Simple table: just amounts
          const rows: TableRow[] = []
          for (const l of lines) {
            rows.push(premRow(l.label, `${formatCurrency(l.tech, wq.premiumCurrency)} per annum`))
          }
          premContent.push(premTable(rows))
        }
        premContent.push(emptyP())
      } else {
        // Single premium, no discount — plain bold text
        premContent.push(bp(`${formatCurrency(wq.premiumAmount, wq.premiumCurrency)} per annum`))
        premContent.push(emptyP())
      }
    }
    const wNumInst = wq.numInstalments || 1
    const wFirstInstDays = data.instalments.length > 0 ? data.instalments[0].daysFromInception : 0
    const wSingleTiming = wFirstInstDays === 0 ? 'at inception' : `within ${wFirstInstDays} days of inception`
    if (wNumInst === 1 && st(data, 'premiumPaymentIntroSingle')) {
      const introText = st(data, 'premiumPaymentIntroSingle').replace(/\{timing\}/g, wSingleTiming)
      premContent.push(...mp(introText))
      premContent.push(emptyP())
      // Non-refundable sentence right after for single instalment
      if (wq.nonRefundableType) {
        let nrText = ''
        if (wq.nonRefundableType === 'first_instalment') {
          nrText = st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.'
        } else if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
          nrText = (st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(wq.nonRefundablePercent!))
        }
        if (nrText) { premContent.push(np(nrText)); premContent.push(emptyP()) }
      }
    } else {
      if (st(data, 'premiumPaymentIntro')) {
        const introText = st(data, 'premiumPaymentIntro').replace('{instalments}', String(wNumInst))
        premContent.push(...mp(introText))
        premContent.push(emptyP())
      }
      if (data.instalments.length > 0) {
        for (const inst of data.instalments) {
          const timing = inst.daysFromInception === 0 ? 'prior inception' : `within ${inst.daysFromInception} days of inception`
          let instText = `${ordinal(inst.instalmentNumber)} Instalment ${timing}`
          if (inst.instalmentNumber === 1 && wq.nonRefundableType) {
            let nrText = ''
            if (wq.nonRefundableType === 'first_instalment') {
              nrText = st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.'
            } else if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
              nrText = (st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(wq.nonRefundablePercent!))
            }
            if (nrText) instText += ' \u2014 ' + nrText
          }
          premContent.push(new Paragraph({
            spacing: { after: 0, line: 240, lineRule: 'auto' as any },
            children: [new TextRun({ text: instText, size: 22, font: 'Arial', color: '000000' })]
          }))
        }
        premContent.push(emptyP())
      }
    }
    if (st(data, 'premiumCondition')) { premContent.push(...mp(st(data, 'premiumCondition'))); premContent.push(emptyP()) }
    if (st(data, 'premiumEarned')) { premContent.push(...mp(st(data, 'premiumEarned'))); premContent.push(emptyP()) }
    if (wq.premiumAdditionalText) premContent.push(...mp(wq.premiumAdditionalText))
    rowMap.set('premium', makeRow('Premium Payment Condition Precedent', premContent.length > 0 ? premContent : [emptyP()]))

    // NCB as separate section
    if (wq.ncbEnabled) {
      const ncbContent: (Paragraph | Table)[] = []
      const wTechPrem = wq.premiumAmount || 0
      const wNcbAmt = wNcbType === 'amount' ? wNcbFixedAmt : wTechPrem * wNcbPct / 100
      const wNcbAmtStr = formatCurrency(wNcbAmt, wq.premiumCurrency)
      const wNcbPctStr = `${wNcbPct}%`
      const wNcbDisplay = wNcbType === 'amount' ? wNcbAmtStr : wNcbPctStr
      if (wq.ncbText) {
        const resolved = wq.ncbText.replace(/\{ncb_amount\}/g, wNcbDisplay).replace(/\{ncb_percent\}/g, wNcbPctStr)
        ncbContent.push(...mp(resolved))
      }
      rowMap.set('ncb', makeRow('No Claims Bonus (NCB)', ncbContent))
    }

    // UPCC as separate section
    if (wq.upccEnabled) {
      const upccContent: (Paragraph | Table)[] = []
      const wAfterNcbPrem = (wq.premiumAmount || 0) - (wNcbType === 'amount' ? wNcbFixedAmt : (wq.premiumAmount || 0) * wNcbPct / 100)
      const wUpccAmt = wUpccType === 'amount' ? wUpccFixedAmt : wAfterNcbPrem * wUpccPct / 100
      const wUpccAmtStr = formatCurrency(wUpccAmt, wq.premiumCurrency)
      const wUpccPctStr = `${wUpccPct}%`
      const wUpccDisplay = wUpccType === 'amount' ? wUpccAmtStr : wUpccPctStr
      if (wq.upccText) {
        const resolved = wq.upccText.replace(/\{upcc_amount\}/g, wUpccDisplay).replace(/\{upcc_percent\}/g, wUpccPctStr)
        upccContent.push(...mp(resolved))
      }
      rowMap.set('upcc', makeRow('Upfront Continuity (UPCC)', upccContent))
    }
  }

  // ---- Information ----
  {
    const infoContent: (Paragraph | Table)[] = []
    if (data.quotation.validityDays) infoContent.push(bulletP(`Quote open for ${data.quotation.validityDays} days`))
    for (const info of data.information) { infoContent.push(bulletP(info.text)) }
    rowMap.set('information', makeRow('Information', infoContent.length > 0 ? infoContent : [emptyP()]))
  }

  // ---- Custom sections ----
  for (const cs of data.customSections) {
    const csContent: (Paragraph | Table)[] = []
    if (cs.text) csContent.push(...mp(cs.text))
    if (csContent.length === 0) csContent.push(emptyP())
    rowMap.set(`custom:${cs.id}`, makeRow(cs.title, csContent))
  }

  // Resolve section order and build final rows array
  const docxSectionOrder = await resolveSectionOrder(data)
  const rows: TableRow[] = []
  for (const key of docxSectionOrder) {
    const row = rowMap.get(key)
    if (row) rows.push(row)
  }
  // Append any rows not in the order (safety net)
  for (const [key, row] of rowMap) {
    if (!docxSectionOrder.includes(key)) rows.push(row)
  }

  // Build main two-column table — FIXED layout forces Word/LibreOffice to honour DXA widths
  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [TITLE_W, BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: thin, bottom: thin, left: thin, right: thin,
      insideHorizontal: thin, insideVertical: thin
    },
    rows
  })

  // After-table content
  const afterTable: Paragraph[] = []
  if (st(data, 'informationNote')) {
    afterTable.push(emptyP())
    afterTable.push(...mp(st(data, 'informationNote')))
  }
  if (st(data, 'importantNotice')) {
    afterTable.push(emptyP())
    const notice = st(data, 'importantNotice')
    const plainNotice = htmlToPlainText(notice)
    if (plainNotice.startsWith('IMPORTANT NOTICE')) {
      afterTable.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'IMPORTANT NOTICE', bold: true, size: 22, font: 'Arial', color: '000000' })]
      }))
      afterTable.push(...parseHtmlToParagraphs(notice.replace(/^(<p>)?IMPORTANT NOTICE(<\/p>)?\n*/i, ''), {
        size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.CENTER
      }))
    } else {
      afterTable.push(...parseHtmlToParagraphs(notice, {
        size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.CENTER
      }))
    }
  }
  for (const note of data.notes) {
    afterTable.push(emptyP())
    afterTable.push(bp(note.title))
    if (note.content) afterTable.push(...mp(note.content))
  }

  // Assemble document
  const children: (Paragraph | Table)[] = []

  // Logo
  if (data.logoPath) {
    const logoData = await loadLogoAsBuffer(data.logoPath)
    if (logoData) {
      const maxW = 200
      const maxH = 80
      const scale = Math.min(maxW / logoData.width, maxH / logoData.height)
      const w = Math.round(logoData.width * scale)
      const h = Math.round(logoData.height * scale)
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new ImageRun({
          data: logoData.buffer,
          transformation: { width: w, height: h },
          type: 'png'
        })]
      }))
    }
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: `${data.quotation.quotationTypeCode === 'H' ? 'HULL AND MACHINERY' : data.quotation.quotationTypeCode === 'W' ? 'WAR / PIRACY' : 'PROTECTION AND INDEMNITY'} QUOTATION FOR ${(data.quotation.title || vName).toUpperCase()}`, bold: true, size: 26, font: 'Arial', color: '000000' })
      ]
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 60 },
      children: [new TextRun({ text: dateStr, size: 22, font: 'Arial', color: '000000' })]
    }),
    new Paragraph({
      spacing: { after: 200 },
      children: [new TextRun({ text: `Ref: ${data.quotation.referenceNumber || '-'}`, size: 22, font: 'Arial', color: '000000' })]
    }),
    mainTable,
    ...afterTable
  )

  // Build header & footer from quotation section texts (rich text)
  const headerHtml = st(data, 'docHeader')
  const footerHtml = st(data, 'docFooter')
  const headerSpacing = data.sectionTexts.docHeaderSpacing || undefined
  const footerSpacing = data.sectionTexts.docFooterSpacing || undefined

  // Header: parsed from rich text (supports font sizes, alignment, line spacing, Arabic)
  const headerParas = headerHtml
    ? parseHtmlToParagraphs(headerHtml, { size: 18, font: 'Arial', color: '666666', lineSpacing: headerSpacing })
    : []
  const defaultHeader = new Header({ children: headerParas.length > 0 ? headerParas : [emptyP()] })

  // Footer: rich text content + page number right-aligned on a separate line
  const footerParas = footerHtml
    ? parseHtmlToParagraphs(footerHtml, { size: 16, font: 'Arial', color: '999999', lineSpacing: footerSpacing })
    : []
  const pageNumberPara = new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { before: 40, after: 0 },
    children: [
      new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: '999999' }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '999999' }),
      new TextRun({ text: ' of ', size: 16, font: 'Arial', color: '999999' }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: 'Arial', color: '999999' })
    ]
  })
  const defaultFooter = new Footer({ children: [...footerParas, pageNumberPara] })

  const document = new Document({
    numbering: {
      config: [{
        reference: 'dash-bullet',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '-',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 140, hanging: 140 } } }
        }]
      }, {
        reference: 'trading-numbered',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1)',
          alignment: AlignmentType.LEFT,
          style: {
            run: { font: 'Arial', size: 22 },
            paragraph: { indent: { left: 240, hanging: 240 } }
          }
        }, {
          level: 1,
          format: LevelFormat.LOWER_LETTER,
          text: '%2)',
          alignment: AlignmentType.LEFT,
          style: {
            run: { font: 'Arial', size: 22 },
            paragraph: { indent: { left: 720, hanging: 360 } }
          }
        }]
      }]
    },
    sections: [{
      properties: {
        page: {
          size: { width: PAGE_W_DXA, height: PAGE_H_DXA, orientation: PageOrientation.PORTRAIT },
          margin: {
            top: MARGIN_TOP_DXA, bottom: MARGIN_BOT_DXA,
            left: MARGIN_LR_DXA, right: MARGIN_LR_DXA,
            header: HEADER_DXA, footer: FOOTER_DXA
          }
        }
      },
      headers: { default: defaultHeader },
      footers: { default: defaultFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = getFileName(data, 'docx')
  a.click()
  URL.revokeObjectURL(url)
}

// ==================== Border Helpers ====================

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}
