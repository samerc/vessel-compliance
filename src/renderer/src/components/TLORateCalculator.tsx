import { useState, useMemo } from 'react'
import { StrMoneyInput } from './quotation-tabs/shared'
import { Field } from './ui'

export default function TLORateCalculator(): React.JSX.Element {
  const [currentValue, setCurrentValue] = useState('')
  const [premium, setPremium] = useState('')
  const [newValue, setNewValue] = useState('')

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

  const fmt = (n: number): string =>
    n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtRate = (n: number): string => n.toFixed(4) + '%'

  const cardStyle = {
    padding: '16px 20px',
    borderRadius: '12px',
    background: 'var(--accent-tint)',
    border: '1px solid var(--accent-border)'
  }

  const stepStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: '8px',
    background: 'var(--table-header-bg)'
  }

  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      <h2 style={{ margin: '0 0 8px 0', fontSize: '1.4rem' }}>TLO Rate Calculator</h2>
      <p style={{ color: 'var(--text-secondary)', margin: '0 0 24px 0', fontSize: '0.9rem' }}>
        Calculate the adjusted Total Loss Only premium when the vessel value changes.
      </p>

      {/* Inputs */}
      <div className="form-grid" style={{ marginBottom: '28px' }}>
        <Field label="Current vessel value">
          <StrMoneyInput
            value={currentValue}
            onChange={(s) => setCurrentValue(s)}
            placeholder="e.g. 5,000,000"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Current premium">
          <StrMoneyInput
            value={premium}
            onChange={(s) => setPremium(s)}
            placeholder="e.g. 25,000"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="New vessel value">
          <StrMoneyInput
            value={newValue}
            onChange={(s) => setNewValue(s)}
            placeholder="e.g. 6,000,000"
            style={{ width: '100%' }}
          />
        </Field>
      </div>

      {/* Results */}
      {calculation && (
        <div className="fade-in">
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '24px'
            }}
          >
            <div style={cardStyle}>
              <div
                style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}
              >
                New Premium
              </div>
              <div
                style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-primary)' }}
              >
                {fmt(calculation.newPremium)}
              </div>
            </div>
            <div style={cardStyle}>
              <div
                style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}
              >
                Additional Premium
              </div>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: '700',
                  color: calculation.additionalPremium >= 0 ? 'var(--danger)' : 'var(--success)'
                }}
              >
                {calculation.additionalPremium >= 0 ? '+' : ''}
                {fmt(calculation.additionalPremium)}
              </div>
            </div>
            <div style={cardStyle}>
              <div
                style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}
              >
                New Rate
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                {fmtRate(calculation.newRate)}
              </div>
            </div>
          </div>

          {/* Calculation Steps */}
          <h4 className="form-section-title">Calculation steps</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={stepStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Step 1: Current TLO Rate = (Premium / Current Value) x 100
              </span>
              <span className="mono" style={{ fontWeight: '600' }}>
                {fmtRate(calculation.rate)}
              </span>
            </div>
            <div style={stepStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Step 2: Adjusted Rate = TLO Rate / 3
              </span>
              <span className="mono" style={{ fontWeight: '600' }}>
                {fmtRate(calculation.rateDiv3)}
              </span>
            </div>
            <div style={stepStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Step 3: Value Difference = New Value - Current Value
              </span>
              <span className="mono" style={{ fontWeight: '600' }}>
                {fmt(calculation.diff)}
              </span>
            </div>
            <div style={stepStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Step 4: Additional Premium = Value Difference x Adjusted Rate
              </span>
              <span className="mono" style={{ fontWeight: '600' }}>
                {fmt(calculation.additionalPremium)}
              </span>
            </div>
            <div
              style={{
                ...stepStyle,
                background: 'var(--accent-tint)',
                border: '1px solid var(--accent-border)'
              }}
            >
              <span style={{ fontWeight: '600' }}>
                Step 5: New Premium = Current Premium + Additional Premium
              </span>
              <span className="mono" style={{ fontWeight: '700', color: 'var(--accent-primary)' }}>
                {fmt(calculation.newPremium)}
              </span>
            </div>
            <div style={stepStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>
                Step 6: New TLO Rate = New Premium / New Value x 100
              </span>
              <span className="mono" style={{ fontWeight: '600' }}>
                {fmtRate(calculation.newRate)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
