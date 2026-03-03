import { useState, useMemo } from 'react'
import XLSX from 'xlsx-js-style'
import { useTheme } from '../contexts/ThemeContext'
import { Plus, X, Copy, ChevronDown, ChevronRight, Settings, CheckCircle, FileSpreadsheet } from 'lucide-react'

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
}

// ── Tax calculation (mirrors Premium Calculation - Taxes.xlsx) ────────────────

function calcTaxesUSD(grossPremUSD: number, s: TaxSettings): number {
  if (grossPremUSD <= 0) return 0
  const { exchangeRate, netPremiumPct, costOfPolicy, propStampsPct, fixedStamps, muniTaxPct } = s
  const j = grossPremUSD * exchangeRate
  const c = grossPremUSD * (netPremiumPct / 100) * exchangeRate
  const d = Math.round(((j * 0.4005) - 19531000) / 1.09)
  const base = c + d + costOfPolicy
  const k = Math.round(base * (propStampsPct / 100)) + fixedStamps + Math.round(base * (muniTaxPct / 100))
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
  if (rawDays < 0) return null  // invalid date range — handled as error in UI
  if (sumIns <= 0 || rate <= 0 || baseDays <= 0) return null

  // If the period is shorter than base days, charge the full base period
  const totalDays = Math.max(rawDays, baseDays)

  const grossPrem = (sumIns * (rate / 100)) / baseDays * (1 - ncb / 100) * totalDays
  const taxesGov = calcTaxesUSD(grossPrem, settings)
  const net = grossPrem - taxesGov
  const commission = net * (settings.commissionPct / 100)
  const nrTax = net * (settings.nrTaxPct / 100)
  const netDue = net - commission - nrTax

  return { totalDays, grossPrem, taxesGov, net, commission, nrTax, netDue }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtNum = (n: number) => parseFloat(n.toFixed(2)) // numeric value for Excel

function fmtDate(d: string): string {
  if (!d) return ''
  const dt = new Date(d)
  return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')}.${dt.getFullYear()}`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WarBreachCalculator() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [coverNoteNo, setCoverNoteNo] = useState('')
  const [currency, setCurrency] = useState('US DOLLARS')
  const [breachDetails, setBreachDetails] = useState('')
  const [baseDays, setBaseDays] = useState(7)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_SETTINGS)
  const [copied, setCopied] = useState(false)

  const [vessels, setVessels] = useState<VesselRow[]>([
    { id: '1', policyNo: '', vessel: '', periodFrom: '', periodTo: '', sumInsured: '', rate: '', ncbDiscount: '0' }
  ])

  // ── Computed ─────────────────────────────────────────────────────────────

  const calculations = useMemo(
    () => vessels.map(v => ({ id: v.id, calc: calcVessel(v, settings, baseDays) })),
    [vessels, settings, baseDays]
  )

  const totalNetDue = useMemo(
    () => calculations.reduce((sum, c) => sum + (c.calc?.netDue ?? 0), 0),
    [calculations]
  )

  const hasAnyResult = calculations.some(c => c.calc !== null)

  // ── Vessel row handlers ───────────────────────────────────────────────────

  const addVessel = () =>
    setVessels(prev => [...prev, {
      id: Date.now().toString(),
      policyNo: '', vessel: '', periodFrom: '', periodTo: '', sumInsured: '', rate: '', ncbDiscount: '0'
    }])

  const removeVessel = (id: string) => {
    if (vessels.length === 1) return
    setVessels(prev => prev.filter(v => v.id !== id))
  }

  const updateVessel = (id: string, field: keyof VesselRow, value: string) =>
    setVessels(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v))

  const updateSetting = (field: keyof TaxSettings, value: number) =>
    setSettings(prev => ({ ...prev, [field]: value }))

  const resetSettings = () => setSettings(DEFAULT_SETTINGS)

  // ── Filename builder ──────────────────────────────────────────────────────

  function buildFilename(ext: string): string {
    const vesselNames = vessels
      .filter((_, i) => calculations[i]?.calc !== null)
      .map(v => v.vessel.trim())
      .filter(Boolean)
      .join(' - ')
    const now = new Date()
    const monthYear = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const parts = [vesselNames || 'Vessels', breachDetails.trim() || 'Breach', monthYear]
    return `${parts.join(' - ')}.${ext}`
  }

  // ── Excel export ──────────────────────────────────────────────────────────

  function exportToExcel() {
    const wb = XLSX.utils.book_new()

    // Info rows
    const infoRows = [
      ['COVER NOTE', coverNoteNo || '', 'CURRENCY', currency, 'BASE DAYS', baseDays, 'BREACH DETAILS', breachDetails || ''],
      [],
    ]

    // Column headers
    const headers = [
      'POL. N°', 'VESSEL', 'FROM', 'TO',
      'SUM INS. (USD)', 'RATE %', 'NCB %',
      'GROSS PREM.', 'TAXES GOV.', 'NET', `Your Comm. ${settings.commissionPct}%`, 'Tax Non-Resident', 'NET DUE'
    ]

    // Data rows
    const dataRows = vessels.map((v, i) => {
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
        fmtNum(c.netDue),
      ]
    }).filter((r): r is (string | number)[] => r !== null)

    // Total row
    const totalRow = ['', '', '', '', '', '', '', '', '', '', '', 'NET DUE TO R/I:', fmtNum(totalNetDue)]

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
    infoLabelCols.forEach(col => {
      const addr = `${colLetters[col]}1`
      if (ws[addr]) ws[addr].s = { border: allBorders, fill: labelFill, font: labelFont, alignment: { horizontal: 'right' } }
    })
    infoValueCols.forEach(col => {
      const addr = `${colLetters[col]}1`
      if (ws[addr]) ws[addr].s = { border: allBorders, fill: valueFill, font: { sz: 10 }, alignment: { horizontal: 'left' } }
    })

    // Row 3 — header cells (A3:M3): navy fill, white bold text, thin borders
    const hdrFill = { fgColor: { rgb: '1a4f7a' } }
    const hdrFont = { bold: true, sz: 10, color: { rgb: 'ffffff' } }
    headers.forEach((_, col) => {
      const addr = `${colLetters[col]}3`
      if (ws[addr]) ws[addr].s = { border: allBorders, fill: hdrFill, font: hdrFont, alignment: { horizontal: col < 4 ? 'left' : 'right' } }
    })

    // Column widths
    ws['!cols'] = [
      { wch: 16 }, { wch: 22 }, { wch: 13 }, { wch: 13 },
      { wch: 16 }, { wch: 9 }, { wch: 8 },
      { wch: 14 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 13 },
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'War Breach')
    XLSX.writeFile(wb, buildFilename('xlsx'))
  }

  // ── Email output builders ─────────────────────────────────────────────────

  function buildEmailHTML(): string {
    // Use <font> tag inside each header cell — the only technique that survives Outlook/Word paste reliably
    const th = (t: string, align = 'right') =>
      `<td style="border:1px solid #8aaac8;padding:6px 10px;background:#1a4f7a;text-align:${align};white-space:nowrap;font-size:11px;font-family:Arial,sans-serif;font-weight:bold;"><font color="#ffffff">${t}</font></td>`
    const td = (t: string, extra = '') =>
      `<td style="border:1px solid #ddd;padding:5px 10px;text-align:right;font-size:11px;font-family:Arial,sans-serif;${extra}">${t}</td>`
    const tdL = (t: string) =>
      `<td style="border:1px solid #ddd;padding:5px 10px;text-align:left;font-size:11px;font-family:Arial,sans-serif;">${t}</td>`

    const commLabel = `Your Comm. ${settings.commissionPct}%`

    const dataRows = vessels.map((v, i) => {
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
    }).filter(Boolean).join('')

    const totalsRow = `<tr style="background:#e8f4fb;">
      <td colspan="12" style="border:1px solid #ddd;padding:7px 10px;text-align:right;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;">NET DUE TO R/I:</td>
      <td style="border:1px solid #ddd;padding:7px 10px;text-align:right;font-weight:bold;font-size:11px;font-family:Arial,sans-serif;color:#006b8f;">${fmt(totalNetDue)}</td>
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
    const cols = ['POL. N°', 'VESSEL', 'FROM', 'TO', 'SUM INS.', 'RATE %', 'NCB', 'GROSS PREM.', 'TAXES GOV.', 'NET', `Your Comm. ${settings.commissionPct}%`, 'Tax Non-Resident', 'NET DUE']
    const lines = [cols.join('\t')]
    vessels.forEach((v, i) => {
      const c = calculations[i]?.calc
      if (!c) return
      const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : ''
      lines.push([
        v.policyNo, v.vessel.toUpperCase(), fmtDate(v.periodFrom), fmtDate(v.periodTo),
        fmt(parseFloat(v.sumInsured) || 0), `${(parseFloat(v.rate) || 0).toFixed(3)}%`,
        ncbLabel,
        fmt(c.grossPrem), fmt(c.taxesGov), fmt(c.net), fmt(c.commission), fmt(c.nrTax), fmt(c.netDue)
      ].join('\t'))
    })
    lines.push('', ['', '', '', '', '', '', '', '', '', '', '', 'NET DUE TO R/I:', fmt(totalNetDue)].join('\t'))
    return lines.join('\n')
  }

  const handleCopy = async () => {
    try {
      const htmlBlob = new Blob([buildEmailHTML()], { type: 'text/html' })
      const textBlob = new Blob([buildEmailTSV()], { type: 'text/plain' })
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })])
    } catch {
      await navigator.clipboard.writeText(buildEmailTSV())
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const cellInput: React.CSSProperties = {
    padding: '5px 7px',
    fontSize: '0.82rem',
    borderRadius: '6px',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    width: '100%',
  }

  const accentBg = isLight ? 'rgba(0,119,163,0.07)' : 'rgba(0,210,255,0.07)'
  const accentBorder = isLight ? 'rgba(0,119,163,0.18)' : 'rgba(0,210,255,0.18)'

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  }

  const inputBg = isLight ? '#ffffff' : 'rgba(255,255,255,0.04)'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="glass-card" style={{ padding: '28px' }}>

      {/* ── Title + action buttons ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem' }}>War Breach Calculator</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Compute war/breach premiums with Lebanese government taxes
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={exportToExcel}
            disabled={!hasAnyResult}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: hasAnyResult ? 1 : 0.4 }}
          >
            <FileSpreadsheet size={16} /> Export Excel
          </button>
          <button
            onClick={handleCopy}
            disabled={!hasAnyResult}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', opacity: hasAnyResult ? 1 : 0.4 }}
          >
            {copied ? <CheckCircle size={16} /> : <Copy size={16} />}
            {copied ? 'Copied!' : 'Copy for Email'}
          </button>
        </div>
      </div>

      {/* ── Cover Note header — 2×2 grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 2fr 1fr',
        gridTemplateRows: 'auto auto',
        gap: '16px 20px',
        marginBottom: '20px',
        padding: '18px 20px',
        borderRadius: '10px',
        background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
        border: '1px solid var(--table-border)',
      }}>
        {/* Row 1 */}
        <div>
          <label style={labelStyle}>Cover Note No.</label>
          <input
            type="text"
            value={coverNoteNo}
            onChange={e => setCoverNoteNo(e.target.value)}
            placeholder="e.g. RMAMW2204174"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Breach Details</label>
          <input
            type="text"
            value={breachDetails}
            onChange={e => setBreachDetails(e.target.value)}
            placeholder="e.g. Gulf of Aden transit"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={labelStyle}>Base Days</label>
          <input
            type="number"
            value={baseDays}
            onChange={e => setBaseDays(parseInt(e.target.value) || 7)}
            min="1"
            step="1"
            style={{ width: '100%' }}
          />
        </div>
        {/* Row 2 */}
        <div>
          <label style={labelStyle}>Currency</label>
          <input
            type="text"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            placeholder="e.g. US DOLLARS"
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* ── Collapsible tax settings ── */}
      <div style={{ marginBottom: '24px', border: '1px solid var(--table-border)', borderRadius: '10px', overflow: 'hidden' }}>
        <button
          onClick={() => setShowSettings(s => !s)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
            padding: '11px 16px', border: 'none', cursor: 'pointer',
            background: isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.025)',
            color: 'var(--text-secondary)', fontSize: '0.875rem',
            fontFamily: 'inherit', textAlign: 'left',
          }}
        >
          {showSettings ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          <Settings size={14} />
          Tax Settings (Lebanese Government Taxes)
          <span style={{ marginLeft: 'auto', fontSize: '0.78rem', opacity: 0.7 }}>
            Rate {settings.exchangeRate.toLocaleString()} LBP/USD · Commission {settings.commissionPct}% · NR Tax {settings.nrTaxPct}%
          </span>
        </button>

        {showSettings && (
          <div style={{ padding: '16px', borderTop: '1px solid var(--table-border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '14px' }}>
              {([
                { label: 'Exchange Rate (LBP/USD)', field: 'exchangeRate', step: '500', note: 'e.g. 89 500' },
                { label: 'Net Premium % of Gross', field: 'netPremiumPct', step: '1', note: 'default 55%' },
                { label: 'Cost of Policy (LBP)', field: 'costOfPolicy', step: '100000', note: 'default 17 900 000' },
                { label: 'Proportional Stamps %', field: 'propStampsPct', step: '0.1', note: 'default 3%' },
                { label: 'Fixed Stamps (LBP)', field: 'fixedStamps', step: '1000', note: 'default 200 000 for war' },
                { label: 'Municipal Tax %', field: 'muniTaxPct', step: '0.1', note: 'default 6%' },
                { label: 'Commission %', field: 'commissionPct', step: '0.25', note: 'broker commission' },
                { label: 'Non-Resident Tax %', field: 'nrTaxPct', step: '0.01', note: 'default 2.25%' },
              ] as { label: string; field: keyof TaxSettings; step: string; note: string }[]).map(({ label, field, step, note }) => (
                <div key={field}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {label}
                    <span style={{ marginLeft: '6px', fontSize: '0.72rem', opacity: 0.6 }}>({note})</span>
                  </label>
                  <input
                    type="number"
                    value={settings[field]}
                    onChange={e => updateSetting(field, parseFloat(e.target.value) || 0)}
                    step={step}
                    min="0"
                    style={{ width: '100%' }}
                  />
                </div>
              ))}
            </div>
            <button onClick={resetSettings} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '5px 12px' }}>
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
          const borderColor = dateError ? 'rgba(255,77,77,0.4)' : c ? accentBorder : 'var(--table-border)'
          return (
            <div key={v.id} style={{
              borderRadius: '10px',
              border: `1px solid ${borderColor}`,
              overflow: 'hidden',
              background: inputBg,
            }}>
              {/* ── Input row ── */}
              <div style={{ padding: '14px 16px' }}>
                {/* Card header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Vessel {idx + 1}{v.vessel ? ` — ${v.vessel.toUpperCase()}` : ''}
                  </span>
                  <button
                    onClick={() => removeVessel(v.id)}
                    disabled={vessels.length === 1}
                    title="Remove vessel"
                    style={{ background: 'transparent', border: 'none', cursor: vessels.length === 1 ? 'default' : 'pointer', color: 'var(--danger)', opacity: vessels.length === 1 ? 0.12 : 0.5, padding: '2px', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={15} />
                  </button>
                </div>

                {/* Row 1: Policy No | Vessel Name | From | To */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '12px', marginBottom: '10px' }}>
                  <div>
                    <label style={labelStyle}>Policy No.</label>
                    <input style={cellInput} placeholder="W25209161E2" value={v.policyNo} onChange={e => updateVessel(v.id, 'policyNo', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vessel Name</label>
                    <input style={{ ...cellInput, textTransform: 'uppercase' }} placeholder="e.g. ATLANTIC PRIDE" value={v.vessel} onChange={e => updateVessel(v.id, 'vessel', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>From</label>
                    <input style={{ ...cellInput, colorScheme: isLight ? 'light' : 'dark' }} type="date" value={v.periodFrom} onChange={e => updateVessel(v.id, 'periodFrom', e.target.value)} />
                  </div>
                  <div>
                    <label style={labelStyle}>To</label>
                    <input style={{ ...cellInput, colorScheme: isLight ? 'light' : 'dark' }} type="date" value={v.periodTo} onChange={e => updateVessel(v.id, 'periodTo', e.target.value)} />
                  </div>
                </div>

                {/* Row 2: Sum Insured | Rate % | NCB % */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Sum Insured (USD)</label>
                    <input style={{ ...cellInput, textAlign: 'right' }} type="number" placeholder="0" value={v.sumInsured} onChange={e => updateVessel(v.id, 'sumInsured', e.target.value)} min="0" step="any" />
                  </div>
                  <div>
                    <label style={labelStyle}>Rate %</label>
                    <input style={{ ...cellInput, textAlign: 'right' }} type="number" placeholder="1.000" value={v.rate} onChange={e => updateVessel(v.id, 'rate', e.target.value)} min="0" step="0.001" />
                  </div>
                  <div>
                    <label style={labelStyle}>NCB Discount %</label>
                    <input style={{ ...cellInput, textAlign: 'right' }} type="number" placeholder="0" value={v.ncbDiscount} onChange={e => updateVessel(v.id, 'ncbDiscount', e.target.value)} min="0" max="99" step="5" />
                  </div>
                </div>
              </div>

              {/* ── Results strip ── */}
              {c ? (
                <div style={{
                  padding: '10px 16px',
                  background: accentBg,
                  borderTop: `2px solid ${accentBorder}`,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '4px',
                }}>
                  {([
                    { label: 'Gross Premium', value: c.grossPrem, weight: 600 },
                    { label: 'Gov. Taxes', value: c.taxesGov, color: isLight ? '#c00000' : '#ff7070' },
                    { label: 'Net', value: c.net },
                    { label: 'Commission', value: c.commission, color: 'var(--text-secondary)' },
                    { label: 'NR Tax', value: c.nrTax, color: 'var(--text-secondary)' },
                    { label: 'NET DUE', value: c.netDue, weight: 700, color: 'var(--accent-primary)', large: true },
                  ] as { label: string; value: number; weight?: number; color?: string; large?: boolean }[]).map(item => (
                    <div key={item.label} style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginBottom: '2px', letterSpacing: '0.03em' }}>
                        {item.label}
                      </div>
                      <div style={{
                        fontFamily: 'monospace',
                        fontWeight: item.weight ?? 400,
                        fontSize: item.large ? '1rem' : '0.85rem',
                        color: item.color ?? 'var(--text-primary)',
                        lineHeight: 1.2,
                      }}>
                        {fmt(item.value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : dateError ? (
                <div style={{
                  padding: '8px 16px',
                  borderTop: '1px solid rgba(255,77,77,0.3)',
                  color: 'var(--danger)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textAlign: 'center',
                }}>
                  ⚠ End date must be after start date
                </div>
              ) : (
                <div style={{
                  padding: '8px 16px',
                  borderTop: '1px solid var(--table-border)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.75rem',
                  fontStyle: 'italic',
                  textAlign: 'center',
                }}>
                  Complete all fields to see results
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer: Add vessel + total ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addVessel} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Add Vessel
        </button>

        {hasAnyResult && (
          <div style={{ padding: '14px 24px', borderRadius: '12px', background: accentBg, border: `1px solid ${accentBorder}`, textAlign: 'right' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Net Due to R/I</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
              {fmt(totalNetDue)}
            </div>
          </div>
        )}
      </div>

      {/* ── Email Preview (rendered table) ── */}
      {hasAnyResult && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600 }}>Email Preview</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>Pastes as a formatted table in Outlook / Word</span>
          </div>

          <div style={{
            borderRadius: '10px',
            border: '1px solid var(--table-border)',
            padding: '18px 20px',
            background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
            overflowX: 'auto',
          }}>
            {/* Preview table */}
            <table style={{ borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: '#1a4f7a' }}>
                  {(['POL. N°', 'VESSEL', 'FROM', 'TO', 'SUM INS.', 'RATE %', 'NCB', 'GROSS PREM.', 'TAXES GOV.', 'NET', `Your Comm. ${settings.commissionPct}%`, 'Tax Non-Resident', 'NET DUE']).map((h, i) => (
                    <th key={h} style={{
                      padding: '7px 10px',
                      border: '1px solid #2a5a8a',
                      color: i === 12 ? 'var(--accent-primary)' : '#ffffff',
                      textAlign: i < 4 ? 'left' : 'right',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      ...(i === 7 ? { borderLeft: '2px solid #4a9fd4' } : {}),
                    }}>
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
                  const rowBg = i % 2 === 1 ? (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)') : 'transparent'
                  const cell: React.CSSProperties = { padding: '6px 10px', border: '1px solid var(--table-border)', background: rowBg, whiteSpace: 'nowrap' }
                  const num: React.CSSProperties = { ...cell, textAlign: 'right', fontFamily: 'monospace' }
                  return (
                    <tr key={v.id}>
                      <td style={cell}>{v.policyNo}</td>
                      <td style={{ ...cell, fontWeight: 600 }}>{v.vessel.toUpperCase()}</td>
                      <td style={cell}>{fmtDate(v.periodFrom)}</td>
                      <td style={cell}>{fmtDate(v.periodTo)}</td>
                      <td style={num}>{fmt(parseFloat(v.sumInsured) || 0)}</td>
                      <td style={num}>{(parseFloat(v.rate) || 0).toFixed(3)}%</td>
                      <td style={{ ...num, textAlign: 'center' }}>{ncbLabel}</td>
                      <td style={{ ...num, fontWeight: 700, borderLeft: `2px solid ${accentBorder}` }}>{fmt(c.grossPrem)}</td>
                      <td style={{ ...num, color: isLight ? '#c00000' : '#ff7070' }}>{fmt(c.taxesGov)}</td>
                      <td style={num}>{fmt(c.net)}</td>
                      <td style={{ ...num, color: 'var(--text-secondary)' }}>{fmt(c.commission)}</td>
                      <td style={{ ...num, color: 'var(--text-secondary)' }}>{fmt(c.nrTax)}</td>
                      <td style={{ ...num, fontWeight: 700, color: 'var(--accent-primary)' }}>{fmt(c.netDue)}</td>
                    </tr>
                  )
                })}
                <tr style={{ background: accentBg, borderTop: `2px solid ${accentBorder}` }}>
                  <td colSpan={12} style={{ padding: '7px 10px', border: '1px solid var(--table-border)', textAlign: 'right', fontWeight: 700, background: accentBg }}>
                    NET DUE TO R/I:
                  </td>
                  <td style={{ padding: '7px 10px', border: '1px solid var(--table-border)', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: 'var(--accent-primary)', background: accentBg }}>
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
