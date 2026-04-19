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
import { DEFAULT_SECTION_TEXTS } from '../components/quotationSettingsConstants'
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
            spacing: { before: 60, after: 60 },
            children: [bcText(label, { caps: true })],
          }),
        ],
      }),
      new TableCell({
        width: { size: VALUE_W, type: WidthType.DXA },
        borders: bcNoBorders(),
        children: [
          new Paragraph({
            spacing: { before: 60, after: 60 },
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
  const gt = typeof data.grossTonnage === 'number'
    ? data.grossTonnage.toLocaleString('en-US')
    : data.grossTonnage
  const portOfRegistry = data.portOfRegistry || data.flagState || ''
  const today = bcFormatDate(new Date().toISOString())
  const city = data.closingCity || ''

  const titleKey = cardType === 'BBC' ? 'bc_text_BBC_title' : 'bc_text_WRC_title'
  const certifyKey = cardType === 'BBC' ? 'bc_text_BBC_certify' : 'bc_text_WRC_certify'
  const cancelKey = cardType === 'BBC' ? 'bc_text_BBC_cancel' : 'bc_text_WRC_cancel'

  const children: Paragraph[] = []

  // 1+2. REF (left) + NOT TRANSFERABLE (right) on same line
  children.push(new Paragraph({
    spacing: { after: 300 },
    children: [
      bcText(`REF: ${ref}`, { bold: true }),
      new TextRun({ text: '\t', font: BC_FONT, size: BC_SIZE }),
      bcText('NOT TRANSFERABLE', { bold: true }),
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

  // 5. Vessel details table (borderless key:value)
  const vesselRows = [
    bcDetailRow('NAME OF SHIP', data.vesselName),
  ]
  if (cardType === 'WRC') {
    vesselRows.push(bcDetailRow('GROSS TONNAGE', gt))
  }
  vesselRows.push(
    bcDetailRow('DISTINCTIVE NUMBER OR LETTERS', data.callSign || ''),
    bcDetailRow('PORT OF REGISTRY', portOfRegistry),
    bcDetailRow('IMO NUMBER', data.imoNumber),
  )

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    rows: vesselRows,
  }) as unknown as Paragraph)

  children.push(bcSpacer(240))

  // 6. Owner block
  // 6. Owner label — NOT bold
  children.push(bcParagraph(
    'NAME AND FULL ADDRESS OF THE PRINCIPAL PLACE OF BUSINESS OF THE REGISTERED OWNER:',
    { bold: false, spacingAfter: 80 }
  ))
  // 7. Owner name in bold + caps, address in normal
  if (data.ownerName) {
    children.push(bcParagraph(data.ownerName.toUpperCase(), { bold: true, spacingAfter: 40 }))
  }
  if (data.ownerAddress) {
    children.push(...bcAddressBlock(
      data.ownerAddress.split('\n').map(l => l.toUpperCase()),
      240
    ))
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
  children.push(bcParagraph('Period of Insurance:', { bold: true, spacingAfter: 80 }))

  // Period table: 3 columns — From/To (small) | date (bold) | time + timezone merged (bold)
  const inceptionTimeTz = [data.inceptionTime, data.timezone].filter(Boolean).join(' ')
  const expiryTimeTz = [data.expiryTime, data.timezone].filter(Boolean).join(' ')
  const pLabelW = 600
  const pDateW = 3400
  const pTimeTzW = 6000

  const periodFromRow = new TableRow({
    children: [
      new TableCell({ width: { size: pLabelW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText('From', { bold: true })] })] }),
      new TableCell({ width: { size: pDateW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(inceptionFmt, { bold: true })] })] }),
      new TableCell({ width: { size: pTimeTzW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(inceptionTimeTz, { bold: true })] })] }),
    ],
  })

  const periodToRow = new TableRow({
    children: [
      new TableCell({ width: { size: pLabelW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText('To', { bold: true })] })] }),
      new TableCell({ width: { size: pDateW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(expiryFmt, { bold: true })] })] }),
      new TableCell({ width: { size: pTimeTzW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: [bcText(expiryTimeTz, { bold: true })] })] }),
    ],
  })

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
    rows: [periodFromRow, periodToRow],
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
        bcText('PLACE & DATE:  '),
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
  const portOfRegistry = data.portOfRegistry || data.flagState || ''
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

  // 3. Vessel details table — 3 columns (label | : | value bold)
  const mlcLabelW = 4000
  const mlcColonW = 400
  const mlcValueW = 5600
  const mlcDetailRow = (label: string, value: string) => new TableRow({
    children: [
      new TableCell({ width: { size: mlcLabelW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [bcText(label, { caps: true })] })] }),
      new TableCell({ width: { size: mlcColonW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [bcText(':')] })] }),
      new TableCell({ width: { size: mlcValueW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [bcText(value, { bold: true })] })] }),
    ],
  })

  const vesselRows = [
    mlcDetailRow('NAME OF SHIP', data.vesselName),
    mlcDetailRow('IMO NUMBER', data.imoNumber),
    mlcDetailRow('DISTINCTIVE NUMBER OR LETTERS', data.callSign || ''),
    mlcDetailRow('PORT OF REGISTRY', portOfRegistry),
  ]

  // 3b. Period row inside the vessel table
  vesselRows.push(new TableRow({
    children: [
      new TableCell({ width: { size: mlcLabelW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [bcText('PERIOD OF INSURANCE')] })] }),
      new TableCell({ width: { size: mlcColonW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [bcText(':')] })] }),
      new TableCell({ width: { size: mlcValueW, type: WidthType.DXA }, borders: bcNoBorders(), children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [bcText(`FROM ${inceptionFmt.toUpperCase()} TO ${expiryFmt.toUpperCase()}`, { bold: true })] })] }),
    ],
  }))

  children.push(new Table({
    width: { size: 10000, type: WidthType.DXA },
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
    children.push(...bcAddressBlock(data.ownerAddress.split('\n').map(l => l.toUpperCase()), 240))
  } else {
    children.push(bcSpacer(200))
  }

  // 6. Provider block — label NOT bold, entity from settings
  children.push(bcParagraph(
    'NAME, FULL ADDRESS AND WEBSITE OF THE PROVIDER OF INSURANCE OR OTHER FINANCIAL SECURITY',
    { bold: false, spacingAfter: 80 }
  ))
  children.push(...bcAddressBlock([
    data.companyName,
    ...(mlcCompanyAddress || '').split('\n'),
    mlcWebsite,
  ].filter(Boolean), 240))

  // 7. Contact details — label NOT bold, values bold
  children.push(bcParagraph(
    'CONTACT DETAILS OF THE PERSONS OR ENTITY RESPONSIBLE FOR HANDLING SEAFARERS\u2019 REQUEST FOR RELIEF:',
    { bold: false, spacingAfter: 80 }
  ))
  if (mlcEmail) {
    children.push(
      new Paragraph({
        spacing: { after: 40 },
        children: [
          bcText('Email    '),
          bcText(mlcEmail, { bold: true }),
        ],
      })
    )
  }
  if (mlcPhone) {
    const phoneLines = mlcPhone.split('\n').filter(Boolean)
    phoneLines.forEach((line, i) => {
      children.push(
        new Paragraph({
          spacing: { after: i === phoneLines.length - 1 ? 200 : 40 },
          children: [
            bcText(i === 0 ? 'Tel      ' : '         '),
            bcText(line.trim(), { bold: true }),
          ],
        })
      )
    })
  }
  if (!mlcEmail && !mlcPhone) {
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
        bcText('PLACE & DATE:  '),
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
  cardType: BlueCardType
): Promise<void> {
  await loadPolicyFontSize()
  const settings = await loadBcSettings()
  const children = await buildBlueCardPage(data, cardType, true, settings)

  // Build header + footer matching policy style
  const headerParas: Paragraph[] = []
  try {
    const sectionTexts = await window.api.piGetSectionTexts()
    const headerHtml = sectionTexts?.docHeader
    if (headerHtml) {
      const hSpacing = (sectionTexts as any).docHeaderSpacing || undefined
      headerParas.push(...parseHtmlToParagraphs(headerHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: hSpacing }))
    }
  } catch { /* no header */ }
  // Add policy number + vessel name line
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 40, after: 0 },
    children: [
      new TextRun({ text: data.policyNumber, size: BC_SIZE, font: BC_FONT, bold: true }),
      new TextRun({ text: data.vesselName ? ` \u2014 ${data.vesselName}` : '', size: BC_SIZE, font: BC_FONT, bold: true }),
    ],
  }))

  // Footer text from settings (no page number for blue cards)
  const footerParas: Paragraph[] = []
  try {
    const raw = await window.api.getSetting('policyExportSettings')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed.footerText) {
        footerParas.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 0 },
          children: [new TextRun({ text: parsed.footerText, size: 14, font: BC_FONT, color: '999999', italics: true })],
        }))
      }
    }
  } catch { /* no footer */ }

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
      headers: headerParas.length > 0 ? { default: new Header({ children: headerParas }) } : undefined,
      footers: footerParas.length > 0 ? { default: new Footer({ children: footerParas }) } : undefined,
      children: children as any[],
    }],
  })

  const blob = await Packer.toBlob(document)
  const url = URL.createObjectURL(blob)
  const a = window.document.createElement('a')
  a.href = url
  const bcVName = data.vesselName ? ` - ${data.vesselName}` : ''
  a.download = `${data.policyNumber}${bcVName} - ${cardType}.docx`
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
  assuredGroups: QuotationAssuredGroup[]
  customSections: { id: string; title: string; text?: string; order: number }[]
  lolOptions: { id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]
  agreedValueOptions: QuotationAgreedValueOption[]
  fleets: { id: string; name: string }[]
  vesselClassificationNames: Record<string, string>
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
    hullAdditionalConditionsRaw, allHullAdditionalConditionsRaw, hullAlternativesRaw,
    warConditionsRaw, allWarConditionsRaw, warSettingsRaw,
    flagStatesRaw, surveyWarrantiesRaw, banks,
    assuredGroupsRaw, customSectionsRaw, agreedValueOptionsRaw, fleetsRaw
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
    window.api.bankGetAll(),
    window.api.getQuotationAssuredGroups(policy.quotationId),
    window.api.getQuotationCustomSections(policy.quotationId),
    window.api.hullGetAgreedValueOptions(policy.quotationId),
    window.api.getFleets()
  ])

  // Filter by selected alternative if policy has one
  const altId = policy.selectedAlternativeId || null
  const filterByAlt = (items: any[]) => {
    if (!altId) return items
    return items.filter((item: any) => !item.alternativeId || item.alternativeId === altId)
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
          const names = classIds.map((c: any) => { const cid = typeof c === 'string' ? c : c.classificationSocietyId; return classSocieties.find((cs: any) => cs.id === cid)?.name }).filter(Boolean)
          if (names.length > 0) vesselClassificationNames[qv.id] = names.join(' / ')
        }
      } catch {}
    }
  } catch {}

  const mergedTexts: PISectionTexts = { ...DEFAULT_SECTION_TEXTS, ...(sectionTexts || {}), ...(quotation.sectionTextsOverride || {}) }

  const safeQVessels = Array.isArray(quotationVessels) ? quotationVessels : []
  const vessel = safeQVessels.find(v => v.vesselId === policy.vesselId) || safeQVessels[0] || null
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
    companyName: reportSettings.companyName || 'Insurance Company',
    assuredGroups: Array.isArray(assuredGroupsRaw) ? assuredGroupsRaw : [],
    customSections: Array.isArray(customSectionsRaw) ? customSectionsRaw : [],
    lolOptions: Array.isArray(lolOptionsRaw) ? lolOptionsRaw : [],
    agreedValueOptions: Array.isArray(agreedValueOptionsRaw) ? agreedValueOptionsRaw : [],
    fleets: Array.isArray(fleetsRaw) ? fleetsRaw : [],
    vesselClassificationNames
  }
}

// ---- Export Snapshot ----

/**
 * Capture all export data for a signed policy and freeze it as a JSON snapshot.
 * Future exports will use this snapshot so documents never change after signing.
 */
export async function capturePolicyExportSnapshot(policyId: string): Promise<void> {
  const data = await loadPolicyExportData(policyId)
  // Strip the exportSnapshot field from the nested policy to avoid storing a snapshot-of-a-snapshot
  const snapshotPolicy = { ...data.policy }
  delete snapshotPolicy.exportSnapshot

  // Capture the signature image so it's frozen with the policy
  let signatureSnapshot: { imageData: number[]; signerName: string } | null = null
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
  const decoded = decodeHtmlEntities(text)
  if (polIsHtml(decoded)) return parseHtmlToParagraphs(decoded, { size: POL_FONT_SIZE, font: 'Arial', color: '000000', alignment: AlignmentType.JUSTIFIED })
  return decoded.split('\n').map(p =>
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
  const nameW = Math.round(POL_BODY_W * 0.45)
  const roleW = Math.round(POL_BODY_W * 0.55)

  // Build insured rows as a borderless table: Name (+ country) | As Role + Address
  const tableRows: TableRow[] = []

  if (data.addresses.length > 0) {
    // Sort addresses to match quotation assured order
    const assuredOrder = data.assureds.map((a: any) => a.entityId || a.entity_id)
    const sortedAddrs = [...data.addresses].sort((a, b) => {
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
      leftChildren.push(new Paragraph({ spacing: { after: 20, line: 240, lineRule: 'auto' as any }, children: nameRuns }))

      // Right: role + address lines
      const rightChildren: Paragraph[] = []
      if (addr.role) rightChildren.push(new Paragraph({ spacing: { after: 20, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `As ${addr.role}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
      const addrText = addr.addressText || addr.address || ''
      if (addrText) {
        for (const line of addrText.split('\n')) {
          if (line.trim()) rightChildren.push(new Paragraph({ spacing: { after: 0, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: line.trim(), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] }))
        }
      }
      if (rightChildren.length === 0) rightChildren.push(polEmptyP())

      tableRows.push(new TableRow({
        children: [
          new TableCell({ width: { size: nameW, type: WidthType.DXA }, borders: polNoBorders(), verticalAlign: VerticalAlign.TOP, children: leftChildren }),
          new TableCell({ width: { size: roleW, type: WidthType.DXA }, borders: polNoBorders(), verticalAlign: VerticalAlign.TOP, children: rightChildren })
        ]
      }))
    }
  } else if (data.assureds.length > 0) {
    for (const a of data.assureds) {
      tableRows.push(new TableRow({
        children: [
          new TableCell({ width: { size: nameW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 20, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: a.name, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
          new TableCell({ width: { size: roleW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 20, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: a.role ? `As ${a.role}` : '', size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] })
        ]
      }))
    }
  }

  if (tableRows.length > 0) {
    content.push(new Table({
      width: { size: POL_BODY_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [nameW, roleW],
      rows: tableRows
    }))
  }

  if (polSt(data, 'insuredFooter')) {
    content.push(polEmptyP())
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
    ['Year Built', vi.built ? (vi.rebuilt ? `${vi.built} - Rebuilt: ${vi.rebuilt}` : String(vi.built)) : '-'],
    ['GT', vi.gt ? Number(vi.gt).toLocaleString() : '-'],
    ['IMO Number', vi.imo || '-'],
    ['Classification', (data.vessel && data.vesselClassificationNames[data.vessel.id]) || vi.classification || '-']
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

  const condCol1W = Math.round(POL_BODY_W * 0.20)
  const condCol2W = POL_BODY_W - condCol1W

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
    width: { size: POL_BODY_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [condCol1W, condCol2W],
    rows: conds.map(qc => {
      const def = data.allHullConditions.find(c => c.id === qc.hullConditionId)
      if (!def) return null
      let text = qc.textOverride || def.text
      const amount = resolveAmount(qc)
      if (def.hasAmount && def.amountPlaceholder && amount != null) {
        const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        text = text.replace(new RegExp(escaped, 'g'), polFormatCurrency(amount, currency))
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
      content.push(polBup('Hull and Machinery'))
      content.push(polEmptyP())
    }
    if (clause) {
      content.push(polNp(decodeHtmlEntities(clause.description || clause.name)))
      content.push(polEmptyP())
    }
    if (dedupedMain.length > 0) content.push(makeCondTable(dedupedMain))

    // IV conditions (separate section)
    if (data.quotation.ivEnabled && ivClauseId) {
      const ivConds = hc.filter(qc => getCondClauseId(qc) === ivClauseId)
      const dedupedIV = dedupConds(ivConds)
      const ivClause = data.hullClauses.find(c => c.id === ivClauseId)
      content.push(polEmptyP())
      content.push(polBup('Increased Value'))
      content.push(polEmptyP())
      if (ivClause) {
        content.push(polNp(decodeHtmlEntities(ivClause.description || ivClause.name)))
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
      content.push(polBup(`Alternative ${i + 1}`))
      content.push(polEmptyP())
      if (clause) { content.push(polNp(decodeHtmlEntities(clause.description || clause.name))); content.push(polEmptyP()) }
      if (altMerged.length > 0) content.push(makeCondTable(altMerged))
      content.push(polEmptyP())
    }
  } else {
    const singleAlt = dAlts[0]
    const selectedClause = singleAlt ? data.hullClauses.find(c => c.id === singleAlt.hullClauseId) : (data.quotation.hullClauseId ? data.hullClauses.find(c => c.id === data.quotation.hullClauseId) : null)
    if (selectedClause) {
      content.push(polNp(decodeHtmlEntities(selectedClause.description || selectedClause.name)))
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
  if (filteredHa.length > 0) {
    if (selectedAlt && data.quotation.ivEnabled && ivClauseId) {
      content.push(polEmptyP())
      content.push(polBup('Applicable to all sections'))
    }
    content.push(polEmptyP())
    for (const qa of filteredHa) {
      const def = data.allHullAdditionalConditions.find(c => c.id === qa.hullAdditionalConditionId)
      if (!def) continue
      let condText = qa.textOverride || def.text
      if (def.hasAmount && def.amountPlaceholder && qa.amount != null) {
        const escaped = def.amountPlaceholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        condText = condText.replace(new RegExp(escaped, 'g'), polFormatCurrency(qa.amount, currency))
      }
      // Issue 3: resolve generic {currency} and {amount} placeholders
      condText = condText.replace(/\{currency\}/g, currency).replace(/\{amount\}/g, qa.amount != null ? polFormatCurrency(qa.amount, currency) : '')
      content.push(polBulletP(decodeHtmlEntities(condText)))
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
      // War P&I Excess: Section 1 (Hull) + Section 2 (P&I in excess)
      const vesselAV = data.vessel?.agreedValue ?? data.quotation.agreedValue ?? 0
      const sec2Amt = (data.vessel as any)?.warExcessAmount ?? data.quotation.warExcessAmount ?? 0
      content.push(polBp(`Section 1: ${polFormatCurrency(vesselAV, wCurrency)} (${numberToWords(vesselAV, wCurrency)})`))
      content.push(polBp(`Section 2: ${polFormatCurrency(sec2Amt, wCurrency)} (${numberToWords(sec2Amt, wCurrency)})`))
      if (data.quotation.warCombinedLimitText) {
        content.push(polEmptyP())
        content.push(polNp(data.quotation.warCombinedLimitText))
      }
    } else if (data.quotation.agreedValue != null) {
      content.push(polBp(`${polFormatCurrency(data.quotation.agreedValue, wCurrency)} (${numberToWords(data.quotation.agreedValue, wCurrency)})`))
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
    if (w) content.push(polBulletP(decodeHtmlEntities(w.text)))
  }
  for (const cw of [...data.customWarranties].sort((a, b) => a.order - b.order)) {
    content.push(polBulletP(decodeHtmlEntities(cw.text)))
  }
  if (data.quotation.quotationTypeCode !== 'W') {
    for (const sw of data.surveyWarranties) content.push(polBulletP(decodeHtmlEntities(sw.text)))
  }
  if (polSt(data, 'warrantiesAdditionalText')) { content.push(polEmptyP()); content.push(...polMp(polSt(data, 'warrantiesAdditionalText'))) }
  if (polSt(data, 'warrantiesBreach')) { content.push(polEmptyP()); content.push(...polMp(polSt(data, 'warrantiesBreach'))) }

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
  const dedAmtW = Math.round(POL_BODY_W * 0.20)
  const dedDescW = POL_BODY_W - dedAmtW

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
      width: { size: POL_BODY_W, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [dedAmtW, dedDescW],
      rows: dedRows
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
  // Priority: instalment sum (most accurate) → policy premium → quotation premium
  const instalmentSum = instalments.reduce((sum, i) => sum + ((i as any).premiumAmount || (i as any).amount || 0), 0)
  const totalPremium = instalmentSum > 0 ? instalmentSum : (data.policy.premiumAmount != null && data.policy.premiumAmount > 0 ? data.policy.premiumAmount : (wq.premiumAmount || 0))
  const timezone = data.policy.timezone || ''

  // War P&I Excess: show Section 1 + Section 2 premium breakdown before intro
  if (wq.quotationTypeCode === 'W' && wq.warExcessEnabled && data.vessel) {
    const s1Rate = wq.premiumRate || 0
    const s2Rate = wq.warExcessRate || 0
    const s1Amt = data.vessel.agreedValue ?? wq.agreedValue ?? 0
    const s2Amt = (data.vessel as any).warExcessAmount ?? wq.warExcessAmount ?? 0
    const s1Prem = (data.vessel as any).warSection1Premium ?? Math.round(s1Amt * s1Rate / 100 * 100) / 100
    const s2Prem = (data.vessel as any).warSection2Premium ?? Math.round((s2Amt - s1Amt) * s2Rate / 100 * 100) / 100
    content.push(polNp(`Section 1: ${polFormatCurrency(s1Prem, currency)} per annum`))
    content.push(polNp(`Section 2: ${polFormatCurrency(s2Prem, currency)} per annum`))
    content.push(polEmptyP())
  }

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
        rows.push(makeRow('Interest', intContent))
      }
      // Agreed Insured Value (amounts)
      const avContent: (Paragraph | Table)[] = []
      const hmCurrency = data.quotation.agreedValueCurrency || 'USD'
      if (polVesselAv != null) avContent.push(polNp(`Section A: ${polFormatCurrency(polVesselAv, hmCurrency)} (${numberToWords(polVesselAv, hmCurrency)})`))
      avContent.push(polNp(`Section B: ${polFormatCurrency(polVesselIv, data.quotation.ivCurrency || hmCurrency)} (${numberToWords(polVesselIv, data.quotation.ivCurrency || hmCurrency)})`))
      rows.push(makeRow('Agreed Insured\nValue', avContent))
    } else if (typeCode === 'W' && data.quotation.warExcessEnabled) {
      // War P&I Excess: Interest section (Section 1/2 descriptions) + Sum Insured (amounts)
      const intContent: (Paragraph | Table)[] = []
      if (data.quotation.warSection1Text) intContent.push(polNp(`Section 1: ${data.quotation.warSection1Text}`))
      if (data.quotation.warSection2Text) intContent.push(polNp(`Section 2: ${data.quotation.warSection2Text}`))
      if (intContent.length > 0) rows.push(makeRow('Interest', intContent))
      const valueContent = polBuildValueSection(data)
      if (valueContent.length > 0) rows.push(makeRow('Sum Insured / Limits', valueContent))
    } else {
      const valueContent = polBuildValueSection(data)
      if (valueContent.length > 0) rows.push(makeRow(polGetValueSectionTitle(typeCode), valueContent))
    }
  }

  // PERIOD
  const periodContent = polBuildPeriodSection(data)
  if (periodContent.length > 0) rows.push(makeRow('Period', periodContent))

  // CONDITIONS
  const conditionsContent = polBuildConditionsSection(data)
  if (conditionsContent.length > 0) rows.push(makeRow('Conditions', conditionsContent))

  // CLASSIFICATION
  const resolvedClassification = (data.vessel && data.vesselClassificationNames[data.vessel.id]) || data.vesselInfo.classification
  if (resolvedClassification) rows.push(makeRow('Classification', [polNp(resolvedClassification)]))

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
  if (sanctionsText) rows.push(makeRow('Sanction Limitation and Exclusion Clause', polMp(decodeHtmlEntities(sanctionsText))))

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
  if (exclusionsContent.length > 0) rows.push(makeRow('Exclusions', exclusionsContent))

  // CUSTOM SECTIONS
  for (const cs of data.customSections) {
    if (cs.text) {
      rows.push(makeRow(cs.title || 'Additional', polMp(cs.text)))
    }
  }

  // SUBJECTIVITIES
  if (data.subjectivities.length > 0) {
    const subjContent: (Paragraph | Table)[] = []
    if (polSt(data, 'subjectivitiesIntro')) subjContent.push(...polMp(polSt(data, 'subjectivitiesIntro')))
    for (const sub of data.subjectivities) subjContent.push(polBulletP(decodeHtmlEntities(sub.text)))
    if (polSt(data, 'subjectivitiesNote')) { subjContent.push(polEmptyP()); subjContent.push(...polMp(polSt(data, 'subjectivitiesNote'))) }
    rows.push(makeRow('Subjectivities', subjContent))
  }

  // NCB (No Claims Bonus)
  if (data.quotation.ncbEnabled && data.quotation.ncbText) {
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
    rows.push(makeRow('No Claims\nBonus (NCB)', ncbContent))
  }

  // UPCC (Upfront Continuity Credit)
  if (data.quotation.upccEnabled && data.quotation.upccText) {
    const upccContent: (Paragraph | Table)[] = []
    let upccText = decodeHtmlEntities(htmlToPlainText(data.quotation.upccText))
    if (data.quotation.upccDiscountPercent != null) upccText = upccText.replace(/\{upcc_percent\}/g, String(data.quotation.upccDiscountPercent))
    if (data.quotation.upccDiscountAmount != null) upccText = upccText.replace(/\{upcc_amount\}/g, polFormatAmountOnly(data.quotation.upccDiscountAmount))
    upccText = upccText.replace(/\{currency\}/g, data.quotation.premiumCurrency || 'USD')
    upccContent.push(...upccText.split('\n').filter(l => l.trim()).map(l => polNp(l)))
    rows.push(makeRow('Upfront\nContinuity\nCredit (UPCC)', upccContent))
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

  // QR Verification reference — P&I only
  try {
    const qrBase = data.quotation.quotationTypeCode === 'P' ? await window.api.getSetting('qr_verification_url') : null
    if (qrBase) {
      const qrFullUrl = `${qrBase}${encodeURIComponent(data.policy.policyNumber)}`
      children.push(polEmptyP())
      children.push(new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({ text: 'Verify: ', size: POL_FONT_SIZE - 2, font: 'Arial', color: '666666', italics: true }),
          new TextRun({ text: qrFullUrl, size: POL_FONT_SIZE - 2, font: 'Arial', color: '0066CC', italics: true })
        ]
      }))
      children.push(polEmptyP())
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
  if (footerText) {
    if (polIsHtml(footerText)) {
      footerChildren.push(...parseHtmlToParagraphs(footerText, { size: 14, font: 'Arial', color: '999999', alignment: AlignmentType.CENTER }))
    } else {
      footerChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: footerText, size: 14, font: 'Arial', color: '999999' })]
      }))
    }
  }
  // Footer layout: left=empty/text, center=page number, right=signature
  if (signatureFooterRun) {
    // Use a table for footer layout: 3 columns (left text | center page | right signature)
    const footerW = POL_CONTENT_W || 9000
    const fColW = Math.round(footerW / 3)
    footerChildren.push(new Table({
      width: { size: footerW, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [fColW, fColW, fColW],
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: fColW, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: [new Paragraph({ spacing: { after: 0 }, children: [] })]
          }),
          new TableCell({
            width: { size: fColW, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: [
                new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: '999999' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '999999' }),
                new TextRun({ text: configTotalPages ? ` of ${configTotalPages}` : '', size: 16, font: 'Arial', color: '999999' })
              ]
            })]
          }),
          new TableCell({
            width: { size: fColW, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                spacing: { after: 0 },
                children: [signatureFooterRun]
              })
            ]
          })
        ]
      })]
    }))
  } else {
    footerChildren.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: '999999' }),
        new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Arial', color: '999999' }),
        new TextRun({ text: configTotalPages ? ` of ${configTotalPages}` : '', size: 16, font: 'Arial', color: '999999' })
      ]
    }))
  }
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
  const vName = data.vesselInfo?.name || ''
  const revSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${vName}${revSuffix}.docx`)

  // Mark policy as exported
  try { await window.api.policyUpdate(policyId, { exportedAt: new Date().toISOString() }) } catch { /* non-critical */ }
}

/**
 * Generate a policy DOCX as an ArrayBuffer (without downloading).
 * Uses capture mode to intercept the blob from exportPolicyDocx.
 */
async function generatePolicyDocxBuffer(policyId: string): Promise<{ buffer: ArrayBuffer; fileName: string; typeCode: string }> {
  const data = await loadPolicyExportData(policyId)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const vName = data.vesselInfo?.name || ''
  const revSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  const fileName = `${data.policy.policyNumber} - ${vName}${revSuffix}`

  // Enable capture mode so polDownloadBlob stores blob instead of downloading
  _polCaptureMode = true
  _polCapturedBlob = null
  try {
    await exportPolicyDocx(policyId)
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
 * Pipeline:
 * 1. Generate policy DOCX in renderer
 * 2. Send to main process for Word COM conversion to PDF
 * 3. Main process appends T&C with correct page numbering
 * 4. Download the merged PDF
 */
export async function exportPolicyPdfWithTC(policyId: string): Promise<void> {
  // Check if T&C template exists for this policy type
  const data = await loadPolicyExportData(policyId)
  const typeCode = data.quotation.quotationTypeCode || 'P'

  const tcTemplate = await window.api.tcGetTemplate(typeCode)
  if (!tcTemplate || (tcTemplate as any).error) {
    throw new Error('No T&C template uploaded for this policy type. Upload one in Policy Settings > T&C Templates.')
  }

  // Generate the policy DOCX blob
  const { buffer, fileName } = await generatePolicyDocxBuffer(policyId)
  const policyDocxData = Array.from(new Uint8Array(buffer))

  // Send to main process for conversion and merging
  const result = await window.api.convertBuildPolicyWithTC({
    policyDocxData,
    tcTypeCode: typeCode,
    filePrefix: fileName
  })

  if (!result || (result as any).error) {
    throw new Error((result as any)?.message || 'PDF conversion failed')
  }

  // Download the merged PDF
  const pdfBlob = new Blob([new Uint8Array(result.data)], { type: 'application/pdf' })
  polDownloadBlob(pdfBlob, result.fileName)

  // Mark policy as exported
  try { await window.api.policyUpdate(policyId, { exportedAt: new Date().toISOString() }) } catch { /* non-critical */ }
}

// ==================== Shared DA/CA Helpers ====================

/** Build the same header paragraphs used by the policy export (company details + title line) */
async function polBuildAdviceHeader(
  data: PolicyExportData,
  titleLine: string
): Promise<Paragraph[]> {
  const headerParas: Paragraph[] = []
  const headerHtml = polSt(data, 'docHeader')
  const headerSpacing = (data.sectionTexts as any).docHeaderSpacing || undefined
  if (headerHtml) {
    headerParas.push(...parseHtmlToParagraphs(headerHtml, { size: 18, font: 'Times New Roman', color: '666666', lineSpacing: headerSpacing }))
  }
  headerParas.push(new Paragraph({ spacing: { after: 80 }, children: [] }))
  headerParas.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    children: [new TextRun({ text: titleLine, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
  }))
  const vesselName = data.vesselInfo?.name || ''
  if (vesselName) {
    headerParas.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children: [new TextRun({ text: `M/V ${vesselName.toUpperCase()}`, size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })]
    }))
  }
  headerParas.push(new Paragraph({ spacing: { after: 60 }, children: [] }))
  return headerParas
}

/** Build footer for DA/CA — footer text only, NO page number */
async function polBuildAdviceFooter(
  sigBuf: Uint8Array | null
): Promise<Footer> {
  const footerChildren: (Paragraph | Table)[] = []
  let footerText = ''
  try {
    const settings = await window.api.getSetting('policyExportSettings')
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.footerText) footerText = parsed.footerText
    }
  } catch { /* ignore */ }

  if (footerText) {
    if (polIsHtml(footerText)) {
      footerChildren.push(...parseHtmlToParagraphs(footerText, { size: 14, font: 'Arial', color: '999999', alignment: AlignmentType.CENTER }))
    } else {
      footerChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 20 },
        children: [new TextRun({ text: footerText, size: 14, font: 'Arial', color: '999999' })]
      }))
    }
  }

  // Signature in footer (right-aligned) if signed
  if (sigBuf) {
    const footerW = POL_CONTENT_W || 9000
    const fColLeft = Math.round(footerW * 0.67)
    const fColRight = footerW - fColLeft
    footerChildren.push(new Table({
      width: { size: footerW, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [fColLeft, fColRight],
      rows: [new TableRow({
        children: [
          new TableCell({
            width: { size: fColLeft, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: [new Paragraph({ spacing: { after: 0 }, children: [] })]
          }),
          new TableCell({
            width: { size: fColRight, type: WidthType.DXA },
            borders: polNoBorders(),
            verticalAlign: VerticalAlign.BOTTOM,
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { after: 0 },
              children: [new ImageRun({
                data: sigBuf,
                transformation: { width: 120, height: 60 },
                type: 'png'
              })]
            })]
          })
        ]
      })]
    }))
  }

  if (footerChildren.length === 0) footerChildren.push(polEmptyP())
  return new Footer({ children: footerChildren })
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
function polBuildInstalmentTable(
  instalments: PolicyInstalment[],
  amountFn: (inst: PolicyInstalment) => number,
  currency: string
): Table {
  const labelW = Math.round(POL_BODY_W * 0.40)
  const dateW = Math.round(POL_BODY_W * 0.35)
  const amtW = POL_BODY_W - labelW - dateW
  return new Table({
    width: { size: POL_BODY_W, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, dateW, amtW],
    rows: instalments.map(inst => new TableRow({
      children: [
        new TableCell({ width: { size: labelW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: `${polOrdinal(inst.instalmentNumber)} Instalment`, size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
        new TableCell({ width: { size: dateW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: polFormatDateUS(inst.dueDate), size: POL_FONT_SIZE, font: 'Arial', color: '000000' })] })] }),
        new TableCell({ width: { size: amtW, type: WidthType.DXA }, borders: polNoBorders(), children: [new Paragraph({ spacing: { after: 40, line: 240, lineRule: 'auto' as any }, children: [new TextRun({ text: polFormatCurrency(amountFn(inst), currency), size: POL_FONT_SIZE, font: 'Arial', color: '000000', bold: true })] })] })
      ]
    }))
  })
}

// ==================== Debit Advice Export ====================

export async function exportDebitAdviceDocx(policyId: string): Promise<void> {
  await loadPolicyFontSize()
  const data = await loadPolicyExportData(policyId)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const typeName = data.quotation.quotationTypeName || polGetTypeLabel(typeCode)
  const currency = data.quotation.premiumCurrency || 'USD'

  // Load header title setting
  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull & Machinery Certificate',
    W: 'War Risk Certificate'
  }
  try {
    const settings = await window.api.getSetting('policyExportSettings')
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = headerTitles[typeCode] || 'Certificate'

  // Load signature
  const { sigBuf, signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  // Build header + footer
  const headerParas = await polBuildAdviceHeader(data, `${headerTitle} ${data.policy.policyNumber}`)
  const adviceFooter = await polBuildAdviceFooter(sigBuf)

  const children: (Paragraph | Table)[] = []

  // Title block — centered
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'DEBIT ADVICE', size: 28, font: 'Arial', color: '000000', bold: true, underline: {} })]
  }))
  children.push(polCenteredP('In connection with'))
  children.push(polCenteredP(`${typeName} Certificate ${data.policy.policyNumber}`))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, line: 240, lineRule: 'auto' as any },
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

  // PREMIUM
  const totalPremium = data.instalments.reduce((sum, i) => sum + (i.premiumAmount || i.amount || 0), 0) || data.policy.premiumAmount || data.quotation.premiumAmount || 0
  const premiumContent: (Paragraph | Table)[] = [
    polBp(polFormatCurrency(totalPremium, currency)),
    polNp(`(${numberToWords(totalPremium, currency)})`)
  ]
  rows.push(makeRow('Premium', premiumContent))

  // PREMIUM PAYMENT CONDITION PRECEDENT
  const ppcpContent: (Paragraph | Table)[] = []
  const numInst = data.instalments.length || 1
  if (numInst === 1) {
    ppcpContent.push(polNp('Premium shall be payable in a single instalment.'))
  } else {
    ppcpContent.push(polNp(`Premium payable in ${numInst} instalments:`))
  }
  ppcpContent.push(polEmptyP())

  if (data.instalments.length > 0) {
    ppcpContent.push(polBuildInstalmentTable(
      data.instalments,
      (inst) => inst.premiumAmount || inst.amount || 0,
      currency
    ))
    ppcpContent.push(polEmptyP())
  }

  // Non-refundable note
  if (data.quotation.nonRefundableType) {
    let nrText = ''
    if (data.quotation.nonRefundableType === 'first_instalment') {
      nrText = 'The first instalment is deemed to be non-refundable.'
    } else if (data.quotation.nonRefundableType === 'percentage' && data.quotation.nonRefundablePercent) {
      nrText = `${polFmtPct(data.quotation.nonRefundablePercent)}% of premium is non-refundable.`
    }
    if (nrText) ppcpContent.push(polNp(nrText))
  }

  rows.push(makeRow('Premium\nPayment\nCondition\nPrecedent', ppcpContent))

  // PERIOD
  rows.push(makeRow('Period', polBuildPeriodParagraphs(data)))

  // BANK DETAILS
  if (data.bank) {
    const bankContent: (Paragraph | Table)[] = []
    bankContent.push(polBp(data.bank.name))
    for (const line of data.bank.details.split('\n')) {
      if (line.trim()) bankContent.push(polNp(line.trim()))
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
      headers: { default: new Header({ children: headerParas.length > 0 ? headerParas : [polEmptyP()] }) },
      footers: { default: adviceFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const daVName = data.vesselInfo?.name || ''
  const daRevSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${daVName} - Debit Advice${daRevSuffix}.docx`)
}

// ==================== Credit Advice Export ====================

export async function exportCreditAdviceDocx(policyId: string): Promise<void> {
  await loadPolicyFontSize()
  const data = await loadPolicyExportData(policyId)
  const typeCode = data.quotation.quotationTypeCode || 'P'
  const typeName = data.quotation.quotationTypeName || polGetTypeLabel(typeCode)
  const currency = data.quotation.premiumCurrency || 'USD'

  // Load header title setting
  let headerTitles: Record<string, string> = {
    P: 'Protection and Indemnity Certificate',
    H: 'Hull & Machinery Certificate',
    W: 'War Risk Certificate'
  }
  try {
    const settings = await window.api.getSetting('policyExportSettings')
    if (settings) {
      const parsed = JSON.parse(settings)
      if (parsed.headerTitles) headerTitles = { ...headerTitles, ...parsed.headerTitles }
    }
  } catch { /* ignore */ }
  const headerTitle = headerTitles[typeCode] || 'Certificate'

  // Load signature
  const { sigBuf, signatureImageRun } = await polLoadSignature(policyId, (data as any).signatureSnapshot)

  // Build header + footer
  const headerParas = await polBuildAdviceHeader(data, `${headerTitle} ${data.policy.policyNumber}`)
  const adviceFooter = await polBuildAdviceFooter(sigBuf)

  const children: (Paragraph | Table)[] = []

  // Broker block — left-aligned, before title, NOT in the two-column table
  const broker = data.assureds.find(a => a.role?.toLowerCase().includes('broker'))
  if (broker) {
    children.push(polBp(broker.name))
    const brokerAddr = data.addresses.find(a => a.entityName === broker.name || a.role?.toLowerCase().includes('broker'))
    const addrText = brokerAddr?.addressText || brokerAddr?.address || ''
    if (addrText) {
      for (const line of addrText.split('\n')) {
        if (line.trim()) children.push(polNp(line.trim()))
      }
    }
    // Phone / email from entity
    const brokerEntity = data.assureds.find(a => a.role?.toLowerCase().includes('broker'))
    if (brokerEntity) {
      if ((brokerEntity as any).phone) children.push(polNp(`Phone: ${(brokerEntity as any).phone}`))
      if ((brokerEntity as any).email) children.push(polNp(`${(brokerEntity as any).email}`))
    }
    children.push(polEmptyP())
  }

  // Title block — centered
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 80, line: 240, lineRule: 'auto' as any },
    children: [new TextRun({ text: 'CREDIT ADVICE', size: 28, font: 'Arial', color: '000000', bold: true, underline: {} })]
  }))
  children.push(polCenteredP('In connection with'))
  children.push(polCenteredP(`${typeName} Certificate ${data.policy.policyNumber}`))
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200, line: 240, lineRule: 'auto' as any },
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

  // CREDIT AMOUNT
  const totalPremium = data.instalments.reduce((sum, i) => sum + (i.premiumAmount || i.amount || 0), 0) || data.policy.premiumAmount || data.quotation.premiumAmount || 0
  const commissionPercent = data.policy.commissionPercent || 0
  const commissionAmount = totalPremium * commissionPercent / 100
  const creditContent: (Paragraph | Table)[] = [
    polBp(polFormatCurrency(commissionAmount, currency)),
    polNp(`(${numberToWords(commissionAmount, currency)})`)
  ]
  rows.push(makeRow('Credit Amount', creditContent))

  // DETAILS
  const detailsContent: (Paragraph | Table)[] = []
  detailsContent.push(polNp(`Being ${polFmtPct(commissionPercent)}% Commission on Premium ${polFormatCurrency(totalPremium, currency)}`))
  detailsContent.push(polEmptyP())

  if (data.instalments.length > 0) {
    const numInst = data.instalments.length
    if (numInst === 1) {
      detailsContent.push(polNp('Commission payable in a single instalment.'))
    } else {
      detailsContent.push(polNp(`Commission payable in ${numInst} instalments:`))
    }
    detailsContent.push(polEmptyP())

    detailsContent.push(polBuildInstalmentTable(
      data.instalments,
      (inst) => inst.commissionAmount != null ? inst.commissionAmount : ((inst.premiumAmount || inst.amount || 0) * commissionPercent / 100),
      currency
    ))
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
      headers: { default: new Header({ children: headerParas.length > 0 ? headerParas : [polEmptyP()] }) },
      footers: { default: adviceFooter },
      children: children as any[]
    }]
  })

  const blob = await Packer.toBlob(document)
  const caVName = data.vesselInfo?.name || ''
  const caRevSuffix = data.policy.revisionNumber > 0 ? ` - R${data.policy.revisionNumber}` : ''
  polDownloadBlob(blob, `${data.policy.policyNumber} - ${caVName} - Credit Advice${caRevSuffix}.docx`)
}
