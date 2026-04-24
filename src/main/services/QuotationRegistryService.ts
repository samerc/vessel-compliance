import XLSX from 'xlsx-js-style'
import { existsSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'

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

const HEADERS = ['Date', 'Quotation Type', 'Branch', 'Seq. Number', 'Reference', 'Managers', 'Vessel', 'IMO', 'Type', 'Broker', 'Remarks']

// ── Excel COM availability check ──────────────────────────────────────────────

let excelComAvailable: boolean | null = null

function checkExcelCom(): boolean {
  if (excelComAvailable !== null) return excelComAvailable
  try {
    execSync(
      'powershell -NoProfile -Command "New-Object -ComObject Excel.Application | ForEach-Object { $_.Quit() }"',
      { stdio: 'pipe', timeout: 10000 }
    )
    excelComAvailable = true
  } catch {
    excelComAvailable = false
  }
  return excelComAvailable
}

// ── Read helpers (xlsx-js-style, non-destructive) ─────────────────────────────

function getYearSheetReadOnly(filePath: string): { ws: XLSX.WorkSheet; sheetName: string } {
  const year = String(new Date().getFullYear())
  if (!existsSync(filePath)) throw new Error('Registry file not found')

  const wb = XLSX.readFile(filePath, { cellFormula: true, cellStyles: true })
  const ws = wb.Sheets[year]
  if (!ws) throw new Error(`No sheet found for year ${year}`)

  return { ws, sheetName: year }
}

function getLastSerial(ws: XLSX.WorkSheet): number {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let r = range.e.r; r >= 2; r--) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 3 })]
    if (cell && typeof cell.v === 'number' && cell.v > 0) return cell.v
  }
  return 0
}

// ── Write via Excel COM (preserves tables/formulas) ───────────────────────────

function runPowerShellScript(script: string): string {
  const { tmpdir } = require('os')
  const tempFile = join(tmpdir(), `vc-registry-${Date.now()}.ps1`)
  try {
    writeFileSync(tempFile, script, 'utf-8')
    return execSync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempFile}"`,
      { encoding: 'utf-8', timeout: 30000 }
    ).trim()
  } catch (err: any) {
    throw new Error(`Excel COM failed: ${err.stderr || err.message}`)
  } finally {
    try { require('fs').unlinkSync(tempFile) } catch { /* ignore */ }
  }
}

function appendRowViaCom(
  filePath: string,
  sheetName: string,
  values: { quotationType: string; branch: string; serial: number; reference: string; managers: string; vessel: string; imo: string; vesselType: string; broker: string }
): void {
  const esc = (s: string) => s.replace(/'/g, "''")
  const ps = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open('${esc(filePath)}')
  $ws = $wb.Sheets.Item('${esc(sheetName)}')
  $usedRange = $ws.UsedRange
  $newRow = $usedRange.Row + $usedRange.Rows.Count
  $ws.Cells.Item($newRow, 1).Value2 = Get-Date
  $ws.Cells.Item($newRow, 1).NumberFormat = 'dd/mm/yyyy'
  $ws.Cells.Item($newRow, 2).Value2 = '${esc(values.quotationType)}'
  $ws.Cells.Item($newRow, 3).Value2 = '${esc(values.branch)}'
  $ws.Cells.Item($newRow, 4).Value2 = ${values.serial}
  $ws.Cells.Item($newRow, 5).Value2 = '${esc(values.reference)}'
  $ws.Cells.Item($newRow, 6).Value2 = '${esc(values.managers)}'
  $ws.Cells.Item($newRow, 7).Value2 = '${esc(values.vessel)}'
  $ws.Cells.Item($newRow, 8).Value2 = '${esc(values.imo)}'
  $ws.Cells.Item($newRow, 9).Value2 = '${esc(values.vesselType)}'
  $ws.Cells.Item($newRow, 10).Value2 = '${esc(values.broker)}'
  $wb.Save()
  $wb.Close()
  Write-Output "OK"
} catch {
  Write-Output "ERR:$($_.Exception.Message)"
} finally {
  $excel.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
`
  const result = runPowerShellScript(ps)
  if (result.startsWith('ERR:')) {
    throw new Error(result.substring(4))
  }
  if (!result.startsWith('OK')) {
    throw new Error(`Unexpected Excel COM result: ${result}`)
  }
}

function setCellViaCom(filePath: string, sheetName: string, row: number, col: number, value: string): void {
  const esc = (s: string) => s.replace(/'/g, "''")
  const ps = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open('${esc(filePath)}')
  $ws = $wb.Sheets.Item('${esc(sheetName)}')
  $ws.Cells.Item(${row}, ${col}).Value2 = '${esc(value)}'
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
  const result = runPowerShellScript(ps)
  if (result.startsWith('ERR:')) {
    throw new Error(result.substring(4))
  }
}

// ── Write via xlsx-js-style (fallback when Excel not installed) ───────────────

function appendRowViaXlsx(filePath: string, sheetName: string, values: { quotationType: string; branch: string; serial: number; reference: string; managers: string; vessel: string; imo: string; vesselType: string; broker: string }): void {
  const wb = XLSX.readFile(filePath, { cellFormula: true, cellStyles: true })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet ${sheetName} not found`)

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const newRow = range.e.r + 1

  const dateSerial = (Date.now() - new Date(1899, 11, 30).getTime()) / (24 * 60 * 60 * 1000)
  const cells: [number, any][] = [
    [0, { v: dateSerial, t: 'n', z: 'dd/mm/yyyy' }],
    [1, { v: values.quotationType, t: 's' }],
    [2, { v: values.branch, t: 's' }],
    [3, { v: values.serial, t: 'n' }],
    [4, { v: values.reference, t: 's' }],
    [5, { v: values.managers, t: 's' }],
    [6, { v: values.vessel, t: 's' }],
    [7, { v: values.imo, t: 's' }],
    [8, { v: values.vesselType, t: 's' }],
    [9, { v: values.broker, t: 's' }],
  ]
  cells.forEach(([c, cell]) => {
    ws[XLSX.utils.encode_cell({ r: newRow, c })] = cell
  })
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: newRow, c: HEADERS.length - 1 } })
  XLSX.writeFile(wb, filePath)
}

function setCellViaXlsx(filePath: string, sheetName: string, row0based: number, col0based: number, value: string): void {
  const wb = XLSX.readFile(filePath, { cellFormula: true, cellStyles: true })
  const ws = wb.Sheets[sheetName]
  if (!ws) return
  ws[XLSX.utils.encode_cell({ r: row0based, c: col0based })] = { v: value, t: 's' }
  XLSX.writeFile(wb, filePath)
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
  const { ws, sheetName } = getYearSheetReadOnly(filePath)
  const lastSerial = getLastSerial(ws)
  const nextSerial = lastSerial + 1

  const yearShort = String(new Date().getFullYear()).slice(-2)
  const quotationType = data.isRenewal ? 'R:Renewal' : 'N:New Quotation'
  const quotationTypeCode = data.isRenewal ? 'R' : 'N'
  const branch = BRANCH_MAP[data.typeCode] || `${data.typeCode}:${data.typeCode}`
  const reference = `Q/${quotationTypeCode}/${data.typeCode}/${yearShort}/${nextSerial}`

  const values = {
    quotationType, branch, serial: nextSerial, reference,
    managers: data.managers || '', vessel: data.vessel || '',
    imo: data.imo || '', vesselType: data.vesselType || '', broker: data.broker || ''
  }

  if (checkExcelCom()) {
    appendRowViaCom(filePath, sheetName, values)
  } else {
    appendRowViaXlsx(filePath, sheetName, values)
  }

  return { reference, serial: nextSerial }
}

/** Read the last serial number without writing (for preview) */
export function getLastRegistrySerial(filePath: string): number {
  if (!existsSync(filePath)) return 0
  const { ws } = getYearSheetReadOnly(filePath)
  return getLastSerial(ws)
}

/** Mark a registry entry as cancelled */
export function markRegistryCancelled(filePath: string, reference: string): void {
  if (!existsSync(filePath)) return
  const { ws, sheetName } = getYearSheetReadOnly(filePath)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  for (let r = 2; r <= range.e.r; r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 4 })]
    if (refCell && refCell.v === reference) {
      if (checkExcelCom()) {
        setCellViaCom(filePath, sheetName, r + 1, 11, 'CANCELLED') // 1-based row, col K=11
      } else {
        setCellViaXlsx(filePath, sheetName, r, 10, 'CANCELLED') // 0-based row, col K=10
      }
      return
    }
  }
}
