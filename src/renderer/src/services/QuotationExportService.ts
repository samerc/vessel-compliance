import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, ShadingType, BorderStyle, AlignmentType, VerticalAlign,
  ImageRun
} from 'docx'
import {
  Quotation, Vessel, QuotationAssured, QuotationSubLimit, QuotationDeductible,
  QuotationTextDeductible, QuotationExcludedCountry, QuotationInstalment, QuotationNote,
  PIClause, PIWarranty, PIExclusion, PIAdditionalClause, QuotationNewVessel, PISectionTexts,
  PISanctionsVersion
} from '../../../shared/types'
import { DEFAULT_SECTION_TEXTS } from '../components/QuotationSettings'
import { parseHtmlToParagraphs, htmlToPlainText } from '../utils/htmlToDocx'
import { stripHtml } from '../utils/htmlToPdfText'

// ==================== Data Gathering ====================

interface QuotationData {
  quotation: Quotation
  vessel: Vessel | null
  newVessel: QuotationNewVessel | null
  assureds: QuotationAssured[]
  subLimits: QuotationSubLimit[]
  selectedClauseIds: string[]
  allClauses: PIClause[]
  additionalClauses: { id: string; piAdditionalClauseId?: string; customText?: string; order: number }[]
  allAdditionalClauses: PIAdditionalClause[]
  selectedWarrantyIds: string[]
  allWarranties: PIWarranty[]
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
    vessel, newVessel, assureds, subLimits,
    selectedClauseIds, allClauses, additionalClauses, allAdditionalClauses,
    selectedWarrantyIds, allWarranties,
    deductibles, textDeductibles,
    selectedExclusions, allExclusions,
    excludedCountries, subjectivities, instalments, information, notes,
    sectionTexts, sanctionsVersions, clauseOverridesArr, logoPath
  ] = await Promise.all([
    quotation.vesselId ? window.api.getVessels().then(vs => vs.find(v => v.id === quotation.vesselId) || null) : Promise.resolve(null),
    window.api.getQuotationNewVessel(quotation.id),
    window.api.getQuotationAssureds(quotation.id),
    window.api.getQuotationSubLimits(quotation.id),
    window.api.getQuotationClauses(quotation.id),
    window.api.piGetClauses(),
    window.api.getQuotationAdditionalClauses(quotation.id),
    window.api.piGetAdditionalClauses(),
    window.api.getQuotationWarranties(quotation.id),
    window.api.piGetWarranties(),
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
  const clauseOverrides: Record<string, string> = {}
  if (Array.isArray(clauseOverridesArr)) {
    for (const co of clauseOverridesArr) {
      if (co.clauseId && co.descriptionOverride) {
        clauseOverrides[co.clauseId] = co.descriptionOverride
      }
    }
  }

  return {
    quotation, vessel, newVessel, assureds, subLimits,
    selectedClauseIds, allClauses, additionalClauses, allAdditionalClauses,
    selectedWarrantyIds, allWarranties,
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

function vesselName(data: QuotationData): string {
  if (data.vessel) return data.vessel.name
  if (data.newVessel) return data.newVessel.name
  return 'Unknown Vessel'
}

function vesselDetails(data: QuotationData): { imo?: string; built?: number; gt?: number; type?: string; flag?: string; classification?: string; callSign?: string } {
  if (data.vessel) return {
    imo: data.vessel.imoNumber, built: data.vessel.builtYear, gt: data.vessel.grossTonnage,
    type: data.vessel.vesselType, flag: undefined, classification: data.vessel.classificationSociety, callSign: data.vessel.callSign
  }
  if (data.newVessel) return {
    imo: data.newVessel.imoNumber, built: data.newVessel.builtYear, gt: data.newVessel.grossTonnage,
    type: data.newVessel.vesselType, flag: data.newVessel.flag, classification: data.newVessel.classification, callSign: data.newVessel.callSign
  }
  return {}
}

function getFileName(data: QuotationData, ext: string): string {
  const ref = data.quotation.referenceNumber || 'Quotation'
  const name = vesselName(data).replace(/[^a-zA-Z0-9]/g, '_')
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

  const vd = vesselDetails(data)
  const vName = vesselName(data)
  const selectedClauses = data.allClauses.filter(c => data.selectedClauseIds.includes(c.id))
  const selectedWarranties = data.allWarranties.filter(w => data.selectedWarrantyIds.includes(w.id))
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
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(0, 0, 0)
  doc.text(`PROTECTION AND INDEMNITY QUOTATION FOR M/V ${vName}`, pageWidth / 2, startY, { align: 'center' })
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(dateStr, pageWidth - margin, startY + 10, { align: 'right' })
  doc.text(`Ref: ${data.quotation.referenceNumber || '-'}`, margin, startY + 18)

  // Build two-column sections
  const sections: [string, string][] = []

  // Insured
  let insuredText = ''
  for (const a of data.assureds) {
    insuredText += a.name + '\n'
    if (a.role) insuredText += `"as ${a.role}"\n`
    insuredText += '\n'
  }
  if (st(data, 'insuredFooter')) insuredText += stripHtml(st(data, 'insuredFooter'))
  const brokerName = getBrokerName(data)
  if (brokerName) insuredText += `\n\nc/o ${brokerName}`
  sections.push(['Insured', insuredText.trim()])

  // Insured Vessel
  const vesselLine = `Name: ${vName}  |  IMO: ${vd.imo || '-'}  |  Built: ${vd.built || '-'}  |  GT: ${vd.gt ? vd.gt.toLocaleString() : '-'}\nFlag: ${vd.flag || '-'}  |  Type: ${vd.type || '-'}  |  Class: ${vd.classification || '-'}`
  sections.push(['Insured Vessel', vesselLine])

  // Limit of Liability
  let liabilityText = ''
  if (data.quotation.limitOfLiabilityText) {
    liabilityText = data.quotation.limitOfLiabilityText
  } else if (st(data, 'limitOfLiabilityDefaultText') && data.quotation.limitOfLiabilityAmount != null) {
    liabilityText = stripHtml(st(data, 'limitOfLiabilityDefaultText'))
      .replace('{amount}', formatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency))
      .replace('{currency}', data.quotation.limitOfLiabilityCurrency || 'USD')
  } else if (data.quotation.limitOfLiabilityAmount != null) {
    liabilityText = `${formatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency)} all claims in the aggregate.`
  }
  for (const sl of data.subLimits) {
    liabilityText += `\n\n${sl.text}: ${formatCurrency(sl.amount, sl.currency)}`
  }
  if (data.subLimits.length > 0) {
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
      condText += `Section B Cl.${c.clauseNumber} \u2013 ${c.name || ''}${clauseDesc}\n`
    }
    if (data.additionalClauses.length > 0) {
      condText += '\n'
      for (const ac of data.additionalClauses) {
        const text = ac.customText || data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)?.text || ''
        if (text) condText += `\u2022 ${text}\n`
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

    // a. Trading warranty text (per-quotation)
    if (q.tradingWarrantyIntro) {
      tradingText += stripHtml(q.tradingWarrantyIntro) + '\n\n'
    }

    // Excluded countries list (before DDQ)
    if (excCountries.length > 0) {
      tradingText += 'Excluded countries: ' + excCountries.map(c => c.name).join(', ') + '.\n\n'
    }

    // b. DDQ countries list paragraph
    if (q.tradingShowDdqList && ddqCountries.length > 0) {
      const ddqIntro = stripHtml(st(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
      tradingText += ddqIntro.replace(/\{ddq_countries\}/g, ddqListStr)
      if (!ddqIntro.includes('{ddq_countries}')) tradingText += ' ' + ddqListStr + '.'
      tradingText += '\n\n'
    }

    // c. Trading warranties for DDQ countries
    if (q.tradingShowDdqWarranties && st(data, 'tradingConditions')) {
      tradingText += stripHtml(st(data, 'tradingConditions')) + '\n\n'
    }

    // d. Israel exclusion
    if (q.tradingShowIsrael && st(data, 'tradingIsrael')) {
      tradingText += stripHtml(st(data, 'tradingIsrael')) + '\n\n'
    }

    // e. Custom trading text
    if (q.tradingCustomText) {
      tradingText += stripHtml(q.tradingCustomText)
    }

    if (tradingText.trim()) {
      sections.push(['Trading Warranty', tradingText.trim()])
    }
  }

  // Warranties
  if (selectedWarranties.length > 0) {
    let warText = ''
    for (const w of selectedWarranties) {
      warText += `\u2022 ${w.text}\n`
    }
    if (st(data, 'warrantiesBreach')) warText += '\n' + stripHtml(st(data, 'warrantiesBreach')) + '\n'
    if (st(data, 'warrantiesNote')) warText += '\n' + stripHtml(st(data, 'warrantiesNote'))
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
  if (data.quotation.validityDays) infoText += `- Quote open for ${data.quotation.validityDays} days\n`
  for (const info of data.information) { infoText += `- ${info.text}\n` }
  sections.push(['Information', infoText.trim() || '-'])

  // Render main two-column table
  autoTable(doc, {
    startY: startY + 26,
    body: sections,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42, valign: 'top' as any },
      1: { valign: 'top' as any }
    },
    theme: 'grid',
    styles: { fontSize: 11, cellPadding: 5, lineColor: [180, 180, 180], lineWidth: 0.25, overflow: 'linebreak', textColor: [0, 0, 0], font: 'helvetica' },
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
  const vd = vesselDetails(data)
  const vName = vesselName(data)
  const selectedClauses = data.allClauses.filter(c => data.selectedClauseIds.includes(c.id))
  const selectedWarranties = data.allWarranties.filter(w => data.selectedWarrantyIds.includes(w.id))
  const ddqCountries = data.excludedCountries.filter(c => c.listType === 'ddq')
  const exclusionTexts = getExclusionTexts(data)
  const dateStr = data.quotation.quotationDate
    ? new Date(data.quotation.quotationDate).toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  // Paragraph helpers - 11pt Arial black
  const np = (text: string) => new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })

  const bp = (text: string) => new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true })]
  })

  const bulletP = (text: string) => new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 40 },
    indent: { left: 360, hanging: 360 },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })

  const emptyP = () => new Paragraph({ spacing: { after: 40 }, children: [] })

  const mp = (text: string): Paragraph[] => {
    if (!text) return []
    if (isHtml(text)) return parseHtmlToParagraphs(text, { size: 22, font: 'Arial', color: '000000' })
    return text.split('\n').map(p =>
      p.trim() ? np(p) : emptyP()
    )
  }

  // Border helpers for main table
  const thin = { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' }
  const thinBorders = () => ({ top: thin, bottom: thin, left: thin, right: thin })

  function makeRow(title: string, content: (Paragraph | Table)[]): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: 20, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: title, bold: true, size: 22, font: 'Arial', color: '000000' })]
          })]
        }),
        new TableCell({
          width: { size: 80, type: WidthType.PERCENTAGE },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: content.length > 0 ? content : [emptyP()]
        })
      ]
    })
  }

  const rows: TableRow[] = []

  // ---- Insured ----
  const insuredContent: (Paragraph | Table)[] = []
  if (data.assureds.length > 0) {
    insuredContent.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: data.assureds.map(a => new TableRow({
        children: [
          new TableCell({
            borders: noBorders(),
            children: [new Paragraph({ children: [new TextRun({ text: a.name, size: 22, font: 'Arial', color: '000000' })] })]
          }),
          new TableCell({
            borders: noBorders(),
            children: [new Paragraph({ children: [new TextRun({ text: a.role ? `"as ${a.role}"` : '', size: 22, font: 'Arial', color: '000000' })] })]
          })
        ]
      }))
    }))
  }
  if (st(data, 'insuredFooter')) {
    insuredContent.push(emptyP())
    insuredContent.push(...mp(st(data, 'insuredFooter')))
  }
  const wordBrokerName = getBrokerName(data)
  if (wordBrokerName) {
    insuredContent.push(emptyP())
    insuredContent.push(np(`c/o ${wordBrokerName}`))
  }
  rows.push(makeRow('Insured', insuredContent))

  // ---- Insured Vessel ----
  const vesselTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: ['Name', 'IMO', 'Built', 'GT', 'Flag', 'Type', 'Class'].map(h =>
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 20, font: 'Arial', color: '000000' })] })],
            shading: { type: ShadingType.SOLID, color: 'F0F0F0' }
          })
        )
      }),
      new TableRow({
        children: [
          vName, vd.imo || '-', vd.built ? String(vd.built) : '-',
          vd.gt ? vd.gt.toLocaleString() : '-', vd.flag || '-', vd.type || '-', vd.classification || '-'
        ].map(v =>
          new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: v, size: 20, font: 'Arial', color: '000000' })] })] })
        )
      })
    ]
  })
  rows.push(makeRow('Insured Vessel', [vesselTable]))

  // ---- Limit of Liability ----
  const liabContent: (Paragraph | Table)[] = []
  if (data.quotation.limitOfLiabilityText) {
    liabContent.push(...mp(data.quotation.limitOfLiabilityText))
  } else if (st(data, 'limitOfLiabilityDefaultText') && data.quotation.limitOfLiabilityAmount != null) {
    const lolText = st(data, 'limitOfLiabilityDefaultText')
      .replace('{amount}', formatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency))
      .replace('{currency}', data.quotation.limitOfLiabilityCurrency || 'USD')
    liabContent.push(...mp(lolText))
  } else if (data.quotation.limitOfLiabilityAmount != null) {
    liabContent.push(np(`${formatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency)} all claims in the aggregate.`))
  }
  for (const sl of data.subLimits) {
    liabContent.push(np(`${sl.text}: ${formatCurrency(sl.amount, sl.currency)}`))
  }
  if (data.subLimits.length > 0) {
    liabContent.push(np('Under no circumstances is the Combined Single Limit detailed above to be exceeded.'))
  }
  if (liabContent.length > 0) rows.push(makeRow('Limit of Liability', liabContent))

  // ---- Period ----
  if (data.quotation.periodText) {
    rows.push(makeRow('Period', [np(data.quotation.periodText)]))
  }

  // ---- Conditions ----
  if (selectedClauses.length > 0 || data.additionalClauses.length > 0) {
    const condContent: (Paragraph | Table)[] = []
    if (st(data, 'conditionsIntro')) condContent.push(...mp(st(data, 'conditionsIntro')))
    if (selectedClauses.length > 0) {
      condContent.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: selectedClauses.map(c => {
          const desc = data.clauseOverrides[c.id] || c.description
          const clauseDesc = desc ? ` \u2013 ${desc}` : ''
          return new TableRow({
            children: [
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: `Section B Cl.${c.clauseNumber}`, size: 22, font: 'Arial', color: '000000' })] })]
              }),
              new TableCell({
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: `${c.name || ''}${clauseDesc}`, size: 22, font: 'Arial', color: '000000' })] })]
              })
            ]
          })
        })
      }))
    }
    if (data.additionalClauses.length > 0) {
      condContent.push(emptyP())
      for (const ac of data.additionalClauses) {
        const text = ac.customText || data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)?.text || ''
        if (text) condContent.push(bulletP(text))
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

    // a. Trading warranty text (per-quotation)
    if (wq.tradingWarrantyIntro) tradContent.push(...mp(wq.tradingWarrantyIntro))

    // Excluded countries list (before DDQ)
    if (wExcCountries.length > 0) {
      tradContent.push(emptyP())
      tradContent.push(np('Excluded countries: ' + wExcCountries.map(c => c.name).join(', ') + '.'))
    }

    // b. DDQ countries list paragraph
    if (wq.tradingShowDdqList && ddqCountries.length > 0) {
      let ddqIntroText = st(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:'
      ddqIntroText = ddqIntroText.replace(/\{ddq_countries\}/g, wDdqListStr)
      if (!ddqIntroText.includes(wDdqListStr)) ddqIntroText += ' ' + wDdqListStr + '.'
      tradContent.push(emptyP())
      tradContent.push(...mp(ddqIntroText))
    }

    // c. Trading warranties for DDQ countries
    if (wq.tradingShowDdqWarranties && st(data, 'tradingConditions')) {
      tradContent.push(emptyP())
      tradContent.push(...mp(st(data, 'tradingConditions')))
    }

    // d. Israel exclusion
    if (wq.tradingShowIsrael && st(data, 'tradingIsrael')) {
      tradContent.push(emptyP())
      tradContent.push(...mp(st(data, 'tradingIsrael')))
    }

    // e. Custom trading text
    if (wq.tradingCustomText) {
      tradContent.push(emptyP())
      tradContent.push(...mp(wq.tradingCustomText))
    }

    if (tradContent.length > 0) {
      rows.push(makeRow('Trading Warranty', tradContent))
    }
  }

  // ---- Warranties ----
  if (selectedWarranties.length > 0) {
    const warContent: (Paragraph | Table)[] = []
    for (const w of selectedWarranties) { warContent.push(bulletP(w.text)) }
    if (st(data, 'warrantiesBreach')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesBreach')))
    }
    if (st(data, 'warrantiesNote')) {
      warContent.push(emptyP())
      warContent.push(...mp(st(data, 'warrantiesNote')))
    }
    rows.push(makeRow('Warranties', warContent))
  }

  // ---- Deductibles ----
  if (data.deductibles.length > 0 || data.textDeductibles.length > 0) {
    const dedContent: (Paragraph | Table)[] = []
    if (data.deductibles.length > 0) {
      dedContent.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: data.deductibles.map(d => {
          let desc = d.description.replace(/\{sub_amount\}/g, d.secondaryAmount != null ? formatCurrency(d.secondaryAmount, d.currency) : '-')
          if (d.secondaryAmount != null && d.secondaryDescription) {
            const secDesc = d.secondaryDescription.replace(/\{sub_amount\}/g, formatCurrency(d.secondaryAmount, d.currency))
            desc += ` (${secDesc}: ${formatCurrency(d.secondaryAmount, d.currency)})`
          }
          return new TableRow({
            children: [
              new TableCell({
                width: { size: 25, type: WidthType.PERCENTAGE },
                borders: noBorders(),
                children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(d.amount, d.currency), size: 22, font: 'Arial', color: '000000' })] })]
              }),
              new TableCell({
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
  if (data.quotation.validityDays) infoContent.push(np(`- Quote open for ${data.quotation.validityDays} days`))
  for (const info of data.information) { infoContent.push(np(`- ${info.text}`)) }
  rows.push(makeRow('Information', infoContent.length > 0 ? infoContent : [emptyP()]))

  // Build main two-column table
  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
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
        new TextRun({ text: `PROTECTION AND INDEMNITY QUOTATION FOR M/V ${vName}`, bold: true, size: 26, font: 'Arial', color: '000000' })
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
    sections: [{ properties: {}, children: children as any[] }]
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
