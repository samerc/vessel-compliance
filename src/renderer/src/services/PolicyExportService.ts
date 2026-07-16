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
  QuotationPIAlternative, WarCondition, QuotationWarCondition, WarSettings,
  QuotationAssuredGroup, QuotationAgreedValueOption
} from '../../../shared/types'
import JSZip from 'jszip'
import { DEFAULT_SECTION_TEXTS, getDefaultSectionOrder } from '../components/quotationSettingsConstants'
import { parseHtmlToParagraphs, htmlToPlainText } from '../utils/htmlToDocx'
import { stripHtml } from '../utils/htmlToPdfText'
import { getReportSettings } from './ReportSettingsService'
// formatDate not needed — blue cards use bcFormatDate, policies use polFormatDateUS

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
  cancelReplaceText?: string
}

// ==================== Blue Card Helpers ====================

const BC_FONT = 'Arial'
let BC_SIZE = 20 // 10pt default, configurable via same setting as policy

// ---- Blue Card Default Texts ----

const BC_DEFAULT_TITLE_BBC =
  'CERTIFICATE OF INSURANCE\nPURSUANT\nTO ARTICLE 7 OF THE INTERNATIONAL CONVENTION ON CIVIL LIABILITY FOR BUNKER OIL POLLUTION DAMAGE, 2001'

const BC_DEFAULT_TITLE_WRC =
  'CERTIFICATE OF INSURANCE\nPURSUANT\nTO ARTICLE 12 OF THE NAIROBI INTERNATIONAL CONVENTION ON THE REMOVAL OF WRECKS, 2007'

const BC_DEFAULT_TITLE_MLC42 =
  'CERTIFICATE OF INSURANCE OR OTHER FINANCIAL SECURITY IN RESPECT OF SHIPOWNERS\u2019 LIABILITY AS REQUIRED UNDER REGULATION 4.2, STANDARD A4.2.1 PARAGRAPH 1(b) OF THE MARITIME LABOUR CONVENTION 2006, AS AMENDED'

const BC_DEFAULT_TITLE_MLC252 =
  'CERTIFICATE OF INSURANCE OR OTHER FINANCIAL SECURITY IN RESPECT OF SEAFARER REPATRIATION COSTS AND LIABILITIES AS REQUIRED UNDER REGULATION 2.5.2, STANDARD A2.5.2 OF THE MARITIME LABOUR CONVENTION 2006, AS AMENDED'

const BC_DEFAULT_CERTIFY_BBC =
  'THIS IS TO CERTIFY that there is in force in respect of the above-named ship a policy of insurance or other financial security satisfying the requirements of Article 7 of the International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001.'

const BC_DEFAULT_CERTIFY_WRC =
  'THIS IS TO CERTIFY that there is in force in respect of the above-named ship a policy of insurance or other financial security satisfying the requirements of Article 12 of the Nairobi International Convention on the Removal of Wrecks, 2007.'

const BC_DEFAULT_CERTIFY_MLC42 =
  'THIS IS TO CERTIFY that there is in force, in respect of the above-named ship, a policy of insurance or other financial security satisfying the requirements of Standard A4.2.1, paragraph 1(b) of the Maritime Labour Convention, 2006, as amended.'

const BC_DEFAULT_CERTIFY_MLC252 =
  'THIS IS TO CERTIFY that there is in force, in respect of the above-named ship, a policy of insurance or other financial security satisfying the requirements of Regulation 2.5.2, Standard A2.5.2 of the Maritime Labour Convention, 2006, as amended.'

const BC_DEFAULT_CANCEL_BBC =
  'Provided always that the insurer may cancel this certificate by giving three months\' written notice to the above Authority, the insurance ceasing to be effective on the date of expiry of the said notice or on the date of expiry of the policy whichever is the earlier.'

const BC_DEFAULT_CANCEL_WRC = BC_DEFAULT_CANCEL_BBC

const BC_DEFAULT_CANCEL_MLC42 =
  'The insurer undertakes to give at least 30 days\u2019 notice to the competent authority of the flag State of the ship of the cancellation or termination of the financial security, as required by Standard A4.2.12 of the Maritime Labour Convention, 2006, as amended.'

const BC_DEFAULT_CANCEL_MLC252 =
  'The insurer undertakes to give at least 30 days\u2019 notice to the competent authority of the flag State of the ship of the cancellation or termination of the financial security, as required by Standard A2.5.2.11 of the Maritime Labour Convention, 2006, as amended.'

/** Exported for use by PolicySettings Blue Card Texts tab */
export const BC_DEFAULTS = {
  bc_text_BBC_title: BC_DEFAULT_TITLE_BBC,
  bc_text_WRC_title: BC_DEFAULT_TITLE_WRC,
  bc_text_MLC42_title: BC_DEFAULT_TITLE_MLC42,
  bc_text_MLC252_title: BC_DEFAULT_TITLE_MLC252,
  bc_text_BBC_certify: BC_DEFAULT_CERTIFY_BBC,
  bc_text_WRC_certify: BC_DEFAULT_CERTIFY_WRC,
  bc_text_MLC42_certify: BC_DEFAULT_CERTIFY_MLC42,
  bc_text_MLC252_certify: BC_DEFAULT_CERTIFY_MLC252,
  bc_text_BBC_cancel: BC_DEFAULT_CANCEL_BBC,
  bc_text_WRC_cancel: BC_DEFAULT_CANCEL_WRC,
  bc_text_MLC42_cancel: BC_DEFAULT_CANCEL_MLC42,
  bc_text_MLC252_cancel: BC_DEFAULT_CANCEL_MLC252,
  bc_mlc_email: '',
  bc_mlc_phone: '',
  bc_mlc_website: '',
  bc_mlc_company_address: '',
} as const

type BcSettingsMap = Record<keyof typeof BC_DEFAULTS, string>

async function loadBcSettings(): Promise<BcSettingsMap> {
  const result = { ...BC_DEFAULTS } as unknown as BcSettingsMap
  const keys = Object.keys(BC_DEFAULTS) as (keyof typeof BC_DEFAULTS)[]
  await Promise.all(keys.map(async (key) => {
    try {
      const val = await window.api.getSetting(key)
      if (val) (result as any)[key] = val
    } catch { /* use default */ }
  }))
  return result
}

// ---- Blue Card DOCX primitives ----

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

const BC_LABEL_W = 3800
const BC_SEP_W = 300
const BC_VALUE_W = 5900

// Zero the default cell inset so table cell text aligns flush-left with the
// surrounding paragraphs (Word's default ~108twip left cell margin nudges tables right).
const BC_TABLE_MARGINS = { marginUnitType: WidthType.DXA, top: 0, bottom: 0, left: 0, right: 0 }

/** Borderless key : value row for vessel detail tables — 3 columns */
function bcDetailRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: BC_LABEL_W, type: WidthType.DXA },
        borders: bcNoBorders(),
        children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(label, { caps: true })] })],
      }),
      new TableCell({
        width: { size: BC_SEP_W, type: WidthType.DXA },
        borders: bcNoBorders(),
        children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(':')] })],
      }),
      new TableCell({
        width: { size: BC_VALUE_W, type: WidthType.DXA },
        borders: bcNoBorders(),
        children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(value, { bold: true })] })],
      }),
    ],
  })
}

/** Multi-line address block */
function bcAddressBlock(lines: string[], spacingAfter: number = 120, bold: boolean = false): Paragraph[] {
  return lines.filter(Boolean).map((line, i) =>
    new Paragraph({
      spacing: { after: i === lines.length - 1 ? spacingAfter : 20 },
      children: [bcText(line, { bold })],
    })
  )
}

/** Format date in long US style for blue cards: "November 10, 2023" */
function bcFormatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
}

// bcTitleBlock removed — title rendering inlined with per-line size control

// ==================== BBC / WRC Page Builder ====================

function buildBbcWrcPage(
  data: BlueCardData,
  cardType: 'BBC' | 'WRC',
  isLastPage: boolean,
  settings: BcSettingsMap
): Paragraph[] {
  const ref = `${data.policyNumber}/${cardType}`
  const inceptionFmt = bcFormatDate(data.inceptionDate)
  const expiryFmt = bcFormatDate(data.expiryDate)
  const gtNum = typeof data.grossTonnage === 'number' ? data.grossTonnage : parseFloat(String(data.grossTonnage))
  const gt = !isNaN(gtNum) ? gtNum.toLocaleString('en-US', { maximumFractionDigits: gtNum % 1 === 0 ? 0 : 2 }) : String(data.grossTonnage || '')
  const portOfRegistry = data.portOfRegistry || ''
  const today = bcFormatDate(new Date().toISOString())
  const city = data.closingCity || ''

  const titleKey = cardType === 'BBC' ? 'bc_text_BBC_title' : 'bc_text_WRC_title'
  const certifyKey = cardType === 'BBC' ? 'bc_text_BBC_certify' : 'bc_text_WRC_certify'
  const cancelKey = cardType === 'BBC' ? 'bc_text_BBC_cancel' : 'bc_text_WRC_cancel'

  const children: Paragraph[] = []

  // 1+2. NOT TRANSFERABLE (left) + REF (right) on same line
  children.push(new Paragraph({
    spacing: { after: 300 },
    children: [
      bcText('NOT TRANSFERABLE', { bold: true }),
      new TextRun({ text: '\t', font: BC_FONT, size: BC_SIZE }),
      bcText(`REF: ${ref}`, { bold: true }),
    ],
    tabStops: [{ type: 'right' as any, position: 9600 }],
  }))

  // 3. To: flag authority
  children.push(bcParagraph('To:', { bold: true, spacingAfter: 40 }))
  if (data.flagAuthorityName) {
    children.push(...bcAddressBlock([
      data.flagAuthorityName,
      ...(data.flagAuthorityAddress || '').split('\n'),
    ], 300))
  } else {
    children.push(bcSpacer(200))
  }

  // 4. Title lines — bold, centered, CERTIFICATE OF INSURANCE bigger
  const titleLines = settings[titleKey].split('\n').filter(Boolean)
  titleLines.forEach((line, i) => {
    const isCertLine = line.trim().toUpperCase().startsWith('CERTIFICATE OF INSURANCE')
    children.push(bcParagraph(line.trim(), {
      bold: true,
      alignment: AlignmentType.CENTER,
      size: isCertLine ? 32 : BC_SIZE,
      spacingBefore: i > 0 ? 120 : 0,
      spacingAfter: i === titleLines.length - 1 ? 300 : 80,
    }))
  })

  // 5. Vessel details table (3 col fixed: label | : | value bold)
  const vesselRows = [
    bcDetailRow('NAME OF SHIP', data.vesselName),
  ]
  if (cardType === 'WRC') {
    vesselRows.push(bcDetailRow('GROSS TONNAGE', gt))
  }
  vesselRows.push(
    bcDetailRow('DISTINCTIVE NUMBER OR LETTERS', data.callSign || ''),
    bcDetailRow('PORT OF REGISTRY', portOfRegistry ? `${portOfRegistry.toUpperCase()}${data.flagState ? ' / ' + data.flagState.toUpperCase() : ''}` : data.flagState?.toUpperCase() || ''),
    bcDetailRow('IMO NUMBER', data.imoNumber),
  )

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    margins: BC_TABLE_MARGINS,
    columnWidths: [BC_LABEL_W, BC_SEP_W, BC_VALUE_W],
    rows: vesselRows,
  }) as unknown as Paragraph)

  children.push(bcSpacer(240))

  // 6. Owner block
  // 6+7. Owner block — no border
  children.push(bcParagraph(
    'NAME AND FULL ADDRESS OF THE PRINCIPAL PLACE OF BUSINESS OF THE REGISTERED OWNER:',
    { bold: false, spacingAfter: 80 }
  ))
  if (data.ownerName) {
    children.push(bcParagraph(data.ownerName.toUpperCase(), { bold: true, spacingAfter: 20 }))
  }
  if (data.ownerAddress) {
    const addrLines = data.ownerAddress.split('\n').filter(l => l.trim())
    for (let i = 0; i < addrLines.length; i++) {
      children.push(bcParagraph(addrLines[i].trim().toUpperCase(), { bold: true, spacingAfter: i === addrLines.length - 1 ? 240 : 0 }))
    }
  } else {
    children.push(bcSpacer(240))
  }

  // 7. Certification paragraph — justified (from settings)
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 240 },
      children: [bcText(settings[certifyKey])],
    })
  )

  // 8. Period of Insurance
  children.push(bcParagraph('Period of Insurance:', { bold: false, spacingAfter: 80 }))

  // Period table: 3 columns — From/To | Date | Time + Timezone
  const pLabelW = 900
  const pDateW = 2800
  const pTimeTzW = 6300

  const bcPeriodCell = (text: string, w: number) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: bcNoBorders(),
    children: [new Paragraph({ spacing: { before: 20, after: 20 }, children: [bcText(text, { bold: true })] })]
  })

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    margins: BC_TABLE_MARGINS,
    columnWidths: [pLabelW, pDateW, pTimeTzW],
    rows: [
      new TableRow({ children: [bcPeriodCell('From', pLabelW), bcPeriodCell(inceptionFmt, pDateW), bcPeriodCell(`${polFormatTime(data.inceptionTime)} ${data.timezone || ''}`.trim(), pTimeTzW)] }),
      new TableRow({ children: [bcPeriodCell('To', pLabelW), bcPeriodCell(expiryFmt, pDateW), bcPeriodCell(`${polFormatTime(data.expiryTime)} ${data.timezone || ''}`.trim(), pTimeTzW)] })
    ],
  }) as unknown as Paragraph)

  children.push(bcSpacer(200))

  // 9. Cancellation paragraph — justified (from settings)
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 300 },
      children: [bcText(settings[cancelKey])],
    })
  )

  // 10. Place & date
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        bcText('PLACE & DATE: '),
        bcText(`${city}${city ? ', ' : ''}${today}`),
      ],
    })
  )

  // 11. Cancel and replace text (if applicable)
  if (data.cancelReplaceText) {
    children.push(bcSpacer(200))
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0 },
        children: [bcText(data.cancelReplaceText, { bold: true })],
      })
    )
  }

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
  isLastPage: boolean,
  settings: BcSettingsMap
): Paragraph[] {
  const is42 = cardType === 'MLC4.2'
  const ref = `${data.policyNumber}/${is42 ? 'MLC REG 4.2' : 'MLC REG 2.5.2'}`
  const inceptionFmt = bcFormatDate(data.inceptionDate)
  const expiryFmt = bcFormatDate(data.expiryDate)
  const portOfRegistry = data.portOfRegistry || ''
  const today = bcFormatDate(new Date().toISOString())
  const city = data.closingCity || ''

  const titleKey = is42 ? 'bc_text_MLC42_title' : 'bc_text_MLC252_title'
  const certifyKey = is42 ? 'bc_text_MLC42_certify' : 'bc_text_MLC252_certify'
  const cancelKey = is42 ? 'bc_text_MLC42_cancel' : 'bc_text_MLC252_cancel'

  // MLC contact info from settings, with data overrides
  const mlcEmail = data.contactEmail || settings.bc_mlc_email
  const mlcPhone = data.contactPhone || settings.bc_mlc_phone
  const mlcWebsite = data.companyWebsite || settings.bc_mlc_website
  const mlcCompanyAddress = data.companyAddress || settings.bc_mlc_company_address

  const children: Paragraph[] = []

  // 1. REF line — bold, right-aligned
  children.push(bcParagraph(`REF: ${ref}`, { bold: true, alignment: AlignmentType.RIGHT, spacingAfter: 300 }))

  // 2. Full title — bold, centered (from settings)
  children.push(bcParagraph(settings[titleKey], {
    bold: true,
    alignment: AlignmentType.CENTER,
    spacingAfter: 300,
  }))

  // 3. Vessel details table — same design as BBC/WRC (reuse bcDetailRow)
  const vesselRows = [
    bcDetailRow('NAME OF SHIP', data.vesselName),
    bcDetailRow('IMO NUMBER', data.imoNumber),
    bcDetailRow('DISTINCTIVE NUMBER OR LETTERS', data.callSign || ''),
    bcDetailRow('PORT OF REGISTRY', portOfRegistry ? `${portOfRegistry.toUpperCase()}${data.flagState ? ' / ' + data.flagState.toUpperCase() : ''}` : data.flagState?.toUpperCase() || ''),
    bcDetailRow('PERIOD OF INSURANCE', `FROM ${inceptionFmt.toUpperCase()} TO ${expiryFmt.toUpperCase()}`),
  ]

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    margins: BC_TABLE_MARGINS,
    columnWidths: [BC_LABEL_W, BC_SEP_W, BC_VALUE_W],
    rows: vesselRows,
  }) as unknown as Paragraph)

  children.push(bcSpacer(200))

  // 5. Shipowner block — label NOT bold, entity bold + uppercase
  children.push(bcParagraph(
    'NAME OF THE SHIPOWNER ON WHOSE BEHALF FINANCIAL SECURITY HAS BEEN PROVIDED:',
    { bold: false, spacingAfter: 80 }
  ))
  if (data.ownerName) {
    children.push(bcParagraph(data.ownerName.toUpperCase(), { bold: true, spacingAfter: 40 }))
  }
  if (data.ownerAddress) {
    children.push(...bcAddressBlock(data.ownerAddress.split('\n').map(l => l.toUpperCase()), 240, true))
  } else {
    children.push(bcSpacer(200))
  }

  // 6. Provider block — label NOT bold, entity from settings
  children.push(bcParagraph(
    'NAME, FULL ADDRESS AND WEBSITE OF THE PROVIDER OF INSURANCE OR OTHER FINANCIAL SECURITY',
    { bold: false, spacingAfter: 80 }
  ))
  // The MLC company-address setting usually already leads with the provider name (which may
  // differ from data.companyName only by punctuation/hyphenation), so avoid printing it twice.
  const providerAddrLines = (mlcCompanyAddress || '').split('\n').map(l => l.trim()).filter(Boolean)
  const normProvider = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const includeCompanyName =
    !!data.companyName &&
    (providerAddrLines.length === 0 || normProvider(providerAddrLines[0]) !== normProvider(data.companyName))
  const providerLines = [
    ...(includeCompanyName ? [data.companyName] : []),
    ...providerAddrLines,
    mlcWebsite
  ].filter(Boolean)
  for (let i = 0; i < providerLines.length; i++) {
    children.push(new Paragraph({
      spacing: { after: i === providerLines.length - 1 ? 240 : 0 },
      children: [bcText(providerLines[i].toUpperCase(), { bold: true })]
    }))
  }

  // 7. Contact details — label NOT bold, values bold
  children.push(bcParagraph(
    'CONTACT DETAILS OF THE PERSONS OR ENTITY RESPONSIBLE FOR HANDLING SEAFARERS\u2019 REQUEST FOR RELIEF:',
    { bold: false, spacingAfter: 80 }
  ))
  const contactRows: TableRow[] = []
  const cLabelW = 800
  const cValueW = 9200
  const cRow = (label: string, value: string) => new TableRow({
    children: [
      new TableCell({ width: { size: cLabelW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [bcText(label)] })] }),
      new TableCell({ width: { size: cValueW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [bcText(value, { bold: true })] })] })
    ]
  })
  if (mlcEmail) contactRows.push(cRow('Email', mlcEmail))
  if (mlcPhone) {
    const phoneLines = mlcPhone.split('\n').filter(Boolean)
    phoneLines.forEach((line, i) => contactRows.push(cRow(i === 0 ? 'Tel' : '', line.trim())))
  }
  if (contactRows.length > 0) {
    children.push(new Table({
      width: { size: 10000, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      margins: BC_TABLE_MARGINS,
      columnWidths: [cLabelW, cValueW],
      rows: contactRows,
    }) as unknown as Paragraph)
    children.push(bcSpacer(200))
  } else {
    children.push(bcSpacer(100))
  }

  // 8. Certification paragraph — justified (from settings)
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 200 },
      children: [bcText(settings[certifyKey])],
    })
  )

  // 9. Cancellation paragraph — justified (from settings)
  children.push(
    new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: 300 },
      children: [bcText(settings[cancelKey])],
    })
  )

  // 10. Place & date — NOT bold
  children.push(
    new Paragraph({
      spacing: { after: 0 },
      children: [
        bcText('PLACE & DATE: '),
        bcText(`${city}${city ? ', ' : ''}${today}`),
      ],
    })
  )

  // 11. Cancel and replace text (if applicable)
  if (data.cancelReplaceText) {
    children.push(bcSpacer(200))
    children.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 0 },
        children: [bcText(data.cancelReplaceText, { bold: true })],
      })
    )
  }

  // Page break unless last page
  if (!isLastPage) {
    children.push(new Paragraph({ children: [new PageBreak()] }))
  }

  return children
}

// ==================== Blue Card Page Router ====================

async function buildBlueCardPage(
  data: BlueCardData,
  cardType: BlueCardType,
  isLastPage: boolean,
  settings: BcSettingsMap
): Promise<Paragraph[]> {
  if (cardType === 'BBC' || cardType === 'WRC') {
    return buildBbcWrcPage(data, cardType, isLastPage, settings)
  }
  return buildMlcPage(data, cardType, isLastPage, settings)
}

// ==================== Public Export Functions ====================

/**
 * Export a single blue card as a DOCX document.
 */
export async function exportBlueCardDocx(
  data: BlueCardData,
  cardType: BlueCardType,
  policyId?: string
): Promise<void> {
  const { blob, fileName } = await buildBlueCardBlob(data, cardType, policyId)
  polDownloadBlob(blob, fileName)
}

async function buildBlueCardBlob(
  data: BlueCardData,
  cardType: BlueCardType,
  policyId?: string
): Promise<{ blob: Blob; fileName: string }> {
  await loadPolicyFontSize()
  // When a policyId is given, freeze the policy on first export and pull the blue-card
  // texts / letterhead / footer from its frozen snapshot so re-exports never change.
  let settings: BcSettingsMap
  let headerHtml = ''
  let headerSpacing: number | undefined
  let footerSettings: any = null
  if (policyId) {
    const exp = await loadFrozenExportData(policyId)
    const f = exp.frozen
    settings = { ...BC_DEFAULTS, ...(f?.bcSettings || {}) } as unknown as BcSettingsMap
    headerHtml = f?.docHeader || ''
    headerSpacing = f?.docHeaderSpacing
    footerSettings = f?.exportSettings || null
    applyFrozenFontSize(exp)
  } else {
    settings = await loadBcSettings()
    try {
      const st = await window.api.piGetSectionTexts()
      headerHtml = st?.docHeader || ''
      headerSpacing = (st as any)?.docHeaderSpacing || undefined
    } catch { /* no header */ }
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      footerSettings = raw ? JSON.parse(raw) : null
    } catch { /* no footer */ }
  }
  const children = await buildBlueCardPage(data, cardType, true, settings)

  // Build header + footer matching policy style
  const headerParas: Paragraph[] = []
  if (headerHtml) {
    headerParas.push(...parseHtmlToParagraphs(headerHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: headerSpacing, spacingAfter: 0 }))
  }
  // No policy/vessel line in header — shown in body REF line instead

  // Footer text (no page number for blue cards)
  const footerParas: Paragraph[] = []
  if (footerSettings?.footerText) {
    const plainFt = footerSettings.footerText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    for (const line of plainFt.split('\n')) {
      if (line.trim()) {
        footerParas.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: line.trim(), size: 18, font: BC_FONT, color: '999999' })],
        }))
      }
    }
  }

  const document = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: 1200,
            bottom: 1000,
            left: 900,
            right: 900,
          },
        },
      },
      headers: headerParas.length > 0 ? { default: new Header({ children: headerParas }) } : undefined,
      footers: footerParas.length > 0 ? { default: new Footer({ children: footerParas }) } : undefined,
      children: children as any[],
    }],
  })

  const blob = await Packer.toBlob(document)
  const bcVName = data.vesselName ? ` - ${data.vesselName}` : ''
  return { blob, fileName: `${data.policyNumber}${bcVName} - ${cardType}.docx` }
}

/**
 * Export multiple blue cards as a single DOCX document with page breaks.
 */
export async function exportBlueCardsDocx(
  data: BlueCardData,
  cardTypes: BlueCardType[],
  policyId?: string
): Promise<void> {
  if (cardTypes.length === 0) return
  await loadPolicyFontSize()

  // Export each card as a separate file
  for (const cardType of cardTypes) {
    await exportBlueCardDocx(data, cardType, policyId)
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
// makeRow body cell has left/right margins of 80 twips. Nested tables ignore the
// parent cell's left margin and hug the cell border, so they render ~80 twips left
// of the paragraph-based sections. Indent nested tables by this margin and base
// their width on the inner content area so they align with paragraph content.
const POL_BODY_CELL_MARGIN = 80
const POL_BODY_INNER_W = POL_BODY_W - 2 * POL_BODY_CELL_MARGIN
// Zero the nested-table cell inset (Word/LibreOffice default ~108twip) so nested-table
// cell text aligns flush-left with the paragraph sections in the same body cell.
// Verified via docx→LibreOffice render (inner-width alone left a ~108twip residual).
const POL_TABLE_MARGINS = { marginUnitType: WidthType.DXA, top: 0, bottom: 0, left: 0, right: 0 }

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
  selectedAlternativeId?: string | null
  closingCity?: string
  cancelReplaceText?: string
  previousPolicyNumber?: string
  previousPolicyDate?: string
  quotationTypeCode?: string
  quotationTypeName?: string
  createdAt?: string
  exportSnapshot?: string | null
  sectionOrder?: string[] | null
  selectedLolOptionId?: string | null
  selectedAgreedValueOptionId?: string | null
  ourShare?: number | null
  subjectivityDays?: number
}

interface PolicyInstalment {
  id: string
  policyId: string
  instalmentNumber: number
  dueDate: string
  amount?: number
  premiumAmount?: number
  commissionAmount?: number
  currency?: string
  isNonRefundable?: boolean
}

interface PolicyAddress {
  id: string
  policyId: string
  entityId: string
  entityName: string
  role: string
  address?: string
  addressText?: string
  country?: string
  order?: number
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
  subjectivityDays: number
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
  hullCustomConditions: { id: string; text: string; title?: string; order: number }[]
  warConditions: QuotationWarCondition[]
  allWarConditions: WarCondition[]
  warSettings: WarSettings | null
  surveyWarranties: { id: string; text: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]
  tradingIntros: { id: string; text: string; vesselScope: string[] | null; order: number }[]
  companyName: string
  assuredGroups: QuotationAssuredGroup[]
  customSections: { id: string; title: string; text?: string; order: number }[]
  lolOptions: { id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]
  agreedValueOptions: QuotationAgreedValueOption[]
  fleets: { id: string; name: string }[]
  vesselClassificationNames: Record<string, string>
  // Frozen render settings — everything the builders would otherwise read live from
  // getSetting/settings. Captured on first export so re-exports (policy/DA/CA/BC) never
  // pick up later setting changes. A new revision produces a new row with no snapshot,
  // which re-freezes on its first export.
  frozen?: FrozenExportSettings
}

interface FrozenExportSettings {
  exportSettings: any                 // parsed policyExportSettings (footer, header titles, intros…)
  bcSettings: Record<string, string>  // blue-card title/certify/cancel + MLC contact block
  docHeader: string                   // company letterhead HTML
  docHeaderSpacing?: number
  fontSize?: number | null
  qrBase?: string | null
  sectionOrderDefault?: string[] | null
  brokerEntity?: { id: string; name: string; email?: string; phone?: string } | null
  brokerAddress?: { addressLine1?: string; city?: string; country?: string } | null
  logoPath?: string | null
  declarationSettings?: any            // per-year War declaration config (UMR/Amlin/risk code)
  endorsementClosingText?: string | null
}

interface PolVesselInfo {
  name: string
  imo?: string
  built?: number
  rebuilt?: number | null
  gt?: number
  type?: string
  flag?: string
  classification?: string
  callSign?: string
}

// ---- Data loading ----

/** Load every live render setting the builders would otherwise read via getSetting, so it
 * can be frozen into the snapshot. Reused for fresh loads and to backfill legacy snapshots. */
async function loadFrozenSettings(quotation: Quotation, sectionTextsRaw?: any): Promise<FrozenExportSettings> {
  let exportSettings: any = {}
  try {
    const raw = await window.api.getSetting('policyExportSettings')
    if (raw) exportSettings = JSON.parse(raw)
  } catch { /* keep {} */ }
  const bcSettings = await loadBcSettings()
  const fontRaw = await window.api.getSetting('policy_font_size')
  let sectionOrderDefault: string[] | null = null
  try {
    const rawSec = await window.api.getSetting(`policy_section_order_defaults_${quotation.quotationTypeCode}`)
    if (rawSec) sectionOrderDefault = JSON.parse(rawSec)
  } catch { /* null */ }
  const qrBase = quotation.quotationTypeCode === 'P' ? (await window.api.getSetting('qr_verification_url')) : null
  const logoPath = await window.api.piGetQuotationLogoPath()
  let declarationSettings: any = null
  try { const rawDec = await window.api.getSetting('declaration_settings'); if (rawDec) declarationSettings = JSON.parse(rawDec) } catch { /* null */ }
  const endorsementClosingText = (await window.api.getSetting('endorsement_closing_text').catch(() => null)) || null
  let st: any = sectionTextsRaw
  if (!st) { try { st = await window.api.piGetSectionTexts() } catch { st = null } }
  let brokerEntity: FrozenExportSettings['brokerEntity'] = null
  let brokerAddress: FrozenExportSettings['brokerAddress'] = null
  if (quotation.customerEntityId && quotation.customerType === 'broker') {
    try {
      const ents = await window.api.getEntities()
      const be = (Array.isArray(ents) ? ents : []).find((e: any) => e.id === quotation.customerEntityId)
      if (be) brokerEntity = { id: be.id, name: be.name, email: be.email, phone: be.phone }
      const addrs = await window.api.getEntityAddresses(quotation.customerEntityId)
      if (Array.isArray(addrs) && addrs.length > 0) brokerAddress = { addressLine1: addrs[0].addressLine1, city: addrs[0].city, country: addrs[0].country }
    } catch { /* no broker */ }
  }
  return {
    exportSettings,
    bcSettings,
    docHeader: (st as any)?.docHeader || '',
    docHeaderSpacing: (st as any)?.docHeaderSpacing,
    fontSize: fontRaw ? parseInt(fontRaw, 10) : null,
    qrBase,
    sectionOrderDefault,
    brokerEntity,
    brokerAddress,
    logoPath,
    declarationSettings,
    endorsementClosingText
  }
}

async function loadPolicyExportData(policyId: string): Promise<PolicyExportData> {
  const policy: PolicyDocRecord = await window.api.policyGetById(policyId)

  // If policy has a frozen export snapshot, use it instead of live data
  if (policy.exportSnapshot) {
    try {
      const snapshot = JSON.parse(policy.exportSnapshot) as PolicyExportData
      // Restore the policy record from snapshot but keep current signedBy/signedAt
      if (snapshot.policy) {
        snapshot.policy.exportSnapshot = policy.exportSnapshot
      }
      // Legacy snapshots (captured before the freeze-everything change) have no `frozen`
      // bundle — backfill it from current settings so footer/titles/etc. aren't blank.
      if (!snapshot.frozen && snapshot.quotation) {
        try { snapshot.frozen = await loadFrozenSettings(snapshot.quotation) } catch { /* leave undefined */ }
      }
      return snapshot
    } catch {
      console.warn('[PolicyExport] Invalid snapshot JSON, falling back to live data')
    }
  }

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
    hullAdditionalConditionsRaw, allHullAdditionalConditionsRaw, hullAlternativesRaw, hullCustomConditionsRaw,
    warConditionsRaw, allWarConditionsRaw, warSettingsRaw,
    flagStatesRaw, surveyWarrantiesRaw, banks,
    assuredGroupsRaw, customSectionsRaw, agreedValueOptionsRaw, fleetsRaw,
    tradingIntrosRaw, assuredRolesRaw
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
    window.api.hullGetQuotationCustomConditions(policy.quotationId),
    window.api.warGetQuotationWarConditions(policy.quotationId),
    window.api.warGetConditions(),
    window.api.warGetSettings(),
    window.api.getFlagStates(),
    window.api.quotationSurveyWarrantyGetAll(policy.quotationId),
    window.api.bankGetAll(),
    window.api.getQuotationAssuredGroups(policy.quotationId),
    window.api.getQuotationCustomSections(policy.quotationId),
    window.api.hullGetAgreedValueOptions(policy.quotationId),
    window.api.getFleets(),
    window.api.tradingGetIntros(policy.quotationId),
    window.api.getAssuredRoles()
  ])

  // Sort assureds by the configured role order (Registered Owners → Managers → …) so the
  // Insured section renders them in role order within each vessel.
  const assuredRoleOrder = new Map(
    (Array.isArray(assuredRolesRaw) ? assuredRolesRaw : []).map((r: any, idx: number) => [r.name?.toLowerCase(), r.order ?? idx])
  )
  const assuredsSorted = [...(Array.isArray(assureds) ? assureds : [])].sort(
    (a: any, b: any) => (assuredRoleOrder.get(a.role?.toLowerCase()) ?? 999) - (assuredRoleOrder.get(b.role?.toLowerCase()) ?? 999)
  )

  // Resolve the target vessel up-front — filterByAlt (below) references these.
  const safeQVessels = Array.isArray(quotationVessels) ? quotationVessels : []
  const vessel = safeQVessels.find(v => v.vesselId === policy.vesselId) || safeQVessels[0] || null

  // Filter by selected alternative and vessel scope
  const altId = policy.selectedAlternativeId || null
  const filterByAlt = (items: any[]) => {
    let result = items
    if (altId) {
      result = result.filter((item: any) => !item.alternativeId || item.alternativeId === altId)
    }
    // Also filter by vessel scope if multi-vessel quotation
    if (vessel && safeQVessels.length > 1) {
      result = result.filter((item: any) => {
        if (!item.vesselScope || !Array.isArray(item.vesselScope) || item.vesselScope.length === 0) return true
        return item.vesselScope.includes(vessel!.id)
      })
    }
    return result
  }

  const safeClauseRows = filterByAlt(Array.isArray(clauseRows) ? clauseRows : [])
  const selectedClauseIds = safeClauseRows.map((r: any) => r.piClauseId)
  const clauseOverrides: Record<string, string> = (clauseOverridesArr && typeof clauseOverridesArr === 'object' && !Array.isArray(clauseOverridesArr))
    ? clauseOverridesArr as Record<string, string>
    : {}

  const safeWarrantyRows = filterByAlt(Array.isArray(warrantyRows) ? warrantyRows : [])
  const selectedWarrantyIds = safeWarrantyRows.map((r: any) => r.piWarrantyId)

  const piAlternativesRaw = quotation.quotationTypeCode === 'P'
    ? await window.api.piGetQuotationAlternatives(policy.quotationId)
    : []

  const lolOptionsRaw = quotation.quotationTypeCode === 'P'
    ? await window.api.lolGetOptions(policy.quotationId)
    : []

  // Resolve IACS classification from junction table
  let vesselClassificationNames: Record<string, string> = {}
  try {
    const [classSocieties] = await Promise.all([window.api.getClassificationSocieties()])
    const safeQV = Array.isArray(quotationVessels) ? quotationVessels : []
    for (const qv of safeQV) {
      if (!qv.vesselId) continue
      try {
        const classIds = await window.api.getVesselClassifications(qv.vesselId)
        if (Array.isArray(classIds) && classIds.length > 0) {
          // Sort IACS first
          const iacsIds = new Set(classSocieties.filter((s: any) => s.isIacs).map((s: any) => s.id))
          const sorted = [...classIds].sort((a: any, b: any) => {
            const aId = typeof a === 'string' ? a : a.classificationSocietyId
            const bId = typeof b === 'string' ? b : b.classificationSocietyId
            return (iacsIds.has(bId) ? 1 : 0) - (iacsIds.has(aId) ? 1 : 0)
          })
          const names = sorted.map((c: any) => {
            const cid = typeof c === 'string' ? c : c.classificationSocietyId
            const cs = classSocieties.find((s: any) => s.id === cid)
            if (!cs) return null
            return cs.abbreviation ? `${cs.name} (${cs.abbreviation})` : cs.name
          }).filter(Boolean)
          if (names.length > 0) vesselClassificationNames[qv.id] = names.join(' / ')
        }
      } catch {}
      // Fallback: if junction table empty, resolve classificationSociety ID from vessel
      if (!vesselClassificationNames[qv.id] && qv.vesselId) {
        const realV = (Array.isArray(quotationVessels) ? quotationVessels : []).find(v => v.id === qv.id)
        const classId = realV?.classification || (safeQV.find(v => v.id === qv.id) as any)?.classification
        if (classId) {
          const cs = classSocieties.find((s: any) => s.id === classId || s.name === classId || s.abbreviation === classId)
          if (cs) vesselClassificationNames[qv.id] = cs.abbreviation ? `${cs.name} (${cs.abbreviation})` : cs.name
        }
      }
    }
  } catch {}

  const mergedTexts: PISectionTexts = { ...DEFAULT_SECTION_TEXTS, ...(sectionTexts || {}), ...(quotation.sectionTextsOverride || {}) }

  const safeFlagStates: { id: string; name: string }[] = Array.isArray(flagStatesRaw) ? flagStatesRaw : []
  const safeAllVessels: Vessel[] = Array.isArray(allVessels) ? allVessels : []

  // Try quotation vessel first, then fall back to real vessel data from the policy JOIN
  let vesselInfo: PolVesselInfo = vessel ? polGetVesselInfo(vessel, safeAllVessels, safeFlagStates) : { name: 'Unknown' }
  // If vessel info is empty/dashes, try loading directly from the vessels table
  if (policy.vesselId && (!vesselInfo.type || !vesselInfo.flag)) {
    const realVessel = safeAllVessels.find(v => v.id === policy.vesselId)
    if (realVessel) {
      const flagName = realVessel.flagStateId ? (safeFlagStates.find(f => f.id === realVessel.flagStateId)?.name || vesselInfo.flag) : vesselInfo.flag
      vesselInfo = {
        name: realVessel.name || vesselInfo.name,
        imo: realVessel.imoNumber || vesselInfo.imo,
        built: realVessel.builtYear || vesselInfo.built,
        rebuilt: realVessel.rebuiltYear ?? vesselInfo.rebuilt,
        gt: realVessel.grossTonnage || vesselInfo.gt,
        type: realVessel.vesselType || vesselInfo.type,
        flag: flagName || vesselInfo.flag,
        classification: realVessel.classificationSociety || vesselInfo.classification,
        callSign: realVessel.callSign || vesselInfo.callSign
      }
    }
  }

  const safeBanks: BankRecord[] = Array.isArray(banks) ? banks : []
  const bank = policy.bankId ? safeBanks.find(b => b.id === policy.bankId) || null : null

  const reportSettings = await getReportSettings()

  // Freeze all live render settings so the snapshot fully determines the output.
  const frozen = await loadFrozenSettings(quotation, sectionTexts)

  return {
    policy,
    quotation,
    frozen,
    instalments: Array.isArray(instalments) ? instalments : [],
    addresses: Array.isArray(addresses) ? addresses : [],
    blueCards: Array.isArray(blueCards) ? blueCards : [],
    vessel,
    vesselInfo,
    bank,
    quotationVessels: safeQVessels,
    allVessels: safeAllVessels,
    flagStates: safeFlagStates,
    assureds: (() => {
      const all = assuredsSorted
      if (!vessel || safeQVessels.length <= 1) return all
      // Filter assureds to only those belonging to this vessel
      const vLabel = vessel.vesselLabel
      // Find the group matching this vessel's label
      const safeGroups = Array.isArray(assuredGroupsRaw) ? assuredGroupsRaw : []
      const vesselGroup = safeGroups.find((g: any) => g.name === vLabel)
      if (vesselGroup) {
        return all.filter((a: any) => a.groupId === vesselGroup.id)
      }
      // Legacy: filter by vesselLabel
      return all.filter((a: any) => !a.vesselLabel || a.vesselLabel === vLabel)
    })(),
    subLimits: Array.isArray(subLimits) ? subLimits : [],
    selectedClauseIds,
    allClauses: Array.isArray(allClauses) ? allClauses : [],
    additionalClauses: filterByAlt(Array.isArray(additionalClauses) ? additionalClauses : []),
    allAdditionalClauses: Array.isArray(allAdditionalClauses) ? allAdditionalClauses : [],
    selectedWarrantyIds,
    allWarranties: Array.isArray(allWarranties) ? allWarranties : [],
    customWarranties: filterByAlt(Array.isArray(customWarranties) ? customWarranties : []),
    deductibles: filterByAlt(Array.isArray(deductibles) ? deductibles : []),
    textDeductibles: filterByAlt(Array.isArray(textDeductibles) ? textDeductibles : []),
    selectedExclusions: filterByAlt(Array.isArray(selectedExclusions) ? selectedExclusions : []),
    allExclusions: Array.isArray(allExclusions) ? allExclusions : [],
    customExclusions: filterByAlt(Array.isArray(customExclusions) ? customExclusions : []),
    excludedCountries: Array.isArray(excludedCountries) ? excludedCountries : [],
    subjectivities: (Array.isArray(subjectivities) ? subjectivities : []).filter(
      (s: QuotationSubjectivity) => !s.vesselScope || !vessel || s.vesselScope.includes(vessel.id)
    ),
    subjectivityDays: policy.subjectivityDays ?? 7,
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
    hullCustomConditions: filterByAlt(Array.isArray(hullCustomConditionsRaw) ? hullCustomConditionsRaw : []),
    warConditions: Array.isArray(warConditionsRaw) ? warConditionsRaw : [],
    allWarConditions: Array.isArray(allWarConditionsRaw) ? allWarConditionsRaw : [],
    warSettings: (warSettingsRaw && !(warSettingsRaw as any).error) ? warSettingsRaw : null,
    surveyWarranties: filterByAlt((Array.isArray(surveyWarrantiesRaw) ? surveyWarrantiesRaw : [])
      .filter((sw: any) => {
        // Filter by vessel scope: null/empty = all vessels, array = specific vessels
        if (!sw.vesselScope || !Array.isArray(sw.vesselScope) || sw.vesselScope.length === 0) return true
        return vessel ? sw.vesselScope.includes(vessel.id) : true
      })
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0)).map((sw: any) => ({
      ...sw,
      text: (sw.text || '')
        .replace(/\{days\}/g, sw.daysValue != null ? String(sw.daysValue) : '{days}')
        .replace(/\{deadline\}/g, sw.deadlineValue || '{deadline}')
        .replace(/\{event\}/g, sw.eventValue || '{event}')
        .replace(/\{surveyor\}/g, sw.surveyorValue || '{surveyor}')
        .replace(/\{dateofsurvey\}/g, sw.dateOfSurveyValue || '{dateofsurvey}')
    }))),
    tradingIntros: Array.isArray(tradingIntrosRaw) ? tradingIntrosRaw : [],
    companyName: reportSettings.companyName || 'Insurance Company',
    assuredGroups: (() => {
      const all = Array.isArray(assuredGroupsRaw) ? assuredGroupsRaw : []
      if (!vessel || safeQVessels.length <= 1) return all
      // Only include the group matching this vessel's label
      return all.filter((g: any) => g.name === vessel.vesselLabel)
    })(),
    customSections: Array.isArray(customSectionsRaw) ? customSectionsRaw : [],
    lolOptions: Array.isArray(lolOptionsRaw) ? lolOptionsRaw : [],
    agreedValueOptions: Array.isArray(agreedValueOptionsRaw) ? agreedValueOptionsRaw : [],
    fleets: Array.isArray(fleetsRaw) ? fleetsRaw : [],
    vesselClassificationNames
  }
}

// ---- Export Snapshot ----

/**
 * Freeze the given already-loaded export data as a JSON snapshot on the policy.
 * All future exports (policy/DA/CA/BC) read from this so documents never change on
 * re-export. Called on the FIRST export of a policy and again at signing (to add the
 * signature). A new revision is a new policy row with no snapshot and re-freezes.
 */
async function capturePolicyExportSnapshotFromData(policyId: string, data: PolicyExportData): Promise<void> {
  // Strip the exportSnapshot field from the nested policy to avoid storing a snapshot-of-a-snapshot
  const snapshotPolicy = { ...data.policy }
  delete snapshotPolicy.exportSnapshot

  // Capture the signature image so it's frozen with the policy
  let signatureSnapshot: { imageData: number[]; signerName: string } | null = (data as any).signatureSnapshot || null
  try {
    const sigData = await window.api.policyGetSignature(policyId)
    if (sigData && sigData.imageData) {
      signatureSnapshot = {
        imageData: Array.isArray(sigData.imageData) ? sigData.imageData : Array.from(sigData.imageData as any),
        signerName: sigData.signerName || ''
      }
    }
  } catch { /* no signature */ }

  const snapshot = {
    ...data,
    policy: snapshotPolicy,
    signatureSnapshot,
    snapshotAt: new Date().toISOString()
  }
  await window.api.policyUpdate(policyId, { exportSnapshot: JSON.stringify(snapshot) })
}

/** Public capture (used at signing) — loads current data, then freezes it. */
export async function capturePolicyExportSnapshot(policyId: string): Promise<void> {
  const data = await loadPolicyExportData(policyId)
  await capturePolicyExportSnapshotFromData(policyId, data)
}

/**
 * Load export data and, if the policy has no snapshot yet, freeze one now (first export).
 * Every export entry point uses this so the very first document produced locks the content.
 */
async function loadFrozenExportData(policyId: string): Promise<PolicyExportData> {
  const data = await loadPolicyExportData(policyId)
  if (!data.policy.exportSnapshot) {
    try {
      await capturePolicyExportSnapshotFromData(policyId, data)
    } catch (e) {
      console.warn('[PolicyExport] freeze-on-first-export failed; exporting live', e)
    }
  }
  return data
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
    return { name: reg.name, imo: reg.imoNumber, built: reg.builtYear, rebuilt: reg.rebuiltYear, gt: reg.grossTonnage, type: reg.vesselType, flag: flagName, classification: reg.classificationSociety, callSign: reg.callSign }
  }
  return { name: qv.name || 'Unknown', imo: qv.imoNumber, built: qv.builtYear, rebuilt: qv.rebuiltYear, gt: qv.grossTonnage, type: qv.vesselType, flag: qv.flag, classification: qv.classification, callSign: qv.callSign }
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
  return decodeHtmlEntities(raw.replace(/\{quotation_type\}/g, data.quotation.quotationTypeName || 'P&I'))
}

function polFmtPct(val: number | string): string {
  const n = typeof val === 'string' ? parseFloat(val) : val
  return n % 1 === 0 ? String(Math.round(n)) : String(n)
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// polGetTypeLabel removed — replaced by configurable headerTitles

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

/** Override the live font size with the policy's frozen value (from the snapshot). */
function applyFrozenFontSize(data: PolicyExportData): void {
  const fs = data.frozen?.fontSize
  if (fs && fs >= 8 && fs <= 16) {
    POL_FONT_SIZE = fs * 2
    BC_SIZE = fs * 2
  }
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

// Tight variants (no trailing `after`) — for a heading/line immediately followed by a
// polEmptyP() spacer, so the gap is exactly one blank line (matching the insured section).
function polBupTight(text: string) {
  return new Paragraph({
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true, underline: {} })]
  })
}

function polNpTight(text: string) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
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

// A precise, tiny vertical gap (exact line height in points) — used where a full blank line
// is too much, e.g. a 3pt gap between a paragraph and a following block.
function polSpacerPts(pts: number) {
  return new Paragraph({ spacing: { before: 0, after: 0, line: Math.round(pts * 20), lineRule: 'exact' as any }, children: [] })
}

function polMp(text: string): Paragraph[] {
  if (!text) return []
  const decoded = decodeHtmlEntities(text)
  if (polIsHtml(decoded)) return parseHtmlToParagraphs(decoded, { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
  return decoded.split('\n').map(p =>
    p.trim() ? polNp(p) : polEmptyP()
  )
}

// Like polMp but the last text paragraph carries no trailing `after`, so a following
// polEmptyP() spacer produces exactly one blank line — matching a block that ends with a
// table (which has no trailing spacing). Keeps inter-paragraph spacing for multi-line text.
function polMpTight(text: string): Paragraph[] {
  if (!text) return []
  const decoded = decodeHtmlEntities(text)
  if (polIsHtml(decoded)) return polMp(text) // HTML paths keep their own spacing
  const lines = decoded.split('\n')
  let lastNonEmpty = -1
  for (let i = lines.length - 1; i >= 0; i--) { if (lines[i].trim()) { lastNonEmpty = i; break } }
  const out: Paragraph[] = []
  lines.forEach((p, i) => {
    if (!p.trim()) { if (i < lastNonEmpty) out.push(polEmptyP()); return }
    out.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      spacing: { after: i === lastNonEmpty ? 0 : 80, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text: p, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
    }))
  })
  return out
}

// Render authored HTML with uniform inter-paragraph spacing: empty <p>/<br> separators
// are dropped so every clause is spaced by the same `after` gap (used for the trading
// warranty, whose source mixes blank-line separators with tightly-packed sub-clauses).
function polMpUniform(text: string): Paragraph[] {
  if (!text) return []
  const decoded = decodeHtmlEntities(text)
  if (polIsHtml(decoded)) {
    return parseHtmlToParagraphs(decoded, { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED, collapseEmpty: true })
  }
  return decoded.split('\n').filter(l => l.trim()).map(p => polNp(p))
}

// Aligned "Section A / Section B / Total" amount breakdown, shared by the Debit Advice
// premium split and the Hull Agreed Insured Value section. Amounts left-aligned; the
// Total row is bold with a top rule, and the total is spelled out in words below.
function polBuildAmountBreakdown(
  sections: { label: string; amount: number }[],
  totalLabel: string,
  total: number,
  currency: string
): (Paragraph | Table)[] {
  const labelW = Math.round(POL_BODY_INNER_W * 0.45)
  const amtW = POL_BODY_INNER_W - labelW
  const totalTop = {
    top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
    bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  }
  const brRow = (label: string, amount: number, opts?: { bold?: boolean; total?: boolean }) => new TableRow({
    children: [
      new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: opts?.total ? totalTop : polNoBorders(), children: [new Paragraph({ spacing: { after: 20, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: label, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: !!opts?.bold })] })] }),
      new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: opts?.total ? totalTop : polNoBorders(), children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 20, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: polFormatCurrency(amount, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: !!opts?.bold })] })] })
    ]
  })
  return [
    new Table({
      width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
      layout: TableLayoutType.FIXED,
      columnWidths: [labelW, amtW],
      rows: [
        ...sections.map(s => brRow(s.label, s.amount)),
        brRow(totalLabel, total, { bold: true, total: true })
      ]
    }),
    new Paragraph({
      spacing: { before: 40, after: 40, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text: `(${numberToWords(total, currency)} Only)`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
    })
  ]
}

function polMpBullet(text: string): Paragraph[] {
  if (!text) return []
  const decoded = decodeHtmlEntities(text)
  if (polIsHtml(decoded)) {
    if (/<(ul|ol|li)\b/i.test(decoded)) {
      // Bullet a leading intro <p> that precedes an embedded list so the whole
      // condition reads as a bullet (e.g. "<p>Including ...:</p><ul><li>...</li></ul>").
      const listStart = decoded.search(/<(ul|ol)\b/i)
      if (listStart > 0) {
        const lead = decoded.slice(0, listStart)
        const rest = decoded.slice(listStart)
        if (/<p\b/i.test(lead)) {
          // Intro as the SAME native dash-bullet as plain conditions; sub-list + closing nest under it.
          const introText = stripHtml(lead).trim()
          const baseOpt = { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED, spacingAfter: 40 }
          const introParas = introText ? [polBulletP(introText)] : []
          const restParas = parseHtmlToParagraphs(rest, { ...baseOpt, indentOffset: 280 })
          return [...introParas, ...restParas]
        }
      }
      return parseHtmlToParagraphs(decoded, { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
    }
    const bulletHtml = decoded.replace(/<p\b/gi, '<li').replace(/<\/p>/gi, '</li>')
    return parseHtmlToParagraphs(`<ul>${bulletHtml}</ul>`, { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
  }
  return [polBulletP(decoded)]
}

function polCenteredP(text: string, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold })]
  })
}

function polCenteredPTight(text: string, bold = false) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
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

// Capture mode: when enabled, polDownloadBlob stores the blob instead of downloading
let _polCaptureMode = false
let _polCapturedBlob: Blob | null = null

function polDownloadBlob(blob: Blob, filename: string) {
  if (_polCaptureMode) {
    _polCapturedBlob = blob
    return
  }
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

  // Build insured rows as a borderless table: Name (+ country) | As Role + Address
  const tableRows: TableRow[] = []

  if (data.addresses.length > 0) {
    // Sort addresses: by explicit order field first, then by quotation assured order
    const assuredOrder = data.assureds.map((a: any) => a.entityId || a.entity_id)
    const sortedAddrs = [...data.addresses].sort((a, b) => {
      // If addresses have distinct explicit order, use that
      if (a.order != null && b.order != null && a.order !== b.order) return a.order - b.order
      // Fall back to quotation assured order
      const aIdx = assuredOrder.indexOf(a.entityId)
      const bIdx = assuredOrder.indexOf(b.entityId)
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx
      if (aIdx !== -1) return -1
      if (bIdx !== -1) return 1
      return 0
    })
    for (const addr of sortedAddrs) {
      // Left: entity name – country
      const leftChildren: Paragraph[] = []
      const nameRuns: TextRun[] = [new TextRun({ text: addr.entityName, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
      if (addr.country) nameRuns.push(new TextRun({ text: ` \u2013 ${addr.country}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' }))
      leftChildren.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: nameRuns }))

      // Right: role only ("As <role>") — the address goes on its own full-width row below
      const rightChildren: Paragraph[] = []
      if (addr.role) rightChildren.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `As ${addr.role}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
      if (rightChildren.length === 0) rightChildren.push(polEmptyP())

      tableRows.push(new TableRow({
        children: [
          new TableCell({ borders: polNoBorders(), verticalAlign: VerticalAlign.TOP, children: leftChildren }),
          new TableCell({ borders: polNoBorders(), verticalAlign: VerticalAlign.TOP, children: rightChildren })
        ]
      }))

      // Address as a full-width row (spanning both columns) directly under the insured
      const addrText = addr.addressText || addr.address || ''
      if (addrText) {
        const addrParas: Paragraph[] = []
        const addrLines = addrText.split('\n').filter((l: string) => l.trim())
        for (let li = 0; li < addrLines.length; li++) {
          addrParas.push(new Paragraph({ spacing: { after: li === addrLines.length - 1 ? 120 : 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: addrLines[li].trim(), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
        }
        tableRows.push(new TableRow({
          children: [
            new TableCell({ columnSpan: 2, borders: polNoBorders(), verticalAlign: VerticalAlign.TOP, children: addrParas })
          ]
        }))
      }
    }
  } else if (data.assureds.length > 0) {
    for (const a of data.assureds) {
      tableRows.push(new TableRow({
        children: [
          new TableCell({ borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: a.name, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: a.role ? `As ${a.role}` : '', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
        ]
      }))
    }
  }

  if (tableRows.length > 0) {
    content.push(new Table({
      width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
      layout: TableLayoutType.AUTOFIT,
      rows: tableRows
    }))
  }

  // "For their respective rights…" follows the insured block directly (no blank line).
  if (polSt(data, 'insuredFooter')) {
    content.push(...polMpTight(polSt(data, 'insuredFooter')))
  }

  // Broker (c/o …) comes just after the footer with a tiny 3pt gap — unless suppressed.
  const brokerName = data.quotation.coName || data.assureds.find(a => a.role?.toLowerCase().includes('broker'))?.name
  if (brokerName && !(data.policy as any).hideBroker) {
    content.push(polSpacerPts(3))
    content.push(polNpTight(`c/o ${brokerName}`))
  }

  return content
}

function polBuildVesselTable(data: PolicyExportData): Table {
  const vi = data.vesselInfo
  const rows: [string, string][] = [
    ['Vessel Name', vi.name.toUpperCase()],
    ['Vessel Type', vi.type || '-'],
    ['Flag', vi.flag || '-'],
    ['Year Built', vi.built ? (vi.rebuilt ? `${vi.built} - Rebuilt: ${vi.rebuilt}` : String(vi.built)) : '-'],
    ['GT', vi.gt ? Number(vi.gt).toLocaleString() : '-'],
    ['IMO Number', vi.imo || '-'],
    ['Classification', (data.vessel && data.vesselClassificationNames[data.vessel.id]) || vi.classification || '-']
  ]
  // Call sign is intentionally omitted from policy documents — it only appears on blue cards.

  const labelW = Math.round(POL_BODY_INNER_W * 0.25)
  const sepW = Math.round(POL_BODY_INNER_W * 0.05)
  const valW = POL_BODY_INNER_W - labelW - sepW

  return new Table({
    width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
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
  const labelW = Math.round(POL_BODY_INNER_W * 0.10)
  const dateW = Math.round(POL_BODY_INNER_W * 0.30)
  const timeTzW = POL_BODY_INNER_W - labelW - dateW

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
    width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, dateW, timeTzW],
    rows: [
      new TableRow({ children: [makeCell('From'), makeCell(polFormatDateUS(inceptionDate)), makeCell(fmtTimeTz(inceptionTime, timezone))] }),
      new TableRow({ children: [makeCell('To'), makeCell(polFormatDateUS(expiryDate)), makeCell(fmtTimeTz(expiryTime, timezone))] })
    ]
  })]
}

function polBuildPeriodParagraphs(data: PolicyExportData): (Paragraph | Table)[] {
  const { inceptionDate, inceptionTime, expiryDate, expiryTime, timezone } = data.policy
  const labelW = Math.round(POL_BODY_INNER_W * 0.08)
  const dateW = Math.round(POL_BODY_INNER_W * 0.33)
  const timeW = POL_BODY_INNER_W - labelW - dateW
  const pCell = (text: string, w: number) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: polNoBorders(),
    children: [new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })]
  })
  return [new Table({
    width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, dateW, timeW],
    rows: [
      new TableRow({ children: [pCell('From', labelW), pCell(polFormatDateUS(inceptionDate), dateW), pCell(`${polFormatTime(inceptionTime)} ${timezone || ''}`.trim(), timeW)] }),
      new TableRow({ children: [pCell('To', labelW), pCell(polFormatDateUS(expiryDate), dateW), pCell(`${polFormatTime(expiryTime)} ${timezone || ''}`.trim(), timeW)] })
    ]
  })]
}

/** Period for endorsement DA/CA: from endorsement effective date to policy expiry */
function polBuildEndorsementPeriod(effectiveDate: string, data: PolicyExportData): (Paragraph | Table)[] {
  const { expiryDate, expiryTime, timezone } = data.policy
  const labelW = Math.round(POL_BODY_INNER_W * 0.08)
  const dateW = Math.round(POL_BODY_INNER_W * 0.33)
  const timeW = POL_BODY_INNER_W - labelW - dateW
  const pCell = (text: string, w: number) => new TableCell({
    width: { size: w, type: WidthType.DXA }, borders: polNoBorders(),
    children: [new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })]
  })
  return [new Table({
    width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, dateW, timeW],
    rows: [
      new TableRow({ children: [pCell('From', labelW), pCell(polFormatDateUS(effectiveDate), dateW), pCell(`${polFormatTime(data.policy.inceptionTime)} ${timezone || ''}`.trim(), timeW)] }),
      new TableRow({ children: [pCell('To', labelW), pCell(polFormatDateUS(expiryDate), dateW), pCell(`${polFormatTime(expiryTime)} ${timezone || ''}`.trim(), timeW)] })
    ]
  })]
}

function polBuildConditionsSection(data: PolicyExportData): (Paragraph | Table)[] {
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const content: (Paragraph | Table)[] = []

  if (typeCode === 'P') {
    const selectedClauses = data.allClauses.filter(c => data.selectedClauseIds.includes(c.id))
    if (polSt(data, 'conditionsIntro')) content.push(...polMp(polSt(data, 'conditionsIntro')))
    if (selectedClauses.length > 0) {
      const clauseRefW = Math.round(POL_BODY_INNER_W * 0.32)
      const clauseDescW = POL_BODY_INNER_W - clauseRefW
      content.push(new Table({
        width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
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
            ...(code ? [new TextRun({ text: decodeHtmlEntities(code) + ' ', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] : []),
            new TextRun({ text: decodeHtmlEntities(text), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
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
  // Use selectedAlternativeId, or auto-select first non-IV alt if only one exists
  let altId = data.policy.selectedAlternativeId || null
  if (!altId && dAlts.length === 1) altId = dAlts[0].id
  if (!altId && dAlts.length > 1) {
    // If there's a selected alternative stored on the quotation, use that
    const qAltId = (data.quotation as any).selectedAlternativeId
    if (qAltId && dAlts.some(a => a.id === qAltId)) altId = qAltId
  }
  const currency = data.quotation.premiumCurrency || 'USD'
  if (hc.length === 0 && ha.length === 0) return

  const condCol1W = Math.round(POL_BODY_INNER_W * 0.20)
  const condCol2W = POL_BODY_INNER_W - condCol1W

  // Resolve amount: check vesselAmounts for this vessel first, then the condition itself, then any sibling
  const policyVesselId = data.vessel?.id || null
  const resolveAmount = (qc: typeof hc[0]): number | null | undefined => {
    if (policyVesselId && qc.vesselAmounts && qc.vesselAmounts[policyVesselId] != null) {
      return qc.vesselAmounts[policyVesselId]
    }
    if (qc.amount != null) return qc.amount
    const sibling = hc.find(c => c.hullConditionId === qc.hullConditionId && c.id !== qc.id && c.amount != null)
    return sibling?.amount
  }

  const makeCondTable = (conds: typeof hc) => new Table({
    width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
    layout: TableLayoutType.FIXED,
    columnWidths: [condCol1W, condCol2W],
    rows: conds.map(qc => {
      const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
      if (!def) return null
      let text = qc.textOverride || def.text
      const amount = resolveAmount(qc)
      if (def.hasAmount && amount != null) {
        if (def.amountPlaceholder && text.includes(def.amountPlaceholder)) {
          const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          text = text.replace(new RegExp(escaped, 'g'), polFormatCurrency(amount, currency))
        } else if (!text.includes('{amount}')) {
          // Placeholder not present in the text — append the amount (mirrors the quotation
          // export) so conditions like "Deductible of" still show their value in the policy.
          text = text.trimEnd() + ' ' + polFormatCurrency(amount, currency)
        }
      }
      // Issue 3: resolve generic {currency} and {amount} placeholders
      text = text.replace(new RegExp(`\\{currency\\}\\s*${currency}`, 'gi'), currency).replace(/\{currency\}/g, currency).replace(/\{amount\}/g, amount != null ? polFormatCurrency(amount, currency) : '')
      return new TableRow({
        children: [
          new TableCell({ width: { size: condCol1W, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: decodeHtmlEntities(`Cl. ${def.conditionNumber}`), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: condCol2W, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: decodeHtmlEntities(text), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
        ]
      })
    }).filter(Boolean) as TableRow[]
  })

  // Helper: get which hull clause a condition belongs to
  const getCondClauseId = (qc: typeof hc[0]): string | null => {
    const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
    return def?.hullClauseId || null
  }
  const ivClauseId = data.quotation.ivClauseId || null

  // Dedup helper: merge alt-specific + null, prefer alt-specific
  const dedupConds = (conds: typeof hc) => {
    const seen = new Map<string, typeof hc[0]>()
    // Alt-specific first
    for (const c of conds.filter(x => x.alternativeId)) {
      seen.set(c.hullConditionId, c)
    }
    // Then null-scoped (only if not already present)
    for (const c of conds.filter(x => !x.alternativeId)) {
      if (!seen.has(c.hullConditionId)) seen.set(c.hullConditionId, c)
    }
    return Array.from(seen.values()).sort((a, b) => {
      const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
      const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
      return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
    })
  }

  const selectedAlt = altId ? dAlts.find(a => a.id === altId) : null
  if (selectedAlt) {
    // === Selected alternative: separate main clause from IV ===
    const mainClauseId = selectedAlt.hullClauseId
    const clause = data.hullClauses.find(c => c.id === mainClauseId)

    // Main clause conditions (not IV)
    const mainConds = hc.filter(qc => {
      const clauseId = getCondClauseId(qc)
      return clauseId === mainClauseId || (!clauseId && !ivClauseId)
    }).filter(qc => qc.alternativeId === selectedAlt.id || !qc.alternativeId)
    const dedupedMain = dedupConds(mainConds)

    // "Hull and Machinery" sub-heading when IV exists
    if (data.quotation.ivEnabled && ivClauseId) {
      content.push(polBupTight('Hull and Machinery'))
      content.push(polEmptyP())
    }
    if (clause) {
      content.push(polNpTight(decodeHtmlEntities(clause.description || clause.name)))
      content.push(polEmptyP())
    }
    if (dedupedMain.length > 0) content.push(makeCondTable(dedupedMain))

    // IV conditions (separate section)
    if (data.quotation.ivEnabled && ivClauseId) {
      const ivConds = hc.filter(qc => getCondClauseId(qc) === ivClauseId)
      const dedupedIV = dedupConds(ivConds)
      const ivClause = data.hullClauses.find(c => c.id === ivClauseId)
      content.push(polEmptyP())
      content.push(polBupTight('Increased Value'))
      content.push(polEmptyP())
      if (ivClause) {
        content.push(polNpTight(decodeHtmlEntities(ivClause.description || ivClause.name)))
        content.push(polEmptyP())
      }
      if (dedupedIV.length > 0) content.push(makeCondTable(dedupedIV))
    }
  } else if (dAlts.length > 1) {
    for (let i = 0; i < dAlts.length; i++) {
      const alt = dAlts[i]
      const clause = data.hullClauses.find(c => c.id === alt.hullClauseId)
      // Dedup conditions per alternative
      const ownConds = hc.filter(qc => qc.alternativeId === alt.id)
      const nullConds = hc.filter(qc => !qc.alternativeId)
      const altMerged = [...ownConds]
      for (const nc of nullConds) {
        if (!altMerged.some(c => c.hullConditionId === nc.hullConditionId)) altMerged.push(nc)
      }
      altMerged.sort((a, b) => {
        const da = data.allHullConditions.find(c => c.id === a.hullConditionId)
        const db = data.allHullConditions.find(c => c.id === b.hullConditionId)
        return parseFloat(da?.conditionNumber || '0') - parseFloat(db?.conditionNumber || '0')
      })
      content.push(polBupTight(`Alternative ${i + 1}`))
      content.push(polEmptyP())
      if (clause) { content.push(polNpTight(decodeHtmlEntities(clause.description || clause.name))); content.push(polEmptyP()) }
      if (altMerged.length > 0) content.push(makeCondTable(altMerged))
      content.push(polEmptyP())
    }
  } else {
    const singleAlt = dAlts[0]
    const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
    if (selectedClause) {
      content.push(polNpTight(decodeHtmlEntities(selectedClause.description || selectedClause.name)))
      content.push(polEmptyP())
    }
    if (hc.length > 0) content.push(makeCondTable(hc))
  }

  // Shared additional conditions ("Applicable to all sections")
  const filteredHa = altId
    ? (() => {
        const ownAddls = ha.filter(qa => qa.alternativeId === altId)
        const nullAddls = ha.filter(qa => !qa.alternativeId)
        const merged = [...ownAddls]
        for (const nc of nullAddls) {
          if (!merged.some(c => c.hullAdditionalConditionId === nc.hullAdditionalConditionId)) merged.push(nc)
        }
        return merged
      })()
    : ha

  // Active hull clauses for this policy — used to hide orphaned additional conditions
  // (linked only to clauses no active alternative/IV uses), mirroring the quotation export.
  const activeClauseIds: string[] = []
  if (selectedAlt) activeClauseIds.push(selectedAlt.hullClauseId)
  else if (dAlts.length > 1) activeClauseIds.push(...dAlts.map(a => a.hullClauseId))
  else {
    const sc = dAlts[0]?.hullClauseId || data.quotation.hullClauseId
    if (sc) activeClauseIds.push(sc)
  }
  if (data.quotation.ivEnabled && ivClauseId) activeClauseIds.push(ivClauseId)

  const visibleHa = filteredHa.filter(qa => {
    const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
    if (!def) return false
    const linked = def.hullClauseIds || []
    // No links = applies to all; links present = keep only if at least one matches an active clause
    return linked.length === 0 || linked.some(id => activeClauseIds.includes(id))
  })

  // Merge additional + custom conditions by the shared order_index so they interleave
  // as bullets (matching the quotation export), instead of a separate trailing block.
  const mergedAddl: { order: number; kind: 'addl' | 'custom'; qa?: any; cc?: any }[] = [
    ...visibleHa.map(qa => ({ order: (qa as any).order ?? 0, kind: 'addl' as const, qa })),
    ...data.hullCustomConditions.map(cc => ({ order: (cc as any).order ?? 0, kind: 'custom' as const, cc }))
  ].sort((a, b) => a.order - b.order)

  if (mergedAddl.length > 0) {
    if (selectedAlt && data.quotation.ivEnabled && ivClauseId) {
      content.push(polEmptyP())
      content.push(polBupTight('Applicable to all sections'))
    }
    content.push(polEmptyP())
    for (const it of mergedAddl) {
      if (it.kind === 'addl') {
        const qa = it.qa
        const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
        if (!def) continue
        let condText = qa.textOverride || def.text
        if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
          const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          condText = condText.replace(new RegExp(escaped, 'g'), polFormatCurrency(qa.amount, currency))
        }
        condText = condText.replace(/\{currency\}/g, currency).replace(/\{amount\}/g, qa.amount != null ? polFormatCurrency(qa.amount, currency) : '')
        content.push(...polMpBullet(condText))
      } else {
        const cc = it.cc
        content.push(...polMpBullet(cc.title ? `${cc.title} — ${cc.text}` : cc.text))
      }
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
    content.push(polBulletP(decodeHtmlEntities(resolveWarText(qc.textOverride || def.text))))
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
    // Resolve LOL amount: selected LOL option → selected PI alternative → quotation
    let resolvedLolAmount = data.quotation.limitOfLiabilityAmount
    let resolvedLolCurrency = data.quotation.limitOfLiabilityCurrency || 'USD'
    if (data.policy.selectedLolOptionId && data.lolOptions.length > 0) {
      const selLol = data.lolOptions.find(o => o.id === data.policy.selectedLolOptionId)
      if (selLol) {
        resolvedLolAmount = selLol.amount
        resolvedLolCurrency = selLol.currency || resolvedLolCurrency
      }
    } else if (data.piAlternatives.length > 0 && data.policy.selectedAlternativeId) {
      const selAlt = data.piAlternatives.find(a => a.id === data.policy.selectedAlternativeId)
      if (selAlt && (selAlt as any).lolAmount != null) {
        resolvedLolAmount = (selAlt as any).lolAmount
        if ((selAlt as any).lolCurrency) resolvedLolCurrency = (selAlt as any).lolCurrency
      }
    }

    let lolText = ''
    if (data.quotation.limitOfLiabilityText) {
      lolText = data.quotation.limitOfLiabilityText
        .replace(/\{amount\}/g, resolvedLolAmount != null ? polFormatAmountOnly(resolvedLolAmount) : '___')
        .replace(/\{currency\}/g, resolvedLolCurrency)
    } else if (polSt(data, 'limitOfLiabilityDefaultText') && resolvedLolAmount != null) {
      lolText = htmlToPlainText(polSt(data, 'limitOfLiabilityDefaultText'))
        .replace(/\{amount\}/g, polFormatAmountOnly(resolvedLolAmount))
        .replace(/\{currency\}/g, resolvedLolCurrency)
    } else if (resolvedLolAmount != null) {
      lolText = `${polFormatCurrency(resolvedLolAmount, resolvedLolCurrency)} all claims in the aggregate.`
    }
    // Handle sub-limits
    const subLimitLines = data.subLimits.map(sl =>
      sl.text.replace(/\{amount\}/g, polFormatAmountOnly(sl.amount)).replace(/\{currency\}/g, sl.currency || 'USD')
    )
    if (lolText.includes('{sub_limits}')) {
      if (subLimitLines.length > 0) {
        lolText = lolText.replace('{sub_limits}', subLimitLines.join('\n'))
      } else {
        lolText = lolText.replace(/\n*\{sub_limits\}\n*/g, '\n')
      }
    } else if (subLimitLines.length > 0) {
      lolText += '\n\n' + subLimitLines.join('\n')
      lolText += '\n\nUnder no circumstances is the Combined Single Limit detailed above to be exceeded.'
    }
    if (lolText) {
      for (const line of lolText.split('\n')) {
        if (line.trim()) content.push(polNp(line.trim()))
      }
    }
  } else if (typeCode === 'H') {
    const hmCurrency = data.quotation.agreedValueCurrency || 'USD'
    const hmItems = data.hullAgreedValueItems.filter(it => (it.section || 'hm') === 'hm')
    const ivItems = data.quotation.ivEnabled ? data.hullAgreedValueItems.filter(it => it.section === 'iv') : []
    // Use per-vessel agreed value if available, falling back to quotation-level
    const vesselAgreedValue = data.vessel?.agreedValue != null ? data.vessel.agreedValue : data.quotation.agreedValue
    const vesselIvValue = data.vessel?.ivValue != null ? data.vessel.ivValue : data.quotation.ivValue

    if (data.quotation.ivEnabled && vesselIvValue != null) {
      // Section A / Section B format
      if (vesselAgreedValue != null) {
        content.push(polBp(`Section A: ${polFormatCurrency(vesselAgreedValue, hmCurrency)} (${numberToWords(vesselAgreedValue, hmCurrency)})`))
      }
      if (hmItems.length > 0) {
        for (const it of hmItems) content.push(polNp(decodeHtmlEntities(it.text)))
      }
      content.push(polEmptyP())
      content.push(polBp(`Section B: ${polFormatCurrency(vesselIvValue, data.quotation.ivCurrency || hmCurrency)} (${numberToWords(vesselIvValue, data.quotation.ivCurrency || hmCurrency)})`))
      if (ivItems.length > 0) {
        for (const it of ivItems) content.push(polNp(decodeHtmlEntities(it.text)))
      }
    } else {
      // Single value format (no IV)
      if (vesselAgreedValue != null) {
        content.push(polBp(`${polFormatCurrency(vesselAgreedValue, hmCurrency)} (${numberToWords(vesselAgreedValue, hmCurrency)})`))
      }
      if (hmItems.length > 0) {
        content.push(polEmptyP())
        for (const it of hmItems) content.push(polNp(decodeHtmlEntities(it.text)))
      }
    }
  } else if (typeCode === 'W') {
    const wCurrency = data.quotation.agreedValueCurrency || 'USD'
    if (data.quotation.warExcessEnabled) {
      const vIsS2Only = Boolean(data.quotation.warSection2Only)

      const vesselAV = data.vessel?.agreedValue ?? data.quotation.agreedValue ?? 0
      const sec2Amt = (data.vessel as any)?.warExcessAmount ?? data.quotation.warExcessAmount ?? 0
      if (vIsS2Only) {
        // Section 2 only: "USD X in excess of USD Y primary war P&I risks"
        content.push(polNp(`${polFormatCurrency(sec2Amt, wCurrency)} in excess of ${polFormatCurrency(vesselAV, wCurrency)} primary war P&I risks.`))
      } else {
        content.push(polBp('Section 1'))
        content.push(polNpTight(`${polFormatCurrency(vesselAV, wCurrency)} (${numberToWords(vesselAV, wCurrency)})`))
        content.push(polEmptyP())
        content.push(polBp('Section 2'))
        content.push(polNpTight(`${polFormatCurrency(sec2Amt, wCurrency)} (${numberToWords(sec2Amt, wCurrency)})`))
      }
      if (data.quotation.warCombinedLimitText) {
        content.push(polEmptyP())
        content.push(polNp(data.quotation.warCombinedLimitText.replace(/\{amount\}/g, polFormatCurrency(sec2Amt, wCurrency))))
      }
    } else {
      const warAV = data.vessel?.agreedValue ?? data.quotation.agreedValue
      if (warAV != null) {
        content.push(polBp(`${polFormatCurrency(warAV, wCurrency)} (${numberToWords(warAV, wCurrency)})`))
      }
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

// Section-order key for the generic value/limit section (mirrors quotationSettingsConstants keys)
function polGetValueSectionKey(typeCode: string | undefined): string {
  switch (typeCode) {
    case 'H': return 'agreedValue'
    case 'W': return 'sumInsured'
    case 'C': return 'insuredValue'
    default: return 'liability'
  }
}

// Section-order key for the conditions section, per type
function polGetConditionsKey(typeCode: string | undefined): string {
  switch (typeCode) {
    case 'H': return 'hullConditions'
    case 'W': return 'warConditions'
    case 'C': return 'cargoConditions'
    default: return 'conditions'
  }
}

// Resolve the section order for a policy: per-policy saved order → policy-settings default
// (per type) → hardcoded default. Any missing hardcoded keys and custom sections are appended.
function resolvePolicySectionOrder(data: PolicyExportData, settingsDefault?: string[]): string[] {
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const hardcoded = getDefaultSectionOrder(typeCode)
  const def = (settingsDefault && settingsDefault.length > 0) ? settingsDefault : hardcoded
  const saved = (data.policy as any).sectionOrder
  const order = Array.isArray(saved) && saved.length > 0 ? [...saved] : [...def]
  for (const k of hardcoded) if (!order.includes(k)) order.push(k)
  for (const cs of data.customSections) { const key = `custom:${cs.id}`; if (!order.includes(key)) order.push(key) }
  return order
}

function polBuildTradingSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []
  const wq = data.quotation
  const excCountries = data.excludedCountries.filter(c => c.listType === 'excluded')
  const ddqCountries = data.excludedCountries.filter(c => c.listType === 'ddq')

  // Per-vessel trading intro: find the intro scoped to this vessel, falling back to quotation-level intro
  const policyVesselQvId = data.vessel?.id || null
  const perVesselIntro = policyVesselQvId
    ? (data.tradingIntros || []).find(ti => ti.vesselScope && ti.vesselScope.includes(policyVesselQvId))
    : null
  const effectiveIntro = perVesselIntro ? perVesselIntro.text : wq.tradingWarrantyIntro
  if (effectiveIntro) content.push(...polMpUniform(effectiveIntro))
  if (wq.tradingCustomMode && wq.tradingCustomWording) {
    content.push(polEmptyP())
    content.push(...polMp(wq.tradingCustomWording))
  } else {
    if (wq.tradingCustomText) { content.push(polEmptyP()); content.push(...polMpTight(wq.tradingCustomText)) }
    if (wq.tradingShowExcluded !== false && excCountries.length > 0) { content.push(polEmptyP()); content.push(polNpTight('Excluding ' + excCountries.map(c => c.name).join(', ') + '.')) }
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
    if (w) content.push(polBulletP(decodeHtmlEntities(w.text)))
  }
  for (const cw of [...data.customWarranties].sort((a, b) => a.order - b.order)) {
    content.push(polBulletP(decodeHtmlEntities(cw.text)))
  }
  if (data.quotation.quotationTypeCode !== 'W') {
    for (const sw of data.surveyWarranties) content.push(polBulletP(decodeHtmlEntities(sw.text)))
  }
  if (polSt(data, 'warrantiesAdditionalText')) { content.push(polEmptyP()); content.push(...polMpTight(polSt(data, 'warrantiesAdditionalText'))) }
  if (polSt(data, 'warrantiesBreach')) { content.push(polEmptyP()); content.push(...polMpTight(polSt(data, 'warrantiesBreach'))) }

  // H&M warranty NOTE — from warrantiesNote section text or hardcoded default
  if (data.quotation.quotationTypeCode === 'H') {
    const noteText = polSt(data, 'warrantiesNote')
    const defaultNote = 'NOTE: The Insured\'s attention is drawn to the provisions of the H&M Terms and Conditions, which also include Warranties.'
    content.push(polEmptyP())
    if (noteText) {
      content.push(...polMp(noteText))
    } else {
      content.push(polNp(defaultNote))
    }
  }

  return content
}

function polBuildDeductiblesSection(data: PolicyExportData): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []
  const dedAmtW = Math.round(POL_BODY_INNER_W * 0.20)
  const dedDescW = POL_BODY_INNER_W - dedAmtW

  if (data.deductibles.length > 0) {
    const policyVesselId = data.vessel?.id || null
    const dedRows: TableRow[] = []
    for (const d of data.deductibles) {
      const resolvedAmount = (policyVesselId && d.vesselAmounts && d.vesselAmounts[policyVesselId] != null)
        ? d.vesselAmounts[policyVesselId]
        : d.amount
      const replDed = (text: string, cur: string, amt: number | undefined | null) => { const a = amt != null ? polFormatCurrency(amt, cur) : '___'; return text.replace(/\{currency\}\s*\{amount\}/g, a).replace(/\{currency\}/g, cur).replace(/\{amount\}/g, a) }
      const mainDesc = replDed(d.description, d.currency, d.secondaryAmount)
      dedRows.push(new TableRow({
        children: [
          new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: polFormatCurrency(resolvedAmount, d.currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: mainDesc, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
        ]
      }))
      if (d.secondaryDescription) {
        const secDesc = replDed(d.secondaryDescription, d.currency, d.secondaryAmount)
        dedRows.push(new TableRow({
          children: [
            new TableCell({ width: { size: dedAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: d.secondaryAmount != null ? polFormatCurrency(d.secondaryAmount, d.currency) : '', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: dedDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ children: [new TextRun({ text: secDesc, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
          ]
        }))
      }
    }
    content.push(new Table({
      width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS,
      layout: TableLayoutType.FIXED,
      columnWidths: [dedAmtW, dedDescW],
      rows: dedRows
    }))
  }
  // Aggregate clause ("When one incident gives rise to...") comes immediately after the
  // deductibles table, before any text deductibles (matches the quotation export order).
  const dedAggText = data.quotation.deductibleAggregateEnabled
    ? (data.quotation.deductibleAggregateText || (polSt(data, 'deductiblesAggregate') ? stripHtml(polSt(data, 'deductiblesAggregate')) : ''))
    : ''
  if (dedAggText) { content.push(polEmptyP()); content.push(...polMp(dedAggText)) }

  if (data.textDeductibles.length > 0) {
    data.textDeductibles.forEach((td, i) => {
      content.push(...(i === data.textDeductibles.length - 1 ? polMpTight(td.text) : polMp(td.text)))
    })
  }

  if (polSt(data, 'deductiblesAdditionalText')) { content.push(polEmptyP()); content.push(...polMpTight(polSt(data, 'deductiblesAdditionalText'))) }

  return content
}

async function polBuildPremiumPaymentSection(data: PolicyExportData): Promise<(Paragraph | Table)[]> {
  const content: (Paragraph | Table)[] = []
  const { instalments } = data
  const numInst = instalments.length || 1
  const currency = data.quotation.premiumCurrency || 'USD'
  const wq = data.quotation
  // Non-refundable: policy override wins ('none' = explicitly none; NULL = inherit from quotation)
  const polNr = (data.policy as any).nonRefundableType
  const nrType = polNr != null ? (polNr === 'none' ? null : polNr) : wq.nonRefundableType
  const nrPct = (data.policy as any).nonRefundablePercent != null ? (data.policy as any).nonRefundablePercent : wq.nonRefundablePercent
  // Priority: instalment sum (most accurate) → policy premium → quotation premium
  const instalmentSum = instalments.reduce((sum, i) => sum + ((i as any).premiumAmount || (i as any).amount || 0), 0)
  const totalPremium = instalmentSum > 0 ? instalmentSum : (data.policy.premiumAmount != null && data.policy.premiumAmount > 0 ? data.policy.premiumAmount : (wq.premiumAmount || 0))
  const timezone = data.policy.timezone || ''

  // Load policy export settings
  let premIntroTemplate = ''
  let premIntroSingleTemplate = ''
  try {
    const s = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (s) {
      const p = JSON.parse(s)
      if (p.premiumIntroText) premIntroTemplate = p.premiumIntroText
      if (p.premiumIntroSingleText) premIntroSingleTemplate = p.premiumIntroSingleText
    }
  } catch { /* default */ }

  if (numInst === 1 && instalments.length === 1) {
    // Single instalment: "Premium of {currency} {amount} shall be payable on {date}..."
    const singleTemplate = premIntroSingleTemplate || 'Premium of {currency} {amount} shall be payable on {date} as per attached debit note, at {time} {timezone}, time being of the essence.'
    const singleIntro = singleTemplate
      .replace(/\{currency\}/g, currency)
      .replace(/\{amount\}/g, polFormatCurrency(totalPremium, currency).replace(`${currency} `, ''))
      .replace(/\{date\}/g, polFormatDateUS(instalments[0].dueDate))
      .replace(/\{time\}/g, polFormatTime(data.policy.inceptionTime))
      .replace(/\{timezone\}/g, timezone)
    content.push(polNpTight(singleIntro))
    content.push(polEmptyP())

    // Non-refundable text for single instalment
    if (nrType === 'first_instalment' || (instalments[0].isNonRefundable)) {
      content.push(polNpTight('Non-refundable in case of cancellation, whether before or after inception.'))
      content.push(polEmptyP())
    }
    if (nrType === 'percentage' && nrPct) {
      const nrText = stripHtml((polSt(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable in case of cancellation, whether before or after inception.').replace(/\{percent\}/g, polFmtPct(nrPct)))
      if (nrText) { content.push(polNpTight(nrText)); content.push(polEmptyP()) }
    }
  } else {
    // Multiple instalments
    const multiTemplate = premIntroTemplate || 'Premium {currency} {amount} shall be payable in {instalments} Instalments on the following dates, at {time} {timezone}, time being of the essence:'
    const premIntro = multiTemplate
      .replace(/\{currency\}/g, currency)
      .replace(/\{amount\}/g, polFormatCurrency(totalPremium, currency).replace(`${currency} `, ''))
      .replace(/\{instalments\}/g, String(numInst))
      .replace(/\{time\}/g, polFormatTime(data.policy.inceptionTime))
      .replace(/\{timezone\}/g, timezone)
    content.push(polNpTight(premIntro))
    content.push(polEmptyP())

    // Instalment lines
    if (instalments.length > 0) {
      const isFirstInstNr = nrType === 'first_instalment'
      instalments.forEach((inst) => {
        let line = `${polOrdinal(inst.instalmentNumber)} Instalment due ${polFormatDateUS(inst.dueDate)}`
        if (inst.isNonRefundable || (isFirstInstNr && inst.instalmentNumber === 1)) {
          line += ' (non-refundable in case of cancellation, whether before or after inception)'
        }
        // Instalments are a tight list — no inter-line spacing (polEmptyP below separates
        // the whole group from the next block).
        content.push(polNpTight(line))
      })
      content.push(polEmptyP())

      if (nrType === 'percentage' && nrPct) {
        const nrText = stripHtml((polSt(data, 'nonRefundablePercentText') || '{percent}% of premium is non-refundable in case of cancellation, whether before or after inception.').replace(/\{percent\}/g, polFmtPct(nrPct)))
        if (nrText) { content.push(polNpTight(nrText)); content.push(polEmptyP()) }
      }
    }
  }

  // 2b. Outstanding premium notice — policy override (set in the conversion wizard) wins over the quotation
  const outstandingEnabled = (data.policy as any).outstandingPremiumEnabled != null
    ? (data.policy as any).outstandingPremiumEnabled
    : wq.outstandingPremiumEnabled
  const outstandingText = (data.policy as any).outstandingPremiumText != null
    ? (data.policy as any).outstandingPremiumText
    : wq.outstandingPremiumText
  if (outstandingEnabled && outstandingText) {
    content.push(new Paragraph({
      spacing: { after: 0, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({
        text: outstandingText,
        size: POL_FONT_SIZE, font: 'Arial', color: '000000',
        bold: wq.outstandingPremiumBold !== false,
        underline: wq.outstandingPremiumUnderline !== false ? {} : undefined
      })]
    }))
    content.push(polEmptyP())
  }

  // 2c. Full premium in case of loss
  if (wq.fullPremiumLossEnabled && wq.fullPremiumLossText) {
    content.push(polNpTight(wq.fullPremiumLossText))
    content.push(polEmptyP())
  }

  // 3. Additional premium text
  if (wq.premiumAdditionalText) { content.push(...polMpTight(wq.premiumAdditionalText)); content.push(polEmptyP()) }

  // 4. Condition precedent text
  if (polSt(data, 'premiumCondition')) { content.push(...polMpTight(polSt(data, 'premiumCondition'))); content.push(polEmptyP()) }

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

export async function exportPolicyDocx(policyId: string, totalPages?: number, includeTC?: boolean): Promise<void> {
  await loadPolicyFontSize()
  const data = await loadFrozenExportData(policyId)
  applyFrozenFontSize(data)
  const typeCode = data.quotation.quotationTypeCode || 'P'

  // Resolve rich-text (html) T&C to append inline as a new section (docx T&C is handled by the merge path)
  let tcHtml: string | null = null
  if (includeTC) {
    try {
      const tcTpl = await window.api.tcGetTemplate(typeCode) as any
      if (tcTpl && !tcTpl.error && tcTpl.kind === 'html' && tcTpl.contentHtml) tcHtml = tcTpl.contentHtml
    } catch { /* no T&C */ }
  }

  const children: (Paragraph | Table)[] = []

  // Logo — frozen path from the snapshot (falls back to live if an older snapshot lacks it)
  const logoPath = data.frozen?.logoPath !== undefined ? data.frozen.logoPath : await window.api.piGetQuotationLogoPath()
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

  // Opening Clause: frozen on the policy at conversion time (per-policy override) →
  // hardcoded fallback for legacy policies that predate the capture. NOT read from live
  // settings here, so an old policy always exports the wording in effect when it was issued.
  const openingClause = data.policy.openingClause || polGetDefaultOpeningClause(typeCode)
  if (openingClause) {
    children.push(...polMpTight(openingClause))
    children.push(polEmptyP())
  }

  // THE SCHEDULE header (Hull/War only)
  if (typeCode === 'H' || typeCode === 'W') {
    children.push(polCenteredPTight('THE SCHEDULE', true))
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
            children: [new TextRun({ text: title.toUpperCase(), bold: true, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
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

  // Collect each section with its order-key; emitted in the configured section order below.
  const secList: { key: string; row: TableRow }[] = []
  const addRow = (key: string, row: TableRow) => secList.push({ key, row })

  // INSURED
  const insuredContent = polBuildInsuredSection(data)
  if (insuredContent.length > 0) addRow('insured', makeRow('Insured', insuredContent))

  // INSURED VESSEL
  addRow('vessel', makeRow('Insured Vessel', [polBuildVesselTable(data)]))

  // VALUE / LIMIT — Hull with IV gets split into Interest + Agreed Insured Value
  {
    // Use per-vessel agreed value if available, falling back to quotation-level
    const polVesselAv = data.vessel?.agreedValue != null ? data.vessel.agreedValue : data.quotation.agreedValue
    const polVesselIv = data.vessel?.ivValue != null ? data.vessel.ivValue : data.quotation.ivValue
    if (typeCode === 'H' && data.quotation.ivEnabled && polVesselIv != null) {
      const hmItems = data.hullAgreedValueItems.filter(it => (it.section || 'hm') === 'hm')
      const ivItems = data.hullAgreedValueItems.filter(it => it.section === 'iv')
      // Interest section (text descriptions)
      if (hmItems.length > 0 || ivItems.length > 0) {
        const intContent: (Paragraph | Table)[] = []
        if (hmItems.length > 0) intContent.push(polNp('A) ' + hmItems.map(it => decodeHtmlEntities(it.text)).join('\n')))
        if (ivItems.length > 0) intContent.push(polNp('B) ' + ivItems.map(it => decodeHtmlEntities(it.text)).join('\n')))
        addRow('interest', makeRow('Interest', intContent))
      }
      // Agreed Insured Value (amounts) — Section A / Section B / Total (bold), Total in words
      const avContent: (Paragraph | Table)[] = []
      const hmCurrency = data.quotation.agreedValueCurrency || 'USD'
      const ivCurrency = data.quotation.ivCurrency || hmCurrency
      if (ivCurrency === hmCurrency) {
        const avSections: { label: string; amount: number }[] = []
        if (polVesselAv != null) avSections.push({ label: 'Section A', amount: polVesselAv })
        avSections.push({ label: 'Section B', amount: polVesselIv })
        avContent.push(...polBuildAmountBreakdown(avSections, 'Total', (polVesselAv || 0) + polVesselIv, hmCurrency))
      } else {
        // Mixed currencies — a combined total isn't meaningful; keep the per-section lines
        if (polVesselAv != null) avContent.push(polNp(`Section A: ${polFormatCurrency(polVesselAv, hmCurrency)} (${numberToWords(polVesselAv, hmCurrency)})`))
        avContent.push(polNp(`Section B: ${polFormatCurrency(polVesselIv, ivCurrency)} (${numberToWords(polVesselIv, ivCurrency)})`))
      }
      addRow('agreedValue', makeRow('Agreed Insured\nValue', avContent))
    } else if (typeCode === 'W' && data.quotation.warExcessEnabled) {
      const polIsS2Only = Boolean(data.quotation.warSection2Only)

      // War P&I Excess: Interest section
      const intContent: (Paragraph | Table)[] = []
      const sec1Text = data.quotation.warSection1Text || data.warSettings?.section1Text || 'Hull, Material, Machinery and Outfit Including War Protection and Indemnity and War Crew Liability up to Sum Insured'
      const sec2Text = data.quotation.warSection2Text || data.warSettings?.section2Text || 'War P&I in excess of Hull value'
      if (polIsS2Only) {
        intContent.push(polNp(sec2Text))
      } else {
        intContent.push(polBp('Section 1'))
        intContent.push(polNpTight(sec1Text))
        intContent.push(polEmptyP())
        intContent.push(polBp('Section 2'))
        intContent.push(polNp(sec2Text))
      }
      if (intContent.length > 0) addRow('interest', makeRow('Interest', intContent))
      const valueContent = polBuildValueSection(data)
      if (valueContent.length > 0) addRow('sumInsured', makeRow('Sum Insured / Limits', valueContent))
    } else {
      const valueContent = polBuildValueSection(data)
      if (valueContent.length > 0) addRow(polGetValueSectionKey(typeCode), makeRow(polGetValueSectionTitle(typeCode), valueContent))
    }
  }

  // PERIOD
  const periodContent = polBuildPeriodSection(data)
  if (periodContent.length > 0) addRow('period', makeRow('Period', periodContent))

  // CONDITIONS
  const conditionsContent = polBuildConditionsSection(data)
  if (conditionsContent.length > 0) addRow(polGetConditionsKey(typeCode), makeRow('Conditions', conditionsContent))

  // CLASSIFICATION — shown in vessel table, not as separate section

  // TRADING WARRANTY
  if (typeCode !== 'W') {
    const tradingContent = polBuildTradingSection(data)
    if (tradingContent.length > 0) addRow('trading', makeRow('Trading Warranty', tradingContent))
  } else {
    // War: use per-vessel intro or quotation-level intro
    const warVesselQvId = data.vessel?.id || null
    const warPerVIntro = warVesselQvId
      ? (data.tradingIntros || []).find(ti => ti.vesselScope && ti.vesselScope.includes(warVesselQvId))
      : null
    const warEffIntro = warPerVIntro ? warPerVIntro.text : data.quotation.tradingWarrantyIntro
    if (warEffIntro) addRow('warTrading', makeRow('Trading Warranty', polMpUniform(warEffIntro)))
  }

  // WARRANTIES
  const warrantiesContent = polBuildWarrantiesSection(data)
  if (warrantiesContent.length > 0) addRow('warranties', makeRow('Warranties', warrantiesContent))

  // DEDUCTIBLES (P&I only)
  if (typeCode === 'P') {
    const dedContent = polBuildDeductiblesSection(data)
    if (dedContent.length > 0) addRow('deductibles', makeRow('Deductibles', dedContent))
  }

  // SANCTIONS
  const sanctionsText = polGetSanctionsText(data)
  if (sanctionsText) addRow('sanctions', makeRow('Sanction Limitation and Exclusion Clause', polMp(decodeHtmlEntities(sanctionsText))))

  // EXCLUSIONS
  const exclusionsContent: Paragraph[] = []
  const hasAltExclusions = data.piAlternatives.length > 0
  const firstAltId = data.piAlternatives.length > 0 ? data.piAlternatives[0].id : null
  for (const se of data.selectedExclusions) {
    if (hasAltExclusions && se.alternativeId && se.alternativeId !== firstAltId) continue
    if (se.customText) exclusionsContent.push(polBulletP(decodeHtmlEntities(se.customText)))
    else if (se.piExclusionId) {
      const found = data.allExclusions.find(e => e.id === se.piExclusionId)
      if (found) exclusionsContent.push(polBulletP(decodeHtmlEntities(found.text)))
    }
  }
  for (const ce of data.customExclusions) {
    if (hasAltExclusions && (ce as any).alternativeId && (ce as any).alternativeId !== firstAltId) continue
    exclusionsContent.push(polBulletP(decodeHtmlEntities(ce.text)))
  }
  if (exclusionsContent.length > 0) addRow('exclusions', makeRow('Exclusions', exclusionsContent))

  // CUSTOM SECTIONS
  for (const cs of data.customSections) {
    if (cs.text) {
      addRow(`custom:${cs.id}`, makeRow(cs.title || 'Additional', polMp(cs.text)))
    }
  }

  // SUBJECTIVITIES
  if (data.subjectivities.length > 0) {
    const subjContent: (Paragraph | Table)[] = []
    const polSubjIntro = polSt(data, 'subjectivitiesIntro')
    if (polSubjIntro) {
      const psDays = data.subjectivityDays ?? 7
      const psTiming = psDays === 0 ? 'prior inception' : `within ${psDays} days`
      let psIntroFixed = polSubjIntro
      if (psIntroFixed.includes('{subjectivity_days}')) {
        psIntroFixed = psIntroFixed.replace(/\{subjectivity_days\}/g, psTiming)
      } else {
        psIntroFixed = psIntroFixed.replace(/within \d+ days?\s*(of|prior)?\s*inception/i, psTiming)
                                   .replace(/prior\s+inception/i, psTiming)
      }
      subjContent.push(...polMp(psIntroFixed))
    }
    for (const sub of data.subjectivities) subjContent.push(polBulletP(decodeHtmlEntities(sub.text)))
    if (polSt(data, 'subjectivitiesNote')) { subjContent.push(polEmptyP()); subjContent.push(...polMp(polSt(data, 'subjectivitiesNote'))) }
    addRow('subjectivities', makeRow('Subjectivities', subjContent))
  }

  // NCB (No Claims Bonus) — skip if this vessel is excluded from NCB
  if (data.quotation.ncbEnabled && data.quotation.ncbText && !data.vessel?.ncbExcluded) {
    const ncbContent: (Paragraph | Table)[] = []
    let ncbText = decodeHtmlEntities(htmlToPlainText(data.quotation.ncbText))
    const ncbPct = data.quotation.ncbDiscountPercent
    const ncbAmt = data.quotation.ncbDiscountAmount
    if (ncbPct != null) ncbText = ncbText.replace(/\{ncb_percent\}/g, String(ncbPct))
    if (ncbAmt != null) {
      ncbText = ncbText.replace(/\{ncb_amount\}/g, polFormatAmountOnly(ncbAmt))
    } else if (ncbPct != null) {
      // If discount is percentage-based, resolve {ncb_amount} to "X%"
      ncbText = ncbText.replace(/\{ncb_amount\}/g, `${ncbPct}%`)
    }
    ncbText = ncbText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD')
    ncbContent.push(...ncbText.split('\n').filter(l => l.trim()).map(l => polNp(l)))
    addRow('ncb', makeRow('No Claims\nBonus (NCB)', ncbContent))
  }

  // UPCC (Upfront Continuity Credit) — skip if this vessel is excluded from UPCC
  if (data.quotation.upccEnabled && data.quotation.upccText && !data.vessel?.upccExcluded) {
    const upccContent: (Paragraph | Table)[] = []
    let upccText = decodeHtmlEntities(htmlToPlainText(data.quotation.upccText))
    if (data.quotation.upccDiscountPercent != null) upccText = upccText.replace(/\{upcc_percent\}/g, String(data.quotation.upccDiscountPercent))
    if (data.quotation.upccDiscountAmount != null) upccText = upccText.replace(/\{upcc_amount\}/g, polFormatAmountOnly(data.quotation.upccDiscountAmount))
    upccText = upccText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD')
    upccContent.push(...upccText.split('\n').filter(l => l.trim()).map(l => polNp(l)))
    addRow('upcc', makeRow('Upfront\nContinuity\nCredit (UPCC)', upccContent))
  }

  // PREMIUM PAYMENT
  const premiumContent = await polBuildPremiumPaymentSection(data)
  if (premiumContent.length > 0) addRow('premium', makeRow('Premium\nPayment\nCondition\nPrecedent', premiumContent))

  // Emit sections in the configured order. Any section whose key isn't in the configured
  // order (e.g. a War policy's sanctions section) is anchored right after its original
  // preceding section, so it keeps its natural position instead of jumping to the end.
  const policySecDefault: string[] = data.frozen?.sectionOrderDefault || []
  const secOrder = resolvePolicySectionOrder(data, policySecDefault)
  const inOrder = new Set(secOrder)
  let lastKnownIdx = -1
  for (const { key } of secList) {
    if (inOrder.has(key)) { lastKnownIdx = secOrder.indexOf(key); continue }
    const insertAt = lastKnownIdx + 1
    secOrder.splice(insertAt, 0, key)
    inOrder.add(key)
    lastKnownIdx = insertAt
  }
  const secIndex = (k: string) => secOrder.indexOf(k)
  const rows = secList
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (secIndex(a.s.key) - secIndex(b.s.key)) || (a.i - b.i))
    .map(x => x.s.row)

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
  children.push(polNpTight('The said Vessel is covered subject to the terms, clauses, conditions, and warranties as herein set out.'))
  children.push(polEmptyP())

  // Important Notice — make type-aware by replacing P&I references for other types
  let importantNotice = data.policy.importantNotice || polSt(data, 'importantNotice')
  if (importantNotice) {
    // Replace type-specific references if not P&I
    if (typeCode === 'H') {
      importantNotice = importantNotice.replace(/P&I Terms and Conditions/gi, 'H&M Terms and Conditions')
        .replace(/P&I terms and conditions/gi, 'H&M Terms and Conditions')
    } else if (typeCode === 'W') {
      importantNotice = importantNotice.replace(/P&I Terms and Conditions/gi, 'War Terms and Conditions')
        .replace(/P&I terms and conditions/gi, 'War Terms and Conditions')
    }
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

  // Resolve cancel/replace text for both body and footer
  let cancelReplaceResolved = ''
  if ((data.policy.revisionNumber > 0 && data.policy.previousPolicyNumber) || data.policy.cancelReplaceText) {
    cancelReplaceResolved = data.policy.cancelReplaceText || ''
    if (!cancelReplaceResolved && data.policy.previousPolicyNumber) {
      cancelReplaceResolved = `This policy ${data.policy.policyNumber} cancels and replaces policy ${data.policy.previousPolicyNumber}`
      if (data.policy.previousPolicyDate) cancelReplaceResolved += ` dated ${polFormatDateUS(data.policy.previousPolicyDate)}`
    }
  }

  // QR Verification — P&I only, and only when enabled for this policy (wizard toggle, default off)
  try {
    const qrEnabled = (data.policy as any).qrEnabled === true
    const qrBase = (data.quotation.quotationTypeCode === 'P' && qrEnabled) ? (data.frozen?.qrBase || null) : null
    if (qrBase && data.vesselInfo.imo) {
      const qrFullUrl = `${qrBase}${data.vesselInfo.imo}`
      // Generate QR code as PNG buffer
      try {
        const QRCode = await import('qrcode')
        const qrDataUrl = await QRCode.toDataURL(qrFullUrl, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '')
        const qrBuffer = Uint8Array.from(atob(qrBase64), c => c.charCodeAt(0))
        children.push(polEmptyP())
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 40 },
          children: [new ImageRun({ data: qrBuffer, transformation: { width: 80, height: 80 }, type: 'png' })]
        }))
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [new TextRun({ text: qrFullUrl, size: POL_FONT_SIZE - 4, font: 'Arial', color: '666666', italics: true })]
        }))
        children.push(polEmptyP())
      } catch {
        // Fallback: just show URL text if QR generation fails
        children.push(polEmptyP())
        children.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 60 },
          children: [
            new TextRun({ text: 'Verify: ', size: POL_FONT_SIZE - 2, font: 'Arial', color: '666666', italics: true }),
            new TextRun({ text: qrFullUrl, size: POL_FONT_SIZE - 2, font: 'Arial', color: '0066CC', italics: true })
          ]
        }))
        children.push(polEmptyP())
      }
    }
  } catch { /* no QR url configured */ }

  // Closing
  const closingCity = data.policy.closingCity || 'Beirut'
  const closingDate = polFormatDateUS(data.policy.createdAt)
  children.push(polNp(`Drawn up in Duplicate, in ${closingCity} on ${closingDate}`))
  children.push(polEmptyP())
  children.push(polEmptyP())

  // Signature block — use snapshot if available, otherwise load live
  let signatureImageRun: ImageRun | null = null
  let signatureFooterRun: ImageRun | null = null
  let sigBuf: Uint8Array | null = null
  try {
    const snapshotSig = (data as any).signatureSnapshot
    let imageData: any = null
    if (snapshotSig && snapshotSig.imageData) {
      imageData = snapshotSig.imageData
    } else {
      const sigData = await window.api.policyGetSignature(policyId)
      if (sigData) imageData = sigData.imageData
    }
    if (imageData) {
      const arr = Array.isArray(imageData) ? imageData : (imageData.data || Object.values(imageData))
      sigBuf = new Uint8Array(arr)
      signatureImageRun = new ImageRun({
        data: sigBuf,
        transformation: { width: 150, height: 75 },
        type: 'png'
      })
      signatureFooterRun = new ImageRun({
        data: sigBuf,
        transformation: { width: 120, height: 60 },
        type: 'png'
      })
    }
  } catch { /* no signature */ }

  const sigLabelW = Math.round(POL_CONTENT_W * 0.45)
  const sigGapW = POL_CONTENT_W - 2 * sigLabelW

  // Build insurer cell children: signature image (if present) + label
  const insurerCellChildren: Paragraph[] = []
  if (signatureImageRun) {
    insurerCellChildren.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 40 },
      children: [signatureImageRun]
    }))
  }
  insurerCellChildren.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'THE INSURER', size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  children.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [sigLabelW, sigGapW, sigLabelW],
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: sigLabelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 80, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: 'THE INSURED', size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] }),
        new TableCell({ width: { size: sigGapW, type: WidthType.DXA }, borders: polNoBorders(), children: [polEmptyP()] }),
        new TableCell({ width: { size: sigLabelW, type: WidthType.DXA }, borders: polNoBorders(), children: insurerCellChildren })
      ]
    })]
  }))

  // (cancelReplaceResolved declared above, before body content)

  // Build header — company details (Times New Roman) + policy number & vessel (Arial)
  const headerHtml = polSt(data, 'docHeader')
  const headerSpacing = (data.sectionTexts as any).docHeaderSpacing || undefined
  const headerParas = headerHtml
    ? parseHtmlToParagraphs(headerHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: headerSpacing, spacingAfter: 0 })
    : []
  // Load policy export settings
  let footerText = ''
  let configTotalPages = totalPages
  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull Cover',
    W: 'War Risk Certificate'
  }
  let pageCountMap: Record<string, Record<string, number>> = {}
  let tcFooterText = ''
  let tcTitleLine = '{type} Cover {number}'
  let tcShowPageNumbers = true
  try {
    const settings = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.footerText) footerText = parsed.footerText
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
      if (parsed.pageCountMap) pageCountMap = parsed.pageCountMap
      if (parsed.tcFooterText != null) tcFooterText = parsed.tcFooterText
      if (parsed.tcTitleLine != null && parsed.tcTitleLine !== '') tcTitleLine = parsed.tcTitleLine
      if (parsed.tcShowPageNumbers != null) tcShowPageNumbers = parsed.tcShowPageNumbers !== false
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

  // Add policy title (configurable per type)
  const headerTitle = (headerTitles[typeCode] || 'Certificate').toUpperCase()
  const vesselName = data.vesselInfo?.name || ''
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [
      new TextRun({ text: `${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true, underline: {} })
    ]
  }))
  if (vesselName) {
    headerParas.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: `M/V ${vesselName.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true, underline: {} })
      ]
    }))
  }
  // Add spacing after vessel name line before header ends
  headerParas.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
  const defaultHeader = new Header({ children: headerParas.length > 0 ? headerParas : [polEmptyP()] })

  const footerChildren: (Paragraph | Table)[] = []
  // Cancel and replace on every page (in footer) — uses cancelReplaceResolved from above
  if (cancelReplaceResolved) {
    footerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 20 },
      children: [new TextRun({ text: cancelReplaceResolved, size: 16, font: 'Arial', color: '000000', italics: true })]
    }))
  }
  // Page number paragraph (consistent styling — all runs use identical rPr)
  const pnStyle = { size: 16, font: 'Arial', color: '999999', bold: false, italics: false } as const
  const pageNumPara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 0 },
    children: [
      new TextRun({ text: 'Page ', ...pnStyle }),
      new TextRun({ children: [PageNumber.CURRENT], ...pnStyle }),
      new TextRun({ text: ' of ', ...pnStyle }),
      ...(configTotalPages
        ? [new TextRun({ text: String(configTotalPages), ...pnStyle })]
        : [new TextRun({ children: [PageNumber.TOTAL_PAGES], ...pnStyle })])
    ]
  })

  // Parse footer text lines
  const footerTextLines: string[] = []
  if (footerText) {
    const plainFooter = footerText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    for (const line of plainFooter.split('\n')) {
      if (line.trim()) footerTextLines.push(line.trim())
    }
  }

  // Footer layout: Row 1 = 2-column table (left=stamps text, right=signature), Row 2 = centered page number
  if (signatureFooterRun || footerTextLines.length > 0) {
    const footerW = POL_CONTENT_W || 9000
    const leftW = Math.round(footerW * 0.75)
    const rightW = footerW - leftW
    // Left column: stamps/registration text
    const leftParas: Paragraph[] = footerTextLines.length > 0
      ? footerTextLines.map(line => new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: line, size: 18, font: 'Arial', color: '999999' })]
        }))
      : [new Paragraph({ spacing: { after: 0 }, children: [] })]
    footerChildren.push(new Table({
      width: { size: footerW, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [leftW, rightW],
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: leftW, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: leftParas
          }),
          new TableCell({
            width: { size: rightW, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: signatureFooterRun
              ? [new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 0 }, children: [signatureFooterRun] })]
              : [new Paragraph({ spacing: { after: 0 }, children: [] })]
          })
        ]
      })]
    }))
    footerChildren.push(pageNumPara)
  } else {
    // No signature or footer text — just centered page number
    footerChildren.push(pageNumPara)
  }
  const policyFooter = new Footer({ children: footerChildren })

  const docSections: any[] = [{
    properties: polMakePageProperties(),
    headers: { default: defaultHeader },
    footers: { default: policyFooter },
    children: children as any[]
  }]

  // Append the rich-text T&C as a new section (starts on a fresh page, own footer,
  // continuous page numbering — no separate merge needed)
  if (tcHtml) {
    const tcChildren: (Paragraph | Table)[] = [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 160 }, children: [new TextRun({ text: 'TERMS AND CONDITIONS', size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true, underline: {} })] }),
      ...parseHtmlToParagraphs(decodeHtmlEntities(tcHtml), { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
    ]
    // T&C footer: configurable title line + optional page numbers
    const tcTitleResolved = tcTitleLine.replace(/\{type\}/gi, headerTitle).replace(/\{number\}/gi, data.policy.policyNumber)
    const tcFooterChildren: Paragraph[] = []
    const tcFooterLines = tcFooterText ? tcFooterText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').split('\n').filter(l => l.trim()) : []
    if (tcTitleResolved.trim()) tcFooterChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: tcTitleResolved.trim(), size: 16, font: 'Arial', color: '999999' })] }))
    for (const l of tcFooterLines) tcFooterChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new TextRun({ text: l.trim(), size: 16, font: 'Arial', color: '999999' })] }))
    if (tcShowPageNumbers) tcFooterChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 40, after: 0 },
      children: [new TextRun({ text: 'Page ', ...pnStyle }), new TextRun({ children: [PageNumber.CURRENT], ...pnStyle }), new TextRun({ text: ' of ', ...pnStyle }),
        ...(configTotalPages ? [new TextRun({ text: String(configTotalPages), ...pnStyle })] : [new TextRun({ children: [PageNumber.TOTAL_PAGES], ...pnStyle })])]
    }))
    if (tcFooterChildren.length === 0) tcFooterChildren.push(new Paragraph({ spacing: { after: 0 }, children: [] }))
    docSections.push({
      properties: polMakePageProperties(),
      headers: { default: new Header({ children: [polEmptyP()] }) },
      footers: { default: new Footer({ children: tcFooterChildren }) },
      children: tcChildren as any[]
    })
  }

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: docSections
  })

  const blob = await Packer.toBlob(document)
  const vName = data.vesselInfo?.name || ''
  const revSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${vName}${revSuffix}.docx`)

  // Mark policy as exported
  try { await window.api.policyUpdate(policyId, { exportedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') }) } catch { /* non-critical */ }
}

/**
 * Generate a policy DOCX as an ArrayBuffer (without downloading).
 * Uses capture mode to intercept the blob from exportPolicyDocx.
 * @param totalPages - if provided, hardcodes "Page X of N" instead of using auto NUMPAGES
 */
async function generatePolicyDocxBuffer(policyId: string, totalPages?: number, includeTC?: boolean): Promise<{ buffer: ArrayBuffer; fileName: string; typeCode: string }> {
  const data = await loadFrozenExportData(policyId)
  applyFrozenFontSize(data)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const vName = data.vesselInfo?.name || ''
  const revSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  const fileName = `${data.policy.policyNumber} - ${vName}${revSuffix}`

  // Enable capture mode so polDownloadBlob stores blob instead of downloading
  _polCaptureMode = true
  _polCapturedBlob = null
  try {
    await exportPolicyDocx(policyId, totalPages, includeTC)
    // _polCapturedBlob is set by polDownloadBlob during exportPolicyDocx (TS can't track this)
    const captured = _polCapturedBlob as Blob | null
    if (!captured) throw new Error('Failed to generate policy document')
    const buffer = await captured.arrayBuffer()
    return { buffer, fileName, typeCode }
  } finally {
    _polCaptureMode = false
    _polCapturedBlob = null
  }
}

/**
 * Export a policy as PDF with T&C appended.
 * Two-pass pipeline:
 * Pass 1: Generate DOCX (auto page count) → convert + merge → get combined total
 * Pass 2: Re-generate DOCX with hardcoded total → convert + merge → final PDF
 */
export async function exportPolicyPdfWithTC(policyId: string): Promise<void> {
  // Check if T&C template exists for this policy type
  const data = await loadFrozenExportData(policyId)
  applyFrozenFontSize(data)
  const typeCode = data.quotation.quotationTypeCode || 'P'

  const tcTemplate = await window.api.tcGetTemplate(typeCode) as any
  if (!tcTemplate || tcTemplate.error) {
    throw new Error('No T&C template set for this policy type. Add one in Policy Settings → T&C Templates.')
  }

  // Rich-text (html) T&C: build ONE combined DOCX (policy + T&C section) and convert once.
  if (tcTemplate.kind === 'html' && tcTemplate.contentHtml) {
    const { buffer, fileName } = await generatePolicyDocxBuffer(policyId, undefined, true)
    const res = await window.api.convertDocxBufferToPdf({ docxData: Array.from(new Uint8Array(buffer)), fileName }) as any
    if (!res || res.error) throw new Error(res?.message || 'PDF conversion failed')
    polDownloadBlob(new Blob([new Uint8Array(res.data)], { type: 'application/pdf' }), res.fileName)
    try { await window.api.policyUpdate(policyId, { exportedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') }) } catch { /* non-critical */ }
    return
  }

  // Legacy DOCX T&C: merge policy PDF + T&C PDF via the two-pass page-number pipeline.
  // Resolve policy type title for T&C footer
  const typeTitleMap: Record<string, string> = { P: 'P&I', H: 'Hull', W: 'War Risk', F: 'FDD', L: 'Loss of Hire', C: 'Cargo' }
  const policyTypeTitle = typeTitleMap[typeCode] || data.quotation.quotationTypeName || 'Insurance'
  const policyNumber = data.policy.policyNumber

  // Pass 1: generate policy DOCX with auto page count, convert to get combined total
  const { buffer: buf1, fileName } = await generatePolicyDocxBuffer(policyId)
  const pass1Result = await window.api.convertBuildPolicyWithTC({
    policyDocxData: Array.from(new Uint8Array(buf1)),
    tcTypeCode: typeCode,
    filePrefix: fileName,
    policyNumber,
    policyTypeTitle
  })

  if (!pass1Result || (pass1Result as any).error) {
    throw new Error((pass1Result as any)?.message || 'PDF conversion failed')
  }

  // Pass 2: re-generate with hardcoded combined total
  const combinedTotal = pass1Result.totalPages || 0
  const { buffer: buf2 } = await generatePolicyDocxBuffer(policyId, combinedTotal)
  const result = await window.api.convertBuildPolicyWithTC({
    policyDocxData: Array.from(new Uint8Array(buf2)),
    tcTypeCode: typeCode,
    filePrefix: fileName,
    policyNumber,
    policyTypeTitle
  })

  if (!result || (result as any).error) {
    throw new Error((result as any)?.message || 'PDF conversion failed')
  }

  // Download the merged PDF
  const pdfBlob = new Blob([new Uint8Array(result.data)], { type: 'application/pdf' })
  polDownloadBlob(pdfBlob, result.fileName)

  // Mark policy as exported
  try { await window.api.policyUpdate(policyId, { exportedAt: new Date().toISOString().slice(0, 19).replace('T', ' ') }) } catch { /* non-critical */ }
}

// ==================== Shared DA/CA Helpers ====================

/** Build the same header paragraphs used by the policy export (company details + title line) */
/** Build footer for DA/CA — footer text only, NO page number. Footer text comes from the
 * policy's frozen export settings (passed in) so it never changes on re-export. */
async function polBuildAdviceFooter(
  sigBuf: Uint8Array | null,
  frozenSettings?: any
): Promise<Footer> {
  let footerText = ''
  try {
    const parsed = frozenSettings || {}
    if (parsed.footerText) footerText = parsed.footerText
  } catch { /* ignore */ }

  // Parse footer text lines
  const footerLines: string[] = []
  if (footerText) {
    const plainFooter = footerText.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    for (const line of plainFooter.split('\n')) {
      if (line.trim()) footerLines.push(line.trim())
    }
  }

  // Build a single-row table: footer text on left, signature on right
  if (footerLines.length > 0 || sigBuf) {
    const footerW = POL_CONTENT_W || 9000
    const fColLeft = Math.round(footerW * 0.67)
    const fColRight = footerW - fColLeft

    const leftParas: Paragraph[] = footerLines.map(line => new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: line, size: 18, font: 'Arial', color: '999999' })]
    }))
    if (leftParas.length === 0) leftParas.push(new Paragraph({ spacing: { after: 0 }, children: [] }))

    const rightParas: Paragraph[] = []
    if (sigBuf) {
      rightParas.push(new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
        children: [new ImageRun({
          data: sigBuf,
          transformation: { width: 120, height: 60 },
          type: 'png'
        })]
      }))
    } else {
      rightParas.push(new Paragraph({ spacing: { after: 0 }, children: [] }))
    }

    const footerTable = new Table({
      width: { size: footerW, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [fColLeft, fColRight],
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: fColLeft, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: leftParas
          }),
          new TableCell({
            width: { size: fColRight, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: rightParas
          })
        ]
      })]
    })

    return new Footer({ children: [footerTable] })
  }

  return new Footer({ children: [polEmptyP()] })
}

/** Build the closing block for DA/CA — subject line, city/date, company name + signature (right-aligned) */
function polBuildAdviceClosing(
  data: PolicyExportData,
  signatureImageRun: ImageRun | null
): (Paragraph | Table)[] {
  const content: (Paragraph | Table)[] = []

  content.push(polEmptyP())
  content.push(polNp('Subject to the terms, clauses, conditions, and warranties of cover afforded.'))
  content.push(polEmptyP())

  const closingCity = data.policy.closingCity || 'Beirut'
  const closingDate = polFormatDateUS(data.policy.createdAt)
  content.push(polNp(`${closingCity}, ${closingDate}`))
  content.push(polEmptyP())

  // Company name + signature — right-aligned
  const reportSettings = data.companyName
  const closingRuns: Paragraph[] = []
  if (signatureImageRun) {
    closingRuns.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: { after: 40 },
      children: [signatureImageRun]
    }))
  }
  closingRuns.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: reportSettings, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  content.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [POL_CONTENT_W],
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: POL_CONTENT_W, type: WidthType.DXA },
          borders: polNoBorders(),
          children: closingRuns
        })
      ]
    })]
  }))

  return content
}

/** Load digital signature for closing + footer */
async function polLoadSignature(policyId: string, snapshotSig?: any): Promise<{ sigBuf: Uint8Array | null; signatureImageRun: ImageRun | null }> {
  let sigBuf: Uint8Array | null = null
  let signatureImageRun: ImageRun | null = null
  try {
    // Use snapshot signature if available (frozen at signing time)
    let imageData: any = null
    if (snapshotSig && snapshotSig.imageData) {
      imageData = snapshotSig.imageData
    } else {
      const sigData = await window.api.policyGetSignature(policyId)
      if (sigData) imageData = sigData.imageData
    }
    if (imageData) {
      const arr = Array.isArray(imageData) ? imageData : (imageData.data || Object.values(imageData))
      sigBuf = new Uint8Array(arr)
      signatureImageRun = new ImageRun({
        data: sigBuf,
        transformation: { width: 150, height: 75 },
        type: 'png'
      })
    }
  } catch { /* no signature */ }
  return { sigBuf, signatureImageRun }
}

/** Build the DA/CA instalment table (3-col: label, date, amount) */
// ==================== Debit Advice Export ====================

export async function exportDebitAdviceDocx(policyId: string): Promise<void> {
  const { blob, fileName } = await buildDebitAdviceBlob(policyId)
  polDownloadBlob(blob, fileName)
}

async function buildDebitAdviceBlob(policyId: string): Promise<{ blob: Blob; fileName: string }> {
  await loadPolicyFontSize()
  const data = await loadFrozenExportData(policyId)
  applyFrozenFontSize(data)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const currency = data.quotation.premiumCurrency || 'USD'

  // Load header title setting
  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull Cover',
    W: 'War Risk Certificate'
  }
  try {
    const settings = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = (headerTitles[typeCode] || 'Certificate').toUpperCase()

  // Load signature (for closing section — not in footer for DA)
  const { signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  // Build header (company details only, no certificate title) + footer
  const daHeaderParas: Paragraph[] = []
  const daHeaderHtml = polSt(data, 'docHeader')
  const daHeaderSpacing = (data.sectionTexts as any).docHeaderSpacing || 220
  if (daHeaderHtml) {
    daHeaderParas.push(...parseHtmlToParagraphs(daHeaderHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: daHeaderSpacing, spacingAfter: 0 }))
  }
  const adviceFooter = await polBuildAdviceFooter(null, data.frozen?.exportSettings)

  const children: (Paragraph | Table)[] = []

  // Title block — centered, compact spacing
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'DEBIT ADVICE', size: 20, font: 'Arial', color: '000000', bold: true, underline: {} })]
  }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: 'In connection with', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `M/V ${data.vesselInfo.name.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  // Build main two-column table (same pattern as policy)
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
            children: [new TextRun({ text: title.toUpperCase(), bold: true, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
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

  // PREMIUM — amount bold + words on same line: "USD 45,000 (US Dollars Forty-Five Thousand Only)"
  const totalPremium = data.instalments.reduce((sum, i) => sum + ((i as any).premiumAmount || (i as any).amount || 0), 0) || data.policy.premiumAmount || data.quotation.premiumAmount || 0
  // Increased Value (Hull): split the premium into Section A (H&M) + Section B (IV) + Total.
  // IV payable = ivPremium after NCB/UPCC discounts (mirrors the wizard); H&M = Total − IV.
  const ivPremRaw = data.quotation.ivPremiumAmount || 0
  const showIvSplit = data.quotation.ivEnabled === true && ivPremRaw > 0
  const premiumContent: (Paragraph | Table)[] = []
  if (showIvSplit) {
    let ivPay = ivPremRaw
    if (data.quotation.ncbEnabled && data.quotation.ncbDiscountPercent) ivPay *= (1 - data.quotation.ncbDiscountPercent / 100)
    if (data.quotation.upccEnabled && data.quotation.upccDiscountPercent) ivPay *= (1 - data.quotation.upccDiscountPercent / 100)
    ivPay = Math.round(ivPay * 100) / 100
    const hmPay = Math.round((totalPremium - ivPay) * 100) / 100
    premiumContent.push(...polBuildAmountBreakdown(
      [{ label: 'Section A: H&M', amount: hmPay }, { label: 'Section B: IV', amount: ivPay }],
      'Total', totalPremium, currency
    ))
  } else {
    premiumContent.push(new Paragraph({
      spacing: { after: 40, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: polFormatCurrency(totalPremium, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true }),
        new TextRun({ text: ` (${numberToWords(totalPremium, currency)} Only)`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
      ]
    }))
  }
  rows.push(makeRow('Premium', premiumContent))

  // PREMIUM PAYMENT CONDITION PRECEDENT
  const ppcpContent: (Paragraph | Table)[] = []
  const numInst = data.instalments.length || 1

  // Configurable intro text for debit advice (from settings)
  let daIntroTemplate = ''
  let daIntroSingleTemplate = ''
  try {
    const s = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (s) {
      const p = JSON.parse(s)
      if (p.debitAdviceIntroText) daIntroTemplate = p.debitAdviceIntroText
      if (p.debitAdviceIntroSingleText) daIntroSingleTemplate = p.debitAdviceIntroSingleText
    }
  } catch {}

  const daTimezone = data.policy.timezone || ''
  if (numInst === 1 && data.instalments.length === 1) {
    const singleTpl = daIntroSingleTemplate || 'Premium of {currency} {amount} shall be payable on {date} as per attached debit note, at {time} {timezone}, time being of the essence.'
    ppcpContent.push(polNpTight(singleTpl
      .replace(/\{currency\}/g, currency)
      .replace(/\{amount\}/g, polFormatCurrency(totalPremium, currency).replace(`${currency} `, ''))
      .replace(/\{date\}/g, polFormatDateUS(data.instalments[0].dueDate))
      .replace(/\{time\}/g, polFormatTime(data.policy.inceptionTime))
      .replace(/\{timezone\}/g, daTimezone)))
  } else {
    const multiTpl = daIntroTemplate || 'Premium {currency} {amount} shall be payable in {instalments} Instalments on the following dates, at {time} {timezone}, time being of the essence:'
    ppcpContent.push(polNpTight(multiTpl
      .replace(/\{currency\}/g, currency)
      .replace(/\{amount\}/g, polFormatCurrency(totalPremium, currency).replace(`${currency} `, ''))
      .replace(/\{instalments\}/g, String(numInst))
      .replace(/\{time\}/g, polFormatTime(data.policy.inceptionTime))
      .replace(/\{timezone\}/g, daTimezone)))
  }
  // 3pt gap between the intro line and the instalment list
  ppcpContent.push(polSpacerPts(3))

  // Non-refundable: policy override wins ('none' = explicitly none; NULL = inherit from quotation)
  const daPolNr = (data.policy as any).nonRefundableType
  const daNrType = daPolNr != null ? (daPolNr === 'none' ? null : daPolNr) : data.quotation.nonRefundableType
  const daNrPct = (data.policy as any).nonRefundablePercent != null ? (data.policy as any).nonRefundablePercent : data.quotation.nonRefundablePercent
  // Instalment table — 2 columns: "Xth Instalment due {date}" | "USD X (non-refundable)"
  if (data.instalments.length > 0) {
    const isFirstInstNr = daNrType === 'first_instalment'
    const instDescW = Math.round(POL_BODY_INNER_W * 0.55)
    const instAmtW = POL_BODY_INNER_W - instDescW
    const instRows = data.instalments.map(inst => {
      const label = `${polOrdinal(inst.instalmentNumber)} Instalment due ${polFormatDateUS(inst.dueDate)}`
      const isNR = inst.isNonRefundable || (isFirstInstNr && inst.instalmentNumber === 1)
      const amtText = polFormatCurrency((inst as any).premiumAmount || (inst as any).amount || 0, currency) + (isNR ? ' (non-refundable)' : '')
      return new TableRow({
        children: [
          new TableCell({ width: { size: instDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: label, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: instAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: amtText, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
        ]
      })
    })
    ppcpContent.push(new Table({ width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS, layout: TableLayoutType.FIXED, columnWidths: [instDescW, instAmtW], rows: instRows }))
    ppcpContent.push(polEmptyP())
  }

  // Non-refundable percentage note (only for percentage type)
  if (daNrType === 'percentage' && daNrPct) {
    ppcpContent.push(polNp(`${polFmtPct(daNrPct)}% of premium is non-refundable.`))
  }

  rows.push(makeRow('Premium\nPayment\nCondition\nPrecedent', ppcpContent))

  // PERIOD
  rows.push(makeRow('Period', polBuildPeriodParagraphs(data)))

  // BANK DETAILS — bank name is internal, only show details
  if (data.bank) {
    const bankContent: (Paragraph | Table)[] = []
    for (const line of data.bank.details.split('\n')) {
      if (line.trim()) bankContent.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: line.trim(), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
    }
    rows.push(makeRow('Bank Details', bankContent))
  }

  // Build main table
  children.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    columnWidths: [POL_TITLE_W, POL_BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder
    },
    rows
  }))

  // Closing block
  children.push(...polBuildAdviceClosing(data, signatureImageRun))

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      headers: { default: new Header({ children: daHeaderParas.length > 0 ? daHeaderParas : [polEmptyP()] }) },
      footers: { default: adviceFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const daVName = data.vesselInfo?.name || ''
  const daRevSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  return { blob, fileName: `${data.policy.policyNumber} - ${daVName} - Debit Advice${daRevSuffix}.docx` }
}

// ==================== Credit Advice Export ====================

export async function exportCreditAdviceDocx(policyId: string): Promise<void> {
  const { blob, fileName } = await buildCreditAdviceBlob(policyId)
  polDownloadBlob(blob, fileName)
}

async function buildCreditAdviceBlob(policyId: string): Promise<{ blob: Blob; fileName: string }> {
  await loadPolicyFontSize()
  const data = await loadFrozenExportData(policyId)
  applyFrozenFontSize(data)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const currency = data.quotation.premiumCurrency || 'USD'

  // Load header title setting
  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull Cover',
    W: 'War Risk Certificate'
  }
  try {
    const settings = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = (headerTitles[typeCode] || 'Certificate').toUpperCase()

  // Load signature (for closing section — not in footer for CA)
  const { signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  // Build header (company details only) + footer
  const caHeaderParas: Paragraph[] = []
  const caHeaderHtml = polSt(data, 'docHeader')
  const caHeaderSpacing = (data.sectionTexts as any).docHeaderSpacing || 220
  if (caHeaderHtml) {
    caHeaderParas.push(...parseHtmlToParagraphs(caHeaderHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: caHeaderSpacing, spacingAfter: 0 }))
  }
  const adviceFooter = await polBuildAdviceFooter(null, data.frozen?.exportSettings)

  // Load credit advice commission wording from settings
  let caCommissionMultiText = 'Commission payable in {instalments} instalments:'
  let caCommissionSingleText = 'Commission payable on {date}.'
  try {
    const caSettingsRaw = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (caSettingsRaw) {
      const caParsed = JSON.parse(caSettingsRaw)
      if (caParsed.creditAdviceCommissionText) caCommissionMultiText = caParsed.creditAdviceCommissionText
      if (caParsed.creditAdviceCommissionSingleText) caCommissionSingleText = caParsed.creditAdviceCommissionSingleText
    }
  } catch { /* use defaults */ }

  const children: (Paragraph | Table)[] = []

  // Broker block — load from quotation customer (broker), show at top left with 0 spacing
  const brokerEntityId = data.quotation.customerEntityId
  const isBroker = data.quotation.customerType === 'broker'
  const caZeroP = (text: string) => new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })
  if (brokerEntityId && isBroker) {
    try {
      // Broker entity + address are frozen on the policy snapshot (first export).
      const brokerEntity = data.frozen?.brokerEntity || null
      if (brokerEntity) {
        children.push(caZeroP(brokerEntity.name))
        const brokerAddr = data.frozen?.brokerAddress || null
        if (brokerAddr) {
          const addrText = brokerAddr.addressLine1 || ''
          if (addrText) {
            for (const line of addrText.split('\n')) {
              if (line.trim()) children.push(caZeroP(line.trim()))
            }
          }
          if (brokerAddr.city || brokerAddr.country) {
            const cityCountry = [brokerAddr.city, brokerAddr.country].filter(Boolean).join(', ')
            children.push(caZeroP(cityCountry))
          }
        }
        if (brokerEntity.phone) children.push(caZeroP(`Phone: ${brokerEntity.phone}`))
        if (brokerEntity.email) children.push(caZeroP(brokerEntity.email))
        children.push(polEmptyP())
      }
    } catch { /* ignore broker load errors */ }
  }

  // Title block — centered, compact spacing
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'CREDIT ADVICE', size: 20, font: 'Arial', color: '000000', bold: true, underline: {} })]
  }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: 'In connection with', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `M/V ${data.vesselInfo.name.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  // Build main two-column table (same pattern as policy)
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
            children: [new TextRun({ text: title.toUpperCase(), bold: true, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
          })]
        }),
        new TableCell({
          width: { size: POL_BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          margins: { top: 60, bottom: 60, left: 80, right: 80 },
          children: content.length > 0 ? content : [polEmptyP()]
        })
      ]
    })
  }

  const rows: TableRow[] = []

  // INSURED — exclude broker entity and c/o line (broker already shown at top of CA)
  const caFilteredData = brokerEntityId
    ? { ...data, quotation: { ...data.quotation, coName: '' }, addresses: data.addresses.filter(a => a.entityId !== brokerEntityId), assureds: data.assureds.filter(a => (a as any).entityId !== brokerEntityId) }
    : data
  const insuredContent = polBuildInsuredSection(caFilteredData)
  if (insuredContent.length > 0) rows.push(makeRow('Insured', insuredContent))

  // CREDIT AMOUNT — amount + words on same line
  const totalPremium = data.instalments.reduce((sum, i) => sum + ((i as any).premiumAmount || (i as any).amount || 0), 0) || data.policy.premiumAmount || data.quotation.premiumAmount || 0
  const commissionPercent = data.policy.commissionPercent || 0
  const commissionAmount = totalPremium * commissionPercent / 100
  const creditContent: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 120, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: polFormatCurrency(Math.round(commissionAmount * 100) / 100, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true }),
        new TextRun({ text: ` (${numberToWords(Math.round(commissionAmount * 100) / 100, currency)} Only)`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
      ]
    })
  ]
  rows.push(makeRow('Credit Amount', creditContent))

  // DETAILS
  const detailsContent: (Paragraph | Table)[] = []
  detailsContent.push(new Paragraph({
    spacing: { after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `Being ${polFmtPct(commissionPercent)}% Commission on Premium ${polFormatCurrency(totalPremium, currency)}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  }))

  if (data.instalments.length > 0) {
    const numInst = data.instalments.length
    if (numInst === 1) {
      const singleText = caCommissionSingleText.replace('{date}', polFormatDateUS(data.instalments[0].dueDate)).replace('{instalments}', '1')
      detailsContent.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: singleText, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
    } else {
      const multiText = caCommissionMultiText.replace('{instalments}', String(numInst))
      detailsContent.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: multiText, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
    }
    if (numInst > 1) {
      detailsContent.push(polEmptyP())
      const caInstDescW = Math.round(POL_BODY_INNER_W * 0.55)
      const caInstAmtW = POL_BODY_INNER_W - caInstDescW
      const caInstRows = data.instalments.map(inst => {
        const commAmt = inst.commissionAmount != null ? inst.commissionAmount : Math.round(((inst as any).premiumAmount || (inst as any).amount || 0) * commissionPercent / 100 * 100) / 100
        return new TableRow({
          children: [
            new TableCell({ width: { size: caInstDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `${polOrdinal(inst.instalmentNumber)} Instalment due ${polFormatDateUS(inst.dueDate)}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
            new TableCell({ width: { size: caInstAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: polFormatCurrency(commAmt, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
          ]
        })
      })
      detailsContent.push(new Table({ width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS, layout: TableLayoutType.FIXED, columnWidths: [caInstDescW, caInstAmtW], rows: caInstRows }))
      detailsContent.push(new Paragraph({ spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: ' ', size: POL_FONT_SIZE, font: 'Arial' })] }))
    }
  }
  rows.push(makeRow('Details', detailsContent))

  // PERIOD
  rows.push(makeRow('Period', polBuildPeriodParagraphs(data)))

  // Build main table
  children.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    columnWidths: [POL_TITLE_W, POL_BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder
    },
    rows
  }))

  // Closing block
  children.push(...polBuildAdviceClosing(data, signatureImageRun))

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      headers: { default: new Header({ children: caHeaderParas.length > 0 ? caHeaderParas : [polEmptyP()] }) },
      footers: { default: adviceFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const caVName = data.vesselInfo?.name || ''
  const caRevSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  return { blob, fileName: `${data.policy.policyNumber} - ${caVName} - Credit Advice${caRevSuffix}.docx` }
}

// ==================== Policy Bundle (ZIP) Export ====================

/**
 * Export all policy documents as a single ZIP: policy DOCX, Debit Advice,
 * optional Credit Advice (when there is commission), and each supplied blue card.
 * All content comes from the frozen export snapshot, exactly like the individual exports.
 */
export async function exportPolicyBundleZip(
  policyId: string,
  opts: { includeCA?: boolean; blueCards?: { data: BlueCardData; cardType: BlueCardType }[] } = {}
): Promise<void> {
  const zip = new JSZip()

  const pol = await generatePolicyDocxBuffer(policyId)
  // generatePolicyDocxBuffer returns fileName WITHOUT extension (the PDF path re-derives it)
  const polFileName = /\.docx$/i.test(pol.fileName) ? pol.fileName : `${pol.fileName}.docx`
  zip.file(polFileName, pol.buffer)

  const da = await buildDebitAdviceBlob(policyId)
  zip.file(da.fileName, da.blob)

  if (opts.includeCA) {
    const ca = await buildCreditAdviceBlob(policyId)
    zip.file(ca.fileName, ca.blob)
  }

  for (const bc of opts.blueCards || []) {
    const built = await buildBlueCardBlob(bc.data, bc.cardType, policyId)
    zip.file(built.fileName, built.blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  const base = pol.fileName.replace(/\.docx$/i, '')
  polDownloadBlob(zipBlob, `${base} (All Documents).zip`)
}

// ==================== War Declaration Export ====================

export interface DeclarationFields {
  yearOfAccount: string
  umr: string
  reinsured: string
  assuredText: string
  vesselName: string
  vesselImo: string
  vesselSumInsured: string
  vesselSumInsuredIV: string
  vesselTotalValue: string
  vesselBuilt: string
  vesselGT: string
  vesselType: string
  vesselClass: string
  periodFrom: string
  periodTo: string
  wording: string
  warranties: string
  annualRate: string
  ourShare: string
  trading: string
  riskCode: string
  amlinRef: string
}

export async function loadDeclarationFields(policyId: string): Promise<DeclarationFields> {
  const data = await loadPolicyExportData(policyId)
  const q = data.quotation
  const currency = q.agreedValueCurrency || q.premiumCurrency || 'USD'
  const curSymbol = currency === 'USD' ? 'US$' : currency

  // Year from inception
  const year = data.policy.inceptionDate ? data.policy.inceptionDate.split('-')[0] : String(new Date().getFullYear())

  // Load declaration settings
  let umr = ''
  let amlinRef = ''
  let riskCode = '"W" in respect of War Risks Premium\t\t"WB" in respect of War Breach Premium'
  try {
    const parsed = data.frozen?.declarationSettings
    if (parsed) {
      const yearSettings = parsed[year] || {}
      umr = yearSettings.umr || ''
      amlinRef = yearSettings.amlinRef || ''
      if (yearSettings.riskCode) riskCode = yearSettings.riskCode
    }
  } catch {}

  // Assured text
  const assuredLines: string[] = []
  for (const a of data.assureds) {
    const role = a.role ? a.role.toUpperCase() : ''
    assuredLines.push(`${role}:  ${a.name}`)
  }

  // Vessel details
  const vi = data.vesselInfo
  const vesselAV = data.vessel?.agreedValue ?? q.agreedValue ?? 0
  const vesselIV = data.vessel?.ivValue ?? q.ivValue
  const hasIV = q.ivEnabled && vesselIV != null && vesselIV > 0
  const totalValue = hasIV ? vesselAV + vesselIV : vesselAV

  // Classification
  const classification = (data.vessel && data.vesselClassificationNames[data.vessel.id]) || vi.classification || ''

  // Period
  const periodFrom = `${polFormatDateUS(data.policy.inceptionDate)}\t\t${polFormatTime(data.policy.inceptionTime)} ${data.policy.timezone || ''}`
  const periodTo = `${polFormatDateUS(data.policy.expiryDate)}\t\t${polFormatTime(data.policy.expiryTime)} ${data.policy.timezone || ''}`

  // Wording from war conditions
  const wordingLines: string[] = []
  for (const wc of data.warConditions) {
    const def = data.allWarConditions.find(c => c.id === wc.warConditionId)
    if (def) wordingLines.push(wc.textOverride || def.text)
  }

  // Warranties
  const warrantyLines: string[] = []
  for (const wid of data.selectedWarrantyIds) {
    const w = data.allWarranties.find(aw => aw.id === wid)
    if (w) warrantyLines.push(w.text || (w as any).name)
  }
  for (const cw of data.customWarranties) warrantyLines.push(cw.text)

  // Trading
  let tradingText = ''
  if (q.tradingWarrantyIntro) tradingText = stripHtml(q.tradingWarrantyIntro)

  return {
    yearOfAccount: year,
    umr,
    reinsured: data.companyName + ', LEBANON.',
    assuredText: assuredLines.join('\n'),
    vesselName: vi.name,
    vesselImo: vi.imo || '',
    vesselSumInsured: hasIV ? `A)\tAgreed Insured Value\t\t${curSymbol} ${vesselAV.toLocaleString()}` : `${curSymbol} ${vesselAV.toLocaleString()}`,
    vesselSumInsuredIV: hasIV ? `B)\tAgreed Increased Value\t\t${curSymbol} ${vesselIV!.toLocaleString()}` : '',
    vesselTotalValue: hasIV ? `${curSymbol} ${totalValue.toLocaleString()}` : '',
    vesselBuilt: vi.built ? String(vi.built) : '',
    vesselGT: vi.gt ? vi.gt.toLocaleString() : '',
    vesselType: vi.type || '',
    vesselClass: classification,
    periodFrom,
    periodTo,
    wording: wordingLines.join('\n\n'),
    warranties: warrantyLines.join('\n\n'),
    annualRate: q.premiumRate != null ? `${q.premiumRate} %` : '',
    ourShare: data.policy.ourShare != null ? `${data.policy.ourShare} %` : '',
    trading: tradingText,
    riskCode,
    amlinRef
  }
}

export async function exportDeclarationDocx(policyId: string, fields: DeclarationFields): Promise<void> {
  const data = await loadFrozenExportData(policyId)

  const FONT = 'Arial'
  const SIZE = 20 // 10pt

  const emptyP = () => new Paragraph({ spacing: { after: 0 }, children: [] })

  const LABEL_W = 1800
  const VALUE_W = 8200

  const labelCell = (text: string) => new TableCell({
    width: { size: LABEL_W, type: WidthType.DXA },
    borders: polNoBorders(),
    verticalAlign: VerticalAlign.TOP,
    children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text, size: SIZE, font: FONT, bold: true })] })]
  })

  const valueCell = (lines: string[]) => new TableCell({
    width: { size: VALUE_W, type: WidthType.DXA },
    borders: polNoBorders(),
    verticalAlign: VerticalAlign.TOP,
    children: lines.length > 0 ? lines.map(l => new Paragraph({
      spacing: { after: 60, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text: l, size: SIZE, font: FONT })]
    })) : [emptyP()]
  })

  const makeRow = (label: string, lines: string[]) => new TableRow({
    children: [labelCell(label), valueCell(lines)]
  })

  const children: (Paragraph | Table)[] = []

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: `${data.companyName.toUpperCase()} WAR COVER \u2013 DECLARATION`, size: SIZE, font: FONT, bold: true })]
  }))
  children.push(emptyP())

  // Main table
  const rows: TableRow[] = []

  rows.push(makeRow('YEAR OF\nACCOUNT:', [fields.yearOfAccount]))
  rows.push(makeRow('UMR:', [fields.umr]))
  rows.push(makeRow('REINSURED:', [fields.reinsured]))
  rows.push(makeRow('ASSURED:', fields.assuredText.split('\n')))

  // Vessel block
  const vesselLines = [`NAME: ${fields.vesselName}`, `IMO: ${fields.vesselImo}`]
  if (fields.vesselSumInsuredIV) {
    vesselLines.push(`SUM INSURED:  ${fields.vesselSumInsured}`)
    vesselLines.push(`\t\t${fields.vesselSumInsuredIV}`)
    vesselLines.push('')
    vesselLines.push(`\t\tTotal Value:\t\t${fields.vesselTotalValue}`)
  } else {
    vesselLines.push(`INSURED VALUE: ${fields.vesselSumInsured}`)
  }
  vesselLines.push(`BUILT: ${fields.vesselBuilt}`)
  vesselLines.push(`GT:  ${fields.vesselGT}`)
  vesselLines.push(`TYPE: ${fields.vesselType}`)
  vesselLines.push(`CLASS: ${fields.vesselClass}`)
  rows.push(makeRow('VESSEL(S):', vesselLines))

  // Period
  rows.push(makeRow('PERIOD:', [`From ${fields.periodFrom}`, '', `To     ${fields.periodTo}`]))

  // Wording
  rows.push(makeRow('WORDING', fields.wording.split('\n').filter(l => l.trim())))

  // Warranties
  rows.push(makeRow('WARRANTIES', fields.warranties.split('\n').filter(l => l.trim())))

  // Annual Rate
  rows.push(makeRow('ANNUAL\nRATE:', [fields.annualRate]))

  // Our Share
  rows.push(makeRow('OUR\nSHARE:', [fields.ourShare]))

  // Trading
  rows.push(makeRow('TRADING:', fields.trading.split('\n').filter(l => l.trim())))

  // Risk Code
  rows.push(makeRow('RISK CODE:', fields.riskCode.split('\n').filter(l => l.trim())))

  // Amlin Ref
  rows.push(makeRow('AMLIN\nREF:', [fields.amlinRef]))

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [LABEL_W, VALUE_W],
    borders: { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } },
    rows
  }))

  const document = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const vName = data.vesselInfo?.name || ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${vName} (Declaration).docx`)
}

// ============================================================================
// ENDORSEMENT EXPORT
// ============================================================================

async function loadEndorsementExportData(policyId: string, endorsementId: string) {
  const data = await loadFrozenExportData(policyId)
  const endorsement = await window.api.endorsementGet(endorsementId)
  if (!endorsement) throw new Error('Endorsement not found')
  const sections = await window.api.endorsementGetSections(endorsementId)
  const instalments = await window.api.endorsementGetInstalments(endorsementId)
  return { data, endorsement, sections: Array.isArray(sections) ? sections : [], instalments: Array.isArray(instalments) ? instalments : [] }
}

export async function exportEndorsementDocx(policyId: string, endorsementId: string): Promise<void> {
  await loadPolicyFontSize()
  const { data, endorsement, sections } = await loadEndorsementExportData(policyId, endorsementId)
  const typeCode = data.quotation.quotationTypeCode || 'P'

  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull Cover',
    W: 'War Risk Certificate'
  }
  try {
    const settings = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = (headerTitles[typeCode] || 'Certificate').toUpperCase()

  // Load signature
  const { sigBuf, signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  // Build header + footer
  const hdrParas: Paragraph[] = []
  const hdrHtml = polSt(data, 'docHeader')
  const hdrSpacing = (data.sectionTexts as any).docHeaderSpacing || 220
  if (hdrHtml) {
    hdrParas.push(...parseHtmlToParagraphs(hdrHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: hdrSpacing, spacingAfter: 0 }))
  }
  const adviceFooter = await polBuildAdviceFooter(sigBuf)

  const children: (Paragraph | Table)[] = []

  // ── Centered header ──
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `Endorsement No. ${endorsement.endorsementNumber}`, size: 22, font: 'Arial', color: '000000', bold: true })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'in connection with', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: headerTitle, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  }))
  if (endorsement.affectsDebitAdvice) {
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any },
      children: [new TextRun({ text: '— and the relative Debit Advice —', size: POL_FONT_SIZE, font: 'Arial', color: '000000', italics: true })]
    }))
  }
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: data.policy.policyNumber, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  // ── Two-column table layout (same as policy) ──
  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const thinBorders = () => ({ top: noBorder, bottom: noBorder, left: noBorder, right: noBorder })

  function makeRow(title: string, content: (Paragraph | Table)[]): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: POL_TITLE_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          children: [polBp(title)]
        }),
        new TableCell({
          width: { size: POL_BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          children: content.length > 0 ? content : [polEmptyP()]
        })
      ]
    })
  }

  const rows: TableRow[] = []

  // Insured
  const insuredContent = polBuildInsuredSection(data)
  rows.push(makeRow('INSURED', insuredContent))

  // Period
  const periodContent = polBuildPeriodParagraphs(data)
  rows.push(makeRow('PERIOD', periodContent))

  // Effective Date
  const effDate = polFormatDateUS(endorsement.effectiveDate)
  rows.push(makeRow('EFFECTIVE DATE', [polNp(effDate)]))

  // Endorsement sections — two-column or full-width, interleaved
  const enabledSections = sections.filter((s: any) => s.isEnabled)
  enabledSections.sort((a: any, b: any) => a.orderIndex - b.orderIndex)

  // Split into groups: consecutive two-column sections form a table, full-width sections are standalone
  const flushRows = () => {
    if (rows.length > 0) {
      children.push(new Table({
        width: { size: POL_CONTENT_W, type: WidthType.DXA },
        columnWidths: [POL_TITLE_W, POL_BODY_W],
        layout: TableLayoutType.FIXED,
        borders: {
          top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
          insideHorizontal: noBorder, insideVertical: noBorder
        },
        rows: [...rows]
      }))
      rows.length = 0
    }
  }

  for (const sec of enabledSections) {
    const sectionContent: (Paragraph | Table)[] = []
    if (sec.content && polIsHtml(sec.content)) {
      sectionContent.push(...parseHtmlToParagraphs(sec.content, { size: POL_FONT_SIZE, font: 'Arial' }))
    } else if (sec.content) {
      sectionContent.push(...polMp(sec.content))
    }

    if (sec.isFullWidth) {
      // Flush any pending two-column rows first
      flushRows()
      // Add full-width content directly
      children.push(polEmptyP())
      children.push(...sectionContent)
    } else {
      rows.push(makeRow(sec.sectionTitle.toUpperCase(), sectionContent))
    }
  }

  // Flush remaining two-column rows
  flushRows()

  // Closing text
  let closingText = 'All other terms and conditions of the above-mentioned policy remain unchanged.'
  const savedClosing = data.frozen?.endorsementClosingText
  if (savedClosing) closingText = savedClosing

  children.push(polEmptyP())
  if (polIsHtml(closingText)) {
    children.push(...parseHtmlToParagraphs(closingText, { size: POL_FONT_SIZE, font: 'Arial' }))
  } else {
    children.push(polNp(closingText))
  }

  // Date
  children.push(polEmptyP())
  children.push(polNp(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })))

  // Signature
  if (signatureImageRun) {
    children.push(polEmptyP())
    children.push(new Paragraph({ children: [signatureImageRun] }))
  }

  const document = new Document({
    sections: [{
      properties: polMakePageProperties(),
      headers: hdrParas.length > 0 ? { default: new Header({ children: hdrParas }) } : undefined,
      footers: adviceFooter ? { default: adviceFooter } : undefined,
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const vName = data.vesselInfo?.name || ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${vName} (Endorsement ${endorsement.endorsementNumber}).docx`)
}

export async function exportEndorsementDADocx(policyId: string, endorsementId: string): Promise<void> {
  await loadPolicyFontSize()
  const { data, endorsement, instalments } = await loadEndorsementExportData(policyId, endorsementId)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const currency = endorsement.premiumCurrency || data.quotation.premiumCurrency || 'USD'

  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull Cover',
    W: 'War Risk Certificate'
  }
  try {
    const settings = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = (headerTitles[typeCode] || 'Certificate').toUpperCase()

  const { signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  const hdrParas: Paragraph[] = []
  const hdrHtml = polSt(data, 'docHeader')
  const hdrSpacing = (data.sectionTexts as any).docHeaderSpacing || 220
  if (hdrHtml) {
    hdrParas.push(...parseHtmlToParagraphs(hdrHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: hdrSpacing, spacingAfter: 0 }))
  }
  const adviceFooter = await polBuildAdviceFooter(null, data.frozen?.exportSettings)

  const children: (Paragraph | Table)[] = []

  // Title block — matches screenshot layout
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'DEBIT ADVICE', size: 20, font: 'Arial', color: '000000', bold: true, underline: {} })]
  }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: 'In connection with', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `Endorsement N° ${endorsement.endorsementNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `M/V ${data.vesselInfo.name.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  // Preamble
  children.push(new Paragraph({
    spacing: { before: 0, after: 120, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `This Debit Advice shall be deemed to be attached to and forming an integral part of Endorsement N° ${endorsement.endorsementNumber} - ${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  }))

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

  // INSURED — same as policy DA
  const insuredContent = polBuildInsuredSection(data)
  if (insuredContent.length > 0) rows.push(makeRow('INSURED', insuredContent))

  // ADDITIONAL PREMIUM / CREDIT PREMIUM — amount bold + words
  const premiumAmt = Number(endorsement.premiumAmount) || 0
  const absPremium = Math.abs(premiumAmt)
  const premLabel = premiumAmt < 0 ? 'CREDIT PREMIUM' : 'ADDITIONAL PREMIUM'
  const premiumContent: (Paragraph | Table)[] = [
    new Paragraph({
      spacing: { after: 40, line: 240, lineRule: 'auto' as any },
      children: [
        new TextRun({ text: polFormatCurrency(absPremium, currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true }),
        new TextRun({ text: ` (${numberToWords(absPremium, currency)})`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })
      ]
    })
  ]
  // Pro-rata line if endorsement is pro-rata
  if (endorsement.isProRata && endorsement.annualPremium) {
    premiumContent.push(polNp(`Pro-rata ${polFormatCurrency(Number(endorsement.annualPremium), currency)} per annum`))
  }
  rows.push(makeRow(premLabel, premiumContent))

  // ADDITIONAL PREMIUM PAYMENT CONDITION PRECEDENT
  const ppcpContent: (Paragraph | Table)[] = []
  const daTimezone = data.policy.timezone || ''

  if (instalments.length === 1) {
    ppcpContent.push(polNp(
      `Additional Premium shall be payable on ${polFormatDateUS(instalments[0].dueDate)} at ${polFormatTime(data.policy.inceptionTime)} ${daTimezone}, time being of the essence.`
    ))
  } else if (instalments.length > 1) {
    ppcpContent.push(polNp(
      `Additional Premium ${polFormatCurrency(absPremium, currency)} shall be payable in ${instalments.length} Instalments on the following dates, at ${polFormatTime(data.policy.inceptionTime)} ${daTimezone}, time being of the essence:`
    ))
    ppcpContent.push(polEmptyP())

    // Instalment table — same pattern as policy DA
    const instDescW = Math.round(POL_BODY_INNER_W * 0.55)
    const instAmtW = POL_BODY_INNER_W - instDescW
    const instRows = instalments.map(inst => {
      const label = `${polOrdinal(inst.instalmentNumber)} Instalment due ${polFormatDateUS(inst.dueDate)}`
      const amtText = polFormatCurrency(Number(inst.premiumAmount) || 0, currency)
      return new TableRow({
        children: [
          new TableCell({ width: { size: instDescW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: label, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: instAmtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: amtText, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
        ]
      })
    })
    ppcpContent.push(new Table({ width: { size: POL_BODY_INNER_W, type: WidthType.DXA }, margins: POL_TABLE_MARGINS, layout: TableLayoutType.FIXED, columnWidths: [instDescW, instAmtW], rows: instRows }))
    ppcpContent.push(polEmptyP())
  }

  if (ppcpContent.length > 0) {
    rows.push(makeRow(`Additional\nPremium Payment\nCondition\nPrecedent`, ppcpContent))
  }

  // PERIOD — from endorsement effective date to policy expiry
  rows.push(makeRow('Period', polBuildEndorsementPeriod(endorsement.effectiveDate, data)))

  // BANK DETAILS
  if (data.bank) {
    const bankContent: (Paragraph | Table)[] = []
    for (const line of data.bank.details.split('\n')) {
      if (line.trim()) bankContent.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: line.trim(), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
    }
    rows.push(makeRow('Bank Details', bankContent))
  }

  children.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    columnWidths: [POL_TITLE_W, POL_BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder
    },
    rows
  }))

  // Closing
  children.push(...polBuildAdviceClosing(data, signatureImageRun))

  const document = new Document({
    numbering: polMakeDocxNumbering(),
    sections: [{
      properties: polMakePageProperties(),
      headers: { default: new Header({ children: hdrParas.length > 0 ? hdrParas : [polEmptyP()] }) },
      footers: { default: adviceFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const vName = data.vesselInfo?.name || ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${vName} (Endorsement ${endorsement.endorsementNumber} DA).docx`)
}

export async function exportEndorsementCADocx(policyId: string, endorsementId: string): Promise<void> {
  await loadPolicyFontSize()
  const { data, endorsement, instalments } = await loadEndorsementExportData(policyId, endorsementId)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const currency = endorsement.premiumCurrency || data.quotation.premiumCurrency || 'USD'
  const commPct = Number(endorsement.commissionPercent) || Number(data.policy.commissionPercent) || 0

  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull Cover',
    W: 'War Risk Certificate'
  }
  try {
    const settings = data.frozen?.exportSettings ? JSON.stringify(data.frozen.exportSettings) : null
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = (headerTitles[typeCode] || 'Certificate').toUpperCase()

  const { signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  const hdrParas: Paragraph[] = []
  const hdrHtml = polSt(data, 'docHeader')
  const hdrSpacing = (data.sectionTexts as any).docHeaderSpacing || 220
  if (hdrHtml) {
    hdrParas.push(...parseHtmlToParagraphs(hdrHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: hdrSpacing, spacingAfter: 0 }))
  }
  const adviceFooter = await polBuildAdviceFooter(null, data.frozen?.exportSettings)

  const children: (Paragraph | Table)[] = []

  // Title
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 20, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `CREDIT ADVICE — Endorsement No. ${endorsement.endorsementNumber}`, size: 20, font: 'Arial', color: '000000', bold: true, underline: {} })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'In connection with', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `${headerTitle} ${data.policy.policyNumber}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })]
  }))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 240, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: `M/V ${data.vesselInfo.name.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))

  const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
  const thinBorders = () => ({ top: noBorder, bottom: noBorder, left: noBorder, right: noBorder })

  function makeRow(title: string, content: (Paragraph | Table)[]): TableRow {
    return new TableRow({
      children: [
        new TableCell({
          width: { size: POL_TITLE_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          children: [polBp(title)]
        }),
        new TableCell({
          width: { size: POL_BODY_W, type: WidthType.DXA },
          verticalAlign: VerticalAlign.TOP,
          borders: thinBorders(),
          children: content.length > 0 ? content : [polEmptyP()]
        })
      ]
    })
  }

  const rows: TableRow[] = []

  // Commission
  const premiumAmt = Math.abs(Number(endorsement.premiumAmount) || 0)
  const totalComm = premiumAmt * commPct / 100
  rows.push(makeRow('COMMISSION', [polNp(`${commPct}% of ${currency} ${premiumAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} = ${currency} ${totalComm.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)]))

  // Commission per instalment
  if (instalments.length > 0) {
    const instContent: (Paragraph | Table)[] = []
    for (const inst of instalments) {
      const commAmt = Number(inst.commissionAmount) || 0
      instContent.push(polNp(`${polOrdinal(inst.instalmentNumber)} instalment: ${currency} ${commAmt.toLocaleString('en-US', { minimumFractionDigits: 2 })} due ${polFormatDateUS(inst.dueDate)}`))
    }
    rows.push(makeRow('INSTALMENTS', instContent))
  }

  // PERIOD — from endorsement effective date to policy expiry
  rows.push(makeRow('Period', polBuildEndorsementPeriod(endorsement.effectiveDate, data)))

  children.push(new Table({
    width: { size: POL_CONTENT_W, type: WidthType.DXA },
    columnWidths: [POL_TITLE_W, POL_BODY_W],
    layout: TableLayoutType.FIXED,
    borders: {
      top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
      insideHorizontal: noBorder, insideVertical: noBorder
    },
    rows
  }))

  // Closing
  const closingParas = polBuildAdviceClosing(data, signatureImageRun)
  children.push(...closingParas)

  const document = new Document({
    sections: [{
      properties: polMakePageProperties(),
      headers: hdrParas.length > 0 ? { default: new Header({ children: hdrParas }) } : undefined,
      footers: adviceFooter ? { default: adviceFooter } : undefined,
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const vName = data.vesselInfo?.name || ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${vName} (Endorsement ${endorsement.endorsementNumber} CA).docx`)
}
