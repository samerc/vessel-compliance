import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Users, Ship, Shield, FileText, Globe, AlertTriangle, DollarSign, Info, StickyNote, Scale, Anchor, Clock, CheckSquare, Ban, Download } from 'lucide-react'
import { Quotation, PolicyType, Vessel, PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIWarrantySet, PIDeductible, PIExclusion, PIAdditionalClause, PIAdditionalClauseSet, Entity, AssuredRole, QuotationAssured, QuotationDeductible, QuotationSubLimit, QuotationExcludedCountry, QuotationInstalment, QuotationNote, QuotationTextDeductible, QuotationCustomWarranty, PISectionTexts, PISanctionsVersion, InstalmentDefaults, QuotationVessel } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Save, Upload } from 'lucide-react'
import { exportQuotationToPDF, exportQuotationToWord } from '../services/QuotationExportService'
import { DEFAULT_SECTION_TEXTS } from './QuotationSettings'
import RichTextEditor from './RichTextEditor'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'

const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    sent: { bg: 'rgba(0, 150, 255, 0.15)', text: '#0096ff' },
    approved: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    rejected: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    converted: { bg: 'rgba(180, 100, 255, 0.15)', text: '#b464ff' }
}

type EditorTab = 'insured' | 'vessel' | 'liability' | 'conditions' | 'period' | 'trading' | 'warranties' | 'deductibles' | 'exclusions' | 'sanctions' | 'subjectivities' | 'premium' | 'information' | 'notes'

const tabs: { key: EditorTab; label: string; icon: any }[] = [
    { key: 'vessel', label: 'Vessel', icon: Ship },
    { key: 'insured', label: 'Insured', icon: Users },
    { key: 'liability', label: 'Limit of Liability', icon: Shield },
    { key: 'conditions', label: 'Conditions', icon: FileText },
    { key: 'period', label: 'Period', icon: Clock },
    { key: 'trading', label: 'Trading', icon: Globe },
    { key: 'warranties', label: 'Warranties', icon: CheckSquare },
    { key: 'deductibles', label: 'Deductibles', icon: Scale },
    { key: 'exclusions', label: 'Exclusions', icon: Ban },
    { key: 'sanctions', label: 'Sanctions', icon: AlertTriangle },
    { key: 'subjectivities', label: 'Subjectivities', icon: Anchor },
    { key: 'premium', label: 'Premium', icon: DollarSign },
    { key: 'information', label: 'Information', icon: Info },
    { key: 'notes', label: 'Notes', icon: StickyNote }
]

interface QuotationEditorProps {
    quotation: Quotation
    onBack: () => void
}

export default function QuotationEditor({ quotation, onBack }: QuotationEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('vessel')
    const [q, setQ] = useState<Quotation>(quotation)
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [globalTexts, setGlobalTexts] = useState<PISectionTexts>(DEFAULT_SECTION_TEXTS)
    const [sanctionsVersions, setSanctionsVersions] = useState<PISanctionsVersion[]>([])
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => {
        loadMasterData()
    }, [])

    const loadMasterData = async () => {
        const [pt, v, gt, sv] = await Promise.all([
            window.api.getPolicyTypes(),
            window.api.getVessels(),
            window.api.piGetSectionTexts(),
            window.api.piGetSanctionsVersions()
        ])
        setPolicyTypes(Array.isArray(pt) ? pt : [])
        setVessels(Array.isArray(v) ? v : [])
        if (gt && Object.keys(gt).length > 0) setGlobalTexts({ ...DEFAULT_SECTION_TEXTS, ...gt })
        setSanctionsVersions(sv)
    }

    const getEffectiveText = (key: keyof PISectionTexts): string => {
        return q.sectionTextsOverride?.[key] ?? globalTexts[key] ?? DEFAULT_SECTION_TEXTS[key] ?? ''
    }

    const updateSectionTextOverride = async (key: keyof PISectionTexts, value: string) => {
        const globalVal = globalTexts[key] ?? DEFAULT_SECTION_TEXTS[key] ?? ''
        const override = { ...(q.sectionTextsOverride || {}) }
        if (value === globalVal) {
            delete override[key]
        } else {
            override[key] = value
        }
        const cleaned = Object.keys(override).length > 0 ? override : undefined
        setQ(p => ({ ...p, sectionTextsOverride: cleaned }))
        await window.api.updateQuotation(q.id, { sectionTextsOverride: cleaned } as any)
    }

    const resetSectionText = async (key: keyof PISectionTexts) => {
        const override = { ...(q.sectionTextsOverride || {}) }
        delete override[key]
        const cleaned = Object.keys(override).length > 0 ? override : undefined
        setQ(p => ({ ...p, sectionTextsOverride: cleaned }))
        await window.api.updateQuotation(q.id, { sectionTextsOverride: cleaned } as any)
    }

    const updateField = async (field: string, value: any) => {
        try {
            await window.api.updateQuotation(q.id, { [field]: value } as any)
            setQ(prev => ({ ...prev, [field]: value }))
        } catch (err: any) {
            showError(err.message || 'Failed to update')
        }
    }

    const sc = statusColors[q.status] || statusColors.draft

    return (
        <div className="fade-in">
            <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <ArrowLeft size={18} /> Back to Quotations
            </button>

            {/* Header */}
            <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ref:</span>
                        <input
                            type="text"
                            value={q.referenceNumber || ''}
                            onChange={e => setQ(prev => ({ ...prev, referenceNumber: e.target.value }))}
                            onBlur={e => updateField('referenceNumber', e.target.value)}
                            placeholder="Reference number"
                            style={{ padding: '6px 10px', borderRadius: '6px', width: '180px', fontSize: '0.9rem', fontWeight: 600 }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Date:</span>
                        <input
                            type="date"
                            value={q.quotationDate || ''}
                            onChange={e => { setQ(prev => ({ ...prev, quotationDate: e.target.value })); updateField('quotationDate', e.target.value) }}
                            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Type:</span>
                        <select
                            value={q.policyTypeId || ''}
                            onChange={e => { setQ(prev => ({ ...prev, policyTypeId: e.target.value })); updateField('policyTypeId', e.target.value || null) }}
                            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                        >
                            <option value="">Select type</option>
                            {policyTypes.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Status:</span>
                        <select
                            value={q.status}
                            onChange={e => { const v = e.target.value as any; setQ(prev => ({ ...prev, status: v })); updateField('status', v) }}
                            style={{
                                padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem',
                                background: sc.bg, color: sc.text, border: '1px solid var(--glass-border)', fontWeight: 600
                            }}
                        >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                            <option value="converted">Converted</option>
                        </select>
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={q.isRenewal}
                            onChange={e => { setQ(prev => ({ ...prev, isRenewal: e.target.checked })); updateField('isRenewal', e.target.checked) }}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                        />
                        Renewal
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>Title:</span>
                        <input
                            type="text"
                            value={q.title || ''}
                            onChange={e => setQ(prev => ({ ...prev, title: e.target.value }))}
                            onBlur={e => updateField('title', e.target.value || null)}
                            placeholder="Auto from vessel/fleet name…"
                            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                        />
                    </div>
                    <button
                        onClick={async () => { try { await exportQuotationToPDF(q); showSuccess('PDF exported') } catch (err: any) { showError(err.message || 'PDF export failed') } }}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                    >
                        <Download size={16} /> PDF
                    </button>
                    <button
                        onClick={async () => { try { await exportQuotationToWord(q); showSuccess('Word exported') } catch (err: any) { showError(err.message || 'Word export failed') } }}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                    >
                        <Download size={16} /> Word
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {tabs.map(t => {
                    const Icon = t.icon
                    const active = activeTab === t.key
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px 8px 0 0',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: active ? '600' : '400',
                                background: active ? 'var(--bg-card)' : 'transparent',
                                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Icon size={14} /> {t.label}
                        </button>
                    )
                })}
            </div>

            {/* Tab Content */}
            <div className="glass-card" style={{ padding: '24px', minHeight: '300px' }}>
                {activeTab === 'insured' && <InsuredTab quotation={q} vessels={vessels} showSuccess={showSuccess} showError={showError} updateField={updateField} />}
                {activeTab === 'vessel' && <VesselTab quotation={q} vessels={vessels} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'liability' && <LiabilityTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'conditions' && <ConditionsTab quotation={q} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'period' && <PeriodTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'trading' && <TradingTab quotation={q} showSuccess={showSuccess} showError={showError} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} />}
                {activeTab === 'warranties' && <WarrantiesTab quotation={q} showSuccess={showSuccess} showError={showError} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} />}
                {activeTab === 'deductibles' && <DeductiblesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} updateField={updateField} setQ={setQ} />}
                {activeTab === 'exclusions' && <ExclusionsTab quotation={q} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'sanctions' && <SanctionsTab quotation={q} updateField={updateField} setQ={setQ} sanctionsVersions={sanctionsVersions} />}
                {activeTab === 'subjectivities' && <SubjectivitiesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'premium' && <PremiumTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} isLight={isLight} getEffectiveText={getEffectiveText} updateSectionTextOverride={updateSectionTextOverride} resetSectionText={resetSectionText} />}
                {activeTab === 'information' && <InformationTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'notes' && <NotesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            </div>
        </div>
    )
}

// ==================== Insured Tab ====================

function InsuredTab({ quotation, vessels = [], showSuccess, showError, updateField }: { quotation: Quotation; vessels?: Vessel[]; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void }) {
    const [assureds, setAssureds] = useState<QuotationAssured[]>([])
    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [newName, setNewName] = useState('')
    const [newRole, setNewRole] = useState('')
    const [newEntityId, setNewEntityId] = useState('')
    const [newVesselLabel, setNewVesselLabel] = useState('')
    const [showNewRoleInput, setShowNewRoleInput] = useState(false)
    const [newRoleName, setNewRoleName] = useState('')
    const [coInputValue, setCoInputValue] = useState(quotation.coName || '')
    const [showCoDropdown, setShowCoDropdown] = useState(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [a, r, e, qv] = await Promise.all([
            window.api.getQuotationAssureds(quotation.id),
            window.api.getAssuredRoles(),
            window.api.getEntities(),
            window.api.getQuotationVessels(quotation.id)
        ])
        setAssureds(Array.isArray(a) ? a : [])
        setRoles(Array.isArray(r) ? r : [])
        setEntities(Array.isArray(e) ? e : [])
        setQVessels(Array.isArray(qv) ? qv : [])
    }

    const handleAddAssured = async () => {
        if (!newName.trim()) return
        try {
            await window.api.addQuotationAssured({
                quotationId: quotation.id,
                entityId: newEntityId || undefined,
                name: newName,
                role: newRole || undefined,
                vesselLabel: newVesselLabel || undefined,
                order: assureds.length
            })
            setNewName(''); setNewRole(''); setNewEntityId(''); setNewVesselLabel('')
            showSuccess('Assured added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add assured') }
    }

    const handleCreateRole = async () => {
        if (!newRoleName.trim()) return
        try {
            const created = await window.api.addAssuredRole({ name: newRoleName.trim() })
            await loadData()
            setNewRole(created.name)
            setNewRoleName('')
            setShowNewRoleInput(false)
            showSuccess('Role created')
        } catch (err: any) { showError(err.message || 'Failed to create role') }
    }

    const handleDeleteAssured = async (id: string) => {
        await window.api.deleteQuotationAssured(id)
        showSuccess('Assured removed')
        loadData()
    }

    const handleUpdateVesselLabel = async (id: string, label: string) => {
        await window.api.updateQuotationAssured(id, { vesselLabel: label || undefined })
        loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...assureds]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setAssureds(newOrder)
        await window.api.reorderQuotationAssureds(newOrder.map(a => a.id))
    }

    const saveCoName = (val: string) => updateField('coName', val || null)

    const coFiltered = entities.filter(e =>
        coInputValue.length > 0 && e.name.toLowerCase().includes(coInputValue.toLowerCase())
    ).slice(0, 8)

    return (
        <div>
            {/* c/o Broker */}
            <h3 style={{ fontSize: '1rem', marginBottom: '10px' }}>C/O (Broker)</h3>
            <div style={{ position: 'relative', maxWidth: '420px', marginBottom: '28px' }}>
                <input
                    type="text"
                    value={coInputValue}
                    onChange={e => { setCoInputValue(e.target.value); setShowCoDropdown(true) }}
                    onBlur={() => { setTimeout(() => setShowCoDropdown(false), 150); saveCoName(coInputValue) }}
                    onFocus={() => { if (coInputValue) setShowCoDropdown(true) }}
                    placeholder="Broker / c/o — type to search entities or enter free text"
                    style={{ width: '100%', border: '1px solid var(--input-border)' }}
                />
                {showCoDropdown && coFiltered.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: '6px', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.2)', maxHeight: '200px', overflowY: 'auto' }}>
                        {coFiltered.map(e => (
                            <div
                                key={e.id}
                                onMouseDown={() => { setCoInputValue(e.name); setShowCoDropdown(false); saveCoName(e.name) }}
                                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)' }}
                                onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(0,210,255,0.08)')}
                                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}
                            >
                                {e.name} <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>({e.type})</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Assureds</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <select
                    value={newEntityId}
                    onChange={e => {
                        setNewEntityId(e.target.value)
                        const ent = entities.find(x => x.id === e.target.value)
                        if (ent) setNewName(ent.name)
                    }}
                    style={{ padding: '8px 12px', borderRadius: '8px', minWidth: '180px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                >
                    <option value="">Select entity or type manually</option>
                    {entities.map(e => <option key={e.id} value={e.id}>{e.name} ({e.type})</option>)}
                </select>
                <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Assured name"
                    style={{ flex: 1, minWidth: '160px' }}
                />
                {showNewRoleInput ? (
                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={newRoleName}
                            onChange={e => setNewRoleName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleCreateRole() }}
                            placeholder="New role name"
                            style={{ width: '140px', border: '1px solid var(--input-border)' }}
                            autoFocus
                        />
                        <button onClick={handleCreateRole} className="btn-primary" style={{ padding: '6px 10px', fontSize: '0.8rem' }}>Save</button>
                        <button onClick={() => { setShowNewRoleInput(false); setNewRoleName('') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}><X size={14} /></button>
                    </div>
                ) : (
                    <select
                        value={newRole}
                        onChange={e => { if (e.target.value === '__new__') { setShowNewRoleInput(true); setNewRole('') } else setNewRole(e.target.value) }}
                        style={{ padding: '8px 12px', borderRadius: '8px', minWidth: '140px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                    >
                        <option value="">Role</option>
                        {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                        <option value="__new__">+ Create new role…</option>
                    </select>
                )}
                {qVessels.length > 0 && (
                    <select
                        value={newVesselLabel}
                        onChange={e => setNewVesselLabel(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                    >
                        <option value="">All vessels</option>
                        {qVessels.map(v => <option key={v.id} value={v.vesselLabel}>{v.vesselLabel}</option>)}
                    </select>
                )}
                <button onClick={handleAddAssured} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>

            <div style={{ marginTop: '14px' }}>
                {qVessels.length > 1 ? (
                    // Grouped view: one section per vessel + unassigned
                    <>
                        {[...qVessels, null].map(qv => {
                            const label = qv?.vesselLabel || null
                            const group = label
                                ? assureds.filter(a => a.vesselLabel === label)
                                : assureds.filter(a => !a.vesselLabel)
                            if (group.length === 0 && label) return null
                            return (
                                <div key={label || 'unassigned'} style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', paddingBottom: '4px', borderBottom: '1px solid var(--table-border)' }}>
                                        {label ? `${label} — ${qv && vessels.find(v => v.id === qv.vesselId)?.name || qv?.name || label}` : 'All Vessels / Unassigned'}
                                    </div>
                                    {group.map(a => {
                                        const i = assureds.indexOf(a)
                                        return (
                                            <div key={a.id} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <select
                                                    value={a.vesselLabel || ''}
                                                    onChange={e => handleUpdateVesselLabel(a.id, e.target.value)}
                                                    style={{ padding: '3px 6px', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(0,210,255,0.3)', minWidth: '52px' }}
                                                >
                                                    <option value="">—</option>
                                                    {qVessels.map(v => <option key={v.id} value={v.vesselLabel}>{v.vesselLabel}</option>)}
                                                </select>
                                                <span style={{ fontWeight: 600, flex: 1 }}>{a.name}</span>
                                                {a.role && <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)' }}>{a.role}</span>}
                                                <div style={{ display: 'flex', gap: '2px' }}>
                                                    <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                                    <button onClick={() => handleMove(i, 'down')} disabled={i === assureds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === assureds.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                                    <button onClick={() => handleDeleteAssured(a.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )
                        })}
                    </>
                ) : (
                    // Flat view for single vessel
                    assureds.map((a, i) => (
                        <div key={a.id} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontWeight: 600, flex: 1 }}>{a.name}</span>
                            {a.role && <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)' }}>{a.role}</span>}
                            <div style={{ display: 'flex', gap: '2px' }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === assureds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === assureds.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => handleDeleteAssured(a.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))
                )}
                {assureds.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No assureds added yet. Add manually or go to the Vessel tab to import from a vessel.</p>}
            </div>
        </div>
    )
}

// ==================== Vessel Tab ====================

const EMPTY_NEW_VESSEL = { name: '', imoNumber: '', builtYear: '', grossTonnage: '', flag: '', vesselType: '', classification: '', callSign: '' }

function VesselTab({ quotation, vessels, showSuccess, showError }: { quotation: Quotation; vessels: Vessel[]; showSuccess: (m: string) => void; showError: (m: string) => void }) {
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [showAddForm, setShowAddForm] = useState(false)
    const [addMode, setAddMode] = useState<'existing' | 'new'>('existing')
    const [selectedVesselId, setSelectedVesselId] = useState('')
    const [newData, setNewData] = useState(EMPTY_NEW_VESSEL)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const qv = await window.api.getQuotationVessels(quotation.id)
        setQVessels(Array.isArray(qv) ? qv : [])
    }

    const nextLabel = (list: QuotationVessel[]) => `V${list.length + 1}`

    const handleAddExisting = async () => {
        if (!selectedVesselId) return
        try {
            const vLabel = nextLabel(qVessels)
            await window.api.addQuotationVessel({
                quotationId: quotation.id,
                vesselId: selectedVesselId,
                vesselLabel: vLabel,
                order: qVessels.length
            })

            // Auto-load vessel assureds into the quotation
            const [vassureds, allEntities, existingQAssureds] = await Promise.all([
                window.api.getVesselAssureds(selectedVesselId),
                window.api.getEntities(),
                window.api.getQuotationAssureds(quotation.id)
            ])
            const existingEntityIds = new Set(existingQAssureds.map(a => a.entityId).filter(Boolean))
            const toAdd = vassureds.filter(va => !existingEntityIds.has(va.entityId))
            for (let i = 0; i < toAdd.length; i++) {
                const va = toAdd[i]
                const entity = allEntities.find(e => e.id === va.entityId)
                if (entity) {
                    await window.api.addQuotationAssured({
                        quotationId: quotation.id,
                        entityId: va.entityId,
                        name: entity.name,
                        role: va.role || undefined,
                        vesselLabel: vLabel,
                        order: existingQAssureds.length + i
                    })
                }
            }

            setSelectedVesselId('')
            setShowAddForm(false)
            showSuccess(`Vessel added${toAdd.length > 0 ? ` — ${toAdd.length} assured(s) loaded` : ''}`)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add vessel') }
    }

    const handleAddNew = async () => {
        if (!newData.name.trim()) return
        try {
            await window.api.addQuotationVessel({
                quotationId: quotation.id,
                vesselLabel: nextLabel(qVessels),
                order: qVessels.length,
                name: newData.name,
                imoNumber: newData.imoNumber || undefined,
                builtYear: newData.builtYear ? parseInt(newData.builtYear) : undefined,
                grossTonnage: newData.grossTonnage ? parseFloat(newData.grossTonnage) : undefined,
                flag: newData.flag || undefined,
                vesselType: newData.vesselType || undefined,
                classification: newData.classification || undefined,
                callSign: newData.callSign || undefined
            })
            setNewData(EMPTY_NEW_VESSEL)
            setShowAddForm(false)
            showSuccess('Vessel added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add vessel') }
    }

    const handleDelete = async (id: string) => {
        await window.api.deleteQuotationVessel(id)
        showSuccess('Vessel removed')
        loadData()
    }

    const alreadyAdded = new Set(qVessels.map(v => v.vesselId).filter(Boolean) as string[])
    const availableVessels = vessels.filter(v => !alreadyAdded.has(v.id))

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Vessels ({qVessels.length})</h3>
                {!showAddForm && (
                    <button onClick={() => setShowAddForm(true)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                        <Plus size={14} /> Add Vessel
                    </button>
                )}
            </div>

            {showAddForm && (
                <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--glass-border)', marginBottom: '20px', background: 'rgba(0,210,255,0.03)' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <button onClick={() => setAddMode('existing')} className={addMode === 'existing' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>From Registry</button>
                        <button onClick={() => setAddMode('new')} className={addMode === 'new' ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.8rem', padding: '6px 14px' }}>New Vessel</button>
                    </div>
                    {addMode === 'existing' ? (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <select
                                value={selectedVesselId}
                                onChange={e => setSelectedVesselId(e.target.value)}
                                style={{ flex: 1, maxWidth: '400px', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                            >
                                <option value="">Select vessel from registry…</option>
                                {availableVessels.map(v => <option key={v.id} value={v.id}>{v.name} (IMO: {v.imoNumber})</option>)}
                            </select>
                            <button onClick={handleAddExisting} disabled={!selectedVesselId} className="btn-primary" style={{ fontSize: '0.82rem' }}>Add</button>
                            <button onClick={() => setShowAddForm(false)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                        </div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', maxWidth: '600px', marginBottom: '12px' }}>
                                {([
                                    ['name', 'Name *', 'text', true],
                                    ['imoNumber', 'IMO Number', 'text', false],
                                    ['builtYear', 'Built Year', 'number', false],
                                    ['grossTonnage', 'Gross Tonnage', 'number', false],
                                    ['flag', 'Flag', 'text', false],
                                    ['vesselType', 'Vessel Type', 'text', false],
                                    ['classification', 'Classification', 'text', false],
                                    ['callSign', 'Call Sign', 'text', false]
                                ] as [keyof typeof EMPTY_NEW_VESSEL, string, string, boolean][]).map(([field, label, type, upper]) => (
                                    <div key={field}>
                                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{label}</label>
                                        <input
                                            type={type}
                                            value={newData[field]}
                                            onChange={e => setNewData(p => ({ ...p, [field]: upper ? e.target.value.toUpperCase() : e.target.value }))}
                                            style={{ width: '100%', ...(upper ? { textTransform: 'uppercase' } : {}) }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleAddNew} className="btn-primary" style={{ fontSize: '0.82rem' }}>Add Vessel</button>
                                <button onClick={() => { setShowAddForm(false); setNewData(EMPTY_NEW_VESSEL) }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {qVessels.length === 0 && !showAddForm && (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No vessels added yet. Click "Add Vessel" to begin.</p>
            )}

            {qVessels.map(qv => {
                const reg = qv.vesselId ? vessels.find(v => v.id === qv.vesselId) : null
                const name = reg?.name || qv.name || '(unnamed)'
                const imo = reg?.imoNumber || qv.imoNumber
                const built = reg?.builtYear || qv.builtYear
                const gt = reg?.grossTonnage || qv.grossTonnage
                const vtype = reg?.vesselType || qv.vesselType
                const classif = reg?.classificationSociety || qv.classification
                return (
                    <div key={qv.id} style={{ padding: '14px 16px', borderRadius: '10px', border: '1px solid var(--table-border)', marginBottom: '10px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '38px', height: '38px', borderRadius: '8px', background: 'rgba(0,210,255,0.12)', color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.9rem', fontFamily: 'monospace', flexShrink: 0 }}>
                            {qv.vesselLabel}
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.95rem', textTransform: 'uppercase' }}>{name}</div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                                {imo && <span>IMO: {imo}</span>}
                                {built && <span>Built: {built}</span>}
                                {gt && <span>GT: {Number(gt).toLocaleString()}</span>}
                                {vtype && <span>Type: {vtype}</span>}
                                {classif && <span>Class: {classif}</span>}
                                {reg && <span style={{ color: 'var(--accent-primary)', fontSize: '0.7rem' }}>● From registry</span>}
                            </div>
                        </div>
                        <button onClick={() => handleDelete(qv.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', flexShrink: 0 }}><Trash2 size={16} /></button>
                    </div>
                )
            })}
        </div>
    )
}

// ==================== Limit of Liability Tab ====================

function LiabilityTab({ quotation, updateField, setQ, showSuccess }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void }) {
    const [subLimits, setSubLimits] = useState<QuotationSubLimit[]>([])
    const [templates, setTemplates] = useState<import('../../../shared/types').PISubLimitTemplate[]>([])
    const [newText, setNewText] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [newCurrency, setNewCurrency] = useState('USD')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [sl, tmpl] = await Promise.all([
            window.api.getQuotationSubLimits(quotation.id),
            window.api.piGetSubLimitTemplates()
        ])
        setSubLimits(sl)
        setTemplates(Array.isArray(tmpl) ? tmpl : [])
    }

    const handleAddSubLimit = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationSubLimit({ quotationId: quotation.id, text: newText, amount: parseFloat(newAmount) || 0, currency: newCurrency })
        setNewText(''); setNewAmount(''); setNewCurrency('USD')
        showSuccess('Sub-limit added')
        loadData()
    }

    const applyTemplate = (templateId: string) => {
        const t = templates.find(x => x.id === templateId)
        if (!t) return
        setNewText(t.textTemplate)
        setNewCurrency(t.defaultCurrency || 'USD')
        setNewAmount('')
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Limit of Liability</h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', maxWidth: '600px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Currency:</span>
                    <input type="text" value={quotation.limitOfLiabilityCurrency || 'USD'} onChange={e => { setQ(p => ({ ...p, limitOfLiabilityCurrency: e.target.value })) }} onBlur={e => updateField('limitOfLiabilityCurrency', e.target.value)} style={{ width: '70px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Amount:</span>
                    <input type="number" value={quotation.limitOfLiabilityAmount || ''} onChange={e => { setQ(p => ({ ...p, limitOfLiabilityAmount: parseFloat(e.target.value) || undefined })) }} onBlur={e => updateField('limitOfLiabilityAmount', parseFloat(e.target.value) || null)} style={{ width: '180px' }} />
                </div>
            </div>
            <div style={{ marginBottom: '24px', maxWidth: '600px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Full text (e.g. "USD 500,000,000 any one vessel any one accident or occurrence")</label>
                <textarea
                    value={quotation.limitOfLiabilityText || ''}
                    onChange={e => setQ(p => ({ ...p, limitOfLiabilityText: e.target.value }))}
                    onBlur={e => updateField('limitOfLiabilityText', e.target.value)}
                    style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                />
            </div>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Sub-Limits</h4>

            {templates.length > 0 && (
                <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>From template:</span>
                    <select
                        onChange={e => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = '' } }}
                        style={{ flex: 1, maxWidth: '420px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)', fontSize: '0.83rem' }}
                    >
                        <option value="">Pick a template…</option>
                        {templates.map(t => (
                            <option key={t.id} value={t.id}>{t.defaultCurrency} — {t.textTemplate}</option>
                        ))}
                    </select>
                </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Sub-limit description..." style={{ flex: 1, minWidth: '200px' }} />
                <input type="text" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} style={{ width: '70px' }} placeholder="USD" />
                <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Amount" style={{ width: '140px' }} />
                <button onClick={handleAddSubLimit} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>
            {subLimits.map(sl => (
                <div key={sl.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{sl.currency} {sl.amount.toLocaleString()} — {sl.text}</span>
                    <button onClick={async () => { await window.api.deleteQuotationSubLimit(sl.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
            ))}
        </div>
    )
}

// ==================== Conditions Tab ====================

function ConditionsTab({ quotation, showSuccess, showError }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void }) {
    const [allClauses, setAllClauses] = useState<PIClause[]>([])
    const [clauseSets, setClauseSets] = useState<PIClauseSet[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [descOverrides, setDescOverrides] = useState<Record<string, string>>({})
    const [additionalClauses, setAdditionalClauses] = useState<any[]>([])
    const [allAdditional, setAllAdditional] = useState<PIAdditionalClause[]>([])
    const [additionalClauseSets, setAdditionalClauseSets] = useState<PIAdditionalClauseSet[]>([])

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [clauses, sets, selected, overrides, addClauses, allAdd, addSets] = await Promise.all([
            window.api.piGetClauses(),
            window.api.piGetClauseSets(),
            window.api.getQuotationClauses(quotation.id),
            window.api.getQuotationClauseOverrides(quotation.id),
            window.api.getQuotationAdditionalClauses(quotation.id),
            window.api.piGetAdditionalClauses(),
            window.api.piGetAdditionalClauseSets()
        ])
        setAllClauses(clauses)
        setClauseSets(sets)
        setSelectedIds(new Set(selected))
        setDescOverrides(overrides)
        setAdditionalClauses(addClauses)
        setAllAdditional(allAdd)
        setAdditionalClauseSets(addSets)
    }

    const toggleClause = async (clauseId: string) => {
        const newSet = new Set(selectedIds)
        const isDeselecting = newSet.has(clauseId)
        if (isDeselecting) newSet.delete(clauseId)
        else newSet.add(clauseId)
        setSelectedIds(newSet)
        try {
            await window.api.setQuotationClauses(quotation.id, Array.from(newSet), descOverrides)
            // When deselecting a cargo-related clause, auto-deselect cargo warranties
            const clause = allClauses.find(c => c.id === clauseId)
            if (isDeselecting && clause?.isCargoRelated) {
                const remainingCargoClauseSelected = allClauses.some(c => c.isCargoRelated && c.id !== clauseId && newSet.has(c.id))
                if (!remainingCargoClauseSelected) {
                    const [allWarranties, currentWarrantyIds] = await Promise.all([
                        window.api.piGetWarranties(),
                        window.api.getQuotationWarranties(quotation.id)
                    ])
                    const cargoWarrantyIds = new Set(allWarranties.filter((w: PIWarranty) => w.isCargoRelated).map((w: PIWarranty) => w.id))
                    const filtered = currentWarrantyIds.filter((id: string) => !cargoWarrantyIds.has(id))
                    if (filtered.length < currentWarrantyIds.length) {
                        await window.api.setQuotationWarranties(quotation.id, filtered)
                        showSuccess('Cargo warranties auto-removed (no cargo clauses selected)')
                    }
                }
            }
        } catch (err: any) {
            showError(err.message || 'Failed to save clause selection')
        }
    }

    const applySet = async (setId: string) => {
        const cs = clauseSets.find(s => s.id === setId)
        if (!cs?.clauseIds) return
        setSelectedIds(new Set(cs.clauseIds))
        await window.api.setQuotationClauses(quotation.id, cs.clauseIds, descOverrides)
        showSuccess(`Applied "${cs.name}" clause set`)
    }

    const updateDescOverride = async (clauseId: string, desc: string) => {
        const clause = allClauses.find(c => c.id === clauseId)
        const override = desc === (clause?.description || '') ? null : desc
        if (override) {
            setDescOverrides(prev => ({ ...prev, [clauseId]: override }))
        } else {
            setDescOverrides(prev => { const n = { ...prev }; delete n[clauseId]; return n })
        }
        await window.api.updateQuotationClauseOverride(quotation.id, clauseId, override)
    }

    const addAdditionalClause = async (clauseId: string) => {
        const clause = allAdditional.find(c => c.id === clauseId)
        if (!clause) return
        await window.api.addQuotationAdditionalClause({ quotationId: quotation.id, piAdditionalClauseId: clauseId, order: additionalClauses.length })
        showSuccess('Additional clause added')
        loadData()
    }

    const applyAdditionalSet = async (setId: string) => {
        const set = additionalClauseSets.find(s => s.id === setId)
        if (!set?.clauseIds) return
        const alreadyIds = new Set(additionalClauses.map((ac: any) => ac.piAdditionalClauseId))
        const toAdd = set.clauseIds.filter(id => !alreadyIds.has(id))
        for (let i = 0; i < toAdd.length; i++) {
            await window.api.addQuotationAdditionalClause({ quotationId: quotation.id, piAdditionalClauseId: toAdd[i], order: additionalClauses.length + i })
        }
        showSuccess(`Applied "${set.name}"`)
        loadData()
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>P&I Conditions (Clauses)</h3>
            {clauseSets.length > 0 && (
                <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Presets:</span>
                    {clauseSets.map(cs => (
                        <button key={cs.id} onClick={() => applySet(cs.id)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }}>{cs.name}</button>
                    ))}
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '24px' }}>
                {allClauses.map(c => (
                    <div key={c.id} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--table-border)', background: selectedIds.has(c.id) ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedIds.has(c.id)} onChange={() => toggleClause(c.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', minWidth: '60px' }}>Cl. {c.clauseNumber}</span>
                            <span style={{ fontSize: '0.85rem' }}>{c.name}</span>
                            {c.isCargoRelated && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                            {descOverrides[c.id] && <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)' }}>(edited)</span>}
                        </label>
                        {selectedIds.has(c.id) && (c.description || descOverrides[c.id]) && (
                            <div style={{ marginTop: '6px', marginLeft: '32px' }}>
                                <input
                                    type="text"
                                    value={descOverrides[c.id] ?? c.description ?? ''}
                                    onChange={e => setDescOverrides(prev => ({ ...prev, [c.id]: e.target.value }))}
                                    onBlur={e => updateDescOverride(c.id, e.target.value)}
                                    placeholder="Clause description..."
                                    style={{ width: '100%', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}
                                />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Additional Clauses</h4>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                {additionalClauseSets.length > 0 && (
                    <>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Presets:</span>
                        {additionalClauseSets.map(s => (
                            <button key={s.id} onClick={() => applyAdditionalSet(s.id)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }}>{s.name}</button>
                        ))}
                        <span style={{ color: 'var(--table-border)', fontSize: '0.7rem' }}>|</span>
                    </>
                )}
                {allAdditional.length > 0 && (
                    <select
                        onChange={e => { if (e.target.value) { addAdditionalClause(e.target.value); e.target.value = '' } }}
                        style={{ padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--input-border)', fontSize: '0.83rem' }}
                        value=""
                    >
                        <option value="">Add individual clause…</option>
                        {allAdditional.map(ac => (
                            <option key={ac.id} value={ac.id}>
                                {ac.code ? `[${ac.code}] ` : ''}{ac.text.substring(0, 70)}{ac.text.length > 70 ? '…' : ''}
                            </option>
                        ))}
                    </select>
                )}
            </div>
            {additionalClauses.map((ac: any) => {
                const def = allAdditional.find(a => a.id === ac.piAdditionalClauseId)
                const code = def?.code || ''
                const text = ac.customText || def?.text || ''
                return (
                    <div key={ac.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <span style={{ color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>-</span>
                        <span style={{ flex: 1, fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>
                            {code && <span style={{ fontWeight: 700, marginRight: '6px', color: 'var(--text-primary)' }}>{code}</span>}
                            {text}
                        </span>
                        <button onClick={async () => { await window.api.deleteQuotationAdditionalClause(ac.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px', flexShrink: 0 }}><Trash2 size={14} /></button>
                    </div>
                )
            })}
            {additionalClauses.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No additional clauses added yet.</p>}
        </div>
    )
}

// ==================== Period Tab ====================

function fmtNiceDate(iso: string): string {
    if (!iso) return iso
    const [y, m, d] = iso.split('-').map(Number)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const sfx = (n: number) => (n === 1 || n === 21 || n === 31 ? 'st' : n === 2 || n === 22 ? 'nd' : n === 3 || n === 23 ? 'rd' : 'th')
    return `${d}${sfx(d)} ${months[m - 1]} ${y}`
}

function PeriodTab({ quotation, updateField, setQ }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void }) {
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

// ==================== Trading Tab ====================

function TradingTab({ quotation, showSuccess, updateField, setQ, getEffectiveText }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [countries, setCountries] = useState<QuotationExcludedCountry[]>([])
    const initRef = useRef(false)
    const [newCountryName, setNewCountryName] = useState('')
    const [newCountryType, setNewCountryType] = useState<'excluded' | 'ddq'>('excluded')

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [qc, masterCountries] = await Promise.all([
            window.api.getQuotationExcludedCountries(quotation.id),
            window.api.piGetTradingExcludedCountries()
        ])
        // Deduplicate by name+listType (legacy data may have duplicates)
        const seen = new Set<string>()
        const deduped = qc.filter(c => {
            const key = `${c.name}|${c.listType}`
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
        if (deduped.length < qc.length) {
            await window.api.setQuotationExcludedCountries(quotation.id, deduped.map(c => ({ name: c.name, listType: c.listType })))
            const refreshed = await window.api.getQuotationExcludedCountries(quotation.id)
            setCountries(refreshed)
            return
        }
        setCountries(qc)
        if (qc.length === 0 && masterCountries.length > 0 && !initRef.current) {
            initRef.current = true
            await window.api.setQuotationExcludedCountries(quotation.id, masterCountries.map(c => ({ name: c.name, listType: c.listType })))
            const refreshed = await window.api.getQuotationExcludedCountries(quotation.id)
            setCountries(refreshed)
        }
    }

    const removeCountry = async (id: string) => {
        const updated = countries.filter(c => c.id !== id)
        setCountries(updated)
        await window.api.setQuotationExcludedCountries(quotation.id, updated.map(c => ({ name: c.name, listType: c.listType })))
    }

    const addCountry = async () => {
        if (!newCountryName.trim()) return
        const updated = [...countries, { id: '', quotationId: quotation.id, name: newCountryName.trim(), listType: newCountryType }]
        await window.api.setQuotationExcludedCountries(quotation.id, updated.map(c => ({ name: c.name, listType: c.listType })))
        setNewCountryName('')
        showSuccess('Country added')
        loadData()
    }

    const toggle = (field: string, val: boolean) => {
        setQ(p => ({ ...p, [field]: val }))
        updateField(field, val)
    }

    const excluded = countries.filter(c => c.listType === 'excluded')
    const ddq = countries.filter(c => c.listType === 'ddq')

    const sectionStyle = { padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '12px' }
    const checkboxStyle = { width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Trading Warranty</h3>

            {/* Section A: Trading Warranty Text (per-quotation) */}
            <div style={sectionStyle}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Trading Warranty Text</label>
                <RichTextEditor
                    value={quotation.tradingWarrantyIntro || ''}
                    onChange={val => { setQ(p => ({ ...p, tradingWarrantyIntro: val })); updateField('tradingWarrantyIntro', val) }}
                    placeholder="Enter the trading warranty text..."
                    minHeight={80}
                />
            </div>

            {/* Section B: DDQ Countries List */}
            <div style={sectionStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '10px' }}>
                    <input type="checkbox" checked={quotation.tradingShowDdqList} onChange={e => toggle('tradingShowDdqList', e.target.checked)} style={checkboxStyle} />
                    <span style={{ fontWeight: 600 }}>DDQ Countries List</span>
                </label>
                {quotation.tradingShowDdqList && (
                    <>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                            Standard text uses <code>{'{ddq_countries}'}</code> variable. Countries managed below.
                        </p>
                        <div style={{ fontSize: '0.82rem', padding: '8px 12px', borderRadius: '6px', background: 'var(--table-header-bg)', marginBottom: '8px', whiteSpace: 'pre-wrap' }}>
                            {(getEffectiveText('ddqCountriesIntro') || 'Due Diligence Questionnaire required for trading with the following countries:')
                                .replace(/\{ddq_countries\}/g, ddq.map(c => c.name).join(', ') || '(none)')}
                        </div>
                    </>
                )}
            </div>

            {/* Section C: Trading Warranties for DDQ Countries */}
            <div style={sectionStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={quotation.tradingShowDdqWarranties} onChange={e => toggle('tradingShowDdqWarranties', e.target.checked)} style={checkboxStyle} />
                    <span style={{ fontWeight: 600 }}>DDQ Trading Conditions</span>
                </label>
                {quotation.tradingShowDdqWarranties && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        Uses the &quot;Trading Conditions&quot; standard text from settings.
                    </p>
                )}
            </div>

            {/* Section D: Israel Exclusion */}
            <div style={sectionStyle}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '4px' }}>
                    <input type="checkbox" checked={quotation.tradingShowIsrael} onChange={e => toggle('tradingShowIsrael', e.target.checked)} style={checkboxStyle} />
                    <span style={{ fontWeight: 600 }}>Israel Exclusion</span>
                </label>
                {quotation.tradingShowIsrael && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
                        Uses the &quot;Israel Exclusion&quot; standard text from settings.
                    </p>
                )}
            </div>

            {/* Section E: Custom Exclusion Text */}
            <div style={sectionStyle}>
                <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Custom Trading Section (optional)</label>
                <RichTextEditor
                    value={quotation.tradingCustomText || ''}
                    onChange={val => { setQ(p => ({ ...p, tradingCustomText: val })); updateField('tradingCustomText', val) }}
                    placeholder="Add custom trading exclusion or condition text..."
                    minHeight={60}
                />
            </div>

            {/* Country Management */}
            <h4 style={{ fontSize: '0.95rem', marginTop: '20px', marginBottom: '10px' }}>Country Lists</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Countries are pre-populated from settings. You can add/remove countries per quotation.</p>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center' }}>
                <input
                    type="text"
                    value={newCountryName}
                    onChange={e => setNewCountryName(e.target.value)}
                    placeholder="Add country (e.g. Occupied Ukraine)..."
                    style={{ flex: 1, maxWidth: '300px' }}
                    onKeyDown={e => { if (e.key === 'Enter') addCountry() }}
                />
                <select value={newCountryType} onChange={e => setNewCountryType(e.target.value as any)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}>
                    <option value="excluded">Excluded</option>
                    <option value="ddq">DDQ</option>
                </select>
                <button onClick={addCountry} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}><Plus size={14} /> Add</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: 'var(--danger)' }}>Excluded Countries ({excluded.length})</h4>
                    {excluded.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--table-border)', marginBottom: '4px' }}>
                            <span style={{ flex: 1, fontSize: '0.83rem' }}>{c.name}</span>
                            <button onClick={() => removeCountry(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                        </div>
                    ))}
                </div>
                <div>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px', color: '#ffb400' }}>DDQ Required Countries ({ddq.length})</h4>
                    {ddq.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--table-border)', marginBottom: '4px' }}>
                            <span style={{ flex: 1, fontSize: '0.83rem' }}>{c.name}</span>
                            <button onClick={() => removeCountry(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

// ==================== Warranties Tab ====================

function WarrantiesTab({ quotation, showSuccess, showError, updateField, setQ, getEffectiveText }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [allWarranties, setAllWarranties] = useState<PIWarranty[]>([])
    const [tags, setTags] = useState<PIWarrantyTag[]>([])
    const [warrantySets, setWarrantySets] = useState<PIWarrantySet[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [customWarranties, setCustomWarranties] = useState<QuotationCustomWarranty[]>([])
    const [activeTab, setActiveTab] = useState<string>('all')
    const [newCustomText, setNewCustomText] = useState('')
    const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
    const [editCustomText, setEditCustomText] = useState('')
    const [showImportModal, setShowImportModal] = useState(false)
    const [importText, setImportText] = useState('')
    const [importedItems, setImportedItems] = useState<string[]>([])
    const [showTexts, setShowTexts] = useState(false)
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [all, allTags, sets, selected, custom] = await Promise.all([
            window.api.piGetWarranties(),
            window.api.piGetWarrantyTags(),
            window.api.piGetWarrantySets(),
            window.api.getQuotationWarranties(quotation.id),
            window.api.getQuotationCustomWarranties(quotation.id)
        ])
        const safeAll = Array.isArray(all) ? all : []
        const safeTags = Array.isArray(allTags) ? allTags : []
        const safeSets = Array.isArray(sets) ? sets : []
        const safeSelected = Array.isArray(selected) ? selected : []
        const safeCustom = Array.isArray(custom) ? custom : []
        setAllWarranties(safeAll)
        setTags(safeTags)
        setWarrantySets(safeSets)
        setSelectedIds(safeSelected)
        setCustomWarranties(safeCustom)

        // Apply default-selected sets on first load if quotation has no warranties yet
        if (!defaultsApplied.current && safeSelected.length === 0 && safeSets.length > 0) {
            defaultsApplied.current = true
            const defaultIds: string[] = []
            for (const ws of safeSets) {
                if (ws.defaultSelected && ws.warrantyIds) {
                    for (const wid of ws.warrantyIds) {
                        if (!defaultIds.includes(wid)) defaultIds.push(wid)
                    }
                }
            }
            if (defaultIds.length > 0) {
                setSelectedIds(defaultIds)
                await window.api.setQuotationWarranties(quotation.id, defaultIds)
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const saveSelected = async (ids: string[]) => {
        setSelectedIds(ids)
        await window.api.setQuotationWarranties(quotation.id, ids)
    }

    const toggle = async (id: string) => {
        const newIds = selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]
        await saveSelected(newIds)
    }

    const selectAllInTab = async () => {
        const tabWarranties = getTabWarranties()
        const newIds = [...selectedIds]
        for (const w of tabWarranties) {
            if (!newIds.includes(w.id)) newIds.push(w.id)
        }
        await saveSelected(newIds)
    }

    const deselectAllInTab = async () => {
        const tabWarranties = getTabWarranties()
        const tabIds = new Set(tabWarranties.map(w => w.id))
        await saveSelected(selectedIds.filter(id => !tabIds.has(id)))
    }

    const applySet = async (setId: string) => {
        const ws = warrantySets.find(s => s.id === setId)
        if (!ws?.warrantyIds) return
        const newIds = [...selectedIds]
        for (const wid of ws.warrantyIds) {
            if (!newIds.includes(wid)) newIds.push(wid)
        }
        await saveSelected(newIds)
        showSuccess(`Applied "${ws.name}"`)
    }

    const moveSelected = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= selectedIds.length) return
        const newIds = [...selectedIds]
        ;[newIds[index], newIds[swapIndex]] = [newIds[swapIndex], newIds[index]]
        await saveSelected(newIds)
    }

    const addCustom = async () => {
        if (!newCustomText.trim()) return
        const result = await window.api.addQuotationCustomWarranty({ quotationId: quotation.id, text: newCustomText.trim(), order: customWarranties.length })
        if (result && (result as any).error) {
            showError((result as any).message || 'Failed to add custom warranty')
            return
        }
        setNewCustomText('')
        showSuccess('Custom warranty added')
        loadData()
    }

    const saveCustomEdit = async (id: string) => {
        await window.api.updateQuotationCustomWarranty(id, { text: editCustomText })
        setEditingCustomId(null)
        loadData()
    }

    const deleteCustom = async (id: string) => {
        await window.api.deleteQuotationCustomWarranty(id)
        loadData()
    }

    const moveCustom = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= customWarranties.length) return
        const newOrder = [...customWarranties]
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setCustomWarranties(newOrder)
        await window.api.reorderQuotationCustomWarranties(newOrder.map(c => c.id))
    }

    const parseImportText = () => {
        const lines = importText.split('\n').map(l => l.replace(/^[\s•\-–—\*\d+\.\)]+/, '').trim()).filter(l => l.length > 0)
        setImportedItems(lines)
    }

    const confirmImport = async () => {
        let order = customWarranties.length
        for (const text of importedItems) {
            await window.api.addQuotationCustomWarranty({ quotationId: quotation.id, text, order: order++ })
        }
        showSuccess(`Imported ${importedItems.length} warranties`)
        setShowImportModal(false)
        setImportText('')
        setImportedItems([])
        loadData()
    }

    const getTabWarranties = () => {
        if (activeTab === 'all') return allWarranties
        if (activeTab === 'untagged') return allWarranties.filter(w => !(w.tagIds || []).length && !w.isCargoRelated)
        const tag = tags.find(t => t.id === activeTab)
        const isCargoTag = tag && tag.name.toLowerCase() === 'cargo'
        return allWarranties.filter(w => (w.tagIds || []).includes(activeTab) || (isCargoTag && w.isCargoRelated))
    }

    const tabWarranties = getTabWarranties()
    const selectedSet = new Set(selectedIds)
    const tabAllSelected = tabWarranties.length > 0 && tabWarranties.every(w => selectedSet.has(w.id))
    const tabNoneSelected = tabWarranties.every(w => !selectedSet.has(w.id))
    const tabSelectedCount = tabWarranties.filter(w => selectedSet.has(w.id)).length
    const hasCargoTag = tags.some(t => t.name.toLowerCase() === 'cargo')
    const untaggedCount = allWarranties.filter(w => !(w.tagIds || []).length && !(hasCargoTag && w.isCargoRelated)).length
    const ckStyle = { width: '16px', height: '16px', accentColor: 'var(--accent-primary)', marginTop: '2px' }
    const tabStyle = (isActive: boolean) => ({
        padding: '6px 14px', borderRadius: '8px 8px 0 0', fontSize: '0.8rem', cursor: 'pointer',
        background: isActive ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
        border: '1px solid ' + (isActive ? 'var(--accent-primary)' : 'var(--table-border)'),
        borderBottom: isActive ? '2px solid var(--accent-primary)' : '1px solid var(--table-border)',
        color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontWeight: isActive ? 600 : 400
    })

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Warranties</h3>

            {/* Preset sets */}
            {warrantySets.length > 0 && (
                <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sets:</span>
                    {warrantySets.map(ws => (
                        <button key={ws.id} onClick={() => applySet(ws.id)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.78rem' }}>
                            {ws.name}
                            {ws.defaultSelected && <span style={{ marginLeft: '4px', fontSize: '0.65rem', color: '#00c864' }}>*</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--table-border)', marginBottom: '12px', flexWrap: 'wrap' }}>
                <button onClick={() => setActiveTab('all')} style={tabStyle(activeTab === 'all')}>
                    All <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({allWarranties.length})</span>
                </button>
                {tags.map(tag => {
                    const isCargoTag = tag.name.toLowerCase() === 'cargo'
                    const matchesTag = (w: PIWarranty) => (w.tagIds || []).includes(tag.id) || (isCargoTag && w.isCargoRelated)
                    const count = allWarranties.filter(matchesTag).length
                    const selCount = allWarranties.filter(w => matchesTag(w) && selectedSet.has(w.id)).length
                    return (
                        <button key={tag.id} onClick={() => setActiveTab(tag.id)} style={tabStyle(activeTab === tag.id)}>
                            {tag.name} <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({selCount}/{count})</span>
                        </button>
                    )
                })}
                {untaggedCount > 0 && (
                    <button onClick={() => setActiveTab('untagged')} style={tabStyle(activeTab === 'untagged')}>
                        Other <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({untaggedCount})</span>
                    </button>
                )}
            </div>

            {/* Select All / Deselect All toolbar */}
            {tabWarranties.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                    <button onClick={selectAllInTab} disabled={tabAllSelected} className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem', opacity: tabAllSelected ? 0.4 : 1 }}>Select All ({tabWarranties.length})</button>
                    <button onClick={deselectAllInTab} disabled={tabNoneSelected} className="btn-secondary" style={{ padding: '3px 10px', fontSize: '0.75rem', opacity: tabNoneSelected ? 0.4 : 1 }}>Deselect All</button>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>{tabSelectedCount} of {tabWarranties.length} selected</span>
                </div>
            )}

            {/* Warranty checkboxes for active tab */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '0', maxHeight: '300px', overflowY: 'auto', padding: '2px' }}>
                {tabWarranties.map(w => (
                    <label key={w.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--table-border)', background: selectedSet.has(w.id) ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                        <input type="checkbox" checked={selectedSet.has(w.id)} onChange={() => toggle(w.id)} style={ckStyle} />
                        <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>{w.text}</span>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {w.isCargoRelated && <span style={{ fontSize: '0.63rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                {activeTab === 'all' && (w.tagIds || []).map(tid => {
                                    const tag = tags.find(t => t.id === tid)
                                    return tag ? <span key={tid} style={{ fontSize: '0.63rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)' }}>{tag.name}</span> : null
                                })}
                            </div>
                        </div>
                    </label>
                ))}
                {tabWarranties.length === 0 && allWarranties.length > 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.82rem', padding: '8px' }}>No warranties in this category. Assign tags to warranties in Settings.</p>}
            </div>
            {allWarranties.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', marginBottom: '16px' }}>No warranties defined. Add them in Settings.</p>}

            {/* ═══════ Divider ═══════ */}
            <div style={{ borderTop: '2px solid var(--table-border)', margin: '18px 0 14px' }} />

            {/* ─── Selected Warranties ─── */}
            {selectedIds.length > 0 ? (
                <div style={{ marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Selected Warranties</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'rgba(0, 210, 255, 0.1)', padding: '2px 8px', borderRadius: '10px' }}>{selectedIds.length}{customWarranties.length > 0 ? ` + ${customWarranties.length} custom` : ''}</span>
                    </div>
                    <div style={{ border: '1px solid var(--table-border)', borderRadius: '8px', overflow: 'hidden', maxHeight: '280px', overflowY: 'auto' }}>
                        {selectedIds.map((id, i) => {
                            const w = allWarranties.find(aw => aw.id === id)
                            if (!w) return null
                            return (
                                <div key={id} style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 8px', fontSize: '0.8rem', borderBottom: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', minWidth: '18px', textAlign: 'right' }}>{i + 1}.</span>
                                    <div style={{ display: 'flex', gap: '1px', flexDirection: 'column' }}>
                                        <button onClick={() => moveSelected(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={10} /></button>
                                        <button onClick={() => moveSelected(i, 'down')} disabled={i === selectedIds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === selectedIds.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={10} /></button>
                                    </div>
                                    <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{w.text}</span>
                                    <button onClick={() => toggle(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '1px', opacity: 0.6 }} title="Remove"><X size={12} /></button>
                                </div>
                            )
                        })}
                        {/* Custom warranties inline in the same list */}
                        {customWarranties.map((cw, i) => {
                            const idx = selectedIds.length + i
                            return (
                                <div key={cw.id} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '4px 8px', fontSize: '0.8rem', borderBottom: i < customWarranties.length - 1 ? '1px solid var(--table-border)' : 'none', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                    <span style={{ color: 'var(--accent-primary)', fontSize: '0.72rem', minWidth: '18px', textAlign: 'right' }}>{idx + 1}.</span>
                                    {editingCustomId === cw.id ? (
                                        <>
                                            <textarea value={editCustomText} onChange={e => setEditCustomText(e.target.value)} style={{ flex: 1, minHeight: '32px', resize: 'vertical', fontSize: '0.8rem', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                            <button onClick={() => saveCustomEdit(cw.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '2px' }}><Save size={12} /></button>
                                            <button onClick={() => setEditingCustomId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', gap: '0', flexDirection: 'column' }}>
                                                <button onClick={() => moveCustom(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={10} /></button>
                                                <button onClick={() => moveCustom(i, 'down')} disabled={i === customWarranties.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === customWarranties.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={10} /></button>
                                            </div>
                                            <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{cw.text}</span>
                                            <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)', whiteSpace: 'nowrap', alignSelf: 'center' }}>custom</span>
                                            <button onClick={() => { setEditingCustomId(cw.id); setEditCustomText(cw.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '1px', opacity: 0.6 }}><Pencil size={10} /></button>
                                            <button onClick={() => deleteCustom(cw.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '1px', opacity: 0.6 }}><Trash2 size={10} /></button>
                                        </>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.82rem', marginBottom: '14px' }}>No warranties selected yet.</p>
            )}

            {/* Add custom warranty inline */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'flex-end' }}>
                <textarea value={newCustomText} onChange={e => { setNewCustomText(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="Add a custom warranty..." rows={1} style={{ flex: 1, minHeight: '32px', maxHeight: '200px', resize: 'none', fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', overflow: 'auto' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustom() } }} />
                <button onClick={addCustom} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} title="Add custom warranty"><Plus size={12} /></button>
                <button onClick={() => setShowImportModal(true)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} title="Bulk import"><Upload size={12} /></button>
            </div>

            {/* ─── Standard Texts (collapsible) ─── */}
            <div style={{ marginBottom: '10px' }}>
                <button onClick={() => setShowTexts(!showTexts)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left' }}>
                    <ChevronDown size={14} style={{ color: 'var(--text-secondary)', transform: showTexts ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Standard Texts</span>
                </button>
                {showTexts && (
                    <div style={{ paddingLeft: '20px', marginTop: '8px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Breach of Warranties</label>
                        <RichTextEditor
                            value={quotation.sectionTextsOverride?.warrantiesBreach ?? getEffectiveText('warrantiesBreach')}
                            onChange={val => {
                                const override = { ...(quotation.sectionTextsOverride || {}), warrantiesBreach: val }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                updateField('sectionTextsOverride', override)
                            }}
                            minHeight={60}
                        />
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px', marginTop: '12px', color: 'var(--text-secondary)' }}>Additional Text (after warranties, before breach)</label>
                        <RichTextEditor
                            value={quotation.sectionTextsOverride?.warrantiesAdditionalText ?? getEffectiveText('warrantiesAdditionalText')}
                            onChange={val => {
                                const override = { ...(quotation.sectionTextsOverride || {}), warrantiesAdditionalText: val }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                updateField('sectionTextsOverride', override)
                            }}
                            minHeight={60}
                        />
                    </div>
                )}
            </div>

            {/* Import modal */}
            {showImportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportModal(false)}>
                    <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '24px', width: '560px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '12px' }}>Import Warranties</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Paste warranties with bullet points, dashes, or numbered lists. Each line becomes a separate warranty.</p>
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder="- Warranty one&#10;- Warranty two&#10;• Warranty three&#10;1. Warranty four"
                            style={{ width: '100%', minHeight: '160px', resize: 'vertical', fontSize: '0.85rem', marginBottom: '10px', padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}
                        />
                        <button onClick={parseImportText} className="btn-secondary" style={{ marginBottom: '12px', fontSize: '0.8rem' }}>Parse</button>
                        {importedItems.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Preview ({importedItems.length} items):</label>
                                {importedItems.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--table-border)', marginBottom: '3px', fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--text-secondary)', minWidth: '20px' }}>{i + 1}.</span>
                                        <span style={{ flex: 1 }}>{item}</span>
                                        <button onClick={() => setImportedItems(prev => prev.filter((_, j) => j !== i))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setShowImportModal(false); setImportText(''); setImportedItems([]) }} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Cancel</button>
                            {importedItems.length > 0 && <button onClick={confirmImport} className="btn-primary" style={{ fontSize: '0.8rem' }}>Import {importedItems.length} Warranties</button>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== Deductibles Tab ====================

function DeductiblesTab({ quotation, showSuccess, updateField, setQ }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void }) {
    const [deductibles, setDeductibles] = useState<QuotationDeductible[]>([])
    const [masterDeductibles, setMasterDeductibles] = useState<PIDeductible[]>([])
    const [textDeds, setTextDeds] = useState<QuotationTextDeductible[]>([])
    const [newTextDed, setNewTextDed] = useState('')

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [qd, md, td] = await Promise.all([
            window.api.getQuotationDeductibles(quotation.id),
            window.api.piGetDeductibles(),
            window.api.getQuotationTextDeductibles(quotation.id)
        ])
        setDeductibles(qd)
        setMasterDeductibles(md)
        setTextDeds(td)
    }

    const handleAddFromMaster = async (masterId: string) => {
        const master = masterDeductibles.find(m => m.id === masterId)
        if (!master) return
        await window.api.addQuotationDeductible({
            quotationId: quotation.id, piDeductibleId: masterId, description: master.description,
            amount: 0, currency: 'USD',
            secondaryDescription: master.secondaryDescription, order: deductibles.length
        })
        showSuccess('Deductible added')
        loadData()
    }

    const handleUpdateAmount = async (id: string, amount: number) => {
        await window.api.updateQuotationDeductible(id, { amount })
    }

    const handleUpdateCurrency = async (id: string, currency: string) => {
        await window.api.updateQuotationDeductible(id, { currency })
    }

    const handleUpdateSecondary = async (id: string, secondaryAmount: number) => {
        await window.api.updateQuotationDeductible(id, { secondaryAmount })
    }

    const handleAddTextDed = async () => {
        if (!newTextDed.trim()) return
        await window.api.addQuotationTextDeductible({ quotationId: quotation.id, text: newTextDed, order: textDeds.length })
        setNewTextDed('')
        showSuccess('Text deductible added')
        loadData()
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Deductibles</h3>

            <div style={{ marginBottom: '16px' }}>
                <select
                    onChange={e => { if (e.target.value) { handleAddFromMaster(e.target.value); e.target.value = '' } }}
                    value=""
                    style={{ padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                >
                    <option value="">Add deductible from settings...</option>
                    {masterDeductibles.map(d => <option key={d.id} value={d.id}>{d.description}</option>)}
                </select>
            </div>

            {deductibles.map(d => (
                <div key={d.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ flex: 1, fontSize: '0.85rem' }}>{d.description}</span>
                        <input type="text" defaultValue={d.currency} onBlur={e => handleUpdateCurrency(d.id, e.target.value)} style={{ width: '60px', padding: '4px 6px', fontSize: '0.82rem' }} />
                        <input type="number" defaultValue={d.amount} onBlur={e => handleUpdateAmount(d.id, parseFloat(e.target.value) || 0)} style={{ width: '120px', padding: '4px 6px', fontSize: '0.82rem' }} />
                        <button onClick={async () => { await window.api.deleteQuotationDeductible(d.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                    </div>
                    {d.secondaryDescription && (
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px', paddingLeft: '12px' }}>
                            <span style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Or: {d.secondaryDescription}</span>
                            <input type="number" defaultValue={d.secondaryAmount || 0} onBlur={e => handleUpdateSecondary(d.id, parseFloat(e.target.value) || 0)} style={{ width: '120px', padding: '4px 6px', fontSize: '0.82rem' }} />
                        </div>
                    )}
                </div>
            ))}

            <h4 style={{ fontSize: '0.9rem', marginTop: '20px', marginBottom: '10px' }}>Text-Based Deductibles</h4>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <textarea value={newTextDed} onChange={e => setNewTextDed(e.target.value)} placeholder="Free-text deductible..." style={{ flex: 1, minHeight: '50px', resize: 'vertical' }} />
                <button onClick={handleAddTextDed} className="btn-primary" style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>
            {textDeds.map(td => (
                <div key={td.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ flex: 1, fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>{td.text}</span>
                    <button onClick={async () => { await window.api.deleteQuotationTextDeductible(td.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
            ))}

            <div style={{ marginTop: '20px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={quotation.vdrDeductibleEnabled} onChange={e => { setQ(p => ({ ...p, vdrDeductibleEnabled: e.target.checked })); updateField('vdrDeductibleEnabled', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                    <span style={{ fontWeight: 600 }}>VDR Deductible Clause</span>
                </label>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', marginLeft: '24px' }}>
                    When enabled, the VDR clause from standard texts will be included in the deductibles section of the export.
                </p>
            </div>
        </div>
    )
}

// ==================== Exclusions Tab ====================

function ExclusionsTab({ quotation }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void }) {
    const [allExclusions, setAllExclusions] = useState<PIExclusion[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [all, qe] = await Promise.all([
            window.api.piGetExclusions(),
            window.api.getQuotationExclusions(quotation.id)
        ])
        setAllExclusions(all)
        setSelectedIds(new Set(qe.filter((e: any) => e.piExclusionId).map((e: any) => e.piExclusionId)))
    }

    const toggle = async (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
        await window.api.setQuotationExclusions(quotation.id, Array.from(newSet).map(eid => ({ piExclusionId: eid })))
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Exclusions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {allExclusions.map(e => (
                    <label key={e.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', border: '1px solid var(--table-border)', background: selectedIds.has(e.id) ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                        <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggle(e.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', marginTop: '2px' }} />
                        <span style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{e.text}</span>
                    </label>
                ))}
            </div>
            {allExclusions.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No exclusions defined. Add them in Settings.</p>}
        </div>
    )
}

// ==================== Sanctions Tab ====================

function SanctionsTab({ quotation, updateField, setQ, sanctionsVersions }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; sanctionsVersions: PISanctionsVersion[] }) {
    const selectedVersion = sanctionsVersions.find(v => v.key === quotation.sanctionsClauseVersion)
    const defaultText = selectedVersion?.text || ''
    const displayText = quotation.sanctionsTextOverride ?? defaultText
    const isOverridden = quotation.sanctionsTextOverride !== undefined && quotation.sanctionsTextOverride !== null

    const handleVersionChange = (key: string) => {
        setQ(p => ({ ...p, sanctionsClauseVersion: key, sanctionsTextOverride: undefined }))
        updateField('sanctionsClauseVersion', key)
        updateField('sanctionsTextOverride', null)
    }

    const handleTextChange = (text: string) => {
        if (text === defaultText) {
            setQ(p => ({ ...p, sanctionsTextOverride: undefined }))
            updateField('sanctionsTextOverride', null)
        } else {
            setQ(p => ({ ...p, sanctionsTextOverride: text }))
            updateField('sanctionsTextOverride', text)
        }
    }

    const handleReset = () => {
        setQ(p => ({ ...p, sanctionsTextOverride: undefined }))
        updateField('sanctionsTextOverride', null)
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Sanctions Clause</h3>

            {sanctionsVersions.length > 0 ? (
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Sanctions Version</label>
                    <select
                        value={quotation.sanctionsClauseVersion || ''}
                        onChange={e => handleVersionChange(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: '250px' }}
                    >
                        <option value="">Select a version...</option>
                        {sanctionsVersions.map(v => (
                            <option key={v.id} value={v.key}>{v.name}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No sanctions versions configured. Add versions in Quotation Settings &rarr; Sanctions Versions tab.
                </div>
            )}

            {(selectedVersion || quotation.sanctionsClauseVersion) && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Clause Text {isOverridden && <span style={{ color: 'var(--accent-primary)', fontSize: '0.72rem' }}>(customized)</span>}</label>
                        {isOverridden && (
                            <button onClick={handleReset} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>Reset to default</button>
                        )}
                    </div>
                    <RichTextEditor
                        value={displayText}
                        onChange={handleTextChange}
                        minHeight={180}
                    />
                </div>
            )}
        </div>
    )
}

// ==================== Subjectivities Tab ====================

function SubjectivitiesTab({ quotation, showSuccess }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [items, setItems] = useState<any[]>([])
    const [newText, setNewText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setItems(await window.api.getQuotationSubjectivities(quotation.id)) }

    const handleAdd = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationSubjectivity({ quotationId: quotation.id, text: newText, order: items.length })
        setNewText('')
        showSuccess('Subjectivity added')
        loadData()
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Subjectivities</h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Required document or condition..." style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>
            {items.map(item => (
                <div key={item.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{item.text}</span>
                    <button onClick={async () => { await window.api.deleteQuotationSubjectivity(item.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
            ))}
        </div>
    )
}

// ==================== Premium Tab ====================

function PremiumTab({ quotation, updateField, setQ, getEffectiveText, updateSectionTextOverride, resetSectionText }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean; getEffectiveText: (key: keyof PISectionTexts) => string; updateSectionTextOverride: (key: keyof PISectionTexts, value: string) => void; resetSectionText: (key: keyof PISectionTexts) => void }) {
    const [instalments, setInstalments] = useState<QuotationInstalment[]>([])
    const [instalmentDefaults, setInstalmentDefaults] = useState<InstalmentDefaults>({})

    useEffect(() => {
        loadInstalments()
        window.api.piGetInstalmentDefaults().then(d => setInstalmentDefaults(d || {}))
    }, [])
    const loadInstalments = async () => { setInstalments(await window.api.getQuotationInstalments(quotation.id)) }

    const handleSaveInstalments = async (count: number) => {
        const defaultDays = instalmentDefaults[String(count)]
        const insts: { instalmentNumber: number; daysFromInception: number; description?: string; nonRefundable?: boolean; nonRefundablePercent?: number }[] = []
        for (let i = 0; i < count; i++) {
            const existing = instalments.find(inst => inst.instalmentNumber === i + 1)
            insts.push({
                instalmentNumber: i + 1,
                daysFromInception: existing?.daysFromInception ?? defaultDays?.[i] ?? (i === 0 ? 0 : i * 90),
                description: existing?.description,
                nonRefundable: existing?.nonRefundable,
                nonRefundablePercent: existing?.nonRefundablePercent
            })
        }
        await window.api.setQuotationInstalments(quotation.id, insts)
        loadInstalments()
    }

    const technicalPremium = quotation.premiumAmount || 0
    const discountPct = quotation.discountPercent || 0
    const payablePremium = technicalPremium * (1 - discountPct / 100)

    const updateInstalment = async (index: number, field: string, value: any) => {
        const updated = [...instalments]
        ;(updated[index] as any)[field] = value
        await window.api.setQuotationInstalments(quotation.id, updated.map(i => ({
            instalmentNumber: i.instalmentNumber,
            daysFromInception: i.daysFromInception,
            description: i.description,
            nonRefundable: i.nonRefundable,
            nonRefundablePercent: i.nonRefundablePercent
        })))
        setInstalments(updated)
    }

    const cpcText = getEffectiveText('continuationPiClubText')
    const isCpcOverridden = quotation.sectionTextsOverride?.continuationPiClubText !== undefined

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Premium</h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Currency:</span>
                    <input type="text" value={quotation.premiumCurrency || 'USD'} onChange={e => setQ(p => ({ ...p, premiumCurrency: e.target.value }))} onBlur={e => updateField('premiumCurrency', e.target.value)} style={{ width: '70px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Technical Premium:</span>
                    <input type="number" value={quotation.premiumAmount || ''} onChange={e => setQ(p => ({ ...p, premiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('premiumAmount', parseFloat(e.target.value) || null)} style={{ width: '150px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Discount:</span>
                    <input type="number" min={0} max={100} step={0.1} value={quotation.discountPercent || ''} onChange={e => setQ(p => ({ ...p, discountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('discountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px' }} />
                    <span style={{ fontSize: '0.8rem' }}>%</span>
                    <input type="text" value={quotation.discountLabel || ''} onChange={e => setQ(p => ({ ...p, discountLabel: e.target.value }))} onBlur={e => updateField('discountLabel', e.target.value || null)} placeholder="Label (e.g. NCB)" style={{ width: '120px' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Instalments:</span>
                    <input type="number" min={1} max={12} value={quotation.numInstalments || 1}
                        onChange={e => {
                            const v = parseInt(e.target.value) || 1
                            setQ(p => ({ ...p, numInstalments: v }))
                            updateField('numInstalments', v)
                            handleSaveInstalments(v)
                        }}
                        style={{ width: '70px' }}
                    />
                </div>
            </div>
            {discountPct > 0 && technicalPremium > 0 && (
                <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.06)', border: '1px solid rgba(0, 210, 255, 0.15)' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Payable Premium: {quotation.premiumCurrency || 'USD'} {payablePremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    {quotation.discountLabel && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>({quotation.discountLabel} {discountPct}%)</span>}
                </div>
            )}

            {instalments.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Instalment Schedule</h4>
                    {instalments.map((inst, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, width: '30px' }}>#{inst.instalmentNumber}</span>
                            <input type="number" value={inst.daysFromInception} onChange={e => updateInstalment(i, 'daysFromInception', parseInt(e.target.value) || 0)} style={{ width: '80px', padding: '4px 6px' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>days</span>
                            <input type="text" value={inst.description || ''} onChange={e => updateInstalment(i, 'description', e.target.value)} placeholder="Description" style={{ flex: 1, padding: '4px 8px', minWidth: '120px' }} />
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                <input type="checkbox" checked={inst.nonRefundable || false} onChange={e => updateInstalment(i, 'nonRefundable', e.target.checked)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} />
                                Non-refundable
                            </label>
                            {inst.nonRefundable && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <input type="number" value={inst.nonRefundablePercent || ''} onChange={e => updateInstalment(i, 'nonRefundablePercent', parseFloat(e.target.value) || null)} placeholder="%" style={{ width: '55px', padding: '4px 6px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>%</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Additional premium instructions</label>
                <RichTextEditor value={quotation.premiumAdditionalText || ''} onChange={val => { setQ(p => ({ ...p, premiumAdditionalText: val })); updateField('premiumAdditionalText', val) }} minHeight={60} maxWidth="600px" />
            </div>

            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Continuation P&I Club</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Text for Continuation P&I Club section {isCpcOverridden && <span style={{ color: 'var(--accent-primary)', fontSize: '0.72rem' }}>(customized)</span>}</label>
                    {isCpcOverridden && <button onClick={() => resetSectionText('continuationPiClubText')} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>Reset</button>}
                </div>
                <RichTextEditor
                    value={cpcText}
                    onChange={val => updateSectionTextOverride('continuationPiClubText', val)}
                    placeholder="Enter Continuation P&I Club text (leave empty to omit section from export)..."
                    minHeight={60}
                    maxWidth="600px"
                />
            </div>

            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={quotation.ncbEnabled} onChange={e => { setQ(p => ({ ...p, ncbEnabled: e.target.checked })); updateField('ncbEnabled', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>No Claims Bonus (NCB)</span>
                    </label>
                    {quotation.ncbEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem' }}>Discount:</span>
                                <input type="number" value={quotation.ncbDiscountPercent || ''} onChange={e => setQ(p => ({ ...p, ncbDiscountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ncbDiscountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                                <span style={{ fontSize: '0.8rem' }}>%</span>
                            </div>
                            <RichTextEditor value={quotation.ncbText || ''} onChange={val => { setQ(p => ({ ...p, ncbText: val })); updateField('ncbText', val) }} placeholder="NCB terms text..." minHeight={50} />
                        </div>
                    )}
                </div>
                <div style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={quotation.cpcEnabled} onChange={e => { setQ(p => ({ ...p, cpcEnabled: e.target.checked })); updateField('cpcEnabled', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>CPC Discount</span>
                    </label>
                    {quotation.cpcEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem' }}>Discount:</span>
                                <input type="number" value={quotation.cpcDiscountPercent || ''} onChange={e => setQ(p => ({ ...p, cpcDiscountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('cpcDiscountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                                <span style={{ fontSize: '0.8rem' }}>%</span>
                            </div>
                            <RichTextEditor value={quotation.cpcText || ''} onChange={val => { setQ(p => ({ ...p, cpcText: val })); updateField('cpcText', val) }} placeholder="CPC terms text..." minHeight={50} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ==================== Information Tab ====================

function InformationTab({ quotation, updateField, setQ, showSuccess }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [items, setItems] = useState<any[]>([])
    const [newText, setNewText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setItems(await window.api.getQuotationInformation(quotation.id)) }

    const handleAdd = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationInformation({ quotationId: quotation.id, text: newText, order: items.length })
        setNewText('')
        showSuccess('Information item added')
        loadData()
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Information</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', maxWidth: '300px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Validity (days):</span>
                <input type="number" value={quotation.validityDays} onChange={e => { setQ(p => ({ ...p, validityDays: parseInt(e.target.value) || 14 })) }} onBlur={e => updateField('validityDays', parseInt(e.target.value) || 14)} style={{ width: '80px' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Information item..." style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>
            {items.map(item => (
                <div key={item.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{item.text}</span>
                    <button onClick={async () => { await window.api.deleteQuotationInformation(item.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
            ))}
        </div>
    )
}

// ==================== Notes Tab ====================

function NotesTab({ quotation, showSuccess }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [notes, setNotes] = useState<QuotationNote[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [newContent, setNewContent] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setNotes(await window.api.getQuotationNotes(quotation.id)) }

    const handleAdd = async () => {
        if (!newTitle.trim()) return
        await window.api.addQuotationNote({ quotationId: quotation.id, title: newTitle, content: newContent, order: notes.length })
        setNewTitle(''); setNewContent('')
        showSuccess('Note added')
        loadData()
    }

    const handleUpdate = async (id: string, updates: { title?: string; content?: string }) => {
        await window.api.updateQuotationNote(id, updates)
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Additional Notes</h3>
            <div style={{ marginBottom: '16px', padding: '14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Note title" style={{ width: '100%', marginBottom: '8px', fontWeight: 600 }} />
                <textarea value={newContent} onChange={e => setNewContent(e.target.value)} placeholder="Note content..." style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }} />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add Note</button>
            </div>
            {notes.map(note => (
                <div key={note.id} style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <input type="text" defaultValue={note.title} onBlur={e => handleUpdate(note.id, { title: e.target.value })} style={{ flex: 1, fontWeight: 600, fontSize: '0.9rem' }} />
                        <button onClick={async () => { await window.api.deleteQuotationNote(note.id); showSuccess('Note deleted'); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                    </div>
                    <textarea defaultValue={note.content} onBlur={e => handleUpdate(note.id, { content: e.target.value })} style={{ width: '100%', minHeight: '60px', resize: 'vertical', fontSize: '0.85rem' }} />
                </div>
            ))}
        </div>
    )
}
