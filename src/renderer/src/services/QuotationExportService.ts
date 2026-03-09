import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, VerticalAlign,
  ImageRun, PageOrientation, TableLayoutType, LevelFormat
} from 'docx'

// A4 page geometry in DXA (twentieths of a point / twips)
const PAGE_W_DXA = 11906  // A4 width
const PAGE_H_DXA = 16838  // A4 height
const MARGIN_DXA = 1134   // 2 cm margins
const CONTENT_W = PAGE_W_DXA - 2 * MARGIN_DXA  // 9638 DXA usable width
const TITLE_W = Math.round(CONTENT_W * 0.20)    // 1928 DXA  (20%)
const BODY_W = CONTENT_W - TITLE_W              // 7710 DXA  (80%)
import {
  Quotation, Vessel, QuotationAssured, QuotationSubLimit, QuotationDeductible,
  QuotationTextDeductible, QuotationExcludedCountry, QuotationInstalment, QuotationNote,
  PIClause, PIWarranty, PIExclusion, PIAdditionalClause, PISectionTexts,
  PISanctionsVersion, QuotationVessel, QuotationCustomWarranty
} from '../../../shared/types'
import { DEFAULT_SECTION_TEXTS } from '../components/QuotationSettings'
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
  allClauses: PIClause[]
  additionalClauses: { id: string; piAdditionalClauseId?: string; customText?: string; order: number }[]
  allAdditionalClauses: PIAdditionalClause[]
  selectedWarrantyIds: string[]
  allWarranties: PIWarranty[]
  customWarranties: QuotationCustomWarranty[]
  deductibles: QuotationDeductible[]
  textDeductibles: QuotationTextDeductible[]
  selectedExclusions: { id: string; piExclusionId?: string; customText?: string }[]
  allExclusions: PIExclusion[]
  excludedCountries: QuotationExcludedCountry[]
  subjectivities: { id: string; text: string; order: number }[]
  instalments: QuotationInstalment[]
  information: { id: string; text: string; order: number }[]
  notes: QuotationNote[]
  sectionTexts: PISectionTexts
  sanctionsVersions: PISanctionsVersion[]
  clauseOverrides: Record<string, string>
  logoPath: string | null
}

async function gatherData(quotation: Quotation): Promise<QuotationData> {
  const [
    quotationVessels, allVessels, assureds, subLimits,
    selectedClauseIds, allClauses, additionalClauses, allAdditionalClauses,
    selectedWarrantyIds, allWarranties, customWarranties,
    deductibles, textDeductibles,
    selectedExclusions, allExclusions,
    excludedCountries, subjectivities, instalments, information, notes,
    sectionTexts, sanctionsVersions, clauseOverridesArr, logoPath
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
    window.api.getQuotationExcludedCountries(quotation.id),
    window.api.getQuotationSubjectivities(quotation.id),
    window.api.getQuotationInstalments(quotation.id),
    window.api.getQuotationInformation(quotation.id),
    window.api.getQuotationNotes(quotation.id),
    window.api.piGetSectionTexts(),
    window.api.piGetSanctionsVersions(),
    window.api.getQuotationClauseOverrides(quotation.id),
    window.api.piGetQuotationLogoPath()
  ])

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

  return {
    quotation, quotationVessels, allVessels, assureds, subLimits,
    selectedClauseIds, allClauses, additionalClauses, allAdditionalClauses,
    selectedWarrantyIds, allWarranties, customWarranties,
    deductibles, textDeductibles,
    selectedExclusions, allExclusions,
    excludedCountries, subjectivities, instalments, information, notes,
    sectionTexts: mergedTexts,
    sanctionsVersions,
    clauseOverrides,
    logoPath: logoPath || null
  }
}

// ==================== Helpers ====================

function formatCurrency(amount: number | undefined, currency: string | undefined): string {
  if (amount == null) return '-'
  const c = currency || 'USD'
  return `${c} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
    if (se.customText) texts.push(se.customText)
    else if (se.piExclusionId) {
      const found = data.allExclusions.find(e => e.id === se.piExclusionId)
      if (found) texts.push(found.text)
    }
  }
  return texts
}

function st(data: QuotationData, key: keyof PISectionTexts): string {
  return data.sectionTexts[key] || ''
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
  doc.text(`PROTECTION AND INDEMNITY QUOTATION FOR ${docTitle}`, pageWidth / 2, startY, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(dateStr, pageWidth - margin, startY + 10, { align: 'right' })
  doc.text(`Ref: ${data.quotation.referenceNumber || '-'}`, margin, startY + 18)

  // Build two-column sections
  const sections: [string, string][] = []

  // Insured
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
  sections.push(['Insured', insuredText.trim()])

  // Insured Vessel(s)
  const vesselLines = data.quotationVessels.map(qv => {
    const vi = getVesselInfo(qv, data.allVessels)
    return `${qv.vesselLabel}: ${vi.name}  |  IMO: ${vi.imo || '-'}  |  Built: ${vi.built || '-'}  |  GT: ${vi.gt ? Number(vi.gt).toLocaleString() : '-'}  |  Type: ${vi.type || '-'}  |  Class: ${vi.classification || '-'}`
  })
  if (vesselLines.length > 0) sections.push(['Insured Vessel', vesselLines.join('\n')])

  // Limit of Liability
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
  if (liabilityText) sections.push(['Limit of Liability', liabilityText.trim()])

  // Period
  if (data.quotation.periodText) {
    sections.push(['Period', data.quotation.periodText])
  }

  // Conditions
  if (selectedClauses.length > 0 || data.additionalClauses.length > 0) {
    let condText = ''
    if (st(data, 'conditionsIntro')) condText += stripHtml(st(data, 'conditionsIntro')) + '\n\n'
    for (const c of selectedClauses) {
      const desc = data.clauseOverrides[c.id] || c.description
      const clauseDesc = desc ? ` \u2013 ${desc}` : ''
      const displayName = stripClauseRef(c.name || '')
      condText += `Section B Cl.${c.clauseNumber}${displayName ? ` \u2013 ${displayName}` : ''}${clauseDesc}\n`
    }
    if (data.additionalClauses.length > 0) {
      condText += '\n'
      for (const ac of data.additionalClauses) {
        const def = data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        if (text) condText += `- ${code ? code + ' ' : ''}${text}\n`
      }
    }
    sections.push(['Conditions', condText.trim()])
  }

  // Trading Warranty
  {
    const q = data.quotation
    let tradingText = ''
    const excCountries = data.excludedCountries.filter(c => c.listType === 'excluded')
    const ddqListStr = ddqCountries.map(c => c.name).join(', ')

    // Trading warranty text (per-quotation)
    if (q.tradingWarrantyIntro) {
      tradingText += stripHtml(q.tradingWarrantyIntro) + '\n\n'
    }

    // Excluded countries (same line)
    if (excCountries.length > 0) {
      tradingText += 'Excluding ' + excCountries.map(c => c.name).join(', ') + '.\n\n'
    }

    let sectionNum = 1

    // 1) DDQ countries list paragraph — country list on separate line
    if (q.tradingShowDdqList && ddqCountries.length > 0) {
      const ddqIntro = stripHtml(st(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
      const hasPh = ddqIntro.includes('{ddq_countries}')
      if (hasPh) {
        tradingText += sectionNum + ') ' + ddqIntro.replace(/\{ddq_countries\}/g, ddqListStr) + '\n\n'
      } else {
        tradingText += sectionNum + ') ' + ddqIntro + '\n\t' + ddqListStr + '.\n\n'
      }
      sectionNum++
    }

    // 2) Trading conditions: intro + a)-f) sub-list
    if (q.tradingShowDdqWarranties) {
      const intro = st(data, 'tradingConditionA')
      if (intro) tradingText += sectionNum + ') ' + stripHtml(intro) + '\n\n'
      sectionNum++
      const condKeys: (keyof PISectionTexts)[] = ['tradingConditionB', 'tradingConditionC', 'tradingConditionD', 'tradingConditionE', 'tradingConditionF', 'tradingConditionG']
      const labels = ['a)', 'b)', 'c)', 'd)', 'e)', 'f)']
      for (let i = 0; i < condKeys.length; i++) {
        const txt = st(data, condKeys[i])
        if (txt) tradingText += '   ' + labels[i] + ' ' + stripHtml(txt) + '\n\n'
      }
    }

    // 3) Israel exclusion
    if (q.tradingShowIsrael && st(data, 'tradingIsrael')) {
      tradingText += sectionNum + ') ' + stripHtml(st(data, 'tradingIsrael')) + '\n\n'
    }

    // Custom trading text
    if (q.tradingCustomText) {
      tradingText += stripHtml(q.tradingCustomText)
    }

    if (tradingText.trim()) {
      sections.push(['Trading Warranty', tradingText.trim()])
    }
  }

  // Warranties
  const orderedWarranties = data.selectedWarrantyIds.map(id => data.allWarranties.find(w => w.id === id)).filter(Boolean)
  const sortedCustom = [...data.customWarranties].sort((a, b) => a.order - b.order)
  if (orderedWarranties.length > 0 || sortedCustom.length > 0) {
    let warText = ''
    for (const w of orderedWarranties) {
      warText += `- ${w!.text}\n`
    }
    for (const cw of sortedCustom) {
      warText += `- ${cw.text}\n`
    }
    if (st(data, 'warrantiesAdditionalText')) warText += '\n' + stripHtml(st(data, 'warrantiesAdditionalText')) + '\n'
    if (st(data, 'warrantiesBreach')) warText += '\n' + stripHtml(st(data, 'warrantiesBreach'))
    sections.push(['Warranties', warText.trim()])
  }

  // Deductibles
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    let dedText = ''
    for (const d of data.deductibles) {
      const mainDesc = d.description.replace(/\{sub_amount\}/g, d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '-')
      dedText += `${formatCurrency(d.amount, d.currency)}  \u2014  ${mainDesc}\n`
      if (d.secondaryAmount != null && d.secondaryDescription) {
        const secDesc = d.secondaryDescription.replace(/\{sub_amount\}/g, formatCurrency(d.secondaryAmount, d.currency))
        dedText += `${formatCurrency(d.secondaryAmount, d.currency)}  \u2014  ${secDesc}\n`
      }
    }
    for (const td of data.textDeductibles) { dedText += '\n' + td.text + '\n' }
    if (st(data, 'deductiblesAggregate')) dedText += '\n' + stripHtml(st(data, 'deductiblesAggregate')) + '\n'
    if (data.quotation.vdrDeductibleEnabled && st(data, 'deductiblesVDR')) dedText += '\n' + stripHtml(st(data, 'deductiblesVDR'))
    sections.push(['Deductibles', dedText.trim()])
  }

  // Exclusions
  if (exclusionTexts.length > 0) {
    sections.push(['Exclusions', exclusionTexts.map(t => `\u2022 ${t}`).join('\n')])
  }

  // Sanctions
  const sanctionsText = getSanctionsText(data)
  if (sanctionsText) {
    sections.push(['Sanction Limitation\nand Exclusion Clause', stripHtml(sanctionsText)])
  }

  // Subjectivities
  if (data.subjectivities.length > 0) {
    let subjText = ''
    if (st(data, 'subjectivitiesIntro')) subjText += stripHtml(st(data, 'subjectivitiesIntro')) + '\n\n'
    for (const s of data.subjectivities) { subjText += `\u2022 ${s.text}\n` }
    if (st(data, 'subjectivitiesNote')) subjText += '\n' + stripHtml(st(data, 'subjectivitiesNote'))
    sections.push(['Subjectivities', subjText.trim()])
  }

  // Continuation P&I Club
  if (st(data, 'continuationPiClubText')) {
    sections.push(['Continuation P&I Club', stripHtml(st(data, 'continuationPiClubText'))])
  }

  // Premium
  let premText = ''
  const q = data.quotation
  if (q.premiumAmount != null) {
    const techLabel = (q.discountPercent && q.discountPercent > 0) ? 'Technical Premium' : 'Premium'
    premText += `${techLabel}: ${formatCurrency(q.premiumAmount, q.premiumCurrency)} per annum\n`
    if (q.discountPercent && q.discountPercent > 0) {
      const discountLabel = q.discountLabel || 'Discount'
      premText += `${discountLabel}: ${q.discountPercent}%\n`
      const payable = q.premiumAmount * (1 - q.discountPercent / 100)
      premText += `Payable Premium: ${formatCurrency(payable, q.premiumCurrency)} per annum\n`
    }
    premText += '\n'
  }
  if (st(data, 'premiumPaymentIntro')) {
    premText += stripHtml(st(data, 'premiumPaymentIntro')).replace('{instalments}', String(q.numInstalments || 1)) + '\n\n'
  }
  for (const inst of data.instalments) {
    const timing = inst.daysFromInception === 0 ? 'prior inception' : `within ${inst.daysFromInception} days of inception`
    const desc = inst.description ? ` (${inst.description})` : ''
    let nonRef = ''
    if (inst.nonRefundable) {
      nonRef = inst.nonRefundablePercent ? ` (${inst.nonRefundablePercent}% non-refundable)` : ' (non-refundable)'
    }
    premText += `${ordinal(inst.instalmentNumber)} Instalment ${timing}${desc}${nonRef}\n`
  }
  if (data.instalments.length > 0) premText += '\n'
  if (st(data, 'premiumCondition')) premText += stripHtml(st(data, 'premiumCondition')) + '\n\n'
  if (st(data, 'premiumEarned')) premText += stripHtml(st(data, 'premiumEarned')) + '\n\n'
  if (q.ncbEnabled) {
    premText += `NCB Discount: ${q.ncbDiscountPercent || 0}%\n`
    if (q.ncbText) premText += stripHtml(q.ncbText) + '\n\n'
  }
  if (q.cpcEnabled) {
    premText += `CPC Discount: ${q.cpcDiscountPercent || 0}%\n`
    if (q.cpcText) premText += stripHtml(q.cpcText) + '\n\n'
  }
  if (q.premiumAdditionalText) premText += stripHtml(q.premiumAdditionalText)
  sections.push(['Premium Payment\nCondition Precedent', premText.trim()])

  // Information
  let infoText = ''
  if (data.quotation.validityDays) infoText += `\u2022 Quote open for ${data.quotation.validityDays} days\n`
  for (const info of data.information) { infoText += `\u2022 ${info.text}\n` }
  sections.push(['Information', infoText.trim() || '-'])

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
  const thin = { style: BorderStyle.SINGLE, size: 1, color: '000000' }
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

  const rows: TableRow[] = []

  // ---- Insured ----
  const insuredContent: (Paragraph | Table)[] = []
  if (data.assureds.length > 0) {
    const wordHasVesselLabels = data.quotationVessels.length > 1 && data.assureds.some(a => a.vesselLabel)
    const labelW = Math.round(BODY_W * 0.07)   // 7% — just "V1"/"V2"
    const nameW  = Math.round(BODY_W * (wordHasVesselLabels ? 0.53 : 0.60))
    const roleW  = BODY_W - (wordHasVesselLabels ? labelW + nameW : nameW)
    const wordSeenLabels = new Set<string>()
    insuredContent.push(new Table({
      width: { size: BODY_W, type: WidthType.DXA },
      columnWidths: wordHasVesselLabels ? [labelW, nameW, roleW] : [nameW, roleW],
      layout: TableLayoutType.FIXED,
      rows: data.assureds.map(a => {
        const labelKey = a.vesselLabel || ''
        const isFirstOfLabel = !wordSeenLabels.has(labelKey)
        wordSeenLabels.add(labelKey)
        return new TableRow({
          children: [
            ...(wordHasVesselLabels ? [new TableCell({
              borders: noBorders(),
              width: { size: labelW, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: isFirstOfLabel ? labelKey : '', size: 22, font: 'Arial', color: '000000', bold: true })] })]
            })] : []),
            new TableCell({
              borders: noBorders(),
              width: { size: nameW, type: WidthType.DXA },
              children: [new Paragraph({ children: [new TextRun({ text: a.name, size: 22, font: 'Arial', color: '000000' })] })]
            }),
            new TableCell({
              borders: noBorders(),
              width: { size: roleW, type: WidthType.DXA },
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
  rows.push(makeRow('Insured', insuredContent))

  // ---- Insured Vessel ----
  if (data.quotationVessels.length > 0) {
    const makeVCell = (text: string, header = false) => new TableCell({
      width: { size: 0, type: WidthType.AUTO },
      children: [new Paragraph({ children: [new TextRun({ text, bold: header, size: 20, font: 'Arial', color: '000000' })] })],
      ...(header ? { shading: { type: ShadingType.SOLID, color: 'F0F0F0' } } : {})
    })
    const vesselTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.AUTOFIT,
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['', 'Name', 'IMO', 'Built', 'GT', 'Flag', 'Type', 'Class'].map(h => makeVCell(h, true))
        }),
        ...data.quotationVessels.map(qv => {
          const vi = getVesselInfo(qv, data.allVessels)
          return new TableRow({
            children: [
              qv.vesselLabel, vi.name, vi.imo || '-', vi.built ? String(vi.built) : '-',
              vi.gt ? Number(vi.gt).toLocaleString() : '-', vi.flag || '-', vi.type || '-', vi.classification || '-'
            ].map(v => makeVCell(v))
          })
        })
      ]
    })
    rows.push(makeRow('Insured Vessel', [vesselTable]))
  }

  // ---- Limit of Liability ----
  const liabContent: (Paragraph | Table)[] = []
  const resolveSlText = (sl: typeof data.subLimits[0]) =>
    sl.text.replace('{amount}', formatAmountOnly(sl.amount)).replace('{currency}', sl.currency || 'USD')
  const wordSubLimitParas: Paragraph[] = data.subLimits.reduce((acc: Paragraph[], sl, i) => {
    if (i > 0) acc.push(emptyP())
    acc.push(np(resolveSlText(sl)))
    return acc
  }, [])

  // Support {sub_limits} placeholder inside the LoL raw text — split and inject
  const injectSubLimits = (rawText: string): (Paragraph | Table)[] => {
    if (!rawText.includes('{sub_limits}')) return mp(rawText)
    const parts = rawText.split('{sub_limits}')
    const out: (Paragraph | Table)[] = []
    if (parts[0]?.trim()) out.push(...mp(parts[0].trim()))
    out.push(...wordSubLimitParas)
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

  // If no placeholder was used, append sub-limits after the LoL text
  const lolRawHasPlaceholder = (data.quotation.limitOfLiabilityText || st(data, 'limitOfLiabilityDefaultText') || '').includes('{sub_limits}')
  if (!lolRawHasPlaceholder && wordSubLimitParas.length > 0) {
    liabContent.push(...wordSubLimitParas)
    liabContent.push(np('Under no circumstances is the Combined Single Limit detailed above to be exceeded.'))
  }
  if (liabContent.length > 0) rows.push(makeRow('Limit of Liability', liabContent))

  // ---- Period ----
  if (data.quotation.periodText) {
    rows.push(makeRow('Period', mp(data.quotation.periodText)))
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
          const rightText = displayName ? `${displayName}${clauseDesc}` : (desc || '')
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
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        if (text) condContent.push(new Paragraph({
          numbering: { reference: 'dash-bullet', level: 0 },
          spacing: { after: 40 },
          children: [
            ...(code ? [new TextRun({ text: code + ' ', size: 22, font: 'Arial', color: '000000' })] : []),
            new TextRun({ text, size: 22, font: 'Arial', color: '000000' })
          ]
        }))
      }
    }
    rows.push(makeRow('Conditions', condContent))
  }

  // ---- Trading Warranty ----
  {
    const wq = data.quotation
    const tradContent: (Paragraph | Table)[] = []
    const wExcCountries = data.excludedCountries.filter(c => c.listType === 'excluded')
    const wDdqListStr = ddqCountries.map(c => c.name).join(', ')

    // Numbered paragraph helpers for trading section
    const numP = (text: string, level: number) => new Paragraph({
      numbering: { reference: 'trading-numbered', level },
      spacing: { after: 80, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
    })
    // Trading warranty text (per-quotation)
    if (wq.tradingWarrantyIntro) tradContent.push(...mp(wq.tradingWarrantyIntro))

    // Excluded countries (on same line, no indent)
    if (wExcCountries.length > 0) {
      tradContent.push(emptyP())
      tradContent.push(np('Excluding ' + wExcCountries.map(c => c.name).join(', ') + '.'))
    }

    // 1) DDQ countries list paragraph — intro text, then country list on new indented line
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
          children: [new TextRun({ text: wDdqListStr + '.', size: 22, font: 'Arial', color: '000000' })]
        }))
      }
    }

    // 2) Trading conditions: intro + a)-f) sub-list
    if (wq.tradingShowDdqWarranties) {
      const intro = st(data, 'tradingConditionA')
      if (intro) {
        tradContent.push(numP(stripHtml(intro), 0))
      }
      const condKeys: (keyof PISectionTexts)[] = ['tradingConditionB', 'tradingConditionC', 'tradingConditionD', 'tradingConditionE', 'tradingConditionF', 'tradingConditionG']
      for (const key of condKeys) {
        const txt = st(data, key)
        if (txt) tradContent.push(numP(stripHtml(txt), 1))
      }
    }

    // 3) Israel exclusion
    if (wq.tradingShowIsrael && st(data, 'tradingIsrael')) {
      tradContent.push(numP(stripHtml(st(data, 'tradingIsrael')), 0))
    }

    // Custom trading text
    if (wq.tradingCustomText) {
      tradContent.push(emptyP())
      tradContent.push(...mp(wq.tradingCustomText))
    }

    if (tradContent.length > 0) {
      rows.push(makeRow('Trading Warranty', tradContent))
    }
  }

  // ---- Warranties ----
  if (orderedWordWarranties.length > 0 || sortedWordCustom.length > 0) {
    const warContent: (Paragraph | Table)[] = []
    for (const w of orderedWordWarranties) { warContent.push(bulletP(w.text)) }
    for (const cw of sortedWordCustom) { warContent.push(bulletP(cw.text)) }
    if (st(data, 'warrantiesAdditionalText')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesAdditionalText')))
    }
    if (st(data, 'warrantiesBreach')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesBreach')))
    }
    rows.push(makeRow('Warranties', warContent))
  }

  // ---- Deductibles ----
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    const dedContent: (Paragraph | Table)[] = []
    if (data.deductibles.length > 0) {
      const dedAmtW = Math.round(BODY_W * 0.25)
      const dedDescW = BODY_W - dedAmtW
      dedContent.push(new Table({
        width: { size: BODY_W, type: WidthType.DXA },
        rows: data.deductibles.map(d => {
          let desc = d.description.replace(/\{sub_amount\}/g, d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '-')
          if (d.secondaryAmount != null && d.secondaryDescription) {
            const secDesc = d.secondaryDescription.replace(/\{sub_amount\}/g, formatCurrency(d.secondaryAmount, d.currency))
            desc += ` (${secDesc}: ${formatCurrency(d.secondaryAmount, d.currency)})`
          }
          return new TableRow({
            children: [
              new TableCell({
                width: { size: dedAmtW, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(d.amount, d.currency), size: 22, font: 'Arial', color: '000000' })] })]
              }),
              new TableCell({
                width: { size: dedDescW, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: desc, size: 22, font: 'Arial', color: '000000' })] })]
              })
            ]
          })
        })
      }))
    }
    for (const td of data.textDeductibles) { dedContent.push(np(td.text)) }
    if (st(data, 'deductiblesAggregate')) dedContent.push(...mp(st(data, 'deductiblesAggregate')))
    if (data.quotation.vdrDeductibleEnabled && st(data, 'deductiblesVDR')) dedContent.push(...mp(st(data, 'deductiblesVDR')))
    rows.push(makeRow('Deductibles', dedContent))
  }

  // ---- Exclusions ----
  if (exclusionTexts.length > 0) {
    rows.push(makeRow('Exclusions', exclusionTexts.map(t => bulletP(t))))
  }

  // ---- Sanctions ----
  const wordSanctionsText = getSanctionsText(data)
  if (wordSanctionsText) {
    rows.push(makeRow('Sanction Limitation and Exclusion Clause', mp(wordSanctionsText)))
  }

  // ---- Subjectivities ----
  if (data.subjectivities.length > 0) {
    const subjContent: (Paragraph | Table)[] = []
    if (st(data, 'subjectivitiesIntro')) subjContent.push(...mp(st(data, 'subjectivitiesIntro')))
    for (const s of data.subjectivities) { subjContent.push(bulletP(s.text)) }
    if (st(data, 'subjectivitiesNote')) {
      subjContent.push(emptyP())
      subjContent.push(...mp(st(data, 'subjectivitiesNote')))
    }
    rows.push(makeRow('Subjectivities', subjContent))
  }

  // ---- Continuation P&I Club ----
  if (st(data, 'continuationPiClubText')) {
    rows.push(makeRow('Continuation P&I Club', mp(st(data, 'continuationPiClubText'))))
  }

  // ---- Premium ----
  const premContent: (Paragraph | Table)[] = []
  const wq = data.quotation
  if (wq.premiumAmount != null) {
    const techLabel = (wq.discountPercent && wq.discountPercent > 0) ? 'Technical Premium' : 'Premium'
    premContent.push(bp(`${techLabel}: ${formatCurrency(wq.premiumAmount, wq.premiumCurrency)} per annum`))
    if (wq.discountPercent && wq.discountPercent > 0) {
      const discountLabel = wq.discountLabel || 'Discount'
      premContent.push(np(`${discountLabel}: ${wq.discountPercent}%`))
      const payable = wq.premiumAmount * (1 - wq.discountPercent / 100)
      premContent.push(bp(`Payable Premium: ${formatCurrency(payable, wq.premiumCurrency)} per annum`))
    }
  }
  if (st(data, 'premiumPaymentIntro')) {
    const introText = st(data, 'premiumPaymentIntro').replace('{instalments}', String(wq.numInstalments || 1))
    premContent.push(...mp(introText))
  }
  if (data.instalments.length > 0) {
    for (const inst of data.instalments) {
      const timing = inst.daysFromInception === 0 ? 'prior inception' : `within ${inst.daysFromInception} days of inception`
      const desc = inst.description ? ` (${inst.description})` : ''
      let nonRef = ''
      if (inst.nonRefundable) {
        nonRef = inst.nonRefundablePercent ? ` (${inst.nonRefundablePercent}% non-refundable)` : ' (non-refundable)'
      }
      premContent.push(np(`${ordinal(inst.instalmentNumber)} Instalment ${timing}${desc}${nonRef}`))
    }
  }
  if (st(data, 'premiumCondition')) premContent.push(...mp(st(data, 'premiumCondition')))
  if (st(data, 'premiumEarned')) premContent.push(...mp(st(data, 'premiumEarned')))
  if (wq.ncbEnabled) {
    premContent.push(bp(`NCB Discount: ${wq.ncbDiscountPercent || 0}%`))
    if (wq.ncbText) premContent.push(...mp(wq.ncbText))
  }
  if (wq.cpcEnabled) {
    premContent.push(bp(`CPC Discount: ${wq.cpcDiscountPercent || 0}%`))
    if (wq.cpcText) premContent.push(...mp(wq.cpcText))
  }
  if (wq.premiumAdditionalText) premContent.push(...mp(wq.premiumAdditionalText))
  rows.push(makeRow('Premium Payment Condition Precedent', premContent.length > 0 ? premContent : [emptyP()]))

  // ---- Information ----
  const infoContent: (Paragraph | Table)[] = []
  if (data.quotation.validityDays) infoContent.push(bulletP(`Quote open for ${data.quotation.validityDays} days`))
  for (const info of data.information) { infoContent.push(bulletP(info.text)) }
  rows.push(makeRow('Information', infoContent.length > 0 ? infoContent : [emptyP()]))

  // Build main two-column table — FIXED layout forces Word/LibreOffice to honour DXA widths
  const mainTable = new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [TITLE_W, BODY_W],
    layout: TableLayoutType.FIXED,
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
        new TextRun({ text: `PROTECTION AND INDEMNITY QUOTATION FOR ${(data.quotation.title || vName).toUpperCase()}`, bold: true, size: 26, font: 'Arial', color: '000000' })
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

  const document = new Document({
    numbering: {
      config: [{
        reference: 'dash-bullet',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '-',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 360 } } }
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
            paragraph: { indent: { left: 360, hanging: 360 } }
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
          margin: { top: MARGIN_DXA, bottom: MARGIN_DXA, left: MARGIN_DXA, right: MARGIN_DXA }
        }
      },
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
