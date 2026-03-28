import { useState, useEffect } from 'react'
import { Quotation, QuotationVessel } from '../../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../../utils/policyUtils'
import { fmtNiceDate } from './shared'

export default function PeriodTab({ quotation, updateField, setQ }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void }) {
    const [suggestion, setSuggestion] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => { buildSuggestion() }, [])

    const buildSuggestion = async () => {
        setLoading(true)
        try {
            const qv: QuotationVessel[] = await window.api.getQuotationVessels(quotation.id)
            const withVessel = qv.filter(v => v.vesselId)
            if (withVessel.length === 0) {
                setSuggestion('12 months from date to be advised')
                return
            }
            const dates: { label: string; date: string }[] = []
            for (const v of withVessel) {
                const policies = await window.api.getVesselDynamicPolicies(v.vesselId!)
                const endDate = resolveEffectivePolicyExpiry(policies)
                if (endDate) dates.push({ label: v.vesselLabel, date: endDate })
            }
            if (dates.length === 0) {
                setSuggestion('12 months from date to be advised')
            } else {
                const unique = [...new Set(dates.map(d => d.date))]
                if (unique.length === 1) {
                    setSuggestion(`12 months from ${fmtNiceDate(unique[0])}`)
                } else {
                    setSuggestion(dates.map(d => `${d.label}: 12 months from ${fmtNiceDate(d.date)}`).join('\n'))
                }
            }
        } finally {
            setLoading(false)
        }
    }

    const useSuggestion = () => {
        setQ(p => ({ ...p, periodText: suggestion }))
        updateField('periodText', suggestion)
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Period of Insurance</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Set the policy inception and expiry dates for this quotation.
            </p>
            {(suggestion || loading) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0,210,255,0.07)', border: '1px solid rgba(0,210,255,0.2)', marginBottom: '16px', maxWidth: '640px' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontWeight: 600, marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Auto-detected from P&I policies</div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{loading ? 'Loading…' : suggestion}</div>
                    </div>
                    {!loading && (
                        <button onClick={useSuggestion} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px', flexShrink: 0 }}>Use this</button>
                    )}
                </div>
            )}
            <div style={{ maxWidth: '640px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Period description</label>
                <textarea
                    value={quotation.periodText || ''}
                    onChange={e => setQ(p => ({ ...p, periodText: e.target.value }))}
                    onBlur={e => updateField('periodText', e.target.value)}
                    placeholder='e.g. "12 months from 1st January 2025 to 31st December 2025 both days inclusive"'
                    style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                />
            </div>
        </div>
    )
}
