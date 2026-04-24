import XLSX from 'xlsx-js-style'
import { existsSync } from 'fs'
import { execSync } from 'child_process'

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

// ── Read helpers (xlsx-js-style, non-destructive) ─────────────────────────────

function getYearSheet(filePath: string): { wb: XLSX.WorkBook; ws: XLSX.WorkSheet; sheetName: string } {
  const year = String(new Date().getFullYear())
  if (!existsSync(filePath)) throw new Error('Registry file not found')

  const wb = XLSX.readFile(filePath, { cellFormula: true, cellStyles: true })
  const ws = wb.Sheets[year]
  if (!ws) throw new Error(`No sheet found for year ${year}`)

  return { wb, ws, sheetName: year }
}

function getLastSerial(ws: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  // Scan from bottom up in column D (index 3) to find last serial
  for (let r = range.e.r; r >= 2; r--) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 3 })]
    if (cell && typeof cell.v === 'number' && cell.v > 0) return cell.v
  }
  return 0
}

// ── Write helpers (PowerShell + Excel COM, preserves tables/formulas) ─────────

function runExcelPowerShell(script: string): string {
  // Escape single quotes in the script for PowerShell
  const escaped = script.replace(/'/g, "''")
  try {
    return execSync(
      `powershell -NoProfile -Command "${escaped}"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim()
  } catch (err: any) {
    throw new Error(`Excel operation failed: ${err.stderr || err.message}`)
  }
}

function appendRowViaExcel(
  filePath: string,
  sheetName: string,
  rowData: (string | number)[]
): void {
  // Build PowerShell script that opens Excel, finds the sheet, appends a row, saves
  // Skip col 1 (date) — handled separately below
  const cellAssignments = rowData.slice(1).map((val, i) => {
    const col = i + 2 // starts at column 2 (B)
    if (typeof val === 'number') {
      return `$ws.Cells.Item($newRow, ${col}).Value2 = ${val}`
    }
    const escaped = String(val).replace(/'/g, "''")
    return `$ws.Cells.Item($newRow, ${col}).Value2 = '${escaped}'`
  }).join('\n')

  // Column 1 (A) = today's date with dd/mm/yyyy format
  const dateAssignment = `$ws.Cells.Item($newRow, 1).Value2 = Get-Date
$ws.Cells.Item($newRow, 1).NumberFormat = 'dd/mm/yyyy'`

  const ps = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open('${filePath.replace(/'/g, "''")}')
  $ws = $wb.Sheets.Item('${sheetName}')
  $usedRange = $ws.UsedRange
  $newRow = $usedRange.Row + $usedRange.Rows.Count
  ${dateAssignment}
  ${cellAssignments}
  $wb.Save()
  $wb.Close()
  Write-Output "OK:$newRow"
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`
  const result = runExcelPowerShell(ps)
  if (result.startsWith('ERR:')) {
    throw new Error(result.substring(4))
  }
}

function setCellViaExcel(
  filePath: string,
  sheetName: string,
  row: number,
  col: number,
  value: string
): void {
  const ps = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open('${filePath.replace(/'/g, "''")}')
  $ws = $wb.Sheets.Item('${sheetName}')
  $ws.Cells.Item(${row}, ${col}).Value2 = '${value.replace(/'/g, "''")}'
  $wb.Save()
  $wb.Close()
  Write-Output 'OK'
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`
  const result = runExcelPowerShell(ps)
  if (result.startsWith('ERR:')) {
    throw new Error(result.substring(4))
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function assignRegistryNumber(
  filePath: string,
  data: {
    isRenewal: boolean
    typeCode: string
    managers: string
    vessel: string
    imo: string
    vesselType: string
    broker: string
  }
): { reference: string; serial: number } {
  const { ws, sheetName } = getYearSheet(filePath)
  const lastSerial = getLastSerial(ws)
  const nextSerial = lastSerial + 1

  const yearShort = String(new Date().getFullYear()).slice(-2)
  const quotationType = data.isRenewal ? 'R:Renewal' : 'N:New Quotation'
  const quotationTypeCode = data.isRenewal ? 'R' : 'N'
  const branch = BRANCH_MAP[data.typeCode] || `${data.typeCode}:${data.typeCode}`
  const reference = `Q/${quotationTypeCode}/${data.typeCode}/${yearShort}/${nextSerial}`

  // Row data: skip col 1 (date handled separately in appendRowViaExcel)
  // Cols: A=Date, B=QuotationType, C=Branch, D=Serial, E=Reference, F=Managers, G=Vessel, H=IMO, I=Type, J=Broker
  appendRowViaExcel(filePath, sheetName, [
    0, // placeholder for date (handled by PowerShell)
    quotationType,
    branch,
    nextSerial,
    reference,
    data.managers || '',
    data.vessel || '',
    data.imo || '',
    data.vesselType || '',
    data.broker || '',
  ])

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
  const { ws, sheetName } = getYearSheet(filePath)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const REMARKS_COL = 11 // Column K in Excel (1-based)

  // Find the row with this reference (column E = index 4, 0-based)
  for (let r = 2; r <= range.e.r; r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 4 })]
    if (refCell && refCell.v === reference) {
      // Excel rows are 1-based, xlsx-js-style rows are 0-based
      setCellViaExcel(filePath, sheetName, r + 1, REMARKS_COL, 'CANCELLED')
      return
    }
  }
}
