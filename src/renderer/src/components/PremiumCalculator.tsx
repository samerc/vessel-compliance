import { useState, useMemo } from 'react'
import { RotateCcw, Copy, Check } from 'lucide-react'
import { countDays, calcProRataPremium } from '../utils/premiumCalc'
import type { InstalmentRow } from '../utils/premiumCalc'
import { StrMoneyInput } from './quotation-tabs/shared'
import { Field } from './ui'

// ── Number to words ────────────────────────────────────────────────────────────
const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen'
]
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function intToWords(n: number): string {
  if (n === 0) return 'Zero'
  function helper(num: number): string {
    if (num === 0) return ''
    if (num < 20) return ONES[num]
    if (num < 100) return TENS[Math.floor(num / 10)] + (num % 10 ? '-' + ONES[num % 10] : '')
    if (num < 1000)
      return ONES[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + helper(num % 100) : '')
    if (num < 1_000_000)
      return (
        helper(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + helper(num % 1000) : '')
      )
    if (num < 1_000_000_000)
      return (
        helper(Math.floor(num / 1_000_000)) +
        ' Million' +
        (num % 1_000_000 ? ' ' + helper(num % 1_000_000) : '')
      )
    return (
      helper(Math.floor(num / 1_000_000_000)) +
      ' Billion' +
      (num % 1_000_000_000 ? ' ' + helper(num % 1_000_000_000) : '')
    )
  }
  return helper(Math.round(n))
}

function numberToText(n: number): string {
  const int = Math.floor(Math.abs(n))
  const dec = Math.round((Math.abs(n) - int) * 100)
  const words = int === 0 ? 'Zero' : intToWords(int)
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  return `${formatted} - ${words} and ${dec.toString().padStart(2, '0')}/100`
}

interface CalcDetails {
  days: number
  calendarDays: number
  addedDay: boolean
  startTime: string
  endTime: string
  proRataPremium: number
  annualInstalment: number
  fullInstalments: number
  firstPremiumInstalment: number
  commissionTotal: number
  annualCommission: number
  annualCommissionInstalment: number
  firstCommissionInstalment: number
  rows: InstalmentRow[]
}

function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PremiumCalculator(): React.JSX.Element {
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [annualPremium, setAnnualPremium] = useState<string>('')
  const [standardPeriod, setStandardPeriod] = useState<string>('365')
  const [numInstalments, setNumInstalments] = useState<string>('1')
  const [commissionPct, setCommissionPct] = useState<string>('0')
  const [copiedField, setCopiedField] = useState<'premium' | 'commission' | null>(null)

  const copyToClipboard = (value: number, field: 'premium' | 'commission'): void => {
    navigator.clipboard.writeText(numberToText(value)).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const calculation = useMemo((): CalcDetails | null => {
    const { days, calendarDays, addedDay } = countDays(startDate, endDate)
    const annual = parseFloat(annualPremium) || 0
    const period = parseInt(standardPeriod) || 365
    const instalments = parseInt(numInstalments) || 1
    const commission = parseFloat(commissionPct) || 0

    if (days <= 0 || annual <= 0 || period <= 0 || instalments <= 0) {
      return null
    }

    const startObj = new Date(startDate)
    const endObj = new Date(endDate)
    const startTime =
      startObj.getHours().toString().padStart(2, '0') +
      ':' +
      startObj.getMinutes().toString().padStart(2, '0')
    const endTime =
      endObj.getHours().toString().padStart(2, '0') +
      ':' +
      endObj.getMinutes().toString().padStart(2, '0')

    const calc = calcProRataPremium(days, annual, period, instalments, commission)

    return {
      days,
      calendarDays,
      addedDay,
      startTime,
      endTime,
      ...calc
    }
  }, [startDate, endDate, annualPremium, standardPeriod, numInstalments, commissionPct])

  const handleReset = (): void => {
    setStartDate('')
    setEndDate('')
    setAnnualPremium('')
    setStandardPeriod('365')
    setNumInstalments('1')
    setCommissionPct('0')
  }

  const stepStyle = (color: string): React.CSSProperties => ({
    padding: '12px 16px' as const,
    background: `rgba(${color}, 0.06)`,
    borderRadius: '8px',
    border: `1px solid rgba(${color}, 0.15)`
  })
  const stepLabel: React.CSSProperties = {
    color: 'var(--text-secondary)',
    fontSize: '0.8rem',
    marginBottom: '4px',
    fontFamily: 'inherit'
  }
  const stepVal: React.CSSProperties = { color: 'var(--text-primary)' }
  const stepHighlight: React.CSSProperties = {
    color: 'var(--text-primary)',
    fontWeight: '600',
    marginTop: '4px'
  }

  return (
    <div>
      {/* Input Section */}
      <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginBottom: '20px'
          }}
        >
          <button
            onClick={handleReset}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>

        <div className="form-grid cols-2">
          <Field label="Start date & time">
            <input
              type="datetime-local"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Policy start date and time"
            />
          </Field>
          <Field label="End date & time">
            <input
              type="datetime-local"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Policy end date and time"
            />
          </Field>
          <Field label="Annual premium">
            <StrMoneyInput
              value={annualPremium}
              onChange={(s) => setAnnualPremium(s)}
              placeholder="e.g. 10000"
              style={{ width: '100%' }}
              aria-label="Annual premium amount"
            />
          </Field>
          <Field label="Standard period (days)">
            <input
              type="number"
              value={standardPeriod}
              onChange={(e) => setStandardPeriod(e.target.value)}
              min="1"
              aria-label="Standard policy period in days"
            />
          </Field>
          <Field label="Number of instalments">
            <input
              type="number"
              value={numInstalments}
              onChange={(e) => setNumInstalments(e.target.value)}
              min="1"
              aria-label="Number of premium instalments"
            />
          </Field>
          <Field label="Commission (%)">
            <input
              type="number"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              min="0"
              max="100"
              step="0.01"
              aria-label="Commission percentage"
            />
          </Field>
        </div>
      </section>

      {/* Results Section */}
      {calculation && (
        <>
          {/* Summary */}
          <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>Summary</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
              <div
                style={{
                  padding: '16px',
                  background: 'rgba(var(--accent-primary-rgb), 0.08)',
                  borderRadius: '10px',
                  border: '1px solid rgba(var(--accent-primary-rgb), 0.2)'
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px'
                  }}
                >
                  Policy Days
                </div>
                <div
                  style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}
                >
                  {calculation.days}
                </div>
              </div>
              <div
                style={{
                  padding: '16px',
                  background: 'color-mix(in srgb, var(--success) 8%, transparent)',
                  borderRadius: '10px',
                  border: '1px solid color-mix(in srgb, var(--success) 20%, transparent)'
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px'
                  }}
                >
                  Pro-Rata Premium
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}
                  >
                    {fmt(calculation.proRataPremium)}
                  </div>
                  <button
                    onClick={() => copyToClipboard(calculation.proRataPremium, 'premium')}
                    title={numberToText(calculation.proRataPremium)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: copiedField === 'premium' ? 'var(--success)' : 'var(--text-secondary)',
                      display: 'flex',
                      padding: '4px',
                      borderRadius: '6px',
                      flexShrink: 0
                    }}
                  >
                    {copiedField === 'premium' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <div
                style={{
                  padding: '16px',
                  background: 'color-mix(in srgb, var(--warning) 8%, transparent)',
                  borderRadius: '10px',
                  border: '1px solid color-mix(in srgb, var(--warning) 20%, transparent)'
                }}
              >
                <div
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px'
                  }}
                >
                  Total Commission
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}
                  >
                    {fmt(calculation.commissionTotal)}
                  </div>
                  <button
                    onClick={() => copyToClipboard(calculation.commissionTotal, 'commission')}
                    title={numberToText(calculation.commissionTotal)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color:
                        copiedField === 'commission' ? 'var(--success)' : 'var(--text-secondary)',
                      display: 'flex',
                      padding: '4px',
                      borderRadius: '6px',
                      flexShrink: 0
                    }}
                  >
                    {copiedField === 'commission' ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Instalment Breakdown */}
          <section className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
              Instalment Breakdown
            </h3>
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Premium and commission instalment breakdown</caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '80px' }}>
                      #
                    </th>
                    <th scope="col" className="num">
                      Premium Instalment
                    </th>
                    {parseFloat(commissionPct) > 0 && (
                      <th scope="col" className="num">
                        Commission Instalment
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {calculation.rows.map((row) => (
                    <tr key={row.number}>
                      <td className="muted">{row.number}</td>
                      <td className="num" style={{ fontWeight: '500' }}>
                        {fmt(row.premium)}
                      </td>
                      {parseFloat(commissionPct) > 0 && (
                        <td className="num" style={{ fontWeight: '500' }}>
                          {fmt(row.commission)}
                        </td>
                      )}
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600, background: 'var(--table-header-bg)' }}>
                    <td>Total</td>
                    <td className="num">{fmt(calculation.proRataPremium)}</td>
                    {parseFloat(commissionPct) > 0 && (
                      <td className="num">{fmt(calculation.commissionTotal)}</td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* Calculation Steps */}
          <section className="glass-card" style={{ padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px 0', color: 'var(--text-primary)' }}>
              Calculation Steps
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '0.9rem'
              }}
            >
              {/* Step 1: Days */}
              <div style={stepStyle('var(--accent-primary-rgb)')}>
                <div style={stepLabel}>Step 1: Calculate Number of Days</div>
                <div style={stepVal}>Calendar day difference = {calculation.calendarDays} days</div>
                <div style={stepVal}>
                  Start time: {calculation.startTime} | End time: {calculation.endTime}
                  {calculation.addedDay ? (
                    <span style={{ color: 'var(--accent-primary)' }}>
                      {' '}
                      → end time {'>'} start time, +1 day
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}> → no extra day added</span>
                  )}
                </div>
                <div style={stepHighlight}>Total days = {calculation.days}</div>
              </div>

              {/* Step 2: Pro-rata premium */}
              <div style={stepStyle('0, 255, 136')}>
                <div style={stepLabel}>Step 2: Calculate Pro-Rata Premium</div>
                <div style={stepVal}>
                  ({calculation.days} × {fmt(parseFloat(annualPremium))}) / {standardPeriod} ={' '}
                  {fmt(calculation.proRataPremium)}
                </div>
              </div>

              {/* Step 3: Annual instalment */}
              <div style={stepStyle('150, 100, 255')}>
                <div style={stepLabel}>Step 3: Calculate Annual Instalment Amount</div>
                <div style={stepVal}>
                  {fmt(parseFloat(annualPremium))} / {numInstalments} ={' '}
                  {fmt(calculation.annualInstalment)}
                </div>
              </div>

              {/* Step 4: Full instalments covered */}
              <div style={stepStyle('150, 100, 255')}>
                <div style={stepLabel}>Step 4: Full Instalments Covered</div>
                <div style={stepVal}>
                  {fmt(calculation.proRataPremium)} / {fmt(calculation.annualInstalment)} ={' '}
                  {(calculation.proRataPremium / calculation.annualInstalment).toFixed(4)}...
                </div>
                <div style={stepHighlight}>Full instalments = {calculation.fullInstalments}</div>
              </div>

              {/* Step 5: First instalment */}
              <div style={stepStyle('150, 100, 255')}>
                <div style={stepLabel}>Step 5: First Instalment (Remainder)</div>
                <div style={stepVal}>
                  {fmt(calculation.proRataPremium)} - ({fmt(calculation.annualInstalment)} ×{' '}
                  {calculation.fullInstalments}) = {fmt(calculation.proRataPremium)} -{' '}
                  {fmt(calculation.annualInstalment * calculation.fullInstalments)} ={' '}
                  {fmt(calculation.firstPremiumInstalment)}
                </div>
              </div>

              {parseFloat(commissionPct) > 0 && (
                <>
                  {/* Step 6: Pro-rata commission */}
                  <div style={stepStyle('255, 165, 0')}>
                    <div style={stepLabel}>Step 6: Calculate Pro-Rata Commission</div>
                    <div style={stepVal}>
                      {fmt(calculation.proRataPremium)} × {commissionPct}% ={' '}
                      {fmt(calculation.commissionTotal)}
                    </div>
                  </div>

                  {/* Step 7: Annual commission */}
                  <div style={stepStyle('255, 165, 0')}>
                    <div style={stepLabel}>Step 7: Annual Commission</div>
                    <div style={stepVal}>
                      {fmt(parseFloat(annualPremium))} × {commissionPct}% ={' '}
                      {fmt(calculation.annualCommission)}
                    </div>
                  </div>

                  {/* Step 8: Annual commission per instalment */}
                  <div style={stepStyle('255, 165, 0')}>
                    <div style={stepLabel}>Step 8: Annual Commission per Instalment</div>
                    <div style={stepVal}>
                      {fmt(calculation.annualCommission)} / {numInstalments} ={' '}
                      {fmt(calculation.annualCommissionInstalment)}
                    </div>
                  </div>

                  {/* Step 9: Commission instalments covered */}
                  <div style={stepStyle('255, 165, 0')}>
                    <div style={stepLabel}>Step 9: Commission Instalments Covered</div>
                    <div style={stepVal}>
                      Same as Step 4 = {calculation.fullInstalments} full instalments
                    </div>
                  </div>

                  {/* Step 10: First commission instalment */}
                  <div style={stepStyle('255, 165, 0')}>
                    <div style={stepLabel}>Step 10: First Commission Instalment (Remainder)</div>
                    <div style={stepVal}>
                      {fmt(calculation.commissionTotal)} - (
                      {fmt(calculation.annualCommissionInstalment)} × {calculation.fullInstalments})
                      = {fmt(calculation.commissionTotal)} -{' '}
                      {fmt(calculation.annualCommissionInstalment * calculation.fullInstalments)} ={' '}
                      {fmt(calculation.firstCommissionInstalment)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {!calculation && startDate && endDate && (
        <div
          className="glass-card"
          style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}
        >
          Enter valid dates and a premium amount to see the calculation results.
        </div>
      )}
    </div>
  )
}
