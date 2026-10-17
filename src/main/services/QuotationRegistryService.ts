import XLSX from 'xlsx-js-style'
import { existsSync } from 'fs'
import { readFile, writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'

// Everything here is async: the Excel COM calls take seconds (up to 30 s) and the registry is
// usually on a network share, so a synchronous call froze the whole app for every user action
const execFileAsync = promisify(execFile)

const BRANCH_MAP: Record<string, string> = {
  P: 'P:P&I',
  H: 'H:Hull',
  W: 'W:War',
  C: 'C:Cargo',
  F: 'F:FD&D',
  L: 'L:Loss of Hire',
  V: 'V:Voyage',
  Y: 'Y:Yacht'
}

const HEADERS = [
  'Date',
  'Quotation Type',
  'Branch',
  'Seq. Number',
  'Reference',
  'Managers',
  'Vessel',
  'IMO',
  'Type',
  'Broker',
  'Remarks'
]

// ── Excel COM availability check ──────────────────────────────────────────────

let excelComAvailable: Promise<boolean> | null = null

function checkExcelCom(): Promise<boolean> {
  if (!excelComAvailable) {
    excelComAvailable = execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'New-Object -ComObject Excel.Application | ForEach-Object { $_.Quit() }'
      ],
      { timeout: 10000, windowsHide: true }
    ).then(
      () => true,
      () => false
    )
  }
  return excelComAvailable
}

// ── Read helpers (xlsx-js-style, non-destructive) ─────────────────────────────

/** Workbook from the file, read without blocking (network share); `sheets` limits parsing */
async function readWorkbook(filePath: string, opts: XLSX.ParsingOptions): Promise<XLSX.WorkBook> {
  return XLSX.read(await readFile(filePath), { ...opts, type: 'buffer' })
}

async function getYearSheetReadOnly(
  filePath: string
): Promise<{ ws: XLSX.WorkSheet; sheetName: string }> {
  const year = String(new Date().getFullYear())
  if (!existsSync(filePath)) throw new Error('Registry file not found')

  // Only values are read here (serial, reference): parse just this year's sheet
  const wb = await readWorkbook(filePath, { sheets: [year] })
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

// User data (file path, vessel/broker names, references) NEVER goes into the script text:
// it is written to a UTF-8 JSON file and read by the script as $d. Interpolating it into
// '...' strings is unsafe — PowerShell also treats the curly quotes ‘ ’ ‚ ‛ as string
// delimiters, so a name like O’BRIEN could break out of the string.
async function runPowerShellScript(body: string, data: Record<string, unknown>): Promise<string> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const tempFile = join(tmpdir(), `vc-registry-${stamp}.ps1`)
  const dataFile = join(tmpdir(), `vc-registry-${stamp}.json`)
  const script = [
    'param([string]$DataPath)',
    '$d = Get-Content -Raw -Encoding UTF8 -LiteralPath $DataPath | ConvertFrom-Json',
    body
  ].join('\n')
  try {
    // BOM so Windows PowerShell 5.1 reads the script as UTF-8, not the ANSI code page
    await writeFile(tempFile, '﻿' + script, 'utf-8')
    await writeFile(dataFile, JSON.stringify(data), 'utf-8')
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tempFile, '-DataPath', dataFile],
      { encoding: 'utf-8', timeout: 30000, windowsHide: true }
    )
    return stdout.trim()
  } catch (err) {
    const e = err as { stderr?: string; message?: string }
    throw new Error(`Excel COM failed: ${e.stderr || e.message}`, { cause: err })
  } finally {
    await unlink(tempFile).catch(() => {})
    await unlink(dataFile).catch(() => {})
  }
}

async function appendRowViaCom(
  filePath: string,
  sheetName: string,
  values: {
    quotationType: string
    branch: string
    serial: number
    reference: string
    managers: string
    vessel: string
    imo: string
    vesselType: string
    broker: string
  }
): Promise<void> {
  const ps = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open([string]$d.filePath)
  $ws = $wb.Sheets.Item([string]$d.sheetName)
  $usedRange = $ws.UsedRange
  $newRow = $usedRange.Row + $usedRange.Rows.Count
  $ws.Cells.Item($newRow, 1).Value2 = Get-Date
  $ws.Cells.Item($newRow, 1).NumberFormat = 'dd/mm/yyyy'
  $ws.Cells.Item($newRow, 2).Value2 = [string]$d.quotationType
  $ws.Cells.Item($newRow, 3).Value2 = [string]$d.branch
  $ws.Cells.Item($newRow, 4).Value2 = [int]$d.serial
  $ws.Cells.Item($newRow, 5).Value2 = [string]$d.reference
  $ws.Cells.Item($newRow, 6).Value2 = [string]$d.managers
  $ws.Cells.Item($newRow, 7).Value2 = [string]$d.vessel
  $ws.Cells.Item($newRow, 8).Value2 = [string]$d.imo
  $ws.Cells.Item($newRow, 9).Value2 = [string]$d.vesselType
  $ws.Cells.Item($newRow, 10).Value2 = [string]$d.broker
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
  const result = await runPowerShellScript(ps, { filePath, sheetName, ...values })
  if (result.startsWith('ERR:')) {
    throw new Error(result.substring(4))
  }
  if (!result.startsWith('OK')) {
    throw new Error(`Unexpected Excel COM result: ${result}`)
  }
}

async function setCellViaCom(
  filePath: string,
  sheetName: string,
  row: number,
  col: number,
  value: string
): Promise<void> {
  const ps = `
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open([string]$d.filePath)
  $ws = $wb.Sheets.Item([string]$d.sheetName)
  $ws.Cells.Item([int]$d.row, [int]$d.col).Value2 = [string]$d.value
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
  const result = await runPowerShellScript(ps, { filePath, sheetName, row, col, value })
  if (result.startsWith('ERR:')) {
    throw new Error(result.substring(4))
  }
}

// ── Write via xlsx-js-style (fallback when Excel not installed) ───────────────

async function appendRowViaXlsx(
  filePath: string,
  sheetName: string,
  values: {
    quotationType: string
    branch: string
    serial: number
    reference: string
    managers: string
    vessel: string
    imo: string
    vesselType: string
    broker: string
  }
): Promise<void> {
  // The whole workbook is rewritten: keep formulas and styles of every sheet
  const wb = await readWorkbook(filePath, { cellFormula: true, cellStyles: true })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error(`Sheet ${sheetName} not found`)

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const newRow = range.e.r + 1

  const dateSerial = (Date.now() - new Date(1899, 11, 30).getTime()) / (24 * 60 * 60 * 1000)
  const cells: [number, XLSX.CellObject][] = [
    [0, { v: dateSerial, t: 'n', z: 'dd/mm/yyyy' }],
    [1, { v: values.quotationType, t: 's' }],
    [2, { v: values.branch, t: 's' }],
    [3, { v: values.serial, t: 'n' }],
    [4, { v: values.reference, t: 's' }],
    [5, { v: values.managers, t: 's' }],
    [6, { v: values.vessel, t: 's' }],
    [7, { v: values.imo, t: 's' }],
    [8, { v: values.vesselType, t: 's' }],
    [9, { v: values.broker, t: 's' }]
  ]
  cells.forEach(([c, cell]) => {
    ws[XLSX.utils.encode_cell({ r: newRow, c })] = cell
  })
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: newRow, c: HEADERS.length - 1 }
  })
  await writeWorkbook(wb, filePath)
}

async function setCellViaXlsx(
  filePath: string,
  sheetName: string,
  row0based: number,
  col0based: number,
  value: string
): Promise<void> {
  const wb = await readWorkbook(filePath, { cellFormula: true, cellStyles: true })
  const ws = wb.Sheets[sheetName]
  if (!ws) return
  ws[XLSX.utils.encode_cell({ r: row0based, c: col0based })] = { v: value, t: 's' }
  await writeWorkbook(wb, filePath)
}

/** Same output as XLSX.writeFile, but the (network) file write does not block */
async function writeWorkbook(wb: XLSX.WorkBook, filePath: string): Promise<void> {
  const ext = filePath.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx'
  const buf = XLSX.write(wb, { type: 'buffer', bookType: ext }) as Buffer
  await writeFile(filePath, buf)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function assignRegistryNumber(
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
): Promise<{ reference: string; serial: number }> {
  const { ws, sheetName } = await getYearSheetReadOnly(filePath)
  const lastSerial = getLastSerial(ws)
  const nextSerial = lastSerial + 1

  const yearShort = String(new Date().getFullYear()).slice(-2)
  const quotationType = data.isRenewal ? 'R:Renewal' : 'N:New Quotation'
  const quotationTypeCode = data.isRenewal ? 'R' : 'N'
  const branch = BRANCH_MAP[data.typeCode] || `${data.typeCode}:${data.typeCode}`
  const reference = `Q/${quotationTypeCode}/${data.typeCode}/${yearShort}/${nextSerial}`

  const values = {
    quotationType,
    branch,
    serial: nextSerial,
    reference,
    managers: data.managers || '',
    vessel: data.vessel || '',
    imo: data.imo || '',
    vesselType: data.vesselType || '',
    broker: data.broker || ''
  }

  if (await checkExcelCom()) {
    await appendRowViaCom(filePath, sheetName, values)
  } else {
    await appendRowViaXlsx(filePath, sheetName, values)
  }

  return { reference, serial: nextSerial }
}

/** Read the last serial number without writing (for preview) */
export async function getLastRegistrySerial(filePath: string): Promise<number> {
  if (!existsSync(filePath)) return 0
  const { ws } = await getYearSheetReadOnly(filePath)
  return getLastSerial(ws)
}

/** Mark a registry entry as cancelled */
export async function markRegistryCancelled(filePath: string, reference: string): Promise<void> {
  if (!existsSync(filePath)) return
  const { ws, sheetName } = await getYearSheetReadOnly(filePath)
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

  for (let r = 2; r <= range.e.r; r++) {
    const refCell = ws[XLSX.utils.encode_cell({ r, c: 4 })]
    if (refCell && refCell.v === reference) {
      if (await checkExcelCom()) {
        await setCellViaCom(filePath, sheetName, r + 1, 11, 'CANCELLED') // 1-based row, col K=11
      } else {
        await setCellViaXlsx(filePath, sheetName, r, 10, 'CANCELLED') // 0-based row, col K=10
      }
      return
    }
  }
}
