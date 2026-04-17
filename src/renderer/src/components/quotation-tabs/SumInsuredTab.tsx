import { useState, useEffect } from 'react'
import { Quotation, QuotationVessel, WarSettings } from '../../../../shared/types'

export default function SumInsuredTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (q: Quotation) => Quotation) => void
}) {
    const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])

    useEffect(() => {
        (async () => {
            try {
                const [s, qv] = await Promise.all([
                    window.api.warGetSettings(),
                    window.api.getQuotationVessels(quotation.id)
                ])
                if (s && !(s as any).error) setWarSettings(s)
                setQVessels(Array.isArray(qv) ? qv : [])
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

            {/* Per-vessel hull values */}
            {qVessels.length >= 2 && (
                <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                        Per-Vessel Sum Insured (leave blank to use the amount above)
                    </label>
                    {qVessels.map(v => (
                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: '24px', color: 'var(--accent-primary)' }}>{v.vesselLabel}</span>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(v.name || v.vesselLabel).toUpperCase()}</span>
                            <input
                                type="number"
                                value={v.agreedValue ?? ''}
                                placeholder={quotation.agreedValue?.toLocaleString() || '0'}
                                onChange={e => {
                                    const val = e.target.value ? parseFloat(e.target.value) : undefined
                                    setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, agreedValue: val ?? null } : qv))
                                }}
                                onBlur={e => window.api.updateQuotationVessel(v.id, { agreedValue: e.target.value ? parseFloat(e.target.value) : null } as any)}
                                style={{ width: '160px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}
                            />
                        </div>
                    ))}
                </div>
            )}

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

            {/* P&I Excess (Section 2) */}
            <div style={{ marginTop: '28px', padding: '20px', borderRadius: '10px', border: '1px solid var(--table-border)', background: quotation.warExcessEnabled ? 'transparent' : undefined }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: quotation.warExcessEnabled ? '16px' : '0' }}>
                    <input
                        type="checkbox"
                        checked={quotation.warExcessEnabled || false}
                        onChange={e => {
                            const enabled = e.target.checked
                            setQ(q => ({ ...q, warExcessEnabled: enabled }))
                            updateField('warExcessEnabled', enabled)
                            // Set default excess rate from settings if not already set
                            if (enabled && quotation.warExcessRate == null && warSettings?.defaultExcessRate) {
                                setQ(q => ({ ...q, warExcessRate: warSettings!.defaultExcessRate }))
                                updateField('warExcessRate', warSettings!.defaultExcessRate)
                            }
                        }}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                    />
                    <span style={{ fontSize: '1rem', fontWeight: 600 }}>P&I Excess (Section 2)</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>War P&I in excess of Hull</span>
                </label>

                {quotation.warExcessEnabled && (
                    <>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', marginBottom: '16px' }}>
                            <div style={{ flex: 1, maxWidth: '260px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Section 2 Amount (default for all vessels)</label>
                                <input
                                    type="number"
                                    value={quotation.warExcessAmount || ''}
                                    onChange={e => {
                                        const val = e.target.value ? parseFloat(e.target.value) : undefined
                                        setQ(q => ({ ...q, warExcessAmount: val }))
                                    }}
                                    onBlur={e => updateField('warExcessAmount', parseFloat(e.target.value) || null)}
                                    placeholder="e.g., 25000000"
                                    style={{ width: '100%', fontSize: '0.9rem', padding: '8px 10px' }}
                                />
                            </div>
                            <div style={{ flex: 1, maxWidth: '180px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Section 2 Rate (‰)</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type="number"
                                        step="0.0001"
                                        value={quotation.warExcessRate ?? warSettings?.defaultExcessRate ?? ''}
                                        onChange={e => {
                                            const val = e.target.value ? parseFloat(e.target.value) : undefined
                                            setQ(q => ({ ...q, warExcessRate: val }))
                                        }}
                                        onBlur={e => updateField('warExcessRate', parseFloat(e.target.value) || null)}
                                        placeholder="0.0075"
                                        style={{ width: '100%', fontSize: '0.9rem', padding: '8px 32px 8px 10px' }}
                                    />
                                    <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', fontSize: '0.85rem', pointerEvents: 'none' }}>‰</span>
                                </div>
                            </div>
                        </div>

                        {/* Per-vessel Section 2 overrides */}
                        {qVessels.length >= 2 && (
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                                    Per-Vessel Section 2 Override (leave blank to use the default above)
                                </label>
                                {qVessels.map(v => (
                                    <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: '24px', color: 'var(--accent-primary)' }}>{v.vesselLabel}</span>
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(v.name || v.vesselLabel).toUpperCase()}</span>
                                        <input
                                            type="number"
                                            value={v.warExcessAmount ?? ''}
                                            placeholder={quotation.warExcessAmount?.toLocaleString() || '0'}
                                            onChange={e => {
                                                const val = e.target.value ? parseFloat(e.target.value) : undefined
                                                setQVessels(prev => prev.map(qv => qv.id === v.id ? { ...qv, warExcessAmount: val ?? null } : qv))
                                            }}
                                            onBlur={e => window.api.updateQuotationVessel(v.id, { warExcessAmount: e.target.value ? parseFloat(e.target.value) : null } as any)}
                                            style={{ width: '160px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', textAlign: 'right' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Section 1 Description</label>
                            <input
                                type="text"
                                value={quotation.warSection1Text || warSettings?.section1Text || 'Hull, Material, Machinery and Outfit Including War Protection and Indemnity and War Crew Liability up to Sum Insured'}
                                onChange={e => { setQ(q => ({ ...q, warSection1Text: e.target.value })) }}
                                onBlur={e => updateField('warSection1Text', e.target.value || null)}
                                style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                            />
                        </div>
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Section 2 Description</label>
                            <input
                                type="text"
                                value={quotation.warSection2Text || warSettings?.section2Text || 'War Protection and Indemnity in excess of the Hull, Material, Machinery and Outfit'}
                                onChange={e => { setQ(q => ({ ...q, warSection2Text: e.target.value })) }}
                                onBlur={e => updateField('warSection2Text', e.target.value || null)}
                                style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                            />
                        </div>
                        <div>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Combined Limit Text</label>
                            <input
                                type="text"
                                value={quotation.warCombinedLimitText || warSettings?.combinedLimitText || 'Combined sections 1 & 2 War Protection and Indemnity limit not to exceed {amount}.'}
                                onChange={e => { setQ(q => ({ ...q, warCombinedLimitText: e.target.value })) }}
                                onBlur={e => updateField('warCombinedLimitText', e.target.value || null)}
                                placeholder="{amount} will be replaced with the Section 2 amount"
                                style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                            />
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

