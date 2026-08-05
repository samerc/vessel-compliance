import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronDown, Layers } from 'lucide-react'
import { Quotation, CargoClause, CargoInstituteClause, CargoClauseSet, QuotationCargoClause, QuotationCargoCustomClause } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'

const SECTION_LABELS: Record<string, string> = {
    conditions: 'Conditions',
    special: 'Special Conditions',
    law: 'Law & Jurisdiction'
}

function InstituteClauseDropdown({ clauses, selectedId, onChange }: {
    clauses: CargoInstituteClause[]
    selectedId: string
    onChange: (id: string) => void
}) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const { theme } = useTheme()
    const isLight = theme === 'light' || theme === 'aurora'
    const bg = isLight ? '#ffffff' : '#1a1d28'
    const selected = clauses.find(c => c.id === selectedId)

    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    return (
        <div style={{ marginBottom: '20px' }} ref={ref}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Institute Cargo Clause</label>
            <div style={{ position: 'relative' }}>
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--input-border)',
                        background: bg,
                        color: isLight ? '#1c1e21' : '#e8e8e8',
                        cursor: 'pointer',
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        textAlign: 'left',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}
                >
                    <span>{selected ? `${selected.code ? selected.code + ' — ' : ''}${selected.name}` : 'Select an institute cargo clause...'}</span>
                    <ChevronDown size={16} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-secondary)' }} />
                </button>
                {open && clauses.length > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        borderRadius: '8px',
                        border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
                        background: bg,
                        zIndex: 999,
                        boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.5)'
                    }}>
                        {clauses.map(ic => {
                            const active = ic.id === selectedId
                            return (
                                <div
                                    key={ic.id}
                                    onClick={() => { onChange(ic.id); setOpen(false) }}
                                    style={{
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        color: active ? 'var(--accent-primary)' : (isLight ? '#1c1e21' : '#e8e8e8'),
                                        fontWeight: active ? 600 : 400,
                                        fontSize: '0.85rem',
                                        background: active ? (isLight ? 'rgba(0,170,200,0.06)' : 'rgba(0,210,255,0.06)') : 'transparent',
                                        borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}`
                                    }}
                                    onMouseEnter={e => { if (!active) (e.target as HTMLElement).style.background = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}
                                    onMouseLeave={e => { if (!active) (e.target as HTMLElement).style.background = 'transparent' }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {ic.code && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#32b886' }}>{ic.code}</span>}
                                        <span>{ic.name}</span>
                                    </div>
                                    {ic.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{ic.description}</p>}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            {selected?.description && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '6px 0 0', fontStyle: 'italic' }}>{selected.description}</p>
            )}
        </div>
    )
}

export default function CargoClausesTab({ quotation, section, updateField, showSuccess: _showSuccess, showError }: {
    quotation: Quotation
    section: 'conditions' | 'special' | 'law'
    updateField?: (field: keyof Quotation, value: any) => void
    showSuccess: (msg: string) => void
    showError: (msg: string) => void
}) {
    const { theme } = useTheme()
    const isLight = theme === 'light' || theme === 'aurora'
    const [allClauses, setAllClauses] = useState<CargoClause[]>([])
    const [selectedClauses, setSelectedClauses] = useState<QuotationCargoClause[]>([])
    const [customClauses, setCustomClauses] = useState<QuotationCargoCustomClause[]>([])
    const [showPicker, setShowPicker] = useState(false)
    const [editingCustom, setEditingCustom] = useState<string | null>(null)
    const [newCustomText, setNewCustomText] = useState('')
    const [instituteClauses, setInstituteClauses] = useState<CargoInstituteClause[]>([])
    const [sets, setSets] = useState<CargoClauseSet[]>([])
    const [showSetPicker, setShowSetPicker] = useState(false)
    const setPickerRef = useRef<HTMLDivElement>(null)

    const loadData = async () => {
        try {
            const [all, sel, cust, sts] = await Promise.all([
                window.api.cargoGetClauses(section),
                window.api.cargoGetQuotationClauses(quotation.id, section),
                window.api.cargoGetQuotationCustomClauses(quotation.id, section),
                window.api.cargoGetClauseSets(section)
            ])
            setAllClauses(Array.isArray(all) ? all : [])
            setSelectedClauses(Array.isArray(sel) ? sel : [])
            setCustomClauses(Array.isArray(cust) ? cust : [])
            setSets(Array.isArray(sts) ? sts : [])
        } catch {}
    }

    useEffect(() => {
        if (!showSetPicker) return
        const handler = (e: MouseEvent) => { if (setPickerRef.current && !setPickerRef.current.contains(e.target as Node)) setShowSetPicker(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [showSetPicker])

    const applySet = async (set: CargoClauseSet) => {
        try {
            const existing = selectedClauses.map(c => ({ cargoClauseId: c.cargoClauseId, textOverride: c.textOverride || undefined, amount: c.amount ?? null }))
            const existingIds = new Set(existing.map(e => e.cargoClauseId))
            const additions = set.clauseIds.filter(id => !existingIds.has(id)).map(id => ({ cargoClauseId: id }))
            setShowSetPicker(false)
            if (additions.length === 0) return
            await window.api.cargoSetQuotationClauses(quotation.id, section, [...existing, ...additions])
            await loadData()
        } catch (err: any) { showError(err.message || 'Failed to apply set') }
    }

    const loadInstituteClauses = async () => {
        if (section !== 'conditions') return
        try {
            const result = await window.api.cargoGetInstituteClauses()
            setInstituteClauses(Array.isArray(result) ? result.filter(c => c.active !== false) : [])
        } catch { setInstituteClauses([]) }
    }

    useEffect(() => { loadData(); loadInstituteClauses() }, [quotation.id, section])

    const selectedIds = new Set(selectedClauses.map(c => c.cargoClauseId))

    const toggleClause = async (clause: CargoClause) => {
        try {
            let newItems: { cargoClauseId: string; textOverride?: string; amount?: number | null }[]
            if (selectedIds.has(clause.id)) {
                newItems = selectedClauses.filter(c => c.cargoClauseId !== clause.id).map(c => ({ cargoClauseId: c.cargoClauseId, textOverride: c.textOverride || undefined, amount: c.amount ?? null }))
            } else {
                newItems = [...selectedClauses.map(c => ({ cargoClauseId: c.cargoClauseId, textOverride: c.textOverride || undefined, amount: c.amount ?? null })), { cargoClauseId: clause.id }]
            }
            await window.api.cargoSetQuotationClauses(quotation.id, section, newItems)
            await loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const updateOverride = async (cargoClauseId: string, textOverride: string) => {
        const newItems = selectedClauses.map(c => ({
            cargoClauseId: c.cargoClauseId,
            textOverride: c.cargoClauseId === cargoClauseId ? (textOverride || undefined) : (c.textOverride || undefined),
            amount: c.amount ?? null
        }))
        await window.api.cargoSetQuotationClauses(quotation.id, section, newItems)
        setSelectedClauses(prev => prev.map(c => c.cargoClauseId === cargoClauseId ? { ...c, textOverride } : c))
    }

    const updateAmount = async (cargoClauseId: string, amount: number | null) => {
        const newItems = selectedClauses.map(c => ({
            cargoClauseId: c.cargoClauseId,
            textOverride: c.textOverride || undefined,
            amount: c.cargoClauseId === cargoClauseId ? amount : (c.amount ?? null)
        }))
        await window.api.cargoSetQuotationClauses(quotation.id, section, newItems)
        setSelectedClauses(prev => prev.map(c => c.cargoClauseId === cargoClauseId ? { ...c, amount } : c))
    }

    const addCustom = async () => {
        if (!newCustomText.trim()) return
        try {
            const result = await window.api.cargoAddQuotationCustomClause(quotation.id, section, newCustomText.trim())
            if (result && !(result as any).error) {
                setCustomClauses(prev => [...prev, result])
                setNewCustomText('')
            }
        } catch (err: any) { showError(err.message || 'Failed to add') }
    }

    const deleteCustom = async (id: string) => {
        await window.api.cargoDeleteQuotationCustomClause(id)
        setCustomClauses(prev => prev.filter(c => c.id !== id))
    }

    const updateCustomText = async (id: string, text: string) => {
        await window.api.cargoUpdateQuotationCustomClause(id, { text })
        setCustomClauses(prev => prev.map(c => c.id === id ? { ...c, text } : c))
        setEditingCustom(null)
    }

    const availableClauses = allClauses.filter(c => c.active !== false)

    const handleInstituteClauseChange = (id: string) => {
        if (updateField) {
            updateField('cargoClauseId', id)
        }
    }

    return (
        <div>
            {/* Institute Cargo Clause selector (conditions section only) */}
            {section === 'conditions' && instituteClauses.length > 0 && (
                <InstituteClauseDropdown
                    clauses={instituteClauses}
                    selectedId={quotation.cargoClauseId || ''}
                    onChange={handleInstituteClauseChange}
                />
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>{section === 'conditions' ? 'Additional Conditions' : SECTION_LABELS[section]}</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {sets.length > 0 && (
                        <div style={{ position: 'relative' }} ref={setPickerRef}>
                            <button onClick={() => setShowSetPicker(!showSetPicker)} className="btn-secondary"
                                style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Layers size={14} /> Apply Set
                                <ChevronDown size={14} style={{ transform: showSetPicker ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
                            </button>
                            {showSetPicker && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', minWidth: '220px', maxHeight: '280px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--input-border)', background: isLight ? '#ffffff' : '#1a1d28', zIndex: 999, boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.5)' }}>
                                    {sets.map(s => (
                                        <div key={s.id} onClick={() => applySet(s)}
                                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.82rem', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'}` }}
                                            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                            {s.name}
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>({s.clauseIds.length})</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={() => setShowPicker(!showPicker)} className="btn-secondary"
                        style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ChevronDown size={14} style={{ transform: showPicker ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
                        {showPicker ? 'Hide' : 'Select'} Clauses
                    </button>
                </div>
            </div>

            {/* Clause picker */}
            {showPicker && (
                <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '8px', border: '1px solid var(--input-border)', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>{selectedIds.size} of {availableClauses.length} selected</p>
                    {availableClauses.map(clause => (
                        <label key={clause.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '0.84rem' }}>
                            <input type="checkbox" checked={selectedIds.has(clause.id)} onChange={() => toggleClause(clause)}
                                style={{ marginTop: '3px' }} />
                            <span>
                                {clause.code && <strong style={{ marginRight: '6px' }}>{clause.code}</strong>}
                                {clause.title}
                            </span>
                        </label>
                    ))}
                </div>
            )}

            {/* Selected clauses */}
            {selectedClauses.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Selected Clauses</label>
                    {selectedClauses.map(sc => {
                        const def = allClauses.find(c => c.id === sc.cargoClauseId)
                        return (
                            <div key={sc.id} style={{ marginBottom: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.84rem', flex: 1 }}>
                                        {def?.code && <strong style={{ marginRight: '6px' }}>{def.code}</strong>}
                                        {def?.title || sc.title || 'Unknown'}
                                    </span>
                                    <button onClick={() => { if (def) toggleClause(def) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}>
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                                {def?.text && !sc.textOverride && (
                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-primary)', margin: '0 0 6px', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{def.text}</p>
                                )}
                                {sc.hasAmount && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{sc.amountPlaceholder || 'Amount'}:</label>
                                        <input
                                            type="number"
                                            value={sc.amount ?? ''}
                                            placeholder="0.00"
                                            onChange={e => setSelectedClauses(prev => prev.map(c => c.id === sc.id ? { ...c, amount: e.target.value ? parseFloat(e.target.value) : null } : c))}
                                            onBlur={e => updateAmount(sc.cargoClauseId, e.target.value ? parseFloat(e.target.value) : null)}
                                            style={{ width: '180px', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                                        />
                                    </div>
                                )}
                                <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>Custom wording for this quotation (leave blank to use default)</label>
                                <textarea
                                    value={sc.textOverride || ''}
                                    placeholder="Leave blank to use the default wording above"
                                    rows={2}
                                    onChange={e => setSelectedClauses(prev => prev.map(c => c.id === sc.id ? { ...c, textOverride: e.target.value } : c))}
                                    onBlur={e => updateOverride(sc.cargoClauseId, e.target.value)}
                                    style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.8rem', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Custom clauses */}
            <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>Custom Clauses</label>
                {customClauses.map(cc => (
                    <div key={cc.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '8px' }}>
                        {editingCustom === cc.id ? (
                            <textarea value={cc.text} rows={3}
                                onChange={e => setCustomClauses(prev => prev.map(c => c.id === cc.id ? { ...c, text: e.target.value } : c))}
                                onBlur={e => updateCustomText(cc.id, e.target.value)}
                                autoFocus
                                style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit' }} />
                        ) : (
                            <div onClick={() => setEditingCustom(cc.id)} style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', fontSize: '0.82rem', cursor: 'pointer', minHeight: '36px' }}>
                                {cc.text}
                            </div>
                        )}
                        <button onClick={() => deleteCustom(cc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', marginTop: '4px' }}>
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <textarea value={newCustomText} placeholder="Add a custom clause..."
                        rows={2}
                        onChange={e => setNewCustomText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustom() } }}
                        style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit' }} />
                    <button onClick={addCustom} disabled={!newCustomText.trim()} className="btn-primary"
                        style={{ padding: '6px 12px', fontSize: '0.78rem', marginTop: '2px' }}>
                        <Plus size={14} />
                    </button>
                </div>
            </div>

            {selectedClauses.length === 0 && customClauses.length === 0 && !showPicker && (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '24px' }}>
                    No clauses selected. Click &quot;Select Clauses&quot; to choose from the library, or add custom clauses below.
                </p>
            )}
        </div>
    )
}
