import { useState, useMemo, useEffect, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import {
  Plus,
  X,
  Copy,
  ChevronDown,
  ChevronRight,
  Settings,
  CheckCircle,
  FileSpreadsheet,
  Save,
  History,
  Trash2,
  RotateCcw,
  Eye
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { formatDateShort, formatDateLong } from '../utils/dateUtils'
import { asArray } from '../utils/ipc'
import { StrMoneyInput } from './quotation-tabs/shared'
import { Field, Modal, EmptyState } from './ui'
import type { WarBreachRecord } from '../../../shared/types'

// ── Types ────────────────────────────────────────────────────────────────────

interface VesselRow {
  id: string
  policyNo: string
  vessel: string
  periodFrom: string
  periodTo: string
  sumInsured: string
  rate: string
  ncbDiscount: string
}

interface TaxSettings {
  exchangeRate: number
  netPremiumPct: number
  costOfPolicy: number
  propStampsPct: number
  fixedStamps: number
  muniTaxPct: number
  commissionPct: number
  nrTaxPct: number
  feesRate: number
  feesDivisor: number
}

const DEFAULT_SETTINGS: TaxSettings = {
  exchangeRate: 89500,
  netPremiumPct: 55,
  costOfPolicy: 17900000,
  propStampsPct: 3,
  fixedStamps: 200000,
  muniTaxPct: 6,
  commissionPct: 15,
  nrTaxPct: 2.25,
  feesRate: 0.4005,
  feesDivisor: 1.09
}

// ── Tax calculation (mirrors Premium Calculation - Taxes.xlsx, columns C–K) ───
// Maps to the Excel sheet cell-for-cell:
//   A = grossPremUSD, B = exchangeRate, J = A*B, C = A*netPremium%*B
//   E = IF(A<1000, 0, costOfPolicy)
//   D = feesRate/feesDivisor*J - fixedStamps/feesDivisor - E   (NOT rounded)
//   base = SUM(C:E) = C + D + E        (E cancels with the -E inside D)
//   F = ROUND(base*propStamps%, -3)    (nearest 1,000)
//   H = ROUND(base*muniTax%, 0)        (nearest 1)
//   K (For War RI) = F + fixedStamps + H   →  taxes USD = K / B

function calcTaxesUSD(grossPremUSD: number, s: TaxSettings): number {
  if (grossPremUSD <= 0) return 0
  const { exchangeRate, netPremiumPct, costOfPolicy, propStampsPct, fixedStamps, muniTaxPct } = s
  const feesRate = s.feesRate ?? 0.4005
  const feesDivisor = s.feesDivisor || 1.09
  const j = grossPremUSD * exchangeRate
  const c = grossPremUSD * (netPremiumPct / 100) * exchangeRate
  const e = grossPremUSD < 1000 ? 0 : costOfPolicy
  const d = (feesRate / feesDivisor) * j - fixedStamps / feesDivisor - e
  const base = c + d + e
  const f = Math.round((base * (propStampsPct / 100)) / 1000) * 1000
  const h = Math.round(base * (muniTaxPct / 100))
  const k = f + fixedStamps + h
  return k / exchangeRate
}

// ── Per-vessel calculation ────────────────────────────────────────────────────

function getTotalDays(from: string, to: string): number {
  if (!from || !to) return 0
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24))
}

interface VesselCalc {
  totalDays: number
  grossPrem: number
  taxesGov: number
  net: number
  commission: number
  nrTax: number
  netDue: number
}

function calcVessel(row: VesselRow, settings: TaxSettings, baseDays: number): VesselCalc | null {
  const sumIns = parseFloat(row.sumInsured) || 0
  const rate = parseFloat(row.rate) || 0
  const ncb = parseFloat(row.ncbDiscount) || 0
  if (!row.periodFrom || !row.periodTo) return null
  const rawDays = getTotalDays(row.periodFrom, row.periodTo)
  if (rawDays < 0) return null // invalid date range — handled as error in UI
  if (sumIns <= 0 || rate <= 0 || baseDays <= 0) return null

  // If the period is shorter than base days, charge the full base period
  const totalDays = Math.max(rawDays, baseDays)

  const grossPrem = ((sumIns * (rate / 100)) / baseDays) * (1 - ncb / 100) * totalDays
  const taxesGov = calcTaxesUSD(grossPrem, settings)
  const net = grossPrem - taxesGov
  const commission = net * (settings.commissionPct / 100)
  const nrTax = net * (settings.nrTaxPct / 100)
  const netDue = net - commission - nrTax

  return { totalDays, grossPrem, taxesGov, net, commission, nrTax, netDue }
}

/** A vessel row as stored in a saved record's vesselsJson */
type SavedVesselRow = VesselRow & {
  calc: VesselCalc | null
  /** Older field name; the save writes `vessel` */
  vesselName?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n: number): number => parseFloat(n.toFixed(2)) // numeric value for Excel

function fmtDate(d: string): string {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WarBreachCalculator(): React.JSX.Element {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const { showSuccess, showError } = useToast()

  const [showHistory, setShowHistory] = useState(false)
  const [historyRecords, setHistoryRecords] = useState<WarBreachRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [viewingRecord, setViewingRecord] = useState<WarBreachRecord | null>(null)
  const [copiedModal, setCopiedModal] = useState(false)

  const loadHistory = useCallback(async (): Promise<void> => {
    const records = await window.api.warBreachGetAll()
    setHistoryRecords(asArray<WarBreachRecord>(records))
  }, [])

  useEffect(() => {
    if (!showHistory) return
    const run = async (): Promise<void> => {
      const records = await window.api.warBreachGetAll()
      setHistoryRecords(asArray<WarBreachRecord>(records))
    }
    void run()
  }, [showHistory])

  const [coverNoteNo, setCoverNoteNo] = useState('')
  const [currency, setCurrency] = useState('US DOLLARS')
  const [breachDetails, setBreachDetails] = useState('')
  const [baseDays, setBaseDays] = useState(7)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_SETTINGS)
  const [copied, setCopied] = useState(false)

  const [vessels, setVessels] = useState<VesselRow[]>([
    {
      id: '1',
      policyNo: '',
      vessel: '',
      periodFrom: '',
      periodTo: '',
      sumInsured: '',
      rate: '',
      ncbDiscount: '0'
    }
  ])

  // ── Computed ─────────────────────────────────────────────────────────────

  const calculations = useMemo(
    () => vessels.map((v) => ({ id: v.id, calc: calcVessel(v, settings, baseDays) })),
    [vessels, settings, baseDays]
  )

  const totalNetDue = useMemo(
    () => calculations.reduce((sum, c) => sum + (c.calc?.netDue ?? 0), 0),
    [calculations]
  )

  const hasAnyResult = calculations.some((c) => c.calc !== null)

  // ── Vessel row handlers ───────────────────────────────────────────────────

  const addVessel = (): void =>
    setVessels((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        policyNo: '',
        vessel: '',
        periodFrom: '',
        periodTo: '',
        sumInsured: '',
        rate: '',
        ncbDiscount: '0'
      }
    ])

  const removeVessel = (id: string): void => {
    if (vessels.length === 1) return
    setVessels((prev) => prev.filter((v) => v.id !== id))
  }

  const updateVessel = (id: string, field: keyof VesselRow, value: string): void =>
    setVessels((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)))

  const updateSetting = (field: keyof TaxSettings, value: number): void =>
    setSettings((prev) => ({ ...prev, [field]: value }))

  const resetSettings = (): void => setSettings(DEFAULT_SETTINGS)

  const clearAll = (): void => {
    setCoverNoteNo('')
    setCurrency('US DOLLARS')
    setBreachDetails('')
    setBaseDays(7)
    setSettings(DEFAULT_SETTINGS)
    setVessels([
      {
        id: Date.now().toString(),
        policyNo: '',
        vessel: '',
        periodFrom: '',
        periodTo: '',
        sumInsured: '',
        rate: '',
        ncbDiscount: '0'
      }
    ])
  }

  const handleSaveRecord = async (): Promise<void> => {
    if (!hasAnyResult) return
    setSaving(true)
    try {
      const vesselsWithCalcs = vessels.map((v, i) => ({
        ...v,
        calc: calculations[i]?.calc ?? null
      }))
      await window.api.warBreachSave({
        coverNoteNo,
        currency,
        breachDetails,
        baseDays,
        settingsJson: JSON.stringify(settings),
        vesselsJson: JSON.stringify(vesselsWithCalcs),
        totalNetDue
      })
      showSuccess('Saved — fields cleared for new entry')
      if (showHistory) loadHistory()
      clearAll()
    } catch {
      showError('Failed to save record')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteRecord = async (id: string): Promise<void> => {
    try {
      await window.api.warBreachDelete(id)
      loadHistory()
      showSuccess('Record deleted')
    } catch {
      showError('Failed to delete record')
    } finally {
      setDeleteConfirmId(null)
    }
  }

  // ── Filename builder ──────────────────────────────────────────────────────

  function buildFilename(ext: string): string {
    const toTitleCase = (s: string): string =>
      s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())

    const vesselNames = vessels
      .filter((_, i) => calculations[i]?.calc !== null)
      .map((v) => toTitleCase(v.vessel.trim()))
      .filter(Boolean)
      .join(' - ')

    // Use the latest expiry (TO) date across vessels with results; fall back to today
    const expiryDates = vessels
      .filter((v, i) => calculations[i]?.calc !== null && v.periodTo)
      .map((v) => v.periodTo)
      .sort()
    const dateForName = expiryDates.length > 0 ? new Date(expiryDates.at(-1)!) : new Date()
    const monthYear = dateForName.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const parts = [vesselNames || 'Vessels', breachDetails.trim() || 'Breach', monthYear]
    return `${parts.join(' - ')}.${ext}`
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  async function exportToExcel(): Promise<void> {
    const XLSX = (await import('xlsx-js-style')).default
    const wb = XLSX.utils.book_new()

    // Info rows
    const infoRows = [
      [
        'COVER NOTE',
        coverNoteNo || '',
        'CURRENCY',
        currency,
        'BASE DAYS',
        baseDays,
        'BREACH DETAILS',
        breachDetails || ''
      ],
      []
    ]

    // Column headers
    const headers = [
      'POL. N°',
      'VESSEL',
      'FROM',
      'TO',
      'SUM INS. (USD)',
      'RATE %',
      'NCB %',
      'GROSS PREM.',
      'TAXES GOV.',
      'NET',
      `Your Comm. ${settings.commissionPct}%`,
      'Tax Non-Resident',
      'NET DUE'
    ]

    // Data rows
    const dataRows = vessels
      .map((v, i) => {
        const c = calculations[i]?.calc
        if (!c) return null
        return [
          v.policyNo,
          v.vessel.toUpperCase(),
          v.periodFrom ? fmtDate(v.periodFrom) : '',
          v.periodTo ? fmtDate(v.periodTo) : '',
          parseFloat(v.sumInsured) || 0,
          parseFloat(v.rate) || 0,
          parseFloat(v.ncbDiscount) || 0,
          fmtNum(c.grossPrem),
          fmtNum(c.taxesGov),
          fmtNum(c.net),
          fmtNum(c.commission),
          fmtNum(c.nrTax),
          fmtNum(c.netDue)
        ]
      })
      .filter((r): r is (string | number)[] => r !== null)

    // Total row
    const totalRow = [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'NET DUE TO R/I:',
      fmtNum(totalNetDue)
    ]

    const wsData = [...infoRows, headers, ...dataRows, [], totalRow]
    const ws = XLSX.utils.aoa_to_sheet(wsData)

    // ── Cell styles ──────────────────────────────────────────────────────────

    const borderThin = { style: 'thin', color: { rgb: 'aaaaaa' } }
    const allBorders = { top: borderThin, bottom: borderThin, left: borderThin, right: borderThin }

    // Row 1 — info cells (A1:H1): thin border + light grey fill for labels
    const labelFill = { fgColor: { rgb: 'e8f0f8' } }
    const labelFont = { bold: true, sz: 10, color: { rgb: '0a2040' } }
    const valueFill = { fgColor: { rgb: 'ffffff' } }
    const infoLabelCols = [0, 2, 4, 6] // A, C, E, G  — label cells
    const infoValueCols = [1, 3, 5, 7] // B, D, F, H  — value cells
    const colLetters = 'ABCDEFGHIJKLM'.split('')
    infoLabelCols.forEach((col) => {
      const addr = `${colLetters[col]}1`
      if (ws[addr])
        ws[addr].s = {
          border: allBorders,
          fill: labelFill,
          font: labelFont,
          alignment: { horizontal: 'right' }
        }
    })
    infoValueCols.forEach((col) => {
      const addr = `${colLetters[col]}1`
      if (ws[addr])
        ws[addr].s = {
          border: allBorders,
          fill: valueFill,
          font: { sz: 10 },
          alignment: { horizontal: 'left' }
        }
    })

    // Row 3 — header cells (A3:M3): navy fill, white bold text, thin borders
    const hdrFill = { fgColor: { rgb: '1a4f7a' } }
    const hdrFont = { bold: true, sz: 10, color: { rgb: 'ffffff' } }
    headers.forEach((_, col) => {
      const addr = `${colLetters[col]}3`
      if (ws[addr])
        ws[addr].s = {
          border: allBorders,
          fill: hdrFill,
          font: hdrFont,
          alignment: { horizontal: col < 4 ? 'left' : 'right' }
        }
    })

    // Column widths
    ws['!cols'] = [
      { wch: 16 },
      { wch: 22 },
      { wch: 13 },
      { wch: 13 },
      { wch: 16 },
      { wch: 9 },
      { wch: 8 },
      { wch: 14 },
      { wch: 13 },
      { wch: 13 },
      { wch: 13 },
      { wch: 11 },
      { wch: 13 }
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'War Breach')
    XLSX.writeFile(wb, buildFilename('xlsx'))
  }

  // ── Email output builders ─────────────────────────────────────────────────

  function buildEmailHTML(): string {
    // Light bg + dark text — Outlook's paste engine strips text color reliably; this is always readable
    const th = (t: string, align = 'right'): string =>
      `<td align="${align}" style="border:1px solid #8aaac8;padding:6px 10px;background:#cce0f5;color:#0a2040;text-align:${align};white-space:nowrap;font-size:11px;font-family:Arial,sans-serif;font-weight:bold;">${t}</td>`
    const td = (t: string, extra = ''): string =>
      `<td style="border:1px solid #ddd;padding:5px 10px;text-align:right;font-size:11px;font-family:Arial,sans-serif;${extra}">${t}</td>`
    const tdL = (t: string): string =>
      `<td style="border:1px solid #ddd;padding:5px 10px;text-align:left;font-size:11px;font-family:Arial,sans-serif;">${t}</td>`

    const commLabel = `Your Comm. ${settings.commissionPct}%`

    const dataRows = vessels
      .map((v, i) => {
        const c = calculations[i]?.calc
        if (!c) return ''
        const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : '-'
        const rowBg = i % 2 === 1 ? 'background:#f9f9f9;' : ''
        return `<tr>
        ${tdL(v.policyNo)}${tdL(v.vessel.toUpperCase())}${tdL(fmtDate(v.periodFrom))}${tdL(fmtDate(v.periodTo))}
        ${td(fmt(parseFloat(v.sumInsured) || 0), rowBg)}
        ${td(`${(parseFloat(v.rate) || 0).toFixed(3)}%`, rowBg)}
        ${td(ncbLabel, rowBg)}
        ${td(fmt(c.grossPrem), `${rowBg}font-weight:bold;`)}
        ${td(fmt(c.taxesGov), `${rowBg}color:#c00000;`)}
        ${td(fmt(c.net), rowBg)}${td(fmt(c.commission), rowBg)}
        ${td(fmt(c.nrTax), rowBg)}
        ${td(fmt(c.netDue), `${rowBg}font-weight:bold;color:#006b8f;`)}
      </tr>`
      })
      .filter(Boolean)
      .join('')

    const totalsRow = `<tr style="background:#e8f4fb;">
      <td colspan="12" align="right" style="border:1px solid #ddd;padding:7px 10px;text-align:right;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;">NET DUE TO R/I:</td>
      <td align="right" style="border:1px solid #ddd;padding:7px 10px;text-align:right;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;color:#006b8f;">${fmt(totalNetDue)}</td>
    </tr>`

    // No <thead> — single <tbody> is more Outlook-compatible
    return `<table style="border-collapse:collapse;width:100%;">
  <tbody>
    <tr>
      ${th('POL. N°', 'left')}${th('VESSEL', 'left')}${th('FROM', 'left')}${th('TO', 'left')}
      ${th('SUM INS.')}${th('RATE %')}${th('NCB')}
      ${th('GROSS PREM.')}${th('TAXES GOV.')}${th('NET')}
      ${th(commLabel)}${th('Tax Non-Resident')}${th('NET DUE')}
    </tr>
    ${dataRows}${totalsRow}
  </tbody>
</table>`
  }

  function buildEmailTSV(): string {
    const cols = [
      'POL. N°',
      'VESSEL',
      'FROM',
      'TO',
      'SUM INS.',
      'RATE %',
      'NCB',
      'GROSS PREM.',
      'TAXES GOV.',
      'NET',
      `Your Comm. ${settings.commissionPct}%`,
      'Tax Non-Resident',
      'NET DUE'
    ]
    const lines = [cols.join('\t')]
    vessels.forEach((v, i) => {
      const c = calculations[i]?.calc
      if (!c) return
      const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : ''
      lines.push(
        [
          v.policyNo,
          v.vessel.toUpperCase(),
          fmtDate(v.periodFrom),
          fmtDate(v.periodTo),
          fmt(parseFloat(v.sumInsured) || 0),
          `${(parseFloat(v.rate) || 0).toFixed(3)}%`,
          ncbLabel,
          fmt(c.grossPrem),
          fmt(c.taxesGov),
          fmt(c.net),
          fmt(c.commission),
          fmt(c.nrTax),
          fmt(c.netDue)
        ].join('\t')
      )
    })
    lines.push(
      '',
      ['', '', '', '', '', '', '', '', '', '', '', 'NET DUE TO R/I:', fmt(totalNetDue)].join('\t')
    )
    return lines.join('\n')
  }

  const handleCopy = async (): Promise<void> => {
    try {
      const htmlBlob = new Blob([buildEmailHTML()], { type: 'text/html' })
      const textBlob = new Blob([buildEmailTSV()], { type: 'text/plain' })
      await navigator.clipboard.write([
        new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
      ])
    } catch {
      await navigator.clipboard.writeText(buildEmailTSV())
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const accentBg = 'rgba(var(--accent-primary-rgb), 0.07)'
  const accentBorder = 'var(--accent-border)'
  const dateScheme: React.CSSProperties = { colorScheme: isLight ? 'light' : 'dark' }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      {/* ── Title + action buttons ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px'
        }}
      >
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem' }}>War Breach Calculator</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Compute war/breach premiums with Lebanese government taxes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="btn-secondary"
            style={showHistory ? { background: 'var(--accent-tint)' } : undefined}
          >
            <History size={16} /> History
          </button>
          <button onClick={clearAll} className="btn-secondary" title="Clear all fields">
            <RotateCcw size={16} /> Clear
          </button>
          <button
            onClick={handleSaveRecord}
            disabled={!hasAnyResult || saving}
            className="btn-secondary"
          >
            <Save size={16} /> {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={exportToExcel} disabled={!hasAnyResult} className="btn-secondary">
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <button onClick={handleCopy} disabled={!hasAnyResult} className="btn-primary">
            {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy for Email'}
          </button>
        </div>
      </div>

      {/* ── Cover note ── */}
      <div className="form-section" style={{ marginBottom: '20px' }}>
        <div className="form-grid">
          <Field label="Cover note no.">
            <input
              type="text"
              value={coverNoteNo}
              onChange={(e) => setCoverNoteNo(e.target.value)}
              placeholder="e.g. RMAMW2204174"
            />
          </Field>
          <Field label="Breach details">
            <input
              type="text"
              value={breachDetails}
              onChange={(e) => setBreachDetails(e.target.value)}
              placeholder="e.g. Gulf of Aden transit"
            />
          </Field>
          <Field label="Base days">
            <input
              type="number"
              value={baseDays}
              onChange={(e) => setBaseDays(parseInt(e.target.value) || 7)}
              min="1"
              step="1"
            />
          </Field>
          <Field label="Currency">
            <input
              type="text"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              placeholder="e.g. US DOLLARS"
            />
          </Field>
        </div>
      </div>

      {/* ── Collapsible tax settings ── */}
      <div
        style={{
          marginBottom: '24px',
          border: '1px solid var(--table-border)',
          borderRadius: '10px',
          overflow: 'hidden'
        }}
      >
        <button
          onClick={() => setShowSettings((s) => !s)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '11px 16px',
            border: 'none',
            cursor: 'pointer',
            background: 'var(--table-header-bg)',
            color: 'var(--text-secondary)',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            textAlign: 'left'
          }}
        >
          {showSettings ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Settings size={14} />
          Tax settings (Lebanese government taxes)
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.7 }}>
            Rate {settings.exchangeRate.toLocaleString()} LBP/USD · Commission{' '}
            {settings.commissionPct}% · NR Tax {settings.nrTaxPct}%
          </span>
        </button>

        {showSettings && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--table-border)' }}>
            <div className="form-grid" style={{ marginBottom: '14px' }}>
              {(
                [
                  {
                    label: 'Exchange rate (LBP/USD)',
                    field: 'exchangeRate',
                    step: '500',
                    note: 'e.g. 89 500'
                  },
                  {
                    label: 'Net premium % of gross',
                    field: 'netPremiumPct',
                    step: '1',
                    note: 'default 55%'
                  },
                  {
                    label: 'Cost of policy (LBP)',
                    field: 'costOfPolicy',
                    step: '100000',
                    note: 'default 17 900 000'
                  },
                  {
                    label: 'Proportional stamps %',
                    field: 'propStampsPct',
                    step: '0.1',
                    note: 'default 3%'
                  },
                  {
                    label: 'Fixed stamps (LBP)',
                    field: 'fixedStamps',
                    step: '1000',
                    note: 'default 200 000 for war'
                  },
                  {
                    label: 'Municipal tax %',
                    field: 'muniTaxPct',
                    step: '0.1',
                    note: 'default 6%'
                  },
                  { label: 'Fees rate', field: 'feesRate', step: '0.0001', note: 'default 0.4005' },
                  {
                    label: 'Fees divisor',
                    field: 'feesDivisor',
                    step: '0.01',
                    note: 'default 1.09'
                  },
                  {
                    label: 'Commission %',
                    field: 'commissionPct',
                    step: '0.25',
                    note: 'broker commission'
                  },
                  {
                    label: 'Non-resident tax %',
                    field: 'nrTaxPct',
                    step: '0.01',
                    note: 'default 2.25%'
                  }
                ] as { label: string; field: keyof TaxSettings; step: string; note: string }[]
              ).map(({ label, field, step, note }) => (
                <Field key={field} label={label} hint={note}>
                  <input
                    type="number"
                    value={settings[field]}
                    onChange={(e) => updateSetting(field, parseFloat(e.target.value) || 0)}
                    step={step}
                    min="0"
                  />
                </Field>
              ))}
            </div>
            <button onClick={resetSettings} className="btn-secondary btn-sm">
              Reset to Defaults
            </button>
          </div>
        )}
      </div>

      {/* ── Vessel cards ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
        {vessels.map((v, idx) => {
          const c = calculations[idx]?.calc
          const rawDays = getTotalDays(v.periodFrom, v.periodTo)
          const dateError = !!(v.periodFrom && v.periodTo && rawDays < 0)
          const borderColor = dateError ? 'var(--danger)' : c ? accentBorder : 'var(--table-border)'
          return (
            <div
              key={v.id}
              style={{
                borderRadius: '10px',
                border: `1px solid ${borderColor}`,
                overflow: 'hidden',
                background: 'var(--bg-card)'
              }}
            >
              {/* ── Input row ── */}
              <div style={{ padding: '14px 16px' }}>
                {/* Card header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px'
                  }}
                >
                  <h4 className="form-section-title" style={{ margin: 0 }}>
                    Vessel {idx + 1}
                    {v.vessel ? ` — ${v.vessel.toUpperCase()}` : ''}
                  </h4>
                  <button
                    onClick={() => removeVessel(v.id)}
                    disabled={vessels.length === 1}
                    title="Remove vessel"
                    className="btn-ghost btn-icon btn-sm"
                    style={{ color: 'var(--danger)' }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Row 1: Policy No | Vessel Name | From | To */}
                <div
                  className="form-grid"
                  style={{ gridTemplateColumns: '1fr 2fr 1fr 1fr', marginBottom: '14px' }}
                >
                  <Field label="Policy no.">
                    <input
                      placeholder="W25209161E2"
                      value={v.policyNo}
                      onChange={(e) => updateVessel(v.id, 'policyNo', e.target.value)}
                    />
                  </Field>
                  <Field label="Vessel name">
                    <input
                      style={{ textTransform: 'uppercase' }}
                      placeholder="e.g. ATLANTIC PRIDE"
                      value={v.vessel}
                      onChange={(e) => updateVessel(v.id, 'vessel', e.target.value)}
                    />
                  </Field>
                  <Field label="From">
                    <input
                      style={dateScheme}
                      type="date"
                      value={v.periodFrom}
                      onChange={(e) => updateVessel(v.id, 'periodFrom', e.target.value)}
                    />
                  </Field>
                  <Field label="To">
                    <input
                      style={dateScheme}
                      type="date"
                      value={v.periodTo}
                      onChange={(e) => updateVessel(v.id, 'periodTo', e.target.value)}
                    />
                  </Field>
                </div>

                {/* Row 2: Sum Insured | Rate % | NCB % */}
                <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
                  <Field label="Sum insured (USD)">
                    <StrMoneyInput
                      value={v.sumInsured}
                      onChange={(s) => updateVessel(v.id, 'sumInsured', s)}
                      placeholder="0"
                      style={{ width: '100%', boxSizing: 'border-box', textAlign: 'right' }}
                    />
                  </Field>
                  <Field label="Rate %">
                    <input
                      style={{ textAlign: 'right' }}
                      type="number"
                      placeholder="1.000"
                      value={v.rate}
                      onChange={(e) => updateVessel(v.id, 'rate', e.target.value)}
                      min="0"
                      step="0.001"
                    />
                  </Field>
                  <Field label="NCB discount %">
                    <input
                      style={{ textAlign: 'right' }}
                      type="number"
                      placeholder="0"
                      value={v.ncbDiscount}
                      onChange={(e) => updateVessel(v.id, 'ncbDiscount', e.target.value)}
                      min="0"
                      max="99"
                      step="5"
                    />
                  </Field>
                </div>
              </div>

              {/* ── Results strip ── */}
              {c ? (
                <div
                  style={{
                    padding: '10px 16px',
                    background: accentBg,
                    borderTop: `2px solid ${accentBorder}`,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: '4px'
                  }}
                >
                  {(
                    [
                      { label: 'Gross Premium', value: c.grossPrem, weight: 600 },
                      { label: 'Gov. Taxes', value: c.taxesGov, color: 'var(--danger)' },
                      { label: 'Net', value: c.net },
                      { label: 'Commission', value: c.commission, color: 'var(--text-secondary)' },
                      { label: 'NR Tax', value: c.nrTax, color: 'var(--text-secondary)' },
                      {
                        label: 'NET DUE',
                        value: c.netDue,
                        weight: 700,
                        color: 'var(--accent-primary)',
                        large: true
                      }
                    ] as {
                      label: string
                      value: number
                      weight?: number
                      color?: string
                      large?: boolean
                    }[]
                  ).map((item) => (
                    <div key={item.label} style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '0.68rem',
                          color: 'var(--text-secondary)',
                          marginBottom: '2px',
                          letterSpacing: '0.03em'
                        }}
                      >
                        {item.label}
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontWeight: item.weight ?? 400,
                          fontSize: item.large ? '1rem' : '0.85rem',
                          color: item.color ?? 'var(--text-primary)',
                          lineHeight: 1.2
                        }}
                      >
                        {fmt(item.value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : dateError ? (
                <div
                  style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--danger)',
                    color: 'var(--danger)',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textAlign: 'center'
                  }}
                >
                  ⚠ End date must be after start date
                </div>
              ) : (
                <div
                  style={{
                    padding: '8px 16px',
                    borderTop: '1px solid var(--table-border)',
                    color: 'var(--text-secondary)',
                    fontSize: '0.75rem',
                    fontStyle: 'italic',
                    textAlign: 'center'
                  }}
                >
                  Complete all fields to see results
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer: Add vessel + total ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addVessel} className="btn-secondary">
          <Plus size={16} /> Add Vessel
        </button>

        {hasAnyResult && (
          <div
            style={{
              padding: '14px 24px',
              borderRadius: '12px',
              background: accentBg,
              border: `1px solid ${accentBorder}`,
              textAlign: 'right'
            }}
          >
            <div
              style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '2px' }}
            >
              Net Due to R/I
            </div>
            <div
              className="mono"
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--accent-primary)',
                letterSpacing: '0.02em'
              }}
            >
              {fmt(totalNetDue)}
            </div>
          </div>
        )}
      </div>

      {/* ── History Panel ── */}
      {showHistory && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <History size={15} color="var(--text-secondary)" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Saved records</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: 4 }}>
              ({historyRecords.length})
            </span>
          </div>
          {historyRecords.length === 0 ? (
            <div className="table-wrap">
              <EmptyState
                compact
                icon={<History size={28} />}
                title="No saved records yet"
                text="Complete a calculation and click Save."
              />
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: '420px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Date</th>
                    <th>Vessel / cover note</th>
                    <th style={{ width: 90 }}>Vessels</th>
                    <th className="num" style={{ width: 130 }}>
                      Net due
                    </th>
                    <th style={{ width: 150 }} />
                  </tr>
                </thead>
                <tbody>
                  {historyRecords.map((rec) => {
                    const vessels: SavedVesselRow[] = (() => {
                      try {
                        return JSON.parse(rec.vesselsJson)
                      } catch {
                        return []
                      }
                    })()
                    const vesselCount = vessels.filter((v) => v.calc !== null).length
                    const date = formatDateShort(rec.createdAt)
                    const isConfirming = deleteConfirmId === rec.id
                    return (
                      <tr key={rec.id}>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {date}
                        </td>
                        <td style={{ maxWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {vessels
                              .map((v) => (v.vessel || v.vesselName || '').trim())
                              .filter(Boolean)
                              .join(', ') ||
                              rec.coverNoteNo || (
                                <span
                                  style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}
                                >
                                  No vessel
                                </span>
                              )}
                          </div>
                          {rec.breachDetails && (
                            <div
                              style={{
                                fontSize: '0.78rem',
                                color: 'var(--text-secondary)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {rec.breachDetails}
                            </div>
                          )}
                        </td>
                        <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                          {vesselCount} vessel{vesselCount !== 1 ? 's' : ''}
                        </td>
                        <td
                          className="num mono"
                          style={{ fontWeight: 700, color: 'var(--accent-primary)' }}
                        >
                          {fmt(parseFloat(rec.totalNetDue))}
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '6px'
                            }}
                          >
                            <button
                              onClick={() => setViewingRecord(rec)}
                              className="btn-ghost btn-icon btn-sm"
                              style={{ color: 'var(--accent-primary)' }}
                              title="View calculations"
                            >
                              <Eye size={14} />
                            </button>
                            {isConfirming ? (
                              <>
                                <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                                  Delete?
                                </span>
                                <button
                                  onClick={() => handleDeleteRecord(rec.id)}
                                  className="btn-danger btn-sm"
                                >
                                  Yes
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(null)}
                                  className="btn-secondary btn-sm"
                                >
                                  No
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(rec.id)}
                                className="btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--danger)' }}
                                title="Delete record"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Record View Modal ── */}
      {viewingRecord &&
        (() => {
          const recVessels: SavedVesselRow[] = (() => {
            try {
              return JSON.parse(viewingRecord.vesselsJson)
            } catch {
              return []
            }
          })()
          const recSettings: TaxSettings = (() => {
            try {
              return JSON.parse(viewingRecord.settingsJson)
            } catch {
              return DEFAULT_SETTINGS
            }
          })()
          const recTotal = parseFloat(viewingRecord.totalNetDue)
          const date = formatDateLong(viewingRecord.createdAt)
          const cvn = viewingRecord.coverNoteNo || ''
          const curr = viewingRecord.currency || ''
          const bdet = viewingRecord.breachDetails || ''
          const bd = viewingRecord.baseDays

          const modalFilename = (ext: string): string => {
            const toTitleCase = (s: string): string =>
              s.replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            const vesselNames = recVessels
              .filter((v) => v.calc !== null)
              .map((v) => toTitleCase(v.vessel.trim()))
              .filter(Boolean)
              .join(' - ')
            const expiryDates = recVessels
              .filter((v) => v.calc !== null && v.periodTo)
              .map((v) => v.periodTo)
              .sort()
            const dateForName = expiryDates.length > 0 ? new Date(expiryDates.at(-1)!) : new Date()
            const monthYear = dateForName.toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric'
            })
            return `${[vesselNames || 'Vessels', bdet || 'Breach', monthYear].join(' - ')}.${ext}`
          }

          const modalExportToExcel = async (): Promise<void> => {
            const XLSX = (await import('xlsx-js-style')).default
            const wb = XLSX.utils.book_new()
            const infoRows = [
              ['COVER NOTE', cvn, 'CURRENCY', curr, 'BASE DAYS', bd, 'BREACH DETAILS', bdet],
              []
            ]
            const headers = [
              'POL. N°',
              'VESSEL',
              'FROM',
              'TO',
              'SUM INS. (USD)',
              'RATE %',
              'NCB %',
              'GROSS PREM.',
              'TAXES GOV.',
              'NET',
              `Your Comm. ${recSettings.commissionPct}%`,
              'Tax Non-Resident',
              'NET DUE'
            ]
            const dataRows = recVessels
              .map((v) => {
                const c = v.calc
                if (!c) return null
                return [
                  v.policyNo,
                  v.vessel.toUpperCase(),
                  v.periodFrom ? fmtDate(v.periodFrom) : '',
                  v.periodTo ? fmtDate(v.periodTo) : '',
                  parseFloat(v.sumInsured) || 0,
                  parseFloat(v.rate) || 0,
                  parseFloat(v.ncbDiscount) || 0,
                  fmtNum(c.grossPrem),
                  fmtNum(c.taxesGov),
                  fmtNum(c.net),
                  fmtNum(c.commission),
                  fmtNum(c.nrTax),
                  fmtNum(c.netDue)
                ]
              })
              .filter((r): r is (string | number)[] => r !== null)
            const totalRow = [
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              '',
              'NET DUE TO R/I:',
              fmtNum(recTotal)
            ]
            const wsData = [...infoRows, headers, ...dataRows, [], totalRow]
            const ws = XLSX.utils.aoa_to_sheet(wsData)
            const borderThin = { style: 'thin', color: { rgb: 'aaaaaa' } }
            const allBorders = {
              top: borderThin,
              bottom: borderThin,
              left: borderThin,
              right: borderThin
            }
            const colLetters = 'ABCDEFGHIJKLM'.split('')
            ;[0, 2, 4, 6].forEach((col) => {
              const a = `${colLetters[col]}1`
              if (ws[a])
                ws[a].s = {
                  border: allBorders,
                  fill: { fgColor: { rgb: 'e8f0f8' } },
                  font: { bold: true, sz: 10, color: { rgb: '0a2040' } },
                  alignment: { horizontal: 'right' }
                }
            })
            ;[1, 3, 5, 7].forEach((col) => {
              const a = `${colLetters[col]}1`
              if (ws[a])
                ws[a].s = {
                  border: allBorders,
                  fill: { fgColor: { rgb: 'ffffff' } },
                  font: { sz: 10 },
                  alignment: { horizontal: 'left' }
                }
            })
            headers.forEach((_, col) => {
              const a = `${colLetters[col]}3`
              if (ws[a])
                ws[a].s = {
                  border: allBorders,
                  fill: { fgColor: { rgb: '1a4f7a' } },
                  font: { bold: true, sz: 10, color: { rgb: 'ffffff' } },
                  alignment: { horizontal: col < 4 ? 'left' : 'right' }
                }
            })
            ws['!cols'] = [
              { wch: 16 },
              { wch: 22 },
              { wch: 13 },
              { wch: 13 },
              { wch: 16 },
              { wch: 9 },
              { wch: 8 },
              { wch: 14 },
              { wch: 13 },
              { wch: 13 },
              { wch: 13 },
              { wch: 11 },
              { wch: 13 }
            ]
            XLSX.utils.book_append_sheet(wb, ws, 'War Breach')
            XLSX.writeFile(wb, modalFilename('xlsx'))
          }

          const buildModalEmailHTML = (): string => {
            const th = (t: string, align = 'right'): string =>
              `<td align="${align}" style="border:1px solid #8aaac8;padding:6px 10px;background:#cce0f5;color:#0a2040;text-align:${align};white-space:nowrap;font-size:11px;font-family:Arial,sans-serif;font-weight:bold;">${t}</td>`
            const td = (t: string, extra = ''): string =>
              `<td style="border:1px solid #ddd;padding:5px 10px;text-align:right;font-size:11px;font-family:Arial,sans-serif;${extra}">${t}</td>`
            const tdL = (t: string): string =>
              `<td style="border:1px solid #ddd;padding:5px 10px;text-align:left;font-size:11px;font-family:Arial,sans-serif;">${t}</td>`
            const dataRows = recVessels
              .map((v, i) => {
                const c = v.calc
                if (!c) return ''
                const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : '-'
                const rowBg = i % 2 === 1 ? 'background:#f9f9f9;' : ''
                return `<tr>${tdL(v.policyNo)}${tdL(v.vessel.toUpperCase())}${tdL(fmtDate(v.periodFrom))}${tdL(fmtDate(v.periodTo))}${td(fmt(parseFloat(v.sumInsured) || 0), rowBg)}${td(`${(parseFloat(v.rate) || 0).toFixed(3)}%`, rowBg)}${td(ncbLabel, rowBg)}${td(fmt(c.grossPrem), `${rowBg}font-weight:bold;`)}${td(fmt(c.taxesGov), `${rowBg}color:#c00000;`)}${td(fmt(c.net), rowBg)}${td(fmt(c.commission), rowBg)}${td(fmt(c.nrTax), rowBg)}${td(fmt(c.netDue), `${rowBg}font-weight:bold;color:#006b8f;`)}</tr>`
              })
              .filter(Boolean)
              .join('')
            const totalsRow = `<tr style="background:#e8f4fb;"><td colspan="12" align="right" style="border:1px solid #ddd;padding:7px 10px;text-align:right;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;">NET DUE TO R/I:</td><td align="right" style="border:1px solid #ddd;padding:7px 10px;text-align:right;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;color:#006b8f;">${fmt(recTotal)}</td></tr>`
            return `<table style="border-collapse:collapse;width:100%;"><tbody><tr>${th('POL. N°', 'left')}${th('VESSEL', 'left')}${th('FROM', 'left')}${th('TO', 'left')}${th('SUM INS.')}${th('RATE %')}${th('NCB')}${th('GROSS PREM.')}${th('TAXES GOV.')}${th('NET')}${th(`Your Comm. ${recSettings.commissionPct}%`)}${th('Tax Non-Resident')}${th('NET DUE')}</tr>${dataRows}${totalsRow}</tbody></table>`
          }

          const buildModalEmailTSV = (): string => {
            const cols = [
              'POL. N°',
              'VESSEL',
              'FROM',
              'TO',
              'SUM INS.',
              'RATE %',
              'NCB',
              'GROSS PREM.',
              'TAXES GOV.',
              'NET',
              `Your Comm. ${recSettings.commissionPct}%`,
              'Tax Non-Resident',
              'NET DUE'
            ]
            const lines = [cols.join('\t')]
            recVessels.forEach((v) => {
              const c = v.calc
              if (!c) return
              const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : ''
              lines.push(
                [
                  v.policyNo,
                  v.vessel.toUpperCase(),
                  fmtDate(v.periodFrom),
                  fmtDate(v.periodTo),
                  fmt(parseFloat(v.sumInsured) || 0),
                  `${(parseFloat(v.rate) || 0).toFixed(3)}%`,
                  ncbLabel,
                  fmt(c.grossPrem),
                  fmt(c.taxesGov),
                  fmt(c.net),
                  fmt(c.commission),
                  fmt(c.nrTax),
                  fmt(c.netDue)
                ].join('\t')
              )
            })
            lines.push(
              '',
              ['', '', '', '', '', '', '', '', '', '', '', 'NET DUE TO R/I:', fmt(recTotal)].join(
                '\t'
              )
            )
            return lines.join('\n')
          }

          const handleModalCopy = async (): Promise<void> => {
            try {
              const htmlBlob = new Blob([buildModalEmailHTML()], { type: 'text/html' })
              const textBlob = new Blob([buildModalEmailTSV()], { type: 'text/plain' })
              await navigator.clipboard.write([
                new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })
              ])
            } catch {
              await navigator.clipboard.writeText(buildModalEmailTSV())
            }
            setCopiedModal(true)
            setTimeout(() => setCopiedModal(false), 2500)
          }

          return (
            <Modal
              title={cvn || 'No Cover Note'}
              icon={<History size={18} />}
              onClose={() => setViewingRecord(null)}
              width={1100}
              closeOnOverlay={false}
              footer={
                <>
                  <button onClick={() => setViewingRecord(null)} className="btn-secondary">
                    Close
                  </button>
                  <button onClick={modalExportToExcel} className="btn-secondary">
                    <FileSpreadsheet size={16} /> Export Excel
                  </button>
                  <button onClick={handleModalCopy} className="btn-primary">
                    {copiedModal ? <CheckCircle size={16} /> : <Copy size={16} />}
                    {copiedModal ? 'Copied!' : 'Copy for Email'}
                  </button>
                </>
              }
            >
              <p
                style={{ margin: '0 0 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
              >
                Saved {date}
              </p>

              {/* Meta strip */}
              <div
                style={{
                  display: 'flex',
                  gap: '24px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: 'var(--table-header-bg)',
                  marginBottom: '20px',
                  flexWrap: 'wrap',
                  fontSize: '0.83rem'
                }}
              >
                {[
                  { label: 'Currency', value: curr },
                  { label: 'Base days', value: bd },
                  { label: 'Breach details', value: bdet || '—' },
                  { label: 'Commission', value: `${recSettings.commissionPct}%` },
                  { label: 'NR tax', value: `${recSettings.nrTaxPct}%` }
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '2px'
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontWeight: '600' }}>{value}</div>
                  </div>
                ))}
              </div>

              {/* Calculations table */}
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      {[
                        'POL. N°',
                        'VESSEL',
                        'FROM',
                        'TO',
                        'SUM INS.',
                        'RATE %',
                        'NCB',
                        'GROSS PREM.',
                        'TAXES GOV.',
                        'NET',
                        `Comm. ${recSettings.commissionPct}%`,
                        'NR Tax',
                        'NET DUE'
                      ].map((h, i) => (
                        <th key={h} style={{ textAlign: i < 4 ? 'left' : 'right' }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recVessels.map((v) => {
                      const c = v.calc
                      if (!c) return null
                      const ncbLabel =
                        (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : '-'
                      const nowrap: React.CSSProperties = { whiteSpace: 'nowrap' }
                      return (
                        <tr key={v.id}>
                          <td style={nowrap}>{v.policyNo}</td>
                          <td style={{ ...nowrap, fontWeight: 600 }}>{v.vessel.toUpperCase()}</td>
                          <td style={nowrap}>{fmtDate(v.periodFrom)}</td>
                          <td style={nowrap}>{fmtDate(v.periodTo)}</td>
                          <td className="num mono" style={nowrap}>
                            {fmt(parseFloat(v.sumInsured) || 0)}
                          </td>
                          <td className="num mono" style={nowrap}>
                            {(parseFloat(v.rate) || 0).toFixed(3)}%
                          </td>
                          <td className="mono" style={{ ...nowrap, textAlign: 'center' }}>
                            {ncbLabel}
                          </td>
                          <td
                            className="num mono"
                            style={{
                              ...nowrap,
                              fontWeight: 700,
                              borderLeft: `2px solid ${accentBorder}`
                            }}
                          >
                            {fmt(c.grossPrem)}
                          </td>
                          <td className="num mono" style={{ ...nowrap, color: 'var(--danger)' }}>
                            {fmt(c.taxesGov)}
                          </td>
                          <td className="num mono" style={nowrap}>
                            {fmt(c.net)}
                          </td>
                          <td className="num mono muted" style={nowrap}>
                            {fmt(c.commission)}
                          </td>
                          <td className="num mono muted" style={nowrap}>
                            {fmt(c.nrTax)}
                          </td>
                          <td
                            className="num mono"
                            style={{ ...nowrap, fontWeight: 700, color: 'var(--accent-primary)' }}
                          >
                            {fmt(c.netDue)}
                          </td>
                        </tr>
                      )
                    })}
                    <tr style={{ fontWeight: 600, background: 'var(--table-header-bg)' }}>
                      <td colSpan={12} style={{ textAlign: 'right' }}>
                        NET DUE TO R/I:
                      </td>
                      <td
                        className="num mono"
                        style={{
                          fontWeight: 700,
                          fontSize: '1rem',
                          color: 'var(--accent-primary)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {fmt(recTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Modal>
          )
        })()}

      {/* ── Email Preview (rendered table) ── */}
      {hasAnyResult && (
        <div style={{ marginTop: '28px' }}>
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-secondary)',
              marginBottom: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span style={{ fontWeight: 600 }}>Email Preview</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
              Pastes as a formatted table in Outlook / Word
            </span>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {[
                    'POL. N°',
                    'VESSEL',
                    'FROM',
                    'TO',
                    'SUM INS.',
                    'RATE %',
                    'NCB',
                    'GROSS PREM.',
                    'TAXES GOV.',
                    'NET',
                    `Your Comm. ${settings.commissionPct}%`,
                    'Tax Non-Resident',
                    'NET DUE'
                  ].map((h, i) => (
                    <th key={h} style={{ textAlign: i < 4 ? 'left' : 'right' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vessels.map((v, i) => {
                  const c = calculations[i]?.calc
                  if (!c) return null
                  const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : '-'
                  const nowrap: React.CSSProperties = { whiteSpace: 'nowrap' }
                  return (
                    <tr key={v.id}>
                      <td style={nowrap}>{v.policyNo}</td>
                      <td style={{ ...nowrap, fontWeight: 600 }}>{v.vessel.toUpperCase()}</td>
                      <td style={nowrap}>{fmtDate(v.periodFrom)}</td>
                      <td style={nowrap}>{fmtDate(v.periodTo)}</td>
                      <td className="num mono" style={nowrap}>
                        {fmt(parseFloat(v.sumInsured) || 0)}
                      </td>
                      <td className="num mono" style={nowrap}>
                        {(parseFloat(v.rate) || 0).toFixed(3)}%
                      </td>
                      <td className="mono" style={{ ...nowrap, textAlign: 'center' }}>
                        {ncbLabel}
                      </td>
                      <td
                        className="num mono"
                        style={{
                          ...nowrap,
                          fontWeight: 700,
                          borderLeft: `2px solid ${accentBorder}`
                        }}
                      >
                        {fmt(c.grossPrem)}
                      </td>
                      <td className="num mono" style={{ ...nowrap, color: 'var(--danger)' }}>
                        {fmt(c.taxesGov)}
                      </td>
                      <td className="num mono" style={nowrap}>
                        {fmt(c.net)}
                      </td>
                      <td className="num mono muted" style={nowrap}>
                        {fmt(c.commission)}
                      </td>
                      <td className="num mono muted" style={nowrap}>
                        {fmt(c.nrTax)}
                      </td>
                      <td
                        className="num mono"
                        style={{ ...nowrap, fontWeight: 700, color: 'var(--accent-primary)' }}
                      >
                        {fmt(c.netDue)}
                      </td>
                    </tr>
                  )
                })}
                <tr style={{ fontWeight: 600, background: 'var(--table-header-bg)' }}>
                  <td colSpan={12} style={{ textAlign: 'right' }}>
                    NET DUE TO R/I:
                  </td>
                  <td
                    className="num mono"
                    style={{
                      fontWeight: 700,
                      color: 'var(--accent-primary)',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {fmt(totalNetDue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
