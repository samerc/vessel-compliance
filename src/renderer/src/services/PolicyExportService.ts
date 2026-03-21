import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, PageBreak, VerticalAlign,
  PageOrientation, TableLayoutType, LevelFormat,
  Footer, PageNumber, ImageRun, Header
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
  callSign?: string
  portOfRegistry?: string
  ownerName?: string
  ownerAddress?: string
  flagAuthorityName?: string
  flagAuthorityAddress?: string
  companyName: string
  companyAddress?: string
  companyWebsite?: string
  contactEmail?: string
  contactPhone?: string
  closingCity?: string
}

// ==================== Blue Card Helpers ====================

const BC_FONT = 'Arial'
let BC_SIZE = 20 // 10pt default, configurable via same setting as policy

function bcNoBorders() {
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  return { top: none, bottom: none, left: none, right: none }
}

function bcText(text: string, opts?: { bold?: boolean; size?: number; caps?: boolean }): TextRun {
  return new TextRun({
    text: opts?.caps ? text.toUpperCase() : text,
    font: BC_FONT,
    size: opts?.size ?? BC_SIZE,
    bold: opts?.bold ?? false,
  })
}

function bcParagraph(
  text: string,
  opts?: {
    bold?: boolean
    size?: number
    caps?: boolean
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType]
    spacingBefore?: number
    spacingAfter?: number
    indent?: number
  }
): Paragraph {
  return new Paragraph({
    alignment: opts?.alignment ?? AlignmentType.LEFT,
    spacing: { before: opts?.spacingBefore ?? 0, after: opts?.spacingAfter ?? 60 },
    indent: opts?.indent ? { left: opts.indent } : undefined,
    children: [bcText(text, { bold: opts?.bold, size: opts?.size, caps: opts?.caps })],
  })
}

function bcSpacer(twips: number = 200): Paragraph {
  return new Paragraph({ spacing: { before: twips }, children: [] })
}

/** Borderless key : value row for vessel detail tables */
function bcDetailRow(label: string, value: string): TableRow {
  const LABEL_W = 4200
  const VALUE_W = 5800
  return new TableRow({
    children: [
      new TableCell({
        width: { size: LABEL_W, type: WidthType.DXA },
        borders: bcNoBorders(),
        children: [
          new Paragraph({
            spacing: { before: 30, after: 30 },
            children: [bcText(label, { caps: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: VALUE_W, type: WidthType.DXA },
        borders: bcNoBorders(),
        children: [
          new Paragraph({
            spacing: { before: 30, after: 30 },
            children: [bcText(`: ${value}`)],
          }),
        ],
      }),
    ],
  })
}

/** Multi-line address block */
function bcAddressBlock(lines: string[], spacingAfter: number = 120): Paragraph[] {
  return lines.filter(Boolean).map((line, i) =>
    new Paragraph({
      spacing: { after: i === lines.length - 1 ? spacingAfter : 20 },
      children: [bcText(line)],
    })
  )
}

// ==================== BBC / WRC Page Builder ====================

function buildBbcWrcPage(
  data: BlueCardData,
  cardType: 'BBC' | 'WRC',
  isLastPage: boolean
): Paragraph[] {
  const ref = `${data.policyNumber}/${cardType}`
  const inceptionFmt = formatDate(data.inceptionDate)
  const expiryFmt = formatDate(data.expiryDate)
  const gt = typeof data.grossTonnage === 'number'
    ? data.grossTonnage.toLocaleString('en-US')
    : data.grossTonnage
  const portOfRegistry = data.portOfRegistry || data.flagState || ''
  const today = formatDate(new Date())
  const city = data.closingCity || ''

  const isBBC = cardType === 'BBC'
  const conventionArticle = isBBC
    ? 'ARTICLE 7 OF THE INTERNATIONAL CONVENTION ON CIVIL LIABILITY FOR BUNKER OIL POLLUTION DAMAGE, 2001'
    : 'ARTICLE 12 OF THE NAIROBI INTERNATIONAL CONVENTION ON THE REMOVAL OF WRECKS, 2007'

  const children: Paragraph[] = []

  // NOT TRANSFERABLE
  children.push(bcParagraph('NOT TRANSFERABLE', {
    bold: true,
    size: 24,
    caps: true,
    alignment: AlignmentType.RIGHT,
    spacingAfter: 120,
  }))

  // REF line
  children.push(
    new Paragraph({
      spacing: { after: 300 },
      children: [
        bcText('REF: ', { bold: true }),
        bcText(ref, { bold: true }),
      ],
    })
  )

  // To: flag authority
  children.push(bcParagraph('To:', { spacingAfter: 40 }))
  if (data.flagAuthorityName) {
    children.push(...bcAddressBlock([
      data.flagAuthorityName,
      ...(data.flagAuthorityAddress || '').split('\n'),
    ], 300))
  } else {
    children.push(bcSpacer(200))
  }

  // CERTIFICATE OF INSURANCE title block
  children.push(bcParagraph('CERTIFICATE OF INSURANCE', {
    bold: true,
    size: 26,
    caps: true,
    alignment: AlignmentType.CENTER,
    spacingAfter: 40,
  }))
  children.push(bcParagraph('PURSUANT', {
    bold: true,
    caps: true,
    alignment: AlignmentType.CENTER,
    spacingAfter: 40,
  }))
  children.push(bcParagraph(`TO ${conventionArticle}`, {
    bold: true,
    caps: true,
    alignment: AlignmentType.CENTER,
    spacingAfter: 300,
  }))

  // Vessel details table
  const vesselRows = [
    bcDetailRow('NAME OF SHIP', data.vesselName),
    bcDetailRow('DISTINCTIVE NUMBER OR LETTERS', data.callSign || ''),
    bcDetailRow('PORT OF REGISTRY', portOfRegistry),
    bcDetailRow('IMO NUMBER', data.imoNumber),
  ]
  if (cardType === 'WRC') {
    vesselRows.push(bcDetailRow('GROSS TONNAGE', gt))
  }

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    rows: vesselRows,
  }) as unknown as Paragraph)

  children.push(bcSpacer(240))

  // Owner block
  children.push(bcParagraph(
    'NAME AND FULL ADDRESS OF THE PRINCIPAL PLACE OF BUSINESS OF THE REGISTERED OWNER:',
    { bold: true, caps: true, spacingAfter: 80 }
  ))
  children.push(...bcAddressBlock([
    data.ownerName || '',
    ...(data.ownerAddress || '').split('\n'),
  ], 240))

  // Certification text
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 240 },
      children: [
        bcText(
          'THIS IS TO CERTIFY that there is in force in respect of the above-named ship a policy '
          + 'of insurance or other financial security satisfying the requirements of '
          + (isBBC
            ? 'Article 7 of the International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001.'
            : 'Article 12 of the Nairobi International Convention on the Removal of Wrecks, 2007.')
        ),
      ],
    })
  )

  // Period of Insurance
  children.push(bcParagraph('Period of Insurance:', { bold: true, spacingAfter: 80 }))
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        bcText('From  '),
        bcText(`${inceptionFmt}  ${data.inceptionTime}  ${data.timezone}`, { bold: true }),
      ],
    })
  )
  children.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [
        bcText('To    '),
        bcText(`${expiryFmt}  ${data.expiryTime}  ${data.timezone}`, { bold: true }),
      ],
    })
  )

  // Cancellation text
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 300 },
      children: [
        bcText(
          'Provided always that the insurer may cancel this certificate by giving three months\' '
          + 'written notice to the above Authority, the insurance ceasing to be effective on the date '
          + 'of expiry of the said notice or on the date of expiry of the policy whichever is the earlier.'
        ),
      ],
    })
  )

  // Place & date
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        bcText('PLACE & DATE: ', { bold: true }),
        bcText(`${city}${city ? ', ' : ''}${today}`),
      ],
    })
  )

  // Page break unless last page
  if (!isLastPage) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  return children
}

// ==================== MLC Page Builder ====================

function buildMlcPage(
  data: BlueCardData,
  cardType: 'MLC4.2' | 'MLC2.5.2',
  isLastPage: boolean
): Paragraph[] {
  const ref = `${data.policyNumber}/${cardType === 'MLC4.2' ? 'MLC REG 4.2' : 'MLC REG 2.5.2'}`
  const inceptionFmt = formatDate(data.inceptionDate)
  const expiryFmt = formatDate(data.expiryDate)
  const portOfRegistry = data.portOfRegistry || data.flagState || ''
  const today = formatDate(new Date())
  const city = data.closingCity || ''

  const is42 = cardType === 'MLC4.2'

  const titleText = is42
    ? 'CERTIFICATE OF INSURANCE OR OTHER FINANCIAL SECURITY IN RESPECT OF '
      + 'SHIPOWNERS\u2019 LIABILITY AS REQUIRED UNDER REGULATION 4.2, STANDARD A4.2.1 '
      + 'PARAGRAPH 1(b) OF THE MARITIME LABOUR CONVENTION 2006, AS AMENDED'
    : 'CERTIFICATE OF INSURANCE OR OTHER FINANCIAL SECURITY IN RESPECT OF '
      + 'SEAFARER REPATRIATION COSTS AND LIABILITIES AS REQUIRED UNDER '
      + 'REGULATION 2.5.2, STANDARD A2.5.2 '
      + 'OF THE MARITIME LABOUR CONVENTION 2006, AS AMENDED'

  const certText = is42
    ? 'THIS IS TO CERTIFY that there is in force, in respect of the above-named ship, '
      + 'a policy of insurance or other financial security satisfying the requirements of '
      + 'Standard A4.2.1, paragraph 1(b) of the Maritime Labour Convention, 2006, as amended.'
    : 'THIS IS TO CERTIFY that there is in force, in respect of the above-named ship, '
      + 'a policy of insurance or other financial security satisfying the requirements of '
      + 'Regulation 2.5.2, Standard A2.5.2 of the Maritime Labour Convention, 2006, as amended.'

  const cancellationRef = is42 ? 'Standard A4.2.12' : 'Standard A2.5.2.11'
  const cancellationText =
    `The insurer undertakes to give at least 30 days\u2019 notice to the competent authority `
    + `of the flag State of the ship of the cancellation or termination of the financial security, `
    + `as required by ${cancellationRef} of the Maritime Labour Convention, 2006, as amended.`

  const children: Paragraph[] = []

  // REF line
  children.push(
    new Paragraph({
      spacing: { after: 300 },
      children: [
        bcText('REF: ', { bold: true }),
        bcText(ref, { bold: true }),
      ],
    })
  )

  // Title block (centered, bold, caps)
  children.push(bcParagraph(titleText, {
    bold: true,
    alignment: AlignmentType.CENTER,
    spacingAfter: 300,
  }))

  // Vessel details table
  const vesselTable = new Table({
    width: { size: 10000, type: WidthType.DXA },
    rows: [
      bcDetailRow('NAME OF SHIP', data.vesselName),
      bcDetailRow('IMO NUMBER', data.imoNumber),
      bcDetailRow('DISTINCTIVE NUMBER OR LETTERS', data.callSign || ''),
      bcDetailRow('PORT OF REGISTRY', portOfRegistry),
    ],
  })
  children.push(vesselTable as unknown as Paragraph)

  children.push(bcSpacer(120))

  // Period of insurance (inline)
  children.push(
    new Paragraph({
      spacing: { after: 240 },
      children: [
        bcText('PERIOD OF INSURANCE', { bold: true }),
        bcText(`   :   FROM ${inceptionFmt} TO ${expiryFmt}`),
      ],
    })
  )

  // Shipowner block
  children.push(bcParagraph(
    'NAME OF THE SHIPOWNER ON WHOSE BEHALF FINANCIAL SECURITY HAS BEEN PROVIDED:',
    { bold: true, caps: true, spacingAfter: 80 }
  ))
  children.push(...bcAddressBlock([
    data.ownerName || '',
    ...(data.ownerAddress || '').split('\n'),
  ], 240))

  // Provider block
  children.push(bcParagraph(
    'NAME, FULL ADDRESS AND WEBSITE OF THE PROVIDER OF INSURANCE OR OTHER FINANCIAL SECURITY',
    { bold: true, caps: true, spacingAfter: 80 }
  ))
  children.push(...bcAddressBlock([
    data.companyName,
    ...(data.companyAddress || '').split('\n'),
    data.companyWebsite || '',
  ], 240))

  // Contact details
  children.push(bcParagraph(
    'CONTACT DETAILS OF THE PERSONS OR ENTITY RESPONSIBLE FOR HANDLING SEAFARERS\u2019 REQUEST FOR RELIEF:',
    { bold: true, caps: true, spacingAfter: 80 }
  ))
  if (data.contactEmail) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          bcText('Email    '),
          bcText(data.contactEmail),
        ],
      })
    )
  }
  if (data.contactPhone) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          bcText('Tel      '),
          bcText(data.contactPhone),
        ],
      })
    )
  }
  if (!data.contactEmail && !data.contactPhone) {
    children.push(bcSpacer(100))
  }

  // Certification text
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
      children: [bcText(certText)],
    })
  )

  // Cancellation text
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 300 },
      children: [bcText(cancellationText)],
    })
  )

  // Place & date
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        bcText('PLACE & DATE: ', { bold: true }),
        bcText(`${city}${city ? ', ' : ''}${today}`),
      ],
    })
  )

  // Page break unless last page
  if (!isLastPage) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  return children
}

// ==================== Blue Card Page Router ====================

function buildBlueCardPage(
  data: BlueCardData,
  cardType: BlueCardType,
  isLastPage: boolean
): Paragraph[] {
  if (cardType === 'BBC' || cardType === 'WRC') {
    return buildBbcWrcPage(data, cardType, isLastPage)
  }
  return buildMlcPage(data, cardType, isLastPage)
}

// ==================== Public Export Functions ====================

/**
 * Export a single blue card as a DOCX document.
 */
export async function exportBlueCardDocx(
  data: BlueCardData,
  cardType: BlueCardType
): Promise<void> {
  await loadPolicyFontSize()
  const children = buildBlueCardPage(data, cardType, true)

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
  await loadPolicyFontSize()

  // Export each card as a separate file
  for (const cardType of cardTypes) {
    await exportBlueCardDocx(data, cardType)
  }
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
  premiumAmount?: number
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
  const policy: PolicyDocRecord = await window.api.policyGetById(policyId)
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
    window.api.policyGetInstalments(policyId),
    window.api.policyGetAddresses(policyId),
    window.api.policyGetBlueCards(policyId),
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

// ---- DOCX paragraph helpers (10pt Arial) ----
let POL_FONT_SIZE = 20 // 10pt in half-points (configurable via settings)

async function loadPolicyFontSize(): Promise<void> {
  try {
    const raw = await window.api.getSetting('policy_font_size')
    if (raw) {
      const pt = parseInt(raw, 10)
      if (pt >= 8 && pt <= 16) {
        POL_FONT_SIZE = pt * 2
        BC_SIZE = pt * 2
      }
    }
  } catch { /* use default */ }
}

function polNp(text: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  })
}

function polBp(text: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  })
}

function polBup(text: string) {
  return new Paragraph({
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true, underline: {} })]
  })
}

function polBulletP(text: string) {
  return new Paragraph({
    numbering: { reference: 'dash-bullet', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 40, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  })
}

function polEmptyP() {
  return new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [] })
}

function polMp(text: string): Paragraph[] {
  if (!text) return []
  if (polIsHtml(text)) return parseHtmlToParagraphs(text, { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
  return text.split('\n').map(p =>
    p.trim() ? polNp(p) : polEmptyP()
  )
}

function polCenteredP(text: string, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold })]
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
    }, {
      reference: 'trading-numbered',
      levels: [{
        level: 0,
        format: LevelFormat.DECIMAL,
        text: '%1)',
        alignment: AlignmentType.LEFT,
        style: {
          run: { font: 'Arial', size: POL_FONT_SIZE },
          paragraph: { indent: { left: 240, hanging: 240 } }
        }
      }, {
        level: 1,
        format: LevelFormat.LOWER_LETTER,
        text: '%2)',
        alignment: AlignmentType.LEFT,
        style: {
          run: { font: 'Arial', size: POL_FONT_SIZE },
          paragraph: { indent: { left: 720, hanging: 360 } }
        }
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
      runs.push(new TextRun({ text: addr.entityName, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true }))
      if (addr.country) {
        runs.push(new TextRun({ text: ` \u2013 ${addr.country}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' }))
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
    ['IMO Number', vi.imo || '-'],
    ['Classification', vi.classification || '-']
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
        new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: label, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
        new TableCell({ width: { size: sepW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: ':', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
        new TableCell({ width: { size: valW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: value, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] })
      ]
    }))
  })
}

function polBuildPeriodSection(data: PolicyExportData): (Paragraph | Table)[] {
  const { inceptionDate, inceptionTime, expiryDate, expiryTime, timezone } = data.policy
  const labelW = Math.round(POL_BODY_W * 0.10)
  const dateW = Math.round(POL_BODY_W * 0.30)
  const timeTzW = POL_BODY_W - labelW - dateW

  const makeCell = (text: string, bold = false) => new TableCell({
    width: { size: 0, type: WidthType.AUTO },
    borders: polNoBorders(),
    children: [new Paragraph({ children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold })] })]
  })

  const fmtTimeTz = (time: string | null | undefined, tz: string | null | undefined) => {
    const parts = [polFormatTime(time), tz || ''].filter(Boolean)
    return parts.join(' ')
  }

  return [new Table({
    width: { size: POL_BODY_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, dateW, timeTzW],
    rows: [
      new TableRow({ children: [makeCell('From'), makeCell(polFormatDateUS(inceptionDate)), makeCell(fmtTimeTz(inceptionTime, timezone))] }),
      new TableRow({ children: [makeCell('To'), makeCell(polFormatDateUS(expiryDate)), makeCell(fmtTimeTz(expiryTime, timezone))] })
    ]
  })]
}

function polBuildPeriodParagraphs(data: PolicyExportData): Paragraph[] {
  const { inceptionDate, inceptionTime, expiryDate, expiryTime, timezone } = data.policy
  return [
    new Paragraph({
      spacing: { after: 40, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: 'From  ', size: POL_FONT_SIZE, font: 'Arial', color: '000000' }),
        new TextRun({ text: polFormatDateUS(inceptionDate), size: POL_FONT_SIZE, font: 'Arial', color: '000000' }),
        new TextRun({ text: `  ${polFormatTime(inceptionTime)}  ${timezone || ''}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
      ]
    }),
    new Paragraph({
      spacing: { after: 40, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: 'To      ', size: POL_FONT_SIZE, font: 'Arial', color: '000000' }),
        new TextRun({ text: polFormatDateUS(expiryDate), size: POL_FONT_SIZE, font: 'Arial', color: '000000' }),
        new TextRun({ text: `  ${polFormatTime(expiryTime)}  ${timezone || ''}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
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
              new TableCell({ width: { size: clauseRefW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `Section B Cl.${c.clauseNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
              new TableCell({ width: { size: clauseDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: rightText, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
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
            ...(code ? [new TextRun({ text: code + ' ', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] : []),
            new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
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
          new TableCell({ width: { size: condCol1W, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `Cl. ${def.conditionNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: condCol2W, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
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
    case 'P': return 'Limits of Liability'
    case 'H': return 'Agreed Insured Value'
    case 'W': return 'Sum Insured'
    default: return 'Limits of Liability'
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
      const ddqIntro = stripHtml(polSt(data, 'ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
      content.push(polEmptyP())
      if (ddqIntro.includes('{ddq_countries}')) {
        content.push(new Paragraph({
          numbering: { reference: 'trading-numbered', level: 0 },
          spacing: { before: 120, after: 80, line: 240, lineRule: 'auto' as any },
          children: [new TextRun({ text: ddqIntro.replace(/\{ddq_countries\}/g, ddqList), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
        }))
      } else {
        content.push(new Paragraph({
          numbering: { reference: 'trading-numbered', level: 0 },
          spacing: { before: 120, after: 80, line: 240, lineRule: 'auto' as any },
          children: [new TextRun({ text: ddqIntro, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
        }))
        content.push(polNp(ddqList))
      }
    }
    if (wq.tradingShowDdqWarranties) {
      const intro = polSt(data, 'tradingConditionA')
      if (intro) {
        content.push(polEmptyP())
        content.push(new Paragraph({
          numbering: { reference: 'trading-numbered', level: 0 },
          spacing: { before: 120, after: 80, line: 240, lineRule: 'auto' as any },
          children: [new TextRun({ text: stripHtml(intro), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
        }))
      }
      const condKeys: (keyof PISectionTexts)[] = ['tradingConditionB', 'tradingConditionC', 'tradingConditionD', 'tradingConditionE', 'tradingConditionF', 'tradingConditionG']
      for (const key of condKeys) {
        const txt = polSt(data, key)
        if (txt) {
          content.push(new Paragraph({
            numbering: { reference: 'trading-numbered', level: 1 },
            spacing: { after: 0, line: 240, lineRule: 'auto' as any },
            children: [new TextRun({ text: stripHtml(txt), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
          }))
        }
      }
    }
    if (wq.tradingShowIsrael && polSt(data, 'tradingIsrael')) {
      content.push(polEmptyP())
      content.push(new Paragraph({
        numbering: { reference: 'trading-numbered', level: 0 },
        spacing: { before: 120, after: 80, line: 240, lineRule: 'auto' as any },
        children: [new TextRun({ text: stripHtml(polSt(data, 'tradingIsrael')), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
      }))
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
          new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(d.amount, d.currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.description.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString('en-US') : '___'), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
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

  const dedAggText = data.quotation.deductibleAggregateEnabled
    ? (data.quotation.deductibleAggregateText || (polSt(data, 'deductiblesAggregate') ? stripHtml(polSt(data, 'deductiblesAggregate')) : ''))
    : ''
  if (dedAggText) { content.push(polEmptyP()); content.push(...polMp(dedAggText)) }

  if (polSt(data, 'deductiblesAdditionalText')) { content.push(polEmptyP()); content.push(...polMp(polSt(data, 'deductiblesAdditionalText'))) }

  return content
}

async function polBuildPremiumPaymentSection(data: PolicyExportData): Promise<(Paragraph | Table)[]> {
  const content: (Paragraph | Table)[] = []
  const { instalments } = data
  const numInst = instalments.length || 1
  const currency = data.quotation.premiumCurrency || 'USD'
  const wq = data.quotation
  const totalPremium = data.policy.premiumAmount || instalments.reduce((sum, i) => sum + (i.amount || 0), 0) || wq.premiumAmount || 0
  const timezone = data.policy.timezone || ''

  // 1. Premium intro with amount — use configurable template
  let premIntroTemplate = 'Premium {currency} {amount} shall be payable in {instalments} Instalments on the following dates, at {time} {timezone}, time being of the essence:'
  try {
    const s = await window.api.getSetting('policyExportSettings')
    if (s) {
      const p = JSON.parse(s)
      if (p.premiumIntroText) premIntroTemplate = p.premiumIntroText
    }
  } catch { /* default */ }
  const premIntro = premIntroTemplate
    .replace(/\{currency\}/g, currency)
    .replace(/\{amount\}/g, polFormatCurrency(totalPremium, currency).replace(`${currency} `, ''))
    .replace(/\{instalments\}/g, String(numInst))
    .replace(/\{time\}/g, polFormatTime(data.policy.inceptionTime))
    .replace(/\{timezone\}/g, timezone)
  content.push(polNp(premIntro))
  content.push(polEmptyP())

  // 2. Instalment lines — plain text paragraphs
  if (instalments.length > 0) {
    const isFirstInstNr = wq.nonRefundableType === 'first_instalment'
    for (const inst of instalments) {
      let line = `${polOrdinal(inst.instalmentNumber)} Instalment due ${polFormatDateUS(inst.dueDate)}`
      if (inst.isNonRefundable || (isFirstInstNr && inst.instalmentNumber === 1)) {
        line += ' (non-refundable in case of cancellation, whether before or after inception)'
      }
      content.push(polNp(line))
    }
    content.push(polEmptyP())

    if (wq.nonRefundableType === 'percentage' && wq.nonRefundablePercent) {
      const nrText = stripHtml((polSt(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable in case of cancellation, whether before or after inception.').replace(/\{percent\}/g, polFmtPct(wq.nonRefundablePercent!)))
      if (nrText) { content.push(polNp(nrText)); content.push(polEmptyP()) }
    }
  }

  // 3. Additional premium text
  if (wq.premiumAdditionalText) { content.push(...polMp(wq.premiumAdditionalText)); content.push(polEmptyP()) }

  // 4. Condition precedent text
  if (polSt(data, 'premiumCondition')) { content.push(...polMp(polSt(data, 'premiumCondition'))); content.push(polEmptyP()) }

  // 5. Premium earned text
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

export async function exportPolicyDocx(policyId: string, totalPages?: number): Promise<void> {
  await loadPolicyFontSize()
  const data = await loadPolicyExportData(policyId)
  const typeCode = data.quotation.quotationTypeCode || 'P'

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

  // Title now in header — no body title needed

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
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const thinBorders = () => ({ top: noBorder, bottom: noBorder, left: noBorder, right: noBorder })

  function makeRow(title: string, content: (Paragraph | Table)[]): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: POL_TITLE_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: title, bold: true, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
          })]
        }),
        new TableCell({
          width: { size: POL_BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 200, left: 80, right: 80 },
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
  if (sanctionsText) rows.push(makeRow('Sanction Limitation\nand Exclusion\nClause', polMp(sanctionsText)))

  // EXCLUSIONS
  const exclusionsContent: Paragraph[] = []
  const hasAltExclusions = data.piAlternatives.length > 0
  const firstAltId = data.piAlternatives.length > 0 ? data.piAlternatives[0].id : null
  for (const se of data.selectedExclusions) {
    if (hasAltExclusions && se.alternativeId && se.alternativeId !== firstAltId) continue
    if (se.customText) exclusionsContent.push(polBulletP(se.customText))
    else if (se.piExclusionId) {
      const found = data.allExclusions.find(e => e.id === se.piExclusionId)
      if (found) exclusionsContent.push(polBulletP(found.text))
    }
  }
  for (const ce of data.customExclusions) {
    if (hasAltExclusions && (ce as any).alternativeId && (ce as any).alternativeId !== firstAltId) continue
    exclusionsContent.push(polBulletP(ce.text))
  }
  if (exclusionsContent.length > 0) rows.push(makeRow('Exclusions', exclusionsContent))

  // SUBJECTIVITIES
  if (data.subjectivities.length > 0) {
    const subjContent: (Paragraph | Table)[] = []
    if (polSt(data, 'subjectivitiesIntro')) subjContent.push(...polMp(polSt(data, 'subjectivitiesIntro')))
    for (const sub of data.subjectivities) subjContent.push(polBulletP(sub.text))
    if (polSt(data, 'subjectivitiesNote')) { subjContent.push(polEmptyP()); subjContent.push(...polMp(polSt(data, 'subjectivitiesNote'))) }
    rows.push(makeRow('Subjectivities', subjContent))
  }

  // PREMIUM PAYMENT
  const premiumContent = await polBuildPremiumPaymentSection(data)
  if (premiumContent.length > 0) rows.push(makeRow('Premium\nPayment\nCondition\nPrecedent', premiumContent))

  // Build main table
  const mainTable = new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    columnWidths: [POL_TITLE_W, POL_BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder
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
        size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED
      }))
    } else {
      children.push(...parseHtmlToParagraphs(importantNotice, {
        size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED
      }))
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
        new TableCell({ width: { size: sigLabelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 80, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: 'THE INSURED', size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] }),
        new TableCell({ width: { size: sigGapW, type: WidthType.DXA }, borders: polNoBorders(), children: [polEmptyP()] }),
        new TableCell({ width: { size: sigLabelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 80, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: 'THE INSURER', size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] })
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

  // Build header — company details (Times New Roman) + policy number & vessel (Arial)
  const headerHtml = polSt(data, 'docHeader')
  const headerSpacing = (data.sectionTexts as any).docHeaderSpacing || undefined
  const headerParas = headerHtml
    ? parseHtmlToParagraphs(headerHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: headerSpacing })
    : []
  // Load policy export settings
  let footerText = ''
  let configTotalPages = totalPages
  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull & Machinery Certificate',
    W: 'War Risk Certificate'
  }
  let pageCountMap: Record<string, Record<string, number>> = {}
  try {
    const settings = await window.api.getSetting('policyExportSettings')
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.footerText) footerText = parsed.footerText
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
      if (parsed.pageCountMap) pageCountMap = parsed.pageCountMap
    }
  } catch { /* ignore */ }

  // Resolve total pages from page count map if not passed
  if (!configTotalPages) {
    const typeCode = data.quotation.quotationTypeCode || 'P'
    const typeMap = pageCountMap[typeCode]
    if (typeMap) {
      // We don't know exact page count yet, use first mapping as default
      const firstKey = Object.keys(typeMap).sort()[0]
      if (firstKey) configTotalPages = typeMap[firstKey]
    }
  }

  // Add spacing between company details and policy title
  headerParas.push(new Paragraph({ spacing: { after: 80 }, children: [] }))
  // Add policy title (configurable per type)
  const headerTitle = headerTitles[typeCode] || 'Certificate'
  const vesselName = data.vesselInfo?.name || ''
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({ text: `${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })
    ]
  }))
  if (vesselName) {
    headerParas.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: `M/V ${vesselName.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })
      ]
    }))
  }
  const defaultHeader = new Header({ children: headerParas.length > 0 ? headerParas : [polEmptyP()] })

  const footerChildren: Paragraph[] = []
  if (footerText) {
    footerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 20 },
      children: [new TextRun({ text: footerText, size: 14, font: 'Arial', color: '999999', italics: true })]
    }))
  }
  footerChildren.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: '999999' }),
      new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '999999' }),
      new TextRun({ text: configTotalPages ? ` of ${configTotalPages}` : '', size: 16, font: 'Arial', color: '999999' })
    ]
  }))
  const policyFooter = new Footer({ children: footerChildren })

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      headers: { default: defaultHeader },
      footers: { default: policyFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  polDownloadBlob(blob, `${data.policy.policyNumber}.docx`)
}

// ==================== Debit Advice Export ====================

export async function exportDebitAdviceDocx(policyId: string): Promise<void> {
  await loadPolicyFontSize()
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
          new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `${polOrdinal(inst.instalmentNumber)} Instalment`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: dateW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatDateUS(inst.dueDate), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(inst.amount, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] })
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
  await loadPolicyFontSize()
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
            new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: `${polOrdinal(inst.instalmentNumber)} Instalment`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: dateW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatDateUS(inst.dueDate), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(commAmt, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] })
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
