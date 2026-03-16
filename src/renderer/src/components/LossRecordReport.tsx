import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Upload, FileText, X, AlertCircle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getReportSettings, tintColor } from '../services/ReportSettingsService'
import { formatDateShort, formatDate } from '../utils/dateUtils'
import type { ReportSettings } from '../../../shared/types'

// ── Data model ────────────────────────────────────────────────────────────────

interface LossPayment {
  paymentType: string
  paidDate: string
  paidAmount: number
  reserves: number
  totalIncurred: number
}

interface LossClaim {
  claimId: string
  dateOfLoss: string
  policyId: string
  damageType: string  // col H — same for all payments in this claim
  payments: LossPayment[]
  totalPaid: number
  totalReserves: number
  totalIncurred: number
}

interface LossVessel {
  vesselName: string
  policyId: string
  claims: LossClaim[]
  totalPaid: number
  totalReserves: number
  totalIncurred: number
}

interface LossUWY {
  year: number
  vessels: LossVessel[]
  totalPaid: number
  totalReserves: number
  totalIncurred: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function excelSerialToDate(serial: number): string {
  // Excel date serial: days since 1900-01-01, with Lotus 123 leap-year bug correction
  const date = new Date((serial - 25569) * 86400 * 1000)
  return formatDateShort(date)
}

function fmt(v: number): string {
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// Preview table uses plain USD formatting (settings only affect the PDF)

// ── Excel parser ──────────────────────────────────────────────────────────────

function parseExcel(buffer: ArrayBuffer): LossUWY[] {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Row 0 is the header; skip it and filter out empty rows (vessel = col B = index 1)
  const dataRows = rows.slice(1).filter(r => String(r[1] || '').trim() !== '')

  // col indices (0-based):
  // 0=label(ignore), 1=vessel, 2=dateOfLoss, 3=claimId, 4=policyId,
  // 5=GWP(ignore), 6=UWY, 7=damageType, 8=details,
  // 9=paidTo(ignore), 10=paidDate, 11=paidAmount, 12=reserves, 13=totalIncurred

  const uwyMap = new Map<number, Map<string, { policyId: string; claims: Map<string, LossClaim> }>>()

  for (const row of dataRows) {
    const vesselName = String(row[1] || '').trim()
    if (!vesselName) continue

    const rawDate = row[2]
    const dateOfLoss = typeof rawDate === 'number' ? excelSerialToDate(rawDate) : String(rawDate || '').trim()
    const claimId = String(row[3] || '').trim()
    const policyId = String(row[4] || '').trim()
    const uwy = Number(row[6]) || 0

    const damageType = String(row[7] || '').trim()
    const paymentType = String(row[8] || '').trim()

    const rawPaidDate = row[10]
    const paidDate = typeof rawPaidDate === 'number' ? excelSerialToDate(rawPaidDate) : String(rawPaidDate || '').trim()
    const paidAmount = Number(row[11]) || 0
    const reserves = Number(row[12]) || 0
    const totalIncurred = Number(row[13]) || 0

    if (!uwyMap.has(uwy)) uwyMap.set(uwy, new Map())
    const vesselMap = uwyMap.get(uwy)!

    if (!vesselMap.has(vesselName)) vesselMap.set(vesselName, { policyId, claims: new Map() })
    const vesselData = vesselMap.get(vesselName)!

    if (!vesselData.claims.has(claimId)) {
      vesselData.claims.set(claimId, {
        claimId, dateOfLoss, policyId, damageType,
        payments: [], totalPaid: 0, totalReserves: 0, totalIncurred: 0
      })
    }

    const claim = vesselData.claims.get(claimId)!
    claim.payments.push({ paymentType, paidDate, paidAmount, reserves, totalIncurred })
    claim.totalPaid += paidAmount
    claim.totalReserves += reserves
    claim.totalIncurred += totalIncurred
  }

  const result: LossUWY[] = []
  for (const [year, vesselMap] of [...uwyMap.entries()].sort((a, b) => a[0] - b[0])) {
    let uwyTotalPaid = 0, uwyTotalReserves = 0, uwyTotalIncurred = 0
    const vessels: LossVessel[] = []

    for (const [vesselName, { policyId, claims }] of vesselMap.entries()) {
      const claimList = [...claims.values()]
      const vPaid = claimList.reduce((s, c) => s + c.totalPaid, 0)
      const vRes = claimList.reduce((s, c) => s + c.totalReserves, 0)
      const vInc = claimList.reduce((s, c) => s + c.totalIncurred, 0)
      vessels.push({ vesselName, policyId, claims: claimList, totalPaid: vPaid, totalReserves: vRes, totalIncurred: vInc })
      uwyTotalPaid += vPaid
      uwyTotalReserves += vRes
      uwyTotalIncurred += vInc
    }

    result.push({ year, vessels, totalPaid: uwyTotalPaid, totalReserves: uwyTotalReserves, totalIncurred: uwyTotalIncurred })
  }

  return result
}

// ── PDF export ────────────────────────────────────────────────────────────────

interface LossReportOpts {
  currency: string
  showReserves: boolean
  showClaimSubtotals: boolean
}

function exportToPDF(data: LossUWY[], s: ReportSettings, opts: LossReportOpts) {
  const primary = s.primaryColor
  const vesselBg = tintColor(primary, 0.82)
  const vesselText: [number, number, number] = [
    Math.round(primary[0] * 0.4),
    Math.round(primary[1] * 0.4),
    Math.round(primary[2] * 0.4),
  ]
  const claimBg = tintColor(primary, 0.95)
  const vesselTotalBg = tintColor(primary, 0.7)
  const cur = opts.currency

  const doc = new jsPDF()

  // ── Header band ──────────────────────────────────────────────────────────
  doc.setFillColor(15, 18, 24)
  doc.rect(0, 5, 210, s.companySubtitle ? 50 : 46, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(s.companyName, 14, 20)

  if (s.companySubtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(190, 190, 190)
    doc.text(s.companySubtitle, 14, 28)
  }

  const titleY = s.companySubtitle ? 40 : 34
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Loss Record', 14, titleY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 190, 190)
  doc.text(`Date Issued: ${formatDate(new Date())}`, 14, titleY + 9)

  // ── Column layout ────────────────────────────────────────────────────────
  // With reserves: Claim# | Date | Damage Type | Payment Type | Paid | Reserves | Total = 182mm
  //   22 | 22 | 36 | 30 | 24 | 24 | 24 = 182
  // Without reserves: Claim# | Date | Damage Type | Payment Type | Paid | Total = 182mm
  //   22 | 22 | 44 | 36 | 28 | 30 = 182

  const showRes = opts.showReserves
  const colCount = showRes ? 7 : 6

  const colWidths = showRes
    ? { claimId: 22, date: 22, dmg: 36, payType: 30, paid: 24, res: 24, total: 24 }
    : { claimId: 22, date: 22, dmg: 44, payType: 36, paid: 28, total: 30 }

  const headRow = showRes
    ? ['Claim #', 'Date of Loss', 'Damage Type', 'Payment Type', `Paid (${cur})`, `Reserves (${cur})`, `Total Incurred (${cur})`]
    : ['Claim #', 'Date of Loss', 'Damage Type', 'Payment Type', `Paid (${cur})`, `Total Incurred (${cur})`]

  const R: any = { halign: 'right' }

  const S = {
    uwyHeader: { fillColor: primary, textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold' as const, fontSize: 10 },
    vesselHeader: { fillColor: vesselBg, textColor: vesselText, fontStyle: 'bold' as const, fontSize: 9 },
    claimTotal: { fillColor: claimBg, textColor: [40, 40, 40] as [number,number,number], fontStyle: 'italic' as const, fontSize: 9 },
    vesselTotal: { fillColor: vesselTotalBg, textColor: vesselText, fontStyle: 'bold' as const, fontSize: 9 },
    uwyTotal: { fillColor: primary, textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold' as const, fontSize: 9 },
    grandTotal: { fillColor: [15, 18, 24] as [number,number,number], textColor: [255, 255, 255] as [number,number,number], fontStyle: 'bold' as const, fontSize: 9 },
  }

  // ── Build table body ─────────────────────────────────────────────────────
  const bodyRows: any[][] = []
  let grandPaid = 0, grandReserves = 0, grandIncurred = 0

  const fmtCur = (v: number) =>
    `${cur === 'EUR' ? '€' : cur === 'GBP' ? '£' : '$'}${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  for (const uwy of data) {
    bodyRows.push([{ content: `UNDERWRITING YEAR ${uwy.year}`, colSpan: colCount, styles: S.uwyHeader }])

    for (const vessel of uwy.vessels) {
      bodyRows.push([{ content: `${vessel.vesselName}   ·   Policy: ${vessel.policyId}`, colSpan: colCount, styles: S.vesselHeader }])

      for (const claim of vessel.claims) {
        const multi = claim.payments.length > 1

        if (showRes) {
          // First payment row: show claimId, date, damageType, then per-payment cols
          for (let i = 0; i < claim.payments.length; i++) {
            const p = claim.payments[i]
            bodyRows.push([
              i === 0 ? claim.claimId : '',
              i === 0 ? claim.dateOfLoss : '',
              i === 0 ? claim.damageType : '',
              p.paymentType,
              { content: fmtCur(p.paidAmount), styles: R },
              { content: fmtCur(p.reserves), styles: R },
              { content: fmtCur(p.totalIncurred), styles: R },
            ])
          }
          if (multi && opts.showClaimSubtotals) {
            bodyRows.push(['', '', { content: `Claim ${claim.claimId} Total`, colSpan: 2, styles: { ...S.claimTotal, halign: 'right' as const } },
              { content: fmtCur(claim.totalPaid), styles: { ...S.claimTotal, ...R } },
              { content: fmtCur(claim.totalReserves), styles: { ...S.claimTotal, ...R } },
              { content: fmtCur(claim.totalIncurred), styles: { ...S.claimTotal, ...R } }])
          }
        } else {
          for (let i = 0; i < claim.payments.length; i++) {
            const p = claim.payments[i]
            bodyRows.push([
              i === 0 ? claim.claimId : '',
              i === 0 ? claim.dateOfLoss : '',
              i === 0 ? claim.damageType : '',
              p.paymentType,
              { content: fmtCur(p.paidAmount), styles: R },
              { content: fmtCur(p.totalIncurred), styles: R },
            ])
          }
          if (multi && opts.showClaimSubtotals) {
            bodyRows.push(['', '', { content: `Claim ${claim.claimId} Total`, colSpan: 2, styles: { ...S.claimTotal, halign: 'right' as const } },
              { content: fmtCur(claim.totalPaid), styles: { ...S.claimTotal, ...R } },
              { content: fmtCur(claim.totalIncurred), styles: { ...S.claimTotal, ...R } }])
          }
        }
      }

      // colCount = 7 (with res) or 6 (without). Totals: span all except last 2 or 3
      // With res: span 4 cols, then paid, res, total
      // Without res: span 4 cols, then paid, total
      bodyRows.push([
        { content: `${vessel.vesselName} Total`, colSpan: colCount - (showRes ? 3 : 2), styles: { ...S.vesselTotal, halign: 'right' as const } },
        { content: fmtCur(vessel.totalPaid), styles: { ...S.vesselTotal, ...R } },
        ...(showRes ? [{ content: fmtCur(vessel.totalReserves), styles: { ...S.vesselTotal, ...R } }] : []),
        { content: fmtCur(vessel.totalIncurred), styles: { ...S.vesselTotal, ...R } },
      ])
    }

    bodyRows.push([
      { content: `Underwriting Year ${uwy.year} Total`, colSpan: colCount - (showRes ? 3 : 2), styles: { ...S.uwyTotal, halign: 'right' as const } },
      { content: fmtCur(uwy.totalPaid), styles: { ...S.uwyTotal, ...R } },
      ...(showRes ? [{ content: fmtCur(uwy.totalReserves), styles: { ...S.uwyTotal, ...R } }] : []),
      { content: fmtCur(uwy.totalIncurred), styles: { ...S.uwyTotal, ...R } },
    ])

    grandPaid += uwy.totalPaid
    grandReserves += uwy.totalReserves
    grandIncurred += uwy.totalIncurred
  }

  bodyRows.push([
    { content: 'Grand Total', colSpan: colCount - (showRes ? 3 : 2), styles: { ...S.grandTotal, halign: 'right' as const } },
    { content: fmtCur(grandPaid), styles: { ...S.grandTotal, ...R } },
    ...(showRes ? [{ content: fmtCur(grandReserves), styles: { ...S.grandTotal, ...R } }] : []),
    { content: fmtCur(grandIncurred), styles: { ...S.grandTotal, ...R } },
  ])

  // ── Render table ─────────────────────────────────────────────────────────
  const startY = s.companySubtitle ? 64 : 60

  const numCol = { halign: 'right' as const, overflow: 'ellipsize' as const }
  const w = colWidths as any
  const columnStyles: Record<number, any> = showRes
    ? {
        0: { cellWidth: w.claimId, halign: 'center' },
        1: { cellWidth: w.date, overflow: 'ellipsize' },
        2: { cellWidth: w.dmg },
        3: { cellWidth: w.payType },
        4: { cellWidth: w.paid, ...numCol },
        5: { cellWidth: w.res, ...numCol },
        6: { cellWidth: w.total, ...numCol },
      }
    : {
        0: { cellWidth: w.claimId, halign: 'center' },
        1: { cellWidth: w.date, overflow: 'ellipsize' },
        2: { cellWidth: w.dmg },
        3: { cellWidth: w.payType },
        4: { cellWidth: w.paid, ...numCol },
        5: { cellWidth: w.total, ...numCol },
      }

  autoTable(doc, {
    startY,
    margin: { top: 14, right: 14, bottom: 42, left: 14 },
    head: [headRow],
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      lineColor: primary,
    },
    columnStyles,
    styles: {
      fontSize: 8,
      cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      lineColor: [210, 215, 220],
      lineWidth: 0.3,
      textColor: [20, 20, 20],
      overflow: 'linebreak',
    },
    alternateRowStyles: { fillColor: [250, 251, 252] },
  })

  // ── Page footers ─────────────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(14, 270, 196, 270)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(s.footerText, 14, 274)
    doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
  }

  doc.save(`Loss_Record_${new Date().toISOString().split('T')[0]}.pdf`)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LossRecordReport() {
  const { theme } = useTheme()
  const isLight = theme !== 'dark'
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [data, setData] = useState<LossUWY[] | null>(null)
  const [fileName, setFileName] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Report-specific options (not shared with other reports)
  const [currency, setCurrency] = useState('USD')
  const [showReserves, setShowReserves] = useState(true)
  const [showClaimSubtotals, setShowClaimSubtotals] = useState(true)

  const handleFile = (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError('Please select an Excel file (.xlsx or .xls).')
      return
    }
    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer
        const parsed = parseExcel(buffer)
        if (parsed.length === 0) {
          setError('No data found in the file. Make sure the sheet matches the expected format.')
          setData(null)
        } else {
          setData(parsed)
        }
      } catch {
        setError('Failed to parse the file. Make sure it matches the expected format.')
        setData(null)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  const handleExport = async () => {
    if (!data) return
    setExporting(true)
    try {
      const settings = await getReportSettings()
      exportToPDF(data, settings, { currency, showReserves, showClaimSubtotals })
    } finally {
      setExporting(false)
    }
  }

  const clearData = () => {
    setData(null)
    setFileName('')
    setError(null)
  }

  // Summary stats derived from parsed data
  const stats = data ? {
    uwyCount: data.length,
    vesselCount: data.reduce((s, u) => s + u.vessels.length, 0),
    claimCount: data.reduce((s, u) => u.vessels.reduce((sv, v) => sv + v.claims.length, s), 0),
    totalIncurred: data.reduce((s, u) => s + u.totalIncurred, 0),
  } : null

  const border = isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'

  return (
    <div>
      {/* Upload zone */}
      {!data ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
            borderRadius: '16px',
            padding: '64px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging
              ? (isLight ? 'rgba(26,115,232,0.05)' : 'rgba(0,210,255,0.04)')
              : 'var(--bg-card)',
            transition: 'var(--transition)',
          }}
        >
          <Upload size={48} color="var(--accent-primary)" style={{ marginBottom: '16px', opacity: 0.7 }} />
          <p style={{ fontSize: '1.05rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
            Drop your Excel file here
          </p>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
            or click to browse
          </p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
            Supports .xlsx and .xls files in the standard loss record format
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={handleInputChange}
          />
        </div>
      ) : (
        /* Loaded state */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* File info bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px', background: 'var(--bg-card)', borderRadius: '10px', border }}>
            <FileText size={20} color="var(--accent-primary)" />
            <span style={{ fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.9rem', flex: 1 }}>{fileName}</span>
            <button
              onClick={clearData}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', padding: '4px' }}
              title="Remove file"
            >
              <X size={16} />
            </button>
          </div>

          {/* Summary stats */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              {[
                { label: 'Underwriting Years', value: stats.uwyCount },
                { label: 'Vessels', value: stats.vesselCount },
                { label: 'Claims', value: stats.claimCount },
                { label: 'Total Incurred (USD)', value: fmt(stats.totalIncurred) },
              ].map(s => (
                <div key={s.label} style={{ padding: '16px 20px', background: 'var(--bg-card)', borderRadius: '10px', border }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{s.label}</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: '700', color: 'var(--text-primary)' }}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* UWY breakdown preview */}
          <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--table-border)', fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              Preview
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--table-header-bg)' }}>
                  {['UWY', 'Vessel', 'Policy', 'Claims', 'Total Paid (USD)', 'Reserves (USD)', 'Total Incurred (USD)'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: h.includes('(USD)') ? 'right' : 'left', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.flatMap(uwy =>
                  uwy.vessels.map((v, vi) => (
                    <tr key={`${uwy.year}-${v.vesselName}`} style={{ borderTop: '1px solid var(--table-border)' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{vi === 0 ? uwy.year : ''}</td>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{v.vesselName}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'monospace' }}>{v.policyId}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{v.claims.length}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}>{fmt(v.totalPaid)}</td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}>{fmt(v.totalReserves)}</td>
                      <td style={{ padding: '10px 14px', fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}>{fmt(v.totalIncurred)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Report options */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '14px 18px', background: 'var(--bg-card)', borderRadius: '10px', border, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: '500' }}>Currency</label>
              <select
                value={currency}
                onChange={e => setCurrency(e.target.value)}
                style={{ padding: '5px 10px', borderRadius: '6px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={showReserves} onChange={e => setShowReserves(e.target.checked)} />
              Show Reserves column
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={showClaimSubtotals} onChange={e => setShowClaimSubtotals(e.target.checked)} />
              Show claim subtotals
            </label>
          </div>

          {/* Export button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleExport}
              disabled={exporting}
              className="btn-primary"
              style={{ padding: '10px 28px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <FileText size={16} />
              {exporting ? 'Generating PDF...' : 'Export PDF Report'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.3)', color: 'var(--danger)' }}>
          <AlertCircle size={16} />
          <span style={{ fontSize: '0.88rem' }}>{error}</span>
        </div>
      )}
    </div>
  )
}
