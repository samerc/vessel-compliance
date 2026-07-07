import { useState, useEffect } from 'react'
import { ChevronUp, ChevronDown, X } from 'lucide-react'
import { Quotation, QuotationCustomSection } from '../../../../shared/types'
import { SECTION_LABELS, getDefaultSectionOrder } from '../quotationSettingsConstants'

export default function SectionOrderModal({ quotation, onClose, onSave, showSuccess, showError, isLight, persist, docLabel, defaultsLoader }: {
    quotation: Quotation
    onClose: () => void
    onSave: (order: string[]) => void
    showSuccess: (m: string) => void
    showError: (m: string) => void
    isLight: boolean
    // Optional custom persistence (e.g. save onto a policy instead of the quotation)
    persist?: (order: string[]) => Promise<void>
    docLabel?: string
    // Optional custom defaults loader (e.g. policy settings defaults instead of quotation)
    defaultsLoader?: (typeCode: string) => Promise<string[]>
}) {
    const loadTypeDefaults = (tc: string) => defaultsLoader ? defaultsLoader(tc) : window.api.piGetSectionOrderDefaultsByType(tc)
    const [order, setOrder] = useState<string[]>([])
    const [customSections, setCustomSections] = useState<QuotationCustomSection[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => { loadData() }, [])

    const typeCode = quotation.quotationTypeCode || 'P'
    const typeDefaultOrder = getDefaultSectionOrder(typeCode)

    const loadData = async () => {
        setLoading(true)
        const [cs, typeDefaults] = await Promise.all([
            window.api.getQuotationCustomSections(quotation.id),
            loadTypeDefaults(typeCode)
        ])
        const safeSections = Array.isArray(cs) ? cs : []
        setCustomSections(safeSections)

        // Build order: use quotation's saved order, or type-specific defaults, or hardcoded default
        const baseOrder = quotation.sectionOrder && quotation.sectionOrder.length > 0
            ? [...quotation.sectionOrder]
            : Array.isArray(typeDefaults) && typeDefaults.length > 0
                ? [...typeDefaults]
                : [...typeDefaultOrder]

        // Add any custom sections not already in the order
        const customKeys = safeSections.map(s => `custom:${s.id}`)
        for (const ck of customKeys) {
            if (!baseOrder.includes(ck)) baseOrder.push(ck)
        }

        // Remove custom keys that no longer exist
        const validCustomKeys = new Set(customKeys)
        const filtered = baseOrder.filter(k => !k.startsWith('custom:') || validCustomKeys.has(k))

        // Ensure all type-relevant default keys are present
        for (const dk of typeDefaultOrder) {
            if (!filtered.includes(dk)) filtered.push(dk)
        }

        // Remove sections that don't belong to this type
        const typeKeys = new Set(typeDefaultOrder)
        const finalOrder = filtered.filter(k => k.startsWith('custom:') || typeKeys.has(k))

        setOrder(finalOrder)
        setLoading(false)
    }

    const handleMove = (index: number, dir: 'up' | 'down') => {
        const newOrder = [...order]
        const swapIdx = dir === 'up' ? index - 1 : index + 1
        if (swapIdx < 0 || swapIdx >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[index]]
        setOrder(newOrder)
    }

    const handleSave = async () => {
        try {
            if (persist) await persist(order)
            else await window.api.updateQuotation(quotation.id, { sectionOrder: order } as any)
            showSuccess('Section order saved')
            onSave(order)
        } catch (err: any) { showError(err.message || 'Failed to save order') }
    }

    const handleReset = async () => {
        const defaults = await loadTypeDefaults(typeCode)
        const baseOrder = Array.isArray(defaults) && defaults.length > 0 ? [...defaults] : [...typeDefaultOrder]
        const customKeys = customSections.map(s => `custom:${s.id}`)
        for (const ck of customKeys) {
            if (!baseOrder.includes(ck)) baseOrder.push(ck)
        }
        setOrder(baseOrder)
    }

    const getLabel = (key: string): string => {
        if (key.startsWith('custom:')) {
            const id = key.replace('custom:', '')
            const section = customSections.find(s => s.id === id)
            return section ? section.title : 'Unknown Section'
        }
        return SECTION_LABELS[key] || key
    }

    const isCustom = (key: string) => key.startsWith('custom:')

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{
                background: isLight ? '#ffffff' : '#1a1d28',
                borderRadius: '12px', padding: '24px', width: '480px', maxHeight: '80vh', display: 'flex', flexDirection: 'column'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Section Order</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}><X size={18} /></button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    Reorder how sections appear in the exported {docLabel || 'quotation'}.
                </p>

                {loading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading...</div>
                ) : (
                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '16px' }}>
                        {order.map((key, i) => (
                            <div key={key} style={{
                                padding: '10px 14px', borderRadius: '8px',
                                border: `1px solid ${isCustom(key) ? 'rgba(160,100,255,0.3)' : 'var(--table-border)'}`,
                                marginBottom: '4px', display: 'flex', gap: '12px', alignItems: 'center',
                                background: isCustom(key) ? 'rgba(160,100,255,0.06)' : 'transparent'
                            }}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', minWidth: '22px' }}>{i + 1}.</span>
                                <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>
                                    {getLabel(key)}
                                    {isCustom(key) && <span style={{ fontSize: '0.7rem', color: '#a064ff', marginLeft: '8px' }}>(Custom)</span>}
                                </span>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={16} /></button>
                                    <button onClick={() => handleMove(i, 'down')} disabled={i === order.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === order.length - 1 ? 0.3 : 1 }}><ChevronDown size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
                    <button onClick={handleReset} className="btn-secondary" style={{ fontSize: '0.82rem' }}>
                        Reset to Defaults
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={onClose} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                        <button onClick={handleSave} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save Order</button>
                    </div>
                </div>
            </div>
        </div>
    )
}

