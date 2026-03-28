import { useState, useEffect, useRef } from 'react'
import { Quotation, WarCondition, QuotationWarCondition, WarSettings, QuotationVessel } from '../../../../shared/types'
import VesselScopeChips from '../VesselScopeChips'

export default function WarConditionsTab({ quotation, showError }: {
    quotation: Quotation
    showError: (msg: string) => void
}) {
    const [allConditions, setAllConditions] = useState<WarCondition[]>([])
    const [qConditions, setQConditions] = useState<QuotationWarCondition[]>([])
    const [overrides, setOverrides] = useState<Record<string, string>>({})
    const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
    const [vessels, setVessels] = useState<QuotationVessel[]>([])
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [quotation.id])

    const loadData = async () => {
        const [conds, existing, settings, qvs] = await Promise.all([
            window.api.warGetConditions(),
            window.api.warGetQuotationWarConditions(quotation.id),
            window.api.warGetSettings(),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeConds = Array.isArray(conds) ? conds : []
        const safeExisting = Array.isArray(existing) ? existing : []
        setAllConditions(safeConds)
        setQConditions(safeExisting)
        if (settings && !(settings as any).error) setWarSettings(settings)
        setVessels(Array.isArray(qvs) ? qvs : [])

        // Build overrides from existing
        const ov: Record<string, string> = {}
        safeExisting.forEach(qc => { if (qc.textOverride) ov[qc.warConditionId] = qc.textOverride })
        setOverrides(ov)

        // Auto-apply defaults on first load
        if (!defaultsApplied.current && safeExisting.length === 0 && safeConds.length > 0) {
            defaultsApplied.current = true
            const defaults = safeConds.filter(c => c.defaultSelected)
            if (defaults.length > 0) {
                try {
                    await window.api.warSetQuotationWarConditions(
                        quotation.id,
                        defaults.map(c => ({ warConditionId: c.id }))
                    )
                    const fresh = await window.api.warGetQuotationWarConditions(quotation.id)
                    setQConditions(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const selectedIds = new Set(qConditions.map(qc => qc.warConditionId))

    const resolveText = (text: string): string => {
        if (!warSettings) return text
        return text
            .replace(/\{jwla_code\}/g, warSettings.jwlaCode)
            .replace(/\{jwla_date\}/g, warSettings.jwlaDate)
            .replace(/\{tc_text\}/g, warSettings.tcText)
    }

    const handleToggle = async (condId: string) => {
        const newSelected = selectedIds.has(condId)
            ? qConditions.filter(qc => qc.warConditionId !== condId)
            : [...qConditions, { warConditionId: condId } as any]
        try {
            await window.api.warSetQuotationWarConditions(
                quotation.id,
                newSelected.map(qc => ({
                    warConditionId: qc.warConditionId,
                    textOverride: overrides[qc.warConditionId] || undefined,
                    vesselScope: qc.vesselScope || undefined
                }))
            )
            const fresh = await window.api.warGetQuotationWarConditions(quotation.id)
            setQConditions(Array.isArray(fresh) ? fresh : [])
        } catch { showError('Failed to update conditions') }
    }

    const handleOverrideChange = (condId: string, text: string) => {
        setOverrides(prev => ({ ...prev, [condId]: text }))
    }

    const handleOverrideBlur = async () => {
        try {
            await window.api.warSetQuotationWarConditions(
                quotation.id,
                qConditions.map(qc => ({
                    warConditionId: qc.warConditionId,
                    textOverride: overrides[qc.warConditionId] || undefined,
                    vesselScope: qc.vesselScope || undefined
                }))
            )
        } catch {}
    }

    const handleScopeChange = async (condId: string, scope: string[] | null) => {
        const updated = qConditions.map(qc => qc.warConditionId === condId ? { ...qc, vesselScope: scope } : qc)
        try {
            await window.api.warSetQuotationWarConditions(
                quotation.id,
                updated.map(qc => ({
                    warConditionId: qc.warConditionId,
                    textOverride: overrides[qc.warConditionId] || undefined,
                    vesselScope: qc.vesselScope || undefined
                }))
            )
            setQConditions(updated)
        } catch {}
    }

    return (
        <div>
            <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Conditions</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                Select conditions for this War Risk quotation. Placeholders (<code style={{ fontSize: '0.78rem' }}>{'{jwla_code}'}</code>, <code style={{ fontSize: '0.78rem' }}>{'{jwla_date}'}</code>, <code style={{ fontSize: '0.78rem' }}>{'{tc_text}'}</code>) are resolved from War Settings.
            </p>

            {warSettings && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,170,200,0.06)', border: '1px solid rgba(0,170,200,0.15)', marginBottom: '14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    JWLA: <strong>{warSettings.jwlaCode}</strong> dated <strong>{warSettings.jwlaDate}</strong> &middot; T&C: <strong>{warSettings.tcText}</strong>
                </div>
            )}

            {allConditions.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--table-border)', borderRadius: '8px' }}>
                    No war conditions configured. Add conditions in Quotation Settings &gt; War &gt; Conditions.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {allConditions.map(cond => {
                        const isSelected = selectedIds.has(cond.id)
                        const displayText = resolveText(overrides[cond.id] || cond.text)
                        return (
                            <div key={cond.id} style={{ padding: '10px 14px', borderRadius: '8px', border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--table-border)'}`, background: isSelected ? 'rgba(0,170,200,0.04)' : 'transparent' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => handleToggle(cond.id)}
                                        style={{ marginTop: '3px', accentColor: 'var(--accent-primary)' }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <span style={{ fontSize: '0.84rem' }}>{displayText}</span>
                                        {isSelected && (
                                            <textarea
                                                value={overrides[cond.id] || ''}
                                                onChange={e => handleOverrideChange(cond.id, e.target.value)}
                                                onBlur={handleOverrideBlur}
                                                placeholder="Override text (leave empty to use default)..."
                                                style={{ width: '100%', marginTop: '8px', minHeight: '40px', fontSize: '0.8rem', padding: '6px 8px', opacity: 0.85 }}
                                            />
                                        )}
                                    </div>
                                </div>
                                {isSelected && vessels.length >= 2 && (
                                    <div style={{ marginTop: '6px', paddingLeft: '28px' }}>
                                        <VesselScopeChips
                                            vessels={vessels}
                                            vesselScope={qConditions.find(qc => qc.warConditionId === cond.id)?.vesselScope || null}
                                            onChange={scope => handleScopeChange(cond.id, scope)}
                                        />
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* T&C line (from war settings) */}
            {warSettings?.tcText && (
                <div style={{ marginTop: '16px', padding: '10px 14px', borderRadius: '8px', border: '1px solid rgba(255,140,50,0.2)', background: 'rgba(255,140,50,0.04)' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Terms &amp; Conditions</span>
                    <p style={{ fontSize: '0.84rem', margin: '4px 0 0' }}>{warSettings.tcText}</p>
                </div>
            )}
        </div>
    )
}

