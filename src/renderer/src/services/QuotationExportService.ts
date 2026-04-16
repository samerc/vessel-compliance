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
  QuotationAgreedValueItem, QuotationAgreedValueOption, QuotationHullCondition, QuotationHullAdditionalCondition, QuotationHullAlternative,
  QuotationPIAlternative, WarCondition, QuotationWarCondition, WarSettings, Fleet,
  QuotationCargoClause, QuotationCargoCustomClause,
  QuotationAssuredGroup
} from '../../../shared/types'
import { DEFAULT_SECTION_TEXTS, getDefaultSectionOrder } from '../components/quotationSettingsConstants'
import { parseHtmlToParagraphs, htmlToPlainText } from '../utils/htmlToDocx'
import { stripHtml } from '../utils/htmlToPdfText'
import { formatDateLong } from '../utils/dateUtils'

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
  flagStates: { id: string; name: string; iso3Code?: string }[]
  assureds: QuotationAssured[]
  assuredGroups: QuotationAssuredGroup[]
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
  agreedValueOptions: QuotationAgreedValueOption[]
  hullClauses: HullClause[]
  hullConditions: QuotationHullCondition[]
  allHullConditions: HullClauseCondition[]
  hullAdditionalConditions: QuotationHullAdditionalCondition[]
  allHullAdditionalConditions: HullAdditionalCondition[]
  hullAlternatives: QuotationHullAlternative[]
  // Survey warranties
  surveyWarranties: { id: string; text: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]
  // War-specific data
  warConditions: QuotationWarCondition[]
  allWarConditions: WarCondition[]
  warSettings: WarSettings | null
  fleets: Fleet[]
  // Cargo-specific data
  cargoInstituteClauses: { id: string; name: string; code?: string; description?: string }[]
  cargoConditionClauses: QuotationCargoClause[]
  cargoSpecialClauses: QuotationCargoClause[]
  cargoLawClauses: QuotationCargoClause[]
  cargoConditionCustom: QuotationCargoCustomClause[]
  cargoSpecialCustom: QuotationCargoCustomClause[]
  cargoLawCustom: QuotationCargoCustomClause[]
  // LOL alternatives
  lolOptions: { id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]
  // Resolved classification names per vessel ID (from junction table)
  vesselClassificationNames: Record<string, string>
}

async function gatherData(quotation: Quotation): Promise<QuotationData> {
  // Reload quotation from DB to ensure all fields (especially quotationDate) are fresh
  const freshQ = await window.api.getQuotation(quotation.id)
  if (freshQ && !(freshQ as any).error) {
    quotation = { ...quotation, ...freshQ }
  }

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
    warConditionsRaw, allWarConditionsRaw, warSettingsRaw,
    flagStatesRaw, surveyWarrantiesRaw, fleetsRaw, assuredGroupsRaw
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
    window.api.warGetSettings(),
    window.api.getFlagStates(),
    window.api.quotationSurveyWarrantyGetAll(quotation.id),
    window.api.getFleets(),
    window.api.getQuotationAssuredGroups(quotation.id)
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
  // Deduplicate warranty IDs preserving order (same warranty may appear for multiple alternatives)
  const selectedWarrantyIds: string[] = []
  const seenWarIds = new Set<string>()
  for (const r of safeWarrantyRows) {
    if (!seenWarIds.has(r.piWarrantyId)) { seenWarIds.add(r.piWarrantyId); selectedWarrantyIds.push(r.piWarrantyId) }
  }
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

  // Fetch LOL options
  const lolOptionsRaw = quotation.quotationTypeCode === 'P'
    ? await window.api.lolGetOptions(quotation.id).catch(() => [])
    : []

  // Fetch agreed value options
  const agreedValueOptionsRaw = await window.api.hullGetAgreedValueOptions(quotation.id)

  // Fetch cargo-specific data
  const isCargo = quotation.quotationTypeCode === 'C'
  const cargoInstituteClauses = isCargo ? await window.api.cargoGetInstituteClauses() : []
  const cargoConditionClauses = isCargo ? await window.api.cargoGetQuotationClauses(quotation.id, 'conditions') : []
  const cargoSpecialClauses = isCargo ? await window.api.cargoGetQuotationClauses(quotation.id, 'special') : []
  const cargoLawClauses = isCargo ? await window.api.cargoGetQuotationClauses(quotation.id, 'law') : []
  const cargoConditionCustom = isCargo ? await window.api.cargoGetQuotationCustomClauses(quotation.id, 'conditions') : []
  const cargoSpecialCustom = isCargo ? await window.api.cargoGetQuotationCustomClauses(quotation.id, 'special') : []
  const cargoLawCustom = isCargo ? await window.api.cargoGetQuotationCustomClauses(quotation.id, 'law') : []

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

  // Determine IACS status and resolve classification names per quotation vessel
  const vesselIacsMap: Record<string, boolean> = {}
  const vesselClassificationNames: Record<string, string> = {}
  const safeQVessels = Array.isArray(quotationVessels) ? quotationVessels : []
  const classSocieties = await window.api.getClassificationSocieties()
  const safeCS = Array.isArray(classSocieties) ? classSocieties : []
  const iacsIds = new Set(safeCS.filter(cs => cs.isIacs).map(cs => cs.id))
  // Build a set of IACS names/abbreviations for fallback text matching
  const iacsNames = new Set(safeCS.filter(cs => cs.isIacs).flatMap(cs => [cs.name?.toLowerCase(), cs.abbreviation?.toLowerCase()].filter(Boolean)))
  // Build a map of classification society ID -> name for resolving UUIDs
  const csNameMap: Record<string, string> = {}
  for (const cs of safeCS) { if (cs.id && cs.name) csNameMap[cs.id] = cs.name }
  for (const qv of safeQVessels) {
    if (qv.vesselId) {
      try {
        const vcs = await window.api.getVesselClassifications(qv.vesselId)
        const safeVcs = Array.isArray(vcs) ? vcs : []
        const hasIacs = safeVcs.some((vc: any) => iacsIds.has(vc.classificationSocietyId))
        if (hasIacs) { vesselIacsMap[qv.id] = true }
        // Resolve classification names from junction table
        const classNames = safeVcs.map((vc: any) => vc.classificationSocietyName || vc.abbreviation).filter(Boolean)
        if (classNames.length > 0) {
          vesselClassificationNames[qv.vesselId] = classNames.join(', ')
          continue // Junction table is authoritative — don't fall through to stale text field
        }
      } catch {}
    }
    // Fallback: check the text classification field on the quotation vessel
    const classText = (qv.classification || '').toLowerCase().trim()
    vesselIacsMap[qv.id] = classText ? iacsNames.has(classText) : false
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
    quotation, quotationVessels, allVessels, flagStates: Array.isArray(flagStatesRaw) ? flagStatesRaw : [], assureds,
    assuredGroups: Array.isArray(assuredGroupsRaw) ? (assuredGroupsRaw as QuotationAssuredGroup[]).sort((a, b) => a.order - b.order) : [],
    subLimits,
    selectedClauseIds, clauseVesselScopes, clauseAltIds,
    allClauses: resolvedAllClauses,
    additionalClauses,
    allAdditionalClauses: resolvedAllAdditionalClauses,
    selectedWarrantyIds, warrantyVesselScopes, warrantyAltIds,
    allWarranties: resolvedAllWarranties,
    piAlternatives: Array.isArray(piAlternativesRaw) ? piAlternativesRaw : [],
    lolOptions: Array.isArray(lolOptionsRaw) ? lolOptionsRaw : [],
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
    vesselClassificationNames,
    hullAgreedValueItems: Array.isArray(hullAgreedValueItems) ? hullAgreedValueItems : [],
    agreedValueOptions: Array.isArray(agreedValueOptionsRaw) ? agreedValueOptionsRaw : [],
    hullClauses: resolvedHullClauses,
    hullConditions: Array.isArray(hullConditionsRaw) ? hullConditionsRaw : [],
    allHullConditions: resolvedAllHullConditions,
    hullAdditionalConditions: Array.isArray(hullAdditionalConditionsRaw) ? hullAdditionalConditionsRaw : [],
    allHullAdditionalConditions: resolvedAllHullAdditionalConditions,
    hullAlternatives: Array.isArray(hullAlternativesRaw) ? hullAlternativesRaw : [],
    surveyWarranties: Array.isArray(surveyWarrantiesRaw) ? surveyWarrantiesRaw.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) : [],
    warConditions: Array.isArray(warConditionsRaw) ? warConditionsRaw : [],
    allWarConditions: resolvedAllWarConditions,
    warSettings: resolvedWarSettings,
    fleets: Array.isArray(fleetsRaw) ? fleetsRaw : [],
    cargoInstituteClauses: Array.isArray(cargoInstituteClauses) ? cargoInstituteClauses : [],
    cargoConditionClauses: Array.isArray(cargoConditionClauses) ? cargoConditionClauses : [],
    cargoSpecialClauses: Array.isArray(cargoSpecialClauses) ? cargoSpecialClauses : [],
    cargoLawClauses: Array.isArray(cargoLawClauses) ? cargoLawClauses : [],
    cargoConditionCustom: Array.isArray(cargoConditionCustom) ? cargoConditionCustom : [],
    cargoSpecialCustom: Array.isArray(cargoSpecialCustom) ? cargoSpecialCustom : [],
    cargoLawCustom: Array.isArray(cargoLawCustom) ? cargoLawCustom : []
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

/** Replace {currency} and {amount} placeholders in deductible description templates.
 *  Handles combined `{currency} {amount}` to avoid double-currency when {amount} includes currency. */
function replaceDedPlaceholders(text: string, currency: string, amount: number | undefined | null): string {
  const amtStr = amount != null ? formatCurrency(amount, currency) : '___'
  // Replace combined {currency} {amount} first to avoid "USD USD 5,000"
  return text
    .replace(/\{currency\}\s*\{amount\}/g, amtStr)
    .replace(/\{currency\}/g, currency)
    .replace(/\{amount\}/g, amtStr)
}

interface VesselInfo { imo?: string; built?: number; rebuilt?: number | null; gt?: number; type?: string; flag?: string; flagCode?: string; classification?: string; callSign?: string; name: string }

function formatBuiltYear(built?: number | null, rebuilt?: number | null): string {
  if (!built) return '-'
  if (rebuilt) return `${built}/${rebuilt}`
  return String(built)
}

function getVesselInfo(qv: QuotationVessel, allVessels: Vessel[], flagStates?: { id: string; name: string; iso3Code?: string }[], classificationNames?: Record<string, string>): VesselInfo {
  const reg = qv.vesselId ? allVessels.find(v => v.id === qv.vesselId) : null
  if (reg) {
    // Resolve flag name and ISO3 code from system vessel's flagStateId
    const flagMatch = reg.flagStateId && flagStates ? flagStates.find(f => f.id === reg.flagStateId) : null
    const flagName = flagMatch?.name || qv.flag
    const flagCode = flagMatch?.iso3Code || undefined
    // Use junction table classification names if available, falling back to text field
    const classification = (classificationNames && qv.vesselId && classificationNames[qv.vesselId])
      ? classificationNames[qv.vesselId]
      : (reg.classificationSociety || qv.classification)
    return { name: reg.name, imo: reg.imoNumber, built: reg.builtYear, rebuilt: reg.rebuiltYear, gt: reg.grossTonnage, type: reg.vesselType, flag: flagName, flagCode, classification, callSign: reg.callSign }
  }
  return { name: qv.name || 'Unknown', imo: qv.imoNumber, built: qv.builtYear, rebuilt: qv.rebuiltYear, gt: qv.grossTonnage, type: qv.vesselType, flag: qv.flag, classification: qv.classification, callSign: qv.callSign }
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
  if (data.quotationVessels.length === 1) return getVesselInfo(data.quotationVessels[0], data.allVessels, data.flagStates).name
  // Check if all vessels belong to the same fleet
  if (data.quotationVessels.length > 1) {
    const fleetIds = new Set(data.quotationVessels.map(qv => {
      const rv = qv.vesselId ? data.allVessels.find(v => v.id === qv.vesselId) : null
      return rv?.fleetId
    }).filter(Boolean))
    if (fleetIds.size === 1) {
      const fId = [...fleetIds][0]
      const fleet = data.fleets?.find((f: any) => f.id === fId)
      if (fleet) return fleet.name
    }
  }
  return data.quotationVessels.map(qv => `${qv.vesselLabel} ${getVesselInfo(qv, data.allVessels, data.flagStates).name}`).join(' / ')
}

function getFileName(data: QuotationData, ext: string): string {
  const ref = data.quotation.referenceNumber || 'Quotation'
  const rev = data.quotation.revisionNumber ? `-R${data.quotation.revisionNumber}` : ''
  let name = 'Quotation'
  if (data.quotationVessels.length > 0) {
    // Check if all quotation vessels belong to the same fleet
    const fleetIds = data.quotationVessels
      .map(qv => qv.vesselId ? data.allVessels.find(v => v.id === qv.vesselId)?.fleetId : undefined)
      .filter(Boolean) as string[]
    const uniqueFleetIds = [...new Set(fleetIds)]
    if (uniqueFleetIds.length === 1 && fleetIds.length === data.quotationVessels.length) {
      const fleet = data.fleets.find(f => f.id === uniqueFleetIds[0])
      if (fleet) name = fleet.name
      else name = getVesselInfo(data.quotationVessels[0], data.allVessels, data.flagStates).name
    } else {
      name = getVesselInfo(data.quotationVessels[0], data.allVessels, data.flagStates).name
    }
  }
  name = name.replace(/[^a-zA-Z0-9]/g, '_')
  return `${ref}${rev}_${name}.${ext}`
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
    ? formatDateLong(data.quotation.quotationDate)
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
  const isCargoPdf = data.quotation.quotationTypeCode === 'C'
  const typeLabel = isCargoPdf ? 'Marine Cargo' : data.quotation.quotationTypeCode === 'H' ? 'HULL AND MACHINERY' : data.quotation.quotationTypeCode === 'W' ? 'WAR / PIRACY' : 'PROTECTION AND INDEMNITY'
  const pdfTitleText = isCargoPdf
    ? `${typeLabel} Quotation for ${data.quotation.title || vName}${data.quotation.subjectMatter ? ' - ' + stripHtml(data.quotation.subjectMatter).substring(0, 50) : ''}`
    : `${typeLabel} QUOTATION FOR ${docTitle}`
  doc.text(pdfTitleText, pageWidth / 2, startY, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(dateStr, pageWidth - margin, startY + 10, { align: 'right' })
  doc.text(`Ref: ${data.quotation.referenceNumber || '-'}`, margin, startY + 18)

  // Build two-column sections into a map keyed by section ID
  const sectionMap = new Map<string, [string, string]>()

  // Insured
  {
    let insuredText = ''
    if (data.assuredGroups.length > 0) {
      // Render by group
      for (const group of data.assuredGroups) {
        const groupAssureds = data.assureds.filter(a => a.groupId === group.id)
        if (groupAssureds.length === 0) continue
        if (insuredText.length > 0) insuredText += '\n'
        insuredText += `${group.name.toUpperCase()}\n`
        for (const a of groupAssureds) {
          insuredText += `${a.name}\n`
          if (a.role) insuredText += `"as ${a.role}"\n`
        }
      }
      // Ungrouped assureds (if any)
      const ungrouped = data.assureds.filter(a => !a.groupId)
      if (ungrouped.length > 0) {
        if (insuredText.length > 0) insuredText += '\n'
        for (const a of ungrouped) {
          insuredText += `${a.name}\n`
          if (a.role) insuredText += `"as ${a.role}"\n`
        }
      }
    } else {
      // Legacy — flat list with optional vessel labels
      const hasVesselLabels = data.quotationVessels.length > 1 && data.assureds.some(a => a.vesselLabel)
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
    }
    if (st(data, 'insuredFooter')) insuredText += stripHtml(st(data, 'insuredFooter'))
    const coName = data.quotation.coName || getBrokerName(data)
    if (coName) insuredText += `\n\nc/o ${coName}`
    sectionMap.set('insured', ['Insured', insuredText.trim()])
  }

  // Insured Vessel(s)
  {
    const vesselLines = data.quotationVessels.map(qv => {
      const vi = getVesselInfo(qv, data.allVessels, data.flagStates, data.vesselClassificationNames)
      const prefix = data.quotationVessels.length > 1 ? `${qv.vesselLabel}: ` : ''
      return `${prefix}${vi.name}  |  IMO: ${vi.imo || '-'}  |  Built: ${formatBuiltYear(vi.built, vi.rebuilt)}  |  GT: ${vi.gt ? Number(vi.gt).toLocaleString() : '-'}  |  Type: ${vi.type || '-'}  |  Class: ${vi.classification || '-'}`
    })
    let pdfVesselText = vesselLines.join('\n')
    if (data.quotation.anyOtherVessel) {
      pdfVesselText += '\n\nAny other vessel(s) to be agreed by Insurers in advance.'
    }
    if (vesselLines.length > 0) sectionMap.set('vessel', ['Insured Vessel', pdfVesselText])
  }

  // Limit of Liability
  {
    const cur = data.quotation.limitOfLiabilityCurrency || 'USD'
    const baseAmt = data.quotation.limitOfLiabilityAmount
    const lolVA = data.quotation.limitOfLiabilityVesselAmounts
    const multiVessel = data.quotationVessels.length >= 2

    // Per-alternative LOL (P&I with 2+ alternatives) or LOL options
    const hasLolOptions = data.lolOptions.length > 0
    const piAltLol = !hasLolOptions && data.piAlternatives.length > 1 && data.piAlternatives.some(a => a.lolAmount != null)

    // Determine if per-vessel amounts differ
    let hasDifferentLol = false
    if (!piAltLol && multiVessel && lolVA && Object.keys(lolVA).length > 0) {
      const amounts = data.quotationVessels.map(qv => lolVA[qv.id] ?? baseAmt)
      hasDifferentLol = amounts.some(a => a !== amounts[0])
    }

    // Build the amount string for the template
    let amountDisplay: string
    if (hasLolOptions) {
      amountDisplay = ''
    } else if (piAltLol) {
      amountDisplay = 'values as per below'
    } else if (hasDifferentLol) {
      amountDisplay = 'values as per above'
    } else if (multiVessel && baseAmt != null) {
      amountDisplay = `${formatAmountOnly(baseAmt)} (all vessels)`
    } else {
      amountDisplay = baseAmt != null ? formatAmountOnly(baseAmt) : ''
    }

    // Per-vessel lines (only when amounts differ)
    let perVesselHeader = ''
    if (hasDifferentLol) {
      const lines = data.quotationVessels.map(qv => {
        const amt = lolVA![qv.id] ?? baseAmt
        if (amt == null) return ''
        const vName = (qv.name || qv.vesselLabel).toUpperCase()
        return `${vName}: ${formatCurrency(amt, cur)}`
      }).filter(Boolean)
      perVesselHeader = lines.join('\n') + '\n\n'
    }

    let liabilityText = ''
    if (data.quotation.limitOfLiabilityText) {
      liabilityText = data.quotation.limitOfLiabilityText
        .replace('{amount}', amountDisplay)
        .replace('{currency}', cur)
    } else if (st(data, 'limitOfLiabilityDefaultText') && (baseAmt != null || hasLolOptions)) {
      liabilityText = stripHtml(st(data, 'limitOfLiabilityDefaultText'))
        .replace('{amount}', amountDisplay)
        .replace('{currency}', cur)
    } else if (baseAmt != null || hasLolOptions) {
      liabilityText = `${amountDisplay} all claims in the aggregate.`
    }
    // Clean up double spaces from empty amount replacement
    liabilityText = liabilityText.replace(/  +/g, ' ').trim()

    // LOL option lines — alternatives at top, shared "all claims..." text below
    if (hasLolOptions) {
      const lolLines = data.lolOptions.map((opt, idx) => {
        const optCur = opt.currency || cur
        return `${opt.label || `Alternative ${idx + 1}`}: ${formatCurrency(opt.amount, optCur)}`
      })
      liabilityText = lolLines.join('\n') + '\n\n' + liabilityText.trim()
    }

    // Per-alternative LOL lines
    if (piAltLol) {
      const altLines = data.piAlternatives.map((alt, idx) => {
        const altCur = alt.lolCurrency || cur
        const altAmt = alt.lolAmount
        if (altAmt == null) return ''
        return `${alt.label || `Alternative ${idx + 1}`}: ${formatCurrency(altAmt, altCur)} all claims in the aggregate`
      }).filter(Boolean)
      if (altLines.length > 0) {
        liabilityText += (liabilityText ? '\n\n' : '') + altLines.join('\n')
      }
    }

    const pdfSubLimitLines = data.subLimits.map(sl =>
      sl.text.replace('{amount}', formatAmountOnly(sl.amount)).replace('{currency}', sl.currency || 'USD')
    )
    if (liabilityText.includes('{sub_limits}')) {
      if (pdfSubLimitLines.length > 0) {
        liabilityText = liabilityText.replace('{sub_limits}', pdfSubLimitLines.join('\n'))
      } else {
        liabilityText = liabilityText.replace(/\n*\{sub_limits\}\n*/g, '\n')
      }
    } else if (pdfSubLimitLines.length > 0) {
      liabilityText += '\n\n' + pdfSubLimitLines.join('\n')
      liabilityText += '\n\nUnder no circumstances is the Combined Single Limit detailed above to be exceeded.'
    }
    if (liabilityText) sectionMap.set('liability', ['Limit of Liability', (perVesselHeader + liabilityText).trim()])
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
      // Detect addl clauses that appear in ALL alternatives — treat as "both"
      const allAltIds = new Set(data.piAlternatives.map(a => a.id))
      const addlInAllAlts = new Set<string>()
      for (const ac of scopedAddls) {
        if (!ac.piAdditionalClauseId) continue
        const altsForThis = new Set(scopedAddls.filter(a => a.piAdditionalClauseId === ac.piAdditionalClauseId).map(a => a.alternativeId).filter(Boolean))
        if (allAltIds.size > 0 && [...allAltIds].every(id => altsForThis.has(id))) addlInAllAlts.add(ac.piAdditionalClauseId)
      }
      const trueScopedAddls = scopedAddls.filter(ac => !ac.piAdditionalClauseId || !addlInAllAlts.has(ac.piAdditionalClauseId))
      const promotedBothAddls = scopedAddls.filter(ac => ac.piAdditionalClauseId && addlInAllAlts.has(ac.piAdditionalClauseId))
      // Deduplicate promoted (keep first occurrence per piAdditionalClauseId)
      const seenPromoted = new Set<string>()
      const dedupedPromoted = promotedBothAddls.filter(ac => {
        if (seenPromoted.has(ac.piAdditionalClauseId!)) return false
        seenPromoted.add(ac.piAdditionalClauseId!)
        return true
      })
      if (trueScopedAddls.length > 0) {
        for (const alt of data.piAlternatives) {
          const altAddls = trueScopedAddls.filter(ac => ac.alternativeId === alt.id)
          if (altAddls.length > 0) {
            condText += `Applicable to Alternative ${data.piAlternatives.indexOf(alt) + 1}:\n`
            condText += renderAddlList(altAddls) + '\n'
          }
        }
      }
      const combinedBothAddls = [...sharedAddls, ...dedupedPromoted]
      if (combinedBothAddls.length > 0) {
        condText += `Applicable to both alternatives:\n`
        condText += renderAddlList(combinedBothAddls)
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

    const isMultiVessel = data.quotationVessels.length > 1
    const hasPerVesselValues = isMultiVessel && data.quotationVessels.some(v => v.agreedValue != null)
    const hmCurr = data.quotation.agreedValueCurrency || 'USD'

    // Per-alternative agreed values
    const hasPerAltValues = data.hullAlternatives.length > 1 && data.hullAlternatives.some(a => a.agreedValue != null)

    // Multi-value options (independent of alternatives)
    const hasValueOptions = data.agreedValueOptions.length > 0

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
      if (hasValueOptions) {
        avText += 'Section A:\n'
        for (const opt of data.agreedValueOptions) {
          const label = opt.label || `Option ${data.agreedValueOptions.indexOf(opt) + 1}`
          avText += `${label}  :  ${formatCurrency(opt.amount, opt.currency)}`
          avText += '\n'
        }
      } else if (hasPerAltValues) {
        avText += 'Section A:\n'
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          if (alt.agreedValue != null) {
            const altCurr = alt.agreedValueCurrency || hmCurr
            const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
            const altLabel = `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`
            avText += `${altLabel}  :  ${formatCurrency(alt.agreedValue, altCurr)}\n`
          }
        }
      } else if (hasPerVesselValues) {
        const avVesselsIv = data.quotationVessels.filter(v => v.agreedValue != null)
        const allSameAvIv = avVesselsIv.length > 1 && avVesselsIv.every(v => v.agreedValue === avVesselsIv[0].agreedValue)
        if (allSameAvIv) {
          avText += `Section A: ${formatCurrency(avVesselsIv[0].agreedValue ?? undefined, hmCurr)} each vessel\n`
        } else {
          avText += 'Section A:\n'
          for (const qv of avVesselsIv) {
            avText += `${qv.name || 'Unnamed'}  :  ${formatCurrency(qv.agreedValue ?? undefined, hmCurr)}\n`
          }
        }
      } else if (hasHm) {
        avText += `Section A: ${formatCurrency(data.quotation.agreedValue, hmCurr)}\n`
      }
      if (hasValueOptions) avText += '\n' // spacing between options and Section B
      const ivCurr = data.quotation.ivCurrency || 'USD'
      const hasPerVesselIv = isMultiVessel && data.quotationVessels.some(v => v.ivValue != null)
      if (hasPerVesselIv) {
        const ivVesselsP = data.quotationVessels.filter(v => v.ivValue != null)
        const allSameIvP = ivVesselsP.length > 1 && ivVesselsP.every(v => v.ivValue === ivVesselsP[0].ivValue)
        if (allSameIvP) {
          avText += `Section B: ${formatCurrency(ivVesselsP[0].ivValue ?? undefined, ivCurr)} each vessel\n`
        } else {
          avText += 'Section B:\n'
          for (const qv of ivVesselsP) {
            avText += `${qv.name || 'Unnamed'}  :  ${formatCurrency(qv.ivValue ?? undefined, ivCurr)}\n`
          }
        }
      } else {
        avText += `Section B: ${formatCurrency(data.quotation.ivValue, data.quotation.ivCurrency || 'USD')}\n`
      }
      sectionMap.set('agreedValue', ['Agreed Insured Value', avText.trim()])
    } else if (avItems.length > 0 || hasHm || hasPerAltValues || hasValueOptions) {
      // Standard agreed value — value not bold (body column), spacing between value and texts
      // Filter out IV items when IV is disabled
      const hmItems = avItems.filter(it => (it.section || 'hm') !== 'iv')
      let avText = ''
      if (hasValueOptions) {
        for (const opt of data.agreedValueOptions) {
          const label = opt.label || `Option ${data.agreedValueOptions.indexOf(opt) + 1}`
          avText += `${label}  :  ${formatCurrency(opt.amount, opt.currency)}`
          avText += '\n'
        }
        avText += '\n'
      } else if (hasPerAltValues) {
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          if (alt.agreedValue != null) {
            const altCurr = alt.agreedValueCurrency || hmCurr
            const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
            const altLabel = `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`
            avText += `${altLabel}  :  ${formatCurrency(alt.agreedValue, altCurr)}\n`
          }
        }
        avText += '\n'
      } else if (hasPerVesselValues) {
        const avVesselsStd = data.quotationVessels.filter(v => v.agreedValue != null)
        const allSameAvStd = avVesselsStd.length > 1 && avVesselsStd.every(v => v.agreedValue === avVesselsStd[0].agreedValue)
        if (allSameAvStd) {
          avText += `${formatCurrency(avVesselsStd[0].agreedValue ?? undefined, hmCurr)} each vessel\n\n`
        } else {
          for (const qv of avVesselsStd) {
            avText += `${qv.name || 'Unnamed'}  :  ${formatCurrency(qv.agreedValue ?? undefined, hmCurr)}\n`
          }
          avText += '\n'
        }
      } else if (hasHm) {
        avText += formatCurrency(data.quotation.agreedValue, hmCurr) + '\n\n'
      }
      for (const it of hmItems) {
        avText += it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels) + '\n'
      }
      sectionMap.set('agreedValue', ['Agreed Insured Value', avText.trim()])
    }
  }

  // Hull Conditions
  {
    const hc = data.hullConditions
    // Sort additional conditions by per-quotation order_index (falls back to settings order)
    const addlSettingsOrder = new Map(data.allHullAdditionalConditions.map((c, i) => [c.id, c.order ?? i]))
    const ha = [...data.hullAdditionalConditions].sort((a, b) => {
        if (a.order != null && b.order != null) return a.order - b.order
        return (addlSettingsOrder.get(a.hullAdditionalConditionId) ?? 999) - (addlSettingsOrder.get(b.hullAdditionalConditionId) ?? 999)
    })
    const alts = data.hullAlternatives
    if (hc.length > 0 || ha.length > 0) {
      const ivClauseId = data.quotation.ivClauseId
      const selectedIvClause = ivClauseId ? data.hullClauses.find(c => c.id === ivClauseId) : null
      const hasVesselScopedAlts = alts.some(a => a.vesselScopeId)
      const sharedAlts = alts.filter(a => !a.vesselScopeId)

      // Build effective alternatives list: for vessels with overrides, use their alts;
      // for vessels without overrides, render shared alts under the vessel name
      const vesselIdsWithOverrides = new Set(alts.filter(a => a.vesselScopeId).map(a => a.vesselScopeId!))
      const isPerVesselExport = hasVesselScopedAlts && data.quotationVessels.length >= 2
      let effectiveAlts: typeof alts
      if (isPerVesselExport) {
        // Build effective list: vessel-specific alts + shared alts expanded for non-override vessels
        const vesselSpecificAlts = alts.filter(a => a.vesselScopeId)
        const nonOverrideVessels = data.quotationVessels.filter(v => !vesselIdsWithOverrides.has(v.id))
        // For vessels without overrides, create virtual entries using shared alts
        const virtualAlts: typeof alts = []
        for (const v of nonOverrideVessels) {
          for (const sa of sharedAlts) {
            virtualAlts.push({ ...sa, vesselScopeId: v.id, id: `${sa.id}_virtual_${v.id}` })
          }
        }
        effectiveAlts = [...vesselSpecificAlts, ...virtualAlts]
      } else {
        effectiveAlts = alts
      }
      const multiAlt = effectiveAlts.length > 1 || isPerVesselExport

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
        const currency = data.quotation.premiumCurrency || 'USD'
        for (const qc of conds) {
          const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
          if (!def) continue
          // If vesselAmounts exist and differ, emit one line per vessel
          if (qc.vesselAmounts && def.hasAmount && Object.keys(qc.vesselAmounts).length > 0) {
            for (const vessel of data.quotationVessels) {
              const va = qc.vesselAmounts[vessel.id]
              if (va == null) continue
              let t = qc.textOverride || def.text
              if (def.amountPlaceholder && t.includes(def.amountPlaceholder)) {
                const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                t = t.replace(new RegExp(escaped, 'g'), formatCurrency(va, currency))
              } else {
                t = t.trimEnd() + ' ' + formatCurrency(va, currency)
              }
              const vName = `(M/V ${(vessel.name || vessel.vesselLabel).toUpperCase()})`
              pairs.push([`Cl. ${def.conditionNumber}`, `${t} ${vName}`])
            }
          } else {
            let t = qc.textOverride || def.text
            const amount = resolveAmount(qc)
            if (def.hasAmount && amount != null) {
              if (def.amountPlaceholder && t.includes(def.amountPlaceholder)) {
                const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                t = t.replace(new RegExp(escaped, 'g'), formatCurrency(amount, currency))
              } else {
                t = t.trimEnd() + ' ' + formatCurrency(amount, currency)
              }
            }
            const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
            pairs.push([`Cl. ${def.conditionNumber}`, `${t}${scope}`])
          }
        }
        return pairs
      }

      // Determine where each additional condition belongs
      const getAddlBelonging = (qa: typeof ha[0]): { type: 'alt'; altId: string } | { type: 'allAlts' } | { type: 'iv' } | { type: 'both' } => {
        const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
        if (!def) return { type: 'both' }
        const ids = def.hullClauseIds || []
        if (ids.length === 0) return { type: 'both' }
        const matchedAlts = effectiveAlts.filter(a => ids.includes(a.hullClauseId))
        const matchesIv = ivClauseId && ids.includes(ivClauseId)
        if (matchedAlts.length === effectiveAlts.length && matchesIv) return { type: 'both' }
        if (matchedAlts.length === effectiveAlts.length && !matchesIv) return multiAlt ? { type: 'allAlts' } : { type: 'both' }
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
          let condText = qa.textOverride || def.text
          if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
            const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            condText = condText.replace(new RegExp(escaped, 'g'), formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD'))
          }
          condText = condText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD').replace(/\{amount\}/g, qa.amount != null ? formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD') : '')
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          text += `- ${condText}${scope}\n`
        }
        return text
      }

      // Dedup IV conditions by hullConditionId (prefer alt-specific over null-scoped)
      const ivCondsRaw = hc.filter(qc => ivClauseId && getCondClauseId(qc) === ivClauseId)
      const ivConds: typeof ivCondsRaw = []
      const ivSeenIds = new Set<string>()
      for (const qc of ivCondsRaw) { if (qc.alternativeId) { ivSeenIds.add(qc.hullConditionId); ivConds.push(qc) } }
      for (const qc of ivCondsRaw) { if (!qc.alternativeId && !ivSeenIds.has(qc.hullConditionId)) { ivSeenIds.add(qc.hullConditionId); ivConds.push(qc) } }
      const hasIvSection = data.quotation.ivEnabled && (ivConds.length > 0 || selectedIvClause)

      // Merge alt-specific + null-scoped conditions, dedup by conditionId (prefer alt-specific)
      // For virtual alts (shared alts rendered for non-override vessels), resolve from the original shared alt
      const getAltCondsResolved = (alt: typeof alts[0]) => {
        const realAltId = alt.id.includes('_virtual_') ? alt.id.split('_virtual_')[0] : alt.id
        const ownConds = hc.filter(qc =>
          qc.alternativeId === realAltId &&
          getCondClauseId(qc) === alt.hullClauseId &&
          !(ivClauseId && getCondClauseId(qc) === ivClauseId)
        )
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
        // Group effective alts by vessel for per-vessel export
        if (isPerVesselExport) {
          // Group by vessel: each vessel gets its alternatives rendered as a section
          const vesselOrder = data.quotationVessels.map(v => v.id)
          const altsByVessel = new Map<string, typeof effectiveAlts>()
          for (const alt of effectiveAlts) {
            if (!alt.vesselScopeId) continue
            const existing = altsByVessel.get(alt.vesselScopeId) || []
            existing.push(alt)
            altsByVessel.set(alt.vesselScopeId, existing)
          }
          for (const vId of vesselOrder) {
            const vAlts = altsByVessel.get(vId) || []
            if (vAlts.length === 0) continue
            const vessel = data.quotationVessels.find(v => v.id === vId)
            const vesselTitle = vessel ? `M/V ${(vessel.name || vessel.vesselLabel).toUpperCase()}` : `Vessel`
            if (vAlts.length === 1) {
              const alt = vAlts[0]
              const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
              const altConds = getAltCondsResolved(alt)
              const realAltId = alt.id.includes('_virtual_') ? alt.id.split('_virtual_')[0] : alt.id
              hcBlocks.push({ title: vesselTitle, underline: true, desc: clause ? (clause.description || clause.name) : undefined, condPairs: getCondPairs(altConds), addl: renderAddlForSection(b => b.type === 'alt' && b.altId === realAltId) })
            } else {
              hcBlocks.push({ title: vesselTitle, underline: true })
              for (let ai = 0; ai < vAlts.length; ai++) {
                const alt = vAlts[ai]
                const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
                const altConds = getAltCondsResolved(alt)
                const realAltId = alt.id.includes('_virtual_') ? alt.id.split('_virtual_')[0] : alt.id
                hcBlocks.push({ title: `  Alternative ${ai + 1}`, desc: clause ? (clause.description || clause.name) : undefined, condPairs: getCondPairs(altConds), addl: renderAddlForSection(b => b.type === 'alt' && b.altId === realAltId) })
              }
            }
          }
        } else {
          // Standard multi-alt (no per-vessel)
          for (let i = 0; i < effectiveAlts.length; i++) {
            const alt = effectiveAlts[i]
            const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
            const altConds = getAltCondsResolved(alt)
            const altTitle = `Alternative ${i + 1}`
            hcBlocks.push({ title: altTitle, underline: true, desc: clause ? (clause.description || clause.name) : undefined, condPairs: getCondPairs(altConds), addl: renderAddlForSection(b => b.type === 'alt' && b.altId === alt.id) })
          }
        }
        const allAltsAddl = renderAddlForSection(b => b.type === 'allAlts')
        const bothAddl = renderAddlForSection(b => b.type === 'both')
        const allLabel = isPerVesselExport ? 'Applicable to all vessels' : 'Applicable to all alternatives'
        if (hasIvSection) {
          if (allAltsAddl) hcBlocks.push({ title: allLabel, underline: true, addl: allAltsAddl })
          hcBlocks.push({ title: 'Increased Value', underline: true, desc: selectedIvClause ? (selectedIvClause.description || selectedIvClause.name) : undefined, condPairs: getCondPairs(ivConds), addl: renderAddlForSection(b => b.type === 'iv') })
          if (bothAddl) hcBlocks.push({ title: 'Applicable to all sections', underline: true, addl: bothAddl })
        } else {
          // Merge allAlts + both into one block to avoid duplicate headers
          const combinedAddl = (allAltsAddl || '') + (bothAddl || '')
          if (combinedAddl) hcBlocks.push({ title: allLabel, underline: true, addl: combinedAddl })
        }
      } else if (hasIvSection) {
        const singleAlt = alts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        const hmClauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
        // Dedup H&M conditions by hullConditionId (prefer alt-specific over null-scoped)
        const hmCondsRaw = hc.filter(qc => hmClauseId && getCondClauseId(qc) === hmClauseId && !(ivClauseId && getCondClauseId(qc) === ivClauseId))
        const hmConds: typeof hmCondsRaw = []
        const hmSeenIds = new Set<string>()
        for (const qc of hmCondsRaw) { if (qc.alternativeId) { hmSeenIds.add(qc.hullConditionId); hmConds.push(qc) } }
        for (const qc of hmCondsRaw) { if (!qc.alternativeId && !hmSeenIds.has(qc.hullConditionId)) { hmSeenIds.add(qc.hullConditionId); hmConds.push(qc) } }
        hmConds.sort((a, b) => {
          const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
          const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
          return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
        })
        hcBlocks.push({ title: 'Hull and Machinery', underline: true, desc: selectedClause ? (selectedClause.description || selectedClause.name) : undefined, condPairs: getCondPairs(hmConds), addl: renderAddlForSection(b => b.type === 'alt' || b.type === 'allAlts') })
        hcBlocks.push({ title: 'Increased Value', underline: true, desc: selectedIvClause ? (selectedIvClause.description || selectedIvClause.name) : undefined, condPairs: getCondPairs(ivConds), addl: renderAddlForSection(b => b.type === 'iv') })
        const bothAddl = renderAddlForSection(b => b.type === 'both')
        if (bothAddl) hcBlocks.push({ title: 'Applicable to both sections', underline: true, addl: bothAddl })
      } else {
        const singleAlt = alts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        // Filter conditions to selected clause only, then deduplicate
        const clauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
        const clauseFilteredConds = clauseId
          ? hc.filter(qc => {
              const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
              return def && def.hullClauseId === clauseId
            })
          : hc
        const condMap = new Map<string, typeof hc[0]>()
        for (const qc of clauseFilteredConds) {
          const existing = condMap.get(qc.hullConditionId)
          if (!existing || (qc.alternativeId && !existing.alternativeId)) {
            condMap.set(qc.hullConditionId, qc)
          }
        }
        const dedupedConds = Array.from(condMap.values())
        dedupedConds.sort((a, b) => {
          const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
          const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
          return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
        })
        let addl = ''
        for (const qa of ha) {
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) continue
          // Filter: only include additional conditions linked to the selected clause (or unlinked)
          const linkedIds = def.hullClauseIds || []
          const clauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
          if (linkedIds.length > 0 && clauseId && !linkedIds.includes(clauseId)) continue
          let condText = qa.textOverride || def.text
          if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
            const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            condText = condText.replace(new RegExp(escaped, 'g'), formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD'))
          }
          condText = condText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD').replace(/\{amount\}/g, qa.amount != null ? formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD') : '')
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          addl += `- ${condText}${scope}\n`
        }
        hcBlocks.push({ desc: selectedClause ? (selectedClause.description || selectedClause.name) : undefined, condPairs: getCondPairs(dedupedConds), addl })
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
    const ddqListStr = [...ddqCountries].sort((a, b) => a.name.localeCompare(b.name)).map(c => c.name).join(', ')

    if (q.tradingWarrantyIntro) {
      tradingText += stripHtml(q.tradingWarrantyIntro) + '\n\n'
    }
    if (q.tradingCustomMode && q.tradingCustomWording) {
      // Custom mode: output custom wording instead of numbered paragraphs
      tradingText += stripHtml(q.tradingCustomWording) + '\n\n'
    } else {
      // Standard mode: numbered paragraphs
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
    }
    if (tradingText.trim()) {
      sectionMap.set('trading', ['Trading Warranty', tradingText.trim()])
    }
  }

  // Warranties
  {
    const wTypeCode = data.quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : data.quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : 'pi'
    const orderedWarranties = data.selectedWarrantyIds.map(id => data.allWarranties.find(w => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w)
        .filter(w => !w.typeScope || w.typeScope === 'all' || w.typeScope === wTypeCode)
    const sortedCustom = [...data.customWarranties].sort((a, b) => a.order - b.order)
    if (orderedWarranties.length > 0 || sortedCustom.length > 0) {
      let warText = ''
      const piMultiAltW = data.piAlternatives.length > 1

      const renderWarrantyList = (warIds: string[], customs: QuotationCustomWarranty[]) => {
        let t = ''
        for (const wid of warIds) {
          const w = data.allWarranties.find(ww => ww.id === wid)
          if (!w) continue
          if (w.typeScope && w.typeScope !== 'all' && w.typeScope !== wTypeCode) continue
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

      // Render survey warranties as bullet items (not for War quotations)
      const isWar = data.quotation.quotationTypeCode === 'W'
      const renderSurveyWarranties = (items: typeof data.surveyWarranties) => {
        if (isWar) return ''
        let t = ''
        for (const sw of items) {
          const scope = vesselScopeSuffix(sw.vesselScope, data.quotationVessels)
          t += `- ${sw.text}${scope}\n`
        }
        return t
      }

      if (piMultiAltW) {
        // Shared warranties first
        const sharedWarIds = data.selectedWarrantyIds.filter(id => !data.warrantyAltIds[id])
        const sharedCustom = sortedCustom.filter(cw => !cw.alternativeId)
        warText += renderWarrantyList(sharedWarIds, sharedCustom)
        // Per-alternative warranties
        for (let altIdx = 0; altIdx < data.piAlternatives.length; altIdx++) {
          const alt = data.piAlternatives[altIdx]
          const altWarIds = data.selectedWarrantyIds.filter(id => data.warrantyAltIds[id] === alt.id)
          const altCustom = sortedCustom.filter(cw => cw.alternativeId === alt.id)
          const altSurveyW = altIdx === 0 ? data.surveyWarranties.filter(sw => !sw.alternativeId || sw.alternativeId === alt.id) : data.surveyWarranties.filter(sw => sw.alternativeId === alt.id)
          if (altWarIds.length > 0 || altCustom.length > 0 || altSurveyW.length > 0) {
            warText += `\nAdditional Warranties Applicable to ${alt.label || `Alternative ${altIdx + 1}`}:\n`
            warText += renderWarrantyList(altWarIds, altCustom)
            warText += renderSurveyWarranties(altSurveyW)
          }
        }
      } else {
        warText += renderWarrantyList(data.selectedWarrantyIds, sortedCustom)
        // Survey warranties after regular warranties
        if (data.surveyWarranties.length > 0) {
          warText += renderSurveyWarranties(data.surveyWarranties)
        }
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
        const mainDesc = replaceDedPlaceholders(d.description, d.currency, d.secondaryAmount)
        // Per-vessel amounts: emit one line per vessel
        if (d.vesselAmounts && Object.keys(d.vesselAmounts).length > 0) {
          for (const vessel of data.quotationVessels) {
            const va = d.vesselAmounts[vessel.id]
            if (va == null) continue
            const vName = `(M/V ${(vessel.name || vessel.vesselLabel).toUpperCase()})`
            t += `${formatCurrency(va, d.currency)}  \u2014  ${mainDesc} ${vName}\n`
            if (d.secondaryDescription) {
              const secDesc = replaceDedPlaceholders(d.secondaryDescription, d.currency, d.secondaryAmount)
              t += `${d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : ''}  \u2014  ${secDesc} ${vName}\n`
            }
          }
        } else {
          t += `${formatCurrency(d.amount, d.currency)}  \u2014  ${mainDesc}${dScope}\n`
          if (d.secondaryDescription) {
            const secDesc = replaceDedPlaceholders(d.secondaryDescription, d.currency, d.secondaryAmount)
            t += `${d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : ''}  \u2014  ${secDesc}\n`
          }
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
      for (const td of data.textDeductibles) { const tdScope = vesselScopeSuffix(td.vesselScope, data.quotationVessels); dedText += td.text + tdScope + '\n\n' }
    }

    if (st(data, 'deductiblesAdditionalText')) dedText += '\n' + stripHtml(st(data, 'deductiblesAdditionalText')) + '\n\n'
    sectionMap.set('deductibles', ['Deductibles', dedText.trim()])
  }

  // Exclusions
  if (exclusionTexts.length > 0) {
    const piMultiAltE = data.piAlternatives.length > 1
    if (piMultiAltE) {
      let exclText = ''
      // Build text per exclusion item with alternativeId
      const allExclItems: { text: string; altId: string | null; exclId: string | null }[] = []
      for (const se of data.selectedExclusions) {
        const eScope = vesselScopeSuffix(se.vesselScope, data.quotationVessels)
        const t = se.customText ? se.customText + eScope : (se.piExclusionId ? ((data.allExclusions.find(e => e.id === se.piExclusionId)?.text || '') + eScope) : '')
        if (t) allExclItems.push({ text: t, altId: se.alternativeId || null, exclId: se.piExclusionId || null })
      }
      for (const ce of data.customExclusions) {
        const ceScope = vesselScopeSuffix(ce.vesselScope, data.quotationVessels)
        allExclItems.push({ text: ce.text + ceScope, altId: ce.alternativeId || null, exclId: null })
      }

      // Find common exclusions (same piExclusionId in all alternatives)
      const altIds = data.piAlternatives.map(a => a.id)
      const exclByAlt = new Map<string, Set<string>>()
      for (const item of allExclItems) {
        if (item.exclId && item.altId) {
          if (!exclByAlt.has(item.exclId)) exclByAlt.set(item.exclId, new Set())
          exclByAlt.get(item.exclId)!.add(item.altId)
        }
      }
      const commonExclIds = new Set<string>()
      for (const [exclId, alts] of exclByAlt) {
        if (altIds.every(aid => alts.has(aid))) commonExclIds.add(exclId)
      }

      // Shared (null alt) + common exclusions first
      const sharedItems = allExclItems.filter(e => !e.altId)
      const commonItems = allExclItems.filter(e => e.exclId && commonExclIds.has(e.exclId) && e.altId === altIds[0])
      const baseItems = [...sharedItems, ...commonItems]
      if (baseItems.length > 0) {
        exclText += baseItems.map(e => `- ${e.text}`).join('\n')
      }

      // Per-alternative additional exclusions (not common)
      for (const alt of data.piAlternatives) {
        const altOnly = allExclItems.filter(e => e.altId === alt.id && (!e.exclId || !commonExclIds.has(e.exclId)))
        if (altOnly.length > 0) {
          exclText += `\n\nAdditional exclusions applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:\n`
          exclText += altOnly.map(e => `- ${e.text}`).join('\n')
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
    const hullMultiAlt = data.hullAlternatives.length > 1 || data.hullAlternatives.some(a => a.vesselScopeId)
    const hullPerVessel = data.hullAlternatives.some(a => a.vesselScopeId)
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
    } else if (data.lolOptions.length > 0 && data.lolOptions.some(o => o.premiumAmount != null)) {
      for (const opt of data.lolOptions) {
        pdfPremLines.push({ label: opt.label || `Alternative ${data.lolOptions.indexOf(opt) + 1}`, tech: opt.premiumAmount || 0 })
      }
    } else if (q.premiumAmount != null || hullMultiAlt || (data.agreedValueOptions.length > 0 && data.agreedValueOptions.some(o => o.premiumAmount != null))) {
      if (hullMultiAlt) {
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
          let premLabel = `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`
          if (hullPerVessel && alt.vesselScopeId) {
            const vessel = data.quotationVessels.find(v => v.id === alt.vesselScopeId)
            if (vessel) premLabel = `${(vessel.name || vessel.vesselLabel).toUpperCase()}${clause ? ` (${clause.code})` : ''}`
          }
          pdfPremLines.push({ label: premLabel, tech: alt.premiumAmount || 0 })
        }
        if (q.ivEnabled && q.ivPremiumAmount != null) pdfPremLines.push({ label: 'IV', tech: q.ivPremiumAmount })
      } else if (data.agreedValueOptions.length > 0 && data.agreedValueOptions.some(o => o.premiumAmount != null)) {
        for (const opt of data.agreedValueOptions) {
          if (opt.premiumAmount != null) {
            pdfPremLines.push({ label: opt.label || `Option ${data.agreedValueOptions.indexOf(opt) + 1}`, tech: opt.premiumAmount })
          }
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
        if (hasVesselPremiums) {
          premText += 'Technical Premium\n'
          for (const l of pdfPremLines) {
            premText += `${l.label}    ${fc(l.tech)}${pa}\n`
          }
          const totalTech = pdfPremLines.reduce((s, l) => s + l.tech, 0)
          premText += `Total    ${fc(totalTech)}${pa}\n`
          premText += '\nPayable Premium\n'
          for (const l of pdfPremLines) {
            premText += `${l.label}    ${fc(computePayable(l.tech))}${pa}\n`
          }
          const totalPayable = computePayable(totalTech)
          premText += `Total    ${fc(totalPayable)}${pa}\n`
        } else {
          if (pdfPremLines.length > 1) premText += 'Technical Premium\n'
          for (const l of pdfPremLines) {
            premText += `${l.label || 'Technical Premium'}  ${fc(l.tech)}${pa}\n`
          }
          if (pdfPremLines.length > 1) premText += '\nPayable Premium\n'
          for (const l of pdfPremLines) {
            premText += `${l.label || 'Payable Premium'}  ${fc(computePayable(l.tech))}${pa}\n`
          }
        }
      } else {
        if (hasVesselPremiums) {
          for (const l of pdfPremLines) {
            premText += `${l.label}  :  ${fc(l.tech)}${pa}\n`
          }
          const totalTech = pdfPremLines.reduce((s, l) => s + l.tech, 0)
          premText += `Total  :  ${fc(totalTech)}${pa}\n`
        } else {
          for (const l of pdfPremLines) {
            premText += `${l.label}  ${fc(l.tech)}${pa}\n`
          }
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
          nrText = stripHtml(st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.')
        } else if (q.nonRefundableType === 'percentage' && q.nonRefundablePercent) {
          nrText = stripHtml((st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(q.nonRefundablePercent!)))
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
            nrText = stripHtml(st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.')
          } else if (q.nonRefundableType === 'percentage' && q.nonRefundablePercent) {
            nrText = stripHtml((st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(q.nonRefundablePercent!)))
          }
          if (nrText) instLine += ' \u2014 ' + nrText
        }
        premText += instLine + '\n'
      }
      if (data.instalments.length > 0) premText += '\n'
    }
    if (q.premiumAdditionalText) premText += stripHtml(q.premiumAdditionalText) + '\n\n'
    if (st(data, 'premiumCondition')) premText += stripHtml(st(data, 'premiumCondition')) + '\n\n'
    if (st(data, 'premiumEarned')) premText += stripHtml(st(data, 'premiumEarned')) + '\n\n'
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

  // Cargo-specific sections
  if (data.quotation.quotationTypeCode === 'C') {
    // Insured Value
    if (data.quotation.insuredValueAmount != null) {
      let ivText = `${data.quotation.insuredValueCurrency || 'USD'} ${formatAmountOnly(data.quotation.insuredValueAmount)}`
      if (data.quotation.insuredValueText) ivText += `\n${stripHtml(data.quotation.insuredValueText)}`
      sectionMap.set('insuredValue', ['Insured Value', ivText])
    }

    // Voyage/Period
    {
      let voyageText = ''
      if (data.quotation.portOfLoading || data.quotation.portOfDestination) {
        voyageText = `From Commencement of Loading at ${data.quotation.portOfLoading || 'TBA'} (Port of Loading) to completion of discharge at ${data.quotation.portOfDestination || 'TBA'} (Port of Destination)`
      }
      if (data.quotation.estimatedDeparture) {
        if (voyageText) voyageText += '\n\n'
        voyageText += data.quotation.estimatedDeparture
      }
      if (data.quotation.voyageText) {
        if (voyageText) voyageText += '\n\n'
        voyageText += stripHtml(data.quotation.voyageText)
      }
      if (voyageText) sectionMap.set('voyage', ['Voyage / Period (Port to Port Risks Only)', voyageText])
    }

    // Subject Matter Insured
    if (data.quotation.subjectMatter) {
      sectionMap.set('subjectMatter', ['Subject Matter Insured', stripHtml(data.quotation.subjectMatter)])
    }

    // Conditions
    {
      const condLines: string[] = []
      // Institute Cargo Clause (main clause)
      if (data.quotation.cargoClauseId) {
        const icc = data.cargoInstituteClauses.find(c => c.id === data.quotation.cargoClauseId)
        if (icc) condLines.push(`- ${icc.code ? icc.code + ' ' : ''}${icc.name}`)
      }
      // Additional conditions
      condLines.push(...data.cargoConditionClauses.map(c => `- ${c.textOverride || (c.code ? `${c.code} ` : '') + (c.title || '')}`))
      condLines.push(...data.cargoConditionCustom.map(c => `- ${c.text}`))
      if (condLines.length > 0) sectionMap.set('cargoConditions', ['Conditions', condLines.join('\n')])
    }

    // Special Conditions
    {
      const specLines = [
        ...data.cargoSpecialClauses.map(c => `- ${c.textOverride || (c.code ? `${c.code} ` : '') + (c.title || '')}`),
        ...data.cargoSpecialCustom.map(c => `- ${c.text}`)
      ]
      if (specLines.length > 0) sectionMap.set('cargoSpecial', ['Special Conditions', specLines.join('\n')])
    }

    // Law & Jurisdiction
    {
      const lawLines = [
        ...data.cargoLawClauses.map(c => {
          const text = c.textOverride || c.text || c.title || ''
          return `- ${text}`
        }),
        ...data.cargoLawCustom.map(c => `- ${c.text}`)
      ]
      if (lawLines.length > 0) sectionMap.set('cargoLaw', ['Law and Jurisdiction', lawLines.join('\n')])
    }

    // Rate/Premium for cargo
    if (data.quotation.premiumType === 'rate' && data.quotation.premiumRate != null) {
      let premText = `${data.quotation.premiumRate}%`
      if (data.quotation.insuredValueAmount) {
        const calcPremium = data.quotation.insuredValueAmount * data.quotation.premiumRate / 100
        premText += `\nPremium: ${formatCurrency(calcPremium, data.quotation.premiumCurrency || data.quotation.insuredValueCurrency)}`
      }
      sectionMap.set('premium', ['Rate / Premium', premText])
    }
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

  // Important Notice - title centered, body left-aligned
  const _pdfInTypeKey = data.quotation.quotationTypeCode === 'P' ? 'importantNoticePI' : data.quotation.quotationTypeCode === 'H' ? 'importantNoticeHull' : data.quotation.quotationTypeCode === 'W' ? 'importantNoticeWar' : ''
  const _pdfInText = (_pdfInTypeKey && st(data, _pdfInTypeKey as keyof PISectionTexts)) || st(data, 'importantNotice')
  if (_pdfInText) {
    const plainNotice = stripHtml(_pdfInText)
    if (plainNotice.startsWith('IMPORTANT NOTICE')) {
      addWrappedText('IMPORTANT NOTICE', true, true)
      addWrappedText(plainNotice.replace(/^IMPORTANT NOTICE\n*/, ''), false, false)
    } else {
      addWrappedText(_pdfInText, false, false)
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
    ? formatDateLong(data.quotation.quotationDate)
    : ''

  // ---- Renewal change-highlighting: load original quotation data ----
  let origData: QuotationData | null = null
  if (quotation.renewedFromPolicyId) {
    try {
      const policy = await window.api.policyGetById(quotation.renewedFromPolicyId)
      if (policy?.quotationId) {
        const origQuotation = await window.api.getQuotation(policy.quotationId)
        if (origQuotation) {
          origData = await gatherData(origQuotation)
        }
      }
    } catch { /* no comparison available — export without highlights */ }
  }

  // Build sets from original data for quick lookups
  const origWarrantyIds = new Set(origData?.selectedWarrantyIds || [])
  const origCustomWarrantyTexts = new Set((origData?.customWarranties || []).map(cw => cw.text))
  const origClauseIds = new Set(origData?.selectedClauseIds || [])
  const origExclusionPiIds = new Set(
    (origData?.selectedExclusions || []).filter(e => e.piExclusionId).map(e => e.piExclusionId!)
  )
  const origCustomExclusionTexts = new Set((origData?.customExclusions || []).map(ce => ce.text))
  const origDeductiblePiIds = new Set((origData?.deductibles || []).map(d => d.piDeductibleId).filter(Boolean))
  const origTextDeductibleTexts = new Set((origData?.textDeductibles || []).map(td => td.text))
  const origSubjectivityPiIds = new Set(
    (origData?.subjectivities || []).map(s => (s as any).piSubjectivityId).filter(Boolean)
  )
  const origAdditionalClauseIds = new Set(
    (origData?.additionalClauses || []).filter(ac => ac.piAdditionalClauseId).map(ac => ac.piAdditionalClauseId!)
  )
  const origSurveyWarrantyTexts = new Set((origData?.surveyWarranties || []).map(sw => sw.text))
  const origHullConditionIds = new Set((origData?.hullConditions || []).map(hc => hc.hullConditionId))
  const origHullAdditionalConditionIds = new Set(
    (origData?.hullAdditionalConditions || []).map(ha => ha.hullAdditionalConditionId)
  )
  const origWarConditionIds = new Set((origData?.warConditions || []).map(wc => wc.warConditionId))
  const RED = 'FF0000'

  // Paragraph helpers - 11pt Arial black, line spacing 1.0 (with optional color for change highlighting)
  const np = (text: string, color?: string) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: color || '000000' })]
  })

  const bp = (text: string, color?: string) => new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: color || '000000', bold: true })]
  })
  const bup = (text: string) => new Paragraph({
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true, underline: {} })]
  })

  const bulletP = (text: string, color?: string) => new Paragraph({
    numbering: { reference: 'dash-bullet', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 40, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: color || '000000' })]
  })

  // Strikethrough red bullet for removed items
  const strikeP = (text: string) => new Paragraph({
    numbering: { reference: 'dash-bullet', level: 0 },
    spacing: { after: 40, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: RED, strike: true })]
  })

  const emptyP = () => new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [] })

  const mp = (text: string, color?: string): Paragraph[] => {
    if (!text) return []
    if (isHtml(text)) return parseHtmlToParagraphs(text, { size: 22, font: 'Arial', color: color || '000000', alignment: AlignmentType.JUSTIFIED })
    return text.split('\n').map(p =>
      p.trim() ? np(p, color) : emptyP()
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
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: title, bold: true, size: 22, font: 'Arial', color: '000000' })]
          })]
        }),
        new TableCell({
          width: { size: BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 100, left: 80, right: 80 },
          children: content.length > 0 ? content : [emptyP()]
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
      if (data.assuredGroups.length > 0) {
        // Render by group
        const groupRows: TableRow[] = []
        for (const group of data.assuredGroups) {
          const groupAssureds = data.assureds.filter(a => a.groupId === group.id)
          if (groupAssureds.length === 0) continue
          // Group header row (spans 2 columns)
          groupRows.push(new TableRow({
            children: [new TableCell({
              borders: noBorders(),
              columnSpan: 2,
              children: [new Paragraph({
                spacing: { before: groupRows.length > 0 ? 120 : 0, after: 0 },
                children: [new TextRun({ text: group.name.toUpperCase(), bold: true, size: 22, font: 'Arial', color: '000000' })]
              })]
            })]
          }))
          // Assured rows under this group
          for (const a of groupAssureds) {
            groupRows.push(new TableRow({
              children: [
                new TableCell({
                  borders: noBorders(),
                  width: { size: Math.round(BODY_W * 0.60), type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: a.name, size: 22, font: 'Arial', color: '000000' })] })]
                }),
                new TableCell({
                  borders: noBorders(),
                  width: { size: Math.round(BODY_W * 0.40), type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: a.role ? `"as ${a.role}"` : '', size: 22, font: 'Arial', color: '000000' })] })]
                })
              ]
            }))
          }
        }
        // Ungrouped assureds (if any)
        const ungrouped = data.assureds.filter(a => !a.groupId)
        for (const a of ungrouped) {
          groupRows.push(new TableRow({
            children: [
              new TableCell({
                borders: noBorders(),
                width: { size: Math.round(BODY_W * 0.60), type: WidthType.DXA },
                children: [new Paragraph({
                  spacing: { before: groupRows.length > 0 && ungrouped.indexOf(a) === 0 ? 120 : 0, after: 0 },
                  children: [new TextRun({ text: a.name, size: 22, font: 'Arial', color: '000000' })]
                })]
              }),
              new TableCell({
                borders: noBorders(),
                width: { size: Math.round(BODY_W * 0.40), type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: a.role ? `"as ${a.role}"` : '', size: 22, font: 'Arial', color: '000000' })] })]
              })
            ]
          }))
        }
        if (groupRows.length > 0) {
          insuredContent.push(new Table({
            width: { size: BODY_W, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            rows: groupRows
          }))
        }
      } else {
        // Legacy — flat list with optional vessel labels
        const wordHasVesselLabels = data.quotationVessels.length > 1 && data.assureds.some(a => a.vesselLabel)
        const wordSeenLabels = new Set<string>()
        insuredContent.push(new Table({
          width: { size: BODY_W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          rows: data.assureds.map(a => {
            const labelKey = a.vesselLabel || ''
            const isFirstOfLabel = !wordSeenLabels.has(labelKey)
            wordSeenLabels.add(labelKey)
            return new TableRow({
              children: [
                ...(wordHasVesselLabels ? [new TableCell({
                  borders: noBorders(),
                  width: { size: Math.round(BODY_W * 0.06), type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: isFirstOfLabel ? labelKey : '', size: 22, font: 'Arial', color: '000000', bold: true })] })]
                })] : []),
                new TableCell({
                  borders: noBorders(),
                  width: { size: Math.round(BODY_W * (wordHasVesselLabels ? 0.54 : 0.60)), type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: a.name, size: 22, font: 'Arial', color: '000000' })] })]
                }),
                new TableCell({
                  borders: noBorders(),
                  width: { size: Math.round(BODY_W * 0.40), type: WidthType.DXA },
                  children: [new Paragraph({ children: [new TextRun({ text: a.role ? `"as ${a.role}"` : '', size: 22, font: 'Arial', color: '000000' })] })]
                })
              ]
            })
          })
        }))
      }
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
    // Column widths: Vx narrow, then proportional for content
    const vW = {
      label: Math.round(BODY_W * 0.05),  // ~4mm for V1-V9
      name:  Math.round(BODY_W * 0.22),
      imo:   Math.round(BODY_W * 0.13),
      built: Math.round(BODY_W * 0.09),
      gt:    Math.round(BODY_W * 0.10),
      flag:  Math.round(BODY_W * 0.11),
      type:  Math.round(BODY_W * 0.10),
    }
    const vClassW = BODY_W - (showVesselLabel ? vW.label : 0) - vW.name - vW.imo - vW.built - vW.gt - vW.flag - vW.type
    const vColWidths = showVesselLabel
      ? [vW.label, vW.name, vW.imo, vW.built, vW.gt, vW.flag, vW.type, vClassW]
      : [vW.name + vW.label, vW.imo, vW.built, vW.gt, vW.flag, vW.type, vClassW]
    const makeVCell = (text: string, header = false, w?: number) => new TableCell({
      ...(w ? { width: { size: w, type: WidthType.DXA } } : {}),
      children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text, bold: header, size: 20, font: 'Arial', color: '000000' })] })],
      ...(header ? { shading: { type: ShadingType.SOLID, color: 'F0F0F0' } } : {})
    })
    const vesselHeaders = showVesselLabel
      ? ['', 'Name', 'IMO', 'Built', 'GT', 'Flag', 'Type', 'Class']
      : ['Name', 'IMO', 'Built', 'GT', 'Flag', 'Type', 'Class']
    const vesselTable = new Table({
      width: { size: BODY_W, type: WidthType.DXA },
      columnWidths: vColWidths,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          tableHeader: true,
          children: vesselHeaders.map((h, i) => makeVCell(h, true, vColWidths[i]))
        }),
        ...data.quotationVessels.map(qv => {
          const vi = getVesselInfo(qv, data.allVessels, data.flagStates, data.vesselClassificationNames)
          const flagDisplay = vi.flagCode || vi.flag || '-'
          const cells = showVesselLabel
            ? [qv.vesselLabel, vi.name, vi.imo || '-', formatBuiltYear(vi.built, vi.rebuilt), vi.gt ? Number(vi.gt).toLocaleString() : '-', flagDisplay, vi.type || '-', vi.classification || '-']
            : [vi.name, vi.imo || '-', formatBuiltYear(vi.built, vi.rebuilt), vi.gt ? Number(vi.gt).toLocaleString() : '-', flagDisplay, vi.type || '-', vi.classification || '-']
          return new TableRow({ children: cells.map((v, i) => makeVCell(v, false, vColWidths[i])) })
        })
      ]
    })
    const vesselTitle = data.quotationVessels.length > 1 ? 'Insured Vessels' : 'Insured Vessel'
    const vesselContent: (Paragraph | Table)[] = [vesselTable]
    if (data.quotation.anyOtherVessel) {
      vesselContent.push(emptyP())
      vesselContent.push(np('Any other vessel(s) to be agreed by Insurers in advance.'))
    }
    rowMap.set('vessel', makeRow(vesselTitle, vesselContent))
  }

  // ---- Limit of Liability ----
  {
    const liabContent: (Paragraph | Table)[] = []
    const cur = data.quotation.limitOfLiabilityCurrency || 'USD'
    const baseAmt = data.quotation.limitOfLiabilityAmount
    const lolVA = data.quotation.limitOfLiabilityVesselAmounts
    const multiVessel = data.quotationVessels.length >= 2

    // Per-alternative LOL (P&I with 2+ alternatives) or LOL options
    const dHasLolOptions = data.lolOptions.length > 0
    const dPiAltLol = !dHasLolOptions && data.piAlternatives.length > 1 && data.piAlternatives.some(a => a.lolAmount != null)

    // Determine if per-vessel amounts differ
    let hasDifferentLol = false
    if (!dPiAltLol && !dHasLolOptions && multiVessel && lolVA && Object.keys(lolVA).length > 0) {
      const amounts = data.quotationVessels.map(qv => lolVA[qv.id] ?? baseAmt)
      hasDifferentLol = amounts.some(a => a !== amounts[0])
    }

    // Per-vessel lines at the top when amounts differ
    if (hasDifferentLol) {
      for (const qv of data.quotationVessels) {
        const amt = lolVA![qv.id] ?? baseAmt
        if (amt == null) continue
        const vName = (qv.name || qv.vesselLabel).toUpperCase()
        liabContent.push(np(`${vName}: ${formatCurrency(amt, cur)}`))
      }
      liabContent.push(emptyP())
    }

    // Build the amount string for the template
    let amountDisplay: string
    if (dHasLolOptions) {
      amountDisplay = ''
    } else if (dPiAltLol) {
      amountDisplay = 'values as per below'
    } else if (hasDifferentLol) {
      amountDisplay = 'values as per above'
    } else if (multiVessel && baseAmt != null) {
      amountDisplay = `${formatAmountOnly(baseAmt)} (all vessels)`
    } else {
      amountDisplay = baseAmt != null ? formatAmountOnly(baseAmt) : ''
    }

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
      if (wordSubLimitParas.length > 0) {
        out.push(...wordSubLimitParas)
        out.push(emptyP())
      }
      if (parts[1]?.trim()) out.push(...mp(parts[1].trim()))
      return out
    }
    // LOL option lines — alternatives first, then shared text
    if (dHasLolOptions) {
      for (const opt of data.lolOptions) {
        const optCur = opt.currency || cur
        liabContent.push(np(`${opt.label || `Alternative ${data.lolOptions.indexOf(opt) + 1}`}: ${formatCurrency(opt.amount, optCur)}`))
      }
      liabContent.push(emptyP())
    }

    if (data.quotation.limitOfLiabilityText) {
      const cleaned = data.quotation.limitOfLiabilityText.replace('{amount}', amountDisplay).replace('{currency}', cur).replace(/  +/g, ' ').trim()
      liabContent.push(...injectSubLimits(cleaned))
    } else if (st(data, 'limitOfLiabilityDefaultText') && (baseAmt != null || dHasLolOptions)) {
      const lolText = st(data, 'limitOfLiabilityDefaultText')
        .replace('{amount}', amountDisplay)
        .replace('{currency}', cur)
        .replace(/  +/g, ' ').trim()
      liabContent.push(...injectSubLimits(lolText))
    } else if (baseAmt != null || dHasLolOptions) {
      liabContent.push(np(`${amountDisplay} all claims in the aggregate.`.replace(/  +/g, ' ').trim()))
    }

    // Per-alternative LOL lines
    if (dPiAltLol) {
      liabContent.push(emptyP())
      for (let ai = 0; ai < data.piAlternatives.length; ai++) {
        const alt = data.piAlternatives[ai]
        const altCur = alt.lolCurrency || cur
        const altAmt = alt.lolAmount
        if (altAmt == null) continue
        liabContent.push(np(`${alt.label || `Alternative ${ai + 1}`}: ${formatCurrency(altAmt, altCur)} all claims in the aggregate`))
      }
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
    const periodChanged = origData && data.quotation.periodText !== origData.quotation.periodText
    rowMap.set('period', makeRow('Period', mp(data.quotation.periodText, periodChanged ? RED : undefined)))
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
        const isNewClause = origData && !origClauseIds.has(c.id)
        const clauseColor = isNewClause ? RED : '000000'
        return new TableRow({
          children: [
            new TableCell({ width: { size: clauseRefW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: `Section B Cl.${c.clauseNumber}`, size: 22, font: 'Arial', color: clauseColor })] })] }),
            new TableCell({ width: { size: clauseDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: rightText, size: 22, font: 'Arial', color: clauseColor })] })] })
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
        const isNewAddl = origData && ac.piAdditionalClauseId && !origAdditionalClauseIds.has(ac.piAdditionalClauseId)
        const addlColor = isNewAddl ? RED : '000000'
        return new Paragraph({
          numbering: { reference: 'dash-bullet', level: 0 },
          spacing: { after: 100 },
          children: [
            ...(code ? [new TextRun({ text: code + ' ', size: 22, font: 'Arial', color: addlColor })] : []),
            new TextRun({ text: text + acScope, size: 22, font: 'Arial', color: addlColor })
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
      // Detect addl clauses that appear in ALL alternatives — treat as "both"
      const dAllAltIds = new Set(data.piAlternatives.map(a => a.id))
      const dAddlInAllAlts = new Set<string>()
      for (const ac of dScopedAddls) {
        if (!ac.piAdditionalClauseId) continue
        const altsForThis = new Set(dScopedAddls.filter(a => a.piAdditionalClauseId === ac.piAdditionalClauseId).map(a => a.alternativeId).filter(Boolean))
        if (dAllAltIds.size > 0 && [...dAllAltIds].every(id => altsForThis.has(id))) dAddlInAllAlts.add(ac.piAdditionalClauseId)
      }
      const dTrueScopedAddls = dScopedAddls.filter(ac => !ac.piAdditionalClauseId || !dAddlInAllAlts.has(ac.piAdditionalClauseId))
      const dPromotedBothAddls = dScopedAddls.filter(ac => ac.piAdditionalClauseId && dAddlInAllAlts.has(ac.piAdditionalClauseId))
      const dSeenPromoted = new Set<string>()
      const dDedupedPromoted = dPromotedBothAddls.filter(ac => {
        if (dSeenPromoted.has(ac.piAdditionalClauseId!)) return false
        dSeenPromoted.add(ac.piAdditionalClauseId!)
        return true
      })
      if (dTrueScopedAddls.length > 0) {
        for (const alt of data.piAlternatives) {
          const altAddls = dTrueScopedAddls.filter(ac => ac.alternativeId === alt.id)
          if (altAddls.length > 0) {
            condContent.push(bup(`Applicable to Alternative ${data.piAlternatives.indexOf(alt) + 1}:`))
            condContent.push(...makeAddlBullets(altAddls))
            condContent.push(emptyP())
          }
        }
      }
      const dCombinedBothAddls = [...dSharedAddls, ...dDedupedPromoted]
      if (dCombinedBothAddls.length > 0) {
        condContent.push(bup('Applicable to both alternatives:'))
        condContent.push(...makeAddlBullets(dCombinedBothAddls))
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

    const dIsMultiVessel = data.quotationVessels.length > 1
    const dHasPerVesselValues = dIsMultiVessel && data.quotationVessels.some(v => v.agreedValue != null)
    const dHmCurr = data.quotation.agreedValueCurrency || 'USD'

    // Per-alternative agreed values
    const dHasPerAltValues = data.hullAlternatives.length > 1 && data.hullAlternatives.some(a => a.agreedValue != null)

    // Multi-value options (independent of alternatives)
    const dHasValueOptions = data.agreedValueOptions.length > 0

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
      const avContent: (Paragraph | Table)[] = []
      const avColonW2 = 200
      const avNameW2 = Math.round(BODY_W * 0.40)
      const avAmtW2 = BODY_W - avNameW2 - avColonW2
      const avCell2 = (text: string, bold = false, w?: number) => new TableCell({
        borders: noBorders(),
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text, size: 22, font: 'Arial', bold, color: '000000' })] })]
      })
      const avRow2 = (name: string, amount: string) => new TableRow({
        children: [avCell2(name, false, avNameW2), avCell2(':', false, avColonW2), avCell2(amount, false, avAmtW2)]
      })
      if (dHasValueOptions) {
        avContent.push(np('Section A:'))
        const avOptRows: TableRow[] = []
        for (const opt of data.agreedValueOptions) {
          const label = opt.label || `Option ${data.agreedValueOptions.indexOf(opt) + 1}`
          const valText = formatCurrency(opt.amount, opt.currency)
          avOptRows.push(avRow2(label, valText))
        }
        avContent.push(new Table({ rows: avOptRows, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW2, avColonW2, avAmtW2], layout: TableLayoutType.FIXED }))
      } else if (dHasPerAltValues) {
        avContent.push(np('Section A:'))
        const avAltRows: TableRow[] = []
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          if (alt.agreedValue != null) {
            const altCurr = alt.agreedValueCurrency || dHmCurr
            const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
            const altLabel = `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`
            avAltRows.push(avRow2(altLabel, formatCurrency(alt.agreedValue, altCurr)))
          }
        }
        avContent.push(new Table({ rows: avAltRows, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW2, avColonW2, avAmtW2], layout: TableLayoutType.FIXED }))
      } else if (dHasPerVesselValues) {
        const avVessels2 = data.quotationVessels.filter(v => v.agreedValue != null)
        const allSameAv2 = avVessels2.length > 1 && avVessels2.every(v => v.agreedValue === avVessels2[0].agreedValue)
        if (allSameAv2) {
          avContent.push(np(`Section A: ${formatCurrency(avVessels2[0].agreedValue ?? undefined, dHmCurr)} each vessel`))
        } else {
          avContent.push(np('Section A:'))
          const avRows2: TableRow[] = []
          for (const qv of avVessels2) {
            avRows2.push(avRow2(qv.name || 'Unnamed', formatCurrency(qv.agreedValue ?? undefined, dHmCurr)))
          }
          avContent.push(new Table({ rows: avRows2, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW2, avColonW2, avAmtW2], layout: TableLayoutType.FIXED }))
        }
      } else if (dHasHm) {
        avContent.push(np(`Section A: ${formatCurrency(data.quotation.agreedValue, dHmCurr)}`))
      }
      if (dHasValueOptions) avContent.push(emptyP()) // spacing between options and Section B
      const dIvCurr = data.quotation.ivCurrency || 'USD'
      const dHasPerVesselIv = dIsMultiVessel && data.quotationVessels.some(v => v.ivValue != null)
      if (dHasPerVesselIv) {
        const ivVessels2 = data.quotationVessels.filter(v => v.ivValue != null)
        const allSameIv2 = ivVessels2.length > 1 && ivVessels2.every(v => v.ivValue === ivVessels2[0].ivValue)
        if (allSameIv2) {
          avContent.push(np(`Section B: ${formatCurrency(ivVessels2[0].ivValue ?? undefined, dIvCurr)} each vessel`))
        } else {
          avContent.push(np('Section B:'))
          const ivRows2: TableRow[] = []
          for (const qv of ivVessels2) {
            ivRows2.push(avRow2(qv.name || 'Unnamed', formatCurrency(qv.ivValue ?? undefined, dIvCurr)))
          }
          avContent.push(new Table({ rows: ivRows2, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW2, avColonW2, avAmtW2], layout: TableLayoutType.FIXED }))
        }
      } else {
        avContent.push(np(`Section B: ${formatCurrency(data.quotation.ivValue, data.quotation.ivCurrency || 'USD')}`))
      }
      rowMap.set('agreedValue', makeRow('Agreed Insured Value', avContent))
    } else if (avItems.length > 0 || dHasHm || dHasPerAltValues || dHasValueOptions) {
      // Standard agreed value — value not bold, spacing between value and texts
      // Filter out IV items when IV is disabled
      const dHmItems = avItems.filter(it => (it.section || 'hm') !== 'iv')
      const avContent: (Paragraph | Table)[] = []
      const avColonW3 = 200
      const avNameW3 = Math.round(BODY_W * 0.40)
      const avAmtW3 = BODY_W - avNameW3 - avColonW3
      const avCell3 = (text: string, bold = false, w?: number) => new TableCell({
        borders: noBorders(),
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text, size: 22, font: 'Arial', bold, color: '000000' })] })]
      })
      const avRow3 = (name: string, amount: string) => new TableRow({
        children: [avCell3(name, false, avNameW3), avCell3(':', false, avColonW3), avCell3(amount, false, avAmtW3)]
      })
      if (dHasValueOptions) {
        const avOptRows3: TableRow[] = []
        for (const opt of data.agreedValueOptions) {
          const label = opt.label || `Option ${data.agreedValueOptions.indexOf(opt) + 1}`
          const valText = formatCurrency(opt.amount, opt.currency)
          avOptRows3.push(avRow3(label, valText))
        }
        avContent.push(new Table({ rows: avOptRows3, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW3, avColonW3, avAmtW3], layout: TableLayoutType.FIXED }))
        avContent.push(emptyP())
      } else if (dHasPerAltValues) {
        const avAltRows3: TableRow[] = []
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          if (alt.agreedValue != null) {
            const altCurr = alt.agreedValueCurrency || dHmCurr
            const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
            const altLabel = `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`
            avAltRows3.push(avRow3(altLabel, formatCurrency(alt.agreedValue, altCurr)))
          }
        }
        avContent.push(new Table({ rows: avAltRows3, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW3, avColonW3, avAmtW3], layout: TableLayoutType.FIXED }))
        avContent.push(emptyP())
      } else if (dHasPerVesselValues) {
        const avVesselsStd = data.quotationVessels.filter(v => v.agreedValue != null)
        const allSameAvStd = avVesselsStd.length > 1 && avVesselsStd.every(v => v.agreedValue === avVesselsStd[0].agreedValue)
        if (allSameAvStd) {
          avContent.push(np(`${formatCurrency(avVesselsStd[0].agreedValue ?? undefined, dHmCurr)} each vessel`))
        } else {
          const avStdRows: TableRow[] = []
          for (const qv of avVesselsStd) {
            avStdRows.push(avRow3(qv.name || 'Unnamed', formatCurrency(qv.agreedValue ?? undefined, dHmCurr)))
          }
          avContent.push(new Table({ rows: avStdRows, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [avNameW3, avColonW3, avAmtW3], layout: TableLayoutType.FIXED }))
        }
        avContent.push(emptyP())
      } else if (dHasHm) {
        avContent.push(np(formatCurrency(data.quotation.agreedValue, dHmCurr)))
        avContent.push(emptyP())
      }
      for (const it of dHmItems) {
        avContent.push(np(it.text + vesselScopeSuffix(it.vesselScope, data.quotationVessels)))
      }
      rowMap.set('agreedValue', makeRow('Agreed Insured Value', avContent))
    }
  }

  // ---- Hull Conditions ----
  {
    const hc = data.hullConditions
    // Sort additional conditions by per-quotation order_index (falls back to settings order)
    const dAddlSettingsOrder = new Map(data.allHullAdditionalConditions.map((c, i) => [c.id, c.order ?? i]))
    const ha = [...data.hullAdditionalConditions].sort((a, b) => {
        if (a.order != null && b.order != null) return a.order - b.order
        return (dAddlSettingsOrder.get(a.hullAdditionalConditionId) ?? 999) - (dAddlSettingsOrder.get(b.hullAdditionalConditionId) ?? 999)
    })
    const dAlts = data.hullAlternatives
    if (hc.length > 0 || ha.length > 0) {
      const hcContent: (Paragraph | Table)[] = []
      const condTableW = BODY_W
      const condCol1W = Math.round(condTableW * 0.30)
      const condCol2W = condTableW - condCol1W
      const noBordersObj = () => ({ top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } })
      const dIvClauseId = data.quotation.ivClauseId
      const dSelectedIvClause = dIvClauseId ? data.hullClauses.find(c => c.id === dIvClauseId) : null
      const dHasVesselScopedAlts = dAlts.some(a => a.vesselScopeId)
      const dSharedAlts = dAlts.filter(a => !a.vesselScopeId)
      const dVesselIdsWithOverrides = new Set(dAlts.filter(a => a.vesselScopeId).map(a => a.vesselScopeId!))
      const dIsPerVessel = dHasVesselScopedAlts && data.quotationVessels.length >= 2
      // Build effective alt list: vessel-specific + shared expanded for non-override vessels
      let dEffectiveAlts: typeof dAlts
      if (dIsPerVessel) {
        const dVesselSpecific = dAlts.filter(a => a.vesselScopeId)
        const dNonOverrideVessels = data.quotationVessels.filter(v => !dVesselIdsWithOverrides.has(v.id))
        const dVirtualAlts: typeof dAlts = []
        for (const v of dNonOverrideVessels) {
          for (const sa of dSharedAlts) {
            dVirtualAlts.push({ ...sa, vesselScopeId: v.id, id: `${sa.id}_virtual_${v.id}` })
          }
        }
        dEffectiveAlts = [...dVesselSpecific, ...dVirtualAlts]
      } else {
        dEffectiveAlts = dAlts
      }
      const dMultiAlt = dEffectiveAlts.length > 1 || dIsPerVessel

      // Resolve amount: check the condition itself, then any sibling with the same conditionId
      const dResolveAmount = (qc: typeof hc[0]): number | null | undefined => {
        if (qc.amount != null) return qc.amount
        const sibling = hc.find(c => c.hullConditionId === qc.hullConditionId && c.id !== qc.id && c.amount != null)
        return sibling?.amount
      }

      const makeCondTable = (conds: typeof hc) => {
        const currency = data.quotation.premiumCurrency || 'USD'
        const tableRows: TableRow[] = []
        for (const qc of conds) {
          const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
          if (!def) continue
          const isNewHC = origData && !origHullConditionIds.has(qc.hullConditionId)
          const hcColor = isNewHC ? RED : '000000'
          // If vesselAmounts exist and differ, emit one row per vessel
          if (qc.vesselAmounts && def.hasAmount && Object.keys(qc.vesselAmounts).length > 0) {
            for (const vessel of data.quotationVessels) {
              const va = qc.vesselAmounts[vessel.id]
              if (va == null) continue
              let text = qc.textOverride || def.text
              if (def.amountPlaceholder && text.includes(def.amountPlaceholder)) {
                const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                text = text.replace(new RegExp(escaped, 'g'), formatCurrency(va, currency))
              } else {
                text = text.trimEnd() + ' ' + formatCurrency(va, currency)
              }
              const vName = `(M/V ${(vessel.name || vessel.vesselLabel).toUpperCase()})`
              tableRows.push(new TableRow({
                children: [
                  new TableCell({ width: { size: condCol1W, type: WidthType.DXA }, borders: noBordersObj(), children: [new Paragraph({ children: [new TextRun({ text: `Cl. ${def.conditionNumber}`, size: 22, font: 'Arial', color: hcColor })] })] }),
                  new TableCell({ width: { size: condCol2W, type: WidthType.DXA }, borders: noBordersObj(), children: [new Paragraph({ children: [new TextRun({ text: text + ' ' + vName, size: 22, font: 'Arial', color: hcColor })] })] })
                ]
              }))
            }
          } else {
            let text = qc.textOverride || def.text
            const amount = dResolveAmount(qc)
            if (def.hasAmount && amount != null) {
              if (def.amountPlaceholder && text.includes(def.amountPlaceholder)) {
                const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                text = text.replace(new RegExp(escaped, 'g'), formatCurrency(amount, currency))
              } else {
                // Placeholder not in text — append the amount
                text = text.trimEnd() + ' ' + formatCurrency(amount, currency)
              }
            }
            const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
            tableRows.push(new TableRow({
              children: [
                new TableCell({ width: { size: condCol1W, type: WidthType.DXA }, borders: noBordersObj(), children: [new Paragraph({ children: [new TextRun({ text: `Cl. ${def.conditionNumber}`, size: 22, font: 'Arial', color: hcColor })] })] }),
                new TableCell({ width: { size: condCol2W, type: WidthType.DXA }, borders: noBordersObj(), children: [new Paragraph({ children: [new TextRun({ text: text + scope, size: 22, font: 'Arial', color: hcColor })] })] })
              ]
            }))
          }
        }
        return new Table({
          width: { size: condTableW, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          columnWidths: [condCol1W, condCol2W],
          rows: tableRows
        })
      }

      const dGetCondClauseId = (qc: typeof hc[0]) => {
        const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
        return def?.hullClauseId || ''
      }

      const dAddlBullet = (condText: string, color?: string) => new Paragraph({
        numbering: { reference: 'dash-bullet', level: 0 },
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 100 },
        children: [new TextRun({ text: condText, size: 22, font: 'Arial', color: color || '000000' })]
      })

      // Determine where each additional condition belongs
      const dGetAddlBelonging = (qa: typeof ha[0]): { type: 'alt'; altId: string } | { type: 'allAlts' } | { type: 'iv' } | { type: 'both' } => {
        const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
        if (!def) return { type: 'both' }
        const ids = def.hullClauseIds || []
        if (ids.length === 0) return { type: 'both' }
        const matchedAlts = dEffectiveAlts.filter(a => ids.includes(a.hullClauseId))
        const matchesIv = dIvClauseId && ids.includes(dIvClauseId)
        if (matchedAlts.length === dEffectiveAlts.length && matchesIv) return { type: 'both' }
        if (matchedAlts.length === dEffectiveAlts.length && !matchesIv) return dMultiAlt ? { type: 'allAlts' } : { type: 'both' }
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
          let condText = qa.textOverride || def.text
          if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
            const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            condText = condText.replace(new RegExp(escaped, 'g'), formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD'))
          }
          condText = condText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD').replace(/\{amount\}/g, qa.amount != null ? formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD') : '')
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          const isNewHullAddl = origData && !origHullAdditionalConditionIds.has(qa.hullAdditionalConditionId)
          paras.push(dAddlBullet(condText + scope, isNewHullAddl ? RED : undefined))
        }
        return paras
      }

      // Dedup IV conditions by hullConditionId (prefer alt-specific over null-scoped)
      const dIvCondsRaw = hc.filter(qc => dIvClauseId && dGetCondClauseId(qc) === dIvClauseId)
      const dIvConds: typeof dIvCondsRaw = []
      const dIvSeenIds = new Set<string>()
      for (const qc of dIvCondsRaw) { if (qc.alternativeId) { dIvSeenIds.add(qc.hullConditionId); dIvConds.push(qc) } }
      for (const qc of dIvCondsRaw) { if (!qc.alternativeId && !dIvSeenIds.has(qc.hullConditionId)) { dIvSeenIds.add(qc.hullConditionId); dIvConds.push(qc) } }
      const dHasIvSection = data.quotation.ivEnabled && (dIvConds.length > 0 || dSelectedIvClause)

      // Merge alt-specific + null-scoped conditions, dedup by conditionId (prefer alt-specific)
      // For virtual alts (shared alts rendered for non-override vessels), resolve from the original shared alt
      const dGetAltCondsResolved = (alt: typeof dAlts[0]) => {
        const realAltId = alt.id.includes('_virtual_') ? alt.id.split('_virtual_')[0] : alt.id
        // Alt-specific conditions: must belong to this alt's clause, exclude IV conditions
        const ownConds = hc.filter(qc =>
          qc.alternativeId === realAltId &&
          dGetCondClauseId(qc) === alt.hullClauseId &&
          !(dIvClauseId && dGetCondClauseId(qc) === dIvClauseId)
        )
        // Null-scoped conditions: must belong to this alt's clause, exclude IV
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
        if (dIsPerVessel) {
          // Group by vessel: each vessel gets its alternatives rendered as a section
          const dVesselOrder = data.quotationVessels.map(v => v.id)
          const dAltsByVessel = new Map<string, typeof dEffectiveAlts>()
          for (const alt of dEffectiveAlts) {
            if (!alt.vesselScopeId) continue
            const existing = dAltsByVessel.get(alt.vesselScopeId) || []
            existing.push(alt)
            dAltsByVessel.set(alt.vesselScopeId, existing)
          }
          for (const vId of dVesselOrder) {
            const vAlts = dAltsByVessel.get(vId) || []
            if (vAlts.length === 0) continue
            const vessel = data.quotationVessels.find(v => v.id === vId)
            const vesselTitle = vessel ? `M/V ${(vessel.name || vessel.vesselLabel).toUpperCase()}` : 'Vessel'
            hcContent.push(bup(vesselTitle))
            hcContent.push(emptyP())
            for (let ai = 0; ai < vAlts.length; ai++) {
              const alt = vAlts[ai]
              const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
              const altConds = dGetAltCondsResolved(alt)
              const realAltId = alt.id.includes('_virtual_') ? alt.id.split('_virtual_')[0] : alt.id
              if (vAlts.length > 1) {
                hcContent.push(bup(`  Alternative ${ai + 1}`))
                hcContent.push(emptyP())
              }
              if (clause) { hcContent.push(np(clause.description || clause.name)); hcContent.push(emptyP()) }
              if (altConds.length > 0) hcContent.push(makeCondTable(altConds))
              const altAddl = dRenderAddlForSection(b => b.type === 'alt' && b.altId === realAltId)
              if (altAddl.length > 0) { hcContent.push(emptyP()); hcContent.push(...altAddl) }
              hcContent.push(emptyP())
            }
          }
        } else {
          // Standard multi-alt (no per-vessel)
          for (let i = 0; i < dEffectiveAlts.length; i++) {
            const alt = dEffectiveAlts[i]
            const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
            const altConds = dGetAltCondsResolved(alt)
            const dAltTitle = `Alternative ${i + 1}`
            hcContent.push(bup(dAltTitle))
            hcContent.push(emptyP())
            if (clause) { hcContent.push(np(clause.description || clause.name)); hcContent.push(emptyP()) }
            if (altConds.length > 0) hcContent.push(makeCondTable(altConds))
            const altAddl = dRenderAddlForSection(b => b.type === 'alt' && b.altId === alt.id)
            if (altAddl.length > 0) { hcContent.push(emptyP()); hcContent.push(...altAddl) }
            hcContent.push(emptyP())
          }
        }

        // Applicable to all alternatives/vessels
        const dAllLabel = dIsPerVessel ? 'Applicable to all vessels' : 'Applicable to all alternatives'
        const allAltsAddl = dRenderAddlForSection(b => b.type === 'allAlts')
        const dBothAddl = dRenderAddlForSection(b => b.type === 'both')

        if (dHasIvSection) {
          if (allAltsAddl.length > 0) {
            hcContent.push(bup(dAllLabel))
            hcContent.push(emptyP())
            hcContent.push(...allAltsAddl)
            hcContent.push(emptyP())
          }

          // IV section
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

          // Applicable to all sections
          if (dBothAddl.length > 0) {
            hcContent.push(bup('Applicable to all sections'))
            hcContent.push(emptyP())
            hcContent.push(...dBothAddl)
          }
        } else {
          // Merge allAlts + both into one block to avoid duplicate headers
          const combinedAddl = [...allAltsAddl, ...dBothAddl]
          if (combinedAddl.length > 0) {
            hcContent.push(bup(dAllLabel))
            hcContent.push(emptyP())
            hcContent.push(...combinedAddl)
            hcContent.push(emptyP())
          }
        }
      } else if (dHasIvSection) {
        // Single alternative with IV
        const singleAlt = dAlts[0]
        const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
        const dHmClauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
        // Dedup H&M conditions by hullConditionId (prefer alt-specific over null-scoped)
        const dHmCondsRaw = hc.filter(qc => dHmClauseId && dGetCondClauseId(qc) === dHmClauseId && !(dIvClauseId && dGetCondClauseId(qc) === dIvClauseId))
        const dHmConds: typeof dHmCondsRaw = []
        const dHmSeenIds = new Set<string>()
        for (const qc of dHmCondsRaw) { if (qc.alternativeId) { dHmSeenIds.add(qc.hullConditionId); dHmConds.push(qc) } }
        for (const qc of dHmCondsRaw) { if (!qc.alternativeId && !dHmSeenIds.has(qc.hullConditionId)) { dHmSeenIds.add(qc.hullConditionId); dHmConds.push(qc) } }
        dHmConds.sort((a, b) => {
          const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
          const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
          return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
        })

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
        // Filter conditions to selected clause only, then deduplicate
        const dClauseId = singleAlt?.hullClauseId || data.quotation.hullClauseId
        const dClauseFilteredConds = dClauseId
          ? hc.filter(qc => {
              const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
              return def && def.hullClauseId === dClauseId
            })
          : hc
        const dCondMap = new Map<string, typeof hc[0]>()
        for (const qc of dClauseFilteredConds) {
          const existing = dCondMap.get(qc.hullConditionId)
          if (!existing || (qc.alternativeId && !existing.alternativeId)) {
            dCondMap.set(qc.hullConditionId, qc)
          }
        }
        const dDedupedConds = Array.from(dCondMap.values())
        dDedupedConds.sort((a, b) => {
          const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
          const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
          return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
        })
        if (dDedupedConds.length > 0) hcContent.push(makeCondTable(dDedupedConds))
        // Filter additional conditions by clause linkage
        const clauseId = dClauseId
        const filteredHa = ha.filter(qa => {
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) return false
          const linkedIds = def.hullClauseIds || []
          return linkedIds.length === 0 || !clauseId || linkedIds.includes(clauseId)
        })
        if (filteredHa.length > 0) {
          hcContent.push(emptyP())
          for (const qa of filteredHa) {
            const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
            if (!def) continue
            let condText = qa.textOverride || def.text
            if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
              const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              condText = condText.replace(new RegExp(escaped, 'g'), formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD'))
            }
            condText = condText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD').replace(/\{amount\}/g, qa.amount != null ? formatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD') : '')
            const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
            const isNewHullAddlInline = origData && !origHullAdditionalConditionIds.has(qa.hullAdditionalConditionId)
            hcContent.push(dAddlBullet(condText + scope, isNewHullAddlInline ? RED : undefined))
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
        const isNewWarCond = origData && !origWarConditionIds.has(qc.warConditionId)
        wcContent.push(bulletP(text + scope, isNewWarCond ? RED : undefined))
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
    const wDdqListStr = [...ddqCountries].sort((a, b) => a.name.localeCompare(b.name)).map(c => c.name).join(', ')
    // Compare trading intro text with original
    const tradIntroChanged = origData && wq.tradingWarrantyIntro !== origData.quotation.tradingWarrantyIntro
    // Compare excluded countries lists
    const origExcCountryNames = new Set((origData?.excludedCountries || []).filter(c => c.listType === 'excluded').map(c => c.name))
    void ((origData?.excludedCountries || []).filter(c => c.listType === 'ddq')) // DDQ countries not compared individually
    const numP = (text: string, level: number, color?: string) => new Paragraph({
      numbering: { reference: 'trading-numbered', level },
      spacing: { before: level === 0 ? 120 : 0, after: 80, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text, size: 22, font: 'Arial', color: color || '000000' })]
    })
    if (wq.tradingWarrantyIntro) tradContent.push(...mp(wq.tradingWarrantyIntro, tradIntroChanged ? RED : undefined))
    if (wq.tradingCustomMode && wq.tradingCustomWording) {
      // Custom mode: output custom wording instead of numbered paragraphs
      const customWordingChanged = origData && wq.tradingCustomWording !== origData.quotation.tradingCustomWording
      tradContent.push(emptyP())
      tradContent.push(...mp(wq.tradingCustomWording, customWordingChanged ? RED : undefined))
    } else {
      // Standard mode: numbered paragraphs
      if (wq.tradingCustomText) {
        const customTextChanged = origData && wq.tradingCustomText !== origData.quotation.tradingCustomText
        tradContent.push(emptyP())
        tradContent.push(...mp(wq.tradingCustomText, customTextChanged ? RED : undefined))
      }
      if (wExcCountries.length > 0) {
        // Highlight if excluded countries list changed
        const excCountriesChanged = origData && (
          wExcCountries.length !== origExcCountryNames.size ||
          wExcCountries.some(c => !origExcCountryNames.has(c.name))
        )
        tradContent.push(emptyP())
        tradContent.push(np('Excluding ' + wExcCountries.map(c => c.name).join(', ') + '.', excCountriesChanged ? RED : undefined))
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
        tradContent.push(numP(stripHtml(st(data, 'tradingIsrael')), 0))
      }
    }
    if (tradContent.length > 0) rowMap.set('trading', makeRow('Trading Warranty', tradContent))
  }

  // ---- Warranties ----
  {
    const warContent: (Paragraph | Table)[] = []
    const dPiMultiAltW = data.piAlternatives.length > 1

    const dWTypeCode = data.quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : data.quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : 'pi'
    const renderWarBullets = (warIds: string[], customs: QuotationCustomWarranty[]) => {
      const paras: Paragraph[] = []
      for (const wid of warIds) {
        const w = data.allWarranties.find(ww => ww.id === wid)
        if (!w) continue
        if (w.typeScope && w.typeScope !== 'all' && w.typeScope !== dWTypeCode) continue
        const isNewWar = origData && !origWarrantyIds.has(wid)
        const warColor = isNewWar ? RED : undefined
        const wVesselScope = data.warrantyVesselScopes[wid]
        for (const entry of resolveIacsWarranty(w.text, wVesselScope, data)) {
          paras.push(bulletP(entry.text + vesselScopeSuffix(entry.vesselScope, data.quotationVessels), warColor))
        }
      }
      for (const cw of customs) {
        const isNewCW = origData && !origCustomWarrantyTexts.has(cw.text)
        const cwColor = isNewCW ? RED : undefined
        for (const entry of resolveIacsWarranty(cw.text, cw.vesselScope, data)) {
          paras.push(bulletP(entry.text + vesselScopeSuffix(entry.vesselScope, data.quotationVessels), cwColor))
        }
      }
      return paras
    }

    // Render removed warranties (from original but not in current) as strikethrough red
    const renderRemovedWarranties = () => {
      if (!origData) return []
      const paras: Paragraph[] = []
      const currentWarIds = new Set(data.selectedWarrantyIds)
      for (const wid of origData.selectedWarrantyIds) {
        if (currentWarIds.has(wid)) continue
        const w = origData.allWarranties.find(ww => ww.id === wid)
        if (w) paras.push(strikeP(w.text))
      }
      const currentCWTexts = new Set(data.customWarranties.map(cw => cw.text))
      for (const cw of origData.customWarranties) {
        if (!currentCWTexts.has(cw.text)) paras.push(strikeP(cw.text))
      }
      return paras
    }

    // Render survey warranties as bullet paragraphs (not for War quotations)
    const dIsWar = data.quotation.quotationTypeCode === 'W'
    const renderSurveyWarBullets = (items: typeof data.surveyWarranties): Paragraph[] => {
      if (dIsWar) return []
      return items.map(sw => {
        const isNewSW = origData && !origSurveyWarrantyTexts.has(sw.text)
        return bulletP(sw.text + vesselScopeSuffix(sw.vesselScope, data.quotationVessels), isNewSW ? RED : undefined)
      })
    }

    if (dPiMultiAltW) {
      const sharedWarIds = data.selectedWarrantyIds.filter(id => !data.warrantyAltIds[id])
      const sharedCustom = sortedWordCustom.filter(cw => !cw.alternativeId)
      warContent.push(...renderWarBullets(sharedWarIds, sharedCustom))
      for (let altIdx = 0; altIdx < data.piAlternatives.length; altIdx++) {
        const alt = data.piAlternatives[altIdx]
        const altWarIds = data.selectedWarrantyIds.filter(id => data.warrantyAltIds[id] === alt.id)
        const altCustom = sortedWordCustom.filter(cw => cw.alternativeId === alt.id)
        const altSurveyW = altIdx === 0 ? data.surveyWarranties.filter(sw => !sw.alternativeId || sw.alternativeId === alt.id) : data.surveyWarranties.filter(sw => sw.alternativeId === alt.id)
        if (altWarIds.length > 0 || altCustom.length > 0 || altSurveyW.length > 0) {
          warContent.push(emptyP())
          warContent.push(bup(`Additional Warranties Applicable to ${alt.label || `Alternative ${altIdx + 1}`}:`))
          warContent.push(...renderWarBullets(altWarIds, altCustom))
          warContent.push(...renderSurveyWarBullets(altSurveyW))
        }
      }
    } else {
      warContent.push(...renderWarBullets(data.selectedWarrantyIds, sortedWordCustom))
      // Survey warranties after regular warranties
      if (data.surveyWarranties.length > 0) {
        warContent.push(...renderSurveyWarBullets(data.surveyWarranties))
      }
    }

    // Render removed warranties (from original but not in current)
    const removedWars = renderRemovedWarranties()
    if (removedWars.length > 0) warContent.push(...removedWars)

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
        const isNewDed = origData && d.piDeductibleId && !origDeductiblePiIds.has(d.piDeductibleId)
        // Also check if amount changed for existing deductibles
        const origDed = origData && d.piDeductibleId ? origData.deductibles.find(od => od.piDeductibleId === d.piDeductibleId) : null
        const amountChanged = origDed && origDed.amount !== d.amount
        const dedColor = (isNewDed || amountChanged) ? RED : '000000'
        const mainDesc = replaceDedPlaceholders(d.description, d.currency, d.secondaryAmount)
        // Per-vessel amounts: emit one row per vessel
        if (d.vesselAmounts && Object.keys(d.vesselAmounts).length > 0) {
          for (const vessel of data.quotationVessels) {
            const va = d.vesselAmounts[vessel.id]
            if (va == null) continue
            const vName = `(M/V ${(vessel.name || vessel.vesselLabel).toUpperCase()})`
            const vaOrigDed = origDed
            const vaColor = (isNewDed || (vaOrigDed && vaOrigDed.amount !== va)) ? RED : '000000'
            dedRows.push(new TableRow({
              children: [
                new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(va, d.currency), size: 22, font: 'Arial', color: vaColor })] })] }),
                new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: `${mainDesc} ${vName}`, size: 22, font: 'Arial', color: vaColor })] })] })
              ]
            }))
            if (d.secondaryDescription) {
              const secDesc = replaceDedPlaceholders(d.secondaryDescription, d.currency, d.secondaryAmount)
              dedRows.push(new TableRow({
                children: [
                  new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '', size: 22, font: 'Arial', color: vaColor })] })] }),
                  new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: `${secDesc} ${vName}`, size: 22, font: 'Arial', color: vaColor })] })] })
                ]
              }))
            }
          }
        } else {
          dedRows.push(new TableRow({
            children: [
              new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(d.amount, d.currency), size: 22, font: 'Arial', color: dedColor })] })] }),
              new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: mainDesc + dScope, size: 22, font: 'Arial', color: dedColor })] })] })
            ]
          }))
          if (d.secondaryDescription) {
            const secDesc = replaceDedPlaceholders(d.secondaryDescription, d.currency, d.secondaryAmount)
            dedRows.push(new TableRow({
              children: [
                new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '', size: 22, font: 'Arial', color: dedColor })] })] }),
                new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ children: [new TextRun({ text: secDesc, size: 22, font: 'Arial', color: dedColor })] })] })
              ]
            }))
          }
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
      for (const td of sharedTds) { const tdColor = origData && !origTextDeductibleTexts.has(td.text) ? RED : undefined; dedContent.push(emptyP()); dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels), tdColor)) }
      for (const alt of data.piAlternatives) {
        const altTds = data.textDeductibles.filter(td => td.alternativeId === alt.id)
        if (altTds.length > 0) {
          dedContent.push(emptyP())
          dedContent.push(bup(`Applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:`))
          for (const td of altTds) { const tdColor = origData && !origTextDeductibleTexts.has(td.text) ? RED : undefined; dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels), tdColor)) }
        }
      }
    } else {
      for (const td of data.textDeductibles) { const tdColor = origData && !origTextDeductibleTexts.has(td.text) ? RED : undefined; dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels), tdColor)) }
    }
    if (st(data, 'deductiblesAdditionalText')) { dedContent.push(emptyP()); dedContent.push(...mp(st(data, 'deductiblesAdditionalText'))) }
    rowMap.set('deductibles', makeRow('Deductibles', dedContent))
  }

  // ---- Exclusions ----
  if (exclusionTexts.length > 0) {
    const dPiMultiAltEx = data.piAlternatives.length > 1
    if (dPiMultiAltEx) {
      const exclContent: (Paragraph | Table)[] = []
      const allExclItems: { text: string; altId: string | null; exclId: string | null }[] = []
      for (const se of data.selectedExclusions) {
        const eScope = vesselScopeSuffix(se.vesselScope, data.quotationVessels)
        const t = se.customText ? se.customText + eScope : (se.piExclusionId ? ((data.allExclusions.find(e => e.id === se.piExclusionId)?.text || '') + eScope) : '')
        if (t) allExclItems.push({ text: t, altId: se.alternativeId || null, exclId: se.piExclusionId || null })
      }
      for (const ce of data.customExclusions) {
        const ceScope = vesselScopeSuffix(ce.vesselScope, data.quotationVessels)
        allExclItems.push({ text: ce.text + ceScope, altId: ce.alternativeId || null, exclId: null })
      }
      // Find common exclusions (same piExclusionId in all alternatives)
      const dAltIds = data.piAlternatives.map(a => a.id)
      const dExclByAlt = new Map<string, Set<string>>()
      for (const item of allExclItems) {
        if (item.exclId && item.altId) {
          if (!dExclByAlt.has(item.exclId)) dExclByAlt.set(item.exclId, new Set())
          dExclByAlt.get(item.exclId)!.add(item.altId)
        }
      }
      const dCommonExclIds = new Set<string>()
      for (const [exclId, alts] of dExclByAlt) {
        if (dAltIds.every(aid => alts.has(aid))) dCommonExclIds.add(exclId)
      }
      // Shared (null alt) + common exclusions
      const dSharedItems = allExclItems.filter(e => !e.altId)
      const dCommonItems = allExclItems.filter(e => e.exclId && dCommonExclIds.has(e.exclId) && e.altId === dAltIds[0])
      const dBaseItems = [...dSharedItems, ...dCommonItems]
      if (dBaseItems.length > 0) {
        exclContent.push(...dBaseItems.map(e => {
          const isNewExcl = origData && e.exclId ? !origExclusionPiIds.has(e.exclId) : (origData && !e.exclId ? !origCustomExclusionTexts.has(e.text) : false)
          return bulletP(e.text, isNewExcl ? RED : undefined)
        }))
      }
      // Per-alternative additional exclusions
      for (const alt of data.piAlternatives) {
        const altOnly = allExclItems.filter(e => e.altId === alt.id && (!e.exclId || !dCommonExclIds.has(e.exclId)))
        if (altOnly.length > 0) {
          exclContent.push(emptyP())
          exclContent.push(bup(`Additional exclusions applicable to ${alt.label || `Alternative ${data.piAlternatives.indexOf(alt) + 1}`}:`))
          exclContent.push(...altOnly.map(e => {
            const isNewExcl = origData && e.exclId ? !origExclusionPiIds.has(e.exclId) : (origData && !e.exclId ? !origCustomExclusionTexts.has(e.text) : false)
            return bulletP(e.text, isNewExcl ? RED : undefined)
          }))
        }
      }
      // Render removed exclusions from original
      if (origData) {
        const currentExclPiIds = new Set(data.selectedExclusions.filter(e => e.piExclusionId).map(e => e.piExclusionId!))
        const currentCustomExclTexts = new Set(data.customExclusions.map(ce => ce.text))
        for (const oe of origData.selectedExclusions) {
          if (oe.piExclusionId && !currentExclPiIds.has(oe.piExclusionId)) {
            const def = origData.allExclusions.find(e => e.id === oe.piExclusionId)
            if (def) exclContent.push(strikeP(def.text))
          }
        }
        for (const oce of origData.customExclusions) {
          if (!currentCustomExclTexts.has(oce.text)) exclContent.push(strikeP(oce.text))
        }
      }
      rowMap.set('exclusions', makeRow('Exclusions', exclContent))
    } else {
      // Simple exclusion rendering with change highlighting
      const exclParas = exclusionTexts.map(t => {
        // Check if this text is new (not in original exclusion texts)
        if (!origData) return bulletP(t)
        const origExclTexts = getExclusionTexts(origData)
        return bulletP(t, origExclTexts.includes(t) ? undefined : RED)
      })
      // Add removed exclusion texts
      if (origData) {
        const origExclTexts = getExclusionTexts(origData)
        for (const ot of origExclTexts) {
          if (!exclusionTexts.includes(ot)) exclParas.push(strikeP(ot))
        }
      }
      rowMap.set('exclusions', makeRow('Exclusions', exclParas))
    }
  }

  // ---- Sanctions ----
  {
    const wordSanctionsText = getSanctionsText(data)
    if (wordSanctionsText) {
      const origSanctionsText = origData ? getSanctionsText(origData) : null
      const sanctionsChanged = origData && origSanctionsText !== wordSanctionsText
      rowMap.set('sanctions', makeRow('Sanction Limitation and Exclusion Clause', mp(wordSanctionsText, sanctionsChanged ? RED : undefined)))
    }
  }

  // ---- Subjectivities ----
  if (data.subjectivities.length > 0) {
    const subjContent: (Paragraph | Table)[] = []
    if (st(data, 'subjectivitiesIntro')) subjContent.push(...mp(st(data, 'subjectivitiesIntro')))
    for (const s of data.subjectivities) {
      const isNewSubj = origData && s.piSubjectivityId && !origSubjectivityPiIds.has(s.piSubjectivityId)
      const isNewCustomSubj = origData && s.isCustom && !(origData.subjectivities || []).some(os => os.text === s.text)
      const subjColor = (isNewSubj || isNewCustomSubj) ? RED : undefined
      subjContent.push(bulletP(s.text + vesselScopeSuffix(s.vesselScope, data.quotationVessels), subjColor))
    }
    // Render removed subjectivities
    if (origData) {
      const currentSubjPiIds = new Set(data.subjectivities.filter(s => s.piSubjectivityId).map(s => s.piSubjectivityId!))
      const currentSubjTexts = new Set(data.subjectivities.map(s => s.text))
      for (const os of origData.subjectivities) {
        if (os.piSubjectivityId && !currentSubjPiIds.has(os.piSubjectivityId)) {
          strikeP(os.text) && subjContent.push(strikeP(os.text))
        } else if (os.isCustom && !currentSubjTexts.has(os.text)) {
          subjContent.push(strikeP(os.text))
        }
      }
    }
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
      const vpColonW = 200
      const vpNameW = Math.round(BODY_W * 0.40)
      const vpAmtW = BODY_W - vpNameW - vpColonW
      const vpCell = (text: string, bold = false, w?: number) => new TableCell({
        borders: noBorders(),
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        children: [new Paragraph({ children: [new TextRun({ text, size: 22, font: 'Arial', bold, color: '000000' })] })]
      })
      const vpRow3 = (name: string, amount: string) => new TableRow({
        children: [vpCell(name, true, vpNameW), vpCell(':', false, vpColonW), vpCell(amount, true, vpAmtW)]
      })
      const vpRow2 = (name: string, amount: string) => new TableRow({
        children: [
          vpCell(name, true, vpNameW),
          new TableCell({ borders: noBorders(), width: { size: BODY_W - vpNameW, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text: amount, size: 22, font: 'Arial', bold: true, color: '000000' })] })] })
        ]
      })

      if (wHasDiscount) {
        const discRows: TableRow[] = []
        discRows.push(new TableRow({ children: [
          new TableCell({ borders: noBorders(), columnSpan: 2, width: { size: BODY_W, type: WidthType.DXA }, children: [bp('Technical Premium')] })
        ] }))
        for (const v of data.quotationVessels) {
          discRows.push(vpRow2((v.name || v.vesselLabel).toUpperCase(), formatCurrency(v.premiumAmount || 0, wq.premiumCurrency)))
        }
        const totalTech = data.quotationVessels.reduce((s, v) => s + (v.premiumAmount || 0), 0)
        discRows.push(vpRow2('Total', formatCurrency(totalTech, wq.premiumCurrency)))
        discRows.push(new TableRow({ children: [new TableCell({ borders: noBorders(), width: { size: vpNameW, type: WidthType.DXA }, children: [emptyP()] }), new TableCell({ borders: noBorders(), width: { size: BODY_W - vpNameW, type: WidthType.DXA }, children: [emptyP()] })] }))
        discRows.push(new TableRow({ children: [
          new TableCell({ borders: noBorders(), columnSpan: 2, width: { size: BODY_W, type: WidthType.DXA }, children: [bp('Payable Premium')] })
        ] }))
        for (const v of data.quotationVessels) {
          const vPrem = v.premiumAmount || 0
          discRows.push(vpRow2((v.name || v.vesselLabel).toUpperCase(), vPrem > 0 ? formatCurrency(wComputePayable(vPrem), wq.premiumCurrency) : '-'))
        }
        const totalPayable = wComputePayable(totalTech)
        discRows.push(vpRow2('Total', formatCurrency(totalPayable, wq.premiumCurrency)))
        premContent.push(new Table({ rows: discRows, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [vpNameW, BODY_W - vpNameW], layout: TableLayoutType.FIXED }))
      } else {
        const simpleRows: TableRow[] = []
        for (const v of data.quotationVessels) {
          simpleRows.push(vpRow3((v.name || v.vesselLabel).toUpperCase(), formatCurrency(v.premiumAmount || 0, wq.premiumCurrency)))
        }
        const totalTech = data.quotationVessels.reduce((s, v) => s + (v.premiumAmount || 0), 0)
        simpleRows.push(vpRow3('Total', formatCurrency(totalTech, wq.premiumCurrency)))
        premContent.push(new Table({ rows: simpleRows, width: { size: BODY_W, type: WidthType.DXA }, columnWidths: [vpNameW, vpColonW, vpAmtW], layout: TableLayoutType.FIXED }))
      }
      premContent.push(np('per annum'))
      premContent.push(emptyP())
    } else if (wq.premiumAmount != null || data.hullAlternatives.length > 1 || data.hullAlternatives.some(a => a.vesselScopeId) || data.piAlternatives.length > 1 || (data.agreedValueOptions.length > 0 && data.agreedValueOptions.some(o => o.premiumAmount != null)) || (data.lolOptions.length > 0 && data.lolOptions.some(o => o.premiumAmount != null))) {
      const wMultiAlt = data.hullAlternatives.length > 1 || data.hullAlternatives.some(a => a.vesselScopeId)
      const wPerVessel = data.hullAlternatives.some(a => a.vesselScopeId)
      const wPiMultiAlt = data.piAlternatives.length > 1
      const premLabelW = Math.round(BODY_W * 0.35)
      const premAmtW = BODY_W - premLabelW
      const premCell = (text: string, bold = false, align?: typeof AlignmentType.RIGHT, w?: number) => new TableCell({
        borders: noBorders(),
        width: w ? { size: w, type: WidthType.DXA } : undefined,
        children: [new Paragraph({ alignment: align, children: [new TextRun({ text, size: 22, font: 'Arial', bold, color: '000000' })] })]
      })
      const premRow = (label: string, amount: string) => new TableRow({
        children: [
          premCell(label, true, undefined, premLabelW),
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
      } else if (data.lolOptions.length > 0 && data.lolOptions.some(o => o.premiumAmount != null)) {
        for (const opt of data.lolOptions) {
          lines.push({ label: opt.label || `Alternative ${data.lolOptions.indexOf(opt) + 1}`, tech: opt.premiumAmount || 0 })
        }
      } else if (wMultiAlt) {
        for (let ai = 0; ai < data.hullAlternatives.length; ai++) {
          const alt = data.hullAlternatives[ai]
          const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
          let wAltLabel = `Alternative ${ai + 1}${clause ? ` (${clause.code})` : ''}`
          if (wPerVessel && alt.vesselScopeId) {
            const vessel = data.quotationVessels.find(v => v.id === alt.vesselScopeId)
            if (vessel) wAltLabel = `${(vessel.name || vessel.vesselLabel).toUpperCase()}${clause ? ` (${clause.code})` : ''}`
          }
          lines.push({ label: wAltLabel, tech: alt.premiumAmount || 0 })
        }
        if (wq.ivEnabled && wq.ivPremiumAmount != null) lines.push({ label: 'IV', tech: wq.ivPremiumAmount })
      } else if (data.agreedValueOptions.length > 0 && data.agreedValueOptions.some(o => o.premiumAmount != null)) {
        for (const opt of data.agreedValueOptions) {
          if (opt.premiumAmount != null) {
            lines.push({ label: opt.label || `Option ${data.agreedValueOptions.indexOf(opt) + 1}`, tech: opt.premiumAmount })
          }
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
          rows.push(premRow(lines.length > 1 ? 'Technical Premium' : '', ''))
          for (const l of lines) {
            rows.push(premRow(l.label || 'Technical Premium', formatCurrency(l.tech, wq.premiumCurrency)))
          }
          rows.push(premRow('', ''))
          rows.push(premRow(lines.length > 1 ? 'Payable Premium' : '', ''))
          for (const l of lines) {
            rows.push(premRow(l.label || 'Payable Premium', formatCurrency(wComputePayable(l.tech), wq.premiumCurrency)))
          }
          premContent.push(premTable(rows))
        } else {
          // Simple table: just amounts
          const rows: TableRow[] = []
          for (const l of lines) {
            rows.push(premRow(l.label, formatCurrency(l.tech, wq.premiumCurrency)))
          }
          premContent.push(premTable(rows))
        }
        premContent.push(np('per annum'))
        premContent.push(emptyP())
      } else {
        // Single premium, no discount — plain bold text
        const premChanged = origData && origData.quotation.premiumAmount !== wq.premiumAmount
        premContent.push(bp(`${formatCurrency(wq.premiumAmount, wq.premiumCurrency)} per annum`, premChanged ? RED : undefined))
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
          nrText = stripHtml(st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.')
        } else if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
          nrText = stripHtml((st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(wq.nonRefundablePercent!)))
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
              nrText = stripHtml(st(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.')
            } else if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
              nrText = stripHtml((st(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, fmtPct(wq.nonRefundablePercent!)))
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
    if (wq.premiumAdditionalText) { premContent.push(...mp(wq.premiumAdditionalText)); premContent.push(emptyP()) }
    if (st(data, 'premiumCondition')) { premContent.push(...mp(st(data, 'premiumCondition'))); premContent.push(emptyP()) }
    if (st(data, 'premiumEarned')) { premContent.push(...mp(st(data, 'premiumEarned'))); premContent.push(emptyP()) }
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

  // ---- Cargo-specific sections ----
  if (data.quotation.quotationTypeCode === 'C') {
    // Insured Value
    if (data.quotation.insuredValueAmount != null) {
      const ivContent: (Paragraph | Table)[] = []
      ivContent.push(np(`${data.quotation.insuredValueCurrency || 'USD'} ${formatAmountOnly(data.quotation.insuredValueAmount)}`))
      if (data.quotation.insuredValueText) {
        ivContent.push(emptyP())
        ivContent.push(...mp(data.quotation.insuredValueText))
      }
      rowMap.set('insuredValue', makeRow('Insured Value', ivContent))
    }

    // Voyage
    {
      const voyContent: (Paragraph | Table)[] = []
      if (data.quotation.portOfLoading || data.quotation.portOfDestination) {
        voyContent.push(np(`From Commencement of Loading at ${data.quotation.portOfLoading || 'TBA'} (Port of Loading) to completion of discharge at ${data.quotation.portOfDestination || 'TBA'} (Port of Destination)`))
      }
      if (data.quotation.estimatedDeparture) {
        voyContent.push(emptyP())
        voyContent.push(np(data.quotation.estimatedDeparture))
      }
      if (data.quotation.voyageText) {
        voyContent.push(emptyP())
        voyContent.push(...mp(data.quotation.voyageText))
      }
      if (voyContent.length > 0) rowMap.set('voyage', makeRow('Voyage / Period (Port to Port Risks Only)', voyContent))
    }

    // Subject Matter
    if (data.quotation.subjectMatter) {
      rowMap.set('subjectMatter', makeRow('Subject Matter Insured', mp(data.quotation.subjectMatter)))
    }

    // Helper for cargo clause bullet
    const cargoBullet = (text: string) => new Paragraph({
      spacing: { after: 40 },
      indent: { left: 200, hanging: 200 },
      children: [new TextRun({ text: '- ', size: 22, font: 'Arial', color: '000000' }), new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
    })

    // Conditions
    {
      const condContent: Paragraph[] = []
      // Institute Cargo Clause (main clause) first
      if (data.quotation.cargoClauseId) {
        const icc = data.cargoInstituteClauses.find(c => c.id === data.quotation.cargoClauseId)
        if (icc) condContent.push(cargoBullet(`${icc.code ? icc.code + ' ' : ''}${icc.name}`))
      }
      // Additional conditions
      for (const c of data.cargoConditionClauses) {
        const text = c.textOverride || (c.code ? `${c.code} ` : '') + (c.title || '')
        condContent.push(cargoBullet(text))
      }
      for (const c of data.cargoConditionCustom) condContent.push(cargoBullet(c.text))
      if (condContent.length > 0) rowMap.set('cargoConditions', makeRow('Conditions', condContent))
    }

    // Special Conditions
    {
      const specContent: Paragraph[] = []
      for (const c of data.cargoSpecialClauses) {
        const text = c.textOverride || (c.code ? `${c.code} ` : '') + (c.title || '')
        specContent.push(cargoBullet(text))
      }
      for (const c of data.cargoSpecialCustom) specContent.push(cargoBullet(c.text))
      if (specContent.length > 0) rowMap.set('cargoSpecial', makeRow('Special Conditions', specContent))
    }

    // Law & Jurisdiction
    {
      const lawContent: Paragraph[] = []
      for (const c of data.cargoLawClauses) {
        const text = c.textOverride || c.text || c.title || ''
        lawContent.push(cargoBullet(text))
      }
      for (const c of data.cargoLawCustom) lawContent.push(cargoBullet(c.text))
      if (lawContent.length > 0) rowMap.set('cargoLaw', makeRow('Law and Jurisdiction', lawContent))
    }

    // Rate/Premium for cargo
    if (data.quotation.premiumType === 'rate' && data.quotation.premiumRate != null) {
      const premContent: (Paragraph | Table)[] = []
      premContent.push(np(`${data.quotation.premiumRate}%`))
      if (data.quotation.insuredValueAmount) {
        const calcPremium = data.quotation.insuredValueAmount * data.quotation.premiumRate / 100
        premContent.push(np(`Premium: ${formatCurrency(calcPremium, data.quotation.premiumCurrency || data.quotation.insuredValueCurrency)}`))
      }
      rowMap.set('premium', makeRow('Rate / Premium', premContent))
    }
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
  const _inTypeKey = data.quotation.quotationTypeCode === 'P' ? 'importantNoticePI' : data.quotation.quotationTypeCode === 'H' ? 'importantNoticeHull' : data.quotation.quotationTypeCode === 'W' ? 'importantNoticeWar' : ''
  const _inText = (_inTypeKey && st(data, _inTypeKey as keyof PISectionTexts)) || st(data, 'importantNotice')
  if (_inText) {
    afterTable.push(emptyP())
    const plainNotice = htmlToPlainText(_inText)
    if (plainNotice.startsWith('IMPORTANT NOTICE')) {
      afterTable.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [new TextRun({ text: 'IMPORTANT NOTICE', bold: true, size: 22, font: 'Arial', color: '000000' })]
      }))
      afterTable.push(...parseHtmlToParagraphs(_inText.replace(/^(<p>)?IMPORTANT NOTICE(<\/p>)?\n*/i, ''), {
        size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED
      }))
    } else {
      afterTable.push(...parseHtmlToParagraphs(_inText, {
        size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED
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
        new TextRun({ text: data.quotation.quotationTypeCode === 'C'
          ? `Marine Cargo Quotation for ${data.quotation.title || vName}${data.quotation.subjectMatter ? ' - ' + stripHtml(data.quotation.subjectMatter).substring(0, 50) : ''}`
          : `${data.quotation.quotationTypeCode === 'H' ? 'HULL AND MACHINERY' : data.quotation.quotationTypeCode === 'W' ? 'WAR / PIRACY' : 'PROTECTION AND INDEMNITY'} QUOTATION FOR ${(data.quotation.title || vName).toUpperCase()}`, bold: true, size: 26, font: 'Arial', color: '000000' })
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
          style: { paragraph: { indent: { left: 280, hanging: 200 } } }
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
