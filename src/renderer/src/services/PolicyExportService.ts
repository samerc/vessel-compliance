import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, PageBreak, VerticalAlign,
  PageOrientation, TableLayoutType, LevelFormat,
  Footer, PageNumber, ImageRun
} from 'docx'
import {
  Quotation, Vessel, QuotationAssured, QuotationSubLimit, QuotationDeductible,
  QuotationTextDeductible, QuotationExcludedCountry,
  PIClause, PIWarranty, PIExclusion, PIAdditionalClause, PISectionTexts,
  PISanctionsVersion, QuotationVessel, QuotationCustomWarranty, QuotationCustomExclusion,
  QuotationSubjectivity,
  HullClause, HullClauseCondition, HullAdditionalCondition,
  QuotationAgreedValueItem, QuotationHullCondition, QuotationHullAdditionalCondition,
  QuotationHullAlternative,
  QuotationPIAlternative, WarCondition, QuotationWarCondition, WarSettings
} from '../../../shared/types'
import { DEFAULT_SECTION_TEXTS } from '../components/quotationSettingsConstants'
import { parseHtmlToParagraphs, htmlToPlainText } from '../utils/htmlToDocx'
import { stripHtml } from '../utils/htmlToPdfText'
import { getReportSettings } from './ReportSettingsService'
import { formatDate } from '../utils/dateUtils'

// ==================== Blue Card Types ====================

type BlueCardType = 'BBC' | 'WRC' | 'MLC4.2' | 'MLC2.5.2'

const CONVENTION_NAMES: Record<BlueCardType, string> = {
  BBC: 'International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001',
  WRC: 'Nairobi International Convention on the Removal of Wrecks, 2007',
  'MLC4.2': 'Maritime Labour Convention, 2006 \u2014 Regulation 4.2: Shipowners\u2019 Liability',
  'MLC2.5.2': 'Maritime Labour Convention, 2006 \u2014 Standard A2.5.2: Financial Security (Repatriation)',
}

const CONVENTION_SHORT: Record<BlueCardType, string> = {
  BBC: 'the International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001',
  WRC: 'the Nairobi International Convention on the Removal of Wrecks, 2007',
  'MLC4.2': 'the Maritime Labour Convention, 2006, Regulation 4.2',
  'MLC2.5.2': 'the Maritime Labour Convention, 2006, Standard A2.5.2',
}

// ==================== Input Types ====================

export interface BlueCardData {
  policyNumber: string
  vesselName: string
  imoNumber: string
  flagState: string
  grossTonnage: number | string
  inceptionDate: string
  inceptionTime: string
  expiryDate: string
  expiryTime: string
  timezone: string
}

// ==================== Border Helpers ====================

function noBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}

// ==================== Blue Card Page Builder ====================

function buildBlueCardPage(
  data: BlueCardData,
  cardType: BlueCardType,
  companyName: string,
  isLastPage: boolean
): Paragraph[] {
  const certNumber = `${data.policyNumber}/${cardType}`
  const conventionFull = CONVENTION_NAMES[cardType]
  const conventionRef = CONVENTION_SHORT[cardType]
  const gt = typeof data.grossTonnage === 'number'
    ? data.grossTonnage.toLocaleString('en-US')
    : data.grossTonnage

  const inceptionFormatted = formatDate(data.inceptionDate)
  const expiryFormatted = formatDate(data.expiryDate)

  const LABEL_W = 2800
  const VALUE_W = 7400

  const detailRow = (label: string, value: string) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: LABEL_W, type: WidthType.DXA },
          borders: noBorders(),
          children: [
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: label, size: 20, font: 'Calibri' })],
            }),
          ],
        }),
        new TableCell({
          width: { size: VALUE_W, type: WidthType.DXA },
          borders: noBorders(),
          children: [
            new Paragraph({
              spacing: { before: 40, after: 40 },
              children: [new TextRun({ text: value, size: 20, font: 'Calibri', bold: true })],
            }),
          ],
        }),
      ],
    })

  const children: Paragraph[] = []

  // Spacer at top
  children.push(new Paragraph({ spacing: { before: 400 }, children: [] }))

  // Company name
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: companyName,
          bold: true,
          size: 32,
          font: 'Calibri',
        }),
      ],
    })
  )

  // Divider line
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: '\u2500'.repeat(60),
          size: 16,
          font: 'Calibri',
          color: '999999',
        }),
      ],
    })
  )

  // CERTIFICATE OF INSURANCE
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'CERTIFICATE OF INSURANCE',
          bold: true,
          size: 28,
          font: 'Calibri',
        }),
      ],
    })
  )

  // Convention name (italics)
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 300 },
      children: [
        new TextRun({
          text: conventionFull,
          italics: true,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  )

  // Certificate number
  children.push(
    new Paragraph({
      spacing: { after: 300 },
      children: [
        new TextRun({ text: 'Certificate Number: ', size: 20, font: 'Calibri' }),
        new TextRun({ text: certNumber, bold: true, size: 22, font: 'Calibri' }),
      ],
    })
  )

  // Vessel details table
  const vesselTable = new Table({
    width: { size: LABEL_W + VALUE_W, type: WidthType.DXA },
    rows: [
      detailRow('Name of Ship:', data.vesselName),
      detailRow('IMO Number:', data.imoNumber),
      detailRow('Port of Registry:', data.flagState),
      detailRow('Gross Tonnage:', gt),
    ],
  })

  children.push(vesselTable as unknown as Paragraph)

  // Spacer
  children.push(new Paragraph({ spacing: { before: 300 }, children: [] }))

  // Period of insurance header
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'Period of Insurance:',
          bold: true,
          size: 20,
          font: 'Calibri',
          underline: {},
        }),
      ],
    })
  )

  // From line
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      indent: { left: 400 },
      children: [
        new TextRun({ text: 'From:  ', size: 20, font: 'Calibri' }),
        new TextRun({
          text: `${inceptionFormatted}  ${data.inceptionTime}  ${data.timezone}`,
          bold: true,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  )

  // To line
  children.push(
    new Paragraph({
      spacing: { after: 300 },
      indent: { left: 400 },
      children: [
        new TextRun({ text: 'To:      ', size: 20, font: 'Calibri' }),
        new TextRun({
          text: `${expiryFormatted}  ${data.expiryTime}  ${data.timezone}`,
          bold: true,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  )

  // Insurer details
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: 'Insurer Details:',
          bold: true,
          size: 20,
          font: 'Calibri',
          underline: {},
        }),
      ],
    })
  )

  children.push(
    new Paragraph({
      spacing: { after: 300 },
      indent: { left: 400 },
      children: [
        new TextRun({ text: 'Name of Insurer:  ', size: 20, font: 'Calibri' }),
        new TextRun({ text: companyName, bold: true, size: 20, font: 'Calibri' }),
      ],
    })
  )

  // Accordance statement
  children.push(
    new Paragraph({
      spacing: { after: 400 },
      children: [
        new TextRun({
          text: `This certificate is issued in accordance with the provisions of ${conventionRef}.`,
          italics: true,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  )

  // Date and place
  const today = formatDate(new Date())
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: 'Date: ', size: 20, font: 'Calibri' }),
        new TextRun({ text: today, bold: true, size: 20, font: 'Calibri' }),
      ],
    })
  )

  // Spacer before signature
  children.push(new Paragraph({ spacing: { before: 600 }, children: [] }))

  // Signature line
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [
        new TextRun({
          text: '_'.repeat(40),
          size: 20,
          font: 'Calibri',
          color: '999999',
        }),
      ],
    })
  )

  // Signature label
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: companyName,
          bold: true,
          size: 20,
          font: 'Calibri',
        }),
      ],
    })
  )

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'Authorised Signatory',
          size: 18,
          font: 'Calibri',
          color: '666666',
        }),
      ],
    })
  )

  // Page break unless last page
  if (!isLastPage) {
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      })
    )
  }

  return children
}

// ==================== Public Export Functions ====================

/**
 * Export a single blue card as a DOCX document.
 */
export async function exportBlueCardDocx(
  data: BlueCardData,
  cardType: BlueCardType
): Promise<void> {
  const settings = await getReportSettings()
  const companyName = settings.companyName || 'Insurance Company'

  const children = buildBlueCardPage(data, cardType, companyName, true)

  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1200,
            bottom: 1000,
            left: 1200,
            right: 1200,
          },
        },
      },
      children: children as any[],
    }],
  })

  const blob = await Packer.toBlob(document)
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = `${data.policyNumber}-${cardType}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Export multiple blue cards as a single DOCX document with page breaks.
 */
export async function exportBlueCardsDocx(
  data: BlueCardData,
  cardTypes: BlueCardType[]
): Promise<void> {
  if (cardTypes.length === 0) return

  // Single card — use single-card naming
  if (cardTypes.length === 1) {
    return exportBlueCardDocx(data, cardTypes[0])
  }

  const settings = await getReportSettings()
  const companyName = settings.companyName || 'Insurance Company'

  const allChildren: Paragraph[] = []
  cardTypes.forEach((cardType, idx) => {
    const isLast = idx === cardTypes.length - 1
    const pageChildren = buildBlueCardPage(data, cardType, companyName, isLast)
    allChildren.push(...pageChildren)
  })

  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1200,
            bottom: 1000,
            left: 1200,
            right: 1200,
          },
        },
      },
      children: allChildren as any[],
    }],
  })

  const blob = await Packer.toBlob(document)
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = `${data.policyNumber}-BlueCards.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ==================== Policy Document / Debit Advice / Credit Advice ====================

// Page geometry (A4)
const POL_PAGE_W_DXA = 11906
const POL_PAGE_H_DXA = 16838
const POL_MARGIN_LR = 850
const POL_MARGIN_TOP = 900
const POL_MARGIN_BOT = 850
const POL_HEADER_DXA = 450
const POL_FOOTER_DXA = 450
const POL_CONTENT_W = POL_PAGE_W_DXA - 2 * POL_MARGIN_LR
const POL_TITLE_W = Math.round(POL_CONTENT_W * 0.20)
const POL_BODY_W = POL_CONTENT_W - POL_TITLE_W

// ---- Policy data interfaces ----

interface PolicyDocRecord {
  id: string
  quotationId: string
  vesselId: string
  policyNumber: string
  revisionNumber: number
  inceptionDate: string
  inceptionTime: string
  expiryDate: string
  expiryTime: string
  timezone: string
  commissionPercent?: number
  bankId?: string
  showAddresses: boolean
  openingClause?: string
  importantNotice?: string
  closingCity?: string
  cancelReplaceText?: string
  previousPolicyNumber?: string
  previousPolicyDate?: string
  quotationTypeCode?: string
  quotationTypeName?: string
  createdAt?: string
}

interface PolicyInstalment {
  id: string
  policyId: string
  instalmentNumber: number
  dueDate: string
  amount: number
  commissionAmount?: number
  currency: string
  isNonRefundable?: boolean
}

interface PolicyAddress {
  id: string
  policyId: string
  entityId: string
  entityName: string
  role: string
  address: string
  country: string
  order: number
}

interface PolicyBlueCardEntry {
  id: string
  policyId: string
  text: string
}

interface BankRecord {
  id: string
  name: string
  details: string
  order: number
}

interface PolicyExportData {
  policy: PolicyDocRecord
  quotation: Quotation
  instalments: PolicyInstalment[]
  addresses: PolicyAddress[]
  blueCards: PolicyBlueCardEntry[]
  vessel: QuotationVessel | null
  vesselInfo: PolVesselInfo
  bank: BankRecord | null
  quotationVessels: QuotationVessel[]
  allVessels: Vessel[]
  flagStates: { id: string; name: string }[]
  assureds: QuotationAssured[]
  subLimits: QuotationSubLimit[]
  selectedClauseIds: string[]
  allClauses: PIClause[]
  additionalClauses: { id: string; piAdditionalClauseId?: string; customText?: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]
  allAdditionalClauses: PIAdditionalClause[]
  selectedWarrantyIds: string[]
  allWarranties: PIWarranty[]
  customWarranties: QuotationCustomWarranty[]
  deductibles: QuotationDeductible[]
  textDeductibles: QuotationTextDeductible[]
  selectedExclusions: { id: string; piExclusionId?: string; customText?: string; vesselScope?: string[] | null; alternativeId?: string | null }[]
  allExclusions: PIExclusion[]
  customExclusions: QuotationCustomExclusion[]
  excludedCountries: QuotationExcludedCountry[]
  subjectivities: QuotationSubjectivity[]
  sectionTexts: PISectionTexts
  sanctionsVersions: PISanctionsVersion[]
  clauseOverrides: Record<string, string>
  piAlternatives: QuotationPIAlternative[]
  hullAgreedValueItems: QuotationAgreedValueItem[]
  hullClauses: HullClause[]
  hullConditions: QuotationHullCondition[]
  allHullConditions: HullClauseCondition[]
  hullAdditionalConditions: QuotationHullAdditionalCondition[]
  allHullAdditionalConditions: HullAdditionalCondition[]
  hullAlternatives: QuotationHullAlternative[]
  warConditions: QuotationWarCondition[]
  allWarConditions: WarCondition[]
  warSettings: WarSettings | null
  surveyWarranties: { id: string; text: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]
  companyName: string
}

interface PolVesselInfo {
  name: string
  imo?: string
  built?: number
  gt?: number
  type?: string
  flag?: string
  classification?: string
  callSign?: string
}

// ---- Data loading ----

async function loadPolicyExportData(policyId: string): Promise<PolicyExportData> {
  const policy: PolicyDocRecord = await (window.api as any).policyGetById(policyId)
  const quotationOrNull = await window.api.getQuotation(policy.quotationId)
  if (!quotationOrNull) throw new Error('Quotation not found')
  const quotation: Quotation = quotationOrNull

  const [
    instalments, addresses, blueCards,
    quotationVessels, allVessels, assureds, subLimits,
    clauseRows, allClauses, additionalClauses, allAdditionalClauses,
    warrantyRows, allWarranties, customWarranties,
    deductibles, textDeductibles,
    selectedExclusions, allExclusions, customExclusions,
    excludedCountries, subjectivities,
    sectionTexts, sanctionsVersions, clauseOverridesArr,
    hullAgreedValueItems, hullClausesRaw, hullConditionsRaw, allHullConditionsRaw,
    hullAdditionalConditionsRaw, allHullAdditionalConditionsRaw, hullAlternativesRaw,
    warConditionsRaw, allWarConditionsRaw, warSettingsRaw,
    flagStatesRaw, surveyWarrantiesRaw, banks
  ] = await Promise.all([
    (window.api as any).policyGetInstalments(policyId),
    (window.api as any).policyGetAddresses(policyId),
    (window.api as any).policyGetBlueCards(policyId),
    window.api.getQuotationVessels(policy.quotationId),
    window.api.getVessels(),
    window.api.getQuotationAssureds(policy.quotationId),
    window.api.getQuotationSubLimits(policy.quotationId),
    window.api.getQuotationClauses(policy.quotationId),
    window.api.piGetClauses(),
    window.api.getQuotationAdditionalClauses(policy.quotationId),
    window.api.piGetAdditionalClauses(),
    window.api.getQuotationWarranties(policy.quotationId),
    window.api.piGetWarranties(),
    window.api.getQuotationCustomWarranties(policy.quotationId),
    window.api.getQuotationDeductibles(policy.quotationId),
    window.api.getQuotationTextDeductibles(policy.quotationId),
    window.api.getQuotationExclusions(policy.quotationId),
    window.api.piGetExclusions(),
    window.api.getQuotationCustomExclusions(policy.quotationId),
    window.api.getQuotationExcludedCountries(policy.quotationId),
    window.api.getQuotationSubjectivities(policy.quotationId),
    window.api.piGetSectionTexts(),
    window.api.piGetSanctionsVersions(),
    window.api.getQuotationClauseOverrides(policy.quotationId),
    window.api.hullGetQuotationAgreedValueItems(policy.quotationId),
    window.api.hullGetClauses(),
    window.api.hullGetQuotationHullConditions(policy.quotationId),
    window.api.hullGetClauseConditions(),
    window.api.hullGetQuotationHullAdditionalConditions(policy.quotationId),
    window.api.hullGetAdditionalConditions(),
    window.api.hullGetQuotationAlternatives(policy.quotationId),
    window.api.warGetQuotationWarConditions(policy.quotationId),
    window.api.warGetConditions(),
    window.api.warGetSettings(),
    window.api.getFlagStates(),
    window.api.quotationSurveyWarrantyGetAll(policy.quotationId),
    window.api.bankGetAll()
  ])

  const safeClauseRows = Array.isArray(clauseRows) ? clauseRows : []
  const selectedClauseIds = safeClauseRows.map((r: any) => r.piClauseId)
  const clauseOverrides: Record<string, string> = (clauseOverridesArr && typeof clauseOverridesArr === 'object' && !Array.isArray(clauseOverridesArr))
    ? clauseOverridesArr as Record<string, string>
    : {}

  const safeWarrantyRows = Array.isArray(warrantyRows) ? warrantyRows : []
  const selectedWarrantyIds = safeWarrantyRows.map((r: any) => r.piWarrantyId)

  const piAlternativesRaw = quotation.quotationTypeCode === 'P'
    ? await window.api.piGetQuotationAlternatives(policy.quotationId)
    : []

  const mergedTexts: PISectionTexts = { ...DEFAULT_SECTION_TEXTS, ...(sectionTexts || {}), ...(quotation.sectionTextsOverride || {}) }

  const safeQVessels = Array.isArray(quotationVessels) ? quotationVessels : []
  const vessel = safeQVessels.find(v => v.vesselId === policy.vesselId) || safeQVessels[0] || null
  const safeFlagStates: { id: string; name: string }[] = Array.isArray(flagStatesRaw) ? flagStatesRaw : []
  const safeAllVessels: Vessel[] = Array.isArray(allVessels) ? allVessels : []

  const vesselInfo: PolVesselInfo = vessel ? polGetVesselInfo(vessel, safeAllVessels, safeFlagStates) : { name: 'Unknown' }

  const safeBanks: BankRecord[] = Array.isArray(banks) ? banks : []
  const bank = policy.bankId ? safeBanks.find(b => b.id === policy.bankId) || null : null

  const reportSettings = await getReportSettings()

  return {
    policy,
    quotation,
    instalments: Array.isArray(instalments) ? instalments : [],
    addresses: Array.isArray(addresses) ? addresses : [],
    blueCards: Array.isArray(blueCards) ? blueCards : [],
    vessel,
    vesselInfo,
    bank,
    quotationVessels: safeQVessels,
    allVessels: safeAllVessels,
    flagStates: safeFlagStates,
    assureds: Array.isArray(assureds) ? assureds : [],
    subLimits: Array.isArray(subLimits) ? subLimits : [],
    selectedClauseIds,
    allClauses: Array.isArray(allClauses) ? allClauses : [],
    additionalClauses: Array.isArray(additionalClauses) ? additionalClauses : [],
    allAdditionalClauses: Array.isArray(allAdditionalClauses) ? allAdditionalClauses : [],
    selectedWarrantyIds,
    allWarranties: Array.isArray(allWarranties) ? allWarranties : [],
    customWarranties: Array.isArray(customWarranties) ? customWarranties : [],
    deductibles: Array.isArray(deductibles) ? deductibles : [],
    textDeductibles: Array.isArray(textDeductibles) ? textDeductibles : [],
    selectedExclusions: Array.isArray(selectedExclusions) ? selectedExclusions : [],
    allExclusions: Array.isArray(allExclusions) ? allExclusions : [],
    customExclusions: Array.isArray(customExclusions) ? customExclusions : [],
    excludedCountries: Array.isArray(excludedCountries) ? excludedCountries : [],
    subjectivities: Array.isArray(subjectivities) ? subjectivities : [],
    sectionTexts: mergedTexts,
    sanctionsVersions: Array.isArray(sanctionsVersions) ? sanctionsVersions : [],
    clauseOverrides,
    piAlternatives: Array.isArray(piAlternativesRaw) ? piAlternativesRaw : [],
    hullAgreedValueItems: Array.isArray(hullAgreedValueItems) ? hullAgreedValueItems : [],
    hullClauses: Array.isArray(hullClausesRaw) ? hullClausesRaw : [],
    hullConditions: Array.isArray(hullConditionsRaw) ? hullConditionsRaw : [],
    allHullConditions: Array.isArray(allHullConditionsRaw) ? allHullConditionsRaw : [],
    hullAdditionalConditions: Array.isArray(hullAdditionalConditionsRaw) ? hullAdditionalConditionsRaw : [],
    allHullAdditionalConditions: Array.isArray(allHullAdditionalConditionsRaw) ? allHullAdditionalConditionsRaw : [],
    hullAlternatives: Array.isArray(hullAlternativesRaw) ? hullAlternativesRaw : [],
    warConditions: Array.isArray(warConditionsRaw) ? warConditionsRaw : [],
    allWarConditions: Array.isArray(allWarConditionsRaw) ? allWarConditionsRaw : [],
    warSettings: (warSettingsRaw && !(warSettingsRaw as any).error) ? warSettingsRaw : null,
    surveyWarranties: Array.isArray(surveyWarrantiesRaw) ? surveyWarrantiesRaw.sort((a: any, b: any) => (a.order || 0) - (b.order || 0)) : [],
    companyName: reportSettings.companyName || 'Insurance Company'
  }
}

// ---- Number to Words ----

function numberToWords(amount: number, currency: string): string {
  const currencyWord = polCurrencyName(currency)
  const rounded = Math.round(amount * 100) / 100
  const intPart = Math.floor(rounded)
  const decPart = Math.round((rounded - intPart) * 100)

  const words = polIntegerToWords(intPart)
  if (decPart > 0) {
    return `${currencyWord} ${words} and ${polIntegerToWords(decPart)} Cents Only`
  }
  return `${currencyWord} ${words} Only`
}

function polCurrencyName(code: string): string {
  const map: Record<string, string> = {
    USD: 'US Dollars',
    EUR: 'Euros',
    GBP: 'British Pounds',
    AED: 'UAE Dirhams',
    LBP: 'Lebanese Pounds',
    CHF: 'Swiss Francs',
    JPY: 'Japanese Yen'
  }
  return map[code?.toUpperCase()] || code || 'US Dollars'
}

function polIntegerToWords(n: number): string {
  if (n === 0) return 'Zero'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const scales: [number, string][] = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
    [100, 'Hundred']
  ]

  if (n < 0) return 'Negative ' + polIntegerToWords(-n)

  let result = ''
  let remaining = n

  for (const [value, label] of scales) {
    if (remaining >= value) {
      const count = Math.floor(remaining / value)
      result += polIntegerToWords(count) + ' ' + label + ' '
      remaining = remaining % value
    }
  }

  if (remaining >= 20) {
    result += tens[Math.floor(remaining / 10)]
    const r = remaining % 10
    if (r > 0) result += '-' + ones[r]
    result += ' '
  } else if (remaining > 0) {
    result += ones[remaining] + ' '
  }

  return result.trim()
}

// ---- Formatting helpers ----

function polFormatDateUS(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

function polFormatTime(time: string | null | undefined): string {
  if (!time) return ''
  if (time === '12:00') return 'Noon'
  if (time === '00:00') return 'Midnight'
  return time
}

function polFormatCurrency(amount: number | undefined, currency: string | undefined): string {
  if (amount == null) return '-'
  const c = currency || 'USD'
  return `${c} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function polFormatAmountOnly(amount: number | undefined): string {
  if (amount == null) return '-'
  const isWhole = Number.isInteger(amount)
  return amount.toLocaleString('en-US', { minimumFractionDigits: isWhole ? 0 : 2, maximumFractionDigits: 2 })
}

function polGetVesselInfo(qv: QuotationVessel, allVessels: Vessel[], flagStates?: { id: string; name: string }[]): PolVesselInfo {
  const reg = qv.vesselId ? allVessels.find(v => v.id === qv.vesselId) : null
  if (reg) {
    const flagName = reg.flagStateId && flagStates ? (flagStates.find(f => f.id === reg.flagStateId)?.name || qv.flag) : qv.flag
    return { name: reg.name, imo: reg.imoNumber, built: reg.builtYear, gt: reg.grossTonnage, type: reg.vesselType, flag: flagName, classification: reg.classificationSociety, callSign: reg.callSign }
  }
  return { name: qv.name || 'Unknown', imo: qv.imoNumber, built: qv.builtYear, gt: qv.grossTonnage, type: qv.vesselType, flag: qv.flag, classification: qv.classification, callSign: qv.callSign }
}

function polOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function polIsHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

function polSt(data: PolicyExportData, key: keyof PISectionTexts): string {
  const raw = String(data.sectionTexts[key] || '')
  return raw.replace(/\{quotation_type\}/g, data.quotation.quotationTypeName || 'P&I')
}

function polFmtPct(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return n % 1 === 0 ? String(Math.round(n)) : String(n)
}

function polGetTypeLabel(typeCode: string | undefined): string {
  switch (typeCode) {
    case 'P': return 'PROTECTION AND INDEMNITY'
    case 'H': return 'HULL AND MACHINERY'
    case 'W': return 'WAR / PIRACY'
    case 'F': return 'FDD'
    case 'L': return 'LOSS OF HIRE'
    default: return 'PROTECTION AND INDEMNITY'
  }
}

function polGetSanctionsText(data: PolicyExportData): string {
  if (data.quotation.sanctionsTextOverride) return data.quotation.sanctionsTextOverride
  const versionKey = data.quotation.sanctionsClauseVersion
  if (!versionKey) return ''
  const version = data.sanctionsVersions.find(v => v.key === versionKey)
  return version?.text || ''
}

// ---- DOCX paragraph helpers ----

function polNp(text: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })
}

function polBp(text: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true })]
  })
}

function polBup(text: string) {
  return new Paragraph({
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold: true, underline: {} })]
  })
}

function polBulletP(text: string) {
  return new Paragraph({
    numbering: { reference: 'dash-bullet', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 40, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })]
  })
}

function polEmptyP() {
  return new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [] })
}

function polMp(text: string): Paragraph[] {
  if (!text) return []
  if (polIsHtml(text)) return parseHtmlToParagraphs(text, { size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
  return text.split('\n').map(p =>
    p.trim() ? polNp(p) : polEmptyP()
  )
}

function polCenteredP(text: string, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold })]
  })
}

function polNoBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}

function polMakeDocxNumbering() {
  return {
    config: [{
      reference: 'dash-bullet',
      levels: [{
        level: 0,
        format: LevelFormat.BULLET,
        text: '-',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 280, hanging: 200 } } }
      }]
    }]
  }
}

function polMakePageProperties() {
  return {
    page: {
      size: { width: POL_PAGE_W_DXA, height: POL_PAGE_H_DXA, orientation: PageOrientation.PORTRAIT },
      margin: {
        top: POL_MARGIN_TOP, bottom: POL_MARGIN_BOT,
        left: POL_MARGIN_LR, right: POL_MARGIN_LR,
        header: POL_HEADER_DXA, footer: POL_FOOTER_DXA
      }
    }
  }
}

function polMakeDefaultFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { before: 40, after: 0 },
      children: [
        new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: '999999' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '999999' }),
        new TextRun({ text: ' of ', size: 16, font: 'Arial', color: '999999' }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, font: 'Arial', color: '999999' })
      ]
    })]
  })
}

function polDownloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

async function polLoadLogoAsBuffer(logoPath: string): Promise<{ buffer: ArrayBuffer; width: number; height: number } | null> {
  try {
    const resp = await fetch(`safe-file://${logoPath}`)
    const blob = await resp.blob()
    const buffer = await blob.arrayBuffer()
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

// ---- Section builders ----

function polBuildInsuredSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []

  if (data.addresses.length > 0) {
    for (const addr of data.addresses.sort((a, b) => a.order - b.order)) {
      const runs: TextRun[] = []
      runs.push(new TextRun({ text: addr.entityName, size: 22, font: 'Arial', color: '000000', bold: true }))
      if (addr.country) {
        runs.push(new TextRun({ text: ` \u2013 ${addr.country}`, size: 22, font: 'Arial', color: '000000' }))
      }
      content.push(new Paragraph({
        spacing: { after: 40, line: 240, lineRule: 'auto' as any },
        children: runs
      }))
      if (addr.role) {
        content.push(polNp(`As ${addr.role}`))
      }
      if (addr.address) {
        for (const line of addr.address.split('\n')) {
          if (line.trim()) content.push(polNp(line.trim()))
        }
      }
      content.push(polEmptyP())
    }
  } else if (data.assureds.length > 0) {
    for (const a of data.assureds) {
      content.push(polNp(a.name + (a.role ? ` \u2013 as ${a.role}` : '')))
    }
    content.push(polEmptyP())
  }

  if (polSt(data, 'insuredFooter')) {
    content.push(...polMp(polSt(data, 'insuredFooter')))
  }

  const brokerName = data.quotation.coName || data.assureds.find(a => a.role?.toLowerCase().includes('broker'))?.name
  if (brokerName) {
    content.push(polEmptyP())
    content.push(polNp(`c/o ${brokerName}`))
  }

  return content
}

function polBuildVesselTable(data: PolicyExportData): Table {
  const vi = data.vesselInfo
  const rows: [string, string][] = [
    ['Vessel Name', vi.name.toUpperCase()],
    ['Vessel Type', vi.type || '-'],
    ['Flag', vi.flag || '-'],
    ['Year Built', vi.built ? String(vi.built) : '-'],
    ['GT', vi.gt ? Number(vi.gt).toLocaleString() : '-'],
    ['IMO Number', vi.imo || '-']
  ]
  if (vi.callSign) rows.push(['Call Sign', vi.callSign])

  const labelW = Math.round(POL_BODY_W * 0.25)
  const sepW = Math.round(POL_BODY_W * 0.05)
  const valW = POL_BODY_W - labelW - sepW

  return new Table({
    width: { size: POL_BODY_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, sepW, valW],
    rows: rows.map(([label, value]) => new TableRow({
      children: [
        new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: label, size: 22, font: 'Arial', color: '000000' })] })] }),
        new TableCell({ width: { size: sepW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: ':', size: 22, font: 'Arial', color: '000000' })] })] }),
        new TableCell({ width: { size: valW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: value, size: 22, font: 'Arial', color: '000000', bold: true })] })] })
      ]
    }))
  })
}

function polBuildPeriodSection(data: PolicyExportData): (Paragraph | Table)[] {
  const { inceptionDate, inceptionTime, expiryDate, expiryTime, timezone } = data.policy
  const labelW = Math.round(POL_BODY_W * 0.10)
  const dateW = Math.round(POL_BODY_W * 0.30)
  const timeW = Math.round(POL_BODY_W * 0.20)
  const tzW = POL_BODY_W - labelW - dateW - timeW

  const makeCell = (text: string, bold = false) => new TableCell({
    width: { size: 0, type: WidthType.AUTO },
    borders: polNoBorders(),
    children: [new Paragraph({ children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000', bold })] })]
  })

  return [new Table({
    width: { size: POL_BODY_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, dateW, timeW, tzW],
    rows: [
      new TableRow({ children: [makeCell('From'), makeCell(polFormatDateUS(inceptionDate), true), makeCell(polFormatTime(inceptionTime)), makeCell(timezone || '')] }),
      new TableRow({ children: [makeCell('To'), makeCell(polFormatDateUS(expiryDate), true), makeCell(polFormatTime(expiryTime)), makeCell(timezone || '')] })
    ]
  })]
}

function polBuildPeriodParagraphs(data: PolicyExportData): Paragraph[] {
  const { inceptionDate, inceptionTime, expiryDate, expiryTime, timezone } = data.policy
  return [
    new Paragraph({
      spacing: { after: 40, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: 'From  ', size: 22, font: 'Arial', color: '000000' }),
        new TextRun({ text: polFormatDateUS(inceptionDate), size: 22, font: 'Arial', color: '000000', bold: true }),
        new TextRun({ text: `  ${polFormatTime(inceptionTime)}  ${timezone || ''}`, size: 22, font: 'Arial', color: '000000' })
      ]
    }),
    new Paragraph({
      spacing: { after: 40, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: 'To      ', size: 22, font: 'Arial', color: '000000' }),
        new TextRun({ text: polFormatDateUS(expiryDate), size: 22, font: 'Arial', color: '000000', bold: true }),
        new TextRun({ text: `  ${polFormatTime(expiryTime)}  ${timezone || ''}`, size: 22, font: 'Arial', color: '000000' })
      ]
    })
  ]
}

function polBuildConditionsSection(data: PolicyExportData): (Paragraph | Table)[] {
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const content: (Paragraph | Table)[] = []

  if (typeCode === 'P') {
    const selectedClauses = data.allClauses.filter(c => data.selectedClauseIds.includes(c.id))
    if (polSt(data, 'conditionsIntro')) content.push(...polMp(polSt(data, 'conditionsIntro')))
    if (selectedClauses.length > 0) {
      const clauseRefW = Math.round(POL_BODY_W * 0.32)
      const clauseDescW = POL_BODY_W - clauseRefW
      content.push(new Table({
        width: { size: POL_BODY_W, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [clauseRefW, clauseDescW],
        rows: selectedClauses.map(c => {
          const desc = data.clauseOverrides[c.id] || c.description
          const clauseDesc = desc ? ` \u2013 ${desc}` : ''
          const displayName = (c.name || '').replace(/^Section\s*B\s*Cl\.?\s*\d+\s*[-\u2013\u2014]?\s*/i, '').trim()
          const rightText = displayName ? `${displayName}${clauseDesc}` : (desc || '')
          return new TableRow({
            children: [
              new TableCell({ width: { size: clauseRefW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `Section B Cl.${c.clauseNumber}`, size: 22, font: 'Arial', color: '000000' })] })] }),
              new TableCell({ width: { size: clauseDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: rightText, size: 22, font: 'Arial', color: '000000' })] })] })
            ]
          })
        })
      }))
    }
    if (data.additionalClauses.length > 0) {
      content.push(polEmptyP())
      for (const ac of data.additionalClauses) {
        const def = data.allAdditionalClauses.find(a => a.id === ac.piAdditionalClauseId)
        const code = def?.code || ''
        const text = ac.customText || def?.text || ''
        if (!text) continue
        content.push(new Paragraph({
          numbering: { reference: 'dash-bullet', level: 0 },
          spacing: { after: 40 },
          children: [
            ...(code ? [new TextRun({ text: code + ' ', size: 22, font: 'Arial', color: '000000' })] : []),
            new TextRun({ text, size: 22, font: 'Arial', color: '000000' })
          ]
        }))
      }
    }
  } else if (typeCode === 'H') {
    polBuildHullConditionsContent(data, content)
  } else if (typeCode === 'W') {
    polBuildWarConditionsContent(data, content)
  }

  return content
}

function polBuildHullConditionsContent(data: PolicyExportData, content: (Paragraph | Table)[]): void {
  const hc = data.hullConditions
  const ha = data.hullAdditionalConditions
  const dAlts = data.hullAlternatives
  if (hc.length === 0 && ha.length === 0) return

  const condCol1W = Math.round(POL_BODY_W * 0.30)
  const condCol2W = POL_BODY_W - condCol1W

  const makeCondTable = (conds: typeof hc) => new Table({
    width: { size: POL_BODY_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [condCol1W, condCol2W],
    rows: conds.map(qc => {
      const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
      if (!def) return null
      let text = qc.textOverride || def.text
      if (def.hasAmount && def.amountPlaceholder && qc.amount != null) {
        const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        text = text.replace(new RegExp(escaped, 'g'), polFormatCurrency(qc.amount, data.quotation.premiumCurrency || 'USD'))
      }
      return new TableRow({
        children: [
          new TableCell({ width: { size: condCol1W, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `Cl. ${def.conditionNumber}`, size: 22, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: condCol2W, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text, size: 22, font: 'Arial', color: '000000' })] })] })
        ]
      })
    }).filter(Boolean) as TableRow[]
  })

  if (dAlts.length > 1) {
    for (let i = 0; i < dAlts.length; i++) {
      const alt = dAlts[i]
      const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
      const altConds = hc.filter(qc => qc.alternativeId === alt.id || !qc.alternativeId)
      content.push(polBup(`Alternative ${i + 1}`))
      content.push(polEmptyP())
      if (clause) { content.push(polNp(clause.description || clause.name)); content.push(polEmptyP()) }
      if (altConds.length > 0) content.push(makeCondTable(altConds))
      content.push(polEmptyP())
    }
  } else {
    const singleAlt = dAlts[0]
    const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
    if (selectedClause) {
      content.push(polNp(selectedClause.description || selectedClause.name))
      content.push(polEmptyP())
    }
    if (hc.length > 0) content.push(makeCondTable(hc))
  }

  if (ha.length > 0) {
    content.push(polEmptyP())
    for (const qa of ha) {
      const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
      if (!def) continue
      let condText = qa.textOverride || def.text
      if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
        const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        condText = condText.replace(new RegExp(escaped, 'g'), polFormatCurrency(qa.amount, data.quotation.premiumCurrency || 'USD'))
      }
      content.push(polBulletP(condText))
    }
  }
}

function polBuildWarConditionsContent(data: PolicyExportData, content: (Paragraph | Table)[]): void {
  const wc = data.warConditions
  if (wc.length === 0) return

  const resolveWarText = (text: string): string => {
    if (!data.warSettings) return text
    return text
      .replace(/\{jwla_code\}/g, data.warSettings.jwlaCode)
      .replace(/\{jwla_date\}/g, data.warSettings.jwlaDate)
      .replace(/\{tc_text\}/g, data.warSettings.tcText)
  }

  for (const qc of wc) {
    const def = data.allWarConditions.find(c => c.id === qc.warConditionId)
    if (!def) continue
    content.push(polBulletP(resolveWarText(qc.textOverride || def.text)))
  }

  if (data.warSettings?.tcText) {
    content.push(polEmptyP())
    content.push(polNp(data.warSettings.tcText))
  }
}

function polBuildValueSection(data: PolicyExportData): (Paragraph | Table)[] {
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const content: (Paragraph | Table)[] = []

  if (typeCode === 'P') {
    if (data.quotation.limitOfLiabilityText) {
      content.push(...polMp(data.quotation.limitOfLiabilityText))
    } else if (data.quotation.limitOfLiabilityAmount != null) {
      content.push(polNp(`${polFormatCurrency(data.quotation.limitOfLiabilityAmount, data.quotation.limitOfLiabilityCurrency)} all claims in the aggregate.`))
    }
    if (data.subLimits.length > 0) {
      for (const sl of data.subLimits) {
        content.push(polNp(sl.text.replace('{amount}', polFormatAmountOnly(sl.amount)).replace('{currency}', sl.currency || 'USD')))
      }
    }
  } else if (typeCode === 'H') {
    if (data.quotation.agreedValue != null) {
      content.push(polBp(polFormatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')))
    }
    if (data.hullAgreedValueItems.length > 0) {
      content.push(polEmptyP())
      for (const it of data.hullAgreedValueItems) content.push(polNp(it.text))
    }
  } else if (typeCode === 'W') {
    if (data.quotation.agreedValue != null) {
      content.push(polBp(polFormatCurrency(data.quotation.agreedValue, data.quotation.agreedValueCurrency || 'USD')))
    }
  }

  return content
}

function polGetValueSectionTitle(typeCode: string | undefined): string {
  switch (typeCode) {
    case 'P': return 'Limit of Liability'
    case 'H': return 'Agreed Insured Value'
    case 'W': return 'Sum Insured'
    default: return 'Limit of Liability'
  }
}

function polBuildTradingSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []
  const wq = data.quotation
  const excCountries = data.excludedCountries.filter(c => c.listType === 'excluded')
  const ddqCountries = data.excludedCountries.filter(c => c.listType === 'ddq')

  if (wq.tradingWarrantyIntro) content.push(...polMp(wq.tradingWarrantyIntro))
  if (wq.tradingCustomMode && wq.tradingCustomWording) {
    content.push(polEmptyP())
    content.push(...polMp(wq.tradingCustomWording))
  } else {
    if (wq.tradingCustomText) { content.push(polEmptyP()); content.push(...polMp(wq.tradingCustomText)) }
    if (excCountries.length > 0) { content.push(polEmptyP()); content.push(polNp('Excluding ' + excCountries.map(c => c.name).join(', ') + '.')) }
    if (wq.tradingShowDdqList && ddqCountries.length > 0) {
      const ddqList = [...ddqCountries].sort((a, b) => a.name.localeCompare(b.name)).map(c => c.name).join(', ')
      let ddqIntro = stripHtml(polSt(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
      content.push(polEmptyP())
      if (ddqIntro.includes('{ddq_countries}')) {
        content.push(polNp(ddqIntro.replace(/\{ddq_countries\}/g, ddqList)))
      } else {
        content.push(polNp(ddqIntro))
        content.push(polNp(ddqList))
      }
    }
  }

  return content
}

function polBuildWarrantiesSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []

  for (const wid of data.selectedWarrantyIds) {
    const w = data.allWarranties.find(ww => ww.id === wid)
    if (w) content.push(polBulletP(w.text))
  }
  for (const cw of [...data.customWarranties].sort((a, b) => a.order - b.order)) {
    content.push(polBulletP(cw.text))
  }
  if (data.quotation.quotationTypeCode !== 'W') {
    for (const sw of data.surveyWarranties) content.push(polBulletP(sw.text))
  }
  if (polSt(data, 'warrantiesAdditionalText')) { content.push(polEmptyP()); content.push(...polMp(polSt(data, 'warrantiesAdditionalText'))) }
  if (polSt(data, 'warrantiesBreach')) { content.push(polEmptyP()); content.push(...polMp(polSt(data, 'warrantiesBreach'))) }

  return content
}

function polBuildDeductiblesSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []
  const dedAmtW = Math.round(POL_BODY_W * 0.20)
  const dedDescW = POL_BODY_W - dedAmtW

  if (data.deductibles.length > 0) {
    content.push(new Table({
      width: { size: POL_BODY_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [dedAmtW, dedDescW],
      rows: data.deductibles.map(d => new TableRow({
        children: [
          new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(d.amount, d.currency), size: 22, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.description.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___'), size: 22, font: 'Arial', color: '000000' })] })] })
        ]
      }))
    }))
  }
  if (data.textDeductibles.length > 0) {
    content.push(polEmptyP())
    for (const td of data.textDeductibles) {
      if (td.title) content.push(polBp(td.title))
      content.push(...polMp(td.text))
    }
  }

  return content
}

function polBuildPremiumPaymentSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []
  const { instalments } = data
  const numInst = instalments.length || 1
  const currency = data.quotation.premiumCurrency || 'USD'

  if (polSt(data, 'premiumCondition')) {
    content.push(polBup('CONDITION PRECEDENT'))
    content.push(polEmptyP())
  }

  if (numInst === 1) {
    content.push(polNp('Premium shall be payable in a single instalment.'))
  } else {
    content.push(polNp(`Premium shall be payable in ${numInst} instalments as follows:`))
  }
  content.push(polEmptyP())

  if (instalments.length > 0) {
    const labelW = Math.round(POL_BODY_W * 0.40)
    const dateW = Math.round(POL_BODY_W * 0.30)
    const amtW = POL_BODY_W - labelW - dateW

    content.push(new Table({
      width: { size: POL_BODY_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [labelW, dateW, amtW],
      rows: instalments.map(inst => {
        let label = `${polOrdinal(inst.instalmentNumber)} Instalment due`
        if (inst.isNonRefundable) label += ' (non-refundable)'
        return new TableRow({
          children: [
            new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: label, size: 22, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: dateW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatDateUS(inst.dueDate), size: 22, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(inst.amount, currency), size: 22, font: 'Arial', color: '000000', bold: true })] })] })
          ]
        })
      })
    }))
    content.push(polEmptyP())
  }

  const wq = data.quotation
  if (wq.nonRefundableType) {
    let nrText = ''
    if (wq.nonRefundableType === 'first_instalment') {
      nrText = stripHtml(polSt(data, 'nonRefundableFirstText') || 'The first instalment is deemed to be non-refundable.')
    } else if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
      nrText = stripHtml((polSt(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable.').replace(/\{percent\}/g, polFmtPct(wq.nonRefundablePercent!)))
    }
    if (nrText) { content.push(polNp(nrText)); content.push(polEmptyP()) }
  }

  if (polSt(data, 'premiumCondition')) { content.push(...polMp(polSt(data, 'premiumCondition'))); content.push(polEmptyP()) }
  if (polSt(data, 'premiumEarned')) { content.push(...polMp(polSt(data, 'premiumEarned'))) }

  return content
}

function polGetDefaultOpeningClause(typeCode: string): string {
  if (typeCode === 'P') {
    return 'In consideration of the Insured paying the premium as hereinafter set out, the Insurer hereby agrees to insure the Insured against their legal liabilities, costs and expenses as set out below and subject to the terms and conditions as hereinafter provided.'
  }
  return 'In consideration of the Insured paying the premium as hereinafter set out, the Insurer hereby agrees to insure against the risks and upon the terms and conditions as hereinafter provided.'
}

// ==================== Policy Document Export ====================

export async function exportPolicyDocx(policyId: string): Promise<void> {
  const data = await loadPolicyExportData(policyId)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const typeLabel = polGetTypeLabel(typeCode)

  const children: (Paragraph | Table)[] = []

  // Logo
  const logoPath = await window.api.piGetQuotationLogoPath()
  if (logoPath) {
    const logoData = await polLoadLogoAsBuffer(logoPath)
    if (logoData) {
      const maxW = 200
      const maxH = 80
      const scale = Math.min(maxW / logoData.width, maxH / logoData.height)
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new ImageRun({
          data: logoData.buffer,
          transformation: { width: Math.round(logoData.width * scale), height: Math.round(logoData.height * scale) },
          type: 'png'
        })]
      }))
    }
  }

  // Title
  children.push(polCenteredP(`${typeLabel} POLICY`, true))
  children.push(polCenteredP(`M/V ${data.vesselInfo.name.toUpperCase()}`))
  children.push(polCenteredP(`Policy No. ${data.policy.policyNumber}`))
  children.push(polEmptyP())

  // Opening Clause
  const openingClause = data.policy.openingClause || polGetDefaultOpeningClause(typeCode)
  if (openingClause) {
    children.push(...polMp(openingClause))
    children.push(polEmptyP())
  }

  // THE SCHEDULE header (Hull/War only)
  if (typeCode === 'H' || typeCode === 'W') {
    children.push(polCenteredP('THE SCHEDULE', true))
    children.push(polEmptyP())
  }

  // Build main two-column table
  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  const thinBorders = () => ({ top: thin, bottom: thin, left: thin, right: thin })

  function makeRow(title: string, content: (Paragraph | Table)[]): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: POL_TITLE_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [new TextRun({ text: title, bold: true, size: 22, font: 'Arial', color: '000000' })]
          })]
        }),
        new TableCell({
          width: { size: POL_BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 100, left: 80, right: 80 },
          children: content.length > 0 ? content : [polEmptyP()]
        })
      ]
    })
  }

  const rows: TableRow[] = []

  // INSURED
  const insuredContent = polBuildInsuredSection(data)
  if (insuredContent.length > 0) rows.push(makeRow('Insured', insuredContent))

  // INSURED VESSEL
  rows.push(makeRow('Insured Vessel', [polBuildVesselTable(data)]))

  // VALUE / LIMIT
  const valueContent = polBuildValueSection(data)
  if (valueContent.length > 0) rows.push(makeRow(polGetValueSectionTitle(typeCode), valueContent))

  // PERIOD
  const periodContent = polBuildPeriodSection(data)
  if (periodContent.length > 0) rows.push(makeRow('Period', periodContent))

  // CONDITIONS
  const conditionsContent = polBuildConditionsSection(data)
  if (conditionsContent.length > 0) rows.push(makeRow('Conditions', conditionsContent))

  // CLASSIFICATION
  if (data.vesselInfo.classification) rows.push(makeRow('Classification', [polNp(data.vesselInfo.classification)]))

  // TRADING WARRANTY
  if (typeCode !== 'W') {
    const tradingContent = polBuildTradingSection(data)
    if (tradingContent.length > 0) rows.push(makeRow('Trading Warranty', tradingContent))
  } else if (data.quotation.tradingWarrantyIntro) {
    rows.push(makeRow('Trading Warranty', [polNp(data.quotation.tradingWarrantyIntro)]))
  }

  // WARRANTIES
  const warrantiesContent = polBuildWarrantiesSection(data)
  if (warrantiesContent.length > 0) rows.push(makeRow('Warranties', warrantiesContent))

  // DEDUCTIBLES (P&I only)
  if (typeCode === 'P') {
    const dedContent = polBuildDeductiblesSection(data)
    if (dedContent.length > 0) rows.push(makeRow('Deductibles', dedContent))
  }

  // SANCTIONS
  const sanctionsText = polGetSanctionsText(data)
  if (sanctionsText) rows.push(makeRow('Sanctions', polMp(sanctionsText)))

  // EXCLUSIONS
  const exclusionsContent: Paragraph[] = []
  for (const se of data.selectedExclusions) {
    if (se.customText) exclusionsContent.push(polBulletP(se.customText))
    else if (se.piExclusionId) {
      const found = data.allExclusions.find(e => e.id === se.piExclusionId)
      if (found) exclusionsContent.push(polBulletP(found.text))
    }
  }
  for (const ce of data.customExclusions) exclusionsContent.push(polBulletP(ce.text))
  if (exclusionsContent.length > 0) rows.push(makeRow('Exclusions', exclusionsContent))

  // SUBJECTIVITIES
  const subjContent: Paragraph[] = data.subjectivities.map(sub => polBulletP(sub.text))
  if (subjContent.length > 0) rows.push(makeRow('Subjectivities', subjContent))

  // PREMIUM PAYMENT
  const premiumContent = polBuildPremiumPaymentSection(data)
  if (premiumContent.length > 0) rows.push(makeRow('Premium Payment', premiumContent))

  // Build main table
  const mainTable = new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    columnWidths: [POL_TITLE_W, POL_BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: thin, bottom: thin, left: thin, right: thin,
      insideHorizontal: thin, insideVertical: thin
    },
    rows
  })
  children.push(mainTable)

  // Terms reference
  children.push(polEmptyP())
  children.push(polNp('The said Vessel is covered subject to the terms, clauses, conditions, and warranties as herein set out.'))
  children.push(polEmptyP())

  // Important Notice
  const importantNotice = data.policy.importantNotice || polSt(data, 'importantNotice')
  if (importantNotice) {
    const plainNotice = htmlToPlainText(importantNotice)
    if (plainNotice.startsWith('IMPORTANT NOTICE')) {
      children.push(polCenteredP('IMPORTANT NOTICE', true))
      children.push(...parseHtmlToParagraphs(importantNotice.replace(/^(<p>)?IMPORTANT NOTICE(<\/p>)?\n*/i, ''), {
        size: 22, font: 'Arial', color: '000000', alignment: AlignmentType.CENTER
      }))
    } else {
      children.push(...polMp(importantNotice))
    }
    children.push(polEmptyP())
  }

  // Closing
  const closingCity = data.policy.closingCity || 'Beirut'
  const closingDate = polFormatDateUS(data.policy.createdAt)
  children.push(polNp(`Drawn up in Duplicate, in ${closingCity} on ${closingDate}`))
  children.push(polEmptyP())
  children.push(polEmptyP())

  // Signature block
  const sigLabelW = Math.round(POL_CONTENT_W * 0.45)
  const sigGapW = POL_CONTENT_W - 2 * sigLabelW
  children.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [sigLabelW, sigGapW, sigLabelW],
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: sigLabelW, type: WidthType.DXA }, borders: polNoBorders(), children: [polCenteredP('THE INSURED', true)] }),
        new TableCell({ width: { size: sigGapW, type: WidthType.DXA }, borders: polNoBorders(), children: [polEmptyP()] }),
        new TableCell({ width: { size: sigLabelW, type: WidthType.DXA }, borders: polNoBorders(), children: [polCenteredP('THE INSURER', true)] })
      ]
    })]
  }))

  // Cancel and replace footer (if revision > 0)
  if (data.policy.revisionNumber > 0 && data.policy.previousPolicyNumber) {
    children.push(polEmptyP())
    children.push(polEmptyP())
    let cancelText = `This policy ${data.policy.policyNumber} cancels and replaces policy ${data.policy.previousPolicyNumber}`
    if (data.policy.previousPolicyDate) cancelText += ` dated ${polFormatDateUS(data.policy.previousPolicyDate)}`
    children.push(polNp(cancelText))
  }

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      footers: { default: polMakeDefaultFooter() },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  polDownloadBlob(blob, `${data.policy.policyNumber}.docx`)
}

// ==================== Debit Advice Export ====================

export async function exportDebitAdviceDocx(policyId: string): Promise<void> {
  const data = await loadPolicyExportData(policyId)
  const typeName = data.quotation.quotationTypeName || polGetTypeLabel(data.quotation.quotationTypeCode || 'P')
  const currency = data.quotation.premiumCurrency || 'USD'

  const children: (Paragraph | Table)[] = []

  // Logo
  const logoPath = await window.api.piGetQuotationLogoPath()
  if (logoPath) {
    const logoData = await polLoadLogoAsBuffer(logoPath)
    if (logoData) {
      const maxW = 200
      const maxH = 80
      const scale = Math.min(maxW / logoData.width, maxH / logoData.height)
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
        children: [new ImageRun({
          data: logoData.buffer,
          transformation: { width: Math.round(logoData.width * scale), height: Math.round(logoData.height * scale) },
          type: 'png'
        })]
      }))
    }
  }

  // Header
  children.push(polCenteredP('DEBIT ADVICE', true))
  children.push(polEmptyP())

  // Reference
  children.push(polNp(`In connection with ${typeName} ${data.policy.policyNumber}`))
  children.push(polEmptyP())

  // Vessel
  children.push(polBp(`M/V ${data.vesselInfo.name.toUpperCase()}`))
  children.push(polEmptyP())

  // Connection text
  children.push(polNp('This Debit Advice shall be deemed to be attached to and form part of the said policy.'))
  children.push(polEmptyP())

  // INSURED
  children.push(polBup('INSURED'))
  children.push(polEmptyP())
  children.push(...polBuildInsuredSection(data))
  children.push(polEmptyP())

  // PREMIUM
  const totalPremium = data.instalments.reduce((sum, i) => sum + (i.amount || 0), 0) || data.quotation.premiumAmount || 0
  children.push(polBup('PREMIUM'))
  children.push(polEmptyP())
  children.push(polBp(polFormatCurrency(totalPremium, currency)))
  children.push(polNp(`(${numberToWords(totalPremium, currency)})`))
  children.push(polEmptyP())

  // PREMIUM PAYMENT CONDITION PRECEDENT
  children.push(polBup('PREMIUM PAYMENT CONDITION PRECEDENT'))
  children.push(polEmptyP())

  const numInst = data.instalments.length || 1
  if (numInst === 1) {
    children.push(polNp('Premium shall be payable in a single instalment.'))
  } else {
    children.push(polNp(`Premium shall be payable in ${numInst} instalments as follows:`))
  }
  children.push(polEmptyP())

  if (data.instalments.length > 0) {
    const labelW = Math.round(POL_CONTENT_W * 0.35)
    const dateW = Math.round(POL_CONTENT_W * 0.30)
    const amtW = POL_CONTENT_W - labelW - dateW

    children.push(new Table({
      width: { size: POL_CONTENT_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [labelW, dateW, amtW],
      rows: data.instalments.map(inst => new TableRow({
        children: [
          new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `${polOrdinal(inst.instalmentNumber)} Instalment`, size: 22, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: dateW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatDateUS(inst.dueDate), size: 22, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(inst.amount, currency), size: 22, font: 'Arial', color: '000000', bold: true })] })] })
        ]
      }))
    }))
    children.push(polEmptyP())
  }

  // Non-refundable note
  if (data.quotation.nonRefundableType) {
    let nrText = ''
    if (data.quotation.nonRefundableType === 'first_instalment') {
      nrText = 'The first instalment is deemed to be non-refundable.'
    } else if (data.quotation.nonRefundableType === 'percentage' && data.quotation.nonRefundablePercent) {
      nrText = `${polFmtPct(data.quotation.nonRefundablePercent)}% of premium is non-refundable.`
    }
    if (nrText) { children.push(polNp(nrText)); children.push(polEmptyP()) }
  }

  // PERIOD
  children.push(polBup('PERIOD'))
  children.push(polEmptyP())
  children.push(...polBuildPeriodParagraphs(data))
  children.push(polEmptyP())

  // BANK DETAILS
  if (data.bank) {
    children.push(polBup('BANK DETAILS'))
    children.push(polEmptyP())
    children.push(polNp('Payment made by international transfer in US$ to our bank account details below:'))
    children.push(polEmptyP())
    for (const line of data.bank.details.split('\n')) {
      if (line.trim()) children.push(polNp(line.trim()))
    }
    children.push(polEmptyP())
  }

  // Closing
  children.push(polEmptyP())
  children.push(polNp('Subject to the terms, clauses, conditions, and warranties of cover afforded.'))
  children.push(polEmptyP())

  const closingCity = data.policy.closingCity || 'Beirut'
  const closingDate = polFormatDateUS(data.policy.createdAt)
  children.push(polNp(`${closingCity}, ${closingDate}`))
  children.push(polEmptyP())
  children.push(polBp(data.companyName))

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      footers: { default: polMakeDefaultFooter() },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  polDownloadBlob(blob, `DA - ${data.policy.policyNumber}.docx`)
}

// ==================== Credit Advice Export ====================

export async function exportCreditAdviceDocx(policyId: string): Promise<void> {
  const data = await loadPolicyExportData(policyId)
  const typeName = data.quotation.quotationTypeName || polGetTypeLabel(data.quotation.quotationTypeCode || 'P')
  const currency = data.quotation.premiumCurrency || 'USD'

  const children: (Paragraph | Table)[] = []

  // Broker header
  const broker = data.assureds.find(a => a.role?.toLowerCase().includes('broker'))
  if (broker) {
    children.push(polBp(broker.name))
    const brokerAddr = data.addresses.find(a => a.entityName === broker.name || a.role?.toLowerCase().includes('broker'))
    if (brokerAddr?.address) {
      for (const line of brokerAddr.address.split('\n')) {
        if (line.trim()) children.push(polNp(line.trim()))
      }
    }
    children.push(polEmptyP())
  }

  // Header
  children.push(polCenteredP('CREDIT ADVICE', true))
  children.push(polEmptyP())

  // Reference
  children.push(polNp(`In connection with ${typeName} ${data.policy.policyNumber}`))
  children.push(polEmptyP())

  // Vessel
  children.push(polBp(`M/V ${data.vesselInfo.name.toUpperCase()}`))
  children.push(polEmptyP())

  // INSURED
  children.push(polBup('INSURED'))
  children.push(polEmptyP())
  children.push(...polBuildInsuredSection(data))
  children.push(polEmptyP())

  // CREDIT AMOUNT
  const totalPremium = data.instalments.reduce((sum, i) => sum + (i.amount || 0), 0) || data.quotation.premiumAmount || 0
  const commissionPercent = data.policy.commissionPercent || 0
  const commissionAmount = totalPremium * commissionPercent / 100

  children.push(polBup('CREDIT AMOUNT'))
  children.push(polEmptyP())
  children.push(polBp(polFormatCurrency(commissionAmount, currency)))
  children.push(polNp(`(${numberToWords(commissionAmount, currency)})`))
  children.push(polEmptyP())

  // DETAILS
  children.push(polBup('DETAILS'))
  children.push(polEmptyP())
  children.push(polNp(`Being ${polFmtPct(commissionPercent)}% Commission on Premium ${polFormatCurrency(totalPremium, currency)}`))
  children.push(polEmptyP())

  // Commission instalments
  if (data.instalments.length > 0) {
    const numInst = data.instalments.length
    if (numInst === 1) {
      children.push(polNp('Commission shall be payable in a single instalment.'))
    } else {
      children.push(polNp(`Commission shall be payable in ${numInst} instalments as follows:`))
    }
    children.push(polEmptyP())

    const labelW = Math.round(POL_CONTENT_W * 0.35)
    const dateW = Math.round(POL_CONTENT_W * 0.30)
    const amtW = POL_CONTENT_W - labelW - dateW

    children.push(new Table({
      width: { size: POL_CONTENT_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [labelW, dateW, amtW],
      rows: data.instalments.map(inst => {
        const commAmt = inst.commissionAmount != null ? inst.commissionAmount : (inst.amount * commissionPercent / 100)
        return new TableRow({
          children: [
            new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `${polOrdinal(inst.instalmentNumber)} Instalment`, size: 22, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: dateW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatDateUS(inst.dueDate), size: 22, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(commAmt, currency), size: 22, font: 'Arial', color: '000000', bold: true })] })] })
          ]
        })
      })
    }))
    children.push(polEmptyP())
  }

  // PERIOD
  children.push(polBup('PERIOD'))
  children.push(polEmptyP())
  children.push(...polBuildPeriodParagraphs(data))
  children.push(polEmptyP())

  // Closing
  const closingCity = data.policy.closingCity || 'Beirut'
  const closingDate = polFormatDateUS(data.policy.createdAt)
  children.push(polNp(`${closingCity}, ${closingDate}`))
  children.push(polEmptyP())
  children.push(polBp(data.companyName))

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      footers: { default: polMakeDefaultFooter() },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  polDownloadBlob(blob, `CA - ${data.policy.policyNumber}.docx`)
}
