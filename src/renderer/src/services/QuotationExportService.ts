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
  QuotationAgreedValueItem, QuotationHullCondition, QuotationHullAdditionalCondition
} from '../../../shared/types'
import { DEFAULT_SECTION_TEXTS, getDefaultSectionOrder } from '../components/QuotationSettings'
import { parseHtmlToParagraphs, htmlToPlainText } from '../utils/htmlToDocx'
import { stripHtml } from '../utils/htmlToPdfText'

// ==================== Data Gathering ====================

interface QuotationData {
  quotation: Quotation
  quotationVessels: QuotationVessel[]
  allVessels: Vessel[]
  assureds: QuotationAssured[]
  subLimits: QuotationSubLimit[]
  selectedClauseIds: string[]
  clauseVesselScopes: Record<string, string[] | null>
  allClauses: PIClause[]
  additionalClauses: { id: string; piAdditionalClauseId?: string; customText?: string; order: number; vesselScope?: string[] | null }[]
  allAdditionalClauses: PIAdditionalClause[]
  selectedWarrantyIds: string[]
  warrantyVesselScopes: Record<string, string[] | null>
  allWarranties: PIWarranty[]
  customWarranties: QuotationCustomWarranty[]
  deductibles: QuotationDeductible[]
  textDeductibles: QuotationTextDeductible[]
  selectedExclusions: { id: string; piExclusionId?: string; customText?: string; vesselScope?: string[] | null }[]
  allExclusions: PIExclusion[]
  customExclusions: QuotationCustomExclusion[]
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
    hullAdditionalConditionsRaw, allHullAdditionalConditionsRaw
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
    window.api.hullGetAdditionalConditions()
  ])

  // Extract IDs and vessel scope maps from new object return format
  const safeClauseRows = Array.isArray(clauseRows) ? clauseRows : []
  const selectedClauseIds = safeClauseRows.map((r: any) => r.piClauseId)
  const clauseVesselScopes: Record<string, string[] | null> = {}
  for (const r of safeClauseRows) { if (r.vesselScope) clauseVesselScopes[r.piClauseId] = r.vesselScope }

  const safeWarrantyRows = Array.isArray(warrantyRows) ? warrantyRows : []
  const selectedWarrantyIds = safeWarrantyRows.map((r: any) => r.piWarrantyId)
  const warrantyVesselScopes: Record<string, string[] | null> = {}
  for (const r of safeWarrantyRows) { if (r.vesselScope) warrantyVesselScopes[r.piWarrantyId] = r.vesselScope }

  // Three-layer merge: defaults -> global settings -> per-quotation overrides
  const mergedTexts: PISectionTexts = {
    ...DEFAULT_SECTION_TEXTS,
    ...(sectionTexts || {}),
    ...(quotation.sectionTextsOverride || {})
  }

  // Build clause overrides map: clauseId -> description override
  const clauseOverrides: Record<string, string> = clauseOverridesArr && typeof clauseOverridesArr === 'object' && !Array.isArray(clauseOverridesArr)
    ? clauseOverridesArr as Record<string, string>
    : {}

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

  return {
    quotation, quotationVessels, allVessels, assureds, subLimits,
    selectedClauseIds, clauseVesselScopes, allClauses, additionalClauses, allAdditionalClauses,
    selectedWarrantyIds, warrantyVesselScopes, allWarranties, customWarranties,
    deductibles, textDeductibles,
    selectedExclusions, allExclusions, customExclusions,
    customSections: Array.isArray(customSections) ? customSections : [],
    excludedCountries, subjectivities, instalments, information, notes,
    sectionTexts: mergedTexts,
    sanctionsVersions,
    clauseOverrides,
    logoPath: logoPath || null,
    vesselIacsMap,
    hullAgreedValueItems: Array.isArray(hullAgreedValueItems) ? hullAgreedValueItems : [],
    hullClauses: Array.isArray(hullClausesRaw) ? hullClausesRaw : [],
    hullConditions: Array.isArray(hullConditionsRaw) ? hullConditionsRaw : [],
    allHullConditions: Array.isArray(allHullConditionsRaw) ? allHullConditionsRaw : [],
    hullAdditionalConditions: Array.isArray(hullAdditionalConditionsRaw) ? hullAdditionalConditionsRaw : [],
    allHullAdditionalConditions: Array.isArray(allHullAdditionalConditionsRaw) ? allHullAdditionalConditionsRaw : []
  }
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
  return String(data.sectionTexts[key] || '')
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
  const typeLabel = data.quotation.quotationTypeCode === 'H' ? 'HULL AND MACHINERY' : 'PROTECTION AND INDEMNITY'
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
    for (const c of selectedClauses) {
      const desc = data.clauseOverrides[c.id] || c.description
      const clauseDesc = desc ? ` \u2013 ${desc}` : ''
      const displayName = stripClauseRef(c.name || '')
      const cScope = vesselScopeSuffix(data.clauseVesselScopes[c.id], data.quotationVessels)
      condText += `Section B Cl.${c.clauseNumber}${displayName ? ` \u2013 ${displayName}` : ''}${clauseDesc}${cScope}\n`
    }
    if (data.additionalClauses.length > 0) {
      condText += '\n'
      for (const ac of data.additionalClauses) {
        const def = data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)
        const title = def?.title || ''
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        const acScope = vesselScopeSuffix(ac.vesselScope, data.quotationVessels)
        if (text) condText += `- ${title ? title + ': ' : ''}${code ? code + ' ' : ''}${text}${acScope}\n`
      }
    }
    sectionMap.set('conditions', ['Conditions', condText.trim()])
  }

  // Agreed Value (Hull)
  {
    const avItems = data.hullAgreedValueItems
    if (avItems.length > 0 || data.quotation.agreedValue != null) {
      let avText = ''
      if (data.quotation.agreedValue != null) {
        avText += formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD') + '\n\n'
      }
      for (const it of avItems) {
        const scope = vesselScopeSuffix(it.vesselScope, data.quotationVessels)
        avText += it.text + scope + '\n'
      }
      sectionMap.set('agreedValue', ['Agreed Insured Value', avText.trim()])
    }
  }

  // Hull Conditions
  {
    const hc = data.hullConditions
    const ha = data.hullAdditionalConditions
    if (hc.length > 0 || ha.length > 0) {
      let hcText = ''
      // Selected hull clause
      const selectedClause = data.quotation.hullClauseId
        ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId)
        : null
      if (selectedClause) {
        hcText += `${selectedClause.code} — ${selectedClause.name}\n\n`
      }
      // Clause conditions
      for (const qc of hc) {
        const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
        if (!def) continue
        const text = qc.textOverride || def.text
        const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
        hcText += `Cl. ${def.conditionNumber} – ${text}${scope}\n`
      }
      // Additional conditions
      if (ha.length > 0) {
        hcText += '\n'
        for (const qa of ha) {
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) continue
          const title = def.title || ''
          const text = qa.textOverride || def.text
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          hcText += `- ${title ? title + ': ' : ''}${text}${scope}\n`
        }
      }
      sectionMap.set('hullConditions', ['Conditions', hcText.trim()])
    }
  }

  // Trading Warranty
  {
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
      for (let wi = 0; wi < orderedWarranties.length; wi++) {
        const w = orderedWarranties[wi]!
        const wVesselScope = data.warrantyVesselScopes[data.selectedWarrantyIds[wi]]
        for (const entry of resolveIacsWarranty(w.text, wVesselScope, data)) {
          warText += `- ${entry.text}${vesselScopeSuffix(entry.vesselScope, data.quotationVessels)}\n`
        }
      }
      for (const cw of sortedCustom) {
        for (const entry of resolveIacsWarranty(cw.text, cw.vesselScope, data)) {
          warText += `- ${entry.text}${vesselScopeSuffix(entry.vesselScope, data.quotationVessels)}\n`
        }
      }
      if (st(data, 'warrantiesAdditionalText')) warText += '\n' + stripHtml(st(data, 'warrantiesAdditionalText')) + '\n'
      if (st(data, 'warrantiesBreach')) warText += '\n' + stripHtml(st(data, 'warrantiesBreach'))
      sectionMap.set('warranties', ['Warranties', warText.trim()])
    }
  }

  // Deductibles
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    let dedText = ''
    for (const d of data.deductibles) {
      const dScope = vesselScopeSuffix(d.vesselScope, data.quotationVessels)
      const mainDesc = d.description
        .replace(/\{currency\}/g, d.currency)
        .replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___')
      dedText += `${formatCurrency(d.amount, d.currency)}  \u2014  ${mainDesc}${dScope}\n`
      if (d.secondaryDescription) {
        const secDesc = d.secondaryDescription
          .replace(/\{currency\}/g, d.currency)
          .replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___')
        dedText += `${d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : ''}  \u2014  ${secDesc}\n`
      }
    }
    dedText += '\n'
    if (data.quotation.deductibleAggregateEnabled && data.quotation.deductibleAggregateText) dedText += '\n' + data.quotation.deductibleAggregateText + '\n\n'
    else if (data.quotation.deductibleAggregateEnabled && st(data, 'deductiblesAggregate')) dedText += '\n' + stripHtml(st(data, 'deductiblesAggregate')) + '\n\n'
    for (const td of data.textDeductibles) { const tdScope = vesselScopeSuffix(td.vesselScope, data.quotationVessels); dedText += '\n' + td.text + tdScope + '\n\n' }
    if (st(data, 'deductiblesAdditionalText')) dedText += '\n' + stripHtml(st(data, 'deductiblesAdditionalText')) + '\n\n'
    sectionMap.set('deductibles', ['Deductibles', dedText.trim()])
  }

  // Exclusions
  if (exclusionTexts.length > 0) {
    sectionMap.set('exclusions', ['Exclusions', exclusionTexts.map(t => `- ${t}`).join('\n')])
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

    if (hasVesselPremiums) {
      const techLabel = hasDiscount ? 'Technical Premium' : 'Premium'
      const premVesselLines = data.quotationVessels.map(v => {
        const pvName = (v.name || v.vesselLabel).toUpperCase()
        const vPrem = v.premiumAmount || 0
        if (hasDiscount) {
          const vPayable = computePayable(vPrem)
          return `${pvName}:  ${techLabel}: ${formatCurrency(vPrem, q.premiumCurrency)}  |  Payable: ${formatCurrency(vPayable, q.premiumCurrency)}`
        }
        return `${pvName}:  ${formatCurrency(vPrem, q.premiumCurrency)}`
      })
      premText += premVesselLines.join('\n') + '\n'
      const totalTech = data.quotationVessels.reduce((s, v) => s + (v.premiumAmount || 0), 0)
      if (hasDiscount) {
        const totalPayable = computePayable(totalTech)
        premText += `\nTotal ${techLabel}: ${formatCurrency(totalTech, q.premiumCurrency)} per annum\n`
        premText += `Total Payable Premium: ${formatCurrency(totalPayable, q.premiumCurrency)} per annum\n`
      } else {
        premText += `\nTotal Premium: ${formatCurrency(totalTech, q.premiumCurrency)} per annum\n`
      }
      premText += '\n'
    } else if (q.premiumAmount != null) {
      const techLabel = hasDiscount ? 'Technical Premium' : 'Premium'
      premText += `${techLabel}: ${formatCurrency(q.premiumAmount, q.premiumCurrency)} per annum\n`
      if (hasDiscount) {
        const payable = computePayable(q.premiumAmount)
        premText += `Payable Premium: ${formatCurrency(payable, q.premiumCurrency)} per annum\n`
      }
      premText += '\n'
    }
    if (q.nonRefundableType === 'first_instalment') {
      premText += 'First instalment is non-refundable.\n\n'
    } else if (q.nonRefundableType === 'percentage' && q.nonRefundablePercent) {
      premText += `${q.nonRefundablePercent}% of premium is non-refundable.\n\n`
    }
    if (st(data, 'premiumPaymentIntro')) {
      premText += stripHtml(st(data, 'premiumPaymentIntro')).replace('{instalments}', String(q.numInstalments || 1)) + '\n\n'
    }
    for (const inst of data.instalments) {
      const timing = inst.daysFromInception === 0 ? 'prior inception' : `within ${inst.daysFromInception} days of inception`
      premText += `${ordinal(inst.instalmentNumber)} Instalment ${timing}\n`
    }
    if (data.instalments.length > 0) premText += '\n'
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
      let ncbText = ''
      if (q.ncbText) ncbText = stripHtml(q.ncbText).replace(/\{ncb_amount\}/g, ncbAmtStr).replace(/\{ncb_percent\}/g, ncbPctStr)
      sectionMap.set('ncb', ['No Claims Bonus\n(NCB)', ncbText.trim()])
    }

    // UPCC as separate section
    if (q.upccEnabled) {
      const afterNcbPrem = (q.premiumAmount || 0) - (ncbType === 'amount' ? ncbFixedAmt : (q.premiumAmount || 0) * ncbPct / 100)
      const upccAmt = upccType === 'amount' ? upccFixedAmt : afterNcbPrem * upccPct / 100
      const upccAmtStr = formatCurrency(upccAmt, q.premiumCurrency)
      const upccPctStr = `${upccPct}%`
      let upccText = ''
      if (q.upccText) upccText = stripHtml(q.upccText).replace(/\{upcc_amount\}/g, upccAmtStr).replace(/\{upcc_percent\}/g, upccPctStr)
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

  // Render main two-column table
  autoTable(doc, {
    startY: startY + 26,
    body: sections,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 36, valign: 'top' as any },
      1: { valign: 'top' as any }
    },
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: { top: 5, right: 5, bottom: 9, left: 5 }, lineColor: [0, 0, 0], lineWidth: 0.25, overflow: 'linebreak', textColor: [0, 0, 0], font: 'helvetica' },
    margin: { left: margin, right: margin }
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
  const orderedWordWarranties = data.selectedWarrantyIds.map(id => data.allWarranties.find(w => w.id === id)).filter(Boolean) as PIWarranty[]
  const sortedWordCustom = [...data.customWarranties].sort((a, b) => a.order - b.order)
  const ddqCountries = data.excludedCountries.filter(c => c.listType === 'ddq')
  const exclusionTexts = getExclusionTexts(data)
  const dateStr = data.quotation.quotationDate
    ? new Date(data.quotation.quotationDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  // Paragraph helpers - 11pt Arial black, line spacing 1.0
  const np = (text: string) => new Paragraph({
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })

  const bp = (text: string) => new Paragraph({
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true })]
  })

  const bulletP = (text: string) => new Paragraph({
    numbering: { reference: 'dash-bullet', level: 0 },
    spacing: { after: 40, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })

  const emptyP = () => new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [] })

  const mp = (text: string): Paragraph[] => {
    if (!text) return []
    if (isHtml(text)) return parseHtmlToParagraphs(text, { size: 22, font: 'Arial', color: '000000' })
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
    if (selectedClauses.length > 0) {
      const clauseRefW = Math.round(BODY_W * 0.32)
      const clauseDescW = BODY_W - clauseRefW
      condContent.push(new Table({
        width: { size: BODY_W, type: WidthType.DXA },
        columnWidths: [clauseRefW, clauseDescW],
        layout: TableLayoutType.FIXED,
        rows: selectedClauses.map(c => {
          const desc = data.clauseOverrides[c.id] || c.description
          const clauseDesc = desc ? ` \u2013 ${desc}` : ''
          const displayName = stripClauseRef(c.name || '')
          const cScope = vesselScopeSuffix(data.clauseVesselScopes[c.id], data.quotationVessels)
          const rightText = (displayName ? `${displayName}${clauseDesc}` : (desc || '')) + cScope
          return new TableRow({
            children: [
              new TableCell({
                width: { size: clauseRefW, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: `Section B Cl.${c.clauseNumber}`, size: 22, font: 'Arial', color: '000000' })] })]
              }),
              new TableCell({
                width: { size: clauseDescW, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: rightText, size: 22, font: 'Arial', color: '000000' })] })]
              })
            ]
          })
        })
      }))
    }
    if (data.additionalClauses.length > 0) {
      condContent.push(emptyP())
      for (const ac of data.additionalClauses) {
        const def = data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)
        const title = def?.title || ''
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        const acScope = vesselScopeSuffix(ac.vesselScope, data.quotationVessels)
        if (text) condContent.push(new Paragraph({
          numbering: { reference: 'dash-bullet', level: 0 },
          spacing: { after: 40 },
          children: [
            ...(title ? [new TextRun({ text: title + ': ', bold: true, size: 22, font: 'Arial', color: '000000' })] : []),
            ...(code ? [new TextRun({ text: code + ' ', size: 22, font: 'Arial', color: '000000' })] : []),
            new TextRun({ text: text + acScope, size: 22, font: 'Arial', color: '000000' })
          ]
        }))
      }
    }
    rowMap.set('conditions', makeRow('Conditions', condContent))
  }

  // ---- Agreed Value (Hull) ----
  {
    const avItems = data.hullAgreedValueItems
    if (avItems.length > 0 || data.quotation.agreedValue != null) {
      const avContent: Paragraph[] = []
      if (data.quotation.agreedValue != null) {
        avContent.push(bp(formatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')))
      }
      for (const it of avItems) {
        const scope = vesselScopeSuffix(it.vesselScope, data.quotationVessels)
        avContent.push(np(it.text + scope))
      }
      rowMap.set('agreedValue', makeRow('Agreed Insured Value', avContent))
    }
  }

  // ---- Hull Conditions ----
  {
    const hc = data.hullConditions
    const ha = data.hullAdditionalConditions
    if (hc.length > 0 || ha.length > 0) {
      const hcContent: (Paragraph | Table)[] = []
      const selectedClause = data.quotation.hullClauseId
        ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId)
        : null
      if (selectedClause) {
        hcContent.push(bp(`${selectedClause.code} — ${selectedClause.name}`))
        hcContent.push(emptyP())
      }
      // Clause conditions as a two-column sub-table
      if (hc.length > 0) {
        const condRefW = Math.round(BODY_W * 0.15)
        const condTextW = BODY_W - condRefW
        const noBordersObj = () => ({ top: { style: BorderStyle.NONE, size: 0 }, bottom: { style: BorderStyle.NONE, size: 0 }, left: { style: BorderStyle.NONE, size: 0 }, right: { style: BorderStyle.NONE, size: 0 } })
        hcContent.push(new Table({
          width: { size: BODY_W, type: WidthType.DXA },
          layout: TableLayoutType.FIXED,
          rows: hc.map(qc => {
            const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
            if (!def) return null
            const text = qc.textOverride || def.text
            const scope = vesselScopeSuffix(qc.vesselScope, data.quotationVessels)
            return new TableRow({
              children: [
                new TableCell({
                  width: { size: condRefW, type: WidthType.DXA },
                  borders: noBordersObj(),
                  children: [new Paragraph({ children: [new TextRun({ text: `Cl. ${def.conditionNumber}`, size: 22, font: 'Arial', color: '000000' })] })]
                }),
                new TableCell({
                  width: { size: condTextW, type: WidthType.DXA },
                  borders: noBordersObj(),
                  children: [new Paragraph({ children: [new TextRun({ text: text + scope, size: 22, font: 'Arial', color: '000000' })] })]
                })
              ]
            })
          }).filter(Boolean) as TableRow[]
        }))
      }
      // Additional conditions
      if (ha.length > 0) {
        hcContent.push(emptyP())
        for (const qa of ha) {
          const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
          if (!def) continue
          const title = def.title || ''
          const text = qa.textOverride || def.text
          const scope = vesselScopeSuffix(qa.vesselScope, data.quotationVessels)
          hcContent.push(new Paragraph({
            numbering: { reference: 'dash-bullet', level: 0 },
            spacing: { after: 40 },
            children: [
              ...(title ? [new TextRun({ text: title + ': ', bold: true, size: 22, font: 'Arial', color: '000000' })] : []),
              new TextRun({ text: text + scope, size: 22, font: 'Arial', color: '000000' })
            ]
          }))
        }
      }
      rowMap.set('hullConditions', makeRow('Conditions', hcContent))
    }
  }

  // ---- Trading Warranty ----
  {
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
    for (let wi = 0; wi < orderedWordWarranties.length; wi++) {
      const w = orderedWordWarranties[wi]
      const wVesselScope = data.warrantyVesselScopes[data.selectedWarrantyIds[wi]]
      for (const entry of resolveIacsWarranty(w.text, wVesselScope, data)) {
        warContent.push(bulletP(entry.text + vesselScopeSuffix(entry.vesselScope, data.quotationVessels)))
      }
    }
    for (const cw of sortedWordCustom) {
      for (const entry of resolveIacsWarranty(cw.text, cw.vesselScope, data)) {
        warContent.push(bulletP(entry.text + vesselScopeSuffix(entry.vesselScope, data.quotationVessels)))
      }
    }
    if (st(data, 'warrantiesAdditionalText')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesAdditionalText')))
    }
    if (st(data, 'warrantiesBreach')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesBreach')))
    }
    if (warContent.length > 0) rowMap.set('warranties', makeRow('Warranties', warContent))
  }

  // ---- Deductibles ----
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    const dedContent: (Paragraph | Table)[] = []
    if (data.deductibles.length > 0) {
      const dedAmtW = Math.round(BODY_W * 0.20)
      const dedDescW = BODY_W - dedAmtW
      const dedRows: TableRow[] = []
      for (const d of data.deductibles) {
        const dScope = vesselScopeSuffix(d.vesselScope, data.quotationVessels)
        dedRows.push(new TableRow({
          children: [
            new TableCell({
              width: { size: dedAmtW, type: WidthType.DXA },
              borders: noBorders(),
              children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(d.amount, d.currency), size: 22, font: 'Arial', color: '000000' })] })]
            }),
            new TableCell({
              width: { size: dedDescW, type: WidthType.DXA },
              borders: noBorders(),
              children: [new Paragraph({ children: [new TextRun({ text: d.description.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___') + dScope, size: 22, font: 'Arial', color: '000000' })] })]
            })
          ]
        }))
        if (d.secondaryDescription) {
          const secDesc = d.secondaryDescription
            .replace(/\{currency\}/g, d.currency)
            .replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___')
          dedRows.push(new TableRow({
            children: [
              new TableCell({
                width: { size: dedAmtW, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '', size: 22, font: 'Arial', color: '000000' })] })]
              }),
              new TableCell({
                width: { size: dedDescW, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: secDesc, size: 22, font: 'Arial', color: '000000' })] })]
              })
            ]
          }))
        }
      }
      dedContent.push(new Table({
        width: { size: BODY_W, type: WidthType.DXA },
        columnWidths: [dedAmtW, dedDescW],
        layout: TableLayoutType.FIXED,
        rows: dedRows
      }))
      dedContent.push(emptyP())
    }
    if (data.quotation.deductibleAggregateEnabled && data.quotation.deductibleAggregateText) { dedContent.push(...mp(data.quotation.deductibleAggregateText)); dedContent.push(emptyP()) }
    else if (data.quotation.deductibleAggregateEnabled && st(data, 'deductiblesAggregate')) { dedContent.push(...mp(st(data, 'deductiblesAggregate'))); dedContent.push(emptyP()) }
    for (const td of data.textDeductibles) { dedContent.push(emptyP()); dedContent.push(np(td.text + vesselScopeSuffix(td.vesselScope, data.quotationVessels))) }
    if (st(data, 'deductiblesAdditionalText')) { dedContent.push(emptyP()); dedContent.push(...mp(st(data, 'deductiblesAdditionalText'))) }
    rowMap.set('deductibles', makeRow('Deductibles', dedContent))
  }

  // ---- Exclusions ----
  if (exclusionTexts.length > 0) {
    rowMap.set('exclusions', makeRow('Exclusions', exclusionTexts.map(t => bulletP(t))))
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
    } else if (wq.premiumAmount != null) {
      const techLabel = wHasDiscount ? 'Technical Premium' : 'Premium'
      premContent.push(bp(`${techLabel}: ${formatCurrency(wq.premiumAmount, wq.premiumCurrency)} per annum`))
      if (wHasDiscount) {
        const payable = wComputePayable(wq.premiumAmount)
        premContent.push(bp(`Payable Premium: ${formatCurrency(payable, wq.premiumCurrency)} per annum`))
      }
    }
    if (wq.nonRefundableType === 'first_instalment') {
      premContent.push(np('First instalment is non-refundable.'))
    } else if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
      premContent.push(np(`${wq.nonRefundablePercent}% of premium is non-refundable.`))
    }
    if (st(data, 'premiumPaymentIntro')) {
      const introText = st(data, 'premiumPaymentIntro').replace('{instalments}', String(wq.numInstalments || 1))
      premContent.push(...mp(introText))
    }
    if (data.instalments.length > 0) {
      for (const inst of data.instalments) {
        const timing = inst.daysFromInception === 0 ? 'prior inception' : `within ${inst.daysFromInception} days of inception`
        premContent.push(new Paragraph({
          spacing: { after: 0, line: 240, lineRule: 'auto' as any },
          children: [new TextRun({ text: `${ordinal(inst.instalmentNumber)} Instalment ${timing}`, size: 22, font: 'Arial', color: '000000' })]
        }))
      }
    }
    if (st(data, 'premiumCondition')) premContent.push(...mp(st(data, 'premiumCondition')))
    if (st(data, 'premiumEarned')) premContent.push(...mp(st(data, 'premiumEarned')))
    if (wq.premiumAdditionalText) premContent.push(...mp(wq.premiumAdditionalText))
    rowMap.set('premium', makeRow('Premium Payment Condition Precedent', premContent.length > 0 ? premContent : [emptyP()]))

    // NCB as separate section
    if (wq.ncbEnabled) {
      const ncbContent: (Paragraph | Table)[] = []
      const wTechPrem = wq.premiumAmount || 0
      const wNcbAmt = wNcbType === 'amount' ? wNcbFixedAmt : wTechPrem * wNcbPct / 100
      const wNcbAmtStr = formatCurrency(wNcbAmt, wq.premiumCurrency)
      const wNcbPctStr = `${wNcbPct}%`
      if (wq.ncbText) {
        const resolved = wq.ncbText.replace(/\{ncb_amount\}/g, wNcbAmtStr).replace(/\{ncb_percent\}/g, wNcbPctStr)
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
      if (wq.upccText) {
        const resolved = wq.upccText.replace(/\{upcc_amount\}/g, wUpccAmtStr).replace(/\{upcc_percent\}/g, wUpccPctStr)
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
        new TextRun({ text: `${data.quotation.quotationTypeCode === 'H' ? 'HULL AND MACHINERY' : 'PROTECTION AND INDEMNITY'} QUOTATION FOR ${(data.quotation.title || vName).toUpperCase()}`, bold: true, size: 26, font: 'Arial', color: '000000' })
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
