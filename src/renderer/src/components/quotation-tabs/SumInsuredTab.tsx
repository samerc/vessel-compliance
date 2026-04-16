import { useState, useEffect } from 'react'
import { Quotation, WarSettings } from '../../../../shared/types'

export default function SumInsuredTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (q: Quotation) => Quotation) => void
}) {
    const [warSettings, setWarSettings] = useState<WarSettings | null>(null)

    useEffect(() => {
        (async () => {
            try {
                const s = await window.api.warGetSettings()
                if (s && !(s as any).error) setWarSettings(s)
            } catch {}
        })()
    }, [])

    const getEffectiveRate = (): number | undefined => {
        if (quotation.premiumRate != null) return quotation.premiumRate
        return warSettings?.defaultRate ?? undefined
    }

    const handleRateChange = (rate: number | undefined) => {
        setQ(q => {
            const updated = { ...q, premiumRate: rate }
            if (rate && q.agreedValue) {
                updated.premiumAmount = Math.round(q.agreedValue * rate / 1000 * 100) / 100
            }
            return updated
        })
        updateField('premiumRate', rate ?? null)
        if (rate && quotation.agreedValue) {
            const premium = Math.round(quotation.agreedValue * rate / 1000 * 100) / 100
            updateField('premiumAmount', premium)
        }
    }

    const handlePremiumChange = (premium: number | undefined) => {
        setQ(q => {
            const updated = { ...q, premiumAmount: premium }
            if (premium && q.agreedValue) {
                updated.premiumRate = Math.round(premium / q.agreedValue * 1000 * 10000) / 10000
            }
            return updated
        })
        updateField('premiumAmount', premium ?? null)
        if (premium && quotation.agreedValue) {
            const rate = Math.round(premium / quotation.agreedValue * 1000 * 10000) / 10000
            updateField('premiumRate', rate)
        }
    }

    const handleSumInsuredChange = (val: number | undefined) => {
        const rate = getEffectiveRate()
        setQ(q => {
            const updated = { ...q, agreedValue: val }
            if (val && rate) {
                updated.premiumAmount = Math.round(val * rate / 1000 * 100) / 100
                if (q.premiumRate == null) updated.premiumRate = rate
            }
            return updated
        })
        updateField('agreedValue', val ?? null)
        if (val && rate) {
            const premium = Math.round(val * rate / 1000 * 100) / 100
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
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, maxWidth: '260px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Amount</label>
                    <input
                        type="number"
                        value={quotation.agreedValue || ''}
                        onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined
                            handleSumInsuredChange(val)
                        }}
                        placeholder="e.g., 800000"
                        style={{ width: '100%', fontSize: '0.9rem', padding: '8px 10px' }}
                    />
                </div>
                <div style={{ width: '100px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                    <input
                        value={quotation.agreedValueCurrency || 'USD'}
                        onChange={e => {
                            setQ(q => ({ ...q, agreedValueCurrency: e.target.value }))
                            updateField('agreedValueCurrency', e.target.value)
                        }}
                        placeholder="USD"
                        style={{ width: '100%', fontSize: '0.9rem', padding: '8px 10px' }}
                    />
                </div>
            </div>

            <h3 style={{ marginTop: '28px', marginBottom: '14px', fontSize: '1rem' }}>Rate & Premium</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                Editing either field will automatically recalculate the other based on the sum insured.
                {warSettings?.defaultRate && quotation.premiumRate == null
                    ? ` Default rate: ${warSettings.defaultRate}‰`
                    : ''}
            </p>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, maxWidth: '180px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Rate (‰)</label>
                    <div style={{ position: 'relative' }}>
                        <input
                            type="number"
                            step="0.0001"
                            value={getEffectiveRate() ?? ''}
                            onChange={e => {
                                const val = e.target.value ? parseFloat(e.target.value) : undefined
                                handleRateChange(val)
                            }}
                            placeholder="e.g., 0.35"
                            style={{ width: '100%', fontSize: '0.9rem', padding: '8px 32px 8px 10px' }}
                        />
                        <span style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--text-secondary)',
                            fontSize: '0.85rem',
                            pointerEvents: 'none'
                        }}>‰</span>
                    </div>
                </div>
                <div style={{ flex: 1, maxWidth: '220px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Premium</label>
                    <input
                        type="number"
                        step="0.01"
                        value={quotation.premiumAmount || ''}
                        onChange={e => {
                            const val = e.target.value ? parseFloat(e.target.value) : undefined
                            handlePremiumChange(val)
                        }}
                        placeholder="Auto-calculated"
                        style={{ width: '100%', fontSize: '0.9rem', padding: '8px 10px' }}
                    />
                </div>
                <div style={{
                    padding: '8px 0',
                    fontSize: '0.88rem',
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap'
                }}>
                    {quotation.premiumCurrency || quotation.agreedValueCurrency || 'USD'}
                </div>
            </div>
        </div>
    )
}

