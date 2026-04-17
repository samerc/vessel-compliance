import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, ChevronRight, Pencil, X, Save, Globe, Shield, AlertTriangle, FileText, BookOpen, Scale, Tag, Calendar, Download, Upload, List, GitBranch, ArrowRight, Check, Copy, DollarSign, ClipboardCheck, GripVertical } from 'lucide-react'
import { PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIWarrantySet, PIDeductible, PITextDeductible, PIExclusion, PISubLimitTemplate, PIAdditionalClause, PIAdditionalClauseSet, TradingExcludedCountry, TradingWarrantyTemplate, PISectionTexts, PISanctionsVersion, InstalmentDefaults, PISubjectivity, DocumentType, VesselType, QuotationType, HullAgreedValueText, HullClause, HullClauseCondition, HullAdditionalCondition, HullConditionSection, WarCondition, WarSettings, WorkflowStep, WorkflowTransition, PERMISSION_CATEGORIES, PremiumTextTemplate, SurveyWarrantyTemplate, SurveyWarrantyTemplateSet, TradingCustomText } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { countryNameToIso3 } from '../utils/countryCodeMap'
import RichTextEditor from './RichTextEditor'

import { StickyNote } from 'lucide-react'

type SettingsTab = 'quotationTypes' | 'clauses' | 'warranties' | 'deductibles' | 'exclusions' | 'subLimits' | 'additionalClauses' | 'subjectivities' | 'tradingCountries' | 'tradingWarranty' | 'tradingWarrantyTemplates' | 'sanctionsVersions' | 'standardTexts' | 'instalmentDefaults' | 'sectionOrder' | 'workflow' | 'premiumTexts' | 'hullAgreedValueTexts' | 'hullClauses' | 'hullAdditionalConditions' | 'warConditions' | 'warSettings' | 'surveyWarrantyTemplates' | 'tradingCustomTexts' | 'cargoConditions' | 'cargoSpecial' | 'cargoLaw'

type SettingsCategory = 'general' | 'pi' | 'hull' | 'war' | 'cargo'

const CATEGORIES: { id: SettingsCategory; label: string; color: string }[] = [
    { id: 'general', label: 'General', color: 'var(--accent-primary)' },
    { id: 'pi', label: 'P&I', color: '#6464ff' },
    { id: 'hull', label: 'H&M', color: '#ff64c8' },
    { id: 'war', label: 'War', color: '#ff8c32' },
    { id: 'cargo', label: 'Cargo', color: '#32b886' },
]

const CATEGORY_TABS: Record<SettingsCategory, { id: SettingsTab; label: string; icon: any }[]> = {
    general: [
        { id: 'subjectivities', label: 'Subjectivities', icon: <FileText size={15} /> },
        { id: 'tradingCountries', label: 'Trading Countries', icon: <Globe size={15} /> },
        { id: 'tradingWarranty', label: 'Trading Warranty', icon: <Globe size={15} /> },
        { id: 'tradingWarrantyTemplates', label: 'Trading Templates', icon: <FileText size={15} /> },
        { id: 'tradingCustomTexts', label: 'Trading Custom', icon: <FileText size={15} /> },
        { id: 'sanctionsVersions', label: 'Sanctions Versions', icon: <Shield size={15} /> },
        { id: 'standardTexts', label: 'Standard Texts', icon: <StickyNote size={15} /> },
        { id: 'premiumTexts', label: 'NCB / UPCC', icon: <DollarSign size={15} /> },
        { id: 'instalmentDefaults', label: 'Instalment Defaults', icon: <Calendar size={15} /> },
        { id: 'sectionOrder', label: 'Section Order', icon: <List size={15} /> },
        { id: 'warranties', label: 'Warranties', icon: <Shield size={15} /> },
        { id: 'surveyWarrantyTemplates', label: 'Survey Warranties', icon: <ClipboardCheck size={15} /> },
        { id: 'workflow', label: 'Workflow', icon: <GitBranch size={15} /> },
    ],
    pi: [
        { id: 'clauses', label: 'Conditions', icon: <BookOpen size={15} /> },
        { id: 'deductibles', label: 'Deductibles', icon: <Scale size={15} /> },
        { id: 'exclusions', label: 'Exclusions', icon: <AlertTriangle size={15} /> },
        { id: 'subLimits', label: 'Limits of Liability', icon: <FileText size={15} /> },
        { id: 'additionalClauses', label: 'Addl. Clauses', icon: <FileText size={15} /> },
    ],
    hull: [
        { id: 'hullAgreedValueTexts', label: 'Agreed Value', icon: <FileText size={15} /> },
        { id: 'hullClauses', label: 'Clauses', icon: <BookOpen size={15} /> },
        { id: 'hullAdditionalConditions', label: 'Addl. Conditions', icon: <AlertTriangle size={15} /> },
    ],
    war: [
        { id: 'warConditions', label: 'Conditions', icon: <BookOpen size={15} /> },
        { id: 'warSettings', label: 'Settings', icon: <Shield size={15} /> },
    ],
    cargo: [
        { id: 'cargoConditions', label: 'Conditions', icon: <BookOpen size={15} /> },
        { id: 'cargoSpecial', label: 'Special Conditions', icon: <FileText size={15} /> },
        { id: 'cargoLaw', label: 'Law & Jurisdiction', icon: <Scale size={15} /> },
    ],
}

export default function QuotationSettings() {
    const [activeCategory, setActiveCategory] = useState<SettingsCategory>('general')
    const [activeTab, setActiveTab] = useState<SettingsTab>('subjectivities')
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const { hasPermission } = useAuth()
    const isLight = theme === 'light'
    const canSettings = hasPermission('quotations:settings')

    const handleCategoryChange = (cat: SettingsCategory) => {
        setActiveCategory(cat)
        setActiveTab(CATEGORY_TABS[cat][0].id)
    }

    const catColor = CATEGORIES.find(c => c.id === activeCategory)?.color || 'var(--accent-primary)'

    return (
        <div>
            {/* Category selector */}
            <div style={{
                display: 'flex',
                gap: '2px',
                marginBottom: '16px',
                background: isLight ? '#e8eaf0' : 'rgba(255,255,255,0.06)',
                borderRadius: '10px',
                padding: '3px',
                width: 'fit-content'
            }}>
                {CATEGORIES.map(cat => (
                    <button
                        key={cat.id}
                        onClick={() => handleCategoryChange(cat.id)}
                        style={{
                            padding: '8px 22px',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeCategory === cat.id
                                ? (isLight ? '#ffffff' : 'rgba(255,255,255,0.12)')
                                : 'transparent',
                            color: activeCategory === cat.id ? cat.color : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: activeCategory === cat.id ? 600 : 400,
                            boxShadow: activeCategory === cat.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Tab chips filtered by category */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {CATEGORY_TABS[activeCategory].map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: activeTab === t.id ? `1px solid ${catColor}` : '1px solid var(--glass-border)',
                            background: activeTab === t.id ? `${catColor}1f` : 'transparent',
                            color: activeTab === t.id ? catColor : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '0.82rem',
                            fontWeight: activeTab === t.id ? 600 : 400,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.2s'
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {!canSettings && (
                <div style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', background: 'rgba(255, 180, 0, 0.1)', border: '1px solid rgba(255, 180, 0, 0.3)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    You do not have permission to modify quotation settings. Viewing in read-only mode.
                </div>
            )}
            <fieldset disabled={!canSettings} style={{ border: 'none', padding: 0, margin: 0 }}>
            {activeTab === 'quotationTypes' && <QuotationTypesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'clauses' && <ClausesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'warranties' && <WarrantiesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'deductibles' && <DeductiblesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'exclusions' && <ExclusionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'subLimits' && <SubLimitsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'additionalClauses' && <AdditionalClausesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'subjectivities' && <MasterSubjectivitiesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'tradingCountries' && <TradingCountriesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'tradingWarranty' && <TradingWarrantyTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'tradingWarrantyTemplates' && <TradingWarrantyTemplatesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'tradingCustomTexts' && <TradingCustomTextsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'premiumTexts' && <PremiumTextTemplatesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'sanctionsVersions' && <SanctionsVersionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'standardTexts' && <StandardTextsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'instalmentDefaults' && <InstalmentDefaultsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'sectionOrder' && <SectionOrderTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'workflow' && <WorkflowDesignerTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'surveyWarrantyTemplates' && <SurveyWarrantyTemplatesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}

            {activeTab === 'hullAgreedValueTexts' && <HullAgreedValueTextsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'hullClauses' && <HullClausesTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'hullAdditionalConditions' && <HullAdditionalConditionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'warConditions' && <WarConditionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'warSettings' && <WarSettingsTab showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'cargoConditions' && <CargoClausesTab section="conditions" sectionLabel="Conditions" showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'cargoSpecial' && <CargoClausesTab section="special" sectionLabel="Special Conditions" showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            {activeTab === 'cargoLaw' && <CargoClausesTab section="law" sectionLabel="Law & Jurisdiction" showSuccess={showSuccess} showError={showError} isLight={isLight} readOnly={!canSettings} />}
            </fieldset>
        </div>
    )
}

interface TabProps {
    showSuccess: (msg: string) => void
    showError: (msg: string) => void
    isLight: boolean
    readOnly?: boolean
}

// ==================== Collapsible Standard Texts Section (reusable) ====================

/** Embeddable collapsible section for standard texts within a tab. Loads/saves shared pi_section_texts. */
function CollapsibleStandardTexts({ fields, showSuccess }: {
    fields: { key: keyof PISectionTexts; label: string; rows?: number }[]
    showSuccess: (msg: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [texts, setTexts] = useState<PISectionTexts>({})
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        if (!open || loaded) return
        ;(async () => {
            const saved = await window.api.piGetSectionTexts()
            if (saved && Object.keys(saved).length > 0) setTexts(saved)
            else setTexts(DEFAULT_SECTION_TEXTS)
            setLoaded(true)
        })()
    }, [open, loaded])

    const handleSave = async () => {
        await window.api.piSetSectionTexts(texts)
        showSuccess('Standard texts saved')
    }

    return (
        <section className="glass-card" style={{ marginTop: '16px', padding: '20px' }}>
            <div
                onClick={() => setOpen(!open)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', marginBottom: open ? '14px' : 0 }}
            >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Standard Texts</h3>
            </div>
            {open && (
                <div>
                    {!loaded ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Loading...</div>
                    ) : (
                        <>
                            {fields.map(field => (
                                <div key={field.key} style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{field.label}</label>
                                    <RichTextEditor
                                        value={String(texts[field.key] || '')}
                                        onChange={val => setTexts(prev => ({ ...prev, [field.key]: val }))}
                                        minHeight={Math.max(60, (field.rows || 3) * 22)}
                                        showFontSize
                                        showFontFamily
                                        showAlignment
                                        showLineSpacing
                                    />
                                </div>
                            ))}
                            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={handleSave} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}>
                                    <Save size={14} /> Save
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </section>
    )
}

// ==================== Quotation Types Tab ====================

function QuotationTypesTab({ showSuccess, showError }: TabProps) {
    const [types, setTypes] = useState<QuotationType[]>([])
    const [newName, setNewName] = useState('')
    const [newCode, setNewCode] = useState('')
    const [editId, setEditId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editCode, setEditCode] = useState('')

    useEffect(() => { load() }, [])
    const load = async () => {
        const res = await window.api.getQuotationTypes()
        setTypes(Array.isArray(res) ? res : [])
    }

    const handleAdd = async () => {
        if (!newName.trim() || !newCode.trim()) return
        try {
            await window.api.addQuotationType({ name: newName.trim(), code: newCode.trim().toUpperCase() })
            showSuccess('Type added')
            setNewName(''); setNewCode('')
            load()
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const handleSave = async (id: string) => {
        try {
            await window.api.updateQuotationType(id, { name: editName.trim(), code: editCode.trim().toUpperCase() })
            showSuccess('Updated')
            setEditId(null)
            load()
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.deleteQuotationType(id)
            showSuccess('Deleted')
            load()
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const moveType = async (index: number, dir: -1 | 1) => {
        const arr = [...types]
        const target = index + dir
        if (target < 0 || target >= arr.length) return
        ;[arr[index], arr[target]] = [arr[target], arr[index]]
        setTypes(arr)
        await window.api.reorderQuotationTypes(arr.map(t => t.id))
    }

    return (
        <div className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={18} /> Quotation Types
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Manage the types of quotations available. Each type has a short code used in auto-generated reference numbers (e.g. Q/P/1).
            </p>

            {/* Add form */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
                <input
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Type name (e.g. P&I)"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px' }}
                />
                <input
                    type="text"
                    value={newCode}
                    onChange={e => setNewCode(e.target.value.slice(0, 5))}
                    placeholder="Code"
                    style={{ width: '80px', padding: '8px 12px', borderRadius: '6px', textTransform: 'uppercase' }}
                />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                    <Plus size={14} /> Add
                </button>
            </div>

            {/* Types list */}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Order</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Name</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Code</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {types.map((t, i) => (
                        <tr key={t.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                            <td style={{ padding: '10px 12px' }}>
                                <div style={{ display: 'flex', gap: '2px' }}>
                                    <button onClick={() => moveType(i, -1)} disabled={i === 0} className="btn-secondary" style={{ padding: '2px 6px', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                    <button onClick={() => moveType(i, 1)} disabled={i === types.length - 1} className="btn-secondary" style={{ padding: '2px 6px', opacity: i === types.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                </div>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                                {editId === t.id ? (
                                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ padding: '4px 8px', borderRadius: '4px', width: '100%' }} />
                                ) : t.name}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                                {editId === t.id ? (
                                    <input type="text" value={editCode} onChange={e => setEditCode(e.target.value.slice(0, 5))} style={{ padding: '4px 8px', borderRadius: '4px', width: '80px', textTransform: 'uppercase' }} />
                                ) : (
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        background: 'rgba(0, 170, 200, 0.12)',
                                        color: 'var(--accent-primary)'
                                    }}>{t.code}</span>
                                )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                    {editId === t.id ? (
                                        <>
                                            <button onClick={() => handleSave(t.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Save size={13} /></button>
                                            <button onClick={() => setEditId(null)} className="btn-secondary" style={{ padding: '4px 8px' }}><X size={13} /></button>
                                        </>
                                    ) : (
                                        <>
                                            <button onClick={() => { setEditId(t.id); setEditName(t.name); setEditCode(t.code) }} className="btn-secondary" style={{ padding: '4px 8px' }}><Pencil size={13} /></button>
                                            <button onClick={() => handleDelete(t.id)} className="btn-secondary" style={{ padding: '4px 8px', color: 'var(--danger)' }}><Trash2 size={13} /></button>
                                        </>
                                    )}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ==================== Clauses Tab ====================

function ClausesTab({ showSuccess, showError, isLight }: TabProps) {
    const [clauses, setClauses] = useState<PIClause[]>([])
    const [clauseSets, setClauseSets] = useState<PIClauseSet[]>([])
    const [newNumber, setNewNumber] = useState('')
    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newCargo, setNewCargo] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editNumber, setEditNumber] = useState('')
    const [editName, setEditName] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [editCargo, setEditCargo] = useState(false)

    // Clause sets
    const [showSetForm, setShowSetForm] = useState(false)
    const [setName, setSetName] = useState('')
    const [setClauseIds, setSetClauseIds] = useState<Set<string>>(new Set())
    const [setDescOverrides, setSetDescOverrides] = useState<Record<string, string>>({})
    const [editingSetId, setEditingSetId] = useState<string | null>(null)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [c, s] = await Promise.all([window.api.piGetClauses(), window.api.piGetClauseSets()])
        setClauses(c)
        setClauseSets(s)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim() || !newNumber.trim()) return
        try {
            await window.api.piAddClause({ clauseNumber: parseInt(newNumber), name: newName, description: newDesc, isCargoRelated: newCargo, order: 0 })
            setNewNumber(''); setNewName(''); setNewDesc(''); setNewCargo(false)
            showSuccess('Clause added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add clause') }
    }

    const startEdit = (c: PIClause) => {
        setEditingId(c.id); setEditNumber(String(c.clauseNumber)); setEditName(c.name); setEditDesc(c.description || ''); setEditCargo(c.isCargoRelated)
    }

    const saveEdit = async (id: string) => {
        try {
            await window.api.piUpdateClause(id, { clauseNumber: parseInt(editNumber), name: editName, description: editDesc, isCargoRelated: editCargo })
            setEditingId(null)
            showSuccess('Clause updated')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleDelete = async (id: string) => {
        await window.api.piDeleteClause(id)
        showSuccess('Clause deleted')
        loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...clauses]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClauses(newOrder)
        await window.api.piReorderClauses(newOrder.map(c => c.id))
    }

    const handleSaveSet = async () => {
        if (!setName.trim() || setClauseIds.size === 0) return
        try {
            const activeOverrides: Record<string, string> = {}
            for (const [cid, desc] of Object.entries(setDescOverrides)) {
                if (desc.trim() && setClauseIds.has(cid)) activeOverrides[cid] = desc.trim()
            }
            if (editingSetId) {
                await window.api.piUpdateClauseSet(editingSetId, setName, Array.from(setClauseIds), Object.keys(activeOverrides).length > 0 ? activeOverrides : undefined)
                showSuccess('Clause set updated')
            } else {
                await window.api.piAddClauseSet(setName, Array.from(setClauseIds), Object.keys(activeOverrides).length > 0 ? activeOverrides : undefined)
                showSuccess('Clause set created')
            }
            setShowSetForm(false); setSetName(''); setSetClauseIds(new Set()); setSetDescOverrides({}); setEditingSetId(null)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to save set') }
    }

    const startEditSet = (set: PIClauseSet) => {
        setEditingSetId(set.id); setSetName(set.name); setSetClauseIds(new Set(set.clauseIds || [])); setSetDescOverrides(set.descriptionOverrides || {}); setShowSetForm(true)
    }

    const handleDeleteSet = async (id: string) => {
        await window.api.piDeleteClauseSet(id)
        showSuccess('Clause set deleted')
        loadData()
    }

    return (
        <div>
            <section className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>P&I Clauses</h3>
                <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <input type="number" value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="Cl. #" style={{ width: '70px' }} required />
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Clause name" style={{ flex: 1, minWidth: '200px' }} required />
                    <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optional)" style={{ flex: 2, minWidth: '200px' }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={newCargo} onChange={e => setNewCargo(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Cargo
                    </label>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                </form>

                {clauses.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', width: '50px' }}>#</th>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Name</th>
                                <th style={{ padding: '8px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Description</th>
                                <th style={{ padding: '8px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)', width: '60px' }}>Cargo</th>
                                <th style={{ padding: '8px', textAlign: 'right', fontSize: '0.78rem', color: 'var(--text-secondary)', width: '120px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {clauses.map((c, i) => (
                                <tr key={c.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    {editingId === c.id ? (
                                        <>
                                            <td style={{ padding: '6px 8px' }}><input type="number" value={editNumber} onChange={e => setEditNumber(e.target.value)} style={{ width: '50px' }} /></td>
                                            <td style={{ padding: '6px 8px' }}><input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%' }} /></td>
                                            <td style={{ padding: '6px 8px' }}><input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ width: '100%' }} /></td>
                                            <td style={{ padding: '6px 8px', textAlign: 'center' }}><input type="checkbox" checked={editCargo} onChange={e => setEditCargo(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /></td>
                                            <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                                                    <button onClick={() => saveEdit(c.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Save size={12} /></button>
                                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><X size={12} /></button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td style={{ padding: '8px', fontWeight: 600, fontSize: '0.85rem' }}>{c.clauseNumber}</td>
                                            <td style={{ padding: '8px', fontSize: '0.85rem' }}>{c.name}</td>
                                            <td style={{ padding: '8px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c.description || '-'}</td>
                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                {c.isCargoRelated && <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                            </td>
                                            <td style={{ padding: '8px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '2px', alignItems: 'center' }}>
                                                    <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                                    <button onClick={() => handleMove(i, 'down')} disabled={i === clauses.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === clauses.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                                    <button onClick={() => startEdit(c)} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                                    <button onClick={() => handleDelete(c.id)} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                                </div>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Clause Sets */}
            <section className="glass-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '1rem' }}>Clause Sets (Presets)</h3>
                    <button onClick={() => { setShowSetForm(true); setEditingSetId(null); setSetName(''); setSetClauseIds(new Set()); setSetDescOverrides({}) }} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> New Set
                    </button>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Clause sets are pre-configured combinations of conditions. When creating a quotation, you can apply a set to quickly select multiple clauses at once. Description overrides let you customize clause text per set.</p>

                {clauseSets.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: showSetForm ? '16px' : '0' }}>
                        {clauseSets.map(s => (
                            <div key={s.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{s.name}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {(s.clauseIds || []).map(cid => {
                                        const num = clauses.find(c => c.id === cid)?.clauseNumber
                                        const hasOverride = s.descriptionOverrides?.[cid]
                                        return num ? (hasOverride ? `${num}*` : String(num)) : null
                                    }).filter(Boolean).sort().join(', ')}
                                    {s.descriptionOverrides && Object.keys(s.descriptionOverrides).some(cid => (s.clauseIds || []).includes(cid) && s.descriptionOverrides![cid]) && (
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>(* = has custom description)</span>
                                    )}
                                </span>
                                <button onClick={() => startEditSet(s)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={() => handleDeleteSet(s.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>
                )}

                {showSetForm && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                        <input type="text" value={setName} onChange={e => setSetName(e.target.value)} placeholder="Set name (e.g., Standard Cover, Restricted Cover)" style={{ width: '100%', marginBottom: '12px' }} />
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Select which clauses to include in this set:</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
                            {clauses.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => {
                                        const next = new Set(setClauseIds)
                                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id)
                                        setSetClauseIds(next)
                                    }}
                                    style={{
                                        padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem', cursor: 'pointer',
                                        border: setClauseIds.has(c.id) ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                                        background: setClauseIds.has(c.id) ? 'rgba(0, 210, 255, 0.15)' : 'transparent',
                                        color: setClauseIds.has(c.id) ? 'var(--accent-primary)' : 'var(--text-secondary)'
                                    }}
                                >
                                    Cl. {c.clauseNumber}
                                </button>
                            ))}
                        </div>
                        {/* Description overrides for selected clauses */}
                        {clauses.filter(c => setClauseIds.has(c.id)).length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Custom descriptions (optional) — override the default clause description when this set is applied:</p>
                                {clauses.filter(c => setClauseIds.has(c.id)).map(c => (
                                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.78rem', fontWeight: 600, minWidth: '50px', color: 'var(--text-secondary)' }}>Cl. {c.clauseNumber}</span>
                                        <input
                                            type="text"
                                            value={setDescOverrides[c.id] || ''}
                                            onChange={e => setSetDescOverrides(prev => ({ ...prev, [c.id]: e.target.value }))}
                                            placeholder={c.description || 'Override description...'}
                                            style={{ flex: 1, fontSize: '0.8rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setShowSetForm(false); setEditingSetId(null) }} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Cancel</button>
                            <button onClick={handleSaveSet} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} disabled={!setName.trim() || setClauseIds.size === 0}>
                                {editingSetId ? 'Update Set' : 'Create Set'}
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <CollapsibleStandardTexts
                fields={[{ key: 'conditionsIntro', label: 'Conditions Intro', rows: 2 }]}
                showSuccess={showSuccess}
            />
        </div>
    )
}

// ==================== Warranties Tab ====================

function WarrantiesTab({ showSuccess, showError, isLight }: TabProps) {
    const [warranties, setWarranties] = useState<PIWarranty[]>([])
    const [tags, setTags] = useState<PIWarrantyTag[]>([])
    const [warrantySets, setWarrantySets] = useState<PIWarrantySet[]>([])
    const [newText, setNewText] = useState('')
    const [newDefaultSelected, setNewDefaultSelected] = useState(false)
    const [newCargoRelated, setNewCargoRelated] = useState(false)
    const [newTagIds, setNewTagIds] = useState<string[]>([])
    const [newTypeScope, setNewTypeScope] = useState<string>('all')
    const [warrantyTypeFilter, setWarrantyTypeFilter] = useState<'show_all' | 'pi' | 'hull' | 'war'>('show_all')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [editDefaultSelected, setEditDefaultSelected] = useState(false)
    const [editCargoRelated, setEditCargoRelated] = useState(false)
    const [editTagIds, setEditTagIds] = useState<string[]>([])
    const [editTypeScope, setEditTypeScope] = useState<string>('all')
    // Tag management
    const [newTagName, setNewTagName] = useState('')
    const [editingTagId, setEditingTagId] = useState<string | null>(null)
    const [editTagName, setEditTagName] = useState('')
    // Set management
    const [showSetForm, setShowSetForm] = useState(false)
    const [setName, setSetName] = useState('')
    const [setWarrantyIds, setSetWarrantyIds] = useState<Set<string>>(new Set())
    const [editingSetId, setEditingSetId] = useState<string | null>(null)
    const [setDefaultSelected, setSetDefaultSelected] = useState(false)
    // Import modal
    const [showImport, setShowImport] = useState(false)
    const [importText, setImportText] = useState('')
    // Bulk tag assignment
    const [bulkMode, setBulkMode] = useState(false)
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [w, t, s] = await Promise.all([
            window.api.piGetWarranties(),
            window.api.piGetWarrantyTags(),
            window.api.piGetWarrantySets()
        ])
        setWarranties(Array.isArray(w) ? w : []); setTags(Array.isArray(t) ? t : []); setWarrantySets(Array.isArray(s) ? s : [])
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        await window.api.piAddWarranty({ text: newText, isCargoRelated: newCargoRelated, defaultSelected: newDefaultSelected, tagIds: newTagIds, typeScope: newTypeScope, order: 0 })
        setNewText(''); setNewDefaultSelected(false); setNewCargoRelated(false); setNewTagIds([]); setNewTypeScope('all')
        showSuccess('Warranty added'); loadData()
    }

    const saveEdit = async (id: string) => {
        await window.api.piUpdateWarranty(id, { text: editText, isCargoRelated: editCargoRelated, defaultSelected: editDefaultSelected, tagIds: editTagIds, typeScope: editTypeScope })
        setEditingId(null); showSuccess('Warranty updated'); loadData()
    }

    const dragWarrantySettingsRef = useRef<string | null>(null)
    const handleWarrantySettingsDragStart = (warrantyId: string) => { dragWarrantySettingsRef.current = warrantyId }
    const handleWarrantySettingsDrop = async (targetId: string) => {
        const dragId = dragWarrantySettingsRef.current
        dragWarrantySettingsRef.current = null
        if (!dragId || dragId === targetId) return
        const newOrder = [...warranties]
        const fromIdx = newOrder.findIndex(w => w.id === dragId)
        const toIdx = newOrder.findIndex(w => w.id === targetId)
        if (fromIdx === -1 || toIdx === -1) return
        const [moved] = newOrder.splice(fromIdx, 1)
        newOrder.splice(toIdx, 0, moved)
        setWarranties(newOrder)
        await window.api.piReorderWarranties(newOrder.map(w => w.id))
    }

    const handleAddTag = async () => {
        if (!newTagName.trim()) return
        await window.api.piAddWarrantyTag(newTagName.trim())
        setNewTagName('')
        showSuccess('Tag added'); loadData()
    }

    const handleSaveTag = async (id: string) => {
        await window.api.piUpdateWarrantyTag(id, editTagName)
        setEditingTagId(null); showSuccess('Tag updated'); loadData()
    }

    const toggleTagId = (tagId: string, current: string[], setter: (ids: string[]) => void) => {
        setter(current.includes(tagId) ? current.filter(t => t !== tagId) : [...current, tagId])
    }

    const tagChip = (tagId: string, selected: boolean, onClick: () => void) => {
        const tag = tags.find(t => t.id === tagId)
        if (!tag) return null
        return (
            <span key={tagId} onClick={onClick} style={{
                fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', cursor: 'pointer',
                background: selected ? 'rgba(0, 210, 255, 0.2)' : 'transparent',
                border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)'
            }}>{tag.name}</span>
        )
    }

    // Warranty set handlers
    const handleSaveSet = async () => {
        if (!setName.trim() || setWarrantyIds.size === 0) return
        try {
            if (editingSetId) {
                await window.api.piUpdateWarrantySet(editingSetId, setName, Array.from(setWarrantyIds), setDefaultSelected)
                showSuccess('Warranty set updated')
            } else {
                await window.api.piAddWarrantySet(setName, Array.from(setWarrantyIds), setDefaultSelected)
                showSuccess('Warranty set created')
            }
            setShowSetForm(false); setSetName(''); setSetWarrantyIds(new Set()); setEditingSetId(null); setSetDefaultSelected(false)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to save set') }
    }

    // Import handler
    const handleImport = async () => {
        const lines = importText.split('\n')
            .map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219]+/, '').trim())
            .filter(l => l.length > 0)
        if (lines.length === 0) return
        for (const line of lines) {
            await window.api.piAddWarranty({ text: line, isCargoRelated: false, defaultSelected: false, tagIds: [], typeScope: 'all', order: 0 })
        }
        showSuccess(`Imported ${lines.length} warranties`)
        setImportText(''); setShowImport(false); loadData()
    }

    const toggleBulkSelect = (id: string) => {
        const n = new Set(bulkSelected)
        n.has(id) ? n.delete(id) : n.add(id)
        setBulkSelected(n)
    }
    const bulkSelectAll = () => setBulkSelected(new Set(warranties.map(w => w.id)))
    const bulkDeselectAll = () => setBulkSelected(new Set())
    const bulkAssignTag = async (tagId: string) => {
        const toUpdate = warranties.filter(w => bulkSelected.has(w.id) && !(w.tagIds || []).includes(tagId))
        for (const w of toUpdate) {
            await window.api.piUpdateWarranty(w.id, { text: w.text, isCargoRelated: w.isCargoRelated, defaultSelected: w.defaultSelected, tagIds: [...(w.tagIds || []), tagId] })
        }
        if (toUpdate.length > 0) { showSuccess(`Tag assigned to ${toUpdate.length} warranties`); loadData() }
    }
    const bulkRemoveTag = async (tagId: string) => {
        const toUpdate = warranties.filter(w => bulkSelected.has(w.id) && (w.tagIds || []).includes(tagId))
        for (const w of toUpdate) {
            await window.api.piUpdateWarranty(w.id, { text: w.text, isCargoRelated: w.isCargoRelated, defaultSelected: w.defaultSelected, tagIds: (w.tagIds || []).filter(t => t !== tagId) })
        }
        if (toUpdate.length > 0) { showSuccess(`Tag removed from ${toUpdate.length} warranties`); loadData() }
    }
    const bulkToggleCargo = async (value: boolean) => {
        const toUpdate = warranties.filter(w => bulkSelected.has(w.id) && w.isCargoRelated !== value)
        for (const w of toUpdate) {
            await window.api.piUpdateWarranty(w.id, { text: w.text, isCargoRelated: value, defaultSelected: w.defaultSelected, tagIds: w.tagIds || [] })
        }
        if (toUpdate.length > 0) { showSuccess(`${toUpdate.length} warranties updated`); loadData() }
    }
    const bulkToggleDefault = async (value: boolean) => {
        const toUpdate = warranties.filter(w => bulkSelected.has(w.id) && w.defaultSelected !== value)
        for (const w of toUpdate) {
            await window.api.piUpdateWarranty(w.id, { text: w.text, isCargoRelated: w.isCargoRelated, defaultSelected: value, tagIds: w.tagIds || [] })
        }
        if (toUpdate.length > 0) { showSuccess(`${toUpdate.length} warranties updated`); loadData() }
    }

    const ckStyle = { width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }

    const filteredWarranties = warrantyTypeFilter === 'show_all'
        ? warranties
        : warranties.filter(w => !w.typeScope || w.typeScope === 'all' || w.typeScope.split(',').includes(warrantyTypeFilter))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tag Manager */}
            <section className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}><Tag size={14} /> Warranty Tags</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Tags let you categorize warranties into groups (e.g. "Cargo", "Navigation"). Tagged warranties appear under their own tab in the quotation editor.</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    {tags.map(tag => (
                        <div key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '16px', border: '1px solid var(--glass-border)', fontSize: '0.8rem' }}>
                            {editingTagId === tag.id ? (
                                <>
                                    <input value={editTagName} onChange={e => setEditTagName(e.target.value)} style={{ width: '80px', fontSize: '0.8rem', padding: '2px 4px' }} onKeyDown={e => e.key === 'Enter' && handleSaveTag(tag.id)} />
                                    <button onClick={() => handleSaveTag(tag.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '0' }}><Save size={12} /></button>
                                    <button onClick={() => setEditingTagId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0' }}><X size={12} /></button>
                                </>
                            ) : (
                                <>
                                    <span>{tag.name}</span>
                                    <button onClick={() => { setEditingTagId(tag.id); setEditTagName(tag.name) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0' }}><Pencil size={10} /></button>
                                    <button onClick={async () => { await window.api.piDeleteWarrantyTag(tag.id); showSuccess('Tag deleted'); loadData() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={10} /></button>
                                </>
                            )}
                        </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="New tag..." style={{ width: '100px', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} onKeyDown={e => e.key === 'Enter' && handleAddTag()} />
                        <button onClick={handleAddTag} className="btn-primary" style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '10px' }}><Plus size={12} /></button>
                    </div>
                </div>
            </section>

            {/* Warranty Sets */}
            <section className="glass-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: 0 }}><Shield size={14} /> Warranty Sets</h3>
                    {!showSetForm && <button onClick={() => { setShowSetForm(true); setEditingSetId(null); setSetName(''); setSetWarrantyIds(new Set()); setSetDefaultSelected(false) }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Plus size={14} /> New Set</button>}
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Sets are named groups of warranties that can be quickly applied to a quotation. Sets marked "Default" are automatically selected when creating new quotations.</p>
                {showSetForm && (
                    <div style={{ padding: '12px', borderRadius: '8px', border: '1px solid var(--accent-primary)', marginBottom: '10px' }}>
                        <input value={setName} onChange={e => setSetName(e.target.value)} placeholder="Set name (e.g. Cargo Warranties)..." style={{ width: '100%', marginBottom: '8px', padding: '6px 10px' }} />
                        <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '8px' }}>
                            {warranties.map(w => (
                                <label key={w.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={setWarrantyIds.has(w.id)} onChange={() => { const n = new Set(setWarrantyIds); n.has(w.id) ? n.delete(w.id) : n.add(w.id); setSetWarrantyIds(n) }} style={ckStyle} />
                                    <span style={{ whiteSpace: 'pre-wrap' }}>{w.text}</span>
                                </label>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', marginRight: 'auto' }}>
                                <input type="checkbox" checked={setDefaultSelected} onChange={e => setSetDefaultSelected(e.target.checked)} style={ckStyle} /> Selected by default in new quotations
                            </label>
                            <button onClick={() => { setShowSetForm(false); setEditingSetId(null) }} className="btn-secondary" style={{ fontSize: '0.78rem' }}>Cancel</button>
                            <button onClick={handleSaveSet} className="btn-primary" style={{ fontSize: '0.78rem' }}>{editingSetId ? 'Update' : 'Create'} Set</button>
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {warrantySets.map(ws => (
                        <div key={ws.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--glass-border)', fontSize: '0.82rem' }}>
                            <span>{ws.name}</span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>({(ws.warrantyIds || []).length})</span>
                            {ws.defaultSelected && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(0, 200, 100, 0.15)', color: '#00c864' }}>Default</span>}
                            <button onClick={() => { setShowSetForm(true); setEditingSetId(ws.id); setSetName(ws.name); setSetWarrantyIds(new Set(ws.warrantyIds || [])); setSetDefaultSelected(!!ws.defaultSelected) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '0' }}><Pencil size={12} /></button>
                            <button onClick={async () => { await window.api.piDeleteWarrantySet(ws.id); showSuccess('Set deleted'); loadData() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><Trash2 size={12} /></button>
                        </div>
                    ))}
                    {warrantySets.length === 0 && !showSetForm && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No sets created yet.</span>}
                </div>
            </section>

            {/* Warranties List */}
            <section className="glass-card" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <h3 style={{ fontSize: '1rem', margin: 0 }}>Warranties</h3>
                        <div style={{ display: 'flex', gap: '4px' }}>
                            {(['show_all', 'pi', 'hull', 'war'] as const).map(f => (
                                <button key={f} onClick={() => setWarrantyTypeFilter(f)} style={{
                                    padding: '3px 10px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                    border: warrantyTypeFilter === f ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                                    background: warrantyTypeFilter === f ? 'rgba(0,170,200,0.12)' : 'transparent',
                                    color: warrantyTypeFilter === f ? (isLight ? '#007a91' : '#00aac8') : 'var(--text-secondary)'
                                }}>{f === 'show_all' ? 'All' : f === 'pi' ? 'P&I' : f === 'hull' ? 'Hull' : 'War'}</button>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()) }} className={bulkMode ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }} title="Select multiple warranties to assign/remove tags, cargo, or default status in bulk"><Tag size={14} /> Bulk Tag</button>
                        <button onClick={() => setShowImport(true)} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Upload size={14} /> Import</button>
                    </div>
                </div>
                {bulkMode && (
                    <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.06)', border: '1px solid var(--accent-primary)', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{bulkSelected.size} selected</span>
                        <button onClick={bulkSelectAll} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.72rem' }}>Select All</button>
                        <button onClick={bulkDeselectAll} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.72rem' }}>Deselect All</button>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 4px' }}>|</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Assign tag:</span>
                        {tags.map(t => (
                            <span key={t.id} onClick={() => bulkSelected.size > 0 && bulkAssignTag(t.id)} style={{
                                fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default',
                                background: 'rgba(0, 210, 255, 0.15)', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)',
                                opacity: bulkSelected.size > 0 ? 1 : 0.4
                            }}>+ {t.name}</span>
                        ))}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Remove tag:</span>
                        {tags.map(t => (
                            <span key={t.id} onClick={() => bulkSelected.size > 0 && bulkRemoveTag(t.id)} style={{
                                fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default',
                                background: 'rgba(255, 80, 80, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)',
                                opacity: bulkSelected.size > 0 ? 1 : 0.4
                            }}>- {t.name}</span>
                        ))}
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 4px' }}>|</span>
                        <span onClick={() => bulkSelected.size > 0 && bulkToggleCargo(true)} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default', background: 'rgba(255, 180, 0, 0.12)', border: '1px solid #ffb400', color: '#ffb400', opacity: bulkSelected.size > 0 ? 1 : 0.4 }}>+ Cargo</span>
                        <span onClick={() => bulkSelected.size > 0 && bulkToggleCargo(false)} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default', background: 'rgba(255, 80, 80, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', opacity: bulkSelected.size > 0 ? 1 : 0.4 }}>- Cargo</span>
                        <span onClick={() => bulkSelected.size > 0 && bulkToggleDefault(true)} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default', background: 'rgba(0, 200, 100, 0.12)', border: '1px solid #00c864', color: '#00c864', opacity: bulkSelected.size > 0 ? 1 : 0.4 }}>+ Default</span>
                        <span onClick={() => bulkSelected.size > 0 && bulkToggleDefault(false)} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default', background: 'rgba(255, 80, 80, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', opacity: bulkSelected.size > 0 ? 1 : 0.4 }}>- Default</span>
                    </div>
                )}
                <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Enter warranty text... (e.g. Vessel to trade exclusively between safe ports and anchorages)" style={{ flex: 1, minHeight: '60px', resize: 'vertical' }} required />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={newDefaultSelected} onChange={e => setNewDefaultSelected(e.target.checked)} style={ckStyle} /> Default selected
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={newCargoRelated} onChange={e => setNewCargoRelated(e.target.checked)} style={ckStyle} /> Cargo related
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Scope:</span>
                            {[{ v: 'all', l: 'All' }, { v: 'pi', l: 'P&I' }, { v: 'hull', l: 'Hull' }, { v: 'war', l: 'War' }, { v: 'cargo', l: 'Cargo' }].map(s => {
                                const active = s.v === 'all' ? newTypeScope === 'all' : newTypeScope !== 'all' && newTypeScope.split(',').includes(s.v)
                                return <button key={s.v} type="button" onClick={() => {
                                    if (s.v === 'all') { setNewTypeScope('all') }
                                    else {
                                        const parts = newTypeScope === 'all' ? [] : newTypeScope.split(',').filter(Boolean)
                                        const next = active ? parts.filter(p => p !== s.v) : [...parts, s.v]
                                        setNewTypeScope(next.length === 0 ? 'all' : next.join(','))
                                    }
                                }} style={{ padding: '2px 8px', borderRadius: '4px', border: active ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: active ? 'rgba(0,170,200,0.1)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '0.72rem' }}>{s.l}</button>
                            })}
                        </div>
                        {tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {tags.map(t => tagChip(t.id, newTagIds.includes(t.id), () => toggleTagId(t.id, newTagIds, setNewTagIds)))}
                            </div>
                        )}
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                    </div>
                </form>

                {filteredWarranties.map((w) => (
                    <div key={w.id} draggable onDragStart={() => handleWarrantySettingsDragStart(w.id)} onDragOver={e => e.preventDefault()} onDrop={() => handleWarrantySettingsDrop(w.id)} style={{ padding: '10px 14px', borderRadius: '8px', border: bulkMode && bulkSelected.has(w.id) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start', background: bulkMode && bulkSelected.has(w.id) ? 'rgba(0, 210, 255, 0.04)' : 'transparent', cursor: 'grab' }}>
                        {bulkMode && (
                            <input type="checkbox" checked={bulkSelected.has(w.id)} onChange={() => toggleBulkSelect(w.id)} style={{ ...ckStyle, marginTop: '3px', flexShrink: 0 }} />
                        )}
                        {editingId === w.id ? (
                            <div style={{ flex: 1 }}>
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }} />
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={editDefaultSelected} onChange={e => setEditDefaultSelected(e.target.checked)} style={ckStyle} /> Default
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={editCargoRelated} onChange={e => setEditCargoRelated(e.target.checked)} style={ckStyle} /> Cargo
                                    </label>
                                    {[{ v: 'all', l: 'All' }, { v: 'pi', l: 'P&I' }, { v: 'hull', l: 'Hull' }, { v: 'war', l: 'War' }, { v: 'cargo', l: 'Cargo' }].map(s => {
                                        const active = s.v === 'all' ? editTypeScope === 'all' : editTypeScope !== 'all' && editTypeScope.split(',').includes(s.v)
                                        return <button key={s.v} type="button" onClick={() => {
                                            if (s.v === 'all') { setEditTypeScope('all') }
                                            else {
                                                const parts = editTypeScope === 'all' ? [] : editTypeScope.split(',').filter(Boolean)
                                                const next = active ? parts.filter(p => p !== s.v) : [...parts, s.v]
                                                setEditTypeScope(next.length === 0 ? 'all' : next.join(','))
                                            }
                                        }} style={{ padding: '2px 6px', borderRadius: '4px', border: active ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: active ? 'rgba(0,170,200,0.1)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '0.72rem' }}>{s.l}</button>
                                    })}
                                    {tags.length > 0 && tags.map(t => tagChip(t.id, editTagIds.includes(t.id), () => toggleTagId(t.id, editTagIds, setEditTagIds)))}
                                    <div style={{ flex: 1 }} />
                                    <button onClick={() => saveEdit(w.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{w.text}</div>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                        {w.defaultSelected && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0, 200, 100, 0.15)', color: '#00c864' }}>Default</span>}
                                        {w.isCargoRelated && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                        {w.typeScope && w.typeScope !== 'all' && w.typeScope.split(',').map(s => {
                                            const colors: Record<string, { bg: string; fg: string; label: string }> = { pi: { bg: 'rgba(100,100,255,0.15)', fg: '#6464ff', label: 'P&I' }, hull: { bg: 'rgba(255,100,200,0.15)', fg: '#ff64c8', label: 'Hull' }, war: { bg: 'rgba(255,176,32,0.15)', fg: '#ffb020', label: 'War' }, cargo: { bg: 'rgba(50,184,134,0.15)', fg: '#32b886', label: 'Cargo' } }
                                            const c = colors[s.trim()] || { bg: 'rgba(150,150,150,0.15)', fg: '#999', label: s.trim() }
                                            return <span key={s} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: c.bg, color: c.fg }}>{c.label}</span>
                                        })}
                                        {(w.tagIds || []).map(tid => {
                                            const tag = tags.find(t => t.id === tid)
                                            return tag ? <span key={tid} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.12)', color: 'var(--accent-primary)' }}>{tag.name}</span> : null
                                        })}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                    <span style={{ cursor: 'grab', color: 'var(--text-secondary)', opacity: 0.4, fontSize: '0.8rem', padding: '0 4px' }} title="Drag to reorder">⠿</span>
                                    <button onClick={() => { setEditingId(w.id); setEditText(w.text); setEditDefaultSelected(w.defaultSelected); setEditCargoRelated(w.isCargoRelated); setEditTagIds(w.tagIds || []); setEditTypeScope(w.typeScope || 'all') }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                    <button onClick={async () => { await window.api.piDeleteWarranty(w.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </section>

            {/* Import Modal */}
            {showImport && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                            <h3 style={{ fontSize: '1rem' }}>Import Warranties</h3>
                            <button onClick={() => setShowImport(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>Paste warranties below (one per line). Bullet points, dashes, and leading symbols will be stripped automatically.</p>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px', padding: '8px 12px', borderRadius: '6px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)' }}>
                            <strong>Tip:</strong> Copy warranty text from a Word document or PDF and paste it here. Each line becomes a separate warranty. Bullets, dashes, and numbers at the start of lines are automatically stripped.
                        </div>
                        <textarea
                            value={importText}
                            onChange={e => setImportText(e.target.value)}
                            placeholder={'- First warranty text\n- Second warranty text\n• Third warranty text'}
                            style={{ flex: 1, minHeight: '300px', resize: 'vertical', marginBottom: '12px', fontFamily: 'monospace', fontSize: '0.85rem' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {importText.split('\n').map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219]+/, '').trim()).filter(l => l.length > 0).length} warranties detected
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => setShowImport(false)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                                <button onClick={handleImport} className="btn-primary" style={{ fontSize: '0.82rem' }}>Import</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== Deductibles Tab ====================

function DeductiblesTab({ showSuccess }: TabProps) {
    const [deductibles, setDeductibles] = useState<PIDeductible[]>([])
    const [textDeds, setTextDeds] = useState<PITextDeductible[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [newCode, setNewCode] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newHasSecondary, setNewHasSecondary] = useState(false)
    const [newSecDesc, setNewSecDesc] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editCode, setEditCode] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [editHasSecondary, setEditHasSecondary] = useState(false)
    const [editSecDesc, setEditSecDesc] = useState('')
    // Text deductible state
    const [newTextTitle, setNewTextTitle] = useState('')
    const [newTextDed, setNewTextDed] = useState('')
    const [newTextDefault, setNewTextDefault] = useState(false)
    const [editingTextId, setEditingTextId] = useState<string | null>(null)
    const [editTextTitle, setEditTextTitle] = useState('')
    const [editTextDedText, setEditTextDedText] = useState('')
    const [editTextDefault, setEditTextDefault] = useState(false)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [d, td] = await Promise.all([window.api.piGetDeductibles(), window.api.piGetTextDeductibles()])
        setDeductibles(Array.isArray(d) ? d : [])
        setTextDeds(Array.isArray(td) ? td : [])
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim()) return
        await window.api.piAddDeductible({
            title: newTitle, letterCode: newCode || undefined, description: newDesc, defaultAmount: 0, defaultCurrency: 'USD',
            hasSecondary: newHasSecondary, secondaryDescription: newSecDesc || undefined, order: 0
        })
        setNewTitle(''); setNewCode(''); setNewDesc(''); setNewHasSecondary(false); setNewSecDesc('')
        showSuccess('Deductible added'); loadData()
    }

    const saveEdit = async (id: string) => {
        await window.api.piUpdateDeductible(id, {
            title: editTitle, letterCode: editCode || undefined, description: editDesc, hasSecondary: editHasSecondary,
            secondaryDescription: editSecDesc || undefined
        })
        setEditingId(null); showSuccess('Deductible updated'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...deductibles]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setDeductibles(newOrder)
        await window.api.piReorderDeductibles(newOrder.map(d => d.id))
    }

    const handleAddTextDed = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTextTitle.trim()) return
        await window.api.piAddTextDeductible({ title: newTextTitle, text: newTextDed, defaultIncluded: newTextDefault })
        setNewTextTitle(''); setNewTextDed(''); setNewTextDefault(false)
        showSuccess('Text deductible added'); loadData()
    }

    const saveTextEdit = async (id: string) => {
        await window.api.piUpdateTextDeductible(id, { title: editTextTitle, text: editTextDedText, defaultIncluded: editTextDefault })
        setEditingTextId(null); showSuccess('Text deductible updated'); loadData()
    }

    const handleTextMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...textDeds]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setTextDeds(newOrder)
        await window.api.piReorderTextDeductibles(newOrder.map(d => d.id))
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>P&I Deductibles</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Define deductible types here. Amounts are set per quotation. For multi-value deductibles, use <code style={{ fontSize: '0.75rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 210, 255, 0.1)' }}>{'{currency} {amount}'}</code> in the secondary description to position the second amount.</p>
            <form onSubmit={handleAdd} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title (e.g. Crew Claims)" style={{ width: '200px' }} required />
                    <input type="text" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code" title="Letter code for QB export (e.g. C, P, O)" maxLength={3} style={{ width: '50px', textAlign: 'center', textTransform: 'uppercase' }} />
                    <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description..." style={{ flex: 1 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={newHasSecondary} onChange={e => setNewHasSecondary(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Has secondary
                    </label>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                </div>
                {newHasSecondary && (
                    <div style={{ marginTop: '8px' }}>
                        <input type="text" value={newSecDesc} onChange={e => setNewSecDesc(e.target.value)} placeholder="e.g. or one third up to {currency} {amount} for pollution claims" style={{ width: '100%' }} />
                    </div>
                )}
            </form>

            {deductibles.map((d, i) => (
                <div key={d.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {editingId === d.id ? (
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input type="text" value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" style={{ width: '200px' }} />
                                <input type="text" value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="Code" title="Letter code for QB export" maxLength={3} style={{ width: '50px', textAlign: 'center', textTransform: 'uppercase' }} />
                                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" style={{ flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editHasSecondary} onChange={e => setEditHasSecondary(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Secondary
                                </label>
                                {editHasSecondary && (
                                    <input type="text" value={editSecDesc} onChange={e => setEditSecDesc(e.target.value)} placeholder="e.g. or one third up to {currency} {amount}..." style={{ flex: 1 }} />
                                )}
                                <div style={{ flex: 1 }} />
                                <button onClick={() => saveEdit(d.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{d.title}</span>
                                {d.letterCode && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 176, 32, 0.15)', color: '#b07a10', marginLeft: '6px', fontWeight: 700, fontFamily: 'monospace' }}>{d.letterCode}</span>}
                                {d.hasSecondary && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.12)', color: 'var(--accent-primary)', marginLeft: '6px' }}>Multi-value</span>}
                                {d.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{d.description}</div>}
                                {d.hasSecondary && d.secondaryDescription && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px', paddingLeft: '12px' }}>
                                        {d.secondaryDescription}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === deductibles.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === deductibles.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(d.id); setEditTitle(d.title || ''); setEditCode(d.letterCode || ''); setEditDesc(d.description); setEditHasSecondary(d.hasSecondary); setEditSecDesc(d.secondaryDescription || '') }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteDeductible(d.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </section>

        {/* Text Deductibles (Master) */}
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Text Deductibles</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Predefined text blocks that appear below the deductibles table. Mark as "Default" to auto-include in new quotations.</p>
            <form onSubmit={handleAddTextDed} style={{ marginBottom: '16px' }}>
                <input type="text" value={newTextTitle} onChange={e => setNewTextTitle(e.target.value)} placeholder="Title (e.g. Asbestos Clause)" style={{ width: '100%', marginBottom: '8px' }} required />
                <textarea value={newTextDed} onChange={e => setNewTextDed(e.target.value)} placeholder="Text content..." style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', marginRight: 'auto' }}>
                        <input type="checkbox" checked={newTextDefault} onChange={e => setNewTextDefault(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Include by default
                    </label>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                </div>
            </form>
            {textDeds.map((td, i) => (
                <div key={td.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {editingTextId === td.id ? (
                        <div style={{ flex: 1 }}>
                            <input type="text" value={editTextTitle} onChange={e => setEditTextTitle(e.target.value)} placeholder="Title" style={{ width: '100%', marginBottom: '8px' }} />
                            <textarea value={editTextDedText} onChange={e => setEditTextDedText(e.target.value)} style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }} />
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', marginRight: 'auto' }}>
                                    <input type="checkbox" checked={editTextDefault} onChange={e => setEditTextDefault(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} /> Include by default
                                </label>
                                <button onClick={() => saveTextEdit(td.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingTextId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1 }}>
                                {td.title && <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>{td.title}</div>}
                                {td.text && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{td.text}</div>}
                                {td.defaultIncluded && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(0, 200, 100, 0.15)', color: '#00c864', marginTop: '4px', display: 'inline-block' }}>Default</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleTextMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleTextMove(i, 'down')} disabled={i === textDeds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === textDeds.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingTextId(td.id); setEditTextTitle(td.title || ''); setEditTextDedText(td.text); setEditTextDefault(td.defaultIncluded) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteTextDeductible(td.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
            {textDeds.length === 0 && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No text deductibles defined.</p>}
        </section>
        </div>
    )
}

// ==================== Exclusions Tab ====================

function ExclusionsTab({ showSuccess, isLight }: TabProps) {
    const [exclusions, setExclusions] = useState<PIExclusion[]>([])
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [newText, setNewText] = useState('')
    const [newCargoRelated, setNewCargoRelated] = useState(false)
    const [newVesselTypeIds, setNewVesselTypeIds] = useState<string[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [editCargoRelated, setEditCargoRelated] = useState(false)
    const [editVesselTypeIds, setEditVesselTypeIds] = useState<string[]>([])
    const [bulkMode, setBulkMode] = useState(false)
    const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
    const [showImport, setShowImport] = useState(false)
    const [importText, setImportText] = useState('')

    const ckStyle: React.CSSProperties = { width: '15px', height: '15px', accentColor: 'var(--accent-primary)' }

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [ex, vt] = await Promise.all([
            window.api.piGetExclusions(),
            window.api.getVesselTypes()
        ])
        setExclusions(Array.isArray(ex) ? ex : [])
        setVesselTypes(Array.isArray(vt) ? vt : [])
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        await window.api.piAddExclusion({ text: newText, isCargoRelated: newCargoRelated, vesselTypeIds: newVesselTypeIds })
        setNewText(''); setNewCargoRelated(false); setNewVesselTypeIds([])
        showSuccess('Exclusion added'); loadData()
    }

    const saveEdit = async (id: string) => {
        await window.api.piUpdateExclusion(id, { text: editText, isCargoRelated: editCargoRelated, vesselTypeIds: editVesselTypeIds })
        setEditingId(null); showSuccess('Updated'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...exclusions]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setExclusions(newOrder)
        await window.api.piReorderExclusions(newOrder.map(e => e.id))
    }

    const toggleVT = (vtId: string, current: string[], setter: (ids: string[]) => void) => {
        setter(current.includes(vtId) ? current.filter(id => id !== vtId) : [...current, vtId])
    }

    const toggleBulkSelect = (id: string) => {
        const n = new Set(bulkSelected)
        if (n.has(id)) n.delete(id); else n.add(id)
        setBulkSelected(n)
    }
    const bulkSelectAll = () => setBulkSelected(new Set(exclusions.map(e => e.id)))
    const bulkDeselectAll = () => setBulkSelected(new Set())

    const bulkToggleCargo = async (value: boolean) => {
        const toUpdate = exclusions.filter(e => bulkSelected.has(e.id) && e.isCargoRelated !== value)
        for (const e of toUpdate) {
            await window.api.piUpdateExclusion(e.id, { text: e.text, isCargoRelated: value, vesselTypeIds: e.vesselTypeIds || [] })
        }
        if (toUpdate.length > 0) { showSuccess(`${toUpdate.length} exclusions updated`); loadData() }
    }

    const bulkAssignVT = async (vtId: string) => {
        const toUpdate = exclusions.filter(e => bulkSelected.has(e.id) && !(e.vesselTypeIds || []).includes(vtId))
        for (const e of toUpdate) {
            await window.api.piUpdateExclusion(e.id, { text: e.text, isCargoRelated: e.isCargoRelated, vesselTypeIds: [...(e.vesselTypeIds || []), vtId] })
        }
        if (toUpdate.length > 0) { showSuccess(`Vessel type assigned to ${toUpdate.length} exclusions`); loadData() }
    }

    const bulkRemoveVT = async (vtId: string) => {
        const toUpdate = exclusions.filter(e => bulkSelected.has(e.id) && (e.vesselTypeIds || []).includes(vtId))
        for (const e of toUpdate) {
            await window.api.piUpdateExclusion(e.id, { text: e.text, isCargoRelated: e.isCargoRelated, vesselTypeIds: (e.vesselTypeIds || []).filter(id => id !== vtId) })
        }
        if (toUpdate.length > 0) { showSuccess(`Vessel type removed from ${toUpdate.length} exclusions`); loadData() }
    }

    const handleImport = async () => {
        const lines = importText.split('\n')
            .map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219\d.)+]+/, '').trim())
            .filter(l => l.length > 0)
        if (lines.length === 0) return
        for (const line of lines) {
            await window.api.piAddExclusion({ text: line, isCargoRelated: false, vesselTypeIds: [] })
        }
        showSuccess(`Imported ${lines.length} exclusions`)
        setImportText(''); setShowImport(false); loadData()
    }

    const vtChip = (vtId: string, active: boolean, onClick: () => void) => {
        const vt = vesselTypes.find(v => v.id === vtId)
        if (!vt) return null
        return (
            <span key={vtId} onClick={onClick} style={{
                fontSize: '0.68rem', padding: '1px 7px', borderRadius: '10px', cursor: 'pointer',
                background: active ? 'rgba(160, 100, 255, 0.15)' : 'transparent',
                border: `1px solid ${active ? '#a064ff' : 'var(--table-border)'}`,
                color: active ? '#a064ff' : 'var(--text-secondary)'
            }}>{vt.name}</span>
        )
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>P&I Exclusions</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()) }} className={bulkMode ? 'btn-primary' : 'btn-secondary'} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={14} /> Bulk Edit</button>
                    <button onClick={() => setShowImport(true)} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Upload size={14} /> Import</button>
                </div>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Define exclusion clauses that remove specific risks from coverage. Exclusions can be linked to vessel types to auto-apply based on the vessel in a quotation.</p>

            {bulkMode && (
                <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.06)', border: '1px solid var(--accent-primary)', marginBottom: '12px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{bulkSelected.size} selected</span>
                    <button onClick={bulkSelectAll} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.72rem' }}>Select All</button>
                    <button onClick={bulkDeselectAll} className="btn-secondary" style={{ padding: '3px 8px', fontSize: '0.72rem' }}>Deselect All</button>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 4px' }}>|</span>
                    <span onClick={() => bulkSelected.size > 0 && bulkToggleCargo(true)} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default', background: 'rgba(255, 180, 0, 0.12)', border: '1px solid #ffb400', color: '#ffb400', opacity: bulkSelected.size > 0 ? 1 : 0.4 }}>+ Cargo</span>
                    <span onClick={() => bulkSelected.size > 0 && bulkToggleCargo(false)} style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default', background: 'rgba(255, 80, 80, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)', opacity: bulkSelected.size > 0 ? 1 : 0.4 }}>- Cargo</span>
                    {vesselTypes.length > 0 && (
                        <>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 4px' }}>|</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Assign type:</span>
                            {vesselTypes.map(vt => (
                                <span key={vt.id} onClick={() => bulkSelected.size > 0 && bulkAssignVT(vt.id)} style={{
                                    fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default',
                                    background: 'rgba(160, 100, 255, 0.12)', border: '1px solid #a064ff', color: '#a064ff',
                                    opacity: bulkSelected.size > 0 ? 1 : 0.4
                                }}>+ {vt.name}</span>
                            ))}
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Remove:</span>
                            {vesselTypes.map(vt => (
                                <span key={vt.id} onClick={() => bulkSelected.size > 0 && bulkRemoveVT(vt.id)} style={{
                                    fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', cursor: bulkSelected.size > 0 ? 'pointer' : 'default',
                                    background: 'rgba(255, 80, 80, 0.1)', border: '1px solid var(--danger)', color: 'var(--danger)',
                                    opacity: bulkSelected.size > 0 ? 1 : 0.4
                                }}>- {vt.name}</span>
                            ))}
                        </>
                    )}
                </div>
            )}

            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Exclusion text..." style={{ width: '100%', minHeight: '50px', resize: 'vertical', marginBottom: '6px' }} required />
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={newCargoRelated} onChange={e => setNewCargoRelated(e.target.checked)} style={ckStyle} /> Cargo-related
                        </label>
                        {vesselTypes.map(vt => vtChip(vt.id, newVesselTypeIds.includes(vt.id), () => toggleVT(vt.id, newVesselTypeIds, setNewVesselTypeIds)))}
                    </div>
                </div>
                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end' }}><Plus size={16} /> Add</button>
            </form>

            {exclusions.map((ex, i) => (
                <div key={ex.id} style={{ padding: '10px 14px', borderRadius: '8px', border: bulkMode && bulkSelected.has(ex.id) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start', background: bulkMode && bulkSelected.has(ex.id) ? 'rgba(0, 210, 255, 0.04)' : 'transparent' }}>
                    {bulkMode && (
                        <input type="checkbox" checked={bulkSelected.has(ex.id)} onChange={() => toggleBulkSelect(ex.id)} style={{ ...ckStyle, marginTop: '3px', flexShrink: 0 }} />
                    )}
                    {editingId === ex.id ? (
                        <div style={{ flex: 1 }}>
                            <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: '50px', resize: 'vertical', marginBottom: '8px' }} />
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editCargoRelated} onChange={e => setEditCargoRelated(e.target.checked)} style={ckStyle} /> Cargo-related
                                </label>
                                {vesselTypes.map(vt => vtChip(vt.id, editVesselTypeIds.includes(vt.id), () => toggleVT(vt.id, editVesselTypeIds, setEditVesselTypeIds)))}
                                <div style={{ flex: 1 }} />
                                <button onClick={() => saveEdit(ex.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{ex.text}</div>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                                    {ex.isCargoRelated && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                    {(ex.vesselTypeIds || []).map(vtId => {
                                        const vt = vesselTypes.find(v => v.id === vtId)
                                        return vt ? <span key={vtId} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(160, 100, 255, 0.12)', color: '#a064ff' }}>{vt.name}</span> : null
                                    })}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === exclusions.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === exclusions.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(ex.id); setEditText(ex.text); setEditCargoRelated(ex.isCargoRelated); setEditVesselTypeIds(ex.vesselTypeIds || []) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteExclusion(ex.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}

            {showImport && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImport(false)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '500px', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Import Exclusions</h3>
                            <button onClick={() => setShowImport(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Paste exclusions (one per line). Bullets, dashes, and numbering will be stripped.</p>
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste exclusions here..." style={{ width: '100%', minHeight: '200px', resize: 'vertical', marginBottom: '12px' }} />
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowImport(false)} className="btn-secondary">Cancel</button>
                            <button onClick={handleImport} className="btn-primary" disabled={!importText.trim()}>Import</button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

// ==================== Sub-Limits Tab ====================

function SubLimitsTab({ showSuccess }: TabProps) {
    const [templates, setTemplates] = useState<PISubLimitTemplate[]>([])
    const [newTemplate, setNewTemplate] = useState('')
    const [newCurrency, setNewCurrency] = useState('USD')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTemplate, setEditTemplate] = useState('')
    const [editCurrency, setEditCurrency] = useState('USD')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setTemplates(await window.api.piGetSubLimitTemplates()) }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTemplate.trim()) return
        await window.api.piAddSubLimitTemplate({ textTemplate: newTemplate, defaultAmount: 0, defaultCurrency: newCurrency, order: 0 })
        setNewTemplate(''); setNewCurrency('USD')
        showSuccess('Sub-limit template added'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...templates]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setTemplates(newOrder)
        await window.api.piReorderSubLimitTemplates(newOrder.map(t => t.id))
    }

    return (<div>
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Limits of Liability Templates</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Define sub-limit templates that cap liability for specific risk categories. Use <code style={{ fontSize: '0.75rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 210, 255, 0.1)' }}>{'{amount}'}</code> and <code style={{ fontSize: '0.75rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 210, 255, 0.1)' }}>{'{currency}'}</code> as placeholders — actual values are set per quotation.</p>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <input type="text" value={newTemplate} onChange={e => setNewTemplate(e.target.value)} placeholder='e.g., Liability for crew sub-limited to {currency} {amount} any one accident...' style={{ flex: 1 }} required />
                <input type="text" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} placeholder="CCY" style={{ width: '70px' }} />
                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </form>

            {templates.map((t, i) => (
                <div key={t.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {editingId === t.id ? (
                        <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="text" value={editTemplate} onChange={e => setEditTemplate(e.target.value)} style={{ flex: 1 }} />
                            <input type="text" value={editCurrency} onChange={e => setEditCurrency(e.target.value)} placeholder="CCY" style={{ width: '70px' }} />
                            <button onClick={async () => { await window.api.piUpdateSubLimitTemplate(t.id, { textTemplate: editTemplate, defaultCurrency: editCurrency }); setEditingId(null); showSuccess('Updated'); loadData() }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1, fontSize: '0.85rem' }}>
                                <span style={{ fontFamily: 'monospace', marginRight: '8px', fontSize: '0.78rem', color: 'var(--accent-primary)' }}>{t.defaultCurrency}</span>
                                {t.textTemplate}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === templates.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === templates.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(t.id); setEditTemplate(t.textTemplate); setEditCurrency(t.defaultCurrency) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteSubLimitTemplate(t.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </section>

        <CollapsibleStandardTexts
            fields={[{ key: 'limitOfLiabilityDefaultText', label: 'Default Liability Text ({amount}, {currency} placeholders)', rows: 3 }]}
            showSuccess={showSuccess}
        />
    </div>
    )
}

// ==================== Additional Clauses Tab (includes Sets) ====================

function AdditionalClausesTab({ showSuccess, showError }: TabProps) {
    const [clauses, setClauses] = useState<PIAdditionalClause[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [newCode, setNewCode] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editCode, setEditCode] = useState('')
    const [editText, setEditText] = useState('')

    // Sets state
    const [sets, setSets] = useState<PIAdditionalClauseSet[]>([])
    const [newSetName, setNewSetName] = useState('')
    const [editSetId, setEditSetId] = useState<string | null>(null)
    const [editSetName, setEditSetName] = useState('')
    const [editSetOrder, setEditSetOrder] = useState<string[]>([]) // ordered IDs of clauses in the set
    const [editSetDefault, setEditSetDefault] = useState(false)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [c, s] = await Promise.all([window.api.piGetAdditionalClauses(), window.api.piGetAdditionalClauseSets()])
        if (Array.isArray(c)) setClauses(c)
        if (Array.isArray(s)) setSets(s)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        const result = await window.api.piAddAdditionalClause(newTitle.trim() || null, newCode.trim(), newText.trim()) as any
        if (result?.error) { showError(result.message || 'Failed to add clause'); return }
        setNewTitle(''); setNewCode(''); setNewText(''); showSuccess('Additional clause added'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...clauses]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClauses(newOrder)
        await window.api.piReorderAdditionalClauses(newOrder.map(c => c.id))
    }

    const startEditSet = (s: PIAdditionalClauseSet) => {
        setEditSetId(s.id)
        setEditSetName(s.name)
        setEditSetOrder(s.clauseIds || [])
        setEditSetDefault(s.defaultSelected || false)
    }

    const toggleSetClause = (id: string) => {
        setEditSetOrder(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    }

    const moveSetClause = (index: number, direction: 'up' | 'down') => {
        setEditSetOrder(prev => {
            const next = [...prev]
            const swapIndex = direction === 'up' ? index - 1 : index + 1
            if (swapIndex < 0 || swapIndex >= next.length) return prev
            ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
            return next
        })
    }

    const saveSet = async () => {
        if (!editSetId) return
        await window.api.piUpdateAdditionalClauseSet(editSetId, editSetName.trim(), editSetOrder, editSetDefault)
        setEditSetId(null)
        showSuccess('Set saved')
        loadData()
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <section className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Additional Clauses</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Extra items appended after the main conditions (e.g., JH/JL clauses, conflict exclusions). Clauses marked "Default" are automatically included in new quotations. Formatted as bullet points in the export.</p>
                <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title (e.g. Conflict Exclusion)" style={{ width: '200px', flexShrink: 0 }} />
                    <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code (e.g. JH2021-008)" style={{ width: '160px', flexShrink: 0 }} />
                    <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Clause text..." style={{ flex: 1, minHeight: '50px', minWidth: '200px', resize: 'vertical' }} required />
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end' }}><Plus size={16} /> Add</button>
                </form>

                {clauses.map((c, i) => (
                    <div key={c.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        {editingId === c.id ? (
                            <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" style={{ width: '180px' }} />
                                <input value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="Code" style={{ width: '140px' }} />
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, minWidth: '200px', minHeight: '50px', resize: 'vertical' }} />
                                <button onClick={async () => { await window.api.piUpdateAdditionalClause(c.id, editTitle.trim() || null, editCode.trim(), editText.trim()); setEditingId(null); showSuccess('Updated'); loadData() }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        ) : (
                            <>
                                <div style={{ flex: 1, fontSize: '0.85rem' }}>
                                    {c.title && <span style={{ fontWeight: 600, marginRight: '8px', color: 'var(--text-primary)' }}>{c.title}</span>}
                                    {c.code && <span style={{ fontFamily: 'monospace', fontWeight: 700, marginRight: '8px', color: 'var(--accent-primary)', fontSize: '0.8rem' }}>{c.code}</span>}
                                    <span style={{ whiteSpace: 'pre-wrap' }}>{c.text}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', fontSize: '0.72rem', color: c.defaultSelected ? 'var(--accent-primary)' : 'var(--text-secondary)', marginRight: '4px' }} title="Auto-add to new quotations">
                                        <input type="checkbox" checked={!!c.defaultSelected} onChange={async () => { await window.api.piToggleAdditionalClauseDefault(c.id, !c.defaultSelected); loadData() }} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} />
                                        Default
                                    </label>
                                    <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                    <button onClick={() => handleMove(i, 'down')} disabled={i === clauses.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === clauses.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                    <button onClick={() => { setEditingId(c.id); setEditTitle(c.title || ''); setEditCode(c.code || ''); setEditText(c.text) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                    <button onClick={async () => { await window.api.piDeleteAdditionalClause(c.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </section>

            <section className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Additional Clause Sets</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Preset groups of additional clauses that can be applied in one click from the Conditions tab. Use the arrows within each set to control the order they appear in the export.</p>
                <form onSubmit={async e => { e.preventDefault(); if (!newSetName.trim()) return; await window.api.piAddAdditionalClauseSet(newSetName.trim(), []); setNewSetName(''); showSuccess('Set created'); loadData() }} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <input value={newSetName} onChange={e => setNewSetName(e.target.value)} placeholder="Set name (e.g. Standard Fleet)" style={{ flex: 1, maxWidth: '300px' }} required />
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Create Set</button>
                </form>

                {sets.map(s => (
                    <div key={s.id} style={{ padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '10px' }}>
                        {editSetId === s.id ? (
                            <div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '12px' }}>
                                    <input value={editSetName} onChange={e => setEditSetName(e.target.value)} style={{ flex: 1 }} />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        <input type="checkbox" checked={editSetDefault} onChange={e => setEditSetDefault(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Auto-apply
                                    </label>
                                </div>

                                {/* Selected clauses — sortable */}
                                {editSetOrder.length > 0 && (
                                    <div style={{ marginBottom: '10px' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Selected (in order)</div>
                                        {editSetOrder.map((id, idx) => {
                                            const c = clauses.find(x => x.id === id)
                                            if (!c) return null
                                            return (
                                                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', borderRadius: '4px', background: 'rgba(0,210,255,0.07)', marginBottom: '3px' }}>
                                                    <button onClick={() => moveSetClause(idx, 'up')} disabled={idx === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={13} /></button>
                                                    <button onClick={() => moveSetClause(idx, 'down')} disabled={idx === editSetOrder.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', opacity: idx === editSetOrder.length - 1 ? 0.3 : 1 }}><ChevronDown size={13} /></button>
                                                    {c.title && <span style={{ fontWeight: 600, fontSize: '0.78rem', color: 'var(--text-primary)' }}>{c.title}</span>}
                                                    {c.code && <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '0.78rem', color: 'var(--accent-primary)', minWidth: '80px' }}>{c.code}</span>}
                                                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{c.text.substring(0, 70)}{c.text.length > 70 ? '…' : ''}</span>
                                                    <button onClick={() => toggleSetClause(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><X size={13} /></button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                {/* Available clauses — not yet selected */}
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Available</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '12px', maxHeight: '200px', overflowY: 'auto' }}>
                                    {clauses.filter(c => !editSetOrder.includes(c.id)).map(c => (
                                        <div key={c.id} onClick={() => toggleSetClause(c.id)} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer', fontSize: '0.82rem', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--table-border)' }}
                                            onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(0,210,255,0.05)')}
                                            onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                                            <Plus size={13} style={{ marginTop: '2px', flexShrink: 0, color: 'var(--accent-primary)' }} />
                                            {c.title && <span style={{ fontWeight: 600, flexShrink: 0, color: 'var(--text-primary)', fontSize: '0.8rem' }}>{c.title}</span>}
                                            {c.code && <span style={{ fontFamily: 'monospace', fontWeight: 700, flexShrink: 0, color: 'var(--accent-primary)', minWidth: '80px' }}>{c.code}</span>}
                                            <span style={{ color: 'var(--text-secondary)' }}>{c.text.substring(0, 80)}{c.text.length > 80 ? '…' : ''}</span>
                                        </div>
                                    ))}
                                    {clauses.filter(c => !editSetOrder.includes(c.id)).length === 0 && (
                                        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.82rem', margin: 0 }}>All clauses selected.</p>
                                    )}
                                </div>

                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button onClick={saveSet} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                                    <button onClick={() => setEditSetId(null)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {s.name}
                                        {s.defaultSelected && <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.12)', color: 'var(--accent-primary)', fontWeight: 700 }}>DEFAULT</span>}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                        {(s.clauseIds?.length || 0)} clause{(s.clauseIds?.length || 0) !== 1 ? 's' : ''}
                                        {s.clauseIds && s.clauseIds.length > 0 && (
                                            <span style={{ marginLeft: '8px' }}>
                                                {s.clauseIds.map(id => clauses.find(c => c.id === id)?.code).filter(Boolean).join(', ')}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button onClick={() => startEditSet(s)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Pencil size={12} /> Edit</button>
                                <button onClick={async () => { await window.api.piDeleteAdditionalClauseSet(s.id); showSuccess('Set deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                            </div>
                        )}
                    </div>
                ))}
                {sets.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic', fontSize: '0.85rem' }}>No sets defined yet.</p>}
            </section>
        </div>
    )
}

// ==================== Trading Countries Tab ====================

function TradingCountriesTab({ showSuccess, showError, isLight }: TabProps) {
    const [countries, setCountries] = useState<TradingExcludedCountry[]>([])
    const [newIso3, setNewIso3] = useState('')
    const [newListType, setNewListType] = useState<'excluded' | 'ddq'>('excluded')
    const [useCustomName, setUseCustomName] = useState(false)
    const [customName, setCustomName] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setCountries(await window.api.piGetTradingExcludedCountries()) }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (useCustomName) {
            if (!customName.trim()) return
            try {
                await window.api.piAddTradingExcludedCountry({ name: customName.trim(), iso3Code: '', listType: newListType })
                setCustomName('')
                showSuccess('Country added'); loadData()
            } catch (err: any) { showError(err.message || 'Failed to add') }
        } else {
            if (!newIso3) return
            const country = countryNameToIso3.find(c => c.iso3 === newIso3)
            if (!country) return
            try {
                await window.api.piAddTradingExcludedCountry({ name: country.name, iso3Code: country.iso3, listType: newListType })
                setNewIso3('')
                showSuccess('Country added'); loadData()
            } catch (err: any) { showError(err.message || 'Failed to add') }
        }
    }

    const handleToggleType = async (id: string, currentType: 'excluded' | 'ddq') => {
        const newType = currentType === 'excluded' ? 'ddq' : 'excluded'
        await window.api.piUpdateTradingExcludedCountry(id, { listType: newType })
        loadData()
    }

    const TYPE_CODES_SHORT = [
        { code: 'P', label: 'P&I', color: '#6464ff' },
        { code: 'H', label: 'H&M', color: '#ff64c8' },
        { code: 'W', label: 'War', color: '#ff8c32' },
    ]

    const getExcludeTypesArr = (c: TradingExcludedCountry): string[] => {
        if (!c.excludeTypes) return [] // null = all types (legacy)
        return c.excludeTypes.split(',').filter(Boolean)
    }

    const isExcludedForType = (c: TradingExcludedCountry, code: string): boolean => {
        if (!c.excludeTypes) return true // null = excluded for all types
        return c.excludeTypes.split(',').includes(code)
    }

    const handleToggleExcludeType = async (c: TradingExcludedCountry, code: string) => {
        const current = getExcludeTypesArr(c)
        const isAll = !c.excludeTypes // null means all
        let next: string[]
        if (isAll) {
            // Currently all — uncheck this code means keep all except this one
            next = TYPE_CODES_SHORT.map(t => t.code).filter(tc => tc !== code)
        } else if (current.includes(code)) {
            next = current.filter(tc => tc !== code)
        } else {
            next = [...current, code]
        }
        // If all types selected, store null (meaning all)
        const allSelected = TYPE_CODES_SHORT.every(t => next.includes(t.code))
        const excludeTypes = allSelected ? null : (next.length > 0 ? next.join(',') : '')
        await window.api.piUpdateTradingExcludedCountry(c.id, { excludeTypes })
        loadData()
    }

    const excluded = countries.filter(c => c.listType === 'excluded')
    const ddq = countries.filter(c => c.listType === 'ddq')

    return (
        <div>
            <section className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Add Country</h3>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <input type="checkbox" checked={useCustomName} onChange={e => setUseCustomName(e.target.checked)} />
                        Use custom name (e.g. &quot;Occupied Ukraine&quot;)
                    </label>
                </div>
                <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {useCustomName ? (
                        <input
                            type="text"
                            value={customName}
                            onChange={e => setCustomName(e.target.value)}
                            placeholder="Enter custom country name..."
                            style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                        />
                    ) : (
                        <select value={newIso3} onChange={e => setNewIso3(e.target.value)} style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                            <option value="">Select a country...</option>
                            {countryNameToIso3.filter(c => !countries.some(ec => ec.iso3Code === c.iso3)).map(c => (
                                <option key={c.iso3} value={c.iso3}>{c.name} ({c.iso3})</option>
                            ))}
                        </select>
                    )}
                    <select value={newListType} onChange={e => setNewListType(e.target.value as any)} style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}>
                        <option value="excluded">Excluded</option>
                        <option value="ddq">DDQ Required</option>
                    </select>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                </form>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <section className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '14px', color: 'var(--danger)' }}>Excluded Countries</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Trade with these countries is prohibited. Use type checkboxes to limit exclusion to specific quotation types.</p>
                    {excluded.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No excluded countries</div>
                    ) : excluded.map(c => (
                        <div key={c.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.iso3Code}</span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                {TYPE_CODES_SHORT.map(tc => (
                                    <label key={tc.code} title={`Exclude for ${tc.label}`} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', border: isExcludedForType(c, tc.code) ? `1px solid ${tc.color}` : '1px solid var(--table-border)', background: isExcludedForType(c, tc.code) ? `${tc.color}1a` : 'transparent', color: isExcludedForType(c, tc.code) ? tc.color : 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={isExcludedForType(c, tc.code)} onChange={() => handleToggleExcludeType(c, tc.code)} style={{ width: '12px', height: '12px', accentColor: tc.color }} />
                                        {tc.label}
                                    </label>
                                ))}
                            </div>
                            <button onClick={() => handleToggleType(c.id, c.listType)} className="btn-secondary" title="Move to DDQ list" style={{ padding: '3px 6px', fontSize: '0.68rem' }}>DDQ</button>
                            <button onClick={async () => { await window.api.piDeleteTradingExcludedCountry(c.id); showSuccess('Removed'); loadData() }} className="btn-secondary" style={{ padding: '3px', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                        </div>
                    ))}
                </section>

                <section className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '14px', color: isLight ? '#8a6d00' : '#ffc107' }}>DDQ Required Countries</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Trade requires Due Diligence Questionnaire. Use type checkboxes to limit to specific quotation types.</p>
                    {ddq.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No DDQ countries</div>
                    ) : ddq.map(c => (
                        <div key={c.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.iso3Code}</span>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                {TYPE_CODES_SHORT.map(tc => (
                                    <label key={tc.code} title={`DDQ for ${tc.label}`} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem', cursor: 'pointer', padding: '2px 5px', borderRadius: '4px', border: isExcludedForType(c, tc.code) ? `1px solid ${tc.color}` : '1px solid var(--table-border)', background: isExcludedForType(c, tc.code) ? `${tc.color}1a` : 'transparent', color: isExcludedForType(c, tc.code) ? tc.color : 'var(--text-secondary)' }}>
                                        <input type="checkbox" checked={isExcludedForType(c, tc.code)} onChange={() => handleToggleExcludeType(c, tc.code)} style={{ width: '12px', height: '12px', accentColor: tc.color }} />
                                        {tc.label}
                                    </label>
                                ))}
                            </div>
                            <button onClick={() => handleToggleType(c.id, c.listType)} className="btn-secondary" title="Move to Excluded list" style={{ padding: '3px 6px', fontSize: '0.68rem' }}>Excl.</button>
                            <button onClick={async () => { await window.api.piDeleteTradingExcludedCountry(c.id); showSuccess('Removed'); loadData() }} className="btn-secondary" style={{ padding: '3px', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                        </div>
                    ))}
                </section>
            </div>

            {/* Default Excluded Countries per Type */}
            <DefaultExcludedCountriesPerType countries={countries} showSuccess={showSuccess} showError={showError} isLight={isLight} />
        </div>
    )
}

function DefaultExcludedCountriesPerType({ countries, showSuccess, showError }: { countries: TradingExcludedCountry[]; showSuccess: (m: string) => void; showError: (m: string) => void; isLight?: boolean }) {
    const TYPE_CODES = [
        { code: 'P', label: 'P&I', color: '#6464ff' },
        { code: 'H', label: 'H&M', color: '#ff64c8' },
        { code: 'W', label: 'War', color: '#ff8c32' },
    ]
    const [activeType, setActiveType] = useState('P')
    const [typeDefaults, setTypeDefaults] = useState<Record<string, { name: string; listType: string }[]>>({})
    const [collapsed, setCollapsed] = useState(true)

    useEffect(() => { loadDefaults() }, [])

    const loadDefaults = async () => {
        const result: Record<string, { name: string; listType: string }[]> = {}
        for (const tc of TYPE_CODES) {
            try {
                const raw = await window.api.getSetting(`default_excluded_countries_${tc.code}`)
                if (raw) {
                    result[tc.code] = JSON.parse(raw)
                }
            } catch {}
        }
        setTypeDefaults(result)
    }

    const currentDefaults = typeDefaults[activeType] || []
    const allCountries = countries

    const isSelected = (name: string, listType: string) =>
        currentDefaults.some(d => d.name === name && d.listType === listType)

    const toggleCountry = (name: string, listType: string) => {
        let updated: { name: string; listType: string }[]
        if (isSelected(name, listType)) {
            updated = currentDefaults.filter(d => !(d.name === name && d.listType === listType))
        } else {
            updated = [...currentDefaults, { name, listType }]
        }
        setTypeDefaults(prev => ({ ...prev, [activeType]: updated }))
    }

    const saveDefaults = async () => {
        try {
            await window.api.setSetting(
                `default_excluded_countries_${activeType}`,
                JSON.stringify(typeDefaults[activeType] || [])
            )
            showSuccess(`Default countries saved for ${TYPE_CODES.find(t => t.code === activeType)?.label}`)
        } catch (err: any) {
            showError(err.message || 'Failed to save')
        }
    }

    const selectAll = () => {
        const all = allCountries.map(c => ({ name: c.name, listType: c.listType }))
        setTypeDefaults(prev => ({ ...prev, [activeType]: all }))
    }

    const deselectAll = () => {
        setTypeDefaults(prev => ({ ...prev, [activeType]: [] }))
    }

    const excluded = allCountries.filter(c => c.listType === 'excluded')
    const ddq = allCountries.filter(c => c.listType === 'ddq')

    return (
        <section className="glass-card" style={{ padding: '20px', marginTop: '20px' }}>
            <div
                onClick={() => setCollapsed(!collapsed)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: collapsed ? 0 : '14px' }}
            >
                {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Default Excluded Countries per Type</h3>
            </div>
            {!collapsed && (
                <>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                        Configure which countries are pre-selected when creating a new quotation of each type. If not configured, all master countries are used.
                    </p>
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '14px' }}>
                        {TYPE_CODES.map(tc => (
                            <button
                                key={tc.code}
                                onClick={() => setActiveType(tc.code)}
                                style={{
                                    padding: '6px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: activeType === tc.code ? 600 : 400,
                                    border: activeType === tc.code ? `1px solid ${tc.color}` : '1px solid var(--glass-border)',
                                    background: activeType === tc.code ? `${tc.color}1f` : 'transparent',
                                    color: activeType === tc.code ? tc.color : 'var(--text-secondary)',
                                    cursor: 'pointer'
                                }}
                            >{tc.label}</button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <button onClick={selectAll} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Select All</button>
                        <button onClick={deselectAll} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>Deselect All</button>
                        <div style={{ flex: 1 }} />
                        <button onClick={saveDefaults} className="btn-primary" style={{ fontSize: '0.78rem', padding: '4px 12px' }}>Save</button>
                    </div>

                    {excluded.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Excluded</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {excluded.map(c => (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', border: isSelected(c.name, c.listType) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: isSelected(c.name, c.listType) ? 'rgba(0,170,200,0.08)' : 'transparent' }}>
                                        <input type="checkbox" checked={isSelected(c.name, c.listType)} onChange={() => toggleCountry(c.name, c.listType)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} />
                                        {c.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {ddq.length > 0 && (
                        <div>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>DDQ Required</label>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {ddq.map(c => (
                                    <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', border: isSelected(c.name, c.listType) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: isSelected(c.name, c.listType) ? 'rgba(0,170,200,0.08)' : 'transparent' }}>
                                        <input type="checkbox" checked={isSelected(c.name, c.listType)} onChange={() => toggleCountry(c.name, c.listType)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} />
                                        {c.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}

                    {allCountries.length === 0 && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                            No master countries configured. Add countries above first.
                        </div>
                    )}
                </>
            )}
        </section>
    )
}

// ==================== Trading Warranty Tab ====================

const TRADING_CONDITION_SUB_FIELDS: { key: keyof PISectionTexts; label: string }[] = [
    { key: 'tradingConditionB', label: 'a) Sanctioned cargoes' },
    { key: 'tradingConditionC', label: 'b) Sanctioned individuals / entities' },
    { key: 'tradingConditionD', label: 'c) Compliance Screening Questionnaire' },
    { key: 'tradingConditionE', label: 'd) Further information' },
    { key: 'tradingConditionF', label: 'e) Insurer discretion' },
    { key: 'tradingConditionG', label: 'f) Paramount clause' }
]

function TradingWarrantyTab({ showSuccess }: TabProps) {
    const [texts, setTexts] = useState<PISectionTexts>({})
    const [loaded, setLoaded] = useState(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const saved = await window.api.piGetSectionTexts()
        if (saved && Object.keys(saved).length > 0) {
            setTexts(saved)
        } else {
            setTexts(DEFAULT_SECTION_TEXTS)
        }
        setLoaded(true)
    }

    const handleSave = async () => {
        await window.api.piSetSectionTexts(texts)
        showSuccess('Trading warranty texts saved')
    }

    const handleReset = () => {
        setTexts(prev => {
            const reset = { ...prev }
            reset.tradingIsrael = DEFAULT_SECTION_TEXTS.tradingIsrael
            reset.ddqCountriesIntro = DEFAULT_SECTION_TEXTS.ddqCountriesIntro
            reset.tradingConditionA = DEFAULT_SECTION_TEXTS.tradingConditionA
            for (const f of TRADING_CONDITION_SUB_FIELDS) {
                ;(reset as any)[f.key] = (DEFAULT_SECTION_TEXTS as any)[f.key]
            }
            return reset
        })
    }

    if (!loaded) return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading...</div>

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Trading Warranty Texts</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Default texts for the Trading Warranty section of quotations.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleReset} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Reset Defaults</button>
                    <button onClick={handleSave} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}><Save size={14} /> Save All</button>
                </div>
            </div>

            {/* 1) DDQ Countries Intro */}
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)', marginBottom: '8px', borderBottom: '1px solid var(--table-border)', paddingBottom: '4px' }}>
                1) DDQ Countries Intro
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Text shown with the DDQ country list ({'{ddq_countries}'} placeholder)</label>
                <RichTextEditor
                    value={texts.ddqCountriesIntro || ''}
                    onChange={val => setTexts(prev => ({ ...prev, ddqCountriesIntro: val }))}
                    minHeight={60}
                />
            </div>

            {/* 2) Trading Conditions */}
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)', marginTop: '16px', marginBottom: '8px', borderBottom: '1px solid var(--table-border)', paddingBottom: '4px' }}>
                2) Trading Conditions
            </div>
            <div style={{ marginBottom: '12px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Intro paragraph</label>
                <RichTextEditor
                    value={texts.tradingConditionA || ''}
                    onChange={val => setTexts(prev => ({ ...prev, tradingConditionA: val }))}
                    minHeight={60}
                />
            </div>
            {TRADING_CONDITION_SUB_FIELDS.map(field => (
                <div key={field.key} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{field.label}</label>
                    <RichTextEditor
                        value={(texts as any)[field.key] || ''}
                        onChange={val => setTexts(prev => ({ ...prev, [field.key]: val }))}
                        minHeight={60}
                    />
                </div>
            ))}

            {/* Israel Warranty */}
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)', marginTop: '16px', marginBottom: '8px', borderBottom: '1px solid var(--table-border)', paddingBottom: '4px' }}>
                3) Israel Warranty
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Israel Exclusion Text</label>
                <RichTextEditor
                    value={texts.tradingIsrael || ''}
                    onChange={val => setTexts(prev => ({ ...prev, tradingIsrael: val }))}
                    minHeight={60}
                />
            </div>
        </section>
    )
}

// ==================== Trading Warranty Templates Tab ====================

function TradingWarrantyTemplatesTab({ showSuccess, showError }: TabProps) {
    const [templates, setTemplates] = useState<TradingWarrantyTemplate[]>([])
    const [newName, setNewName] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editText, setEditText] = useState('')
    const [showAdd, setShowAdd] = useState(false)
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const res = await window.api.piGetTradingWarrantyTemplates()
        setTemplates(Array.isArray(res) ? res : [])
    }

    const handleAdd = async () => {
        if (!newName.trim()) return
        try {
            await window.api.piAddTradingWarrantyTemplate(newName.trim(), newText)
            setNewName('')
            setNewText('')
            setShowAdd(false)
            showSuccess('Template added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add') }
    }

    const handleUpdate = async () => {
        if (!editingId || !editName.trim()) return
        try {
            await window.api.piUpdateTradingWarrantyTemplate(editingId, { name: editName.trim(), text: editText })
            setEditingId(null)
            showSuccess('Template updated')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.piDeleteTradingWarrantyTemplate(id)
            showSuccess('Template deleted')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to delete') }
    }

    const move = async (idx: number, dir: -1 | 1) => {
        const newIdx = idx + dir
        if (newIdx < 0 || newIdx >= templates.length) return
        const reordered = [...templates]
        ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
        setTemplates(reordered)
        await window.api.piReorderTradingWarrantyTemplates(reordered.map(t => t.id))
    }

    const startEdit = (t: TradingWarrantyTemplate) => {
        setEditingId(t.id)
        setEditName(t.name)
        setEditText(t.text)
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Trading Warranty Templates</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Reusable templates for the trading warranty intro text. Select one in a quotation or write a custom text.</p>
                </div>
                <button onClick={() => { setShowAdd(!showAdd); setEditingId(null) }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                    <Plus size={14} /> Add Template
                </button>
            </div>

            {showAdd && (
                <div style={{ padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: isLight ? '#f0faff' : 'rgba(0,170,200,0.06)', marginBottom: '16px' }}>
                    <input
                        type="text"
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Template name (e.g. Standard P&I Trading)"
                        style={{ width: '100%', marginBottom: '8px' }}
                    />
                    <RichTextEditor
                        value={newText}
                        onChange={setNewText}
                        placeholder="Trading warranty text..."
                        minHeight={80}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                        <button onClick={handleAdd} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                        <button onClick={() => { setShowAdd(false); setNewName(''); setNewText('') }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                    </div>
                </div>
            )}

            {templates.length === 0 && !showAdd && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--table-border)', borderRadius: '8px' }}>
                    No templates yet. Add one to get started.
                </div>
            )}

            {templates.map((t, idx) => (
                <div key={t.id} style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: `1px solid ${editingId === t.id ? 'var(--accent-primary)' : 'var(--table-border)'}`,
                    marginBottom: '8px',
                    background: editingId === t.id ? (isLight ? '#f0faff' : 'rgba(0,170,200,0.06)') : 'transparent'
                }}>
                    {editingId === t.id ? (
                        <>
                            <input
                                type="text"
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                style={{ width: '100%', marginBottom: '8px' }}
                            />
                            <RichTextEditor
                                value={editText}
                                onChange={setEditText}
                                minHeight={80}
                            />
                            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                <button onClick={handleUpdate} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>{t.name}</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                                    {t.text.replace(/<[^>]*>/g, '').substring(0, 120) || '(empty)'}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: '2px', color: 'var(--text-secondary)' }}><ChevronUp size={14} /></button>
                                <button onClick={() => move(idx, 1)} disabled={idx === templates.length - 1} style={{ background: 'none', border: 'none', cursor: idx === templates.length - 1 ? 'default' : 'pointer', opacity: idx === templates.length - 1 ? 0.3 : 1, padding: '2px', color: 'var(--text-secondary)' }}><ChevronDown size={14} /></button>
                                <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--accent-primary)' }}><Pencil size={14} /></button>
                                <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </section>
    )
}

// ==================== Trading Custom Texts Tab ====================

function TradingCustomTextsTab({ showSuccess, showError }: TabProps) {
    const [items, setItems] = useState<TradingCustomText[]>([])
    const [newName, setNewName] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editText, setEditText] = useState('')
    const [showAdd, setShowAdd] = useState(false)
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const res = await window.api.piGetTradingCustomTexts()
        setItems(Array.isArray(res) ? res : [])
    }

    const handleAdd = async () => {
        if (!newName.trim()) return
        try {
            await window.api.piAddTradingCustomText(newName.trim(), newText)
            setNewName(''); setNewText(''); setShowAdd(false)
            showSuccess('Custom text added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add') }
    }

    const handleUpdate = async () => {
        if (!editingId || !editName.trim()) return
        try {
            await window.api.piUpdateTradingCustomText(editingId, { name: editName.trim(), text: editText })
            setEditingId(null)
            showSuccess('Custom text updated')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.piDeleteTradingCustomText(id)
            showSuccess('Custom text deleted')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to delete') }
    }

    const move = async (idx: number, dir: -1 | 1) => {
        const newIdx = idx + dir
        if (newIdx < 0 || newIdx >= items.length) return
        const reordered = [...items]
        ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
        setItems(reordered)
        await window.api.piReorderTradingCustomTexts(reordered.map(t => t.id))
    }

    const startEdit = (t: TradingCustomText) => {
        setEditingId(t.id); setEditName(t.name); setEditText(t.text)
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Trading Custom Texts</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Custom wordings that replace the standard numbered paragraphs (excluded countries, DDQ, Israel). Used for tankers or other vessel types with non-standard trading clauses.</p>
                </div>
                <button onClick={() => { setShowAdd(!showAdd); setEditingId(null) }} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                    <Plus size={14} /> Add Custom Text
                </button>
            </div>

            {showAdd && (
                <div style={{ padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: isLight ? '#f0faff' : 'rgba(0,170,200,0.06)', marginBottom: '16px' }}>
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Template name (e.g. Tanker Trading)" style={{ width: '100%', marginBottom: '8px' }} />
                    <RichTextEditor value={newText} onChange={setNewText} />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button onClick={handleAdd} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                        <button onClick={() => { setShowAdd(false); setNewName(''); setNewText('') }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                    </div>
                </div>
            )}

            {items.map((t, idx) => (
                <div key={t.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)' }}>
                    {editingId === t.id ? (
                        <>
                            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '100%', marginBottom: '8px' }} />
                            <RichTextEditor value={editText} onChange={setEditText} />
                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                                <button onClick={handleUpdate} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button onClick={() => move(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => move(idx, 1)} disabled={idx === items.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: idx === items.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '4px' }}>{t.name}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxHeight: '40px', overflow: 'hidden' }} dangerouslySetInnerHTML={{ __html: t.text }} />
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }}><Pencil size={14} /></button>
                                <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={14} /></button>
                            </div>
                        </div>
                    )}
                </div>
            ))}

            {items.length === 0 && !showAdd && (
                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No custom texts created yet. Add one to replace standard trading paragraphs for specific vessel types.
                </div>
            )}
        </section>
    )
}

// ==================== Premium Text Templates Tab (NCB / UPCC) ====================

function PremiumTextTemplatesTab({ showSuccess, showError }: TabProps) {
    const [ncbTemplates, setNcbTemplates] = useState<PremiumTextTemplate[]>([])
    const [upccTemplates, setUpccTemplates] = useState<PremiumTextTemplate[]>([])
    const [showAddNcb, setShowAddNcb] = useState(false)
    const [showAddUpcc, setShowAddUpcc] = useState(false)
    const [newName, setNewName] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editText, setEditText] = useState('')
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const res = await window.api.premiumGetTextTemplates()
        const all = Array.isArray(res) ? res : []
        setNcbTemplates(all.filter(t => t.type === 'ncb'))
        setUpccTemplates(all.filter(t => t.type === 'upcc'))
    }

    const handleAdd = async (type: 'ncb' | 'upcc') => {
        if (!newName.trim()) return
        try {
            await window.api.premiumAddTextTemplate({ name: newName.trim(), text: newText, type })
            setNewName('')
            setNewText('')
            if (type === 'ncb') setShowAddNcb(false)
            else setShowAddUpcc(false)
            showSuccess('Template added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add') }
    }

    const handleUpdate = async () => {
        if (!editingId || !editName.trim()) return
        try {
            await window.api.premiumUpdateTextTemplate(editingId, { name: editName.trim(), text: editText })
            setEditingId(null)
            showSuccess('Template updated')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.premiumDeleteTextTemplate(id)
            showSuccess('Template deleted')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to delete') }
    }

    const move = async (templates: PremiumTextTemplate[], idx: number, dir: -1 | 1) => {
        const newIdx = idx + dir
        if (newIdx < 0 || newIdx >= templates.length) return
        const reordered = [...templates]
        ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
        if (reordered[0]?.type === 'ncb') setNcbTemplates(reordered)
        else setUpccTemplates(reordered)
        await window.api.premiumReorderTextTemplates(reordered.map(t => t.id))
    }

    const startEdit = (t: PremiumTextTemplate) => {
        setEditingId(t.id)
        setEditName(t.name)
        setEditText(t.text)
    }

    const openAdd = (type: 'ncb' | 'upcc') => {
        setNewName('')
        setNewText('')
        setEditingId(null)
        if (type === 'ncb') { setShowAddNcb(true); setShowAddUpcc(false) }
        else { setShowAddUpcc(true); setShowAddNcb(false) }
    }

    const renderTemplateList = (templates: PremiumTextTemplate[], type: 'ncb' | 'upcc', showAdd: boolean, setShowAdd: (v: boolean) => void) => {
        const autoPlaceholders = type === 'ncb'
            ? '{ncb_percent}, {ncb_amount}, {currency}'
            : '{upcc_percent}, {upcc_amount}, {currency}'

        return (
            <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div>
                        <h4 style={{ fontSize: '0.95rem', marginBottom: '2px' }}>{type === 'ncb' ? 'NCB Templates' : 'UPCC Templates'}</h4>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Auto-filled: <code style={{ fontSize: '0.76rem', background: isLight ? '#eef1f6' : 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px' }}>{autoPlaceholders}</code> — You can also add custom placeholders like <code style={{ fontSize: '0.76rem', background: isLight ? '#eef1f6' : 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '3px' }}>{'{'+'date'+'}'}, {'{'+'name'+'}'}</code> (replace manually in quotation)</p>
                    </div>
                    <button onClick={() => openAdd(type)} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                        <Plus size={14} /> Add Template
                    </button>
                </div>

                {showAdd && (
                    <div style={{ padding: '14px 16px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: isLight ? '#f0faff' : 'rgba(0,170,200,0.06)', marginBottom: '16px' }}>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            placeholder={`Template name (e.g. Standard ${type === 'ncb' ? 'NCB' : 'UPCC'} Text)`}
                            style={{ width: '100%', marginBottom: '8px' }}
                        />
                        <RichTextEditor
                            value={newText}
                            onChange={setNewText}
                            placeholder={`${type === 'ncb' ? 'NCB' : 'UPCC'} text...`}
                            minHeight={80}
                        />
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                            <button onClick={() => handleAdd(type)} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                            <button onClick={() => { setShowAdd(false); setNewName(''); setNewText('') }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                        </div>
                    </div>
                )}

                {templates.length === 0 && !showAdd && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--table-border)', borderRadius: '8px' }}>
                        No {type === 'ncb' ? 'NCB' : 'UPCC'} templates yet. Add one to get started.
                    </div>
                )}

                {templates.map((t, idx) => (
                    <div key={t.id} style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: `1px solid ${editingId === t.id ? 'var(--accent-primary)' : 'var(--table-border)'}`,
                        marginBottom: '8px',
                        background: editingId === t.id ? (isLight ? '#f0faff' : 'rgba(0,170,200,0.06)') : 'transparent'
                    }}>
                        {editingId === t.id ? (
                            <>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    style={{ width: '100%', marginBottom: '8px' }}
                                />
                                <RichTextEditor
                                    value={editText}
                                    onChange={setEditText}
                                    minHeight={80}
                                />
                                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                                    <button onClick={handleUpdate} className="btn-primary" style={{ fontSize: '0.82rem' }}>Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                                </div>
                            </>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>{t.name}</div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '500px' }}>
                                        {t.text.replace(/<[^>]*>/g, '').substring(0, 120) || '(empty)'}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                    <button onClick={() => move(templates, idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, padding: '2px', color: 'var(--text-secondary)' }}><ChevronUp size={14} /></button>
                                    <button onClick={() => move(templates, idx, 1)} disabled={idx === templates.length - 1} style={{ background: 'none', border: 'none', cursor: idx === templates.length - 1 ? 'default' : 'pointer', opacity: idx === templates.length - 1 ? 0.3 : 1, padding: '2px', color: 'var(--text-secondary)' }}><ChevronDown size={14} /></button>
                                    <button onClick={() => startEdit(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--accent-primary)' }}><Pencil size={14} /></button>
                                    <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>NCB / UPCC Text Templates</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Reusable templates for NCB and UPCC text fields in the Premium tab. Select one in a quotation or write custom text.</p>
            </div>

            {renderTemplateList(ncbTemplates, 'ncb', showAddNcb, setShowAddNcb)}
            {renderTemplateList(upccTemplates, 'upcc', showAddUpcc, setShowAddUpcc)}
        </section>
    )
}

// ==================== Master Subjectivities Tab ====================

function MasterSubjectivitiesTab({ showSuccess, showError }: TabProps) {
    const [items, setItems] = useState<PISubjectivity[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newText, setNewText] = useState('')
    const [newDocTypeIds, setNewDocTypeIds] = useState<string[]>([])
    const [newTypeScope, setNewTypeScope] = useState<string>('all')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [editDocTypeIds, setEditDocTypeIds] = useState<string[]>([])
    const [editTypeScope, setEditTypeScope] = useState<string>('all')

    useEffect(() => { loadData() }, [])
    const ENTITY_DOC_TYPES: DocumentType[] = [
        { id: 'entity:coi', name: 'Certificate of Incorporation (Assured)', description: '', order: 900, annualRenewal: false, required: false },
        { id: 'entity:aoa', name: 'Articles of Association (Assured)', description: '', order: 901, annualRenewal: false, required: false },
        { id: 'entity:kyc', name: 'KYC (Assured)', description: '', order: 902, annualRenewal: false, required: false },
        { id: 'entity:passport', name: 'ID/Passport (Assured)', description: '', order: 903, annualRenewal: false, required: false },
    ]

    const loadData = async () => {
        const [subjs, dts] = await Promise.all([
            window.api.getPISubjectivities(),
            window.api.getDocumentTypes()
        ])
        setItems(Array.isArray(subjs) ? subjs : [])
        setDocTypes([...(Array.isArray(dts) ? dts : []), ...ENTITY_DOC_TYPES])
    }

    const handleAdd = async () => {
        if (!newText.trim()) return
        try {
            await window.api.addPISubjectivity({ text: newText.trim(), docTypeIds: newDocTypeIds, typeScope: newTypeScope, order: items.length })
            setNewText(''); setNewDocTypeIds([]); setNewTypeScope('all')
            showSuccess('Subjectivity added'); loadData()
        } catch (err: any) { showError(err.message || 'Failed to add') }
    }

    const startEdit = (s: PISubjectivity) => {
        setEditingId(s.id); setEditText(s.text); setEditDocTypeIds(s.docTypeIds || []); setEditTypeScope(s.typeScope || 'all')
    }

    const handleUpdate = async () => {
        if (!editingId || !editText.trim()) return
        try {
            await window.api.updatePISubjectivity(editingId, { text: editText.trim(), docTypeIds: editDocTypeIds, typeScope: editTypeScope })
            setEditingId(null); showSuccess('Updated'); loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleMove = async (idx: number, dir: -1 | 1) => {
        const arr = [...items]
        const targetIdx = idx + dir
        if (targetIdx < 0 || targetIdx >= arr.length) return
        ;[arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]]
        setItems(arr)
        await window.api.reorderPISubjectivities(arr.map(s => s.id))
    }

    const toggleDocType = (ids: string[], setIds: (v: string[]) => void, dtId: string) => {
        setIds(ids.includes(dtId) ? ids.filter(id => id !== dtId) : [...ids, dtId])
    }

    const inputStyle = { padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.82rem' }
    const chipStyle = (selected: boolean) => ({
        padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', cursor: 'pointer',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
        background: selected ? 'rgba(0, 210, 255, 0.12)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontWeight: selected ? 600 : 400
    })

    return (
        <div>
            <section className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Master Subjectivities</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Define subjectivities and link them to document types. Linked subjectivities auto-populate when the vessel has missing or expiring documents.
                </p>

                {/* Add form */}
                <div style={{ marginBottom: '20px', padding: '14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <input value={newText} onChange={e => setNewText(e.target.value)} placeholder="Subjectivity text..." style={{ ...inputStyle, width: '100%', marginBottom: '8px' }} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
                    <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Linked Document Types (triggers auto-populate when missing/expiring)</label>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {docTypes.map(dt => (
                                <span key={dt.id} onClick={() => toggleDocType(newDocTypeIds, setNewDocTypeIds, dt.id)} style={chipStyle(newDocTypeIds.includes(dt.id))}>{dt.name}</span>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Scope:</span>
                        <select value={newTypeScope} onChange={e => setNewTypeScope(e.target.value as any)} style={{ padding: '3px 6px', borderRadius: '4px', fontSize: '0.78rem' }}>
                            <option value="both">Both</option>
                            <option value="pi">P&I only</option>
                            <option value="hull">Hull only</option>
                                <option value="war">War only</option>
                        </select>
                    </div>
                    <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}><Plus size={14} /> Add Subjectivity</button>
                </div>

                {/* List */}
                {items.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No subjectivities configured.</div>
                ) : items.map((s, idx) => (
                    <div key={s.id} style={{ padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px' }}>
                        {editingId === s.id ? (
                            <div>
                                <input value={editText} onChange={e => setEditText(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: '8px' }} />
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Linked Document Types</label>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                        {docTypes.map(dt => (
                                            <span key={dt.id} onClick={() => toggleDocType(editDocTypeIds, setEditDocTypeIds, dt.id)} style={chipStyle(editDocTypeIds.includes(dt.id))}>{dt.name}</span>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Scope:</span>
                                    {[{ v: 'all', l: 'All' }, { v: 'pi', l: 'P&I' }, { v: 'hull', l: 'Hull' }, { v: 'war', l: 'War' }, { v: 'cargo', l: 'Cargo' }].map(s => {
                                        const active = s.v === 'all' ? editTypeScope === 'all' : editTypeScope !== 'all' && editTypeScope.split(',').includes(s.v)
                                        return <button key={s.v} type="button" onClick={() => {
                                            if (s.v === 'all') { setEditTypeScope('all') }
                                            else {
                                                const parts = editTypeScope === 'all' ? [] : editTypeScope.split(',').filter(Boolean)
                                                const next = active ? parts.filter(p => p !== s.v) : [...parts, s.v]
                                                setEditTypeScope(next.length === 0 ? 'all' : next.join(','))
                                            }
                                        }} style={{ padding: '2px 6px', borderRadius: '4px', border: active ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: active ? 'rgba(0,170,200,0.1)' : 'transparent', color: active ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: active ? 600 : 400, fontSize: '0.72rem' }}>{s.l}</button>
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={handleUpdate} className="btn-primary" style={{ fontSize: '0.78rem' }}><Save size={12} /> Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.78rem' }}><X size={12} /> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{s.text}</span>
                                    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                        <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="btn-secondary" style={{ padding: '3px' }}><ChevronUp size={14} /></button>
                                        <button onClick={() => handleMove(idx, 1)} disabled={idx === items.length - 1} className="btn-secondary" style={{ padding: '3px' }}><ChevronDown size={14} /></button>
                                        <button onClick={() => startEdit(s)} className="btn-secondary" style={{ padding: '3px' }}><Pencil size={14} /></button>
                                        <button onClick={async () => { if (confirm('Delete this subjectivity?')) { await window.api.deletePISubjectivity(s.id); showSuccess('Deleted'); loadData() } }} className="btn-secondary" style={{ padding: '3px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {s.typeScope && s.typeScope !== 'all' && <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: s.typeScope === 'pi' ? 'rgba(100, 100, 255, 0.15)' : s.typeScope === 'hull' ? 'rgba(255, 100, 200, 0.15)' : 'rgba(255, 176, 32, 0.15)', color: s.typeScope === 'pi' ? '#6464ff' : s.typeScope === 'hull' ? '#ff64c8' : '#ffb020' }}>{s.typeScope === 'pi' ? 'P&I' : s.typeScope === 'hull' ? 'Hull' : 'War'}</span>}
                                    {(s.docTypeIds || []).map(dtId => {
                                        const dt = docTypes.find(d => d.id === dtId)
                                        return dt ? <span key={dtId} style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(0, 210, 255, 0.2)' }}>{dt.name}</span> : null
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </section>

            <CollapsibleStandardTexts
                fields={[
                    { key: 'subjectivitiesIntro', label: 'Subjectivities Intro', rows: 2 },
                    { key: 'subjectivitiesNote', label: 'Subjectivities Note', rows: 2 }
                ]}
                showSuccess={showSuccess}
            />
        </div>
    )
}

// ==================== Sanctions Versions Tab ====================

function SanctionsVersionsTab({ showSuccess, showError }: TabProps) {
    const [versions, setVersions] = useState<PISanctionsVersion[]>([])
    const [editedTexts, setEditedTexts] = useState<Record<string, string>>({})
    const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set())
    const [newName, setNewName] = useState('')
    const [newKey, setNewKey] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editKey, setEditKey] = useState('')
    const [formResetKey, setFormResetKey] = useState(0)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const data = await window.api.piGetSanctionsVersions()
        setVersions(data)
        const textMap: Record<string, string> = {}
        data.forEach((v: PISanctionsVersion) => { textMap[v.id] = v.text })
        setEditedTexts(textMap)
        setDirtyIds(new Set())
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim() || !newKey.trim() || !newText.trim()) return
        try {
            await window.api.piAddSanctionsVersion({ name: newName.trim(), key: newKey.trim(), text: newText.trim() })
            setNewName(''); setNewKey(''); setNewText('')
            setFormResetKey(k => k + 1)
            showSuccess('Version added'); loadData()
        } catch (err: any) { showError(err.message || 'Failed to add') }
    }

    const startEdit = (v: PISanctionsVersion) => {
        setEditingId(v.id); setEditName(v.name); setEditKey(v.key)
    }

    const handleUpdateNameKey = async () => {
        if (!editingId || !editName.trim() || !editKey.trim()) return
        try {
            const currentText = editedTexts[editingId] ?? versions.find(v => v.id === editingId)?.text ?? ''
            await window.api.piUpdateSanctionsVersion(editingId, { name: editName.trim(), key: editKey.trim(), text: currentText })
            setEditingId(null); showSuccess('Version updated'); loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleSaveText = async (id: string) => {
        const v = versions.find(ver => ver.id === id)
        if (!v) return
        const text = editedTexts[id] ?? v.text
        try {
            await window.api.piUpdateSanctionsVersion(id, { name: v.name, key: v.key, text })
            setDirtyIds(prev => { const s = new Set(prev); s.delete(id); return s })
            showSuccess('Text saved')
        } catch (err: any) { showError(err.message || 'Failed to save') }
    }

    const handleTextChange = (id: string, val: string) => {
        setEditedTexts(prev => ({ ...prev, [id]: val }))
        setDirtyIds(prev => new Set(prev).add(id))
    }

    const handleMove = async (idx: number, dir: -1 | 1) => {
        const arr = [...versions]
        const targetIdx = idx + dir
        if (targetIdx < 0 || targetIdx >= arr.length) return
        ;[arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]]
        setVersions(arr)
        await window.api.piReorderSanctionsVersions(arr.map(v => v.id))
    }

    const inputStyle = { padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.82rem' }

    return (
        <div>
            <section className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Sanctions Clause Versions</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Manage named sanctions clause versions. Each quotation picks a version and can optionally override the text.
                </p>

                <form onSubmit={handleAdd} style={{ marginBottom: '20px' }}>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Version name (e.g. Standard)" style={{ ...inputStyle, flex: 1 }} />
                        <input value={newKey} onChange={e => setNewKey(e.target.value)} placeholder="Key (e.g. standard)" style={{ ...inputStyle, width: '160px' }} />
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                    </div>
                    <RichTextEditor key={formResetKey} value={newText} onChange={setNewText} placeholder="Sanctions clause text..." minHeight={100} />
                </form>

                {versions.length === 0 ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No sanctions versions configured. Add your first version above.</div>
                ) : versions.map((v, idx) => (
                    <div key={v.id} style={{ padding: '14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '10px' }}>
                        {editingId === v.id ? (
                            <div style={{ marginBottom: '8px' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                    <input value={editKey} onChange={e => setEditKey(e.target.value)} style={{ ...inputStyle, width: '160px' }} />
                                    <button onClick={handleUpdateNameKey} className="btn-primary" style={{ fontSize: '0.78rem' }}><Save size={12} /> Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.78rem' }}><X size={12} /> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v.name}</span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--table-header-bg)', padding: '2px 6px', borderRadius: '4px' }}>{v.key}</span>
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                    <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="btn-secondary" style={{ padding: '3px' }}><ChevronUp size={14} /></button>
                                    <button onClick={() => handleMove(idx, 1)} disabled={idx === versions.length - 1} className="btn-secondary" style={{ padding: '3px' }}><ChevronDown size={14} /></button>
                                    <button onClick={() => startEdit(v)} className="btn-secondary" style={{ padding: '3px' }}><Pencil size={14} /></button>
                                    <button onClick={async () => { if (confirm(`Delete "${v.name}"?`)) { await window.api.piDeleteSanctionsVersion(v.id); setFormResetKey(k => k + 1); showSuccess('Deleted'); loadData() } }} className="btn-secondary" style={{ padding: '3px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                                </div>
                            </div>
                        )}
                        <RichTextEditor
                            value={editedTexts[v.id] ?? v.text}
                            onChange={val => handleTextChange(v.id, val)}
                            minHeight={150}
                        />
                        {dirtyIds.has(v.id) && (
                            <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={() => handleSaveText(v.id)} className="btn-primary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Save size={12} /> Save Text</button>
                            </div>
                        )}
                    </div>
                ))}
            </section>
        </div>
    )
}

// ==================== Standard Texts Tab ====================

import { getDefaultSectionOrder, SECTION_LABELS, DEFAULT_SECTION_TEXTS } from './quotationSettingsConstants'

// Fields remaining in Standard Texts tab (trading, conditions, LoL, subjectivities moved to their own tabs)
const SECTION_TEXT_FIELDS: { key: keyof PISectionTexts; label: string; section: string; rows?: number }[] = [
    { key: 'insuredFooter', label: 'Insured Footer', section: 'Insured', rows: 2 },
    { key: 'warrantiesBreach', label: 'Breach of Warranties ({quotation_type} = type name)', section: 'Warranties', rows: 8 },
    { key: 'warrantiesNote', label: 'Warranties Note ({quotation_type} = type name)', section: 'Warranties', rows: 2 },
    { key: 'warrantiesAdditionalText', label: 'Warranties Additional Text', section: 'Warranties', rows: 3 },
    { key: 'deductiblesAggregate', label: 'Deductibles Aggregate', section: 'Deductibles', rows: 3 },
    { key: 'deductiblesAdditionalText', label: 'Deductibles Additional Text', section: 'Deductibles', rows: 3 },
    { key: 'ncbDefaultText', label: 'NCB Default Text ({ncb_amount}, {ncb_percent} placeholders)', section: 'NCB', rows: 2 },
    { key: 'upccDefaultText', label: 'UPCC Default Text ({upcc_amount}, {upcc_percent} placeholders)', section: 'UPCC', rows: 2 },
    { key: 'continuationPiClubText', label: 'Upfront Continuity Credit (UPCC) Additional Text', section: 'UPCC', rows: 3 },
    { key: 'nonRefundableFirstText', label: 'Non-Refundable (1st Instalment)', section: 'Premium', rows: 1 },
    { key: 'nonRefundablePercentText', label: 'Non-Refundable (Percentage) — {percent} placeholder', section: 'Premium', rows: 1 },
    { key: 'premiumPaymentIntro', label: 'Payment Intro — Multiple Instalments ({instalments} = number)', section: 'Premium', rows: 2 },
    { key: 'premiumPaymentIntroSingle', label: 'Payment Intro — Single Instalment ({timing} = "at inception" or "within X days")', section: 'Premium', rows: 2 },
    { key: 'premiumCondition', label: 'Payment Condition Precedent', section: 'Premium', rows: 4 },
    { key: 'premiumEarned', label: 'Premium Earned Clause', section: 'Premium', rows: 3 },
    { key: 'informationNote', label: 'Information Note', section: 'Information', rows: 2 },
    { key: 'importantNotice', label: 'Important Notice (Default)', section: 'Important Notice', rows: 5 },
    { key: 'importantNoticePI', label: 'Important Notice (P&I)', section: 'Important Notice', rows: 5 },
    { key: 'importantNoticeHull', label: 'Important Notice (Hull)', section: 'Important Notice', rows: 5 },
    { key: 'importantNoticeWar', label: 'Important Notice (War)', section: 'Important Notice', rows: 5 }
]

const STANDARD_TEXT_SECTIONS = ['Document Header & Footer', ...Array.from(new Set(SECTION_TEXT_FIELDS.map(f => f.section)))]

function StandardTextsTab({ showSuccess }: TabProps) {
    const [texts, setTexts] = useState<PISectionTexts>({})
    const [loaded, setLoaded] = useState(false)
    const [activeSection, setActiveSection] = useState(STANDARD_TEXT_SECTIONS[0])
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const saved = await window.api.piGetSectionTexts()
        if (saved && Object.keys(saved).length > 0) {
            setTexts(saved)
        } else {
            setTexts(DEFAULT_SECTION_TEXTS)
        }
        setLoaded(true)
    }

    const handleSave = async () => {
        await window.api.piSetSectionTexts(texts)
        showSuccess('Standard texts saved')
    }

    const handleReset = () => {
        setTexts(DEFAULT_SECTION_TEXTS)
    }

    if (!loaded) return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading...</div>

    const filteredFields = SECTION_TEXT_FIELDS.filter(f => f.section === activeSection)

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Standard Section Texts</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>These texts appear in every exported quotation. Edit to customize your template.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleReset} className="btn-secondary" style={{ fontSize: '0.8rem' }}>Reset Defaults</button>
                    <button onClick={handleSave} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}><Save size={14} /> Save All</button>
                </div>
            </div>

            {/* Section dropdown */}
            <div style={{ marginBottom: '20px' }}>
                <select
                    value={activeSection}
                    onChange={e => setActiveSection(e.target.value)}
                    style={{
                        fontSize: '0.88rem',
                        fontWeight: 600,
                        padding: '8px 14px',
                        borderRadius: '8px',
                        border: `2px solid ${isLight ? 'rgba(0,210,255,0.3)' : 'rgba(0,210,255,0.2)'}`,
                        background: isLight ? '#f0f8ff' : 'rgba(0,210,255,0.06)',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        minWidth: '220px'
                    }}
                >
                    {STANDARD_TEXT_SECTIONS.map(s => (
                        <option key={s} value={s}>{s} ({s === 'Document Header & Footer' ? 2 : SECTION_TEXT_FIELDS.filter(f => f.section === s).length})</option>
                    ))}
                </select>
            </div>

            {/* Document Header & Footer section */}
            {activeSection === 'Document Header & Footer' && (
                <>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Rich text for the Word document header and footer. Supports different font sizes, alignment, bold/italic, and Arabic text.
                    </p>
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Document Header</label>
                        <RichTextEditor
                            value={texts.docHeader || ''}
                            onChange={val => setTexts(prev => ({ ...prev, docHeader: val }))}
                            minHeight={60}
                            showFontSize
                            showFontFamily
                            showAlignment
                            showLineSpacing
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Default line spacing:</label>
                            <select
                                value={texts.docHeaderSpacing ?? 1}
                                onChange={e => setTexts(prev => ({ ...prev, docHeaderSpacing: parseFloat(e.target.value) }))}
                                style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', width: '70px' }}
                            >
                                <option value={0.9}>None</option>
                                <option value={1}>1.0</option>
                                <option value={1.15}>1.15</option>
                                <option value={1.5}>1.5</option>
                                <option value={2}>2.0</option>
                                <option value={2.5}>2.5</option>
                                <option value={3}>3.0</option>
                            </select>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>(applied when no per-line spacing is set)</span>
                        </div>
                    </div>
                    <div style={{ marginBottom: '16px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Document Footer</label>
                        <RichTextEditor
                            value={texts.docFooter || ''}
                            onChange={val => setTexts(prev => ({ ...prev, docFooter: val }))}
                            minHeight={60}
                            showFontSize
                            showFontFamily
                            showAlignment
                            showLineSpacing
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                            <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Default line spacing:</label>
                            <select
                                value={texts.docFooterSpacing ?? 1}
                                onChange={e => setTexts(prev => ({ ...prev, docFooterSpacing: parseFloat(e.target.value) }))}
                                style={{ fontSize: '0.78rem', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', width: '70px' }}
                            >
                                <option value={0.9}>None</option>
                                <option value={1}>1.0</option>
                                <option value={1.15}>1.15</option>
                                <option value={1.5}>1.5</option>
                                <option value={2}>2.0</option>
                                <option value={2.5}>2.5</option>
                                <option value={3}>3.0</option>
                            </select>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>(applied when no per-line spacing is set)</span>
                        </div>
                    </div>
                </>
            )}

            {/* Dynamic section fields */}
            {activeSection !== 'Document Header & Footer' && filteredFields.map(field => (
                <div key={field.key} style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{field.label}</label>
                    <RichTextEditor
                        value={String(texts[field.key] || '')}
                        onChange={val => setTexts(prev => ({ ...prev, [field.key]: val }))}
                        minHeight={Math.max(60, (field.rows || 3) * 22)}
                        showFontSize
                        showAlignment
                        showLineSpacing
                    />
                </div>
            ))}
        </section>
    )
}

// ==================== Instalment Defaults Tab ====================

function InstalmentDefaultsTab({ showSuccess }: TabProps) {
    const [defaults, setDefaults] = useState<InstalmentDefaults>({})
    const [loaded, setLoaded] = useState(false)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const saved = await window.api.piGetInstalmentDefaults()
        if (saved && Object.keys(saved).length > 0) {
            setDefaults(saved)
        } else {
            setDefaults({ '1': [0], '2': [0, 180], '3': [0, 90, 180], '4': [0, 90, 180, 270] })
        }
        setLoaded(true)
    }

    const handleSave = async () => {
        await window.api.piSetInstalmentDefaults(defaults)
        showSuccess('Instalment defaults saved')
    }

    const updateDay = (count: string, index: number, value: number) => {
        setDefaults(prev => {
            const arr = [...(prev[count] || [])]
            arr[index] = value
            return { ...prev, [count]: arr }
        })
    }

    if (!loaded) return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading...</div>

    const counts = ['1', '2', '3', '4', '5', '6']

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Instalment Schedule Defaults</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Default days from inception for each instalment, by number of instalments.</p>
                </div>
                <button onClick={handleSave} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}><Save size={14} /> Save</button>
            </div>

            {counts.map(count => {
                const days = defaults[count] || Array.from({ length: Number(count) }, () => 0)
                return (
                    <div key={count} style={{ marginBottom: '14px', padding: '12px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '8px' }}>{count} Instalment{Number(count) > 1 ? 's' : ''}</div>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            {Array.from({ length: Number(count) }).map((_, idx) => (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Inst. {idx + 1}</label>
                                    <input
                                        type="number"
                                        value={days[idx] ?? 0}
                                        onChange={e => updateDay(count, idx, Number(e.target.value))}
                                        style={{ width: '70px', fontSize: '0.82rem', padding: '4px 6px', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }}
                                    />
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>days</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )
            })}
        </section>
    )
}

// ==================== Section Order Tab ====================

function SectionOrderTab({ showSuccess }: TabProps) {
    const [order, setOrder] = useState<string[]>([])
    const [dirty, setDirty] = useState(false)
    const [selectedType, setSelectedType] = useState<string>('P')

    useEffect(() => { loadData() }, [selectedType])

    const loadData = async () => {
        const saved = await window.api.piGetSectionOrderDefaultsByType(selectedType)
        const fallback = getDefaultSectionOrder(selectedType)
        setOrder(Array.isArray(saved) && saved.length > 0 ? saved : fallback)
        setDirty(false)
    }

    const handleMove = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...order]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setOrder(newOrder)
        setDirty(true)
    }

    const handleSave = async () => {
        await window.api.piSetSectionOrderDefaultsByType(selectedType, order)
        showSuccess('Section order saved')
        setDirty(false)
    }

    const handleReset = () => {
        setOrder(getDefaultSectionOrder(selectedType))
        setDirty(true)
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <h3 style={{ fontSize: '1rem', margin: 0 }}>Default Section Order</h3>
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {[{ code: 'P', label: 'P&I' }, { code: 'H', label: 'Hull' }, { code: 'W', label: 'War' }].map(t => (
                            <button key={t.code} onClick={() => setSelectedType(t.code)} style={{
                                padding: '4px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: selectedType === t.code ? 600 : 400,
                                border: selectedType === t.code ? '2px solid var(--accent-primary)' : '1px solid var(--table-border)',
                                background: selectedType === t.code ? 'rgba(0, 170, 200, 0.1)' : 'transparent',
                                color: selectedType === t.code ? 'var(--accent-primary)' : 'var(--text-secondary)', cursor: 'pointer'
                            }}>{t.label}</button>
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleReset} className="btn-secondary" style={{ fontSize: '0.78rem' }}>Reset to Default</button>
                    <button onClick={handleSave} className="btn-primary" disabled={!dirty} style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Save size={14} /> Save</button>
                </div>
            </div>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Set the default order of sections for {selectedType === 'H' ? 'Hull' : selectedType === 'W' ? 'War' : 'P&I'} quotation exports. Each quotation can override this order individually.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {order.map((key, i) => (
                    <div key={key} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', minWidth: '22px' }}>{i + 1}.</span>
                        <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>{SECTION_LABELS[key] || key}</span>
                        <div style={{ display: 'flex', gap: '2px' }}>
                            <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={16} /></button>
                            <button onClick={() => handleMove(i, 'down')} disabled={i === order.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === order.length - 1 ? 0.3 : 1 }}><ChevronDown size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    )
}

// ==================== Hull Agreed Value Texts Tab ====================

function HullAgreedValueTextsTab({ showSuccess }: TabProps) {
    const [texts, setTexts] = useState<HullAgreedValueText[]>([])
    const [newText, setNewText] = useState('')
    const [newDefault, setNewDefault] = useState(false)
    const [newSection, setNewSection] = useState('hm')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [editSection, setEditSection] = useState('hm')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const result = await window.api.hullGetAgreedValueTexts()
        if (Array.isArray(result)) setTexts(result)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        await window.api.hullAddAgreedValueText(newText.trim(), newDefault, newSection)
        setNewText(''); setNewDefault(false); setNewSection('hm')
        showSuccess('Agreed value text added')
        loadData()
    }

    const handleSaveEdit = async (id: string) => {
        await window.api.hullUpdateAgreedValueText(id, { text: editText.trim(), section: editSection })
        setEditingId(null)
        showSuccess('Text updated')
        loadData()
    }

    const handleToggleDefault = async (id: string, current: boolean) => {
        await window.api.hullUpdateAgreedValueText(id, { defaultSelected: !current })
        loadData()
    }

    const handleDelete = async (id: string) => {
        await window.api.hullDeleteAgreedValueText(id)
        showSuccess('Text deleted')
        loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...texts]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setTexts(newOrder)
        await window.api.hullReorderAgreedValueTexts(newOrder.map(t => t.id))
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Agreed Insured Value Texts</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Template texts for the Agreed Insured Value section in Hull quotations. Default texts are auto-added to new quotations.</p>

            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'flex-start' }}>
                <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="e.g., on Hull and Machinery, Gear and Equipment and everything connected therewith, nothing excluded." style={{ flex: 1, minHeight: '60px', fontSize: '0.85rem', padding: '8px' }} />
                <select value={newSection} onChange={e => setNewSection(e.target.value)} style={{ width: '80px', fontSize: '0.8rem', padding: '6px 8px' }}>
                    <option value="hm">Hull</option>
                    <option value="iv">IV</option>
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                </label>
                <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
            </form>

            {texts.map((t, i) => (
                <div key={t.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                        <button onClick={() => handleMove(i, 'down')} disabled={i === texts.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === texts.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                    </div>
                    <div style={{ flex: 1 }}>
                        {editingId === t.id ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, minHeight: '50px', fontSize: '0.82rem', padding: '6px' }} />
                                <select value={editSection} onChange={e => setEditSection(e.target.value)} style={{ width: '70px', fontSize: '0.78rem', padding: '4px 6px' }}>
                                    <option value="hm">Hull</option>
                                    <option value="iv">IV</option>
                                </select>
                                <button onClick={() => { handleSaveEdit(t.id) }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Save size={12} /></button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><X size={12} /></button>
                            </div>
                        ) : (
                            <span style={{ fontSize: '0.82rem' }}>{t.text}</span>
                        )}
                    </div>
                    <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', background: t.section === 'iv' ? '#6464ff22' : '#ff64c822', color: t.section === 'iv' ? '#6464ff' : '#ff64c8', border: `1px solid ${t.section === 'iv' ? '#6464ff44' : '#ff64c844'}` }}>{t.section === 'iv' ? 'IV' : 'Hull'}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={t.defaultSelected} onChange={() => handleToggleDefault(t.id, t.defaultSelected)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                    </label>
                    <button onClick={() => { setEditingId(t.id); setEditText(t.text); setEditSection(t.section || 'hm') }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                    <button onClick={() => handleDelete(t.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                </div>
            ))}
        </section>
    )
}

// ==================== Hull Clauses Tab ====================

function HullClausesTab({ showSuccess, showError }: TabProps) {
    const [clauses, setClauses] = useState<HullClause[]>([])
    const [conditions, setConditions] = useState<HullClauseCondition[]>([])
    const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null)

    // Add clause form
    const [newName, setNewName] = useState('')
    const [newCode, setNewCode] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [newClauseSection, setNewClauseSection] = useState<HullConditionSection>('hm')

    // Edit clause
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editCode, setEditCode] = useState('')
    const [editDesc, setEditDesc] = useState('')
    const [editClauseSection, setEditClauseSection] = useState<HullConditionSection>('hm')

    // Add condition form
    const [newCondNum, setNewCondNum] = useState('')
    const [newCondText, setNewCondText] = useState('')
    const [newCondDefault, setNewCondDefault] = useState(false)
    const [newCondHasAmount, setNewCondHasAmount] = useState(false)
    const [newCondPlaceholder, setNewCondPlaceholder] = useState('')

    // Edit condition
    const [editCondId, setEditCondId] = useState<string | null>(null)
    const [editCondNum, setEditCondNum] = useState('')
    const [editCondText, setEditCondText] = useState('')
    const [editCondHasAmount, setEditCondHasAmount] = useState(false)
    const [editCondPlaceholder, setEditCondPlaceholder] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const cls = await window.api.hullGetClauses()
        if (Array.isArray(cls)) setClauses(cls)
    }

    const loadConditions = async (clauseId: string) => {
        const conds = await window.api.hullGetClauseConditions(clauseId)
        if (Array.isArray(conds)) setConditions(conds)
    }

    useEffect(() => { if (selectedClauseId) loadConditions(selectedClauseId) }, [selectedClauseId])

    const handleAddClause = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim() || !newCode.trim()) return
        try {
            const result = await window.api.hullAddClause(newName.trim(), newCode.trim(), newDesc.trim() || undefined, newClauseSection) as any
            if (result?.error) { showError(result.message || 'Failed to add clause'); return }
            setNewName(''); setNewCode(''); setNewDesc(''); setNewClauseSection('hm')
            showSuccess('Hull clause added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add clause') }
    }

    const handleSaveClause = async () => {
        if (!editingId) return
        try { await window.api.hullUpdateClause(editingId, { name: editName.trim(), code: editCode.trim(), description: editDesc.trim(), conditionSection: editClauseSection }) } catch {}
        setEditingId(null)
        showSuccess('Clause updated')
        loadData()
    }

    const handleDuplicateClause = async (clause: HullClause) => {
        try {
            const result = await window.api.hullAddClause(
                clause.name + ' (Copy)',
                clause.code + '-COPY',
                clause.description || undefined,
                clause.conditionSection || 'hm'
            ) as any
            if (result?.error) { showError(result.message || 'Failed to duplicate'); return }
            // Copy all conditions from original clause
            const srcConds = await window.api.hullGetClauseConditions(clause.id)
            if (Array.isArray(srcConds)) {
                for (const cond of srcConds) {
                    await window.api.hullAddClauseCondition(
                        result.id, cond.conditionNumber, cond.text,
                        cond.defaultSelected, 'both',
                        cond.hasAmount || false, cond.amountPlaceholder || undefined
                    )
                }
            }
            showSuccess(`Duplicated "${clause.name}" with ${Array.isArray(srcConds) ? srcConds.length : 0} conditions`)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to duplicate clause') }
    }

    const handleDeleteClause = async (id: string) => {
        await window.api.hullDeleteClause(id)
        if (selectedClauseId === id) { setSelectedClauseId(null); setConditions([]) }
        showSuccess('Clause deleted')
        loadData()
    }

    const handleMoveClause = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...clauses]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClauses(newOrder)
        await window.api.hullReorderClauses(newOrder.map(c => c.id))
    }

    // Condition CRUD
    const handleAddCondition = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedClauseId || !newCondNum.trim() || !newCondText.trim()) return
        await window.api.hullAddClauseCondition(selectedClauseId, newCondNum.trim(), newCondText.trim(), newCondDefault, 'both', newCondHasAmount, newCondPlaceholder.trim() || undefined)
        setNewCondNum(''); setNewCondText(''); setNewCondDefault(false); setNewCondHasAmount(false); setNewCondPlaceholder('')
        showSuccess('Condition added')
        loadConditions(selectedClauseId)
    }

    const handleSaveCondition = async () => {
        if (!editCondId || !selectedClauseId) return
        await window.api.hullUpdateClauseCondition(editCondId, { conditionNumber: editCondNum.trim(), text: editCondText.trim(), hasAmount: editCondHasAmount, amountPlaceholder: editCondPlaceholder.trim() || undefined })
        setEditCondId(null)
        showSuccess('Condition updated')
        loadConditions(selectedClauseId)
    }

    const handleToggleCondDefault = async (id: string, current: boolean) => {
        if (!selectedClauseId) return
        await window.api.hullUpdateClauseCondition(id, { defaultSelected: !current })
        loadConditions(selectedClauseId)
    }

    const handleDeleteCondition = async (id: string) => {
        if (!selectedClauseId) return
        await window.api.hullDeleteClauseCondition(id)
        showSuccess('Condition deleted')
        loadConditions(selectedClauseId)
    }

    const handleMoveCondition = async (index: number, direction: 'up' | 'down') => {
        if (!selectedClauseId) return
        const newOrder = [...conditions]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setConditions(newOrder)
        await window.api.hullReorderClauseConditions(newOrder.map(c => c.id))
    }

    const selectedClause = clauses.find(c => c.id === selectedClauseId)

    return (
        <div>
            <section className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Hull Clauses</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Main clause types (e.g., CL.280, CL.280 FPA, CL.284). Each clause has its own set of conditions.</p>

                <form onSubmit={handleAddClause} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <input type="text" value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code (e.g., 280)" style={{ width: '100px' }} required />
                        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Name (e.g., Institute Time Clauses – Hulls CL.280)" style={{ flex: 1, minWidth: '250px' }} required />
                        <select value={newClauseSection} onChange={e => setNewClauseSection(e.target.value as HullConditionSection)} style={{ width: '80px', fontSize: '0.8rem', padding: '6px 8px' }}>
                            <option value="hm">Hull</option>
                            <option value="iv">IV</option>
                        </select>
                        <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
                    </div>
                    <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Wording of the condition" rows={2} style={{ width: '100%', fontSize: '0.82rem', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', resize: 'vertical' }} required />
                </form>

                {clauses.map((c, i) => (
                    <div key={c.id} style={{
                        padding: '10px 14px', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer',
                        border: selectedClauseId === c.id ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)',
                        background: selectedClauseId === c.id ? 'rgba(0, 210, 255, 0.06)' : 'transparent',
                        display: 'flex', alignItems: 'center', gap: '10px'
                    }} onClick={() => setSelectedClauseId(c.id)}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => handleMoveClause(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                            <button onClick={() => handleMoveClause(i, 'down')} disabled={i === clauses.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === clauses.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                        </div>
                        {editingId === c.id ? (
                            <div style={{ flex: 1 }} onClick={e => e.stopPropagation()}>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '6px' }}>
                                    <input type="text" value={editCode} onChange={e => setEditCode(e.target.value)} style={{ width: '80px', fontSize: '0.82rem', padding: '4px 8px' }} />
                                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={{ flex: 1, minWidth: '200px', fontSize: '0.82rem', padding: '4px 8px' }} />
                                    <select value={editClauseSection} onChange={e => setEditClauseSection(e.target.value as HullConditionSection)} style={{ width: '80px', fontSize: '0.78rem', padding: '4px 6px' }}>
                                        <option value="hm">Hull</option>
                                        <option value="iv">IV</option>
                                    </select>
                                    <button onClick={handleSaveClause} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Save size={12} /></button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><X size={12} /></button>
                                </div>
                                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Wording" rows={2} style={{ width: '100%', fontSize: '0.82rem', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', resize: 'vertical' }} />
                            </div>
                        ) : (
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: '60px', color: 'var(--accent-primary)' }}>CL.{c.code}</span>
                                    <span style={{ fontSize: '0.82rem', flex: 1 }}>{c.name}</span>
                                    <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', background: c.conditionSection === 'iv' ? '#6464ff22' : '#ff64c822', color: c.conditionSection === 'iv' ? '#6464ff' : '#ff64c8', border: `1px solid ${c.conditionSection === 'iv' ? '#6464ff44' : '#ff64c844'}` }}>{c.conditionSection === 'iv' ? 'IV' : 'Hull'}</span>
                                    <div onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: '4px' }}>
                                        <button onClick={() => handleDuplicateClause(c)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} title="Duplicate clause with conditions"><Copy size={12} /></button>
                                        <button onClick={() => { setEditingId(c.id); setEditCode(c.code); setEditName(c.name); setEditDesc(c.description || ''); setEditClauseSection(c.conditionSection || 'hm') }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                        <button onClick={() => handleDeleteClause(c.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                    </div>
                                </div>
                                {c.description && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4 }}>{c.description}</p>}
                            </div>
                        )}
                    </div>
                ))}
            </section>

            {/* Conditions for selected clause */}
            {selectedClause && (
                <section className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Conditions for CL.{selectedClause.code}</h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>{selectedClause.name}</p>

                    <form onSubmit={handleAddCondition} style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <input type="text" value={newCondNum} onChange={e => setNewCondNum(e.target.value)} placeholder="Cl. #" style={{ width: '70px' }} required />
                        <input type="text" value={newCondText} onChange={e => setNewCondText(e.target.value)} placeholder="Condition text (e.g., Collision Liability deleted.)" style={{ flex: 1, minWidth: '250px' }} required />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={newCondDefault} onChange={e => setNewCondDefault(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={newCondHasAmount} onChange={e => setNewCondHasAmount(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Amount
                        </label>
                        {newCondHasAmount && <input type="text" value={newCondPlaceholder} onChange={e => setNewCondPlaceholder(e.target.value)} placeholder="Placeholder e.g. {deductible}" style={{ width: '160px', fontSize: '0.8rem' }} />}
                        <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
                    </form>

                    {conditions.map((cond, i) => (
                        <div key={cond.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button onClick={() => handleMoveCondition(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={12} /></button>
                                <button onClick={() => handleMoveCondition(i, 'down')} disabled={i === conditions.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === conditions.length - 1 ? 0.3 : 1 }}><ChevronDown size={12} /></button>
                            </div>
                            {editCondId === cond.id ? (
                                <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input type="text" value={editCondNum} onChange={e => setEditCondNum(e.target.value)} style={{ width: '60px', fontSize: '0.82rem', padding: '4px 6px' }} />
                                    <input type="text" value={editCondText} onChange={e => setEditCondText(e.target.value)} style={{ flex: 1, fontSize: '0.82rem', padding: '4px 6px', minWidth: '200px' }} />
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        <input type="checkbox" checked={editCondHasAmount} onChange={e => setEditCondHasAmount(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Amount
                                    </label>
                                    {editCondHasAmount && <input type="text" value={editCondPlaceholder} onChange={e => setEditCondPlaceholder(e.target.value)} placeholder="{placeholder}" style={{ width: '130px', fontSize: '0.78rem', padding: '4px 6px' }} />}
                                    <button onClick={handleSaveCondition} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Save size={12} /></button>
                                    <button onClick={() => setEditCondId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><X size={12} /></button>
                                </div>
                            ) : (
                                <>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, minWidth: '50px', color: 'var(--accent-primary)' }}>Cl.{cond.conditionNumber}</span>
                                    <span style={{ fontSize: '0.82rem', flex: 1 }}>{cond.text}</span>
                                    {cond.hasAmount && <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>{cond.amountPlaceholder || 'AMT'}</span>}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        <input type="checkbox" checked={cond.defaultSelected} onChange={() => handleToggleCondDefault(cond.id, cond.defaultSelected)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                                    </label>
                                    <button onClick={() => { setEditCondId(cond.id); setEditCondNum(cond.conditionNumber); setEditCondText(cond.text); setEditCondHasAmount(!!cond.hasAmount); setEditCondPlaceholder(cond.amountPlaceholder || '') }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                    <button onClick={() => handleDeleteCondition(cond.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                </>
                            )}
                        </div>
                    ))}
                    {conditions.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>No conditions yet. Add conditions for this clause above.</p>}
                </section>
            )}
        </div>
    )
}

// ==================== Hull Additional Conditions Tab ====================

function HullAdditionalConditionsTab({ showSuccess, showError }: TabProps) {
    const [conditions, setConditions] = useState<HullAdditionalCondition[]>([])
    const [hullClauses, setHullClauses] = useState<{ id: string; name: string; code: string }[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [newText, setNewText] = useState('')
    const [newDefault, setNewDefault] = useState(false)
    const [newClauseIds, setNewClauseIds] = useState<string[]>([])
    const [newHasAmount, setNewHasAmount] = useState(false)
    const [newAmountPlaceholder, setNewAmountPlaceholder] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editText, setEditText] = useState('')
    const [editHasAmount, setEditHasAmount] = useState(false)
    const [editAmountPlaceholder, setEditAmountPlaceholder] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const [result, clauses] = await Promise.all([
            window.api.hullGetAdditionalConditions(),
            window.api.hullGetClauses()
        ])
        if (Array.isArray(result)) setConditions(result)
        if (Array.isArray(clauses)) setHullClauses(clauses)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        const result = await window.api.hullAddAdditionalCondition(newTitle.trim() || null, newText.trim(), newDefault, newClauseIds, newHasAmount, newAmountPlaceholder.trim() || undefined) as any
        if (result?.error) { showError(result.message || 'Failed to add condition'); return }
        setNewTitle(''); setNewText(''); setNewDefault(false); setNewClauseIds([]); setNewHasAmount(false); setNewAmountPlaceholder('')
        showSuccess('Condition added')
        loadData()
    }

    const handleSaveEdit = async (id: string) => {
        await window.api.hullUpdateAdditionalCondition(id, { title: editTitle.trim() || null, text: editText.trim(), hasAmount: editHasAmount, amountPlaceholder: editAmountPlaceholder.trim() || undefined })
        setEditingId(null)
        showSuccess('Condition updated')
        loadData()
    }

    const toggleClauseLink = async (conditionId: string, clauseId: string) => {
        const cond = conditions.find(c => c.id === conditionId)
        if (!cond) return
        const current = cond.hullClauseIds || []
        const updated = current.includes(clauseId) ? current.filter(id => id !== clauseId) : [...current, clauseId]
        await window.api.hullUpdateAdditionalCondition(conditionId, { hullClauseIds: updated })
        loadData()
    }

    const handleToggleDefault = async (id: string, current: boolean) => {
        await window.api.hullUpdateAdditionalCondition(id, { defaultSelected: !current })
        loadData()
    }

    const handleDelete = async (id: string) => {
        await window.api.hullDeleteAdditionalCondition(id)
        showSuccess('Condition deleted')
        loadData()
    }

    const [dragIndex, setDragIndex] = useState<number | null>(null)
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

    const handleDragStart = (index: number) => {
        setDragIndex(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (dragIndex === null || dragIndex === index) return
        setDragOverIndex(index)
    }

    const handleDrop = async (index: number) => {
        if (dragIndex === null || dragIndex === index) {
            setDragIndex(null)
            setDragOverIndex(null)
            return
        }
        const newOrder = [...conditions]
        const [moved] = newOrder.splice(dragIndex, 1)
        newOrder.splice(index, 0, moved)
        setConditions(newOrder)
        setDragIndex(null)
        setDragOverIndex(null)
        await window.api.hullReorderAdditionalConditions(newOrder.map(c => c.id))
    }

    const handleDragEnd = () => {
        setDragIndex(null)
        setDragOverIndex(null)
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Hull Additional Conditions</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Standalone condition paragraphs (exclusions, terms references, etc.) that can be added to Hull quotations. Default items are auto-added.</p>

            <form onSubmit={handleAdd} style={{ marginBottom: '16px', padding: '14px', borderRadius: '8px', border: '1px dashed var(--table-border)' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Title (e.g. War Exclusion)" style={{ width: '200px', flexShrink: 0 }} />
                    <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Condition text (e.g., Excluding all claims of whatsoever nature...)" style={{ flex: 1, minHeight: '100px', minWidth: '200px', fontSize: '0.85rem', padding: '8px' }} />
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {hullClauses.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginRight: '2px' }}>Clauses:</span>
                            <button type="button" onClick={() => setNewClauseIds(prev => prev.length === hullClauses.length ? [] : hullClauses.map(hc => hc.id))}
                                style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: '10px', cursor: 'pointer', border: newClauseIds.length === 0 || newClauseIds.length === hullClauses.length ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: newClauseIds.length === 0 || newClauseIds.length === hullClauses.length ? 'rgba(0, 170, 200, 0.12)' : 'transparent', color: newClauseIds.length === 0 || newClauseIds.length === hullClauses.length ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                            >All</button>
                            {hullClauses.map(hc => (
                                <button key={hc.id} type="button" onClick={() => setNewClauseIds(prev => prev.includes(hc.id) ? prev.filter(id => id !== hc.id) : [...prev, hc.id])}
                                    style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: '10px', cursor: 'pointer', border: newClauseIds.includes(hc.id) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: newClauseIds.includes(hc.id) ? 'rgba(0, 170, 200, 0.12)' : 'transparent', color: newClauseIds.includes(hc.id) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                >{hc.code}</button>
                            ))}
                        </div>
                    )}
                    <div style={{ flex: 1 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={newHasAmount} onChange={e => setNewHasAmount(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Amount
                    </label>
                    {newHasAmount && <input type="text" value={newAmountPlaceholder} onChange={e => setNewAmountPlaceholder(e.target.value)} placeholder="Placeholder e.g. {deductible}" style={{ width: '160px', fontSize: '0.8rem' }} />}
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                    </label>
                    <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
                </div>
            </form>

            {conditions.map((c, i) => (
                <div key={c.id} draggable onDragStart={() => handleDragStart(i)} onDragOver={e => handleDragOver(e, i)} onDrop={() => handleDrop(i)} onDragEnd={handleDragEnd} style={{ borderRadius: '10px', border: dragOverIndex === i ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.15)', marginBottom: '10px', overflow: 'hidden', opacity: dragIndex === i ? 0.5 : 1, transition: 'border-color 0.15s, opacity 0.15s' }}>
                    {/* Header: title + actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ cursor: 'grab', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', marginRight: '2px' }}>
                            <GripVertical size={16} />
                        </div>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)' }}>{c.title || 'Untitled Condition'}</span>
                        {c.hasAmount && <span style={{ fontSize: '0.68rem', padding: '2px 7px', borderRadius: '4px', fontWeight: 600, whiteSpace: 'nowrap', background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44' }}>{c.amountPlaceholder || 'AMT'}</span>}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={c.defaultSelected} onChange={() => handleToggleDefault(c.id, c.defaultSelected)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                        </label>
                        <button onClick={() => { setEditingId(c.id); setEditTitle(c.title || ''); setEditText(c.text); setEditHasAmount(!!c.hasAmount); setEditAmountPlaceholder(c.amountPlaceholder || '') }} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(c.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                    </div>
                    {/* Body: text or edit form */}
                    <div style={{ padding: '10px 14px 10px 42px' }}>
                        {editingId === c.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" style={{ width: '240px' }} />
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: '100px', fontSize: '0.82rem', padding: '8px', resize: 'vertical' }} />
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        <input type="checkbox" checked={editHasAmount} onChange={e => setEditHasAmount(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Amount
                                    </label>
                                    {editHasAmount && <input type="text" value={editAmountPlaceholder} onChange={e => setEditAmountPlaceholder(e.target.value)} placeholder="{placeholder}" style={{ width: '130px', fontSize: '0.78rem', padding: '4px 6px' }} />}
                                    <button onClick={() => handleSaveEdit(c.id)} className="btn-primary" style={{ padding: '5px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Save size={12} /> Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '5px 12px', fontSize: '0.78rem' }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{c.text}</div>
                        )}
                    </div>
                    {/* Footer: clause pills */}
                    {hullClauses.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', padding: '8px 14px 10px 42px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginRight: '2px' }}>Clauses:</span>
                            <button type="button" onClick={() => {
                                const allIds = hullClauses.map(hc => hc.id)
                                const current = c.hullClauseIds || []
                                const updated = current.length === allIds.length ? [] : allIds
                                window.api.hullUpdateAdditionalCondition(c.id, { hullClauseIds: updated }).then(() => loadData())
                            }}
                                style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: '10px', cursor: 'pointer', border: (c.hullClauseIds || []).length === 0 || (c.hullClauseIds || []).length === hullClauses.length ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.18)', background: (c.hullClauseIds || []).length === 0 || (c.hullClauseIds || []).length === hullClauses.length ? 'rgba(0, 170, 200, 0.12)' : 'transparent', color: (c.hullClauseIds || []).length === 0 || (c.hullClauseIds || []).length === hullClauses.length ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                            >All</button>
                            {hullClauses.map(hc => {
                                const linked = (c.hullClauseIds || []).includes(hc.id)
                                return (
                                    <button key={hc.id} type="button" onClick={() => toggleClauseLink(c.id, hc.id)}
                                        style={{ padding: '3px 10px', fontSize: '0.72rem', borderRadius: '10px', cursor: 'pointer', border: linked ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.18)', background: linked ? 'rgba(0, 170, 200, 0.12)' : 'transparent', color: linked ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
                                    >{hc.code}</button>
                                )
                            })}
                        </div>
                    )}
                </div>
            ))}
            {conditions.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>No additional conditions yet.</p>}
        </section>
    )
}

// ==================== War Conditions Tab ====================

function WarConditionsTab({ showSuccess, showError, isLight }: TabProps) {
    const [conditions, setConditions] = useState<WarCondition[]>([])
    const [newText, setNewText] = useState('')
    const [newDefault, setNewDefault] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [showImport, setShowImport] = useState(false)
    const [importText, setImportText] = useState('')
    const [importParsed, setImportParsed] = useState<string[]>([])
    const [importAsDefault, setImportAsDefault] = useState(true)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const result = await window.api.warGetConditions()
        if (Array.isArray(result)) setConditions(result)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        try {
            await window.api.warAddCondition(newText.trim(), newDefault)
            setNewText(''); setNewDefault(false)
            showSuccess('War condition added')
            loadData()
        } catch { showError('Failed to add condition') }
    }

    const parseImportText = (raw: string) => {
        const lines = raw.split('\n')
            .map(l => l.replace(/^[\s\-\u2022\u2013\u2014*•·\d.)\]]+\s*/, '').trim())
            .filter(l => l.length > 0)
        setImportParsed(lines)
    }

    const handleBulkImport = async () => {
        if (importParsed.length === 0) return
        try {
            for (const text of importParsed) {
                await window.api.warAddCondition(text, importAsDefault)
            }
            showSuccess(`${importParsed.length} conditions imported`)
            setShowImport(false)
            setImportText('')
            setImportParsed([])
            loadData()
        } catch { showError('Failed to import conditions') }
    }

    const handleSaveEdit = async (id: string) => {
        await window.api.warUpdateCondition(id, { text: editText.trim() })
        setEditingId(null)
        showSuccess('Condition updated')
        loadData()
    }

    const handleToggleDefault = async (id: string, current: boolean) => {
        await window.api.warUpdateCondition(id, { defaultSelected: !current })
        loadData()
    }

    const handleDelete = async (id: string) => {
        await window.api.warDeleteCondition(id)
        showSuccess('Condition deleted')
        loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...conditions]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setConditions(newOrder)
        await window.api.warReorderConditions(newOrder.map(c => c.id))
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>War Risk Conditions</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                Manage conditions for War Risk quotations. Default conditions are auto-selected for new quotations.
                Use <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.78rem' }}>{'{jwla_code}'}</code> and <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.78rem' }}>{'{jwla_date}'}</code> placeholders for JWLA references, and <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '0.78rem' }}>{'{tc_text}'}</code> for the Terms &amp; Conditions line.
            </p>

            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'flex-start' }}>
                <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="e.g., Institute War and Strikes Clause CL. 281 dated 1/10/83..." style={{ flex: 1, minHeight: '60px', fontSize: '0.85rem', padding: '8px' }} />
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                </label>
                <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
                <button type="button" onClick={() => setShowImport(true)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Download size={14} /> Bulk Import</button>
            </form>

            {conditions.map((c, i) => (
                <div key={c.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                        <button onClick={() => handleMove(i, 'down')} disabled={i === conditions.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === conditions.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                    </div>
                    <div style={{ flex: 1 }}>
                        {editingId === c.id ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, minHeight: '50px', fontSize: '0.82rem', padding: '6px' }} />
                                <button onClick={() => handleSaveEdit(c.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Save size={12} /></button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><X size={12} /></button>
                            </div>
                        ) : (
                            <span style={{ fontSize: '0.82rem' }}>{c.text}</span>
                        )}
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={c.defaultSelected} onChange={() => handleToggleDefault(c.id, c.defaultSelected)} style={{ accentColor: 'var(--accent-primary)' }} /> Default
                    </label>
                    <button onClick={() => { setEditingId(c.id); setEditText(c.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </div>
            ))}
            {conditions.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>No war conditions yet.</p>}

            {/* Bulk Import Modal */}
            {showImport && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImport(false)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '600px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Bulk Import War Conditions</h3>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                            Paste conditions below, one per line. Bullets, dashes, and numbering are automatically stripped.
                        </p>
                        <textarea
                            value={importText}
                            onChange={e => { setImportText(e.target.value); parseImportText(e.target.value) }}
                            placeholder="- Institute War and Strikes Clause CL. 281 dated 1/10/83&#10;- Violent Theft, Piracy and Barratry Extension Clause JW 2005-002&#10;- ..."
                            style={{ width: '100%', minHeight: '160px', fontSize: '0.84rem', padding: '10px', marginBottom: '10px' }}
                        />
                        {importParsed.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                                <p style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '6px' }}>{importParsed.length} condition{importParsed.length !== 1 ? 's' : ''} parsed:</p>
                                <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--table-border)', borderRadius: '6px', padding: '8px' }}>
                                    {importParsed.map((t, i) => (
                                        <div key={i} style={{ fontSize: '0.78rem', padding: '4px 0', borderBottom: i < importParsed.length - 1 ? '1px solid var(--table-border)' : 'none', color: 'var(--text-primary)' }}>
                                            <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>{i + 1}.</span>{t}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={importAsDefault} onChange={e => setImportAsDefault(e.target.checked)} style={{ accentColor: 'var(--accent-primary)' }} /> Set all as default
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => { setShowImport(false); setImportText(''); setImportParsed([]) }} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
                                <button onClick={handleBulkImport} className="btn-primary" disabled={importParsed.length === 0} style={{ fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Plus size={14} /> Import {importParsed.length > 0 ? `${importParsed.length} Conditions` : ''}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </section>
    )
}

// ==================== War Settings Tab ====================

function WarSettingsTab({ showSuccess, showError }: TabProps) {
    const [settings, setSettings] = useState<WarSettings>({
        jwlaCode: 'JWLA032',
        jwlaDate: 'December 18, 2023',
        tcText: 'Al-Bahriah Hull War Terms & Conditions 01 January 2025',
        tradingWarrantyText: 'Worldwide, subject to JWC Hull War, Piracy, Terrorism and Related Perils Listed Areas {jwla_date} {jwla_code}.',
        defaultRate: undefined
    })
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                const result = await window.api.warGetSettings()
                if (result && !(result as any).error) setSettings(result)
            } catch {}
            setLoaded(true)
        })()
    }, [])

    const handleSave = async () => {
        try {
            await window.api.warSetSettings(settings)
            showSuccess('War settings saved')
        } catch { showError('Failed to save war settings') }
    }

    if (!loaded) return <p style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading...</p>

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>War Risk Settings</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Configure JWLA reference, Terms &amp; Conditions text, and trading warranty default text for War Risk quotations.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>JWLA Code</label>
                    <input
                        value={settings.jwlaCode}
                        onChange={e => setSettings({ ...settings, jwlaCode: e.target.value })}
                        placeholder="e.g., JWLA032"
                        style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>JWLA Date</label>
                    <input
                        value={settings.jwlaDate}
                        onChange={e => setSettings({ ...settings, jwlaDate: e.target.value })}
                        placeholder="e.g., December 18, 2023"
                        style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                    />
                </div>
                <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Default Rate (per mille ‰)</label>
                    <input
                        type="number"
                        step="0.001"
                        value={settings.defaultRate ?? ''}
                        onChange={e => setSettings({ ...settings, defaultRate: e.target.value ? parseFloat(e.target.value) : undefined })}
                        placeholder="e.g., 0.30"
                        style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                    />
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Premium = Sum Insured &times; Rate / 1000
                    </p>
                </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Terms &amp; Conditions Text</label>
                <input
                    value={settings.tcText}
                    onChange={e => setSettings({ ...settings, tcText: e.target.value })}
                    placeholder="e.g., Al-Bahriah Hull War Terms & Conditions 01 January 2025"
                    style={{ width: '100%', fontSize: '0.85rem', padding: '8px 10px' }}
                />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    This text is rendered as a standalone line in the Conditions section. Use <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px' }}>{'{tc_text}'}</code> placeholder in conditions to reference it.
                </p>
            </div>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Trading Warranty Text</label>
                <textarea
                    value={settings.tradingWarrantyText}
                    onChange={e => setSettings({ ...settings, tradingWarrantyText: e.target.value })}
                    placeholder="Trading warranty text with {jwla_code} and {jwla_date} placeholders..."
                    style={{ width: '100%', minHeight: '80px', fontSize: '0.85rem', padding: '8px 10px' }}
                />
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                    Placeholders: <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px' }}>{'{jwla_code}'}</code>, <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px' }}>{'{jwla_date}'}</code>
                </p>
            </div>

            <button onClick={handleSave} className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Save size={14} /> Save Settings
            </button>
        </section>
    )
}

// ==================== Workflow Designer Tab ====================

const STEP_COLOR_PRESETS = [
    { label: 'Gray', value: '#6b7280' },
    { label: 'Amber', value: '#f59e0b' },
    { label: 'Blue', value: '#3b82f6' },
    { label: 'Purple', value: '#8b5cf6' },
    { label: 'Green', value: '#22c55e' },
    { label: 'Red', value: '#ef4444' },
    { label: 'Teal', value: '#14b8a6' },
    { label: 'Pink', value: '#ec4899' },
]

const ALL_PERMISSIONS: { key: string; label: string }[] = PERMISSION_CATEGORIES.flatMap(c =>
    c.permissions.map(p => ({ key: p.key, label: `${c.label}: ${p.label}` }))
)

function WorkflowDesignerTab({ showSuccess, showError, isLight }: TabProps) {
    const [steps, setSteps] = useState<WorkflowStep[]>([])
    const [transitions, setTransitions] = useState<WorkflowTransition[]>([])
    const [editingStep, setEditingStep] = useState<string | null>(null)
    const [editForm, setEditForm] = useState<{ name: string; color: string; canEdit: boolean; canExport: boolean; isLockPoint: boolean; isInitial: boolean }>({ name: '', color: '#6b7280', canEdit: true, canExport: false, isLockPoint: false, isInitial: false })
    const [addingStep, setAddingStep] = useState(false)
    const [newStep, setNewStep] = useState<{ name: string; color: string; canEdit: boolean; canExport: boolean; isLockPoint: boolean; isInitial: boolean }>({ name: '', color: '#6b7280', canEdit: true, canExport: false, isLockPoint: false, isInitial: false })
    const [addingTransition, setAddingTransition] = useState(false)
    const [newTransition, setNewTransition] = useState<{ fromStepId: string; toStepId: string; permissionKey: string | null; autoCreateRevision: boolean }>({ fromStepId: '', toStepId: '', permissionKey: null, autoCreateRevision: false })

    useEffect(() => { loadAll() }, [])

    const loadAll = async () => {
        try {
            const [s, t] = await Promise.all([
                window.api.workflowGetSteps(),
                window.api.workflowGetTransitions()
            ])
            setSteps(Array.isArray(s) ? s : [])
            setTransitions(Array.isArray(t) ? t : [])
        } catch (err: any) {
            showError(err.message || 'Failed to load workflow')
        }
    }

    const handleAddStep = async () => {
        if (!newStep.name.trim()) return
        try {
            await window.api.workflowAddStep(newStep)
            showSuccess('Step added')
            setAddingStep(false)
            setNewStep({ name: '', color: '#6b7280', canEdit: true, canExport: false, isLockPoint: false, isInitial: false })
            loadAll()
        } catch (err: any) { showError(err.message || 'Failed to add step') }
    }

    const handleUpdateStep = async (id: string) => {
        if (!editForm.name.trim()) return
        try {
            await window.api.workflowUpdateStep(id, editForm)
            showSuccess('Step updated')
            setEditingStep(null)
            loadAll()
        } catch (err: any) { showError(err.message || 'Failed to update step') }
    }

    const handleDeleteStep = async (id: string) => {
        try {
            await window.api.workflowDeleteStep(id)
            showSuccess('Step deleted')
            loadAll()
        } catch (err: any) { showError(err.message || 'Failed to delete step') }
    }

    const moveStep = async (index: number, dir: -1 | 1) => {
        const arr = [...steps]
        const target = index + dir
        if (target < 0 || target >= arr.length) return
        ;[arr[index], arr[target]] = [arr[target], arr[index]]
        setSteps(arr)
        await window.api.workflowReorderSteps(arr.map(s => s.id))
    }

    const handleAddTransition = async () => {
        if (!newTransition.fromStepId || !newTransition.toStepId) return
        if (newTransition.fromStepId === newTransition.toStepId) {
            showError('From and To steps must be different')
            return
        }
        try {
            await window.api.workflowAddTransition(newTransition)
            showSuccess('Transition added')
            setAddingTransition(false)
            setNewTransition({ fromStepId: '', toStepId: '', permissionKey: null, autoCreateRevision: false })
            loadAll()
        } catch (err: any) { showError(err.message || 'Failed to add transition') }
    }

    const handleDeleteTransition = async (id: string) => {
        try {
            await window.api.workflowDeleteTransition(id)
            showSuccess('Transition deleted')
            loadAll()
        } catch (err: any) { showError(err.message || 'Failed to delete transition') }
    }

    const startEdit = (step: WorkflowStep) => {
        setEditingStep(step.id)
        setEditForm({
            name: step.name,
            color: step.color,
            canEdit: step.canEdit,
            canExport: step.canExport,
            isLockPoint: step.isLockPoint,
            isInitial: step.isInitial
        })
    }

    const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }
    const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: '0.85rem' }

    const ColorPicker = ({ value, onChange }: { value: string; onChange: (c: string) => void }) => (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {STEP_COLOR_PRESETS.map(c => (
                <button
                    key={c.value}
                    type="button"
                    onClick={() => onChange(c.value)}
                    title={c.label}
                    style={{
                        width: 24, height: 24, borderRadius: '50%',
                        background: c.value,
                        border: value === c.value ? '3px solid var(--text-primary)' : '2px solid transparent',
                        cursor: 'pointer',
                        outline: value === c.value ? '2px solid var(--accent-primary)' : 'none',
                        outlineOffset: '1px'
                    }}
                />
            ))}
        </div>
    )

    const ToggleCheckbox = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
            {label}
        </label>
    )

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Section 1: Steps */}
            <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <GitBranch size={18} /> Workflow Steps
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Define the stages a quotation moves through. The initial step is automatically assigned to new quotations.
                </p>

                {/* Visual flow */}
                {steps.length > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '16px 20px', marginBottom: '20px',
                        background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                        borderRadius: '10px', overflowX: 'auto'
                    }}>
                        {steps.map((step, i) => (
                            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                                    <div style={{
                                        width: 28, height: 28, borderRadius: '50%',
                                        background: step.color,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: `0 0 0 3px ${step.color}33`
                                    }}>
                                        {step.isInitial && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
                                        {step.isLockPoint && <Check size={14} color="#fff" strokeWidth={3} />}
                                    </div>
                                    <span style={{
                                        fontSize: '0.72rem', fontWeight: 600, color: step.color,
                                        whiteSpace: 'nowrap', maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis'
                                    }}>
                                        {step.name}
                                    </span>
                                </div>
                                {i < steps.length - 1 && (
                                    <ArrowRight size={16} style={{ color: 'var(--text-secondary)', opacity: 0.5, flexShrink: 0 }} />
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Steps table */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                            <th style={thStyle}>Order</th>
                            <th style={thStyle}>Step</th>
                            <th style={thStyle}>Color</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Can Edit</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Can Export</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Lock Point</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Initial</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {steps.map((step, i) => (
                            <tr key={step.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                <td style={tdStyle}>
                                    <div style={{ display: 'flex', gap: '2px' }}>
                                        <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="btn-secondary" style={{ padding: '2px 6px', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                        <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="btn-secondary" style={{ padding: '2px 6px', opacity: i === steps.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                    </div>
                                </td>
                                <td style={tdStyle}>
                                    {editingStep === step.id ? (
                                        <input
                                            type="text" value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            style={{ padding: '4px 8px', borderRadius: '4px', width: '100%' }}
                                        />
                                    ) : (
                                        <span style={{ fontWeight: 500 }}>{step.name}</span>
                                    )}
                                </td>
                                <td style={tdStyle}>
                                    {editingStep === step.id ? (
                                        <ColorPicker value={editForm.color} onChange={c => setEditForm({ ...editForm, color: c })} />
                                    ) : (
                                        <div style={{
                                            width: 20, height: 20, borderRadius: '50%',
                                            background: step.color, border: '2px solid rgba(255,255,255,0.2)'
                                        }} />
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {editingStep === step.id ? (
                                        <input type="checkbox" checked={editForm.canEdit} onChange={e => setEditForm({ ...editForm, canEdit: e.target.checked })} />
                                    ) : (
                                        step.canEdit ? <Check size={16} style={{ color: '#22c55e' }} /> : <X size={16} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {editingStep === step.id ? (
                                        <input type="checkbox" checked={editForm.canExport} onChange={e => setEditForm({ ...editForm, canExport: e.target.checked })} />
                                    ) : (
                                        step.canExport ? <Check size={16} style={{ color: '#22c55e' }} /> : <X size={16} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {editingStep === step.id ? (
                                        <input type="checkbox" checked={editForm.isLockPoint} onChange={e => setEditForm({ ...editForm, isLockPoint: e.target.checked })} />
                                    ) : (
                                        step.isLockPoint ? <Check size={16} style={{ color: '#3b82f6' }} /> : <X size={16} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                    {editingStep === step.id ? (
                                        <input type="checkbox" checked={editForm.isInitial} onChange={e => setEditForm({ ...editForm, isInitial: e.target.checked })} />
                                    ) : (
                                        step.isInitial ? (
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700,
                                                background: 'rgba(0, 170, 200, 0.12)', color: 'var(--accent-primary)'
                                            }}>INITIAL</span>
                                        ) : null
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>
                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                        {editingStep === step.id ? (
                                            <>
                                                <button onClick={() => handleUpdateStep(step.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                                                    <Save size={13} />
                                                </button>
                                                <button onClick={() => setEditingStep(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                                                    <X size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => startEdit(step)} className="btn-secondary" style={{ padding: '4px 8px' }}>
                                                    <Pencil size={13} />
                                                </button>
                                                <button onClick={() => handleDeleteStep(step.id)} className="btn-secondary" style={{ padding: '4px 8px', color: 'var(--danger)' }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Add step form */}
                {addingStep ? (
                    <div style={{
                        marginTop: '16px', padding: '16px',
                        background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                        borderRadius: '8px', border: '1px solid var(--glass-border)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <input
                                    type="text" value={newStep.name}
                                    onChange={e => setNewStep({ ...newStep, name: e.target.value })}
                                    placeholder="Step name"
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: '6px' }}
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Color</label>
                                <ColorPicker value={newStep.color} onChange={c => setNewStep({ ...newStep, color: c })} />
                            </div>
                            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                <ToggleCheckbox checked={newStep.canEdit} onChange={v => setNewStep({ ...newStep, canEdit: v })} label="Can Edit" />
                                <ToggleCheckbox checked={newStep.canExport} onChange={v => setNewStep({ ...newStep, canExport: v })} label="Can Export" />
                                <ToggleCheckbox checked={newStep.isLockPoint} onChange={v => setNewStep({ ...newStep, isLockPoint: v })} label="Lock Point" />
                                <ToggleCheckbox checked={newStep.isInitial} onChange={v => setNewStep({ ...newStep, isInitial: v })} label="Initial Step" />
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleAddStep} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={14} /> Add Step
                                </button>
                                <button onClick={() => setAddingStep(false)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setAddingStep(true)} className="btn-secondary" style={{ marginTop: '12px', padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> Add Step
                    </button>
                )}
            </div>

            {/* Section 2: Transitions */}
            <div className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ArrowRight size={18} /> Transitions
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Define which step changes are allowed and what permissions are required. &quot;Any user&quot; means no special permission is needed.
                </p>

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                            <th style={thStyle}>From</th>
                            <th style={{ ...thStyle, textAlign: 'center', width: '40px' }}></th>
                            <th style={thStyle}>To</th>
                            <th style={thStyle}>Permission</th>
                            <th style={{ ...thStyle, textAlign: 'center' }}>Auto-Revision</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {transitions.map(t => {
                            const fromStep = steps.find(s => s.id === t.fromStepId)
                            const toStep = steps.find(s => s.id === t.toStepId)
                            return (
                                <tr key={t.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={tdStyle}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: fromStep?.color || '#6b7280', flexShrink: 0 }} />
                                            {t.fromStepName || fromStep?.name || '—'}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        <ArrowRight size={14} style={{ color: 'var(--text-secondary)' }} />
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: 12, height: 12, borderRadius: '50%', background: toStep?.color || '#6b7280', flexShrink: 0 }} />
                                            {t.toStepName || toStep?.name || '—'}
                                        </span>
                                    </td>
                                    <td style={tdStyle}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem',
                                            background: t.permissionKey ? 'rgba(139, 92, 246, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                                            color: t.permissionKey ? '#8b5cf6' : 'var(--text-secondary)'
                                        }}>
                                            {t.permissionKey
                                                ? (ALL_PERMISSIONS.find(p => p.key === t.permissionKey)?.label || t.permissionKey)
                                                : 'Any user'}
                                        </span>
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                        {t.autoCreateRevision ? <Check size={16} style={{ color: '#22c55e' }} /> : <X size={16} style={{ color: 'var(--text-secondary)', opacity: 0.3 }} />}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                                        <button onClick={() => handleDeleteTransition(t.id)} className="btn-secondary" style={{ padding: '4px 8px', color: 'var(--danger)' }}>
                                            <Trash2 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                        {transitions.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 12px' }}>
                                    No transitions defined. Add steps first, then create transitions between them.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Add transition form */}
                {addingTransition ? (
                    <div style={{
                        marginTop: '16px', padding: '16px',
                        background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                        borderRadius: '8px', border: '1px solid var(--glass-border)'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>From Step</label>
                                    <select
                                        value={newTransition.fromStepId}
                                        onChange={e => setNewTransition({ ...newTransition, fromStepId: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                                    >
                                        <option value="">Select step...</option>
                                        {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <ArrowRight size={18} style={{ color: 'var(--text-secondary)', marginTop: '18px' }} />
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>To Step</label>
                                    <select
                                        value={newTransition.toStepId}
                                        onChange={e => setNewTransition({ ...newTransition, toStepId: e.target.value })}
                                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                                    >
                                        <option value="">Select step...</option>
                                        {steps.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>Permission Required</label>
                                <select
                                    value={newTransition.permissionKey || ''}
                                    onChange={e => setNewTransition({ ...newTransition, permissionKey: e.target.value || null })}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px' }}
                                >
                                    <option value="">Any user</option>
                                    {ALL_PERMISSIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                                </select>
                            </div>
                            <ToggleCheckbox
                                checked={newTransition.autoCreateRevision}
                                onChange={v => setNewTransition({ ...newTransition, autoCreateRevision: v })}
                                label="Auto-create revision when this transition occurs"
                            />
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={handleAddTransition} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={14} /> Add Transition
                                </button>
                                <button onClick={() => setAddingTransition(false)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingTransition(true)}
                        className="btn-secondary"
                        disabled={steps.length < 2}
                        style={{ marginTop: '12px', padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', opacity: steps.length < 2 ? 0.5 : 1 }}
                    >
                        <Plus size={14} /> Add Transition
                    </button>
                )}
            </div>
        </div>
    )
}

// ==================== Survey Warranty Templates Tab ====================

function SurveyWarrantyTemplatesTab({ showSuccess, showError, isLight, readOnly }: TabProps) {
    const [templates, setTemplates] = useState<SurveyWarrantyTemplate[]>([])
    const [sets, setSets] = useState<SurveyWarrantyTemplateSet[]>([])
    const [newText, setNewText] = useState('')
    const [editId, setEditId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [addingSet, setAddingSet] = useState(false)
    const [editSetId, setEditSetId] = useState<string | null>(null)
    const [setName, setSetName] = useState('')
    const [setTemplateIds, setSetTemplateIds] = useState<string[]>([])

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        try {
            const [t, s] = await Promise.all([
                window.api.surveyWarrantyTemplateGetAll(),
                window.api.surveyWarrantyTemplateSetGetAll()
            ])
            if (Array.isArray(t)) setTemplates(t)
            if (Array.isArray(s)) setSets(s)
        } catch (e: any) { showError(e.message) }
    }

    const placeholderColor = (p: string) => {
        if (p === '{deadline}') return { bg: 'rgba(0,170,200,0.15)', text: '#00aac8' }
        if (p === '{days}') return { bg: 'rgba(100,100,255,0.15)', text: '#6464ff' }
        if (p === '{event}') return { bg: 'rgba(255,100,200,0.15)', text: '#ff64c8' }
        return { bg: 'rgba(180,180,180,0.15)', text: 'var(--text-secondary)' }
    }

    const handleAdd = async () => {
        if (!newText.trim()) return
        try {
            const result = await window.api.surveyWarrantyTemplateAdd(newText.trim()) as any
            if (result?.error) { showError(result.message); return }
            setNewText('')
            showSuccess('Template added')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const handleUpdate = async () => {
        if (!editId || !editText.trim()) return
        try {
            await window.api.surveyWarrantyTemplateUpdate(editId, editText.trim())
            setEditId(null)
            showSuccess('Template updated')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.surveyWarrantyTemplateDelete(id)
            showSuccess('Template deleted')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const handleReorder = async (idx: number, dir: -1 | 1) => {
        const arr = [...templates]
        const [item] = arr.splice(idx, 1)
        arr.splice(idx + dir, 0, item)
        setTemplates(arr)
        await window.api.surveyWarrantyTemplateReorder(arr.map(t => t.id))
    }

    const handleAddSet = async () => {
        if (!setName.trim() || setTemplateIds.length === 0) return
        try {
            const result = await window.api.surveyWarrantyTemplateSetAdd(setName.trim(), setTemplateIds) as any
            if (result?.error) { showError(result.message); return }
            setAddingSet(false)
            setSetName('')
            setSetTemplateIds([])
            showSuccess('Set created')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const handleUpdateSet = async () => {
        if (!editSetId || !setName.trim()) return
        try {
            await window.api.surveyWarrantyTemplateSetUpdate(editSetId, setName.trim(), setTemplateIds)
            setEditSetId(null)
            setSetName('')
            setSetTemplateIds([])
            showSuccess('Set updated')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const handleDeleteSet = async (id: string) => {
        try {
            await window.api.surveyWarrantyTemplateSetDelete(id)
            showSuccess('Set deleted')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const toggleSetTemplate = (tid: string) => {
        setSetTemplateIds(prev => prev.includes(tid) ? prev.filter(x => x !== tid) : [...prev, tid])
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
                Survey Warranty Templates
            </h3>

            {/* Section 1: Templates */}
            <div style={{ marginBottom: '32px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                    Define reusable survey warranty text templates. Use placeholders: <code style={{ background: 'rgba(0,170,200,0.1)', padding: '1px 4px', borderRadius: '3px', color: '#00aac8' }}>{'{deadline}'}</code> (e.g. &quot;prior inception&quot;, &quot;within 30 days&quot;), <code style={{ background: 'rgba(100,100,255,0.1)', padding: '1px 4px', borderRadius: '3px', color: '#6464ff' }}>{'{days}'}</code> (number), <code style={{ background: 'rgba(255,100,200,0.1)', padding: '1px 4px', borderRadius: '3px', color: '#ff64c8' }}>{'{event}'}</code> (e.g. &quot;prior sailing&quot;).
                </div>

                {/* Template list */}
                {templates.map((t, idx) => (
                    <div key={t.id} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', marginBottom: '4px',
                        background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                        borderRadius: '8px', border: '1px solid var(--glass-border)'
                    }}>
                        {!readOnly && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                <button disabled={idx === 0} onClick={() => handleReorder(idx, -1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button disabled={idx === templates.length - 1} onClick={() => handleReorder(idx, 1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: idx === templates.length - 1 ? 'default' : 'pointer', padding: '1px', opacity: idx === templates.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                            </div>
                        )}
                        <div style={{ flex: 1 }}>
                            {editId === t.id ? (
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <textarea
                                        value={editText}
                                        onChange={e => setEditText(e.target.value)}
                                        rows={2}
                                        style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }}
                                    />
                                    <button onClick={handleUpdate} style={{ background: 'none', border: 'none', color: '#00aac8', cursor: 'pointer' }}><Save size={15} /></button>
                                    <button onClick={() => setEditId(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={15} /></button>
                                </div>
                            ) : (
                                <>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{t.text}</div>
                                    {t.placeholders.length > 0 && (
                                        <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                                            {t.placeholders.map(p => {
                                                const pc = placeholderColor(p)
                                                return (
                                                    <span key={p} style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: pc.bg, color: pc.text, fontWeight: 500 }}>{p}</span>
                                                )
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        {!readOnly && editId !== t.id && (
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => { setEditId(t.id); setEditText(t.text) }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><Pencil size={14} /></button>
                                <button onClick={() => handleDelete(t.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                            </div>
                        )}
                    </div>
                ))}

                {/* Add template */}
                {!readOnly && (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <textarea
                            value={newText}
                            onChange={e => setNewText(e.target.value)}
                            placeholder="Enter survey warranty template text..."
                            rows={2}
                            style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }}
                        />
                        <button onClick={handleAdd} disabled={!newText.trim()} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', opacity: !newText.trim() ? 0.5 : 1 }}>
                            <Plus size={14} /> Add
                        </button>
                    </div>
                )}
            </div>

            {/* Section 2: Sets */}
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>
                Template Sets
            </h3>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Named groups of templates that can be applied at once in the quotation editor.
            </div>

            {sets.map(s => (
                <div key={s.id} style={{
                    padding: '10px 12px', marginBottom: '6px',
                    background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                    borderRadius: '8px', border: '1px solid var(--glass-border)'
                }}>
                    {editSetId === s.id ? (
                        <div>
                            <input
                                value={setName}
                                onChange={e => setSetName(e.target.value)}
                                placeholder="Set name"
                                style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '8px' }}
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                                {templates.map(t => (
                                    <label key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={setTemplateIds.includes(t.id)} onChange={() => toggleSetTemplate(t.id)} style={{ marginTop: '3px' }} />
                                        <span style={{ lineHeight: 1.4 }}>{t.text.length > 80 ? t.text.slice(0, 80) + '...' : t.text}</span>
                                    </label>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={handleUpdateSet} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Save</button>
                                <button onClick={() => { setEditSetId(null); setSetName(''); setSetTemplateIds([]) }} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>{s.name}</div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                    {s.templateIds.length} template{s.templateIds.length !== 1 ? 's' : ''}
                                </div>
                            </div>
                            {!readOnly && (
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => { setEditSetId(s.id); setSetName(s.name); setSetTemplateIds(s.templateIds) }} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><Pencil size={14} /></button>
                                    <button onClick={() => handleDeleteSet(s.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}

            {!readOnly && !addingSet && (
                <button onClick={() => { setAddingSet(true); setSetName(''); setSetTemplateIds([]) }} className="btn-secondary" style={{ marginTop: '8px', padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={14} /> Add Set
                </button>
            )}
            {!readOnly && addingSet && (
                <div style={{ marginTop: '8px', padding: '12px', background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                    <input
                        value={setName}
                        onChange={e => setSetName(e.target.value)}
                        placeholder="Set name"
                        style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.85rem', marginBottom: '8px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                        {templates.map(t => (
                            <label key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.82rem', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={setTemplateIds.includes(t.id)} onChange={() => toggleSetTemplate(t.id)} style={{ marginTop: '3px' }} />
                                <span style={{ lineHeight: 1.4 }}>{t.text.length > 80 ? t.text.slice(0, 80) + '...' : t.text}</span>
                            </label>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={handleAddSet} disabled={!setName.trim() || setTemplateIds.length === 0} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', opacity: (!setName.trim() || setTemplateIds.length === 0) ? 0.5 : 1 }}>
                            <Plus size={14} /> Create Set
                        </button>
                        <button onClick={() => setAddingSet(false)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    )
}

// ==================== Cargo Clauses Tab ====================

function CargoClausesTab({ section, sectionLabel, showSuccess, showError }: TabProps & { section: string; sectionLabel: string }) {
    const [clauses, setClauses] = useState<any[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [newCode, setNewCode] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editCode, setEditCode] = useState('')
    const [editText, setEditText] = useState('')
    const [newHasAmount, setNewHasAmount] = useState(false)
    const [newAmountPlaceholder, setNewAmountPlaceholder] = useState('')
    const [editHasAmount, setEditHasAmount] = useState(false)
    const [editAmountPlaceholder, setEditAmountPlaceholder] = useState('')
    const [showBulkImport, setShowBulkImport] = useState(false)
    const [bulkText, setBulkText] = useState('')
    const { theme } = useTheme()
    const isLight = theme === 'light'

    // Institute Clauses state (only used when section === 'conditions')
    const [instituteClauses, setInstituteClauses] = useState<any[]>([])
    const [icNewName, setIcNewName] = useState('')
    const [icNewCode, setIcNewCode] = useState('')
    const [icNewDesc, setIcNewDesc] = useState('')
    const [icEditingId, setIcEditingId] = useState<string | null>(null)
    const [icEditName, setIcEditName] = useState('')
    const [icEditCode, setIcEditCode] = useState('')
    const [icEditDesc, setIcEditDesc] = useState('')

    const loadInstituteClauses = async () => {
        if (section !== 'conditions') return
        try {
            const result = await window.api.cargoGetInstituteClauses()
            setInstituteClauses(Array.isArray(result) ? result : [])
        } catch { setInstituteClauses([]) }
    }

    useEffect(() => { loadInstituteClauses() }, [section])

    const handleIcAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!icNewName.trim() || !icNewDesc.trim()) return
        try {
            const result = await window.api.cargoAddInstituteClause(icNewName.trim(), icNewCode.trim() || undefined, icNewDesc.trim() || undefined)
            if (result && !(result as any).error) {
                setIcNewName(''); setIcNewCode(''); setIcNewDesc('')
                showSuccess('Institute clause added')
                loadInstituteClauses()
            } else { showError('Failed to add institute clause') }
        } catch { showError('Failed to add institute clause') }
    }

    const handleIcSaveEdit = async (id: string) => {
        try {
            await window.api.cargoUpdateInstituteClause(id, { name: icEditName.trim(), code: icEditCode.trim(), description: icEditDesc.trim() })
            setIcEditingId(null)
            showSuccess('Institute clause updated')
            loadInstituteClauses()
        } catch { showError('Failed to update institute clause') }
    }

    const handleIcToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await window.api.cargoUpdateInstituteClause(id, { active: !currentActive })
            loadInstituteClauses()
        } catch { showError('Failed to toggle clause') }
    }

    const handleIcDelete = async (id: string) => {
        try {
            await window.api.cargoDeleteInstituteClause(id)
            showSuccess('Institute clause deleted')
            loadInstituteClauses()
        } catch { showError('Failed to delete clause') }
    }

    const handleIcMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...instituteClauses]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setInstituteClauses(newOrder)
        await window.api.cargoReorderInstituteClauses(newOrder.map(c => c.id))
    }

    const parseBulkLines = (raw: string) => {
        return raw.split('\n')
            .map(line => line.replace(/^[-–—•*]\s*/, '').trim())
            .filter(Boolean)
            .map(line => {
                // Try to parse "CODE - Title" or "CODE Title" patterns
                const codeMatch = line.match(/^([A-Z]{2,}[\s.]?\d{2,}[\w/]*)\s+[-–—]\s+(.+)$/i)
                    || line.match(/^(CL\.\s*\d+)\s+(.+)$/i)
                    || line.match(/^(JC[\s]?\d{4}\/\d+[\s\d/]*)\s+(.+)$/i)
                if (codeMatch) return { code: codeMatch[1].trim(), title: codeMatch[2].trim() }
                return { code: '', title: line }
            })
    }

    const handleBulkImport = async () => {
        const items = parseBulkLines(bulkText)
        if (items.length === 0) return
        let added = 0
        for (const item of items) {
            try {
                const result = await window.api.cargoAddClause(section, item.title, undefined, item.code || undefined)
                if (result && !(result as any).error) added++
            } catch {}
        }
        showSuccess(`Imported ${added} clause${added !== 1 ? 's' : ''}`)
        setBulkText('')
        setShowBulkImport(false)
        loadData()
    }

    useEffect(() => { loadData() }, [section])
    const loadData = async () => {
        try {
            const result = await window.api.cargoGetClauses(section)
            setClauses(Array.isArray(result) ? result : [])
        } catch { setClauses([]) }
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTitle.trim()) return
        try {
            const result = await window.api.cargoAddClause(section, newTitle.trim(), newText.trim() || undefined, newCode.trim() || undefined, newHasAmount || undefined, newAmountPlaceholder.trim() || undefined)
            if (result && !(result as any).error) {
                setNewTitle(''); setNewCode(''); setNewText(''); setNewHasAmount(false); setNewAmountPlaceholder('')
                showSuccess('Clause added')
                loadData()
            } else {
                showError('Failed to add clause')
            }
        } catch { showError('Failed to add clause') }
    }

    const handleSaveEdit = async (id: string) => {
        try {
            await window.api.cargoUpdateClause(id, { title: editTitle.trim(), code: editCode.trim(), text: editText.trim(), hasAmount: editHasAmount, amountPlaceholder: editAmountPlaceholder.trim() })
            setEditingId(null)
            showSuccess('Clause updated')
            loadData()
        } catch { showError('Failed to update clause') }
    }

    const handleToggleActive = async (id: string, currentActive: boolean) => {
        try {
            await window.api.cargoUpdateClause(id, { active: !currentActive })
            loadData()
        } catch { showError('Failed to toggle clause') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.cargoDeleteClause(id)
            showSuccess('Clause deleted')
            loadData()
        } catch { showError('Failed to delete clause') }
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...clauses]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClauses(newOrder)
        await window.api.cargoReorderClauses(newOrder.map(c => c.id))
    }

    return (
        <>
        {section === 'conditions' && (
            <section className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Institute Cargo Clauses</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                    Main clause selections (e.g. ICC A, ICC B, ICC C). Users pick one per quotation.
                </p>

                <form onSubmit={handleIcAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '300px' }}>
                        <input value={icNewCode} onChange={e => setIcNewCode(e.target.value)} placeholder="Code (e.g. CL. 382)" style={{ width: '130px', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                        <input value={icNewName} onChange={e => setIcNewName(e.target.value)} placeholder="Name (e.g. Institute Cargo Clauses (A))" style={{ flex: 1, padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                    </div>
                    <textarea value={icNewDesc} onChange={e => setIcNewDesc(e.target.value)} placeholder="Clause wording (required)" rows={1} style={{ flex: '1 1 100%', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }} />
                    <button type="submit" disabled={!icNewDesc.trim()} className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
                </form>

                {instituteClauses.map((c, i) => (
                    <div key={c.id} style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: '1px solid var(--table-border)',
                        marginBottom: '8px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        opacity: c.active === false ? 0.5 : 1,
                        background: c.active === false ? 'rgba(255,0,0,0.03)' : 'transparent'
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button onClick={() => handleIcMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                            <button onClick={() => handleIcMove(i, 'down')} disabled={i === instituteClauses.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === instituteClauses.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                        </div>
                        <div style={{ flex: 1 }}>
                            {icEditingId === c.id ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input value={icEditCode} onChange={e => setIcEditCode(e.target.value)} placeholder="Code" style={{ width: '130px', padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                        <input value={icEditName} onChange={e => setIcEditName(e.target.value)} placeholder="Name" style={{ flex: 1, padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                    </div>
                                    <textarea value={icEditDesc} onChange={e => setIcEditDesc(e.target.value)} placeholder="Clause wording (required)" rows={2} style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }} />
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <button onClick={() => handleIcSaveEdit(c.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Save size={12} /> Save</button>
                                        <button onClick={() => setIcEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><X size={12} /> Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: c.description ? '4px' : 0 }}>
                                        {c.code && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#32b886', background: 'rgba(50,184,134,0.1)', padding: '1px 6px', borderRadius: '4px' }}>{c.code}</span>}
                                        <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{c.name}</span>
                                    </div>
                                    {c.description && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>{c.description}</p>}
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => handleIcToggleActive(c.id, c.active !== false)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '0.72rem', fontWeight: 600, color: c.active === false ? 'var(--danger)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                            title={c.active === false ? 'Enable clause' : 'Disable clause'}
                        >
                            {c.active === false ? 'OFF' : 'ON'}
                        </button>
                        <button onClick={() => { setIcEditingId(c.id); setIcEditName(c.name || ''); setIcEditCode(c.code || ''); setIcEditDesc(c.description || '') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><Pencil size={14} /></button>
                        <button onClick={() => handleIcDelete(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                    </div>
                ))}
                {instituteClauses.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>No institute clauses yet. Add ICC A, ICC B, or ICC C above.</p>}
            </section>
        )}

        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>{section === 'conditions' ? 'Additional Conditions' : `Cargo ${sectionLabel}`}</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                {section === 'conditions' ? 'Additional conditions toggled per quotation (e.g. ISM, ISPS, Classification).' : `Manage ${sectionLabel.toLowerCase()} clauses for Cargo quotations.`}
            </p>

            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: '300px' }}>
                    <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code (optional)" style={{ width: '100px', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                    <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Clause title" style={{ flex: 1, padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                </div>
                <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Clause wording as it will appear in the quotation" rows={2} style={{ flex: '1 1 100%', padding: '8px', fontSize: '0.85rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 100%' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={newHasAmount} onChange={e => setNewHasAmount(e.target.checked)} /> Has amount
                    </label>
                    {newHasAmount && (
                        <input value={newAmountPlaceholder} onChange={e => setNewAmountPlaceholder(e.target.value)} placeholder="Amount placeholder (e.g. Limit per shipment)" style={{ flex: 1, padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                    )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="submit" className="btn-primary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add</button>
                    <button type="button" onClick={() => setShowBulkImport(true)} className="btn-secondary" style={{ padding: '8px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}><Upload size={14} /> Bulk Import</button>
                </div>
            </form>

            {showBulkImport && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowBulkImport(false)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '600px', maxHeight: '80vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Bulk Import — {sectionLabel}</h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
                            Paste one clause per line. Bullets/dashes are stripped automatically.
                        </p>
                        <textarea value={bulkText} onChange={e => setBulkText(e.target.value)}
                            placeholder={"- Institute Cargo Clauses (B) CL. 383 1/1/2009\n- Cargo ISM Endorsement JC 98/019\n- Custom clause text here"}
                            rows={12}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'monospace' }} />
                        {bulkText.trim() && (() => {
                            const parsed = parseBulkLines(bulkText)
                            return (
                                <div style={{ marginTop: '12px', padding: '10px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--table-border)' }}>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Preview: {parsed.length} clause(s)</p>
                                    {parsed.slice(0, 8).map((item, i) => (
                                        <div key={i} style={{ fontSize: '0.78rem', marginBottom: '3px', display: 'flex', gap: '6px' }}>
                                            {item.code && <span style={{ color: '#32b886', fontWeight: 600 }}>{item.code}</span>}
                                            <span>{item.title}</span>
                                        </div>
                                    ))}
                                    {parsed.length > 8 && <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>...and {parsed.length - 8} more</p>}
                                </div>
                            )
                        })()}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button onClick={() => { setShowBulkImport(false); setBulkText('') }} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>Cancel</button>
                            <button onClick={handleBulkImport} disabled={!bulkText.trim()} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.82rem' }}>
                                Import {parseBulkLines(bulkText).length} Clause{parseBulkLines(bulkText).length !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {clauses.map((c, i) => (
                <div key={c.id} style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--table-border)',
                    marginBottom: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    opacity: c.active === false ? 0.5 : 1,
                    background: c.active === false ? 'rgba(255,0,0,0.03)' : 'transparent'
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                        <button onClick={() => handleMove(i, 'down')} disabled={i === clauses.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === clauses.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                    </div>
                    <div style={{ flex: 1 }}>
                        {editingId === c.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input value={editCode} onChange={e => setEditCode(e.target.value)} placeholder="Code" style={{ width: '100px', padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" style={{ flex: 1, padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                </div>
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} placeholder="Clause wording" rows={3} style={{ width: '100%', padding: '6px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                        <input type="checkbox" checked={editHasAmount} onChange={e => setEditHasAmount(e.target.checked)} /> Has amount
                                    </label>
                                    {editHasAmount && (
                                        <input value={editAmountPlaceholder} onChange={e => setEditAmountPlaceholder(e.target.value)} placeholder="Amount placeholder" style={{ flex: 1, padding: '4px 8px', fontSize: '0.82rem', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} />
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={() => handleSaveEdit(c.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><Save size={12} /> Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}><X size={12} /> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: c.text ? '4px' : 0 }}>
                                    {c.code && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#32b886', background: 'rgba(50,184,134,0.1)', padding: '1px 6px', borderRadius: '4px' }}>{c.code}</span>}
                                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{c.title}</span>
                                    {c.hasAmount && <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#ff8c32', background: 'rgba(255,140,50,0.1)', padding: '1px 6px', borderRadius: '4px' }}>{c.amountPlaceholder || '$'}</span>}
                                </div>
                                {c.text && <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap' }}>{c.text}</p>}
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => handleToggleActive(c.id, c.active !== false)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', fontSize: '0.72rem', fontWeight: 600, color: c.active === false ? 'var(--danger)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}
                        title={c.active === false ? 'Enable clause' : 'Disable clause'}
                    >
                        {c.active === false ? 'OFF' : 'ON'}
                    </button>
                    <button onClick={() => { setEditingId(c.id); setEditTitle(c.title || ''); setEditCode(c.code || ''); setEditText(c.text || ''); setEditHasAmount(!!c.hasAmount); setEditAmountPlaceholder(c.amountPlaceholder || '') }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--text-secondary)' }}><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </div>
            ))}
            {clauses.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '20px 0' }}>No {section === 'conditions' ? 'additional conditions' : sectionLabel.toLowerCase() + ' clauses'} yet. Click &quot;Add&quot; to create one.</p>}
        </section>
        </>
    )
}
