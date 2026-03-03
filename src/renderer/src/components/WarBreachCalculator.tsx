import { useState, useMemo, useCallback } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { Plus, X, Copy, ChevronDown, ChevronRight, Settings, CheckCircle } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface VesselRow {
  id: string
  policyNo: string
  vessel: string
  periodFrom: string
  periodTo: string
  sumInsured: string
  rate: string
  ncbDiscount: string // % discount — 0 = no discount, 50 = 50% off
}

interface TaxSettings {
  exchangeRate: number    // LBP per USD, default 89 500
  netPremiumPct: number   // % of gross USD used as Net Premium LBP base, default 55
  costOfPolicy: number    // fixed LBP cost, default 17 900 000
  propStampsPct: number   // % applied to (NetPrem+Fees+Cost), default 3
  fixedStamps: number     // LBP, default 200 000 for war
  muniTaxPct: number      // % applied to (NetPrem+Fees+Cost), default 6
  commissionPct: number   // broker commission %, default 15
  nrTaxPct: number        // non-resident tax %, default 2.25
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
  const j = grossPremUSD * exchangeRate                             // Gross Premium LBP
  const c = grossPremUSD * (netPremiumPct / 100) * exchangeRate    // Net Premium LBP
  const d = Math.round(((j * 0.4005) - 19531000) / 1.09)          // Regulatory Fees
  const e = costOfPolicy                                            // Cost of Policy
  const base = c + d + e
  const f = Math.round(base * (propStampsPct / 100))               // Proportional Stamps
  const g = fixedStamps                                             // Fixed Stamps
  const h = Math.round(base * (muniTaxPct / 100))                  // Municipal Taxes
  const k = f + g + h                                              // War RI total (LBP)
  return k / exchangeRate                                           // → USD
}

// ── Per-vessel calculation ────────────────────────────────────────────────────

interface VesselCalc {
  grossPrem: number
  taxesGov: number
  net: number
  commission: number
  nrTax: number
  netDue: number
}

function calcVessel(row: VesselRow, settings: TaxSettings): VesselCalc | null {
  const sumIns = parseFloat(row.sumInsured) || 0
  const rate = parseFloat(row.rate) || 0
  const ncb = parseFloat(row.ncbDiscount) || 0
  if (sumIns <= 0 || rate <= 0) return null

  const grossPrem = sumIns * (rate / 100) * (1 - ncb / 100)
  const taxesGov = calcTaxesUSD(grossPrem, settings)
  const net = grossPrem - taxesGov
  const commission = net * (settings.commissionPct / 100)
  const nrTax = net * (settings.nrTaxPct / 100)
  const netDue = net - commission - nrTax

  return { grossPrem, taxesGov, net, commission, nrTax, netDue }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState<TaxSettings>(DEFAULT_SETTINGS)
  const [copied, setCopied] = useState(false)

  const [vessels, setVessels] = useState<VesselRow[]>([
    { id: '1', policyNo: '', vessel: '', periodFrom: '', periodTo: '', sumInsured: '', rate: '', ncbDiscount: '0' }
  ])

  // ── Computed ─────────────────────────────────────────────────────────────

  const calculations = useMemo(
    () => vessels.map(v => ({ id: v.id, calc: calcVessel(v, settings) })),
    [vessels, settings]
  )

  const totalNetDue = useMemo(
    () => calculations.reduce((sum, c) => sum + (c.calc?.netDue ?? 0), 0),
    [calculations]
  )

  const hasAnyResult = calculations.some(c => c.calc !== null)

  // ── Handlers ─────────────────────────────────────────────────────────────

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

  // ── Email text builder ────────────────────────────────────────────────────

  const buildEmailText = useCallback((): string => {
    const padL = (s: string | number, n: number) => String(s).padEnd(n)
    const padR = (s: string | number, n: number) => String(s).padStart(n)
    const SEP = '-'.repeat(166)

    const lines: string[] = []
    lines.push(`COVER NOTE: ${coverNoteNo || '___________'}${''.padEnd(20)}CURRENCY: ${currency}`)
    lines.push('')
    lines.push(
      padL('POL. N°', 16) +
      padL('VESSEL', 20) +
      padL('PERIOD', 25) +
      padR('SUM INS.', 15) +
      padR('RATE %', 9) +
      padR('NCB', 8) +
      padR('GROSS PREM.', 14) +
      padR('TAXES GOV.', 13) +
      padR('NET', 13) +
      padR('YOUR COMM', 12) +
      padR('TAX N.R.', 11) +
      padR('NET DUE', 11)
    )
    lines.push(SEP)

    vessels.forEach((v, i) => {
      const c = calculations[i]?.calc
      if (!c) return
      const period = v.periodFrom && v.periodTo
        ? `${fmtDate(v.periodFrom)}-${fmtDate(v.periodTo)}`
        : (v.periodFrom ? fmtDate(v.periodFrom) : '')
      const ncbLabel = (parseFloat(v.ncbDiscount) || 0) > 0 ? `${v.ncbDiscount}%` : ''
      lines.push(
        padL(v.policyNo, 16) +
        padL(v.vessel.toUpperCase(), 20) +
        padL(period, 25) +
        padR(fmt(parseFloat(v.sumInsured) || 0), 15) +
        padR((parseFloat(v.rate) || 0).toFixed(3) + '%', 9) +
        padR(ncbLabel, 8) +
        padR(fmt(c.grossPrem), 14) +
        padR(fmt(c.taxesGov), 13) +
        padR(fmt(c.net), 13) +
        padR(fmt(c.commission), 12) +
        padR(fmt(c.nrTax), 11) +
        padR(fmt(c.netDue), 11)
      )
    })

    lines.push(SEP)
    lines.push('')
    lines.push(''.padEnd(135) + 'NET DUE TO R/I:  ' + fmt(totalNetDue))
    return lines.join('\n')
  }, [vessels, calculations, coverNoteNo, currency, totalNetDue])

  const handleCopy = () => {
    navigator.clipboard.writeText(buildEmailText()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
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

  const resultCell: React.CSSProperties = {
    padding: '6px 10px',
    textAlign: 'right',
    fontFamily: 'monospace',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
  }

  const accentBg = isLight ? 'rgba(0,119,163,0.07)' : 'rgba(0,210,255,0.07)'
  const accentBorder = isLight ? 'rgba(0,119,163,0.18)' : 'rgba(0,210,255,0.18)'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="glass-card" style={{ padding: '28px' }}>

      {/* ── Title + Copy button ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: '0 0 6px 0', fontSize: '1.4rem' }}>War Breach Calculator</h2>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.9rem' }}>
            Compute war/breach premiums with Lebanese government taxes
          </p>
        </div>
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

      {/* ── Cover Note header ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Cover Note No.
          </label>
          <input
            type="text"
            value={coverNoteNo}
            onChange={e => setCoverNoteNo(e.target.value)}
            placeholder="e.g. RMAMW2204174"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Currency
          </label>
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

      {/* ── Vessels table ── */}
      <div style={{ overflowX: 'auto', marginBottom: '16px', borderRadius: '10px', border: '1px solid var(--table-border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1350px' }}>
          <thead>
            <tr style={{ background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
              {/* Inputs */}
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>POL. N°</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>VESSEL</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>FROM</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'left', whiteSpace: 'nowrap' }}>TO</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>SUM INS. (USD)</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>RATE %</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>NCB DISC. %</th>
              {/* Computed */}
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: accentBg, whiteSpace: 'nowrap' }}>GROSS PREM.</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: accentBg, whiteSpace: 'nowrap' }}>TAXES GOV.</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: accentBg, whiteSpace: 'nowrap' }}>NET</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: accentBg, whiteSpace: 'nowrap' }}>YOUR COMM.</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: accentBg, whiteSpace: 'nowrap' }}>TAX N.R.</th>
              <th style={{ padding: '10px 8px', fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 700, textAlign: 'right', background: accentBg, whiteSpace: 'nowrap' }}>NET DUE</th>
              <th style={{ padding: '10px 4px', width: '28px' }} />
            </tr>
          </thead>
          <tbody>
            {vessels.map((v, idx) => {
              const c = calculations[idx]?.calc
              return (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={cellInput} placeholder="W25209161E2" value={v.policyNo} onChange={e => updateVessel(v.id, 'policyNo', e.target.value)} />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={cellInput} placeholder="Vessel Name" value={v.vessel} onChange={e => updateVessel(v.id, 'vessel', e.target.value)} />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={{ ...cellInput, colorScheme: isLight ? 'light' : 'dark' }} type="date" value={v.periodFrom} onChange={e => updateVessel(v.id, 'periodFrom', e.target.value)} />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={{ ...cellInput, colorScheme: isLight ? 'light' : 'dark' }} type="date" value={v.periodTo} onChange={e => updateVessel(v.id, 'periodTo', e.target.value)} />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={{ ...cellInput, textAlign: 'right' }} type="number" placeholder="1 000 000" value={v.sumInsured} onChange={e => updateVessel(v.id, 'sumInsured', e.target.value)} min="0" step="any" />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={{ ...cellInput, textAlign: 'right' }} type="number" placeholder="1.000" value={v.rate} onChange={e => updateVessel(v.id, 'rate', e.target.value)} min="0" step="0.001" />
                  </td>
                  <td style={{ padding: '5px 8px' }}>
                    <input style={{ ...cellInput, textAlign: 'right' }} type="number" placeholder="0" value={v.ncbDiscount} onChange={e => updateVessel(v.id, 'ncbDiscount', e.target.value)} min="0" max="99" step="5" />
                  </td>

                  {/* Computed columns */}
                  {c ? (
                    <>
                      <td style={{ ...resultCell, background: accentBg, fontWeight: 600 }}>{fmt(c.grossPrem)}</td>
                      <td style={{ ...resultCell, background: accentBg, color: isLight ? '#c00000' : '#ff7070' }}>{fmt(c.taxesGov)}</td>
                      <td style={{ ...resultCell, background: accentBg }}>{fmt(c.net)}</td>
                      <td style={{ ...resultCell, background: accentBg, color: 'var(--text-secondary)' }}>{fmt(c.commission)}</td>
                      <td style={{ ...resultCell, background: accentBg, color: 'var(--text-secondary)' }}>{fmt(c.nrTax)}</td>
                      <td style={{ ...resultCell, background: accentBg, fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.9rem' }}>{fmt(c.netDue)}</td>
                    </>
                  ) : (
                    <td colSpan={6} style={{ padding: '6px 10px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem', background: accentBg, fontStyle: 'italic' }}>
                      — enter sum insured + rate —
                    </td>
                  )}

                  <td style={{ padding: '5px 4px', textAlign: 'center' }}>
                    <button
                      onClick={() => removeVessel(v.id)}
                      disabled={vessels.length === 1}
                      title="Remove vessel"
                      style={{ background: 'transparent', border: 'none', cursor: vessels.length === 1 ? 'default' : 'pointer', color: 'var(--danger)', opacity: vessels.length === 1 ? 0.15 : 0.65, padding: '4px', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Footer: Add + Total ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={addVessel} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Add Vessel
        </button>

        {hasAnyResult && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '14px 24px', borderRadius: '12px', background: accentBg, border: `1px solid ${accentBorder}` }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>Net Due to R/I</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
                {fmt(totalNetDue)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Preview (monospace) ── */}
      {hasAnyResult && (
        <div style={{ marginTop: '28px' }}>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Email Preview</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>best viewed in a monospace font email client</span>
          </div>
          <pre style={{
            fontFamily: 'Courier New, Courier, monospace',
            fontSize: '0.72rem',
            lineHeight: '1.6',
            padding: '16px',
            borderRadius: '8px',
            background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
            border: '1px solid var(--table-border)',
            overflowX: 'auto',
            whiteSpace: 'pre',
            color: 'var(--text-primary)',
            margin: 0,
          }}>
            {buildEmailText()}
          </pre>
        </div>
      )}
    </div>
  )
}
