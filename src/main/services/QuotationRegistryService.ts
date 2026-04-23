import XLSX from 'xlsx-js-style'
import { existsSync } from 'fs'

const BRANCH_MAP: Record<string, string> = {
  P: 'P:P&I',
  H: 'H:Hull',
  W: 'W:War',
  C: 'C:Cargo',
  F: 'F:FD&D',
  L: 'L:Loss of Hire',
  V: 'V:Voyage',
  Y: 'Y:Yacht',
}

const HEADERS = ['Date', 'Quotation Type', 'Branch', 'Seq. Number', 'Reference', 'Managers', 'Vessel', 'IMO', 'Type', 'Broker', 'Status']

function getYearSheet(filePath: string): { wb: XLSX.WorkBook; ws: XLSX.WorkSheet; sheetName: string } {
  const year = String(new Date().getFullYear())
  let wb: XLSX.WorkBook

  if (existsSync(filePath)) {
    wb = XLSX.readFile(filePath)
  } else {
    wb = XLSX.utils.book_new()
  }

  let ws = wb.Sheets[year]
  if (!ws) {
    // Create new year sheet with headers on row 2 (row 1 is blank, matching existing format)
    ws = XLSX.utils.aoa_to_sheet([[]])
    // Row 2 = headers (index 1)
    HEADERS.forEach((h, c) => {
      ws[XLSX.utils.encode_cell({ r: 1, c })] = { v: h, t: 's' }
    })
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1, c: HEADERS.length - 1 } })
    XLSX.utils.book_append_sheet(wb, ws, year)
  }

  return { wb, ws, sheetName: year }
}

function getLastSerial(ws: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  // Scan from bottom up in column D (index 3) to find last serial
  for (let r = range.e.r; r >= 2; r--) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 3 })]
    if (cell && typeof cell.v === 'number' && cell.v > 0) return cell.v
  }
  // Check Sheet2 for starting number if exists (fallback)
  return 0
}

export function assignRegistryNumber(
  filePath: string,
  data: {
    isRenewal: boolean
    typeCode: string // P, H, W, C, etc.
    managers: string
    vessel: string
    imo: string
    vesselType: string
    broker: string
  }
): { reference: string; serial: number } {
  const { wb, ws } = getYearSheet(filePath)
  const lastSerial = getLastSerial(ws)
  const nextSerial = lastSerial + 1

  const yearShort = String(new Date().getFullYear()).slice(-2)
  const quotationType = data.isRenewal ? 'R:Renewal' : 'N:New Quotation'
  const quotationTypeCode = data.isRenewal ? 'R' : 'N'
  const branch = BRANCH_MAP[data.typeCode] || `${data.typeCode}:${data.typeCode}`
  const reference = `Q/${quotationTypeCode}/${data.typeCode}/${yearShort}/${nextSerial}`

  // Find next empty row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const newRow = range.e.r + 1

  // Write row
  const dateSerial = (Date.now() - new Date(1899, 11, 30).getTime()) / (24 * 60 * 60 * 1000)
  const rowData = [
    { v: dateSerial, t: 'n', z: 'dd/mm/yyyy' },
    { v: quotationType, t: 's' },
    { v: branch, t: 's' },
    { v: nextSerial, t: 'n' },
    { v: reference, t: 's' },
    { v: data.managers || '', t: 's' },
    { v: data.vessel || '', t: 's' },
    { v: data.imo || '', t: 's' },
    { v: data.vesselType || '', t: 's' },
    { v: data.broker || '', t: 's' },
  ]

  rowData.forEach((cell, c) => {
    ws[XLSX.utils.encode_cell({ r: newRow, c })] = cell
  })

  // Update range
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: newRow, c: HEADERS.length - 1 }
  })

  // Save
  XLSX.writeFile(wb, filePath)

  return { reference, serial: nextSerial }
}

/** Read the last serial number without writing (for preview) */
export function getLastRegistrySerial(filePath: string): number {
  if (!existsSync(filePath)) return 0
  const { ws } = getYearSheet(filePath)
  return getLastSerial(ws)
}

/** Mark a registry entry as cancelled by finding the reference in the current year sheet */
export function markRegistryCancelled(filePath: string, reference: string): void {
  if (!existsSync(filePath)) return
  const { wb, ws } = getYearSheet(filePath)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const STATUS_COL = 10 // Column K

  // Find the row with this reference (column E = index 4)
  for (let r = 2; r <= range.e.r; r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 4 })]
    if (refCell && refCell.v === reference) {
      ws[XLSX.utils.encode_cell({ r, c: STATUS_COL })] = { v: 'CANCELLED', t: 's' }
      // Extend range if needed
      if (range.e.c < STATUS_COL) {
        ws['!ref'] = XLSX.utils.encode_range({ s: range.s, e: { r: range.e.r, c: STATUS_COL } })
      }
      XLSX.writeFile(wb, filePath)
      return
    }
  }
}
