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

    const autoCalcPremium = (sumInsured: number | undefined) => {
        if (!sumInsured || !warSettings?.defaultRate) return
        const premium = Math.round(sumInsured * warSettings.defaultRate / 1000 * 100) / 100
        if (!quotation.premiumAmount) {
            setQ(q => ({ ...q, premiumAmount: premium }))
            updateField('premiumAmount', premium)
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
                            setQ(q => ({ ...q, agreedValue: val }))
                            updateField('agreedValue', val ?? null)
                            autoCalcPremium(val)
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
            {warSettings?.defaultRate && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '10px' }}>
                    Default rate: {warSettings.defaultRate}‰
                    {quotation.agreedValue ? ` — Calculated premium: ${(Math.round(quotation.agreedValue * warSettings.defaultRate / 1000 * 100) / 100).toLocaleString()} ${quotation.agreedValueCurrency || 'USD'}` : ''}
                </p>
            )}
        </div>
    )
}

