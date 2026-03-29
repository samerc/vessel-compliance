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
    const isLight = theme === 'light'
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
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const bg = isLight ? '#ffffff' : '#1a1d28'
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    const selectedCount = selectedItems.length

    return (
        <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                {label}
            </label>

            {items.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--table-border)', borderRadius: '8px' }}>
                    {emptyText}
                </div>
            ) : (
                <>
                    {/* Dropdown selector */}
                    <div style={{ position: 'relative', marginBottom: selectedCount > 0 ? '12px' : 0 }}>
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(!dropdownOpen)}
                            style={{
                                width: '100%',
                                padding: '9px 14px',
                                borderRadius: '8px',
                                border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
                                background: bg,
                                color: isLight ? '#1c1e21' : '#e8e8e8',
                                cursor: 'pointer',
                                fontSize: '0.84rem',
                                textAlign: 'left',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}
                        >
                            <span>{selectedCount} of {items.length} selected</span>
                            <ChevronDown size={16} style={{ transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', color: 'var(--text-secondary)' }} />
                        </button>
                        {dropdownOpen && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setDropdownOpen(false)} />
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    marginTop: '4px',
                                    maxHeight: '320px',
                                    overflowY: 'auto',
                                    borderRadius: '8px',
                                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`,
                                    background: bg,
                                    zIndex: 999,
                                    boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.5)'
                                }}>
                                    {/* Select all / deselect all */}
                                    <div style={{
                                        padding: '8px 12px',
                                        borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                                        display: 'flex',
                                        gap: '8px',
                                        position: 'sticky',
                                        top: 0,
                                        background: bg,
                                        zIndex: 1
                                    }}>
                                        <button type="button" onClick={() => { items.forEach(i => { if (!selectedIds.has(i.id)) onToggle(i.id) }) }}
                                            style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: '6px', border: '1px solid var(--accent-primary)', background: 'rgba(0,170,200,0.08)', color: 'var(--accent-primary)', cursor: 'pointer' }}
                                        >Select All</button>
                                        <button type="button" onClick={() => { items.forEach(i => { if (selectedIds.has(i.id)) onToggle(i.id) }) }}
                                            style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: '6px', border: '1px solid var(--table-border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}
                                        >Deselect All</button>
                                    </div>
                                    {items.map(item => {
                                        const checked = selectedIds.has(item.id)
                                        return (
                                            <div
                                                key={item.id}
                                                onClick={() => onToggle(item.id)}
                                                style={{
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    gap: '10px',
                                                    alignItems: 'flex-start',
                                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                                    background: checked ? 'rgba(0, 170, 200, 0.06)' : 'transparent'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    readOnly
                                                    style={{ marginTop: '2px', width: '15px', height: '15px', accentColor: 'var(--accent-primary)', pointerEvents: 'none' }}
                                                />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    {item.label && <span style={{ fontWeight: 600, fontSize: '0.82rem', marginRight: '6px' }}>{item.label}</span>}
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{item.text.length > 120 ? item.text.slice(0, 120) + '...' : item.text}</span>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Selected items with overrides */}
                    {selectedItems.map(item => (
                        <div key={item.id} style={{
                            marginBottom: '6px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: '1px solid rgba(0, 170, 200, 0.25)',
                            background: 'rgba(0, 170, 200, 0.04)'
                        }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <button type="button" onClick={() => onToggle(item.id)} title="Remove"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', marginTop: '1px' }}
                                ><X size={14} /></button>
                                <div style={{ flex: 1 }}>
                                    {item.label && <span style={{ fontWeight: 600, fontSize: '0.85rem', marginRight: '8px' }}>{item.label}</span>}
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{item.text}</span>
                                    <div style={{ marginTop: '8px' }}>
                                        <textarea
                                            value={overrides[item.id] || ''}
                                            onChange={e => onOverrideChange(item.id, e.target.value)}
                                            onBlur={onOverrideBlur}
                                            placeholder="Override text (optional)..."
                                            rows={2}
                                            style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', fontSize: '0.82rem', resize: 'vertical', fontFamily: 'inherit' }}
                                        />
                                        {item.hasAmount && amounts && onAmountChange && onAmountBlur && (
                                            vessels.length >= 2 && vesselAmountsMap && onVesselAmountChange && onVesselAmountBlur && !scopes[item.id] ? (
                                                <div style={{ marginTop: '6px' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{item.amountPlaceholder || 'Amount'} (per vessel):</span>
                                                    {vessels.map(v => {
                                                        const va = vesselAmountsMap[item.id]
                                                        const perVesselVal = va ? va[v.id] : undefined
                                                        const displayVal = perVesselVal ?? amounts[item.id] ?? ''
                                                        return (
                                                            <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(v.name || v.vesselLabel).toUpperCase()}>
                                                                    {(v.name || v.vesselLabel).toUpperCase()}
                                                                </span>
                                                                <input
                                                                    type="number"
                                                                    value={displayVal}
                                                                    onChange={e => onVesselAmountChange(item.id, v.id, e.target.value ? Number(e.target.value) : undefined)}
                                                                    onBlur={onVesselAmountBlur}
                                                                    placeholder="0.00"
                                                                    style={{ width: '150px', padding: '4px 8px', borderRadius: '6px', fontSize: '0.82rem' }}
                                                                />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{item.amountPlaceholder || 'Amount'}:</span>
                                                    <input
                                                        type="number"
                                                        value={amounts[item.id] ?? ''}
                                                        onChange={e => onAmountChange(item.id, e.target.value ? Number(e.target.value) : undefined)}
                                                        onBlur={onAmountBlur}
                                                        placeholder="0.00"
                                                        style={{ width: '150px', padding: '4px 8px', borderRadius: '6px', fontSize: '0.82rem' }}
                                                    />
                                                </div>
                                            )
                                        )}
                                        {vessels.length > 1 && (
                                            <div style={{ marginTop: '4px' }}>
                                                <VesselScopeChips
                                                    vessels={vessels}
                                                    vesselScope={scopes[item.id]}
                                                    onChange={scope => onScopeChange(item.id, scope)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
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
    const isLight = theme === 'light'
    const [hullClauses, setHullClauses] = useState<HullClause[]>([])
    const [allConditions, setAllConditions] = useState<HullClauseCondition[]>([])
    const [allAdditional, setAllAdditional] = useState<HullAdditionalCondition[]>([])
    const [alternatives, setAlternatives] = useState<QuotationHullAlternative[]>([])
    const [selectedIvClauseId, setSelectedIvClauseId] = useState<string>('')
    const [qConditions, setQConditions] = useState<QuotationHullCondition[]>([])
    const [qAdditional, setQAdditional] = useState<QuotationHullAdditionalCondition[]>([])
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
        const [clauses, conditions, additional, existCond, existAdd, qv, alts] = await Promise.all([
            window.api.hullGetClauses(),
            window.api.hullGetClauseConditions(),
            window.api.hullGetAdditionalConditions(),
            window.api.hullGetQuotationHullConditions(quotation.id),
            window.api.hullGetQuotationHullAdditionalConditions(quotation.id),
            window.api.getQuotationVessels(quotation.id),
            window.api.hullGetQuotationAlternatives(quotation.id)
        ])
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

        // Auto-apply default conditions when none exist yet
        if (safeExistCond.length === 0 && safeConds.length > 0 && !condDefaultsApplied.current) {
            condDefaultsApplied.current = true
            const defaults = safeConds.filter((c: any) => c.defaultSelected)
            if (defaults.length > 0) {
                try {
                    await window.api.hullSetQuotationHullConditions(
                        quotation.id,
                        defaults.map((c: any) => ({
                            hullConditionId: c.id,
                            conditionSection: c.conditionSection || 'both',
                            alternativeId: null
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
                    alternativeId: null
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
                                    vessels={qVessels}
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
        <div className="glass-card" style={{ padding: '24px', minHeight: '300px', position: 'relative', zIndex: 2 }}>
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

            {/* Remove Override button (shown when viewing a vessel that has overrides) */}
            {selectedVesselScope !== null && visibleAlternatives.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
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
            )}

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
                                    // Auto-select default conditions
                                    const clauseConds = allConditions.filter(c => c.hullClauseId === clauseId && c.defaultSelected)
                                    if (clauseConds.length > 0) {
                                        const newConds = clauseConds.map(c => ({
                                            hullConditionId: c.id,
                                            alternativeId: newAlt.id,
                                            textOverride: null,
                                            amount: null,
                                            vesselScope: null,
                                            vesselAmounts: null
                                        }))
                                        const updated = [...qConditions, ...newConds.map(c => ({ ...c, id: '', quotationId: quotation.id } as any))]
                                        await window.api.hullSetQuotationHullConditions(quotation.id, updated)
                                        setQConditions(updated)
                                    }
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

        {/* Additional Conditions — separate card */}
        {!isVesselEmptyState && !isSharedEmptyState && selectedVesselScope === null && (
            <div className="glass-card" style={{ padding: '24px', marginTop: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)' }}>
                    Additional Conditions
                </h4>
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
            </div>
        )}
        </>
    )
}
