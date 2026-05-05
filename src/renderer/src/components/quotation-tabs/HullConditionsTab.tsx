import { useState, useEffect, useRef, useMemo } from 'react'
import { Plus, Trash2, ChevronDown, X, RefreshCw, Users, Ship, GitBranch } from 'lucide-react'
import { Quotation, HullClause, HullClauseCondition, HullAdditionalCondition, QuotationHullCondition, QuotationHullAdditionalCondition, QuotationHullAlternative, QuotationVessel } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'
import VesselScopeChips from '../VesselScopeChips'
import { ALT_COLORS } from './shared'

function HullClauseDropdown({ clauses, selectedId, onChange, description, hideLabel }: {
    clauses: HullClause[]
    selectedId: string
    onChange: (id: string) => void
    description?: string
    hideLabel?: boolean
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
            {!hideLabel && <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Hull Clause</label>}
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
                    <span>{selected ? `${selected.code} — ${selected.name}` : 'Select a hull clause...'}</span>
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
                        {clauses.map(hc => {
                            const active = hc.id === selectedId
                            return (
                                <div
                                    key={hc.id}
                                    onClick={() => { onChange(hc.id); setOpen(false) }}
                                    style={{
                                        padding: '10px 14px',
                                        cursor: 'pointer',
                                        color: active ? 'var(--accent-primary)' : (isLight ? '#1c1e21' : '#e8e8e8'),
                                        fontWeight: active ? 600 : 400,
                                        fontSize: '0.86rem',
                                        background: active ? 'rgba(0, 170, 200, 0.08)' : 'transparent',
                                        borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`
                                    }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)' }}
                                    onMouseLeave={e => { e.currentTarget.style.background = active ? 'rgba(0, 170, 200, 0.08)' : 'transparent' }}
                                >
                                    <span style={{ fontWeight: 600 }}>{hc.code}</span> — {hc.name}
                                    {hc.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{hc.description}</div>}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
            {description && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '8px 0 0', fontStyle: 'italic' }}>
                    {description}
                </p>
            )}
        </div>
    )
}

// ==================== Hull Condition Picker (shared) ====================

function HullConditionPicker({ label, items, selectedIds, onToggle, overrides, onOverrideChange, onOverrideBlur, scopes, onScopeChange, vessels, emptyText, amounts, onAmountChange, onAmountBlur, allConditions: _allConds, vesselAmountsMap, onVesselAmountChange, onVesselAmountBlur }: {
    label: string
    items: { id: string; label: string; text: string; hasAmount?: boolean; amountPlaceholder?: string }[]
    selectedIds: Set<string>
    onToggle: (id: string) => void
    overrides: Record<string, string>
    onOverrideChange: (id: string, text: string) => void
    onOverrideBlur: () => void
    scopes: Record<string, string[] | null>
    onScopeChange: (id: string, scope: string[] | null) => void
    vessels: QuotationVessel[]
    emptyText: string
    amounts?: Record<string, number | undefined>
    onAmountChange?: (id: string, amount: number | undefined) => void
    onAmountBlur?: () => void
    allConditions?: HullClauseCondition[]
    vesselAmountsMap?: Record<string, Record<string, number> | null>
    onVesselAmountChange?: (condId: string, vesselId: string, amount: number | undefined) => void
    onVesselAmountBlur?: () => void
}) {
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const { theme } = useTheme()
    const isLight = theme === 'light' || theme === 'aurora'
    const bg = isLight ? '#ffffff' : '#1a1d28'
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    const selectedCount = selectedItems.length

    return (
        <div>
            {label && <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>{label}</label>}

            {items.length === 0 ? (
                <div style={{ padding: '10px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.78rem', border: '1px dashed var(--table-border)', borderRadius: '6px' }}>
                    {emptyText}
                </div>
            ) : (
                <>
                    {/* Dropdown selector */}
                    <div style={{ position: 'relative', marginBottom: selectedCount > 0 ? '6px' : 0 }}>
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            style={{
                                width: '100%', padding: '6px 10px', borderRadius: '6px',
                                border: `1px solid ${isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
                                background: bg, color: isLight ? '#1c1e21' : '#e8e8e8',
                                cursor: 'pointer', fontSize: '0.8rem', textAlign: 'left',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                            }}
                        >
                            <span>{selectedCount} of {items.length} selected</span>
                            <ChevronDown size={14} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-secondary)' }} />
                        </button>
                        {dropdownOpen && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setDropdownOpen(false)} />
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '2px',
                                    maxHeight: '280px', overflowY: 'auto', borderRadius: '6px',
                                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
                                    background: bg, zIndex: 999,
                                    boxShadow: isLight ? '0 6px 20px rgba(0,0,0,0.1)' : '0 6px 20px rgba(0,0,0,0.4)'
                                }}>
                                    <div style={{ padding: '6px 10px', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`, display: 'flex', gap: '6px', position: 'sticky', top: 0, background: bg, zIndex: 1 }}>
                                        <button type="button" onClick={() => { items.forEach(i => { if (!selectedIds.has(i.id)) onToggle(i.id) }) }}
                                            style={{ padding: '2px 8px', fontSize: '0.68rem', borderRadius: '4px', border: '1px solid var(--accent-primary)', background: 'rgba(0,170,200,0.08)', color: 'var(--accent-primary)', cursor: 'pointer' }}>Select All</button>
                                        <button type="button" onClick={() => { items.forEach(i => { if (selectedIds.has(i.id)) onToggle(i.id) }) }}
                                            style={{ padding: '2px 8px', fontSize: '0.68rem', borderRadius: '4px', border: '1px solid var(--table-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Deselect All</button>
                                    </div>
                                    {items.map(item => {
                                        const checked = selectedIds.has(item.id)
                                        return (
                                            <div key={item.id} onClick={() => onToggle(item.id)}
                                                style={{ padding: '5px 10px', cursor: 'pointer', display: 'flex', gap: '8px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.03)', background: checked ? 'rgba(0,170,200,0.05)' : 'transparent' }}>
                                                <input type="checkbox" checked={checked} readOnly style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)', pointerEvents: 'none' }} />
                                                <div style={{ flex: 1, minWidth: 0, fontSize: '0.78rem' }}>
                                                    {item.label && <span style={{ fontWeight: 600, marginRight: '4px' }}>{item.label}</span>}
                                                    <span style={{ color: 'var(--text-secondary)' }}>{item.text.length > 100 ? item.text.slice(0, 100) + '...' : item.text}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Selected items — compact rows with accordion expand */}
                    {selectedItems.map(item => {
                        const isExpanded = expandedId === item.id
                        return (
                        <div key={item.id} style={{ marginBottom: '2px', borderRadius: '4px', border: '1px solid rgba(0,170,200,0.15)', background: 'rgba(0,170,200,0.03)' }}>
                            {/* Compact row */}
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 8px', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                                <button type="button" onClick={e => { e.stopPropagation(); onToggle(item.id) }} title="Remove"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', flexShrink: 0 }}><X size={12} /></button>
                                {item.label && <span style={{ fontWeight: 600, fontSize: '0.78rem', flexShrink: 0 }}>{item.label}</span>}
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{overrides[item.id] || item.text}</span>
                                {item.hasAmount && amounts && amounts[item.id] != null && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', flexShrink: 0 }}>{Number(amounts[item.id]).toLocaleString()}</span>
                                )}
                                <ChevronDown size={12} style={{ flexShrink: 0, color: 'var(--text-secondary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                            </div>
                            {/* Expanded detail */}
                            {isExpanded && (
                                <div style={{ padding: '6px 8px 8px 28px', borderTop: '1px solid rgba(0,170,200,0.1)' }}>
                                    <textarea
                                        value={overrides[item.id] || ''}
                                        onChange={e => onOverrideChange(item.id, e.target.value)}
                                        onBlur={onOverrideBlur}
                                        placeholder={item.text}
                                        rows={2}
                                        style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', fontSize: '0.78rem', resize: 'vertical', fontFamily: 'inherit', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }}
                                    />
                                    {item.hasAmount && amounts && onAmountChange && onAmountBlur && (
                                        vessels.length >= 2 && vesselAmountsMap && onVesselAmountChange && onVesselAmountBlur && !scopes[item.id] ? (
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>{item.amountPlaceholder || 'Amount'} (per vessel):</span>
                                                {vessels.map(v => {
                                                    const va = vesselAmountsMap[item.id]
                                                    const perVesselVal = va ? va[v.id] : undefined
                                                    return (
                                                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', width: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(v.name || v.vesselLabel).toUpperCase()}</span>
                                                            <input type="number" value={perVesselVal ?? amounts[item.id] ?? ''} onChange={e => onVesselAmountChange(item.id, v.id, e.target.value ? Number(e.target.value) : undefined)} onBlur={onVesselAmountBlur} placeholder="0" style={{ width: '120px', padding: '3px 6px', borderRadius: '4px', fontSize: '0.78rem', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{item.amountPlaceholder || 'Amount'}:</span>
                                                <input type="number" value={amounts[item.id] ?? ''} onChange={e => onAmountChange(item.id, e.target.value ? Number(e.target.value) : undefined)} onBlur={onAmountBlur} placeholder="0" style={{ width: '120px', padding: '3px 6px', borderRadius: '4px', fontSize: '0.78rem', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                            </div>
                                        )
                                    )}
                                    {vessels.length > 1 && (
                                        <div style={{ marginTop: '4px' }}>
                                            <VesselScopeChips vessels={vessels} vesselScope={scopes[item.id]} onChange={scope => onScopeChange(item.id, scope)} />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )})}
                </>
            )}
        </div>
    )
}


export default function HullConditionsTab({ quotation, updateField, showSuccess, showError }: {
    quotation: Quotation
    updateField: (f: string, v: any) => void
    showSuccess: (m: string) => void
    showError: (m: string) => void
}) {
    const { theme } = useTheme()
    const isLight = theme === 'light' || theme === 'aurora'
    const [hullClauses, setHullClauses] = useState<HullClause[]>([])
    const [allConditions, setAllConditions] = useState<HullClauseCondition[]>([])
    const [allAdditional, setAllAdditional] = useState<HullAdditionalCondition[]>([])
    const [alternatives, setAlternatives] = useState<QuotationHullAlternative[]>([])
    const [selectedIvClauseId, setSelectedIvClauseId] = useState<string>('')
    const [qConditions, setQConditions] = useState<QuotationHullCondition[]>([])
    const [qAdditional, setQAdditional] = useState<QuotationHullAdditionalCondition[]>([])
    const [customConditions, setCustomConditions] = useState<{ id: string; text: string; title?: string; order: number; vesselScope?: string[] | null; alternativeId?: string | null }[]>([])
    const [newCustomText, setNewCustomText] = useState('')
    const [hullSubTab, setHullSubTab] = useState<'conditions' | 'additional' | 'custom'>('conditions')
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [selectedVesselScope, setSelectedVesselScope] = useState<string | null>(null) // null = "All Vessels"
    const [addOverrideOpen, setAddOverrideOpen] = useState(false)
    const addOverrideRef = useRef<HTMLDivElement>(null)
    const condDefaultsApplied = useRef(false)
    const addDefaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    // Close add-override dropdown on outside click
    useEffect(() => {
        if (!addOverrideOpen) return
        const handler = (e: MouseEvent) => {
            if (addOverrideRef.current && !addOverrideRef.current.contains(e.target as Node)) setAddOverrideOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [addOverrideOpen])

    const loadData = async () => {
        const [clauses, conditions, additional, existCond, existAdd, qv, alts, customConds] = await Promise.all([
            window.api.hullGetClauses(),
            window.api.hullGetClauseConditions(),
            window.api.hullGetAdditionalConditions(),
            window.api.hullGetQuotationHullConditions(quotation.id),
            window.api.hullGetQuotationHullAdditionalConditions(quotation.id),
            window.api.getQuotationVessels(quotation.id),
            window.api.hullGetQuotationAlternatives(quotation.id),
            window.api.hullGetQuotationCustomConditions(quotation.id)
        ])
        setCustomConditions(Array.isArray(customConds) ? customConds : [])
        const safeClauses = Array.isArray(clauses) ? clauses : []
        const safeConds = Array.isArray(conditions) ? conditions : []
        const safeAdd = Array.isArray(additional) ? additional : []
        const safeExistCond = Array.isArray(existCond) ? existCond : []
        const safeExistAdd = Array.isArray(existAdd) ? existAdd : []
        const safeAlts = Array.isArray(alts) ? alts : []
        setHullClauses(safeClauses)
        setAllConditions(safeConds)
        setAllAdditional(safeAdd)
        setQConditions(safeExistCond)
        setQAdditional(safeExistAdd)
        setQVessels(Array.isArray(qv) ? qv : [])

        // If no alternatives exist yet, create one shared from the quotation's hullClauseId or first H&M clause
        if (safeAlts.length === 0) {
            // No alternatives yet — don't auto-create, let user choose
            setAlternatives([])
        } else {
            setAlternatives(safeAlts)
            // Sync hullClauseId from first shared alternative
            const sharedAlts = safeAlts.filter(a => !a.vesselScopeId)
            if (sharedAlts.length === 1 && sharedAlts[0].hullClauseId !== quotation.hullClauseId) {
                try { updateField('hullClauseId', sharedAlts[0].hullClauseId) } catch {}
            } else if (sharedAlts.length > 1 && quotation.hullClauseId) {
                try { updateField('hullClauseId', null) } catch {}
            }
        }

        // Auto-select IV clause
        const ivClauses = safeClauses.filter(c => c.conditionSection === 'iv')
        if (quotation.ivClauseId && safeClauses.some(c => c.id === quotation.ivClauseId)) {
            setSelectedIvClauseId(quotation.ivClauseId)
        } else if (ivClauses.length > 0 && quotation.ivEnabled) {
            setSelectedIvClauseId(ivClauses[0].id)
            try { updateField('ivClauseId', ivClauses[0].id) } catch {}
        }

        // Auto-apply default conditions when none exist yet — only if alternatives exist
        // (without alternatives, null-scoped defaults become orphans and cause duplication)
        if (safeExistCond.length === 0 && safeConds.length > 0 && !condDefaultsApplied.current && safeAlts.length > 0) {
            condDefaultsApplied.current = true
            const defaults = safeConds.filter((c: any) => c.defaultSelected)
            if (defaults.length > 0) {
                // Assign defaults to the first alternative instead of null scope
                const firstAlt = safeAlts[0]
                try {
                    await window.api.hullSetQuotationHullConditions(
                        quotation.id,
                        defaults.map((c: any) => ({
                            hullConditionId: c.id,
                            conditionSection: c.conditionSection || 'both',
                            alternativeId: firstAlt.id
                        }))
                    )
                    const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
                    setQConditions(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        } else if (safeExistCond.length > 0) {
            condDefaultsApplied.current = true
        }

        // Auto-apply default additional conditions on first load
        if (!addDefaultsApplied.current && safeExistAdd.length === 0 && safeAdd.length > 0) {
            addDefaultsApplied.current = true
            const defaults = safeAdd.filter(c => c.defaultSelected)
            if (defaults.length > 0) {
                try {
                    await window.api.hullSetQuotationHullAdditionalConditions(
                        quotation.id,
                        defaults.map(c => ({ hullAdditionalConditionId: c.id }))
                    )
                    const fresh = await window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
                    setQAdditional(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        } else if (safeExistAdd.length > 0) {
            addDefaultsApplied.current = true
        }
    }

    // Derived: which vessels have overrides
    const multiVessel = qVessels.length >= 2
    const vesselIdsWithOverrides = useMemo(() => {
        const ids = new Set<string>()
        for (const a of alternatives) {
            if (a.vesselScopeId) ids.add(a.vesselScopeId)
        }
        return ids
    }, [alternatives])
    const sharedAlternatives = useMemo(() => alternatives.filter(a => !a.vesselScopeId), [alternatives])

    // Vessels available for adding an override (don't already have one)
    const vesselsWithoutOverrides = useMemo(
        () => qVessels.filter(v => !vesselIdsWithOverrides.has(v.id)),
        [qVessels, vesselIdsWithOverrides]
    )

    // Copy shared alternatives + conditions to a specific vessel
    const handleCopyFromShared = async (vesselId: string) => {
        const hmClauses = hullClauses.filter(c => c.conditionSection !== 'iv')
        if (hmClauses.length === 0) return
        const sharedAlts = alternatives.filter(a => !a.vesselScopeId)
        if (sharedAlts.length === 0) {
            // No shared alts to copy; create a fresh one
            await handleStartFresh(vesselId)
            return
        }
        try {
            const newAlts: QuotationHullAlternative[] = []
            for (const srcAlt of sharedAlts) {
                const newAlt = await window.api.hullAddQuotationAlternative(
                    quotation.id, srcAlt.hullClauseId, srcAlt.label, vesselId
                )
                if (newAlt && !(newAlt as any).error) {
                    newAlts.push(newAlt)
                    // Clone conditions for this alternative
                    const altConds = qConditions.filter(c => c.alternativeId === srcAlt.id)
                    if (altConds.length > 0) {
                        const clonedConds = [
                            ...qConditions.map(mapCondForSave),
                            ...altConds.map(c => ({
                                ...mapCondForSave(c),
                                alternativeId: newAlt.id
                            }))
                        ]
                        await window.api.hullSetQuotationHullConditions(quotation.id, clonedConds)
                    }
                }
            }
            // Refresh all data
            const [freshAlts, freshCond, freshAdd] = await Promise.all([
                window.api.hullGetQuotationAlternatives(quotation.id),
                window.api.hullGetQuotationHullConditions(quotation.id),
                window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
            ])
            setAlternatives(Array.isArray(freshAlts) ? freshAlts : [])
            setQConditions(Array.isArray(freshCond) ? freshCond : [])
            setQAdditional(Array.isArray(freshAdd) ? freshAdd : [])
            setSelectedVesselScope(vesselId)
            showSuccess('Copied shared conditions to vessel override')
        } catch (err: any) {
            showError(err.message || 'Failed to copy from shared')
        }
    }

    // Start fresh: create an empty alternative for a vessel
    const handleStartFresh = async (vesselId: string) => {
        const hmClauses = hullClauses.filter(c => c.conditionSection !== 'iv')
        if (hmClauses.length === 0) return
        try {
            const newAlt = await window.api.hullAddQuotationAlternative(
                quotation.id, hmClauses[0].id, undefined, vesselId
            )
            if (newAlt && !(newAlt as any).error) {
                setAlternatives(prev => [...prev, newAlt])
                setSelectedVesselScope(vesselId)
            }
        } catch (err: any) {
            showError(err.message || 'Failed to create vessel override')
        }
    }

    // Remove all overrides for a vessel (falls back to shared)
    const handleRemoveOverride = async (vesselId: string) => {
        const vesselAlts = alternatives.filter(a => a.vesselScopeId === vesselId)
        try {
            for (const alt of vesselAlts) {
                await window.api.hullDeleteQuotationAlternative(alt.id)
            }
            const updated = alternatives.filter(a => a.vesselScopeId !== vesselId)
            setAlternatives(updated)
            setSelectedVesselScope(null) // go back to "All Vessels"
            // Refresh conditions
            const [freshCond, freshAdd] = await Promise.all([
                window.api.hullGetQuotationHullConditions(quotation.id),
                window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
            ])
            setQConditions(Array.isArray(freshCond) ? freshCond : [])
            setQAdditional(Array.isArray(freshAdd) ? freshAdd : [])
            showSuccess('Vessel override removed, using shared conditions')
        } catch (err: any) {
            showError(err.message || 'Failed to remove override')
        }
    }

    // Alternative management
    const addAlternative = async (vesselScopeId?: string | null) => {
        try {
            const newAlt = await window.api.hullAddQuotationAlternative(quotation.id, null, undefined, vesselScopeId)
            if (newAlt && !(newAlt as any).error) {
                const updated = [...alternatives, newAlt]
                setAlternatives(updated)
                // Clear hullClauseId when we have multiple shared alternatives
                if (updated.filter(a => !a.vesselScopeId).length > 1) {
                    try { updateField('hullClauseId', null) } catch {}
                }
            }
        } catch (err: any) {
            showError(err.message || 'Failed to add alternative')
        }
    }

    const removeAlternative = async (altId: string) => {
        const alt = alternatives.find(a => a.id === altId)
        // Each scope must keep at least one alternative
        if (alt?.vesselScopeId) {
            const vesselAlts = alternatives.filter(a => a.vesselScopeId === alt.vesselScopeId)
            if (vesselAlts.length <= 1) return
        } else {
            const sharedCount = alternatives.filter(a => !a.vesselScopeId).length
            if (sharedCount <= 1) return
        }
        try {
            await window.api.hullDeleteQuotationAlternative(altId)
            const updated = alternatives.filter(a => a.id !== altId)
            setAlternatives(updated)
            // Refresh conditions (some may have been deleted)
            const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
            setQConditions(Array.isArray(fresh) ? fresh : [])
            const freshAdd = await window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
            setQAdditional(Array.isArray(freshAdd) ? freshAdd : [])
            // If back to single shared alternative, sync hullClauseId
            const nonVesselAlts = updated.filter(a => !a.vesselScopeId)
            if (nonVesselAlts.length === 1) {
                try { updateField('hullClauseId', nonVesselAlts[0].hullClauseId) } catch {}
            }
        } catch (err: any) {
            showError(err.message || 'Failed to remove alternative')
        }
    }

    const changeAlternativeClause = async (altId: string, clauseId: string) => {
        try {
            await window.api.hullUpdateQuotationAlternative(altId, { hullClauseId: clauseId })
            setAlternatives(prev => prev.map(a => a.id === altId ? { ...a, hullClauseId: clauseId } : a))
            // If single shared alternative, sync to quotation
            const sharedCount = alternatives.filter(a => !a.vesselScopeId).length
            if (sharedCount === 1 && !alternatives.find(a => a.id === altId)?.vesselScopeId) {
                try { updateField('hullClauseId', clauseId) } catch {}
            }
            // Auto-select default conditions for the new clause
            const clauseConds = allConditions.filter(c => c.hullClauseId === clauseId)
            const defaults = clauseConds.filter(c => c.defaultSelected)
            if (defaults.length > 0) {
                const existingForAlt = qConditions.filter(c => c.alternativeId === altId)
                const existingCondIds = new Set(existingForAlt.map(c => c.hullConditionId))
                const toAdd = defaults.filter(c => !existingCondIds.has(c.id))
                if (toAdd.length > 0) {
                    const updated = [
                        ...qConditions,
                        ...toAdd.map(c => ({
                            id: '',
                            quotationId: quotation.id,
                            hullConditionId: c.id,
                            order: qConditions.length,
                            conditionSection: c.conditionSection || 'both',
                            alternativeId: altId
                        } as QuotationHullCondition))
                    ]
                    try {
                        await window.api.hullSetQuotationHullConditions(quotation.id, updated.map(mapCondForSave))
                        const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
                        setQConditions(Array.isArray(fresh) ? fresh : [])
                    } catch {}
                }
            }
        } catch {}
    }

    const handleIvClauseChange = async (clauseId: string) => {
        setSelectedIvClauseId(clauseId)
        try { updateField('ivClauseId', clauseId) } catch {}
    }

    // Clause conditions toggle — include amount and alternativeId in save
    const getCondSection = (condId: string) => allConditions.find(c => c.id === condId)?.conditionSection || 'both'

    // Per-alternative helpers for selectedIds, overrides, amounts, scopes
    const getAltConditions = (altId: string | null) => qConditions.filter(c => c.alternativeId === altId)
    const getAltSelectedIds = (altId: string | null) => new Set(getAltConditions(altId).map(c => c.hullConditionId))
    const getAltOverrides = (altId: string | null) => {
        const m: Record<string, string> = {}
        getAltConditions(altId).forEach(c => { if (c.textOverride) m[c.hullConditionId] = c.textOverride })
        return m
    }
    const getAltAmounts = (altId: string | null) => {
        const m: Record<string, number | undefined> = {}
        getAltConditions(altId).forEach(c => { if (c.amount != null) m[c.hullConditionId] = c.amount })
        return m
    }
    const getAltVesselAmounts = (altId: string | null) => {
        const m: Record<string, Record<string, number> | null> = {}
        getAltConditions(altId).forEach(c => { m[c.hullConditionId] = c.vesselAmounts || null })
        return m
    }
    const getAltScopes = (altId: string | null) => {
        const m: Record<string, string[] | null> = {}
        getAltConditions(altId).forEach(c => { if (c.vesselScope) m[c.hullConditionId] = c.vesselScope })
        return m
    }

    const mapCondForSave = (c: QuotationHullCondition) => ({
        hullConditionId: c.hullConditionId,
        textOverride: c.textOverride,
        conditionSection: c.conditionSection || getCondSection(c.hullConditionId),
        amount: c.amount,
        vesselAmounts: c.vesselAmounts,
        vesselScope: c.vesselScope,
        alternativeId: c.alternativeId
    })

    const toggleCondition = async (condId: string, alternativeId?: string | null) => {
        const altId = alternativeId || null
        const existing = qConditions.find(c => c.hullConditionId === condId && c.alternativeId === altId)
        let updated: typeof qConditions
        if (existing) {
            updated = qConditions.filter(c => !(c.hullConditionId === condId && c.alternativeId === altId))
        } else {
            updated = [
                ...qConditions,
                { id: '', quotationId: quotation.id, hullConditionId: condId, order: qConditions.length, conditionSection: getCondSection(condId), alternativeId: altId } as QuotationHullCondition
            ]
        }
        try {
            await window.api.hullSetQuotationHullConditions(quotation.id, updated.map(mapCondForSave))
            const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
            setQConditions(Array.isArray(fresh) ? fresh : [])
        } catch (err: any) {
            showError(err.message || 'Failed to update')
        }
    }

    const updateConditionOverride = (condId: string, text: string) => {
        setQConditions(prev => prev.map(c => c.hullConditionId === condId ? { ...c, textOverride: text || undefined } : c))
    }

    const updateConditionAmount = (condId: string, amount: number | undefined) => {
        setQConditions(prev => prev.map(c => c.hullConditionId === condId ? { ...c, amount } : c))
    }

    const updateConditionVesselAmount = (condId: string, vesselId: string, amount: number | undefined) => {
        setQConditions(prev => prev.map(c => {
            if (c.hullConditionId !== condId) return c
            const va = { ...(c.vesselAmounts || {}) }
            if (amount == null) {
                delete va[vesselId]
            } else {
                va[vesselId] = amount
            }
            // If all vessel amounts are the same, collapse to single amount
            const vals = Object.values(va)
            if (vals.length === qVessels.length && vals.length > 0 && vals.every(v => v === vals[0])) {
                return { ...c, amount: vals[0], vesselAmounts: null }
            }
            return { ...c, vesselAmounts: Object.keys(va).length > 0 ? va : null }
        }))
    }

    const saveConditionOverrides = async () => {
        try {
            await window.api.hullSetQuotationHullConditions(quotation.id, qConditions.map(mapCondForSave))
        } catch {}
    }

    const updateConditionScope = async (condId: string, scope: string[] | null) => {
        const updated = qConditions.map(c => c.hullConditionId === condId ? { ...c, vesselScope: scope } : c)
        try {
            await window.api.hullSetQuotationHullConditions(quotation.id, updated.map(mapCondForSave))
            const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
            setQConditions(Array.isArray(fresh) ? fresh : [])
        } catch {}
    }

    // Additional conditions toggle
    const selectedAddIds = new Set(qAdditional.map(c => c.hullAdditionalConditionId))
    const additionalScopes: Record<string, string[] | null> = {}
    const additionalOverrides: Record<string, string> = {}
    const additionalAmounts: Record<string, number | undefined> = {}
    qAdditional.forEach(c => {
        if (c.vesselScope) additionalScopes[c.hullAdditionalConditionId] = c.vesselScope
        if (c.textOverride) additionalOverrides[c.hullAdditionalConditionId] = c.textOverride
        if (c.amount != null) additionalAmounts[c.hullAdditionalConditionId] = c.amount
    })

    const mapAddForSave = (c: QuotationHullAdditionalCondition) => ({
        hullAdditionalConditionId: c.hullAdditionalConditionId,
        textOverride: c.textOverride,
        vesselScope: c.vesselScope,
        alternativeId: c.alternativeId,
        amount: c.amount
    })

    const toggleAdditional = async (addId: string) => {
        let updated: QuotationHullAdditionalCondition[]
        if (selectedAddIds.has(addId)) {
            updated = qAdditional.filter(c => c.hullAdditionalConditionId !== addId)
        } else {
            updated = [
                ...qAdditional,
                { id: '', quotationId: quotation.id, hullAdditionalConditionId: addId, order: qAdditional.length, alternativeId: null } as QuotationHullAdditionalCondition
            ]
        }
        try {
            await window.api.hullSetQuotationHullAdditionalConditions(quotation.id, updated.map(mapAddForSave))
            const fresh = await window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
            setQAdditional(Array.isArray(fresh) ? fresh : [])
        } catch (err: any) {
            showError(err.message || 'Failed to update')
        }
    }

    const updateAdditionalOverride = (addId: string, text: string) => {
        setQAdditional(prev => prev.map(c => c.hullAdditionalConditionId === addId ? { ...c, textOverride: text || undefined } : c))
    }

    const saveAdditionalOverrides = async () => {
        try {
            await window.api.hullSetQuotationHullAdditionalConditions(quotation.id, qAdditional.map(mapAddForSave))
        } catch {}
    }

    const updateAdditionalAmount = async (addId: string, amount: number | null) => {
        const updated = qAdditional.map(c => c.hullAdditionalConditionId === addId ? { ...c, amount } : c)
        setQAdditional(updated)
        try {
            await window.api.hullSetQuotationHullAdditionalConditions(quotation.id, updated.map(mapAddForSave))
        } catch {}
    }

    const updateAdditionalScope = async (addId: string, scope: string[] | null) => {
        const updated = qAdditional.map(c => c.hullAdditionalConditionId === addId ? { ...c, vesselScope: scope } : c)
        try {
            await window.api.hullSetQuotationHullAdditionalConditions(quotation.id, updated.map(mapAddForSave))
            const fresh = await window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
            setQAdditional(Array.isArray(fresh) ? fresh : [])
        } catch {}
    }

    // Derived data
    const hmClauses = hullClauses.filter(c => c.conditionSection !== 'iv')
    const ivClauses = hullClauses.filter(c => c.conditionSection === 'iv')
    const selectedIvClause = hullClauses.find(c => c.id === selectedIvClauseId)

    // Get alternatives for the current vessel scope view
    const visibleAlternatives = useMemo(() => {
        if (selectedVesselScope === null) {
            return alternatives.filter(a => !a.vesselScopeId)
        }
        return alternatives.filter(a => a.vesselScopeId === selectedVesselScope)
    }, [alternatives, selectedVesselScope])

    const multiAlt = visibleAlternatives.length > 1

    // Build condition items with amount inputs
    const buildCondItems = (conds: HullClauseCondition[]) => conds.map(c => ({
        id: c.id,
        label: `Cl. ${c.conditionNumber}`,
        text: c.text,
        hasAmount: c.hasAmount,
        amountPlaceholder: c.amountPlaceholder
    }))

    // Get all alternative clause IDs + IV for filtering additional conditions
    const allAltClauseIds = alternatives.map(a => a.hullClauseId)
    const allRelevantClauseIds = [...allAltClauseIds, ...(quotation.ivEnabled && selectedIvClauseId ? [selectedIvClauseId] : [])]
    const filteredAdditional = allAdditional.filter(ac =>
        !ac.hullClauseIds || ac.hullClauseIds.length === 0 ||
        ac.hullClauseIds.some(id => allRelevantClauseIds.includes(id))
    )

    const handleSyncFromSettings = async () => {
        // Add new default conditions/additional from settings that aren't already in this quotation
        const existingCondIds = new Set(qConditions.map(c => c.hullConditionId))
        const existingAddIds = new Set(qAdditional.map(a => a.hullAdditionalConditionId))
        const newConds = allConditions.filter(c => c.defaultSelected && !existingCondIds.has(c.id))
        const newAdds = allAdditional.filter(a => a.defaultSelected && !existingAddIds.has(a.id))
        if (newConds.length === 0 && newAdds.length === 0) {
            showError('No new default items to add from settings')
            return
        }
        try {
            if (newConds.length > 0) {
                const merged = [...qConditions.map(c => ({
                    hullConditionId: c.hullConditionId,
                    conditionSection: c.conditionSection || 'both',
                    textOverride: c.textOverride,
                    amount: c.amount,
                    vesselAmounts: c.vesselAmounts,
                    vesselScope: c.vesselScope,
                    alternativeId: c.alternativeId
                })), ...newConds.map((c: any) => ({
                    hullConditionId: c.id,
                    conditionSection: c.conditionSection || 'both',
                    alternativeId: visibleAlternatives[0]?.id || null
                }))]
                await window.api.hullSetQuotationHullConditions(quotation.id, merged)
            }
            if (newAdds.length > 0) {
                const merged = [...qAdditional.map(a => ({
                    hullAdditionalConditionId: a.hullAdditionalConditionId,
                    textOverride: a.textOverride,
                    vesselScope: a.vesselScope,
                    alternativeId: a.alternativeId,
                    amount: a.amount
                })), ...newAdds.map(a => ({
                    hullAdditionalConditionId: a.id
                }))]
                await window.api.hullSetQuotationHullAdditionalConditions(quotation.id, merged)
            }
            await loadData()
            showSuccess?.(`Added ${newConds.length} conditions and ${newAdds.length} additional conditions from settings`)
        } catch (err: any) {
            showError(err.message || 'Failed to sync from settings')
        }
    }

    // Render a set of alternatives (used both in shared and per-vessel views)
    const renderAlternatives = (alts: QuotationHullAlternative[], _vesselScopeId?: string | null) => {
        const isMulti = alts.length > 1
        // For vessel-scoped overrides, only show that vessel in per-vessel deductible inputs
        const scopedVessels = _vesselScopeId ? qVessels.filter(v => v.id === _vesselScopeId) : qVessels
        return (
            <>
                {alts.map((alt, idx) => {
                    const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                    const clauseConditions = allConditions.filter(c => c.hullClauseId === alt.hullClauseId)
                    const altLabel = isMulti ? `Alternative ${idx + 1}` : (quotation.ivEnabled ? 'Section A — Hull and Machinery' : '')
                    const accentColor = isMulti ? ALT_COLORS[idx % ALT_COLORS.length] : 'transparent'

                    return (
                        <div key={alt.id} style={{
                            marginBottom: isMulti ? '16px' : '0',
                            borderLeft: isMulti ? `3px solid ${accentColor}` : 'none',
                            paddingLeft: isMulti ? '16px' : '0',
                            borderRadius: isMulti ? '2px' : '0'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <div style={{
                                    fontSize: isMulti ? '0.88rem' : '0.78rem',
                                    color: isMulti ? accentColor : 'var(--text-secondary)',
                                    fontWeight: 600
                                }}>{altLabel}</div>
                                {isMulti && clause && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                        {clause.code || clause.name}
                                    </span>
                                )}
                                <div style={{ flex: 1 }} />
                                {isMulti && (
                                    <button
                                        onClick={() => removeAlternative(alt.id)}
                                        style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                                        title="Remove alternative"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                            <HullClauseDropdown
                                clauses={quotation.ivEnabled ? hmClauses : hullClauses}
                                selectedId={alt.hullClauseId}
                                onChange={(clauseId) => changeAlternativeClause(alt.id, clauseId)}
                                description={clause?.description}
                                hideLabel={isMulti}
                            />

                            {alt.hullClauseId && (
                                <HullConditionPicker
                                    label={isMulti ? `Alternative ${idx + 1} Conditions` : (quotation.ivEnabled ? 'Section A Conditions' : 'Clause Conditions')}
                                    items={buildCondItems(clauseConditions)}
                                    selectedIds={getAltSelectedIds(alt.id)}
                                    onToggle={(condId) => toggleCondition(condId, alt.id)}
                                    overrides={getAltOverrides(alt.id)}
                                    onOverrideChange={updateConditionOverride}
                                    onOverrideBlur={saveConditionOverrides}
                                    scopes={getAltScopes(alt.id)}
                                    onScopeChange={updateConditionScope}
                                    vessels={scopedVessels}
                                    emptyText="No conditions defined for this clause. Add them in Quotation Settings → Hull Clauses."
                                    amounts={getAltAmounts(alt.id)}
                                    onAmountChange={updateConditionAmount}
                                    onAmountBlur={saveConditionOverrides}
                                    allConditions={allConditions}
                                    vesselAmountsMap={getAltVesselAmounts(alt.id)}
                                    onVesselAmountChange={updateConditionVesselAmount}
                                    onVesselAmountBlur={saveConditionOverrides}
                                />
                            )}
                        </div>
                    )
                })}

                {/* Add Alternative button moved to top toolbar */}
            </>
        )
    }

    // Check if the currently selected vessel scope has no overrides (empty state)
    const isVesselEmptyState = selectedVesselScope !== null && visibleAlternatives.length === 0
    const isSharedEmptyState = selectedVesselScope === null && visibleAlternatives.length === 0

    return (
        <>
        <div className="glass-card" style={{ padding: '16px', position: 'relative', zIndex: 2 }}>
            {qVessels.length >= 2 && (
                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px 12px',
                    padding: '8px 14px',
                    marginBottom: '2px',
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)'
                }}>
                    {qVessels.map(v => (
                        <span key={v.id}>
                            <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{v.vesselLabel}</span>
                            {' '}{(v.name || v.vesselLabel).toUpperCase()}
                        </span>
                    ))}
                </div>
            )}
            {/* Sub-tab bar */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', borderBottom: '2px solid var(--table-border)', paddingBottom: '0' }}>
                <button onClick={() => setHullSubTab('conditions')} style={{ padding: '8px 16px', fontSize: '0.86rem', fontWeight: 600, border: 'none', borderBottom: hullSubTab === 'conditions' ? '2px solid var(--accent-primary)' : '2px solid transparent', background: 'transparent', color: hullSubTab === 'conditions' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', marginBottom: '-2px' }}>
                    Conditions
                </button>
                <button onClick={() => setHullSubTab('additional')} style={{ padding: '8px 16px', fontSize: '0.86rem', fontWeight: 600, border: 'none', borderBottom: hullSubTab === 'additional' ? '2px solid var(--accent-primary)' : '2px solid transparent', background: 'transparent', color: hullSubTab === 'additional' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', marginBottom: '-2px' }}>
                    Additional Conditions <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)', marginLeft: '4px' }}>{filteredAdditional.filter(ac => selectedAddIds.has(ac.id)).length}</span>
                </button>
                <button onClick={() => setHullSubTab('custom')} style={{ padding: '8px 16px', fontSize: '0.86rem', fontWeight: 600, border: 'none', borderBottom: hullSubTab === 'custom' ? '2px solid var(--accent-primary)' : '2px solid transparent', background: 'transparent', color: hullSubTab === 'custom' ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', marginBottom: '-2px' }}>
                    Custom <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '10px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)', marginLeft: '4px' }}>{customConditions.length}</span>
                </button>
            </div>

            <div style={{ display: hullSubTab !== 'conditions' ? 'none' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <h3 style={{ marginBottom: '14px', fontSize: '1rem' }}>Hull Conditions</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button
                        onClick={handleSyncFromSettings}
                        className="btn-secondary"
                        style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                        title="Add new default items from settings without replacing existing selections"
                    >
                        <RefreshCw size={12} /> Sync from Settings
                    </button>
                    {!isSharedEmptyState && visibleAlternatives.length > 0 && (
                        <button
                            onClick={() => addAlternative(selectedVesselScope)}
                            className="btn-primary"
                            style={{ padding: '4px 12px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            title="Add another hull clause alternative"
                        >
                            <Plus size={12} /> Add Alternative
                        </button>
                    )}
                </div>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                {selectedVesselScope !== null
                    ? 'Vessel-specific conditions override the shared defaults below.'
                    : `Select hull clause${multiAlt ? ' alternatives' : ''}, configure clause conditions, and additional conditions.${multiVessel ? ' These apply to all vessels unless overridden.' : ''}`}
            </p>

            {/* Top-level vessel scope tabs (only when 2+ vessels) */}
            {multiVessel && (
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* All Vessels tab */}
                    <button
                        onClick={() => setSelectedVesselScope(null)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: selectedVesselScope === null ? '2px solid var(--accent)' : '1px solid var(--input-border)',
                            background: selectedVesselScope === null ? 'rgba(0,170,200,0.1)' : 'transparent',
                            color: selectedVesselScope === null ? 'var(--accent)' : 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: selectedVesselScope === null ? 600 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <Users size={13} />
                        <span>All Vessels</span>
                    </button>

                    {/* Per-vessel override tabs */}
                    {qVessels.filter(v => vesselIdsWithOverrides.has(v.id)).map((v, idx) => {
                        const isActive = selectedVesselScope === v.id
                        const vesselAlts = alternatives.filter(a => a.vesselScopeId === v.id)
                        const vesselClause = vesselAlts[0] ? hullClauses.find(c => c.id === vesselAlts[0].hullClauseId) : null
                        const color = ALT_COLORS[(idx + 1) % ALT_COLORS.length]
                        return (
                            <button
                                key={v.id}
                                onClick={() => setSelectedVesselScope(v.id)}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '6px',
                                    border: isActive ? `2px solid ${color}` : '1px solid var(--input-border)',
                                    background: isActive ? `${color}18` : 'transparent',
                                    color: isActive ? color : 'var(--text-primary)',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: isActive ? 600 : 400,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'flex-start',
                                    gap: '2px'
                                }}
                            >
                                <span>{(v.name || v.vesselLabel).toUpperCase()}</span>
                                {vesselClause && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                        {vesselClause.code || vesselClause.name}
                                    </span>
                                )}
                            </button>
                        )
                    })}

                    {/* Add Vessel Override dropdown */}
                    {vesselsWithoutOverrides.length > 0 && (
                        <div ref={addOverrideRef} style={{ position: 'relative', display: 'inline-block' }}>
                            <button
                                onClick={() => setAddOverrideOpen(!addOverrideOpen)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px dashed var(--input-border)',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '0.78rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                                title="Add vessel-specific override"
                            >
                                <Plus size={13} /> Add Vessel Override
                            </button>
                            {addOverrideOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    zIndex: 9999,
                                    marginTop: '4px',
                                    minWidth: '200px',
                                    maxHeight: '260px',
                                    overflowY: 'auto',
                                    borderRadius: '8px',
                                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
                                    background: isLight ? '#ffffff' : '#1a1d28',
                                    boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.5)'
                                }}>
                                    {vesselsWithoutOverrides.map(v => (
                                        <div
                                            key={v.id}
                                            onClick={() => {
                                                setAddOverrideOpen(false)
                                                setSelectedVesselScope(v.id)
                                            }}
                                            style={{
                                                padding: '8px 14px',
                                                fontSize: '0.82rem',
                                                cursor: 'pointer',
                                                color: isLight ? '#1c1e21' : '#e8e8e8',
                                                borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}`
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                        >
                                            <Ship size={12} style={{ marginRight: '6px', opacity: 0.6 }} />
                                            {(v.name || v.vesselLabel).toUpperCase()}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Vessel override empty state */}
            {isVesselEmptyState && (
                <div style={{
                    padding: '32px 24px',
                    textAlign: 'center',
                    borderRadius: '10px',
                    border: '1px dashed var(--input-border)',
                    background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                    marginBottom: '16px'
                }}>
                    <Ship size={28} style={{ color: 'var(--text-secondary)', opacity: 0.4, marginBottom: '12px' }} />
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '6px' }}>
                        {(qVessels.find(v => v.id === selectedVesselScope)?.name || qVessels.find(v => v.id === selectedVesselScope)?.vesselLabel || 'This vessel').toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                        This vessel uses shared conditions. Create an override to customise.
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                            onClick={() => handleCopyFromShared(selectedVesselScope!)}
                            className="btn-primary"
                            style={{ padding: '6px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <GitBranch size={14} /> Copy from shared
                        </button>
                        <button
                            onClick={() => handleStartFresh(selectedVesselScope!)}
                            className="btn-secondary"
                            style={{ padding: '6px 16px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Plus size={14} /> Start fresh
                        </button>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '12px', fontStyle: 'italic' }}>
                        Or select "All Vessels" to modify shared conditions.
                    </div>
                </div>
            )}

            {/* Override controls (shown when viewing a vessel that has overrides) */}
            {selectedVesselScope !== null && visibleAlternatives.length > 0 && (() => {
                const includeInShared = visibleAlternatives[0]?.includeInShared !== false
                const handleToggleIncludeInShared = async () => {
                    const newVal = !includeInShared
                    const vesselAlts = alternatives.filter(a => a.vesselScopeId === selectedVesselScope)
                    for (const alt of vesselAlts) {
                        try { await window.api.hullUpdateQuotationAlternative(alt.id, { includeInShared: newVal }) } catch {}
                    }
                    setAlternatives(prev => prev.map(a => a.vesselScopeId === selectedVesselScope ? { ...a, includeInShared: newVal } : a))
                }
                return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        {/* Include in shared toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                            <div
                                onClick={handleToggleIncludeInShared}
                                style={{
                                    width: '32px',
                                    height: '18px',
                                    borderRadius: '9px',
                                    background: includeInShared ? 'var(--accent-primary)' : (isLight ? '#ccc' : '#444'),
                                    position: 'relative',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                    flexShrink: 0
                                }}
                            >
                                <div style={{
                                    position: 'absolute',
                                    top: '2px',
                                    left: includeInShared ? '16px' : '2px',
                                    width: '14px',
                                    height: '14px',
                                    borderRadius: '50%',
                                    background: '#fff',
                                    transition: 'left 0.15s'
                                }} />
                            </div>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                Also include in shared conditions
                            </span>
                        </label>
                        {/* Remove override button */}
                        <button
                            onClick={() => handleRemoveOverride(selectedVesselScope)}
                            style={{
                                background: 'none',
                                border: '1px solid var(--input-border)',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                cursor: 'pointer',
                                color: 'var(--danger)',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="Remove this vessel override and fall back to shared conditions"
                        >
                            <Trash2 size={12} /> Remove Override (use shared)
                        </button>
                    </div>
                )
            })()}

            {/* Alternatives for the current scope */}
            {isSharedEmptyState && (
                <div style={{
                    padding: '32px 24px',
                    borderRadius: '10px',
                    border: '1px dashed var(--input-border)',
                    background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                    marginBottom: '16px'
                }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>No hull clause selected</p>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Select a hull clause to configure conditions for this quotation.</p>
                    <HullClauseDropdown
                        clauses={quotation.ivEnabled ? hmClauses : hullClauses}
                        selectedId=""
                        hideLabel
                        onChange={async (clauseId) => {
                            try {
                                const newAlt = await window.api.hullAddQuotationAlternative(quotation.id, clauseId)
                                if (newAlt && !(newAlt as any).error) {
                                    setAlternatives([newAlt])
                                    try { updateField('hullClauseId', clauseId) } catch {}
                                    // Auto-select default conditions for this clause, scoped to the new alternative
                                    // Replace any existing null-scoped conditions (from prior auto-apply) with alt-scoped ones
                                    const clauseConds = allConditions.filter(c => c.hullClauseId === clauseId && c.defaultSelected)
                                    const newConds = clauseConds.map(c => ({
                                        hullConditionId: c.id,
                                        alternativeId: newAlt.id,
                                        conditionSection: c.conditionSection || 'both',
                                        textOverride: undefined,
                                        amount: undefined,
                                        vesselScope: null,
                                        vesselAmounts: null
                                    }))
                                    // Save ONLY alt-scoped conditions, dropping any orphaned null-scoped defaults
                                    await window.api.hullSetQuotationHullConditions(quotation.id, newConds)
                                    const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
                                    setQConditions(Array.isArray(fresh) ? fresh : [])
                                }
                            } catch {}
                        }}
                    />
                </div>
            )}

            {!isVesselEmptyState && !isSharedEmptyState && renderAlternatives(visibleAlternatives, selectedVesselScope)}

            {/* IV Clause Selector (only when IV enabled, and viewing shared or single vessel) */}
            {!isVesselEmptyState && !isSharedEmptyState && quotation.ivEnabled && ivClauses.length > 0 && selectedVesselScope === null && (
                <>
                    {multiAlt && <div style={{ borderTop: '1px solid var(--table-border)', margin: '8px 0 16px' }} />}
                    <div style={{
                        borderLeft: quotation.ivEnabled ? '3px solid #ffb020' : 'none',
                        paddingLeft: quotation.ivEnabled ? '16px' : '0'
                    }}>
                        <div style={{ marginBottom: '6px', fontSize: multiAlt ? '0.88rem' : '0.78rem', color: multiAlt ? '#ffb020' : 'var(--text-secondary)', fontWeight: 600 }}>
                            {multiAlt ? 'Increased Value' : 'Section B — Increased Value'}
                        </div>
                        <HullClauseDropdown
                            clauses={ivClauses}
                            selectedId={selectedIvClauseId}
                            onChange={handleIvClauseChange}
                            description={selectedIvClause?.description}
                        />

                        {selectedIvClauseId && (
                            <HullConditionPicker
                                label={multiAlt ? 'IV Conditions' : 'Section B Conditions'}
                                items={buildCondItems(allConditions.filter(c => c.hullClauseId === selectedIvClauseId))}
                                selectedIds={getAltSelectedIds(null)}
                                onToggle={(condId) => toggleCondition(condId, null)}
                                overrides={getAltOverrides(null)}
                                onOverrideChange={updateConditionOverride}
                                onOverrideBlur={saveConditionOverrides}
                                scopes={getAltScopes(null)}
                                onScopeChange={updateConditionScope}
                                vessels={qVessels}
                                emptyText="No conditions defined for this clause. Add them in Quotation Settings → Hull Clauses."
                                amounts={getAltAmounts(null)}
                                onAmountChange={updateConditionAmount}
                                onAmountBlur={saveConditionOverrides}
                                allConditions={allConditions}
                                vesselAmountsMap={getAltVesselAmounts(null)}
                                onVesselAmountChange={updateConditionVesselAmount}
                                onVesselAmountBlur={saveConditionOverrides}
                            />
                        )}
                    </div>
                </>
            )}

            {/* Shared section at bottom (always visible when viewing a vessel override) */}
            {selectedVesselScope !== null && !isVesselEmptyState && !isSharedEmptyState && sharedAlternatives.length > 0 && (
                <>
                    <div style={{
                        borderTop: `2px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                        margin: '16px 0',
                        position: 'relative'
                    }}>
                        <span style={{
                            position: 'absolute',
                            top: '-10px',
                            left: '16px',
                            background: isLight ? '#f4f6fb' : 'var(--bg-primary)',
                            padding: '0 8px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Shared (all vessels & alternatives)
                        </span>
                    </div>
                    <div style={{ opacity: 0.7, pointerEvents: 'none', marginTop: '12px' }}>
                        {sharedAlternatives.map((alt, idx) => {
                            const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                            const clauseConditions = allConditions.filter(c => c.hullClauseId === alt.hullClauseId)
                            const selectedIds = getAltSelectedIds(alt.id)
                            const selectedConditions = clauseConditions.filter(c => selectedIds.has(c.id))
                            return (
                                <div key={alt.id} style={{ marginBottom: '8px' }}>
                                    {sharedAlternatives.length > 1 && (
                                        <div style={{ fontSize: '0.78rem', color: ALT_COLORS[idx % ALT_COLORS.length], fontWeight: 600, marginBottom: '4px' }}>
                                            Alt {idx + 1}: {clause?.code || clause?.name || ''}
                                        </div>
                                    )}
                                    {sharedAlternatives.length === 1 && clause && (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>
                                            {clause.code || clause.name}
                                        </div>
                                    )}
                                    {selectedConditions.map(c => (
                                        <div key={c.id} style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', paddingLeft: '8px', marginBottom: '2px' }}>
                                            Cl. {c.conditionNumber} — {c.text.substring(0, 60)}{c.text.length > 60 ? '...' : ''}
                                        </div>
                                    ))}
                                </div>
                            )
                        })}
                        {filteredAdditional.filter(ac => selectedAddIds.has(ac.id)).length > 0 && (
                            <div style={{ marginTop: '6px' }}>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>
                                    Additional Conditions
                                </div>
                                {filteredAdditional.filter(ac => selectedAddIds.has(ac.id)).map(ac => (
                                    <div key={ac.id} style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', paddingLeft: '8px', marginBottom: '2px' }}>
                                        {ac.title || ac.text.substring(0, 60)}{!ac.title && ac.text.length > 60 ? '...' : ''}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div style={{ marginTop: '8px' }}>
                        <button
                            onClick={() => setSelectedVesselScope(null)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                padding: '2px 0',
                                textDecoration: 'underline'
                            }}
                        >
                            Edit shared conditions
                        </button>
                    </div>
                </>
            )}
            </div>
        {/* Additional Conditions — sub-tab */}
        {hullSubTab === 'additional' && (
            <div>
                <HullConditionPicker
                    label=""
                    items={filteredAdditional.map(ac => ({ id: ac.id, label: ac.title || '', text: ac.text, hasAmount: ac.hasAmount, amountPlaceholder: ac.amountPlaceholder }))}
                    selectedIds={selectedAddIds}
                    onToggle={toggleAdditional}
                    overrides={additionalOverrides}
                    onOverrideChange={updateAdditionalOverride}
                    onOverrideBlur={saveAdditionalOverrides}
                    scopes={additionalScopes}
                    onScopeChange={updateAdditionalScope}
                    vessels={qVessels}
                    emptyText="No additional conditions for the selected clause. Add them in Quotation Settings → Hull Additional Conditions."
                    amounts={additionalAmounts}
                    onAmountChange={(id, amount) => updateAdditionalAmount(id, amount ?? null)}
                    onAmountBlur={saveAdditionalOverrides}
                />
                {/* Reorder selected additional conditions */}
                {(() => {
                    const filteredAddIds = new Set(filteredAdditional.map(a => a.id))
                    const selectedItems = qAdditional
                        .filter(qa => filteredAddIds.has(qa.hullAdditionalConditionId))
                        .map(qa => {
                            const def = allAdditional.find(a => a.id === qa.hullAdditionalConditionId)
                            return { ...qa, title: def?.title || '', text: def?.text || '' }
                        })
                    if (selectedItems.length < 2) return null
                    return (
                        <div style={{ marginTop: '16px', borderTop: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`, paddingTop: '12px' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Export Order (drag to reorder)</label>
                            {selectedItems.map((item, idx) => (
                                <div key={item.hullAdditionalConditionId}
                                    draggable
                                    onDragStart={e => e.dataTransfer.setData('addl-idx', String(idx))}
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={async e => {
                                        e.preventDefault()
                                        const fromIdx = parseInt(e.dataTransfer.getData('addl-idx'))
                                        if (isNaN(fromIdx) || fromIdx === idx) return
                                        // Reorder within the filtered subset
                                        const reorderedFiltered = [...selectedItems]
                                        const [moved] = reorderedFiltered.splice(fromIdx, 1)
                                        reorderedFiltered.splice(idx, 0, moved)
                                        // Rebuild full array: keep non-filtered items in place, replace filtered items in new order
                                        const nonFiltered = qAdditional.filter(qa => !filteredAddIds.has(qa.hullAdditionalConditionId))
                                        const reordered = [...reorderedFiltered.map(r => qAdditional.find(qa => qa.hullAdditionalConditionId === r.hullAdditionalConditionId)!), ...nonFiltered]
                                        setQAdditional(reordered)
                                        await window.api.hullSetQuotationHullAdditionalConditions(quotation.id, reordered.map(mapAddForSave))
                                    }}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: '6px 10px', marginBottom: '4px', borderRadius: '6px',
                                        border: '1px solid var(--table-border)', cursor: 'grab',
                                        fontSize: '0.8rem', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'
                                    }}
                                >
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', cursor: 'grab' }}>⠿</span>
                                    <span style={{ fontWeight: 600, minWidth: '18px', color: 'var(--text-secondary)' }}>{idx + 1}.</span>
                                    <span style={{ flex: 1 }}>{item.title || item.text.substring(0, 80)}{!item.title && item.text.length > 80 ? '...' : ''}</span>
                                </div>
                            ))}
                        </div>
                    )
                })()}

            </div>
        )}

        {/* Custom Additional Conditions — sub-tab */}
        {hullSubTab === 'custom' && (
            <div>
                {/* Add new custom condition */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <textarea
                        value={newCustomText}
                        onChange={e => setNewCustomText(e.target.value)}
                        placeholder="Enter custom condition text..."
                        rows={2}
                        style={{ flex: 1, padding: '8px 10px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <button
                        className="btn-primary"
                        disabled={!newCustomText.trim()}
                        onClick={async () => {
                            if (!newCustomText.trim()) return
                            try {
                                await window.api.hullAddQuotationCustomCondition({ quotationId: quotation.id, text: newCustomText.trim() })
                                setNewCustomText('')
                                const fresh = await window.api.hullGetQuotationCustomConditions(quotation.id)
                                setCustomConditions(Array.isArray(fresh) ? fresh : [])
                            } catch {}
                        }}
                        style={{ padding: '8px 14px', fontSize: '0.82rem', alignSelf: 'flex-start' }}
                    >Add</button>
                </div>

                {/* List of custom conditions */}
                {customConditions.map((cc, idx) => (
                    <div key={cc.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', marginBottom: '6px', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--table-border)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, minWidth: '18px', paddingTop: '2px' }}>{idx + 1}.</span>
                        <textarea
                            defaultValue={cc.text}
                            onBlur={e => {
                                if (e.target.value !== cc.text) {
                                    window.api.hullUpdateQuotationCustomCondition(cc.id, { text: e.target.value })
                                    setCustomConditions(prev => prev.map(c => c.id === cc.id ? { ...c, text: e.target.value } : c))
                                }
                            }}
                            rows={2}
                            style={{ flex: 1, padding: '4px 8px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical' }}
                        />
                        <button
                            onClick={async () => {
                                await window.api.hullDeleteQuotationCustomCondition(cc.id)
                                setCustomConditions(prev => prev.filter(c => c.id !== cc.id))
                            }}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                        ><Trash2 size={14} /></button>
                    </div>
                ))}
                {customConditions.length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '4px 0' }}>No custom conditions added.</div>
                )}
            </div>
        )}
        </div>
        </>
    )
}
