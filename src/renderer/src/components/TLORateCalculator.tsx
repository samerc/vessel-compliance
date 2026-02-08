import { useState, useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'

export default function TLORateCalculator() {
  const [currentValue, setCurrentValue] = useState('')
  const [premium, setPremium] = useState('')
  const [newValue, setNewValue] = useState('')
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const calculation = useMemo(() => {
    const cv = parseFloat(currentValue) || 0
    const p = parseFloat(premium) || 0
    const nv = parseFloat(newValue) || 0

    if (cv <= 0 || p <= 0 || nv <= 0) return null

    // Step 1: Rate = (Premium / Current Value) * 100 — keep 4 decimal places
    const rate = parseFloat(((p / cv) * 100).toFixed(4))

    // Step 2: Rate / 3
    const rateDiv3 = parseFloat((rate / 3).toFixed(4))

    // Step 3: Difference between new value and current value
    const diff = nv - cv

    // Step 4: Difference * (Rate / 3) — as percentage
    const additionalPremium = parseFloat((diff * (rateDiv3 / 100)).toFixed(2))

    // Step 5: Premium + additional premium = new premium
    const newPremium = parseFloat((p + additionalPremium).toFixed(2))

    // Step 6: New premium / new value * 100 = new rate
    const newRate = parseFloat(((newPremium / nv) * 100).toFixed(4))

    return { rate, rateDiv3, diff, additionalPremium, newPremium, newRate }
  }, [currentValue, premium, newValue])

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtRate = (n: number) => n.toFixed(4) + '%'

  const cardStyle = {
    padding: '16px 20px',
    borderRadius: '12px',
    background: isLight ? 'rgba(0, 119, 163, 0.06)' : 'rgba(0, 210, 255, 0.06)',
    border: `1px solid ${isLight ? 'rgba(0, 119, 163, 0.15)' : 'rgba(0, 210, 255, 0.15)'}`
  }

  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem' }}>TLO Rate Calculator</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', fontSize: '0.9rem' }}>
        Calculate the adjusted Total Loss Only premium when the vessel value changes.
      </p>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '28px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Current Vessel Value
          </label>
          <input
            type="number"
            value={currentValue}
            onChange={e => setCurrentValue(e.target.value)}
            placeholder="e.g. 5,000,000"
            style={{ width: '100%' }}
            min="0"
            step="any"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Current Premium
          </label>
          <input
            type="number"
            value={premium}
            onChange={e => setPremium(e.target.value)}
            placeholder="e.g. 25,000"
            style={{ width: '100%' }}
            min="0"
            step="any"
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            New Vessel Value
          </label>
          <input
            type="number"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder="e.g. 6,000,000"
            style={{ width: '100%' }}
            min="0"
            step="any"
          />
        </div>
      </div>

      {/* Results */}
      {calculation && (
        <div className="fade-in">
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>New Premium</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-primary)' }}>{fmt(calculation.newPremium)}</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Additional Premium</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: calculation.additionalPremium >= 0 ? 'var(--danger)' : '#22c55e' }}>
                {calculation.additionalPremium >= 0 ? '+' : ''}{fmt(calculation.additionalPremium)}
              </div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>New Rate</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>{fmtRate(calculation.newRate)}</div>
            </div>
          </div>

          {/* Calculation Steps */}
          <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: 'var(--text-secondary)' }}>Calculation Steps</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Step 1: Current TLO Rate = (Premium / Current Value) x 100</span>
              <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{fmtRate(calculation.rate)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Step 2: Adjusted Rate = TLO Rate / 3</span>
              <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{fmtRate(calculation.rateDiv3)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Step 3: Value Difference = New Value - Current Value</span>
              <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{fmt(calculation.diff)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Step 4: Additional Premium = Value Difference x Adjusted Rate</span>
              <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{fmt(calculation.additionalPremium)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,119,163,0.08)' : 'rgba(0,210,255,0.08)', border: `1px solid ${isLight ? 'rgba(0,119,163,0.2)' : 'rgba(0,210,255,0.2)'}` }}>
              <span style={{ fontWeight: '600' }}>Step 5: New Premium = Current Premium + Additional Premium</span>
              <span style={{ fontWeight: '700', fontFamily: 'monospace', color: 'var(--accent-primary)' }}>{fmt(calculation.newPremium)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Step 6: New TLO Rate = New Premium / New Value x 100</span>
              <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>{fmtRate(calculation.newRate)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
