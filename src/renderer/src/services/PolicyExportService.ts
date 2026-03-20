import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, PageBreak
} from 'docx'
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
