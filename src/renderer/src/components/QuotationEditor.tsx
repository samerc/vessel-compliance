import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Users, Ship, Shield, FileText, Globe, AlertTriangle, DollarSign, Info, StickyNote, Scale, Anchor, Clock, CheckSquare, Ban, Download, Layers, LayoutList } from 'lucide-react'
import { Quotation, PolicyType, Vessel, PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIWarrantySet, PIDeductible, PIExclusion, PIAdditionalClause, PIAdditionalClauseSet, Entity, AssuredRole, QuotationAssured, QuotationDeductible, QuotationSubLimit, QuotationExcludedCountry, QuotationInstalment, QuotationNote, QuotationTextDeductible, QuotationCustomWarranty, QuotationCustomExclusion, QuotationCustomSection, PISectionTexts, PITextDeductible, PISanctionsVersion, InstalmentDefaults, QuotationVessel, PISubjectivity, QuotationSubjectivity, DocumentType, TradingWarrantyTemplate, HullAgreedValueText, HullClause, HullClauseCondition, HullAdditionalCondition, QuotationAgreedValueItem, QuotationHullCondition, QuotationHullAdditionalCondition, QuotationHullAlternative, QuotationPIAlternative, WarCondition, QuotationWarCondition, WarSettings } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { Plus, Trash2, ChevronUp, ChevronDown, X, Pencil, Save, Upload, GitBranch, RefreshCw, Lock, History } from 'lucide-react'
import { exportQuotationToPDF, exportQuotationToWord } from '../services/QuotationExportService'
import { DEFAULT_SECTION_TEXTS, SECTION_LABELS, getDefaultSectionOrder } from './quotationSettingsConstants'
import RichTextEditor from './RichTextEditor'
import VesselScopeChips from './VesselScopeChips'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'

const ALT_COLORS = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']

function AlternativeScopeChips({ alternatives, currentAltId, onChangeAltId }: { alternatives: QuotationPIAlternative[]; currentAltId: string | null; onChangeAltId: (altId: string | null) => void }) {
    if (alternatives.length < 2) return null
    return (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
                onClick={() => onChangeAltId(null)}
                style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
                    border: !currentAltId ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                    background: !currentAltId ? 'rgba(0,170,200,0.12)' : 'transparent',
                    color: !currentAltId ? '#00aac8' : 'var(--text-secondary)',
                    cursor: 'pointer'
                }}
            >All</button>
            {alternatives.map((alt, idx) => {
                const color = ALT_COLORS[idx % ALT_COLORS.length]
                const active = currentAltId === alt.id
                return (
                    <button
                        key={alt.id}
                        onClick={() => onChangeAltId(alt.id)}
                        style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
                            border: active ? `1.5px solid ${color}` : '1px solid var(--input-border)',
                            background: active ? `${color}18` : 'transparent',
                            color: active ? color : 'var(--text-secondary)',
                            cursor: 'pointer'
                        }}
                    >{alt.label || `Alt ${idx + 1}`}</button>
                )
            })}
        </div>
    )
}

function PickerDropdown({ placeholder, options, onSelect, fontSize = '0.85rem' }: { placeholder: string; options: { value: string; label: string }[]; onSelect: (value: string) => void; fontSize?: string }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const dropdownBg = isLight ? '#ffffff' : '#1a1d28'
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])
    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(!open)}
                style={{ padding: '8px 12px', borderRadius: '8px', fontSize, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
            >
                {placeholder}
                <ChevronDown size={14} style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {open && options.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, marginTop: '4px', minWidth: '100%', maxWidth: '420px', maxHeight: '260px', overflowY: 'auto', borderRadius: '8px', border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`, background: dropdownBg, boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {options.map(o => (
                        <div
                            key={o.value}
                            onClick={() => { onSelect(o.value); setOpen(false) }}
                            style={{ padding: '8px 14px', fontSize, cursor: 'pointer', color: isLight ? '#1c1e21' : '#e8e8e8', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {o.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    sent: { bg: 'rgba(0, 150, 255, 0.15)', text: '#0096ff' },
    approved: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    rejected: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    converted: { bg: 'rgba(180, 100, 255, 0.15)', text: '#b464ff' }
}

type EditorTab = 'insured' | 'vessel' | 'liability' | 'conditions' | 'agreedValue' | 'hullConditions' | 'sumInsured' | 'warConditions' | 'warTrading' | 'period' | 'trading' | 'warranties' | 'deductibles' | 'exclusions' | 'sanctions' | 'subjectivities' | 'premium' | 'information' | 'customSections' | 'notes'

type TabDef = { key: EditorTab; label: string; icon: any; types?: string[] }

const allTabs: TabDef[] = [
    { key: 'vessel', label: 'Vessel', icon: Ship },
    { key: 'insured', label: 'Insured', icon: Users },
    { key: 'agreedValue', label: 'Agreed Value', icon: Shield, types: ['H'] },
    { key: 'sumInsured', label: 'Sum Insured', icon: Shield, types: ['W'] },
    { key: 'liability', label: 'Limit of Liability', icon: Shield, types: ['P'] },
    { key: 'hullConditions', label: 'Conditions', icon: FileText, types: ['H'] },
    { key: 'warConditions', label: 'Conditions', icon: FileText, types: ['W'] },
    { key: 'conditions', label: 'Conditions', icon: FileText, types: ['P'] },
    { key: 'period', label: 'Period', icon: Clock },
    { key: 'trading', label: 'Trading', icon: Globe, types: ['P', 'H'] },
    { key: 'warTrading', label: 'Trading Warranty', icon: Globe, types: ['W'] },
    { key: 'warranties', label: 'Warranties', icon: CheckSquare },
    { key: 'deductibles', label: 'Deductibles', icon: Scale, types: ['P'] },
    { key: 'exclusions', label: 'Exclusions', icon: Ban, types: ['P'] },
    { key: 'sanctions', label: 'Sanctions', icon: AlertTriangle },
    { key: 'subjectivities', label: 'Subjectivities', icon: Anchor },
    { key: 'premium', label: 'Premium', icon: DollarSign },
    { key: 'information', label: 'Information', icon: Info },
    { key: 'customSections', label: 'Custom Sections', icon: Layers },
    { key: 'notes', label: 'Notes', icon: StickyNote }
]

function getTabsForType(typeCode?: string): TabDef[] {
    const code = typeCode || 'P'
    return allTabs.filter(t => !t.types || t.types.includes(code))
}

interface QuotationEditorProps {
    quotation: Quotation
    onBack: () => void
    onOpenQuotation?: (quotation: Quotation) => void
}

export default function QuotationEditor({ quotation, onBack, onOpenQuotation }: QuotationEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('vessel')
    const [q, setQ] = useState<Quotation>(quotation)
    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [globalTexts, setGlobalTexts] = useState<PISectionTexts>(DEFAULT_SECTION_TEXTS)
    const [sanctionsVersions, setSanctionsVersions] = useState<PISanctionsVersion[]>([])
    const [showSectionOrder, setShowSectionOrder] = useState(false)
    const [revisions, setRevisions] = useState<Quotation[]>([])
    const [showRevisionHistory, setShowRevisionHistory] = useState(false)
    const [piAlternatives, setPiAlternatives] = useState<QuotationPIAlternative[]>([])
    const [selectedPIAltId, setSelectedPIAltId] = useState<string | null>(null)
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => {
        loadMasterData()
    }, [])

    const loadMasterData = async () => {
        const [fullQ, pt, v, gt, sv] = await Promise.all([
            window.api.getQuotation(quotation.id),
            window.api.getPolicyTypes(),
            window.api.getVessels(),
            window.api.piGetSectionTexts(),
            window.api.piGetSanctionsVersions()
        ])
        if (fullQ) {
            // Set war defaults on first load (non-refundable 25%)
            if (fullQ.quotationTypeCode === 'W' && !fullQ.nonRefundableType && !fullQ.premiumAmount) {
                fullQ.nonRefundableType = 'percentage'
                fullQ.nonRefundablePercent = 25
                await window.api.updateQuotation(fullQ.id, { nonRefundableType: 'percentage', nonRefundablePercent: 25 } as any)
            }
            setQ(fullQ)
            // Load revision history
            const groupId = fullQ.revisionGroupId || fullQ.id
            const revs = await window.api.getQuotationRevisions(groupId)
            setRevisions(Array.isArray(revs) ? revs : [])
            // Load PI alternatives
            if (fullQ.quotationTypeCode === 'P') {
                const piAlts = await window.api.piGetQuotationAlternatives(fullQ.id)
                setPiAlternatives(Array.isArray(piAlts) ? piAlts : [])
            }
        }
        setPolicyTypes(Array.isArray(pt) ? pt : [])
        setVessels(Array.isArray(v) ? v : [])
        if (gt && Object.keys(gt).length > 0) setGlobalTexts({ ...DEFAULT_SECTION_TEXTS, ...gt })
        setSanctionsVersions(sv)
    }

    const getEffectiveText = (key: keyof PISectionTexts): string => {
        return String(q.sectionTextsOverride?.[key] ?? globalTexts[key] ?? DEFAULT_SECTION_TEXTS[key] ?? '')
    }

    const isLocked = q.isLocked === true

    const handleCreateRevision = async () => {
        try {
            const newRev = await window.api.createQuotationRevision(q.id)
            if ((newRev as any)?.error) { showError((newRev as any).message || 'Failed to create revision'); return }
            showSuccess(`Revision R${newRev.revisionNumber} created`)
            if (onOpenQuotation) onOpenQuotation(newRev)
        } catch (err: any) {
            showError(err.message || 'Failed to create revision')
        }
    }

    const handleClearSnapshot = async () => {
        try {
            await window.api.clearExportSnapshot(q.id)
            setQ(prev => ({ ...prev, exportSnapshot: undefined }))
            showSuccess('Export snapshot cleared — next export will use current settings')
        } catch (err: any) {
            showError(err.message || 'Failed to clear snapshot')
        }
    }

    const updateField = async (field: string, value: any) => {
        if (isLocked) return
        try {
            await window.api.updateQuotation(q.id, { [field]: value } as any)
            setQ(prev => ({ ...prev, [field]: value }))
        } catch (err: any) {
            showError(err.message || 'Failed to update')
        }
    }

    // P&I Alternatives management
    const piAltColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
    const isPIType = q.quotationTypeCode === 'P'
    const piAltTabs: EditorTab[] = ['conditions', 'warranties', 'deductibles', 'exclusions']
    const showPIAltBar = isPIType && piAltTabs.includes(activeTab)

    const handleAddPIAlternatives = async () => {
        if (isLocked) return
        try {
            const a1 = await window.api.piAddQuotationAlternative(q.id, 'Alternative 1')
            const a2 = await window.api.piAddQuotationAlternative(q.id, 'Alternative 2')
            if ((a1 as any)?.error || (a2 as any)?.error) { showError('Failed to create alternatives'); return }
            setPiAlternatives([a1, a2])
            showSuccess('Alternatives created')
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const handleAddPIAlternative = async () => {
        if (isLocked) return
        try {
            const label = `Alternative ${piAlternatives.length + 1}`
            const a = await window.api.piAddQuotationAlternative(q.id, label)
            if ((a as any)?.error) { showError((a as any).message); return }
            setPiAlternatives(prev => [...prev, a])
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const handleRemoveLastPIAlternative = async () => {
        if (isLocked || piAlternatives.length < 2) return
        try {
            if (piAlternatives.length === 2) {
                // Remove both — exit alternatives mode
                for (const alt of piAlternatives) await window.api.piDeleteQuotationAlternative(alt.id)
                setPiAlternatives([])
                setSelectedPIAltId(null)
                showSuccess('Alternatives removed')
            } else {
                const last = piAlternatives[piAlternatives.length - 1]
                await window.api.piDeleteQuotationAlternative(last.id)
                setPiAlternatives(prev => prev.slice(0, -1))
                if (selectedPIAltId === last.id) setSelectedPIAltId(null)
                showSuccess('Alternative removed')
            }
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const _handleRenamePIAlternative = async (id: string, label: string) => {
        try {
            await window.api.piUpdateQuotationAlternative(id, { label })
            setPiAlternatives(prev => prev.map(a => a.id === id ? { ...a, label } : a))
        } catch (err: any) { showError(err.message || 'Failed') }
    }
    void _handleRenamePIAlternative

    const sc = statusColors[q.status] || statusColors.draft

    return (
        <div className="fade-in">
            <button onClick={onBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <ArrowLeft size={18} /> Back to Quotations
            </button>

            {/* Locked banner */}
            {isLocked && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', marginBottom: '12px',
                    borderRadius: '10px', background: 'rgba(255, 176, 32, 0.12)', border: '1px solid rgba(255, 176, 32, 0.3)',
                    color: isLight ? '#8a6400' : '#ffb020', fontSize: '0.85rem', fontWeight: 600
                }}>
                    <Lock size={16} /> This is an older revision (read-only). {revisions.length > 1 && 'Switch to the latest revision to make changes.'}
                </div>
            )}

            {/* Header */}
            <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {q.quotationTypeName && (
                        <span style={{
                            padding: '5px 12px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            background: 'rgba(0, 170, 200, 0.15)',
                            color: isLight ? '#007a91' : '#00aac8',
                            letterSpacing: '0.03em'
                        }}>
                            {q.quotationTypeName}
                        </span>
                    )}
                    {(q.revisionNumber || 0) > 0 && (
                        <span style={{
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: 'rgba(180, 100, 255, 0.15)',
                            color: isLight ? '#7a3db8' : '#b464ff',
                            letterSpacing: '0.03em'
                        }}>
                            R{q.revisionNumber}
                        </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ref:</span>
                        <input
                            type="text"
                            value={q.referenceNumber || ''}
                            onChange={e => setQ(prev => ({ ...prev, referenceNumber: e.target.value }))}
                            onBlur={e => updateField('referenceNumber', e.target.value)}
                            placeholder="Reference number"
                            disabled={isLocked}
                            style={{ padding: '6px 10px', borderRadius: '6px', width: '180px', fontSize: '0.9rem', fontWeight: 600 }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Date:</span>
                        <input
                            type="date"
                            value={q.quotationDate || ''}
                            onChange={e => { setQ(prev => ({ ...prev, quotationDate: e.target.value })); updateField('quotationDate', e.target.value) }}
                            disabled={isLocked}
                            style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Type:</span>
                        <select
                            value={q.policyTypeId || ''}
                            onChange={e => { setQ(prev => ({ ...prev, policyTypeId: e.target.value })); updateField('policyTypeId', e.target.value || null) }}
                            disabled={isLocked}
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
                            disabled={isLocked}
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
                            disabled={isLocked}
                            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                        />
                        Renewal
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Currency:</span>
                        <input type="text" value={q.premiumCurrency || 'USD'} onChange={e => setQ(p => ({ ...p, premiumCurrency: e.target.value }))} onBlur={e => updateField('premiumCurrency', e.target.value)} disabled={isLocked} style={{ width: '70px', padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>Title:</span>
                        <input
                            type="text"
                            value={q.title || ''}
                            onChange={e => setQ(prev => ({ ...prev, title: e.target.value }))}
                            onBlur={e => updateField('title', e.target.value || null)}
                            placeholder="Auto from vessel/fleet name…"
                            disabled={isLocked}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                        />
                    </div>
                    <button
                        onClick={() => setShowSectionOrder(true)}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                    >
                        <LayoutList size={16} /> Section Order
                    </button>
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
                    {q.exportSnapshot && !isLocked && (
                        <button
                            onClick={handleClearSnapshot}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                            title="Clear saved export snapshot — next export will use current settings"
                        >
                            <RefreshCw size={16} /> Refresh Texts
                        </button>
                    )}
                    {!isLocked && (
                        <button
                            onClick={handleCreateRevision}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: isLight ? '#7a3db8' : '#b464ff' }}
                        >
                            <GitBranch size={16} /> Create Revision
                        </button>
                    )}
                    {revisions.length > 1 && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowRevisionHistory(!showRevisionHistory)}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                            >
                                <History size={16} /> Revisions ({revisions.length})
                            </button>
                            {showRevisionHistory && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowRevisionHistory(false)} />
                                    <div style={{
                                        position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 100,
                                        background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                                        borderRadius: '10px', padding: '6px', minWidth: '260px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                                    }}>
                                        {revisions.map(rev => (
                                            <button
                                                key={rev.id}
                                                onClick={() => {
                                                    setShowRevisionHistory(false)
                                                    if (rev.id !== q.id && onOpenQuotation) onOpenQuotation(rev)
                                                }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                                    padding: '10px 14px', border: 'none', borderRadius: '6px',
                                                    background: rev.id === q.id ? (isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,170,200,0.12)') : 'transparent',
                                                    color: 'var(--text-primary)', cursor: rev.id === q.id ? 'default' : 'pointer',
                                                    fontSize: '0.85rem', textAlign: 'left'
                                                }}
                                                className={rev.id !== q.id ? 'hover-effect' : undefined}
                                            >
                                                <span style={{ fontWeight: 600, minWidth: '70px' }}>
                                                    {rev.revisionNumber === 0 ? 'Original' : `R${rev.revisionNumber}`}
                                                </span>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>
                                                    {rev.referenceNumber}
                                                </span>
                                                {rev.isLocked && <Lock size={13} style={{ opacity: 0.4 }} />}
                                                {rev.id === q.id && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 700 }}>CURRENT</span>}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {getTabsForType(q.quotationTypeCode).map(t => {
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

            {/* P&I Alternatives Bar */}
            {showPIAltBar && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                    marginBottom: '8px', borderRadius: '10px',
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)', flexWrap: 'wrap'
                }}>
                    {piAlternatives.length === 0 ? (
                        <>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No alternatives configured</span>
                            {!isLocked && (
                                <button onClick={handleAddPIAlternatives} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={13} /> Add Alternatives
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            <button
                                onClick={() => setSelectedPIAltId(null)}
                                style={{
                                    padding: '5px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                    border: selectedPIAltId === null ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                                    background: selectedPIAltId === null ? 'rgba(0,170,200,0.12)' : 'transparent',
                                    color: selectedPIAltId === null ? (isLight ? '#007a91' : '#00aac8') : 'var(--text-secondary)',
                                    cursor: 'pointer'
                                }}
                            >All</button>
                            {piAlternatives.map((alt, idx) => {
                                const color = piAltColors[idx % piAltColors.length]
                                const active = selectedPIAltId === alt.id
                                return (
                                    <button
                                        key={alt.id}
                                        onClick={() => setSelectedPIAltId(active ? null : alt.id)}
                                        style={{
                                            padding: '5px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                            border: active ? `1.5px solid ${color}` : '1px solid var(--input-border)',
                                            background: active ? `${color}18` : 'transparent',
                                            color: active ? color : 'var(--text-secondary)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                                        {alt.label || `Alt ${idx + 1}`}
                                    </button>
                                )
                            })}
                            {!isLocked && (
                                <>
                                    <button onClick={handleAddPIAlternative} className="btn-secondary" style={{ padding: '5px 8px', fontSize: '0.78rem' }} title="Add alternative">
                                        <Plus size={14} />
                                    </button>
                                    <button onClick={handleRemoveLastPIAlternative} className="btn-secondary" style={{ padding: '5px 8px', fontSize: '0.78rem', color: 'var(--danger)' }} title="Remove last alternative">
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Tab Content */}
            <div className="glass-card" style={{ padding: '24px', minHeight: '300px' }}>
                {activeTab === 'insured' && <InsuredTab quotation={q} vessels={vessels} showSuccess={showSuccess} showError={showError} updateField={updateField} />}
                {activeTab === 'vessel' && <VesselTab quotation={q} vessels={vessels} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'agreedValue' && <AgreedValueTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'liability' && <LiabilityTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} getEffectiveText={getEffectiveText} />}
                {activeTab === 'hullConditions' && <HullConditionsTab quotation={q} updateField={updateField} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'sumInsured' && <SumInsuredTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'warConditions' && <WarConditionsTab quotation={q} showError={showError} />}
                {activeTab === 'conditions' && <ConditionsTab quotation={q} showSuccess={showSuccess} showError={showError} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'period' && <PeriodTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'trading' && <TradingTab quotation={q} showSuccess={showSuccess} showError={showError} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} />}
                {activeTab === 'warTrading' && <WarTradingTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'warranties' && <WarrantiesTab quotation={q} showSuccess={showSuccess} showError={showError} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'deductibles' && <DeductiblesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'exclusions' && <ExclusionsTab quotation={q} showSuccess={showSuccess} showError={showError} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'sanctions' && <SanctionsTab quotation={q} updateField={updateField} setQ={setQ} sanctionsVersions={sanctionsVersions} />}
                {activeTab === 'subjectivities' && <SubjectivitiesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'premium' && <PremiumTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} isLight={isLight} getEffectiveText={getEffectiveText} />}
                {activeTab === 'information' && <InformationTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'customSections' && <CustomSectionsTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'notes' && <NotesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            </div>

            {showSectionOrder && (
                <SectionOrderModal
                    quotation={q}
                    onClose={() => setShowSectionOrder(false)}
                    onSave={(order) => { setQ(prev => ({ ...prev, sectionOrder: order })); setShowSectionOrder(false) }}
                    showSuccess={showSuccess}
                    showError={showError}
                    isLight={isLight}
                />
            )}
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

function LiabilityTab({ quotation, updateField, setQ, showSuccess, getEffectiveText }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [subLimits, setSubLimits] = useState<QuotationSubLimit[]>([])
    const [templates, setTemplates] = useState<import('../../../shared/types').PISubLimitTemplate[]>([])
    const [newText, setNewText] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [newCurrency, setNewCurrency] = useState('USD')
    const [showStandardText, setShowStandardText] = useState(false)

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

    // Standard text with placeholders replaced
    const resolvedStandardText = (quotation.sectionTextsOverride?.limitOfLiabilityDefaultText ?? getEffectiveText('limitOfLiabilityDefaultText'))
        .replace(/\{currency\}/g, quotation.limitOfLiabilityCurrency || 'USD')
        .replace(/\{amount\}/g, quotation.limitOfLiabilityAmount ? quotation.limitOfLiabilityAmount.toLocaleString() : '___')

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

            {/* Standard text preview + override */}
            <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Standard Text Preview:</div>
                <div style={{ padding: '10px 14px', borderRadius: '6px', background: 'var(--table-header-bg)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: '8px' }}
                    dangerouslySetInnerHTML={{ __html: resolvedStandardText || '<em style="color:var(--text-secondary)">No standard text configured</em>' }}
                />
                <button
                    type="button"
                    onClick={() => setShowStandardText(!showStandardText)}
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <Pencil size={12} /> {showStandardText ? 'Hide Editor' : 'Override Standard Text'}
                    {quotation.sectionTextsOverride?.limitOfLiabilityDefaultText && <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', marginLeft: '4px' }}>(customized)</span>}
                </button>
                {showStandardText && (
                    <div style={{ marginTop: '10px' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                            Use <code>{'{amount}'}</code> and <code>{'{currency}'}</code> placeholders. Changes apply to this quotation only.
                        </div>
                        <RichTextEditor
                            value={String(quotation.sectionTextsOverride?.limitOfLiabilityDefaultText ?? getEffectiveText('limitOfLiabilityDefaultText'))}
                            onChange={val => {
                                const override = { ...(quotation.sectionTextsOverride || {}), limitOfLiabilityDefaultText: val }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                updateField('sectionTextsOverride', override)
                            }}
                            minHeight={60}
                            showFontSize showAlignment showLineSpacing
                        />
                        {quotation.sectionTextsOverride?.limitOfLiabilityDefaultText && (
                            <button
                                type="button"
                                onClick={() => {
                                    const override = { ...(quotation.sectionTextsOverride || {}) }
                                    delete override.limitOfLiabilityDefaultText
                                    setQ(p => ({ ...p, sectionTextsOverride: override }))
                                    updateField('sectionTextsOverride', override)
                                    showSuccess('Reset to global default')
                                }}
                                className="btn-secondary"
                                style={{ marginTop: '6px', fontSize: '0.75rem', padding: '3px 10px', color: 'var(--danger)' }}
                            >
                                Reset to Default
                            </button>
                        )}
                    </div>
                )}
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

function ConditionsTab({ quotation, showSuccess, showError, piAlternatives = [], selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    const [allClauses, setAllClauses] = useState<PIClause[]>([])
    const [clauseSets, setClauseSets] = useState<PIClauseSet[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [clauseRows, setClauseRows] = useState<{ id: string; piClauseId: string; alternativeId: string | null }[]>([])
    const [clauseVesselScopes, setClauseVesselScopes] = useState<Record<string, string[] | null>>({})
    const [clauseAltIds, setClauseAltIds] = useState<Record<string, string | null>>({})
    const [descOverrides, setDescOverrides] = useState<Record<string, string>>({})
    const [additionalClauses, setAdditionalClauses] = useState<any[]>([])
    const [allAdditional, setAllAdditional] = useState<PIAdditionalClause[]>([])
    const [additionalClauseSets, setAdditionalClauseSets] = useState<PIAdditionalClauseSet[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const additionalDefaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [clauses, sets, selected, overrides, addClauses, allAdd, addSets, qv] = await Promise.all([
            window.api.piGetClauses(),
            window.api.piGetClauseSets(),
            window.api.getQuotationClauses(quotation.id),
            window.api.getQuotationClauseOverrides(quotation.id),
            window.api.getQuotationAdditionalClauses(quotation.id),
            window.api.piGetAdditionalClauses(),
            window.api.piGetAdditionalClauseSets(),
            window.api.getQuotationVessels(quotation.id)
        ])
        setAllClauses(clauses)
        setClauseSets(sets)
        const safeSelected = Array.isArray(selected) ? selected : []
        setSelectedIds(new Set(safeSelected.map((r: any) => r.piClauseId)))
        setClauseRows(safeSelected.map((r: any) => ({ id: r.id, piClauseId: r.piClauseId, alternativeId: r.alternativeId || null })))
        setClauseVesselScopes(safeSelected.reduce((m: Record<string, string[] | null>, r: any) => { if (r.vesselScope) m[r.piClauseId] = r.vesselScope; return m }, {}))
        setClauseAltIds(safeSelected.reduce((m: Record<string, string | null>, r: any) => { m[r.piClauseId] = r.alternativeId || null; return m }, {}))
        setDescOverrides(overrides)
        setAdditionalClauses(addClauses)
        const safeAllAdd = Array.isArray(allAdd) ? allAdd : []
        setAllAdditional(safeAllAdd)
        setAdditionalClauseSets(addSets)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Auto-add default additional clauses on first load if none exist
        const safeAddClauses = Array.isArray(addClauses) ? addClauses : []
        if (!additionalDefaultsApplied.current && safeAddClauses.length === 0 && safeAllAdd.length > 0) {
            additionalDefaultsApplied.current = true
            const defaults = safeAllAdd.filter(c => c.defaultSelected)
            for (let i = 0; i < defaults.length; i++) {
                await window.api.addQuotationAdditionalClause({ quotationId: quotation.id, piAdditionalClauseId: defaults[i].id, order: i })
            }
            if (defaults.length > 0) {
                const freshAdd = await window.api.getQuotationAdditionalClauses(quotation.id)
                setAdditionalClauses(Array.isArray(freshAdd) ? freshAdd : [])
            }
        } else {
            additionalDefaultsApplied.current = true
        }
    }

    const toggleClause = async (clauseId: string) => {
        const hasPIAlts = piAlternatives.length >= 2
        const altId = hasPIAlts ? selectedPIAltId : null

        if (hasPIAlts && altId) {
            // Per-alternative toggle: add/remove clause row for this specific alternative
            const existingRow = clauseRows.find(r => r.piClauseId === clauseId && r.alternativeId === altId)
            try {
                if (existingRow) {
                    await window.api.deleteQuotationClause(quotation.id, clauseId, altId)
                    setClauseRows(prev => prev.filter(r => !(r.piClauseId === clauseId && r.alternativeId === altId)))
                } else {
                    const result = await window.api.addQuotationClause(quotation.id, clauseId, altId)
                    if (result && !(result as any).error) {
                        setClauseRows(prev => [...prev, { id: result.id, piClauseId: clauseId, alternativeId: altId }])
                    }
                }
                // Refresh selectedIds from all rows
                const fresh = await window.api.getQuotationClauses(quotation.id)
                const safeFresh = Array.isArray(fresh) ? fresh : []
                setSelectedIds(new Set(safeFresh.map((r: any) => r.piClauseId)))
                setClauseRows(safeFresh.map((r: any) => ({ id: r.id, piClauseId: r.piClauseId, alternativeId: r.alternativeId || null })))
                setClauseAltIds(safeFresh.reduce((m: Record<string, string | null>, r: any) => { m[r.piClauseId] = r.alternativeId || null; return m }, {}))
            } catch (err: any) { showError(err.message || 'Failed') }
        } else {
            // Original bulk toggle (no alternatives or viewing "All")
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
                        const [allWarranties, currentWarrantyRows, allExclusions, currentExclusionRows] = await Promise.all([
                            window.api.piGetWarranties(),
                            window.api.getQuotationWarranties(quotation.id),
                            window.api.piGetExclusions(),
                            window.api.getQuotationExclusions(quotation.id)
                        ])
                        const currentWarrantyIds = (Array.isArray(currentWarrantyRows) ? currentWarrantyRows : []).map((r: any) => r.piWarrantyId)
                        const cargoWarrantyIds = new Set(allWarranties.filter((w: PIWarranty) => w.isCargoRelated).map((w: PIWarranty) => w.id))
                        const filteredWarranties = currentWarrantyIds.filter((id: string) => !cargoWarrantyIds.has(id))
                        if (filteredWarranties.length < currentWarrantyIds.length) {
                            await window.api.setQuotationWarranties(quotation.id, filteredWarranties)
                            showSuccess('Cargo warranties auto-removed (no cargo clauses selected)')
                        }
                        const safeExRows = Array.isArray(currentExclusionRows) ? currentExclusionRows : []
                        const cargoExclusionIds = new Set((Array.isArray(allExclusions) ? allExclusions : []).filter((ex: PIExclusion) => ex.isCargoRelated).map((ex: PIExclusion) => ex.id))
                        const filteredExclusions = safeExRows.filter((r: any) => !r.piExclusionId || !cargoExclusionIds.has(r.piExclusionId))
                        if (filteredExclusions.length < safeExRows.length) {
                            await window.api.setQuotationExclusions(quotation.id, filteredExclusions.map((r: any) => ({ piExclusionId: r.piExclusionId, customText: r.customText })))
                            showSuccess('Cargo exclusions auto-removed (no cargo clauses selected)')
                        }
                    }
                }
            } catch (err: any) {
                showError(err.message || 'Failed to save clause selection')
            }
        }
    }

    const applySet = async (setId: string) => {
        const cs = clauseSets.find(s => s.id === setId)
        if (!cs?.clauseIds) return
        setSelectedIds(new Set(cs.clauseIds))
        const mergedOverrides = { ...descOverrides, ...cs.descriptionOverrides }
        setDescOverrides(mergedOverrides)
        await window.api.setQuotationClauses(quotation.id, cs.clauseIds, mergedOverrides)
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

    const updateClauseScope = async (piClauseId: string, scope: string[] | null) => {
        setClauseVesselScopes(prev => ({ ...prev, [piClauseId]: scope }))
        await window.api.updateQuotationClauseVesselScope(quotation.id, piClauseId, scope)
    }

    const updateClauseAltId = async (clauseId: string, altId: string | null) => {
        // Find the row id for this clause
        const selected = await window.api.getQuotationClauses(quotation.id)
        const row = (Array.isArray(selected) ? selected : []).find((r: any) => r.piClauseId === clauseId)
        if (row) {
            await window.api.updateQuotationItemAlternativeId('quotation_clauses', row.id, altId)
            setClauseAltIds(prev => ({ ...prev, [clauseId]: altId }))
        }
    }

    // For per-alternative view: determine which clauses are checked for the viewed alternative
    const isClauseCheckedForAlt = (clauseId: string): boolean => {
        if (!selectedPIAltId || piAlternatives.length < 2) return selectedIds.has(clauseId)
        // Checked if there's a row for this alt specifically, OR a shared row (null)
        return clauseRows.some(r => r.piClauseId === clauseId && (r.alternativeId === selectedPIAltId || !r.alternativeId))
    }

    const updateAdditionalClauseScope = async (id: string, scope: string[] | null) => {
        setAdditionalClauses(prev => prev.map(c => c.id === id ? { ...c, vesselScope: scope } : c))
        await window.api.updateQuotationItemVesselScope('quotation_additional_clauses', id, scope)
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
                {allClauses.map(c => {
                    const checked = isClauseCheckedForAlt(c.id)
                    return (
                    <div key={c.id} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--table-border)', background: checked ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={checked} onChange={() => toggleClause(c.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                            <span style={{ fontWeight: 600, fontSize: '0.85rem', minWidth: '60px' }}>Cl. {c.clauseNumber}</span>
                            <span style={{ fontSize: '0.85rem' }}>{c.name}</span>
                            {c.isCargoRelated && <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                            {descOverrides[c.id] && <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)' }}>(edited)</span>}
                        </label>
                        {checked && (c.description || descOverrides[c.id]) && (
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
                        {checked && !selectedPIAltId && (
                            <div style={{ paddingLeft: '30px' }}>
                                <VesselScopeChips vessels={qVessels} vesselScope={clauseVesselScopes[c.id]} onChange={scope => updateClauseScope(c.id, scope)} />
                                <AlternativeScopeChips alternatives={piAlternatives} currentAltId={clauseAltIds[c.id] || null} onChangeAltId={altId => updateClauseAltId(c.id, altId)} />
                            </div>
                        )}
                    </div>
                )})}
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
                                {ac.title ? `${ac.title} — ` : ''}{ac.code ? `[${ac.code}] ` : ''}{ac.text.substring(0, 70)}{ac.text.length > 70 ? '…' : ''}
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
                    <div key={ac.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <span style={{ color: 'var(--accent-primary)', fontFamily: 'monospace', fontSize: '0.9rem', flexShrink: 0, marginTop: '1px' }}>-</span>
                            <span style={{ flex: 1, fontSize: '0.83rem', whiteSpace: 'pre-wrap' }}>
                                {def?.title && <span style={{ fontWeight: 600, marginRight: '8px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{def.title}</span>}
                                {code && <span style={{ fontWeight: 700, marginRight: '6px', color: 'var(--text-primary)' }}>{code}</span>}
                                {text}
                            </span>
                            <button onClick={async () => { await window.api.deleteQuotationAdditionalClause(ac.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px', flexShrink: 0 }}><Trash2 size={14} /></button>
                        </div>
                        <div style={{ paddingLeft: '30px' }}>
                            <VesselScopeChips vessels={qVessels} vesselScope={ac.vesselScope} onChange={scope => updateAdditionalClauseScope(ac.id, scope)} />
                        </div>
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
    const [templates, setTemplates] = useState<TradingWarrantyTemplate[]>([])
    const initRef = useRef(false)
    const [newCountryName, setNewCountryName] = useState('')
    const [newCountryType, setNewCountryType] = useState<'excluded' | 'ddq'>('excluded')

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [qc, masterCountries, tpls] = await Promise.all([
            window.api.getQuotationExcludedCountries(quotation.id),
            window.api.piGetTradingExcludedCountries(),
            window.api.piGetTradingWarrantyTemplates()
        ])
        setTemplates(Array.isArray(tpls) ? tpls : [])
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
            // For Hull type, default excluded to Israel only but keep all DDQ countries
            const countriesToSet = quotation.quotationTypeCode === 'H'
                ? masterCountries.filter(c => c.listType === 'ddq' || c.name.toLowerCase() === 'israel')
                : masterCountries
            await window.api.setQuotationExcludedCountries(quotation.id, countriesToSet.map(c => ({ name: c.name, listType: c.listType })))
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
                {templates.length > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                        <select
                            value=""
                            onChange={e => {
                                const tpl = templates.find(t => t.id === e.target.value)
                                if (tpl) {
                                    setQ(p => ({ ...p, tradingWarrantyIntro: tpl.text }))
                                    updateField('tradingWarrantyIntro', tpl.text)
                                }
                            }}
                            style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.84rem', width: '100%' }}
                        >
                            <option value="">Load from template...</option>
                            {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                    </div>
                )}
                <RichTextEditor
                    value={quotation.tradingWarrantyIntro || ''}
                    onChange={val => { setQ(p => ({ ...p, tradingWarrantyIntro: val })); updateField('tradingWarrantyIntro', val) }}
                    placeholder="Enter the trading warranty text..."
                    minHeight={80}
                    showFontSize showAlignment showLineSpacing
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
                    showFontSize showAlignment showLineSpacing
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

function WarrantiesTab({ quotation, showSuccess, showError, updateField, setQ, getEffectiveText, piAlternatives = [], selectedPIAltId: _selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    void _selectedPIAltId
    const [allWarranties, setAllWarranties] = useState<PIWarranty[]>([])
    const [tags, setTags] = useState<PIWarrantyTag[]>([])
    const [warrantySets, setWarrantySets] = useState<PIWarrantySet[]>([])
    const [selectedIds, setSelectedIds] = useState<string[]>([])
    const [warrantyVesselScopes, setWarrantyVesselScopes] = useState<Record<string, string[] | null>>({})
    const [warrantyAltIds, setWarrantyAltIds] = useState<Record<string, string | null>>({})
    const [customWarranties, setCustomWarranties] = useState<QuotationCustomWarranty[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
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
        const [all, allTags, sets, selectedRows, custom, qv] = await Promise.all([
            window.api.piGetWarranties(),
            window.api.piGetWarrantyTags(),
            window.api.piGetWarrantySets(),
            window.api.getQuotationWarranties(quotation.id),
            window.api.getQuotationCustomWarranties(quotation.id),
            window.api.getQuotationVessels(quotation.id)
        ])
        setQVessels(Array.isArray(qv) ? qv : [])
        const safeAll = Array.isArray(all) ? all : []
        const safeTags = Array.isArray(allTags) ? allTags : []
        const safeSets = Array.isArray(sets) ? sets : []
        const safeSelectedRows = Array.isArray(selectedRows) ? selectedRows : []
        const safeSelected = safeSelectedRows.map((r: any) => r.piWarrantyId)
        const scopes: Record<string, string[] | null> = {}
        const altIds: Record<string, string | null> = {}
        for (const r of safeSelectedRows) {
            if (r.vesselScope) scopes[r.piWarrantyId] = r.vesselScope
            altIds[r.piWarrantyId] = r.alternativeId || null
        }
        const safeCustom = Array.isArray(custom) ? custom : []
        setAllWarranties(safeAll)
        setTags(safeTags)
        setWarrantySets(safeSets)
        setSelectedIds(safeSelected)
        setWarrantyVesselScopes(scopes)
        setWarrantyAltIds(altIds)
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

    const updateWarrantyScope = async (piWarrantyId: string, scope: string[] | null) => {
        setWarrantyVesselScopes(prev => ({ ...prev, [piWarrantyId]: scope }))
        await window.api.updateQuotationWarrantyVesselScope(quotation.id, piWarrantyId, scope)
    }

    const updateWarrantyAltId = async (piWarrantyId: string, altId: string | null) => {
        const rows = await window.api.getQuotationWarranties(quotation.id)
        const row = (Array.isArray(rows) ? rows : []).find((r: any) => r.piWarrantyId === piWarrantyId)
        if (row) {
            await window.api.updateQuotationItemAlternativeId('quotation_warranties', row.id, altId)
            setWarrantyAltIds(prev => ({ ...prev, [piWarrantyId]: altId }))
        }
    }

    const updateCustomWarrantyAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_custom_warranties', id, altId)
        setCustomWarranties(prev => prev.map(cw => cw.id === id ? { ...cw, alternativeId: altId } : cw))
    }

    const updateCustomWarrantyScope = async (id: string, scope: string[] | null) => {
        setCustomWarranties(prev => prev.map(cw => cw.id === id ? { ...cw, vesselScope: scope } : cw))
        await window.api.updateQuotationCustomWarranty(id, { vesselScope: scope })
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

    // Filter warranties by quotation type scope
    const typeCode = quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : 'pi'
    const visibleWarranties = allWarranties.filter(w => !w.typeScope || w.typeScope === 'both' || w.typeScope === typeCode)

    const getTabWarranties = () => {
        if (activeTab === 'all') return visibleWarranties
        if (activeTab === 'untagged') return visibleWarranties.filter(w => !(w.tagIds || []).length && !w.isCargoRelated)
        const tag = tags.find(t => t.id === activeTab)
        const isCargoTag = tag && tag.name.toLowerCase() === 'cargo'
        return visibleWarranties.filter(w => (w.tagIds || []).includes(activeTab) || (isCargoTag && w.isCargoRelated))
    }

    const tabWarranties = getTabWarranties()
    const selectedSet = new Set(selectedIds)
    const tabAllSelected = tabWarranties.length > 0 && tabWarranties.every(w => selectedSet.has(w.id))
    const tabNoneSelected = tabWarranties.every(w => !selectedSet.has(w.id))
    const tabSelectedCount = tabWarranties.filter(w => selectedSet.has(w.id)).length
    const hasCargoTag = tags.some(t => t.name.toLowerCase() === 'cargo')
    const untaggedCount = visibleWarranties.filter(w => !(w.tagIds || []).length && !(hasCargoTag && w.isCargoRelated)).length
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
                                <div key={id} style={{ borderBottom: '1px solid var(--table-border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 8px', fontSize: '0.8rem' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', minWidth: '18px', textAlign: 'right' }}>{i + 1}.</span>
                                        <div style={{ display: 'flex', gap: '1px', flexDirection: 'column' }}>
                                            <button onClick={() => moveSelected(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={10} /></button>
                                            <button onClick={() => moveSelected(i, 'down')} disabled={i === selectedIds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === selectedIds.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={10} /></button>
                                        </div>
                                        <span style={{ flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>{w.text}</span>
                                        <button onClick={() => toggle(id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '1px', opacity: 0.6 }} title="Remove"><X size={12} /></button>
                                    </div>
                                    <VesselScopeChips vessels={qVessels} vesselScope={warrantyVesselScopes[id]} onChange={scope => updateWarrantyScope(id, scope)} />
                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={warrantyAltIds[id] || null} onChangeAltId={altId => updateWarrantyAltId(id, altId)} />
                                </div>
                            )
                        })}
                        {/* Custom warranties inline in the same list */}
                        {customWarranties.map((cw, i) => {
                            const idx = selectedIds.length + i
                            return (
                                <div key={cw.id} style={{ borderBottom: i < customWarranties.length - 1 ? '1px solid var(--table-border)' : 'none', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' }}>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', padding: '4px 8px', fontSize: '0.8rem' }}>
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
                                    <VesselScopeChips vessels={qVessels} vesselScope={cw.vesselScope} onChange={scope => updateCustomWarrantyScope(cw.id, scope)} />
                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={cw.alternativeId || null} onChangeAltId={altId => updateCustomWarrantyAltId(cw.id, altId)} />
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
                            showFontSize showAlignment showLineSpacing
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
                            showFontSize showAlignment showLineSpacing
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

function DeductiblesTab({ quotation, showSuccess, updateField, setQ, getEffectiveText, piAlternatives = [], selectedPIAltId: _selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError?: (m: string) => void; isLight?: boolean; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; getEffectiveText: (key: keyof PISectionTexts) => string; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    void _selectedPIAltId
    const [deductibles, setDeductibles] = useState<QuotationDeductible[]>([])
    const [masterDeductibles, setMasterDeductibles] = useState<PIDeductible[]>([])
    const [textDeds, setTextDeds] = useState<QuotationTextDeductible[]>([])
    const [masterTextDeds, setMasterTextDeds] = useState<PITextDeductible[]>([])
    const [newCustomDesc, setNewCustomDesc] = useState('')
    const [newTextTitle, setNewTextTitle] = useState('')
    const [newTextDed, setNewTextDed] = useState('')
    const [editingDescId, setEditingDescId] = useState<string | null>(null)
    const [editDescText, setEditDescText] = useState('')
    const [editingTextId, setEditingTextId] = useState<string | null>(null)
    const [editTextTitle, setEditTextTitle] = useState('')
    const [editTextContent, setEditTextContent] = useState('')
    const [showAdditionalText, setShowAdditionalText] = useState(false)
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [qd, md, td, mtd, qv] = await Promise.all([
            window.api.getQuotationDeductibles(quotation.id),
            window.api.piGetDeductibles(),
            window.api.getQuotationTextDeductibles(quotation.id),
            window.api.piGetTextDeductibles(),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeQd = Array.isArray(qd) ? qd : []
        const safeMd = Array.isArray(md) ? md : []
        const safeTd = Array.isArray(td) ? td : []
        const safeMtd = Array.isArray(mtd) ? mtd : []
        setDeductibles(safeQd)
        setMasterDeductibles(safeMd)
        setTextDeds(safeTd)
        setMasterTextDeds(safeMtd)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Auto-include default text deductibles on first load
        if (!defaultsApplied.current && safeTd.length === 0 && safeMtd.length > 0) {
            defaultsApplied.current = true
            const defaults = safeMtd.filter(t => t.defaultIncluded)
            for (let i = 0; i < defaults.length; i++) {
                await window.api.addQuotationTextDeductible({ quotationId: quotation.id, piTextDeductibleId: defaults[i].id, title: defaults[i].title, text: defaults[i].text, order: i })
            }
            if (defaults.length > 0) {
                const freshTd = await window.api.getQuotationTextDeductibles(quotation.id)
                setTextDeds(Array.isArray(freshTd) ? freshTd : [])
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const handleAddFromMaster = async (masterId: string) => {
        const master = masterDeductibles.find(m => m.id === masterId)
        if (!master) return
        await window.api.addQuotationDeductible({
            quotationId: quotation.id, piDeductibleId: masterId, title: master.title,
            description: master.description, amount: 0, currency: 'USD',
            secondaryDescription: master.hasSecondary ? master.secondaryDescription : undefined,
            order: deductibles.length
        })
        showSuccess('Deductible added'); loadData()
    }

    const addCustomDeductible = async () => {
        if (!newCustomDesc.trim()) return
        await window.api.addQuotationDeductible({
            quotationId: quotation.id, description: newCustomDesc.trim(),
            amount: 0, currency: 'USD', order: deductibles.length
        })
        setNewCustomDesc('')
        showSuccess('Custom deductible added'); loadData()
    }

    const handleUpdate = async (id: string, updates: { title?: string; amount?: number; currency?: string; secondaryAmount?: number; description?: string }) => {
        await window.api.updateQuotationDeductible(id, updates)
    }

    const moveDeductible = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= deductibles.length) return
        const newOrder = [...deductibles]
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setDeductibles(newOrder)
        await window.api.reorderQuotationDeductibles(newOrder.map(d => d.id))
    }

    const handleAddTextDed = async () => {
        if (!newTextTitle.trim() && !newTextDed.trim()) return
        await window.api.addQuotationTextDeductible({ quotationId: quotation.id, title: newTextTitle, text: newTextDed, order: textDeds.length })
        setNewTextTitle(''); setNewTextDed('')
        showSuccess('Text deductible added'); loadData()
    }

    const addTextFromMaster = async (masterId: string) => {
        const master = masterTextDeds.find(m => m.id === masterId)
        if (!master) return
        await window.api.addQuotationTextDeductible({ quotationId: quotation.id, piTextDeductibleId: master.id, title: master.title, text: master.text, order: textDeds.length })
        showSuccess('Text deductible added'); loadData()
    }

    const moveTextDed = async (index: number, direction: 'up' | 'down') => {
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= textDeds.length) return
        const newOrder = [...textDeds]
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setTextDeds(newOrder)
        await window.api.reorderQuotationTextDeductibles(newOrder.map(d => d.id))
    }

    const updateDeductibleScope = async (id: string, scope: string[] | null) => {
        setDeductibles(prev => prev.map(d => d.id === id ? { ...d, vesselScope: scope } : d))
        await window.api.updateQuotationDeductible(id, { vesselScope: scope })
    }

    const updateDeductibleAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_deductibles', id, altId)
        setDeductibles(prev => prev.map(d => d.id === id ? { ...d, alternativeId: altId } : d))
    }

    const updateTextDeductibleAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_text_deductibles', id, altId)
        setTextDeds(prev => prev.map(d => d.id === id ? { ...d, alternativeId: altId } : d))
    }

    const updateTextDeductibleScope = async (id: string, scope: string[] | null) => {
        setTextDeds(prev => prev.map(d => d.id === id ? { ...d, vesselScope: scope } : d))
        await window.api.updateQuotationTextDeductible(id, { vesselScope: scope })
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Deductibles</h3>

            {/* Add from settings dropdown */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <PickerDropdown
                    placeholder="Add deductible from settings..."
                    options={masterDeductibles.map(d => ({ value: d.id, label: d.title || d.description.slice(0, 80) || 'Untitled deductible' }))}
                    onSelect={handleAddFromMaster}
                />
            </div>

            {/* Deductibles list */}
            {deductibles.map((d, i) => (
                <div key={d.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', gap: '1px', flexDirection: 'column' }}>
                            <button onClick={() => moveDeductible(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={12} /></button>
                            <button onClick={() => moveDeductible(i, 'down')} disabled={i === deductibles.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === deductibles.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={12} /></button>
                        </div>
                        {d.title && <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.title}</span>}
                        <input type="text" defaultValue={d.currency} onBlur={e => handleUpdate(d.id, { currency: e.target.value })} style={{ width: '60px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                        <input type="number" defaultValue={d.amount} onBlur={e => handleUpdate(d.id, { amount: parseFloat(e.target.value) || 0 })} style={{ width: '120px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                        {(d.secondaryDescription || /\{currency\}|\{amount\}/.test(d.description)) && (
                            <>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>2nd:</span>
                                <input type="number" defaultValue={d.secondaryAmount || 0} onBlur={e => handleUpdate(d.id, { secondaryAmount: parseFloat(e.target.value) || 0 })} style={{ width: '120px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                            </>
                        )}
                        {!d.piDeductibleId && <span style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: '3px', background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)' }}>custom</span>}
                        <div style={{ flex: 1 }} />
                        <button onClick={() => { setEditingDescId(editingDescId === d.id ? null : d.id); setEditDescText(d.description) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Pencil size={12} /></button>
                        <button onClick={async () => { await window.api.deleteQuotationDeductible(d.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                    </div>
                    {/* Description (editable) */}
                    {editingDescId === d.id ? (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                            <textarea value={editDescText} onChange={e => setEditDescText(e.target.value)} style={{ flex: 1, minHeight: '40px', resize: 'vertical', fontSize: '0.82rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                            <button onClick={async () => { await handleUpdate(d.id, { description: editDescText }); setEditingDescId(null); setDeductibles(prev => prev.map(dd => dd.id === d.id ? { ...dd, description: editDescText } : dd)) }} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem', alignSelf: 'flex-end' }}>Save</button>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.83rem', paddingLeft: '24px', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>{d.description.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString() : '___')}</div>
                    )}
                    {d.secondaryDescription && (
                        <div style={{ fontSize: '0.78rem', paddingLeft: '24px', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            {d.secondaryDescription.replace(/\{currency\}/g, d.currency).replace(/\{amount\}/g, d.secondaryAmount != null ? d.secondaryAmount.toLocaleString() : '___')}
                        </div>
                    )}
                    <div style={{ paddingLeft: '30px' }}>
                        <VesselScopeChips vessels={qVessels} vesselScope={d.vesselScope} onChange={scope => updateDeductibleScope(d.id, scope)} />
                        <AlternativeScopeChips alternatives={piAlternatives} currentAltId={d.alternativeId || null} onChangeAltId={altId => updateDeductibleAltId(d.id, altId)} />
                    </div>
                </div>
            ))}

            {/* Add custom deductible */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'flex-end' }}>
                <textarea value={newCustomDesc} onChange={e => { setNewCustomDesc(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="Add a custom deductible..." rows={1} style={{ flex: 1, minHeight: '32px', maxHeight: '200px', resize: 'none', fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', overflow: 'auto' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustomDeductible() } }} />
                <button onClick={addCustomDeductible} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem' }} title="Add custom deductible"><Plus size={12} /></button>
            </div>

            {/* ═══ Divider ═══ */}
            <div style={{ borderTop: '2px solid var(--table-border)', margin: '18px 0 14px' }} />

            {/* Text-Based Deductibles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <h4 style={{ fontSize: '0.9rem' }}>Text Deductibles</h4>
                {masterTextDeds.length > 0 && (
                    <PickerDropdown
                        placeholder="Add from settings..."
                        fontSize="0.8rem"
                        options={masterTextDeds.map(t => ({ value: t.id, label: t.title || (t.text.slice(0, 60) + (t.text.length > 60 ? '...' : '')) }))}
                        onSelect={addTextFromMaster}
                    />
                )}
            </div>
            {textDeds.map((td, i) => (
                <div key={td.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                        <div style={{ display: 'flex', gap: '1px', flexDirection: 'column', flexShrink: 0 }}>
                            <button onClick={() => moveTextDed(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === 0 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronUp size={10} /></button>
                            <button onClick={() => moveTextDed(i, 'down')} disabled={i === textDeds.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', color: 'var(--text-secondary)', opacity: i === textDeds.length - 1 ? 0.2 : 0.6, lineHeight: 1 }}><ChevronDown size={10} /></button>
                        </div>
                        {editingTextId === td.id ? (
                            <>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <input type="text" value={editTextTitle} onChange={e => setEditTextTitle(e.target.value)} placeholder="Title" style={{ fontSize: '0.82rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                    <textarea value={editTextContent} onChange={e => setEditTextContent(e.target.value)} placeholder="Text content" style={{ minHeight: '50px', resize: 'vertical', fontSize: '0.82rem', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                                </div>
                                <button onClick={async () => { await window.api.updateQuotationTextDeductible(td.id, { title: editTextTitle, text: editTextContent }); setEditingTextId(null); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '2px' }}><Save size={12} /></button>
                                <button onClick={() => setEditingTextId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><X size={12} /></button>
                            </>
                        ) : (
                            <>
                                <div style={{ flex: 1 }}>
                                    {td.title && <div style={{ fontSize: '0.83rem', fontWeight: 600 }}>{td.title}</div>}
                                    {td.text && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{td.text}</div>}
                                </div>
                                <button onClick={() => { setEditingTextId(td.id); setEditTextTitle(td.title || ''); setEditTextContent(td.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '1px', opacity: 0.6 }}><Pencil size={10} /></button>
                                <button onClick={async () => { await window.api.deleteQuotationTextDeductible(td.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={12} /></button>
                            </>
                        )}
                    </div>
                    <div style={{ paddingLeft: '30px' }}>
                        <VesselScopeChips vessels={qVessels} vesselScope={td.vesselScope} onChange={scope => updateTextDeductibleScope(td.id, scope)} />
                        <AlternativeScopeChips alternatives={piAlternatives} currentAltId={td.alternativeId || null} onChangeAltId={altId => updateTextDeductibleAltId(td.id, altId)} />
                    </div>
                </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <input type="text" value={newTextTitle} onChange={e => setNewTextTitle(e.target.value)} placeholder="Title..." style={{ fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} />
                    <textarea value={newTextDed} onChange={e => { setNewTextDed(e.target.value); e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px' }} placeholder="Text content..." rows={1} style={{ minHeight: '32px', maxHeight: '200px', resize: 'none', fontSize: '0.8rem', padding: '5px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', overflow: 'auto' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddTextDed() } }} />
                </div>
                <button onClick={handleAddTextDed} className="btn-primary" style={{ padding: '5px 10px', fontSize: '0.75rem', alignSelf: 'flex-end' }} title="Add text deductible"><Plus size={12} /></button>
            </div>

            {/* ═══ Additional Text (collapsible) ═══ */}
            <div style={{ marginBottom: '10px' }}>
                <button onClick={() => setShowAdditionalText(!showAdditionalText)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px 0', width: '100%', textAlign: 'left' }}>
                    <ChevronDown size={14} style={{ color: 'var(--text-secondary)', transform: showAdditionalText ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Additional Text & Standard Clauses</span>
                </button>
                {showAdditionalText && (
                    <div style={{ paddingLeft: '20px', marginTop: '8px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px', color: 'var(--text-secondary)' }}>Additional Text (after deductibles)</label>
                        <RichTextEditor
                            value={quotation.sectionTextsOverride?.deductiblesAdditionalText ?? getEffectiveText('deductiblesAdditionalText')}
                            onChange={val => {
                                const override = { ...(quotation.sectionTextsOverride || {}), deductiblesAdditionalText: val }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                                updateField('sectionTextsOverride', override)
                            }}
                            minHeight={60}
                            showFontSize showAlignment showLineSpacing
                        />

                        <div style={{ marginTop: '16px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                <input type="checkbox" checked={quotation.deductibleAggregateEnabled} onChange={e => { setQ(p => ({ ...p, deductibleAggregateEnabled: e.target.checked })); updateField('deductibleAggregateEnabled', e.target.checked) }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                                <span style={{ fontWeight: 600 }}>Aggregate Clause</span>
                            </label>
                            {quotation.deductibleAggregateEnabled && (
                                <textarea
                                    defaultValue={quotation.deductibleAggregateText ?? getEffectiveText('deductiblesAggregate')}
                                    onBlur={e => { setQ(p => ({ ...p, deductibleAggregateText: e.target.value })); updateField('deductibleAggregateText', e.target.value) }}
                                    style={{ width: '100%', marginTop: '8px', marginLeft: '24px', minHeight: '50px', resize: 'vertical', fontSize: '0.82rem', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                                />
                            )}
                        </div>

                    </div>
                )}
            </div>
        </div>
    )
}

// ==================== Exclusions Tab ====================

function ExclusionsTab({ quotation, showSuccess, piAlternatives = [], selectedPIAltId: _selectedPIAltId = null }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; piAlternatives?: QuotationPIAlternative[]; selectedPIAltId?: string | null }) {
    void _selectedPIAltId
    const [allExclusions, setAllExclusions] = useState<PIExclusion[]>([])
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [selectedRows, setSelectedRows] = useState<any[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [customExclusions, setCustomExclusions] = useState<QuotationCustomExclusion[]>([])
    const [newCustomText, setNewCustomText] = useState('')
    const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
    const [editCustomText, setEditCustomText] = useState('')
    const [showImportModal, setShowImportModal] = useState(false)
    const [importText, setImportText] = useState('')
    const [allClauses, setAllClauses] = useState<PIClause[]>([])
    const [selectedClauseIds, setSelectedClauseIds] = useState<Set<string>>(new Set())
    const autoApplied = useRef(false)
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [all, qe, qv, ce, clauses, qClauses, vesselList] = await Promise.all([
            window.api.piGetExclusions(),
            window.api.getQuotationExclusions(quotation.id),
            window.api.getQuotationVessels(quotation.id),
            window.api.getQuotationCustomExclusions(quotation.id),
            window.api.piGetClauses(),
            window.api.getQuotationClauses(quotation.id),
            window.api.getVessels()
        ])
        const safeAll = Array.isArray(all) ? all : []
        setAllExclusions(safeAll)
        const safeQe = Array.isArray(qe) ? qe : []
        const currentIds = new Set(safeQe.filter((e: any) => e.piExclusionId).map((e: any) => e.piExclusionId))
        setSelectedIds(currentIds)
        setSelectedRows(safeQe)
        const safeQv = Array.isArray(qv) ? qv : []
        setQVessels(safeQv)
        setCustomExclusions(Array.isArray(ce) ? ce : [])
        setAllClauses(Array.isArray(clauses) ? clauses : [])
        const safeQClauses = Array.isArray(qClauses) ? qClauses : []
        setSelectedClauseIds(new Set(safeQClauses.map((c: any) => c.piClauseId || c.pi_clause_id || c.id)))
        const safeVesselList = Array.isArray(vesselList) ? vesselList : []

        // Auto-apply vessel-type-based exclusions on first load
        if (!autoApplied.current && safeQv.length > 0) {
            autoApplied.current = true
            const vesselTypeNames = new Set<string>()
            for (const qvItem of safeQv) {
                const reg = qvItem.vesselId ? safeVesselList.find((v: Vessel) => v.id === qvItem.vesselId) : null
                const vtype = reg?.vesselType || qvItem.vesselType
                if (vtype) vesselTypeNames.add(vtype.toLowerCase())
            }
            if (vesselTypeNames.size > 0) {
                // Get vessel types to map names to IDs
                const vesselTypes = await window.api.getVesselTypes()
                const vtIds = new Set((Array.isArray(vesselTypes) ? vesselTypes : [])
                    .filter((vt: any) => vesselTypeNames.has(vt.name.toLowerCase()))
                    .map((vt: any) => vt.id))
                const toAutoSelect = safeAll.filter(ex =>
                    !currentIds.has(ex.id) &&
                    (ex.vesselTypeIds || []).some((vtId: string) => vtIds.has(vtId))
                )
                if (toAutoSelect.length > 0) {
                    const newIds = new Set(currentIds)
                    for (const ex of toAutoSelect) newIds.add(ex.id)
                    setSelectedIds(newIds)
                    await window.api.setQuotationExclusions(quotation.id, Array.from(newIds).map(eid => ({ piExclusionId: eid })))
                    const freshQe = await window.api.getQuotationExclusions(quotation.id)
                    setSelectedRows(Array.isArray(freshQe) ? freshQe : [])
                    showSuccess(`Auto-selected ${toAutoSelect.length} vessel-type exclusion${toAutoSelect.length > 1 ? 's' : ''}`)
                }
            }
        }
    }

    // Check if any cargo clause is selected
    const hasCargoClause = allClauses.some(c => c.isCargoRelated && selectedClauseIds.has(c.id))

    // Filter: hide cargo-related exclusions when no cargo clauses selected
    const visibleExclusions = allExclusions.filter(e => {
        if (e.isCargoRelated && !hasCargoClause) return false
        return true
    })

    const toggle = async (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) newSet.delete(id)
        else newSet.add(id)
        setSelectedIds(newSet)
        await window.api.setQuotationExclusions(quotation.id, Array.from(newSet).map(eid => ({ piExclusionId: eid })))
        const qe = await window.api.getQuotationExclusions(quotation.id)
        setSelectedRows(Array.isArray(qe) ? qe : [])
    }

    const updateExclusionScope = async (id: string, scope: string[] | null) => {
        setSelectedRows(prev => prev.map(e => e.id === id ? { ...e, vesselScope: scope } : e))
        await window.api.updateQuotationItemVesselScope('quotation_exclusions', id, scope)
    }

    const updateExclusionAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_exclusions', id, altId)
        setSelectedRows(prev => prev.map(e => e.id === id ? { ...e, alternativeId: altId } : e))
    }

    const updateCustomExclusionAltId = async (id: string, altId: string | null) => {
        await window.api.updateQuotationItemAlternativeId('quotation_custom_exclusions', id, altId)
        setCustomExclusions(prev => prev.map(e => e.id === id ? { ...e, alternativeId: altId } : e))
    }

    // Custom exclusion handlers
    const addCustom = async () => {
        if (!newCustomText.trim()) return
        const result = await window.api.addQuotationCustomExclusion({ quotationId: quotation.id, text: newCustomText.trim(), order: customExclusions.length })
        if (result && !(result as any).error) {
            setCustomExclusions(prev => [...prev, result])
            setNewCustomText('')
            showSuccess('Custom exclusion added')
        }
    }

    const saveCustomEdit = async (id: string) => {
        await window.api.updateQuotationCustomExclusion(id, { text: editCustomText })
        setEditingCustomId(null)
        setCustomExclusions(prev => prev.map(ce => ce.id === id ? { ...ce, text: editCustomText } : ce))
        showSuccess('Updated')
    }

    const deleteCustom = async (id: string) => {
        await window.api.deleteQuotationCustomExclusion(id)
        setCustomExclusions(prev => prev.filter(ce => ce.id !== id))
        showSuccess('Deleted')
    }

    const moveCustom = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...customExclusions]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setCustomExclusions(newOrder)
        await window.api.reorderQuotationCustomExclusions(newOrder.map(ce => ce.id))
    }

    const updateCustomScope = async (id: string, scope: string[] | null) => {
        setCustomExclusions(prev => prev.map(ce => ce.id === id ? { ...ce, vesselScope: scope } : ce))
        await window.api.updateQuotationItemVesselScope('quotation_custom_exclusions', id, scope)
    }

    const handleImport = async () => {
        const lines = importText.split('\n')
            .map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219\d.)+]+/, '').trim())
            .filter(l => l.length > 0)
        if (lines.length === 0) return
        for (let i = 0; i < lines.length; i++) {
            await window.api.addQuotationCustomExclusion({ quotationId: quotation.id, text: lines[i], order: customExclusions.length + i })
        }
        showSuccess(`Imported ${lines.length} custom exclusions`)
        setImportText(''); setShowImportModal(false)
        const ce = await window.api.getQuotationCustomExclusions(quotation.id)
        setCustomExclusions(Array.isArray(ce) ? ce : [])
    }

    const customTextareaRef = useRef<HTMLTextAreaElement>(null)
    const handleCustomTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setNewCustomText(e.target.value)
        if (customTextareaRef.current) {
            customTextareaRef.current.style.height = 'auto'
            customTextareaRef.current.style.height = Math.min(customTextareaRef.current.scrollHeight, 200) + 'px'
        }
    }

    // Count hidden cargo exclusions
    const hiddenCargoCount = allExclusions.filter(e => e.isCargoRelated && !hasCargoClause).length

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Exclusions</h3>

            {hiddenCargoCount > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(255, 180, 0, 0.08)', border: '1px solid rgba(255, 180, 0, 0.3)', marginBottom: '12px', fontSize: '0.82rem', color: '#ffb400', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={14} />
                    {hiddenCargoCount} cargo-related exclusion{hiddenCargoCount > 1 ? 's' : ''} hidden (no cargo clauses selected in Conditions)
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {visibleExclusions.map(e => {
                    const row = selectedRows.find((r: any) => r.piExclusionId === e.id)
                    return (
                        <div key={e.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', background: selectedIds.has(e.id) ? 'rgba(0, 210, 255, 0.05)' : 'transparent' }}>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggle(e.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', marginTop: '2px' }} />
                                <div style={{ flex: 1 }}>
                                    <span style={{ fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{e.text}</span>
                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px' }}>
                                        {e.isCargoRelated && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255, 180, 0, 0.15)', color: '#ffb400' }}>Cargo</span>}
                                        {(e.vesselTypeIds || []).length > 0 && <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(160, 100, 255, 0.12)', color: '#a064ff' }}>Vessel Type</span>}
                                    </div>
                                </div>
                            </label>
                            {row && qVessels.length > 1 && (
                                <div style={{ paddingLeft: '30px' }}>
                                    <VesselScopeChips vessels={qVessels} vesselScope={row.vesselScope} onChange={scope => updateExclusionScope(row.id, scope)} />
                                    <AlternativeScopeChips alternatives={piAlternatives} currentAltId={row.alternativeId || null} onChangeAltId={altId => updateExclusionAltId(row.id, altId)} />
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
            {visibleExclusions.length === 0 && allExclusions.length === 0 && <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No exclusions defined. Add them in Settings.</p>}

            {/* Custom Exclusions Section */}
            <div style={{ marginTop: '24px', borderTop: '1px solid var(--table-border)', paddingTop: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h4 style={{ fontSize: '0.95rem', margin: 0 }}>Custom Exclusions</h4>
                    <button onClick={() => setShowImportModal(true)} className="btn-secondary" style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px' }}><Upload size={13} /> Import</button>
                </div>

                {customExclusions.map((ce, i) => (
                    <div key={ce.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', background: 'rgba(0, 210, 255, 0.03)' }}>
                        {editingCustomId === ce.id ? (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                                <textarea value={editCustomText} onChange={e => setEditCustomText(e.target.value)} style={{ flex: 1, minHeight: '40px', resize: 'none' }} />
                                <button onClick={() => saveCustomEdit(ce.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingCustomId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span style={{ flex: 1, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{ce.text}</span>
                                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                    <button onClick={() => moveCustom(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                    <button onClick={() => moveCustom(i, 'down')} disabled={i === customExclusions.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === customExclusions.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                    <button onClick={() => { setEditingCustomId(ce.id); setEditCustomText(ce.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)' }}><Pencil size={12} /></button>
                                    <button onClick={() => deleteCustom(ce.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}><Trash2 size={12} /></button>
                                </div>
                            </div>
                        )}
                        {editingCustomId !== ce.id && qVessels.length > 1 && (
                            <div style={{ marginTop: '4px' }}>
                                <VesselScopeChips vessels={qVessels} vesselScope={ce.vesselScope} onChange={scope => updateCustomScope(ce.id, scope)} />
                                <AlternativeScopeChips alternatives={piAlternatives} currentAltId={ce.alternativeId || null} onChangeAltId={altId => updateCustomExclusionAltId(ce.id, altId)} />
                            </div>
                        )}
                    </div>
                ))}

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginTop: '8px' }}>
                    <textarea ref={customTextareaRef} value={newCustomText} onChange={handleCustomTextChange} placeholder="Add custom exclusion..." style={{ flex: 1, minHeight: '36px', maxHeight: '200px', resize: 'none', fontSize: '0.85rem' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addCustom() } }} />
                    <button onClick={addCustom} disabled={!newCustomText.trim()} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={14} /> Add</button>
                </div>
            </div>

            {/* Import Modal */}
            {showImportModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowImportModal(false)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '24px', width: '500px', maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Import Custom Exclusions</h3>
                            <button onClick={() => setShowImportModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
                        </div>
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Paste exclusions (one per line). Bullets, dashes, and numbering will be stripped.</p>
                        <textarea value={importText} onChange={e => setImportText(e.target.value)} placeholder="Paste exclusions here..." style={{ width: '100%', minHeight: '200px', resize: 'vertical', marginBottom: '12px' }} />
                        {importText.trim() && (
                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                                {importText.split('\n').map(l => l.replace(/^[\s•\-\*\u2022\u2023\u25E6\u2043\u2219\d.)+]+/, '').trim()).filter(l => l.length > 0).length} exclusion(s) detected
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowImportModal(false)} className="btn-secondary">Cancel</button>
                            <button onClick={handleImport} className="btn-primary" disabled={!importText.trim()}>Import</button>
                        </div>
                    </div>
                </div>
            )}
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
                        showFontSize showAlignment showLineSpacing
                    />
                </div>
            )}
        </div>
    )
}

// ==================== Subjectivities Tab ====================

function SubjectivitiesTab({ quotation, showSuccess, isLight }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [items, setItems] = useState<QuotationSubjectivity[]>([])
    const [masterList, setMasterList] = useState<PISubjectivity[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [showMasterPicker, setShowMasterPicker] = useState(false)
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const autoPopulateRan = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [subjs, masters, dts, qv] = await Promise.all([
            window.api.getQuotationSubjectivities(quotation.id),
            window.api.getPISubjectivities(),
            window.api.getDocumentTypes(),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeSubjs = Array.isArray(subjs) ? subjs : []
        const safeMasters = Array.isArray(masters) ? masters : []
        const safeDts = Array.isArray(dts) ? dts : []
        // Filter masters by quotation type scope
        const typeCode = quotation.quotationTypeCode?.toLowerCase() === 'h' ? 'hull' : quotation.quotationTypeCode?.toLowerCase() === 'w' ? 'war' : 'pi'
        const filteredMasters = safeMasters.filter(m => !m.typeScope || m.typeScope === 'both' || m.typeScope === typeCode)
        setItems(safeSubjs)
        setMasterList(filteredMasters)
        setDocTypes(safeDts)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Auto-populate on first load if no subjectivities yet (skip for War — subjectivities not included by default)
        if (!autoPopulateRan.current && safeSubjs.length === 0 && filteredMasters.length > 0 && quotation.quotationTypeCode !== 'W') {
            autoPopulateRan.current = true
            await autoPopulate(filteredMasters, safeDts)
        }
    }

    const autoPopulate = async (masters: PISubjectivity[], dts: DocumentType[]) => {
        if (masters.length === 0) return
        try {
            const qVessels: QuotationVessel[] = await window.api.getQuotationVessels(quotation.id)
            const linkedVessels = qVessels.filter(qv => qv.vesselId)
            const hasRealVessel = linkedVessels.length > 0

            const toAdd: PISubjectivity[] = []

            if (!hasRealVessel) {
                // No vessel in DB — add all master subjectivities
                toAdd.push(...masters)
            } else {
                // Check each vessel's doc status
                const missingDocTypeIds = new Set<string>()

                for (const qv of linkedVessels) {
                    const vesselDocs = await window.api.getVesselDocuments(qv.vesselId!)
                    const vesselDocMap = new Map(vesselDocs.map((d: any) => [d.documentTypeId || d.document_type_id, d]))

                    // Check all doc types — missing?
                    for (const dt of dts) {
                        const doc = vesselDocMap.get(dt.id)
                        if (!doc || !doc.filePath) {
                            missingDocTypeIds.add(dt.id)
                            continue
                        }
                        // For annual types — check if expiring soon (P&I policy logic)
                        if (dt.annualRenewal) {
                            try {
                                const policies = await window.api.getVesselDynamicPolicies(qv.vesselId!)
                                const effectiveExpiry = resolveEffectivePolicyExpiry(policies) || doc.expiryDate
                                if (effectiveExpiry) {
                                    const daysLeft = Math.ceil((new Date(effectiveExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                                    if (daysLeft <= 60) missingDocTypeIds.add(dt.id)
                                }
                            } catch { /* skip policy check errors */ }
                        }
                    }
                }

                // Add master subjectivities whose linked doc types overlap with missing/expiring
                for (const m of masters) {
                    const shouldAdd = !m.docTypeIds || m.docTypeIds.length === 0 ||
                        m.docTypeIds.some(dtId => missingDocTypeIds.has(dtId))
                    if (shouldAdd) toAdd.push(m)
                }
            }

            // Insert the items
            let order = 0
            for (const m of toAdd) {
                await window.api.addQuotationSubjectivity({
                    quotationId: quotation.id,
                    piSubjectivityId: m.id,
                    text: m.text,
                    isAutoPopulated: true,
                    order: order++
                })
            }

            // Reload after auto-populate
            const refreshed = await window.api.getQuotationSubjectivities(quotation.id)
            setItems(Array.isArray(refreshed) ? refreshed : [])
        } catch (err) {
            console.error('Auto-populate subjectivities error:', err)
        }
    }

    const handleAddCustom = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationSubjectivity({
            quotationId: quotation.id,
            text: newText.trim(),
            isCustom: true,
            order: items.length
        })
        setNewText('')
        showSuccess('Custom subjectivity added')
        loadData()
    }

    const handleAddFromMaster = async (m: PISubjectivity) => {
        if (items.some(i => i.piSubjectivityId === m.id)) return
        await window.api.addQuotationSubjectivity({
            quotationId: quotation.id,
            piSubjectivityId: m.id,
            text: m.text,
            order: items.length
        })
        showSuccess('Added from master')
        loadData()
    }

    const handleUpdate = async () => {
        if (!editingId || !editText.trim()) return
        await window.api.updateQuotationSubjectivity(editingId, { text: editText.trim() })
        setEditingId(null)
        loadData()
    }

    const handleDelete = async (id: string) => {
        await window.api.deleteQuotationSubjectivity(id)
        loadData()
    }

    const handleMove = async (idx: number, dir: -1 | 1) => {
        const arr = [...items]
        const targetIdx = idx + dir
        if (targetIdx < 0 || targetIdx >= arr.length) return
        ;[arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]]
        setItems(arr)
        for (let i = 0; i < arr.length; i++) {
            await window.api.updateQuotationSubjectivity(arr[i].id, { order: i })
        }
    }

    const updateSubjectivityScope = async (id: string, scope: string[] | null) => {
        setItems(prev => prev.map(s => s.id === id ? { ...s, vesselScope: scope } : s))
        await window.api.updateQuotationSubjectivity(id, { vesselScope: scope })
    }

    const handleRePopulate = async () => {
        if (masterList.length === 0) {
            showSuccess('No master subjectivities configured — add them in Quotation Settings first')
            return
        }
        // Remove all non-custom items (auto-populated + old items without flag), then re-run
        const nonCustomItems = items.filter(i => !i.isCustom)
        for (const item of nonCustomItems) {
            await window.api.deleteQuotationSubjectivity(item.id)
        }
        await autoPopulate(masterList, docTypes)
        showSuccess('Re-populated from vessel documents')
    }

    const addedMasterIds = new Set(items.filter(i => i.piSubjectivityId).map(i => i.piSubjectivityId))
    const availableMasters = masterList.filter(m => !addedMasterIds.has(m.id))

    const inputStyle = { padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.85rem', width: '100%' }

    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '1rem', margin: 0 }}>Subjectivities</h3>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--table-header-bg)', color: 'var(--text-secondary)' }}>{items.length}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                    {availableMasters.length > 0 && (
                        <button onClick={() => setShowMasterPicker(!showMasterPicker)} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Plus size={14} /> From Master
                        </button>
                    )}
                    <button onClick={handleRePopulate} className="btn-secondary" style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Download size={14} /> Re-populate
                    </button>
                </div>
            </div>

            {/* Master picker dropdown */}
            {showMasterPicker && availableMasters.length > 0 && (
                <div style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', border: '1px solid var(--accent-primary)', background: isLight ? '#f0faff' : 'rgba(0, 210, 255, 0.05)' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Select from master list:</div>
                    {availableMasters.map(m => (
                        <div key={m.id} onClick={() => { handleAddFromMaster(m); setShowMasterPicker(false) }} style={{ padding: '6px 10px', borderRadius: '6px', fontSize: '0.82rem', cursor: 'pointer', marginBottom: '4px', border: '1px solid var(--table-border)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0, 210, 255, 0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            {m.text}
                            {m.docTypeIds && m.docTypeIds.length > 0 && (
                                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                    ({m.docTypeIds.map(dtId => docTypes.find(d => d.id === dtId)?.name).filter(Boolean).join(', ')})
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Item list */}
            {items.map((item, idx) => (
                <div key={item.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {editingId === item.id ? (
                            <div style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input value={editText} onChange={e => setEditText(e.target.value)} style={{ ...inputStyle, flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleUpdate(); if (e.key === 'Escape') setEditingId(null) }} autoFocus />
                                <button onClick={handleUpdate} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Save size={12} /></button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><X size={12} /></button>
                            </div>
                        ) : (
                            <>
                                <span style={{ flex: 1, fontSize: '0.85rem' }}>
                                    {item.text}
                                    {item.isAutoPopulated && <span style={{ fontSize: '0.68rem', color: 'var(--accent-primary)', marginLeft: '6px' }}>(auto)</span>}
                                    {item.isCustom && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>(custom)</span>}
                                </span>
                                <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(idx, 1)} disabled={idx === items.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(item.id); setEditText(item.text) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}><Pencil size={14} /></button>
                                <button onClick={() => handleDelete(item.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                            </>
                        )}
                    </div>
                    <div style={{ paddingLeft: '30px' }}>
                        <VesselScopeChips vessels={qVessels} vesselScope={item.vesselScope} onChange={scope => updateSubjectivityScope(item.id, scope)} />
                    </div>
                </div>
            ))}

            {/* Custom add */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Add custom subjectivity..." style={inputStyle} onKeyDown={e => { if (e.key === 'Enter') handleAddCustom() }} />
                <button onClick={handleAddCustom} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', flexShrink: 0 }}><Plus size={14} /> Add</button>
            </div>
        </div>
    )
}

// ==================== Premium Tab ====================

function PremiumTab({ quotation, updateField, setQ, getEffectiveText }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean; getEffectiveText: (key: keyof PISectionTexts) => string }) {
    const [instalments, setInstalments] = useState<QuotationInstalment[]>([])
    const [instalmentDefaults, setInstalmentDefaults] = useState<InstalmentDefaults>({})
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [hullAlternatives, setHullAlternatives] = useState<QuotationHullAlternative[]>([])
    const [hullClauses, setHullClauses] = useState<HullClause[]>([])
    const [piAlternatives, setPiAlternatives] = useState<QuotationPIAlternative[]>([])

    useEffect(() => {
        loadInstalments()
        loadVessels()
        window.api.piGetInstalmentDefaults().then(d => setInstalmentDefaults(d || {}))
        if (quotation.quotationTypeCode === 'H') {
            window.api.hullGetQuotationAlternatives(quotation.id).then(a => setHullAlternatives(Array.isArray(a) ? a : []))
            window.api.hullGetClauses().then(c => setHullClauses(Array.isArray(c) ? c : []))
        }
        if (quotation.quotationTypeCode === 'P') {
            window.api.piGetQuotationAlternatives(quotation.id).then(a => setPiAlternatives(Array.isArray(a) ? a : []))
        }
    }, [])
    const loadInstalments = async () => { setInstalments(await window.api.getQuotationInstalments(quotation.id)) }
    const loadVessels = async () => { setQVessels(await window.api.getQuotationVessels(quotation.id)) }

    const updateAlternativePremium = async (altId: string, amount: number | null) => {
        await window.api.hullUpdateQuotationAlternative(altId, { premiumAmount: amount })
        setHullAlternatives(prev => prev.map(a => a.id === altId ? { ...a, premiumAmount: amount || undefined } : a))
        // Sync total to quotation
        const newTotal = hullAlternatives.reduce((sum, a) => sum + (a.id === altId ? (amount || 0) : (a.premiumAmount || 0)), 0)
        setQ(p => ({ ...p, premiumAmount: newTotal || undefined }))
        updateField('premiumAmount', newTotal || null)
    }

    const updatePIAlternativePremium = async (altId: string, amount: number | null) => {
        await window.api.piUpdateQuotationAlternative(altId, { premiumAmount: amount })
        setPiAlternatives(prev => prev.map(a => a.id === altId ? { ...a, premiumAmount: amount || undefined } : a))
    }

    const getDefaultDays = (count: number, index: number): number | undefined => {
        // 1: [0]  2: [0,180]  3: [0,120,240]  4: [0,90,180,270]  12: [0,30,60,...]
        const knownDefaults: Record<number, number[]> = {
            1: [0],
            2: [0, 180],
            3: [0, 120, 240],
            4: [0, 90, 180, 270],
            12: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
        }
        return knownDefaults[count]?.[index]
    }

    const handleSaveInstalments = async (count: number) => {
        const adminDays = instalmentDefaults[String(count)]
        const insts: { instalmentNumber: number; daysFromInception: number }[] = []
        for (let i = 0; i < count; i++) {
            const existing = instalments.find(inst => inst.instalmentNumber === i + 1)
            insts.push({
                instalmentNumber: i + 1,
                daysFromInception: existing?.daysFromInception ?? adminDays?.[i] ?? getDefaultDays(count, i) ?? 0
            })
        }
        await window.api.setQuotationInstalments(quotation.id, insts)
        loadInstalments()
    }

    const hasDiscount = quotation.ncbEnabled || quotation.upccEnabled
    const ncbType = quotation.ncbDiscountType || 'percentage'
    const ncbPct = quotation.ncbDiscountPercent || 0
    const ncbFixedAmt = quotation.ncbDiscountAmount || 0
    const upccType = quotation.upccDiscountType || 'percentage'
    const upccPct = quotation.upccDiscountPercent || 0
    const upccFixedAmt = quotation.upccDiscountAmount || 0
    const isMultiVessel = qVessels.length >= 2
    const technicalPremium = isMultiVessel
        ? qVessels.reduce((sum, v) => sum + (v.premiumAmount || 0), 0)
        : (quotation.premiumAmount || 0)
    const ncbDeduction = ncbType === 'amount' ? ncbFixedAmt : technicalPremium * ncbPct / 100
    const afterNcb = technicalPremium - ncbDeduction
    const upccDeduction = upccType === 'amount' ? upccFixedAmt : afterNcb * upccPct / 100
    const payablePremium = afterNcb - upccDeduction
    const premiumLabel = hasDiscount ? 'Technical Premium' : 'Premium'
    const currency = quotation.premiumCurrency || 'USD'

    const updateVesselPremium = async (vesselId: string, amount: number | null) => {
        await window.api.updateQuotationVessel(vesselId, { premiumAmount: amount as any })
        setQVessels(prev => prev.map(v => v.id === vesselId ? { ...v, premiumAmount: amount || undefined } : v))
        // Sync total to quotation
        const newTotal = qVessels.reduce((sum, v) => sum + (v.id === vesselId ? (amount || 0) : (v.premiumAmount || 0)), 0)
        setQ(p => ({ ...p, premiumAmount: newTotal || undefined }))
        updateField('premiumAmount', newTotal || null)
    }

    const updateInstalment = async (index: number, field: string, value: any) => {
        const updated = [...instalments]
        ;(updated[index] as any)[field] = value
        await window.api.setQuotationInstalments(quotation.id, updated.map(i => ({
            instalmentNumber: i.instalmentNumber,
            daysFromInception: i.daysFromInception
        })))
        setInstalments(updated)
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Premium</h3>

            {/* Single vessel: premium inputs */}
            {!isMultiVessel && (
                <div style={{ marginBottom: '16px' }}>
                    {/* P&I with multiple alternatives: per-alternative premium */}
                    {quotation.quotationTypeCode === 'P' && piAlternatives.length > 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {piAlternatives.map((alt, idx) => {
                                const accentColor = ALT_COLORS[idx % ALT_COLORS.length]
                                return (
                                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${accentColor}` }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: accentColor, minWidth: '140px', whiteSpace: 'nowrap' }}>
                                            {alt.label || `Alt ${idx + 1}`}
                                        </label>
                                        <input type="number" value={alt.premiumAmount || ''} onChange={e => setPiAlternatives(prev => prev.map(a => a.id === alt.id ? { ...a, premiumAmount: parseFloat(e.target.value) || undefined } : a))} onBlur={e => updatePIAlternativePremium(alt.id, parseFloat(e.target.value) || null)} placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                    </div>
                                )
                            })}
                        </div>
                    ) :
                    /* Hull with multiple alternatives: per-alternative premium */
                    quotation.quotationTypeCode === 'H' && hullAlternatives.length > 1 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            {hullAlternatives.map((alt, idx) => {
                                const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                                const altColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
                                const accentColor = altColors[idx % altColors.length]
                                return (
                                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: `3px solid ${accentColor}` }}>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: accentColor, minWidth: '140px', whiteSpace: 'nowrap' }}>
                                            Alt {idx + 1}{clause ? ` (${clause.code})` : ''}
                                        </label>
                                        <input type="number" value={alt.premiumAmount || ''} onChange={e => setHullAlternatives(prev => prev.map(a => a.id === alt.id ? { ...a, premiumAmount: parseFloat(e.target.value) || undefined } : a))} onBlur={e => updateAlternativePremium(alt.id, parseFloat(e.target.value) || null)} placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                    </div>
                                )
                            })}
                            {quotation.ivEnabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: '3px solid #ffb020' }}>
                                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffb020', minWidth: '140px' }}>Increased Value</label>
                                    <input type="number" value={quotation.ivPremiumAmount || ''} onChange={e => setQ(p => ({ ...p, ivPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ivPremiumAmount', parseFloat(e.target.value) || null)} placeholder={premiumLabel} style={{ flex: 1, maxWidth: '200px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>
                                    {quotation.quotationTypeCode === 'H' && quotation.ivEnabled ? 'Section A (H&M)' : quotation.quotationTypeCode === 'H' ? 'H&M' : premiumLabel}
                                </label>
                                <input type="number" value={quotation.premiumAmount || ''} onChange={e => setQ(p => ({ ...p, premiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('premiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                            </div>
                            {quotation.quotationTypeCode === 'H' && quotation.ivEnabled && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', borderLeft: '3px solid #ffb020' }}>
                                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffb020', minWidth: '140px' }}>Section B (IV)</label>
                                    <input type="number" value={quotation.ivPremiumAmount || ''} onChange={e => setQ(p => ({ ...p, ivPremiumAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ivPremiumAmount', parseFloat(e.target.value) || null)} placeholder="Amount" style={{ flex: 1, maxWidth: '200px' }} />
                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{currency} p.a.</span>
                                </div>
                            )}
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Instalments</label>
                        <input type="number" min={1} max={12} value={quotation.numInstalments || 1}
                            onChange={e => {
                                const v = parseInt(e.target.value) || 1
                                setQ(p => ({ ...p, numInstalments: v }))
                                updateField('numInstalments', v)
                                handleSaveInstalments(v)
                            }}
                            style={{ width: '80px' }}
                        />
                    </div>
                </div>
            )}

            {/* Multi-vessel: per-vessel premium table */}
            {isMultiVessel && (
                <div style={{ marginBottom: '16px' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', maxWidth: '600px', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
                                <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Vessel</th>
                                <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>{premiumLabel} ({currency})</th>
                                {hasDiscount && <th style={{ textAlign: 'right', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Payable ({currency})</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {qVessels.map(v => {
                                const vPrem = v.premiumAmount || 0
                                const vNcbDed = ncbType === 'amount' ? ncbFixedAmt : vPrem * ncbPct / 100
                                const vAfterNcb = vPrem - vNcbDed
                                const vUpccDed = upccType === 'amount' ? upccFixedAmt : vAfterNcb * upccPct / 100
                                const vPayable = vAfterNcb - vUpccDed
                                return (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                        <td style={{ padding: '6px 10px', fontWeight: 600, textTransform: 'uppercase' }}>{v.name || v.vesselLabel}</td>
                                        <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                            <input type="number" value={v.premiumAmount || ''} onChange={e => setQVessels(prev => prev.map(pv => pv.id === v.id ? { ...pv, premiumAmount: parseFloat(e.target.value) || undefined } : pv))} onBlur={e => updateVesselPremium(v.id, parseFloat(e.target.value) || null)} style={{ width: '130px', padding: '3px 6px', textAlign: 'right' }} />
                                        </td>
                                        {hasDiscount && <td style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--text-secondary)' }}>{vPrem > 0 ? vPayable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>}
                                    </tr>
                                )
                            })}
                            <tr style={{ fontWeight: 700 }}>
                                <td style={{ padding: '8px 10px' }}>Total</td>
                                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{technicalPremium > 0 ? technicalPremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>
                                {hasDiscount && <td style={{ padding: '8px 10px', textAlign: 'right' }}>{technicalPremium > 0 ? payablePremium.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}</td>}
                            </tr>
                        </tbody>
                    </table>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '140px' }}>Instalments</label>
                        <input type="number" min={1} max={12} value={quotation.numInstalments || 1}
                            onChange={e => {
                                const v = parseInt(e.target.value) || 1
                                setQ(p => ({ ...p, numInstalments: v }))
                                updateField('numInstalments', v)
                                handleSaveInstalments(v)
                            }}
                            style={{ width: '80px' }}
                        />
                    </div>
                </div>
            )}

            {/* Payable Premium summary (single vessel only) */}
            {!isMultiVessel && hasDiscount && technicalPremium > 0 && (() => {
                const computePayable = (tech: number) => {
                    const nd = ncbType === 'amount' ? ncbFixedAmt : tech * ncbPct / 100
                    const an = tech - nd
                    const ud = upccType === 'amount' ? upccFixedAmt : an * upccPct / 100
                    return an - ud
                }
                const discountLabel = (quotation.ncbEnabled ? (ncbType === 'amount' ? `NCB ${currency} ${ncbFixedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `NCB ${ncbPct}%`) : '') + (quotation.ncbEnabled && quotation.upccEnabled ? ' + ' : '') + (quotation.upccEnabled ? (upccType === 'amount' ? `UPCC ${currency} ${upccFixedAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `UPCC ${upccPct}%`) : '')
                const hullMultiAlt = quotation.quotationTypeCode === 'H' && hullAlternatives.length > 1
                const piMultiAlt = quotation.quotationTypeCode === 'P' && piAlternatives.length > 1
                const anyMultiAlt = hullMultiAlt || piMultiAlt
                const altColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
                const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                return (
                    <div style={{ marginBottom: '16px', padding: '12px 14px', borderRadius: '8px', background: 'rgba(0, 210, 255, 0.06)', border: '1px solid rgba(0, 210, 255, 0.15)' }}>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: anyMultiAlt ? '8px' : '0' }}>
                            Payable Premium ({discountLabel})
                        </div>
                        {piMultiAlt ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {piAlternatives.map((alt, idx) => (
                                    <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: altColors[idx % altColors.length], minWidth: '140px' }}>
                                            {alt.label || `Alt ${idx + 1}`}
                                        </span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(alt.premiumAmount || 0))}</span>
                                    </div>
                                ))}
                            </div>
                        ) : hullMultiAlt ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {hullAlternatives.map((alt, idx) => {
                                    const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                                    return (
                                        <div key={alt.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: altColors[idx % altColors.length], minWidth: '140px' }}>
                                                Alt {idx + 1}{clause ? ` (${clause.code})` : ''}
                                            </span>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(alt.premiumAmount || 0))}</span>
                                        </div>
                                    )
                                })}
                                {quotation.ivEnabled && quotation.ivPremiumAmount != null && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#ffb020', minWidth: '140px' }}>Increased Value</span>
                                        <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(computePayable(quotation.ivPremiumAmount || 0))}</span>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>{currency} {fmt(payablePremium)}</span>
                        )}
                    </div>
                )
            })()}

            {/* Discounts: NCB and UPCC */}
            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)', flex: '1 1 260px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={quotation.ncbEnabled} onChange={e => {
                            const enabling = e.target.checked
                            setQ(p => ({ ...p, ncbEnabled: enabling }))
                            updateField('ncbEnabled', enabling)
                            if (enabling && !quotation.ncbText) {
                                const def = getEffectiveText('ncbDefaultText')
                                if (def) { setQ(p => ({ ...p, ncbText: def })); updateField('ncbText', def) }
                            }
                        }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>No Claims Bonus (NCB)</span>
                    </label>
                    {quotation.ncbEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="ncbType" checked={ncbType === 'percentage'} onChange={() => { setQ(p => ({ ...p, ncbDiscountType: 'percentage' })); updateField('ncbDiscountType', 'percentage') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Percentage
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="ncbType" checked={ncbType === 'amount'} onChange={() => { setQ(p => ({ ...p, ncbDiscountType: 'amount' })); updateField('ncbDiscountType', 'amount') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Fixed Amount
                                </label>
                            </div>
                            {ncbType === 'percentage' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Discount:</span>
                                    <input type="number" min={0} max={100} step={0.1} value={quotation.ncbDiscountPercent || ''} onChange={e => setQ(p => ({ ...p, ncbDiscountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ncbDiscountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                                    <span style={{ fontSize: '0.8rem' }}>%</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Amount:</span>
                                    <span style={{ fontSize: '0.8rem' }}>{currency}</span>
                                    <input type="number" min={0} step={0.01} value={quotation.ncbDiscountAmount || ''} onChange={e => setQ(p => ({ ...p, ncbDiscountAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('ncbDiscountAmount', parseFloat(e.target.value) || null)} style={{ width: '120px', padding: '3px 6px' }} />
                                </div>
                            )}
                            <RichTextEditor value={quotation.ncbText || ''} onChange={val => { setQ(p => ({ ...p, ncbText: val })); updateField('ncbText', val) }} placeholder="NCB terms text..." minHeight={50} maxWidth="500px" showFontSize showAlignment showLineSpacing />
                        </div>
                    )}
                </div>
                <div style={{ padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)', flex: '1 1 260px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer', marginBottom: '8px' }}>
                        <input type="checkbox" checked={quotation.upccEnabled} onChange={e => {
                            const enabling = e.target.checked
                            setQ(p => ({ ...p, upccEnabled: enabling }))
                            updateField('upccEnabled', enabling)
                            if (enabling && !quotation.upccText) {
                                const def = getEffectiveText('upccDefaultText')
                                if (def) { setQ(p => ({ ...p, upccText: def })); updateField('upccText', def) }
                            }
                        }} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} />
                        <span style={{ fontWeight: 600 }}>Upfront Continuity (UPCC)</span>
                    </label>
                    {quotation.upccEnabled && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingLeft: '24px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="upccType" checked={upccType === 'percentage'} onChange={() => { setQ(p => ({ ...p, upccDiscountType: 'percentage' })); updateField('upccDiscountType', 'percentage') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Percentage
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                    <input type="radio" name="upccType" checked={upccType === 'amount'} onChange={() => { setQ(p => ({ ...p, upccDiscountType: 'amount' })); updateField('upccDiscountType', 'amount') }} style={{ accentColor: 'var(--accent-primary)' }} />
                                    Fixed Amount
                                </label>
                            </div>
                            {upccType === 'percentage' ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Discount:</span>
                                    <input type="number" min={0} max={100} step={0.1} value={quotation.upccDiscountPercent || ''} onChange={e => setQ(p => ({ ...p, upccDiscountPercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('upccDiscountPercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                                    <span style={{ fontSize: '0.8rem' }}>%</span>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.8rem' }}>Amount:</span>
                                    <span style={{ fontSize: '0.8rem' }}>{currency}</span>
                                    <input type="number" min={0} step={0.01} value={quotation.upccDiscountAmount || ''} onChange={e => setQ(p => ({ ...p, upccDiscountAmount: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('upccDiscountAmount', parseFloat(e.target.value) || null)} style={{ width: '120px', padding: '3px 6px' }} />
                                </div>
                            )}
                            <RichTextEditor value={quotation.upccText || ''} onChange={val => { setQ(p => ({ ...p, upccText: val })); updateField('upccText', val) }} placeholder="UPCC terms text..." minHeight={50} maxWidth="500px" showFontSize showAlignment showLineSpacing />
                        </div>
                    )}
                </div>
            </div>

            {/* Non-refundable option */}
            <div style={{ marginBottom: '20px', padding: '14px 18px', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Non-Refundable</h4>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="radio" name="nonRefundable" checked={!quotation.nonRefundableType} onChange={() => { setQ(p => ({ ...p, nonRefundableType: null, nonRefundablePercent: undefined })); updateField('nonRefundableType', null); updateField('nonRefundablePercent', null) }} style={{ accentColor: 'var(--accent-primary)' }} />
                        None
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="radio" name="nonRefundable" checked={quotation.nonRefundableType === 'first_instalment'} onChange={() => {
                            const defaultText = quotation.sectionTextsOverride?.nonRefundableFirstText ?? getEffectiveText('nonRefundableFirstText')
                            setQ(p => ({ ...p, nonRefundableType: 'first_instalment', nonRefundablePercent: undefined, sectionTextsOverride: { ...(p.sectionTextsOverride || {}), nonRefundableFirstText: p.sectionTextsOverride?.nonRefundableFirstText || defaultText } }))
                            updateField('nonRefundableType', 'first_instalment')
                            updateField('nonRefundablePercent', null)
                            if (!quotation.sectionTextsOverride?.nonRefundableFirstText) {
                                const override = { ...(quotation.sectionTextsOverride || {}), nonRefundableFirstText: defaultText }
                                updateField('sectionTextsOverride', override)
                            }
                        }} style={{ accentColor: 'var(--accent-primary)' }} />
                        1st instalment is non-refundable
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input type="radio" name="nonRefundable" checked={quotation.nonRefundableType === 'percentage'} onChange={() => {
                            const defaultText = quotation.sectionTextsOverride?.nonRefundablePercentText ?? getEffectiveText('nonRefundablePercentText')
                            setQ(p => ({ ...p, nonRefundableType: 'percentage', sectionTextsOverride: { ...(p.sectionTextsOverride || {}), nonRefundablePercentText: p.sectionTextsOverride?.nonRefundablePercentText || defaultText } }))
                            updateField('nonRefundableType', 'percentage')
                            if (!quotation.sectionTextsOverride?.nonRefundablePercentText) {
                                const override = { ...(quotation.sectionTextsOverride || {}), nonRefundablePercentText: defaultText }
                                updateField('sectionTextsOverride', override)
                            }
                        }} style={{ accentColor: 'var(--accent-primary)' }} />
                        Percentage of premium
                    </label>
                    {quotation.nonRefundableType === 'percentage' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input type="number" min={0} max={100} step={0.1} value={quotation.nonRefundablePercent || ''} onChange={e => setQ(p => ({ ...p, nonRefundablePercent: parseFloat(e.target.value) || undefined }))} onBlur={e => updateField('nonRefundablePercent', parseFloat(e.target.value) || null)} style={{ width: '70px', padding: '3px 6px' }} />
                            <span style={{ fontSize: '0.8rem' }}>%</span>
                        </div>
                    )}
                </div>
                {quotation.nonRefundableType && (
                    <div style={{ marginTop: '10px' }}>
                        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Non-refundable sentence (appears in export after 1st instalment)</label>
                        <textarea
                            value={quotation.nonRefundableType === 'first_instalment'
                                ? (quotation.sectionTextsOverride?.nonRefundableFirstText ?? getEffectiveText('nonRefundableFirstText'))
                                : (quotation.sectionTextsOverride?.nonRefundablePercentText ?? getEffectiveText('nonRefundablePercentText')).replace(/\{percent\}/g, String(quotation.nonRefundablePercent || '___'))
                            }
                            onChange={e => {
                                const key = quotation.nonRefundableType === 'first_instalment' ? 'nonRefundableFirstText' : 'nonRefundablePercentText'
                                const override = { ...(quotation.sectionTextsOverride || {}), [key]: e.target.value }
                                setQ(p => ({ ...p, sectionTextsOverride: override }))
                            }}
                            onBlur={e => {
                                const key = quotation.nonRefundableType === 'first_instalment' ? 'nonRefundableFirstText' : 'nonRefundablePercentText'
                                const override = { ...(quotation.sectionTextsOverride || {}), [key]: e.target.value }
                                updateField('sectionTextsOverride', override)
                            }}
                            style={{ width: '100%', maxWidth: '600px', minHeight: '40px', resize: 'vertical', fontSize: '0.82rem', padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                        />
                        {quotation.nonRefundableType === 'percentage' && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>Use {'{percent}'} as placeholder for the percentage value</div>
                        )}
                    </div>
                )}
            </div>

            {/* Instalment Schedule */}
            {instalments.length > 0 && (
                <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Instalment Schedule</h4>
                    {instalments.map((inst, i) => (
                        <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, width: '30px' }}>#{inst.instalmentNumber}</span>
                            <input type="number" value={inst.daysFromInception} onChange={e => updateInstalment(i, 'daysFromInception', parseInt(e.target.value) || 0)} style={{ width: '80px', padding: '4px 6px' }} />
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>days from inception</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Additional premium instructions */}
            <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Additional premium instructions</label>
                <RichTextEditor value={quotation.premiumAdditionalText || ''} onChange={val => { setQ(p => ({ ...p, premiumAdditionalText: val })); updateField('premiumAdditionalText', val) }} minHeight={60} maxWidth="600px" showFontSize showAlignment showLineSpacing />
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

// ==================== Custom Sections Tab ====================

function CustomSectionsTab({ quotation, showSuccess, showError, isLight }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [sections, setSections] = useState<QuotationCustomSection[]>([])
    const [newTitle, setNewTitle] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTitle, setEditTitle] = useState('')
    const [editText, setEditText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const result = await window.api.getQuotationCustomSections(quotation.id)
        setSections(Array.isArray(result) ? result : [])
    }

    const handleAdd = async () => {
        if (!newTitle.trim()) return
        try {
            const result = await window.api.addQuotationCustomSection({
                quotationId: quotation.id,
                title: newTitle.trim(),
                text: '',
                order: sections.length
            })
            if ((result as any).error) { showError((result as any).message); return }
            setNewTitle('')
            showSuccess('Section added')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to add section') }
    }

    const handleDelete = async (id: string) => {
        try {
            await window.api.deleteQuotationCustomSection(id)
            showSuccess('Section deleted')
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to delete') }
    }

    const handleSaveEdit = async () => {
        if (!editingId || !editTitle.trim()) return
        try {
            await window.api.updateQuotationCustomSection(editingId, { title: editTitle.trim(), text: editText })
            showSuccess('Section updated')
            setEditingId(null)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
    }

    const handleMove = async (index: number, dir: 'up' | 'down') => {
        const newSections = [...sections]
        const swapIdx = dir === 'up' ? index - 1 : index + 1
        if (swapIdx < 0 || swapIdx >= newSections.length) return
        ;[newSections[index], newSections[swapIdx]] = [newSections[swapIdx], newSections[index]]
        setSections(newSections)
        try {
            await window.api.reorderQuotationCustomSections(newSections.map(s => s.id))
        } catch (err: any) { showError(err.message || 'Failed to reorder') }
    }

    const startEdit = (section: QuotationCustomSection) => {
        setEditingId(section.id)
        setEditTitle(section.title)
        setEditText(section.text || '')
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Custom Sections</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Add custom sections that will appear in the exported quotation. Use the Section Order button in the header to position them.
            </p>

            {/* Add form */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input
                    type="text"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    placeholder="Section title..."
                    style={{ flex: 1 }}
                    onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
                />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Plus size={16} /> Add Section
                </button>
            </div>

            {sections.length === 0 && (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No custom sections yet. Add one above.
                </div>
            )}

            {sections.map((section, i) => (
                <div key={section.id} style={{
                    padding: '16px', borderRadius: '8px', border: '1px solid var(--table-border)',
                    marginBottom: '12px', background: editingId === section.id ? (isLight ? '#f0f4ff' : 'rgba(0,150,255,0.05)') : 'transparent'
                }}>
                    {editingId === section.id ? (
                        <>
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    style={{ flex: 1, fontWeight: 600, fontSize: '0.95rem' }}
                                />
                                <button onClick={handleSaveEdit} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '6px 12px' }}>
                                    <Save size={14} /> Save
                                </button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                                    Cancel
                                </button>
                            </div>
                            <RichTextEditor value={editText} onChange={setEditText} placeholder="Section content..." showFontSize showAlignment showLineSpacing />
                        </>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={16} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === sections.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === sections.length - 1 ? 0.3 : 1 }}><ChevronDown size={16} /></button>
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '4px' }}>{section.title}</div>
                                {section.text ? (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}
                                        dangerouslySetInnerHTML={{ __html: section.text.substring(0, 200) }}
                                    />
                                ) : (
                                    <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No content</span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button onClick={() => startEdit(section)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }}><Pencil size={15} /></button>
                                <button onClick={() => handleDelete(section.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={15} /></button>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}

// ==================== Section Order Modal ====================

function SectionOrderModal({ quotation, onClose, onSave, showSuccess, showError, isLight }: {
    quotation: Quotation
    onClose: () => void
    onSave: (order: string[]) => void
    showSuccess: (m: string) => void
    showError: (m: string) => void
    isLight: boolean
}) {
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
            window.api.piGetSectionOrderDefaultsByType(typeCode)
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
            await window.api.updateQuotation(quotation.id, { sectionOrder: order } as any)
            showSuccess('Section order saved')
            onSave(order)
        } catch (err: any) { showError(err.message || 'Failed to save order') }
    }

    const handleReset = async () => {
        const defaults = await window.api.piGetSectionOrderDefaultsByType(typeCode)
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
                    Drag sections to reorder how they appear in the exported quotation.
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

// ==================== Agreed Value Tab (Hull) ====================

function AgreedValueTab({ quotation, updateField, setQ, showError }: {
    quotation: Quotation
    updateField: (f: string, v: any) => void
    setQ: (fn: (p: Quotation) => Quotation) => void
    showSuccess: (m: string) => void
    showError: (m: string) => void
}) {
    const [items, setItems] = useState<QuotationAgreedValueItem[]>([])
    const [allTexts, setAllTexts] = useState<HullAgreedValueText[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [newText, setNewText] = useState('')
    const defaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [texts, existingItems, qv] = await Promise.all([
            window.api.hullGetAgreedValueTexts(),
            window.api.hullGetQuotationAgreedValueItems(quotation.id),
            window.api.getQuotationVessels(quotation.id)
        ])
        const safeTexts = Array.isArray(texts) ? texts : []
        const safeItems = Array.isArray(existingItems) ? existingItems : []
        setAllTexts(safeTexts)
        setItems(safeItems)
        setQVessels(Array.isArray(qv) ? qv : [])

        // Sync sections from master texts (fixes items saved before section was tracked)
        if (safeItems.length > 0 && safeTexts.length > 0) {
            const masterMap = new Map(safeTexts.map(t => [t.id, t.section || 'hm']))
            let needsSave = false
            const synced = safeItems.map(it => {
                if (it.hullTextId && masterMap.has(it.hullTextId)) {
                    const masterSec = masterMap.get(it.hullTextId)!
                    if ((it.section || 'hm') !== masterSec) {
                        needsSave = true
                        return { ...it, section: masterSec }
                    }
                }
                return it
            })
            if (needsSave) {
                try {
                    await window.api.hullSetQuotationAgreedValueItems(quotation.id, synced.map(it => ({ hullTextId: it.hullTextId, text: it.text, section: it.section || 'hm', vesselScope: it.vesselScope })))
                    const fresh = await window.api.hullGetQuotationAgreedValueItems(quotation.id)
                    setItems(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        }

        // Auto-populate default texts on first load if no items exist
        if (!defaultsApplied.current && safeItems.length === 0 && safeTexts.length > 0) {
            defaultsApplied.current = true
            const defaults = safeTexts.filter(t => t.defaultSelected)
            if (defaults.length > 0) {
                const newItems = defaults.map(t => ({ hullTextId: t.id, text: t.text, section: t.section || 'hm' }))
                try {
                    await window.api.hullSetQuotationAgreedValueItems(quotation.id, newItems)
                    const fresh = await window.api.hullGetQuotationAgreedValueItems(quotation.id)
                    setItems(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        } else {
            defaultsApplied.current = true
        }
    }

    const saveItems = async (updated: QuotationAgreedValueItem[]) => {
        try {
            await window.api.hullSetQuotationAgreedValueItems(
                quotation.id,
                updated.map(it => ({ hullTextId: it.hullTextId, text: it.text, section: it.section || 'hm', vesselScope: it.vesselScope }))
            )
            const fresh = await window.api.hullGetQuotationAgreedValueItems(quotation.id)
            setItems(Array.isArray(fresh) ? fresh : [])
        } catch (err: any) {
            showError(err.message || 'Failed to save')
        }
    }

    const addFromTemplate = async (tmpl: HullAgreedValueText) => {
        const already = items.some(it => it.hullTextId === tmpl.id)
        if (already) return
        const updated = [...items, { id: '', quotationId: quotation.id, hullTextId: tmpl.id, text: tmpl.text, section: tmpl.section || 'hm', order: items.length }]
        await saveItems(updated)
    }

    const addCustomText = async () => {
        if (!newText.trim()) return
        const updated = [...items, { id: '', quotationId: quotation.id, text: newText.trim(), section: 'hm', order: items.length }]
        await saveItems(updated)
        setNewText('')
    }

    const removeItem = async (idx: number) => {
        const updated = items.filter((_, i) => i !== idx)
        await saveItems(updated)
    }

    const updateItemText = async (idx: number, text: string) => {
        const updated = items.map((it, i) => i === idx ? { ...it, text } : it)
        setItems(updated)
    }

    const blurSave = async () => {
        await saveItems(items)
    }

    const moveItem = async (idx: number, dir: 'up' | 'down') => {
        const arr = [...items]
        const swap = dir === 'up' ? idx - 1 : idx + 1
        if (swap < 0 || swap >= arr.length) return
        ;[arr[idx], arr[swap]] = [arr[swap], arr[idx]]
        await saveItems(arr)
    }

    const updateScope = async (idx: number, scope: string[] | null) => {
        const updated = items.map((it, i) => i === idx ? { ...it, vesselScope: scope } : it)
        await saveItems(updated)
    }

    const unusedTexts = allTexts.filter(t => !items.some(it => it.hullTextId === t.id))

    return (
        <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Agreed Insured Value</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                Set the agreed value and select/add text items for the Hull quotation.
            </p>

            {/* H&M Value + Currency */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
                <div style={{ flex: 1, maxWidth: '250px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>H&M Value</label>
                    <input
                        type="number"
                        value={quotation.agreedValue ?? ''}
                        onChange={e => setQ(p => ({ ...p, agreedValue: e.target.value ? Number(e.target.value) : undefined }))}
                        onBlur={e => updateField('agreedValue', e.target.value ? Number(e.target.value) : null)}
                        placeholder="0.00"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>
                <div style={{ maxWidth: '120px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                    <input
                        type="text"
                        value={quotation.agreedValueCurrency || 'USD'}
                        onChange={e => setQ(p => ({ ...p, agreedValueCurrency: e.target.value }))}
                        onBlur={e => updateField('agreedValueCurrency', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>
            </div>

            {/* IV toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: quotation.ivEnabled ? '12px' : '20px' }}>
                <input type="checkbox" checked={!!quotation.ivEnabled} onChange={e => { setQ(p => ({ ...p, ivEnabled: e.target.checked })); updateField('ivEnabled', e.target.checked) }} />
                <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Include Increased Value (IV)</span>
            </div>

            {/* IV Value + Currency */}
            {quotation.ivEnabled && (
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ flex: 1, maxWidth: '250px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>IV Value</label>
                    <input
                        type="number"
                        value={quotation.ivValue ?? ''}
                        onChange={e => setQ(p => ({ ...p, ivValue: e.target.value ? Number(e.target.value) : undefined }))}
                        onBlur={e => updateField('ivValue', e.target.value ? Number(e.target.value) : null)}
                        placeholder="0.00"
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>
                <div style={{ maxWidth: '120px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                    <input
                        type="text"
                        value={quotation.ivCurrency || 'USD'}
                        onChange={e => setQ(p => ({ ...p, ivCurrency: e.target.value }))}
                        onBlur={e => updateField('ivCurrency', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem' }}
                    />
                </div>
            </div>
            )}

            {/* Template texts to add */}
            {unusedTexts.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Add from templates</label>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {unusedTexts.map(t => (
                            <button key={t.id} onClick={() => addFromTemplate(t)} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px' }}>
                                + {t.text.length > 60 ? t.text.slice(0, 60) + '…' : t.text}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Selected items */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                    Value Text Items ({items.length})
                </label>
                {items.length === 0 ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', border: '1px dashed var(--table-border)', borderRadius: '8px' }}>
                        No text items yet. Add from templates above or write custom text below.
                    </div>
                ) : (
                    items.map((it, idx) => (
                        <div key={it.id || idx} style={{ marginBottom: '8px', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--table-border)', background: it.hullTextId ? 'transparent' : 'rgba(160,100,255,0.04)' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingTop: '4px' }}>
                                    <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                    <button onClick={() => moveItem(idx, 'down')} disabled={idx === items.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)', opacity: idx === items.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                </div>
                                <textarea
                                    value={it.text}
                                    onChange={e => updateItemText(idx, e.target.value)}
                                    onBlur={blurSave}
                                    rows={2}
                                    style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', fontSize: '0.85rem', resize: 'vertical', minHeight: '40px', fontFamily: 'inherit' }}
                                />
                                <button onClick={() => removeItem(idx)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--danger)' }}>
                                    <X size={16} />
                                </button>
                            </div>
                            {qVessels.length > 1 && (
                                <div style={{ marginTop: '6px', paddingLeft: '28px' }}>
                                    <VesselScopeChips vessels={qVessels} vesselScope={it.vesselScope} onChange={scope => updateScope(idx, scope)} />
                                </div>
                            )}
                            <div style={{ marginLeft: '28px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                {!it.hullTextId && <span style={{ fontSize: '0.7rem', color: '#a064ff' }}>(Custom)</span>}
                                {quotation.ivEnabled && (
                                    <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 600, background: it.section === 'iv' ? '#6464ff22' : '#ff64c822', color: it.section === 'iv' ? '#6464ff' : '#ff64c8', border: `1px solid ${it.section === 'iv' ? '#6464ff44' : '#ff64c844'}` }}>{it.section === 'iv' ? 'IV' : 'Hull'}</span>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add custom text */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Add custom text</label>
                    <textarea
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        placeholder="Enter custom agreed value text..."
                        rows={2}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                </div>
                <button onClick={addCustomText} disabled={!newText.trim()} className="btn-primary" style={{ fontSize: '0.82rem', padding: '8px 16px', marginBottom: '2px' }}>
                    <Plus size={14} /> Add
                </button>
            </div>
        </div>
    )
}

// ==================== Hull Clause Dropdown ====================

function HullClauseDropdown({ clauses, selectedId, onChange, description }: {
    clauses: HullClause[]
    selectedId: string
    onChange: (id: string) => void
    description?: string
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
            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>Hull Clause</label>
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

function HullConditionPicker({ label, items, selectedIds, onToggle, overrides, onOverrideChange, onOverrideBlur, scopes, onScopeChange, vessels, emptyText, amounts, onAmountChange, onAmountBlur, allConditions: _allConds }: {
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
}) {
    const [dropdownOpen, setDropdownOpen] = useState(false)
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const bg = isLight ? '#ffffff' : '#1a1d28'
    const selectedItems = items.filter(i => selectedIds.has(i.id))
    const selectedCount = selectedItems.length

    return (
        <div style={{ marginBottom: '24px' }}>
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

// ==================== Sum Insured Tab (War) ====================

function SumInsuredTab({ quotation, updateField, setQ }: {
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
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Sum Insured</h3>
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

// ==================== War Conditions Tab ====================

function WarConditionsTab({ quotation, showError }: {
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
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Conditions</h3>
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

// ==================== War Trading Tab ====================

function WarTradingTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (q: Quotation) => Quotation) => void
}) {
    const [warSettings, setWarSettings] = useState<WarSettings | null>(null)
    const [customText, setCustomText] = useState(quotation.tradingWarrantyIntro || '')
    const [loaded, setLoaded] = useState(false)

    useEffect(() => {
        (async () => {
            try {
                const settings = await window.api.warGetSettings()
                if (settings && !(settings as any).error) {
                    setWarSettings(settings)
                    // Set default text from war settings if no custom override yet
                    if (!quotation.tradingWarrantyIntro) {
                        const resolved = settings.tradingWarrantyText
                            .replace(/\{jwla_code\}/g, settings.jwlaCode)
                            .replace(/\{jwla_date\}/g, settings.jwlaDate)
                        setCustomText(resolved)
                        updateField('tradingWarrantyIntro', resolved)
                        setQ(q => ({ ...q, tradingWarrantyIntro: resolved }))
                    }
                }
            } catch {}
            setLoaded(true)
        })()
    }, [])

    const handleChange = (text: string) => {
        setCustomText(text)
        setQ(q => ({ ...q, tradingWarrantyIntro: text }))
    }

    const handleBlur = () => {
        updateField('tradingWarrantyIntro', customText)
    }

    const handleResetToDefault = () => {
        if (!warSettings) return
        const resolved = warSettings.tradingWarrantyText
            .replace(/\{jwla_code\}/g, warSettings.jwlaCode)
            .replace(/\{jwla_date\}/g, warSettings.jwlaDate)
        setCustomText(resolved)
        setQ(q => ({ ...q, tradingWarrantyIntro: resolved }))
        updateField('tradingWarrantyIntro', resolved)
    }

    if (!loaded) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

    return (
        <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Trading Warranty</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                Trading warranty text for this War Risk quotation. Defaults from War Settings.
            </p>

            <textarea
                value={customText}
                onChange={e => handleChange(e.target.value)}
                onBlur={handleBlur}
                style={{ width: '100%', minHeight: '100px', fontSize: '0.88rem', padding: '10px 12px', marginBottom: '10px' }}
            />

            {warSettings && (
                <button
                    onClick={handleResetToDefault}
                    className="btn-secondary"
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                >
                    Reset to Default
                </button>
            )}
        </div>
    )
}

// ==================== Hull Conditions Tab ====================

function HullConditionsTab({ quotation, updateField, showError }: {
    quotation: Quotation
    updateField: (f: string, v: any) => void
    showSuccess: (m: string) => void
    showError: (m: string) => void
}) {
    const [hullClauses, setHullClauses] = useState<HullClause[]>([])
    const [allConditions, setAllConditions] = useState<HullClauseCondition[]>([])
    const [allAdditional, setAllAdditional] = useState<HullAdditionalCondition[]>([])
    const [alternatives, setAlternatives] = useState<QuotationHullAlternative[]>([])
    const [selectedIvClauseId, setSelectedIvClauseId] = useState<string>('')
    const [qConditions, setQConditions] = useState<QuotationHullCondition[]>([])
    const [qAdditional, setQAdditional] = useState<QuotationHullAdditionalCondition[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const condDefaultsApplied = useRef(false)
    const addDefaultsApplied = useRef(false)

    useEffect(() => { loadData() }, [])

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

        // If no alternatives exist yet, create one from the quotation's hullClauseId or first H&M clause
        const hmClauses = safeClauses.filter(c => c.conditionSection !== 'iv')
        if (safeAlts.length === 0 && hmClauses.length > 0) {
            const defaultClauseId = quotation.hullClauseId && safeClauses.some(c => c.id === quotation.hullClauseId)
                ? quotation.hullClauseId
                : hmClauses[0].id
            try {
                const newAlt = await window.api.hullAddQuotationAlternative(quotation.id, defaultClauseId)
                if (newAlt && !(newAlt as any).error) {
                    setAlternatives([newAlt])
                    // Sync hullClauseId
                    try { updateField('hullClauseId', defaultClauseId) } catch {}
                }
            } catch {}
        } else {
            setAlternatives(safeAlts)
            // Sync hullClauseId from first alternative
            if (safeAlts.length === 1 && safeAlts[0].hullClauseId !== quotation.hullClauseId) {
                try { updateField('hullClauseId', safeAlts[0].hullClauseId) } catch {}
            } else if (safeAlts.length > 1 && quotation.hullClauseId) {
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

        // Auto-apply default conditions on first load
        if (!condDefaultsApplied.current && safeExistCond.length === 0 && safeConds.length > 0) {
            condDefaultsApplied.current = true
            const defaults = safeConds.filter(c => c.defaultSelected)
            if (defaults.length > 0) {
                // Determine the first alternative ID for H&M conditions
                const firstAltId = safeAlts.length > 0 ? safeAlts[0].id : undefined
                const firstAltClauseId = safeAlts.length > 0 ? safeAlts[0].hullClauseId : quotation.hullClauseId
                try {
                    await window.api.hullSetQuotationHullConditions(
                        quotation.id,
                        defaults.map(c => {
                            // Determine which alternative this condition belongs to
                            const belongsToAlt = firstAltClauseId && c.hullClauseId === firstAltClauseId
                            return {
                                hullConditionId: c.id,
                                conditionSection: c.conditionSection || 'both',
                                alternativeId: belongsToAlt ? firstAltId : null
                            }
                        })
                    )
                    const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
                    setQConditions(Array.isArray(fresh) ? fresh : [])
                } catch {}
            }
        } else {
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
        } else {
            addDefaultsApplied.current = true
        }
    }

    // Alternative management
    const addAlternative = async () => {
        const hmClauses = hullClauses.filter(c => c.conditionSection !== 'iv')
        if (hmClauses.length === 0) return
        // Pick first clause not already used by an alternative
        const usedIds = new Set(alternatives.map(a => a.hullClauseId))
        const available = hmClauses.find(c => !usedIds.has(c.id)) || hmClauses[0]
        try {
            const newAlt = await window.api.hullAddQuotationAlternative(quotation.id, available.id)
            if (newAlt && !(newAlt as any).error) {
                const updated = [...alternatives, newAlt]
                setAlternatives(updated)
                // Clear hullClauseId when we have multiple alternatives
                if (updated.length > 1) {
                    try { updateField('hullClauseId', null) } catch {}
                }
            }
        } catch (err: any) {
            showError(err.message || 'Failed to add alternative')
        }
    }

    const removeAlternative = async (altId: string) => {
        if (alternatives.length <= 1) return
        try {
            await window.api.hullDeleteQuotationAlternative(altId)
            const updated = alternatives.filter(a => a.id !== altId)
            setAlternatives(updated)
            // Refresh conditions (some may have been deleted)
            const fresh = await window.api.hullGetQuotationHullConditions(quotation.id)
            setQConditions(Array.isArray(fresh) ? fresh : [])
            const freshAdd = await window.api.hullGetQuotationHullAdditionalConditions(quotation.id)
            setQAdditional(Array.isArray(freshAdd) ? freshAdd : [])
            // If back to single alternative, sync hullClauseId
            if (updated.length === 1) {
                try { updateField('hullClauseId', updated[0].hullClauseId) } catch {}
            }
        } catch (err: any) {
            showError(err.message || 'Failed to remove alternative')
        }
    }

    const changeAlternativeClause = async (altId: string, clauseId: string) => {
        try {
            await window.api.hullUpdateQuotationAlternative(altId, { hullClauseId: clauseId })
            setAlternatives(prev => prev.map(a => a.id === altId ? { ...a, hullClauseId: clauseId } : a))
            // If single alternative, sync to quotation
            if (alternatives.length === 1) {
                try { updateField('hullClauseId', clauseId) } catch {}
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
    qAdditional.forEach(c => {
        if (c.vesselScope) additionalScopes[c.hullAdditionalConditionId] = c.vesselScope
        if (c.textOverride) additionalOverrides[c.hullAdditionalConditionId] = c.textOverride
    })

    const mapAddForSave = (c: QuotationHullAdditionalCondition) => ({
        hullAdditionalConditionId: c.hullAdditionalConditionId,
        textOverride: c.textOverride,
        vesselScope: c.vesselScope,
        alternativeId: c.alternativeId
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
    const multiAlt = alternatives.length > 1

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

    return (
        <div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1rem' }}>Hull Conditions</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: '0 0 16px' }}>
                Select hull clause{multiAlt ? ' alternatives' : ''}, configure clause conditions, and additional conditions.
            </p>

            {/* Alternatives */}
            {alternatives.map((alt, idx) => {
                const clause = hullClauses.find(c => c.id === alt.hullClauseId)
                const clauseConditions = allConditions.filter(c => c.hullClauseId === alt.hullClauseId)
                const altLabel = multiAlt ? `Alternative ${idx + 1}` : (quotation.ivEnabled ? 'Section A — Hull and Machinery' : 'Hull Clause')
                const altColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
                const accentColor = multiAlt ? altColors[idx % altColors.length] : 'transparent'

                return (
                    <div key={alt.id} style={{
                        marginBottom: multiAlt ? '16px' : '0',
                        borderLeft: multiAlt ? `3px solid ${accentColor}` : 'none',
                        paddingLeft: multiAlt ? '16px' : '0',
                        borderRadius: multiAlt ? '2px' : '0'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <div style={{
                                fontSize: multiAlt ? '0.88rem' : '0.78rem',
                                color: multiAlt ? accentColor : 'var(--text-secondary)',
                                fontWeight: 600
                            }}>{altLabel}</div>
                            {multiAlt && clause && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                    {clause.code || clause.name}
                                </span>
                            )}
                            <div style={{ flex: 1 }} />
                            {multiAlt && (
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
                        />

                        {alt.hullClauseId && (
                            <HullConditionPicker
                                label={multiAlt ? `Alternative ${idx + 1} Conditions` : (quotation.ivEnabled ? 'Section A Conditions' : 'Clause Conditions')}
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
                            />
                        )}
                    </div>
                )
            })}

            {/* Add Alternative button */}
            <button
                onClick={addAlternative}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: 'none', border: '1px dashed var(--input-border)',
                    borderRadius: '6px', padding: '6px 12px', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: '0.8rem', marginBottom: '16px'
                }}
            >
                <Plus size={14} /> Add Alternative
            </button>

            {/* IV Clause Selector (only when IV enabled) */}
            {quotation.ivEnabled && ivClauses.length > 0 && (
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
                            />
                        )}
                    </div>
                </>
            )}

            {/* Divider before additional conditions */}
            <div style={{ borderTop: '1px solid var(--table-border)', margin: '8px 0 16px' }} />

            {/* Additional Conditions */}
            <HullConditionPicker
                label="Additional Conditions"
                items={filteredAdditional.map(ac => ({ id: ac.id, label: ac.title || '', text: ac.text }))}
                selectedIds={selectedAddIds}
                onToggle={toggleAdditional}
                overrides={additionalOverrides}
                onOverrideChange={updateAdditionalOverride}
                onOverrideBlur={saveAdditionalOverrides}
                scopes={additionalScopes}
                onScopeChange={updateAdditionalScope}
                vessels={qVessels}
                emptyText="No additional conditions for the selected clause. Add them in Quotation Settings → Hull Additional Conditions."
            />
        </div>
    )
}
