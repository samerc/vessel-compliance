import { useState, useEffect } from 'react'
import { Quotation, QuotationVessel, WarSettings } from '../../../../shared/types'
import { warSectionTexts } from '../../utils/warTexts'
import { Field } from '../ui'
import { masterData } from './masterDataCache'

/** Format a number with thousand separators for display in text inputs */
function fmtNum(val: number | undefined | null): string {
  if (val == null || val === 0) return ''
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Parse a formatted number string (with commas) back to a number */
function parseNum(str: string): number | undefined {
  const cleaned = str.replace(/,/g, '')
  if (!cleaned) return undefined
  const n = parseFloat(cleaned)
  return isNaN(n) ? undefined : n
}

/** Number input that shows commas when not focused, raw number while editing */
function MoneyInput({
  value,
  placeholder,
  onChange,
  onBlur,
  style
}: {
  value: number | undefined | null
  placeholder?: string
  onChange: (val: number | undefined) => void
  onBlur?: (val: number | undefined) => void
  style?: React.CSSProperties
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')

  const displayVal = editing ? raw : fmtNum(value)

  return (
    <input
      type="text"
      value={displayVal}
      placeholder={placeholder}
      onFocus={() => {
        setEditing(true)
        setRaw(value != null && value !== 0 ? String(value) : '')
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.,-]/g, '')
        setRaw(v)
        onChange(parseNum(v))
      }}
      onBlur={() => {
        setEditing(false)
        const parsed = parseNum(raw)
        if (onBlur) onBlur(parsed)
      }}
      style={style}
    />
  )
}

export default function SumInsuredTab({
  quotation,
  updateField,
  setQ
}: {
  quotation: Quotation
  updateField: (field: string, value: unknown) => void
  setQ: (fn: (q: Quotation) => Quotation) => void
}): React.JSX.Element {
  const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
  const [qVessels, setQVessels] = useState<QuotationVessel[]>([])

  const quotationId = quotation.id
  useEffect(() => {
    ;(async () => {
      try {
        const [s, qv] = await Promise.all([
          masterData('warGetSettings'),
          window.api.getQuotationVessels(quotationId)
        ])
        if (s && !('error' in s && s.error)) setWarSettings(s)
        setQVessels(Array.isArray(qv) ? qv : [])
      } catch {
        /* settings/vessels are optional: the tab falls back to quotation-level values */
      }
    })()
  }, [quotationId])

  const getEffectiveRate = (): number | undefined => {
    if (quotation.premiumRate != null) return quotation.premiumRate
    return warSettings?.defaultRate ?? undefined
  }

  // Total sum insured: quotation-level value, or sum of per-vessel values
  const getEffectiveSumInsured = (q?: Quotation): number => {
    const qq = q || quotation
    if (qq.agreedValue) return qq.agreedValue
    return qVessels.reduce((s, v) => s + (v.agreedValue ?? 0), 0)
  }

  // Set per-vessel premiums based on each vessel's sum insured × rate
  const syncPerVesselPremiums = (rate: number, vessels?: QuotationVessel[]): void => {
    const vList = vessels || qVessels
    if (vList.length < 2) return
    const hasPerVessel = vList.some((v) => v.agreedValue != null && v.agreedValue > 0)
    if (!hasPerVessel) return
    for (const v of vList) {
      const si = v.agreedValue ?? quotation.agreedValue ?? 0
      const vPrem = Math.round(((si * rate) / 100) * 100) / 100
      window.api.updateQuotationVessel(v.id, { premiumAmount: vPrem })
    }
  }

  const handleRateChange = (rate: number | undefined): void => {
    const sumInsured = getEffectiveSumInsured()
    setQ((q) => {
      const updated = { ...q, premiumRate: rate }
      const si = q.agreedValue || sumInsured
      if (rate && si) {
        updated.premiumAmount = Math.round(((si * rate) / 100) * 100) / 100
      }
      return updated
    })
    updateField('premiumRate', rate ?? null)
    if (rate && sumInsured) {
      const premium = Math.round(((sumInsured * rate) / 100) * 100) / 100
      updateField('premiumAmount', premium)
      syncPerVesselPremiums(rate)
    }
  }

  const handlePremiumChange = (premium: number | undefined): void => {
    const sumInsured = getEffectiveSumInsured()
    setQ((q) => {
      const updated = { ...q, premiumAmount: premium }
      const si = q.agreedValue || sumInsured
      if (premium && si) {
        updated.premiumRate = Math.round((premium / si) * 100 * 10000) / 10000
      }
      return updated
    })
    updateField('premiumAmount', premium ?? null)
    if (premium && sumInsured) {
      const rate = Math.round((premium / sumInsured) * 100 * 10000) / 10000
      updateField('premiumRate', rate)
      syncPerVesselPremiums(rate)
    }
  }

  const handleSumInsuredChange = (val: number | undefined): void => {
    const rate = getEffectiveRate()
    setQ((q) => {
      const updated = { ...q, agreedValue: val }
      if (val && rate) {
        updated.premiumAmount = Math.round(((val * rate) / 100) * 100) / 100
        if (q.premiumRate == null) updated.premiumRate = rate
      }
      return updated
    })
    updateField('agreedValue', val ?? null)
    if (val && rate) {
      const premium = Math.round(((val * rate) / 100) * 100) / 100
      updateField('premiumAmount', premium)
      if (quotation.premiumRate == null) {
        updateField('premiumRate', rate)
      }
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Sum Insured</h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
        The sum insured for this War Risk quotation.
      </p>
      <div className="form-grid" style={{ gridTemplateColumns: 'minmax(0, 260px) 100px' }}>
        <Field label="Amount">
          <MoneyInput
            value={quotation.agreedValue}
            onChange={(val) => handleSumInsuredChange(val)}
            placeholder="e.g., 800,000"
          />
        </Field>
        <Field label="Currency">
          <input
            value={quotation.agreedValueCurrency || 'USD'}
            onChange={(e) => {
              setQ((q) => ({ ...q, agreedValueCurrency: e.target.value }))
              updateField('agreedValueCurrency', e.target.value)
            }}
            placeholder="USD"
          />
        </Field>
      </div>

      {/* Per-vessel hull values */}
      {qVessels.length >= 2 && (
        <div style={{ marginTop: '16px' }}>
          <Field label="Per-vessel sum insured (leave blank to use the amount above)">
            <div>
              {qVessels.map((v) => (
                <div
                  key={v.id}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      minWidth: '24px',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {v.vesselLabel}
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      minWidth: '120px'
                    }}
                  >
                    {(v.name || v.vesselLabel).toUpperCase()}
                  </span>
                  <MoneyInput
                    value={v.agreedValue}
                    placeholder={fmtNum(quotation.agreedValue) || '0'}
                    onChange={(val) =>
                      setQVessels((prev) =>
                        prev.map((qv) =>
                          qv.id === v.id ? { ...qv, agreedValue: val ?? null } : qv
                        )
                      )
                    }
                    onBlur={(val) => {
                      window.api.updateQuotationVessel(v.id, { agreedValue: val ?? null })
                      // Recalculate premium from per-vessel values × rate
                      const rate = getEffectiveRate()
                      if (rate) {
                        const updatedVessels = qVessels.map((qv) =>
                          qv.id === v.id ? { ...qv, agreedValue: val ?? null } : qv
                        )
                        const newTotal = updatedVessels.reduce(
                          (s, qv) => s + (qv.agreedValue ?? quotation.agreedValue ?? 0),
                          0
                        )
                        if (newTotal > 0) {
                          const premium = Math.round(((newTotal * rate) / 100) * 100) / 100
                          setQ((q) => ({ ...q, premiumAmount: premium }))
                          updateField('premiumAmount', premium)
                          // Also set per-vessel premium for each vessel
                          for (const qv of updatedVessels) {
                            const si = qv.agreedValue ?? quotation.agreedValue ?? 0
                            const vPrem = Math.round(((si * rate) / 100) * 100) / 100
                            window.api.updateQuotationVessel(qv.id, { premiumAmount: vPrem })
                          }
                        }
                      }
                    }}
                    style={{ width: '160px', textAlign: 'right' }}
                  />
                </div>
              ))}
            </div>
          </Field>
        </div>
      )}

      <h3 style={{ marginTop: '28px', marginBottom: '14px', fontSize: '1rem' }}>
        {quotation.warExcessEnabled ? 'Section 1 Rate' : 'Rate & Premium'}
      </h3>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
        {quotation.warExcessEnabled
          ? 'Set the rate for Section 1 (Hull War). Premium is calculated per vessel in the Premium tab.'
          : 'Editing either field will automatically recalculate the other based on the sum insured.'}
        {warSettings?.defaultRate && quotation.premiumRate == null
          ? ` Default rate: ${warSettings.defaultRate}%`
          : ''}
      </p>
      <div
        className="form-grid"
        style={{ gridTemplateColumns: 'minmax(0, 180px) minmax(0, 220px) auto', alignItems: 'end' }}
      >
        <Field label="Rate (%)">
          <div style={{ position: 'relative' }}>
            <input
              type="number"
              step="0.0001"
              value={getEffectiveRate() ?? ''}
              onChange={(e) => {
                const val = e.target.value ? parseFloat(e.target.value) : undefined
                handleRateChange(val)
              }}
              placeholder="e.g., 0.35"
              style={{ width: '100%', boxSizing: 'border-box', paddingRight: '32px' }}
            />
            <span
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
                pointerEvents: 'none'
              }}
            >
              %
            </span>
          </div>
        </Field>
        {!quotation.warExcessEnabled && (
          <Field label="Premium">
            <MoneyInput
              value={quotation.premiumAmount}
              onChange={(val) => handlePremiumChange(val)}
              placeholder="Auto-calculated"
            />
          </Field>
        )}
        {!quotation.warExcessEnabled && (
          <div
            style={{
              padding: '8px 0',
              fontSize: '0.88rem',
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap'
            }}
          >
            {quotation.premiumCurrency || quotation.agreedValueCurrency || 'USD'}
          </div>
        )}
      </div>

      {/* P&I Excess (Section 2) */}
      <div
        style={{
          marginTop: '28px',
          padding: '20px',
          borderRadius: '10px',
          border: '1px solid var(--table-border)',
          background: quotation.warExcessEnabled ? 'transparent' : undefined
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            marginBottom: quotation.warExcessEnabled ? '16px' : '0'
          }}
        >
          <input
            type="checkbox"
            checked={quotation.warExcessEnabled || false}
            onChange={(e) => {
              const enabled = e.target.checked
              setQ((q) => ({ ...q, warExcessEnabled: enabled }))
              updateField('warExcessEnabled', enabled)
              // Set default excess rate from settings if not already set
              if (enabled && quotation.warExcessRate == null && warSettings?.defaultExcessRate) {
                setQ((q) => ({ ...q, warExcessRate: warSettings!.defaultExcessRate }))
                updateField('warExcessRate', warSettings!.defaultExcessRate)
              }
            }}
            style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>P&I Excess (Section 2)</span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            War P&I in excess of Hull
          </span>
        </label>

        {quotation.warExcessEnabled && (
          <>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                marginBottom: '14px',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)'
              }}
            >
              <input
                type="checkbox"
                checked={quotation.warSection2Only || false}
                onChange={(e) => {
                  setQ((q) => ({ ...q, warSection2Only: e.target.checked }))
                  updateField('warSection2Only', e.target.checked)
                }}
                style={{ width: '15px', height: '15px', accentColor: 'var(--accent-primary)' }}
              />
              Section 2 only{' '}
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                (hides Section 1 from export)
              </span>
            </label>
            <div
              className="form-grid"
              style={{
                gridTemplateColumns: 'minmax(0, 260px) minmax(0, 180px)',
                marginBottom: '16px'
              }}
            >
              <Field label="Section 2 amount (default for all vessels)">
                <MoneyInput
                  value={quotation.warExcessAmount}
                  onChange={(val) => setQ((q) => ({ ...q, warExcessAmount: val }))}
                  onBlur={(val) => updateField('warExcessAmount', val ?? null)}
                  placeholder="e.g., 25,000,000"
                />
              </Field>
              <Field label="Section 2 rate (%)">
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.0001"
                    value={quotation.warExcessRate ?? warSettings?.defaultExcessRate ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseFloat(e.target.value) : undefined
                      setQ((q) => ({ ...q, warExcessRate: val }))
                      updateField('warExcessRate', val ?? null)
                    }}
                    placeholder=""
                    style={{ width: '100%', boxSizing: 'border-box', paddingRight: '32px' }}
                  />
                  <span
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      pointerEvents: 'none'
                    }}
                  >
                    %
                  </span>
                </div>
              </Field>
            </div>

            {/* Per-vessel Section 2 overrides */}
            {qVessels.length >= 2 && (
              <div style={{ marginBottom: '16px' }}>
                <Field label="Per-vessel Section 2 override (leave blank to use the default above)">
                  <div>
                    {qVessels.map((v) => (
                      <div
                        key={v.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '6px'
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            minWidth: '24px',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {v.vesselLabel}
                        </span>
                        <span
                          style={{
                            fontSize: '0.78rem',
                            color: 'var(--text-secondary)',
                            minWidth: '120px'
                          }}
                        >
                          {(v.name || v.vesselLabel).toUpperCase()}
                        </span>
                        <MoneyInput
                          value={v.warExcessAmount}
                          placeholder={fmtNum(quotation.warExcessAmount) || '0'}
                          onChange={(val) =>
                            setQVessels((prev) =>
                              prev.map((qv) =>
                                qv.id === v.id ? { ...qv, warExcessAmount: val ?? null } : qv
                              )
                            )
                          }
                          onBlur={(val) =>
                            window.api.updateQuotationVessel(v.id, {
                              warExcessAmount: val ?? null
                            })
                          }
                          style={{ width: '160px', textAlign: 'right' }}
                        />
                      </div>
                    ))}
                  </div>
                </Field>
              </div>
            )}

            <div className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
              <Field label="Section 1 description">
                <input
                  type="text"
                  value={warSectionTexts(quotation, warSettings).section1}
                  onChange={(e) => {
                    setQ((q) => ({ ...q, warSection1Text: e.target.value }))
                  }}
                  onBlur={(e) => updateField('warSection1Text', e.target.value || null)}
                />
              </Field>
              <Field label="Section 2 description">
                <input
                  type="text"
                  value={warSectionTexts(quotation, warSettings).section2}
                  onChange={(e) => {
                    setQ((q) => ({ ...q, warSection2Text: e.target.value }))
                  }}
                  onBlur={(e) => updateField('warSection2Text', e.target.value || null)}
                />
              </Field>
              <Field label="Combined limit text">
                <input
                  type="text"
                  value={warSectionTexts(quotation, warSettings).combinedLimit}
                  onChange={(e) => {
                    setQ((q) => ({ ...q, warCombinedLimitText: e.target.value }))
                  }}
                  onBlur={(e) => updateField('warCombinedLimitText', e.target.value || null)}
                  placeholder="{amount} will be replaced with the Section 2 amount"
                />
              </Field>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
