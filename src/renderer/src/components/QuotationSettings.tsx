import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Pencil, X, Save, Globe, Shield, AlertTriangle, FileText, BookOpen, Scale, Tag, Image, Calendar } from 'lucide-react'
import { PIClause, PIClauseSet, PIWarranty, PIWarrantyTag, PIDeductible, PIExclusion, PISubLimitTemplate, PIAdditionalClause, TradingExcludedCountry, PISectionTexts, PISanctionsVersion, InstalmentDefaults } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { countryNameToIso3 } from '../utils/countryCodeMap'
import RichTextEditor from './RichTextEditor'

import { StickyNote } from 'lucide-react'

type SettingsTab = 'clauses' | 'warranties' | 'deductibles' | 'exclusions' | 'subLimits' | 'additionalClauses' | 'tradingCountries' | 'sanctionsVersions' | 'standardTexts' | 'instalmentDefaults' | 'logo'

export default function QuotationSettings() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('clauses')
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    const tabs: { id: SettingsTab; label: string; icon: any }[] = [
        { id: 'clauses', label: 'Clauses', icon: <BookOpen size={15} /> },
        { id: 'warranties', label: 'Warranties', icon: <Shield size={15} /> },
        { id: 'deductibles', label: 'Deductibles', icon: <Scale size={15} /> },
        { id: 'exclusions', label: 'Exclusions', icon: <AlertTriangle size={15} /> },
        { id: 'subLimits', label: 'Sub-Limits', icon: <FileText size={15} /> },
        { id: 'additionalClauses', label: 'Addl. Clauses', icon: <FileText size={15} /> },
        { id: 'tradingCountries', label: 'Trading Countries', icon: <Globe size={15} /> },
        { id: 'sanctionsVersions', label: 'Sanctions Versions', icon: <Shield size={15} /> },
        { id: 'standardTexts', label: 'Standard Texts', icon: <StickyNote size={15} /> },
        { id: 'instalmentDefaults', label: 'Instalment Defaults', icon: <Calendar size={15} /> },
        { id: 'logo', label: 'Logo', icon: <Image size={15} /> }
    ]

    return (
        <div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: activeTab === t.id ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                            background: activeTab === t.id ? 'rgba(0, 210, 255, 0.12)' : 'transparent',
                            color: activeTab === t.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
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

            {activeTab === 'clauses' && <ClausesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'warranties' && <WarrantiesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'deductibles' && <DeductiblesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'exclusions' && <ExclusionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'subLimits' && <SubLimitsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'additionalClauses' && <AdditionalClausesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'tradingCountries' && <TradingCountriesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'sanctionsVersions' && <SanctionsVersionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'standardTexts' && <StandardTextsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'instalmentDefaults' && <InstalmentDefaultsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            {activeTab === 'logo' && <LogoTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
        </div>
    )
}

interface TabProps {
    showSuccess: (msg: string) => void
    showError: (msg: string) => void
    isLight: boolean
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
            if (editingSetId) {
                await window.api.piUpdateClauseSet(editingSetId, setName, Array.from(setClauseIds))
                showSuccess('Clause set updated')
            } else {
                await window.api.piAddClauseSet(setName, Array.from(setClauseIds))
                showSuccess('Clause set created')
            }
            setShowSetForm(false); setSetName(''); setSetClauseIds(new Set()); setEditingSetId(null)
            loadData()
        } catch (err: any) { showError(err.message || 'Failed to save set') }
    }

    const startEditSet = (set: PIClauseSet) => {
        setEditingSetId(set.id); setSetName(set.name); setSetClauseIds(new Set(set.clauseIds || [])); setShowSetForm(true)
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
                                                    <button onClick={() => handleDelete(c.id)} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h3 style={{ fontSize: '1rem' }}>Clause Sets (Presets)</h3>
                    <button onClick={() => { setShowSetForm(true); setEditingSetId(null); setSetName(''); setSetClauseIds(new Set()) }} className="btn-primary" style={{ padding: '6px 12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> New Set
                    </button>
                </div>

                {clauseSets.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: showSetForm ? '16px' : '0' }}>
                        {clauseSets.map(s => (
                            <div key={s.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85rem', flex: 1 }}>{s.name}</span>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {(s.clauseIds || []).map(cid => clauses.find(c => c.id === cid)?.clauseNumber).filter(Boolean).sort((a, b) => (a || 0) - (b || 0)).join(', ')}
                                </span>
                                <button onClick={() => startEditSet(s)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={() => handleDeleteSet(s.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>
                )}

                {showSetForm && (
                    <div style={{ padding: '16px', borderRadius: '10px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                        <input type="text" value={setName} onChange={e => setSetName(e.target.value)} placeholder="Set name (e.g., Restricted Cover)" style={{ width: '100%', marginBottom: '12px' }} />
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
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button onClick={() => { setShowSetForm(false); setEditingSetId(null) }} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Cancel</button>
                            <button onClick={handleSaveSet} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }} disabled={!setName.trim() || setClauseIds.size === 0}>
                                {editingSetId ? 'Update Set' : 'Create Set'}
                            </button>
                        </div>
                    </div>
                )}
            </section>
        </div>
    )
}

// ==================== Warranties Tab ====================

function WarrantiesTab({ showSuccess, isLight }: TabProps) {
    const [warranties, setWarranties] = useState<PIWarranty[]>([])
    const [tags, setTags] = useState<PIWarrantyTag[]>([])
    const [newText, setNewText] = useState('')
    const [newDefaultSelected, setNewDefaultSelected] = useState(false)
    const [newTagIds, setNewTagIds] = useState<string[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')
    const [editDefaultSelected, setEditDefaultSelected] = useState(false)
    const [editTagIds, setEditTagIds] = useState<string[]>([])
    // Tag management
    const [newTagName, setNewTagName] = useState('')
    const [editingTagId, setEditingTagId] = useState<string | null>(null)
    const [editTagName, setEditTagName] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        setWarranties(await window.api.piGetWarranties())
        setTags(await window.api.piGetWarrantyTags())
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        await window.api.piAddWarranty({ text: newText, isCargoRelated: false, defaultSelected: newDefaultSelected, tagIds: newTagIds, order: 0 })
        setNewText(''); setNewDefaultSelected(false); setNewTagIds([])
        showSuccess('Warranty added'); loadData()
    }

    const saveEdit = async (id: string) => {
        await window.api.piUpdateWarranty(id, { text: editText, defaultSelected: editDefaultSelected, tagIds: editTagIds })
        setEditingId(null); showSuccess('Warranty updated'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...warranties]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Tag Manager */}
            <section className="glass-card" style={{ padding: '16px' }}>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><Tag size={14} /> Warranty Tags</h4>
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
                                    <button onClick={async () => { await window.api.piDeleteWarrantyTag(tag.id); showSuccess('Tag deleted'); loadData() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isLight ? '#c00' : '#ff4d4d', padding: '0' }}><X size={10} /></button>
                                </>
                            )}
                        </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input value={newTagName} onChange={e => setNewTagName(e.target.value)} placeholder="New tag..." style={{ width: '100px', fontSize: '0.8rem', padding: '4px 8px', borderRadius: '12px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)' }} onKeyDown={e => e.key === 'Enter' && handleAddTag()} />
                        <button onClick={handleAddTag} className="btn-primary" style={{ padding: '3px 8px', fontSize: '0.75rem', borderRadius: '10px' }}><Plus size={12} /></button>
                    </div>
                </div>
            </section>

            {/* Warranties List */}
            <section className="glass-card" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>P&I Warranties</h3>
                <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                    <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Warranty text..." style={{ flex: 1, minHeight: '60px', resize: 'vertical' }} required />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'flex-end' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <input type="checkbox" checked={newDefaultSelected} onChange={e => setNewDefaultSelected(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} /> Default selected
                        </label>
                        {tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {tags.map(t => tagChip(t.id, newTagIds.includes(t.id), () => toggleTagId(t.id, newTagIds, setNewTagIds)))}
                            </div>
                        )}
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                    </div>
                </form>

                {warranties.map((w, i) => (
                    <div key={w.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        {editingId === w.id ? (
                            <div style={{ flex: 1 }}>
                                <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ width: '100%', minHeight: '60px', resize: 'vertical', marginBottom: '8px' }} />
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={editDefaultSelected} onChange={e => setEditDefaultSelected(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} /> Default selected
                                    </label>
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
                                        {(w.tagIds || []).map(tid => {
                                            const tag = tags.find(t => t.id === tid)
                                            return tag ? <span key={tid} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0, 210, 255, 0.12)', color: 'var(--accent-primary)' }}>{tag.name}</span> : null
                                        })}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                    <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                    <button onClick={() => handleMove(i, 'down')} disabled={i === warranties.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === warranties.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                    <button onClick={() => { setEditingId(w.id); setEditText(w.text); setEditDefaultSelected(w.defaultSelected); setEditTagIds(w.tagIds || []) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                    <button onClick={async () => { await window.api.piDeleteWarranty(w.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </section>
        </div>
    )
}

// ==================== Deductibles Tab ====================

function DeductiblesTab({ showSuccess, isLight }: TabProps) {
    const [deductibles, setDeductibles] = useState<PIDeductible[]>([])
    const [newDesc, setNewDesc] = useState('')
    const [newHasSecondary, setNewHasSecondary] = useState(false)
    const [newSecDesc, setNewSecDesc] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editDesc, setEditDesc] = useState('')
    const [editHasSecondary, setEditHasSecondary] = useState(false)
    const [editSecDesc, setEditSecDesc] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setDeductibles(await window.api.piGetDeductibles()) }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newDesc.trim()) return
        await window.api.piAddDeductible({
            description: newDesc, defaultAmount: 0, defaultCurrency: 'USD',
            hasSecondary: newHasSecondary, secondaryDescription: newSecDesc || undefined, order: 0
        })
        setNewDesc(''); setNewHasSecondary(false); setNewSecDesc('')
        showSuccess('Deductible added'); loadData()
    }

    const saveEdit = async (id: string) => {
        await window.api.piUpdateDeductible(id, {
            description: editDesc, hasSecondary: editHasSecondary,
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

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>P&I Deductibles</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Define deductible types here. Amounts are set per quotation.</p>
            <form onSubmit={handleAdd} style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Deductible description..." style={{ flex: 1 }} required />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        <input type="checkbox" checked={newHasSecondary} onChange={e => setNewHasSecondary(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Has secondary
                    </label>
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
                </div>
                {newHasSecondary && (
                    <div style={{ marginTop: '8px' }}>
                        <input type="text" value={newSecDesc} onChange={e => setNewSecDesc(e.target.value)} placeholder="Secondary description (e.g. 'whichever is greater')" style={{ width: '100%' }} />
                    </div>
                )}
            </form>

            {deductibles.map((d, i) => (
                <div key={d.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {editingId === d.id ? (
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} style={{ flex: 1 }} />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editHasSecondary} onChange={e => setEditHasSecondary(e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }} /> Secondary
                                </label>
                                {editHasSecondary && (
                                    <input type="text" value={editSecDesc} onChange={e => setEditSecDesc(e.target.value)} placeholder="Sec. description" style={{ flex: 1 }} />
                                )}
                                <div style={{ flex: 1 }} />
                                <button onClick={() => saveEdit(d.id)} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                                <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1 }}>
                                <span style={{ fontSize: '0.85rem' }}>{d.description}</span>
                                {d.hasSecondary && d.secondaryDescription && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px', paddingLeft: '12px' }}>
                                        Secondary: {d.secondaryDescription}
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === deductibles.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === deductibles.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(d.id); setEditDesc(d.description); setEditHasSecondary(d.hasSecondary); setEditSecDesc(d.secondaryDescription || '') }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteDeductible(d.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </section>
    )
}

// ==================== Exclusions Tab ====================

function ExclusionsTab({ showSuccess, isLight }: TabProps) {
    const [exclusions, setExclusions] = useState<PIExclusion[]>([])
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setExclusions(await window.api.piGetExclusions()) }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        await window.api.piAddExclusion(newText)
        setNewText(''); showSuccess('Exclusion added'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...exclusions]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setExclusions(newOrder)
        await window.api.piReorderExclusions(newOrder.map(e => e.id))
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>P&I Exclusions</h3>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Exclusion text..." style={{ flex: 1, minHeight: '50px', resize: 'vertical' }} required />
                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end' }}><Plus size={16} /> Add</button>
            </form>

            {exclusions.map((ex, i) => (
                <div key={ex.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {editingId === ex.id ? (
                        <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, minHeight: '50px', resize: 'vertical' }} />
                            <button onClick={async () => { await window.api.piUpdateExclusion(ex.id, editText); setEditingId(null); showSuccess('Updated'); loadData() }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{ex.text}</div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === exclusions.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === exclusions.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(ex.id); setEditText(ex.text) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteExclusion(ex.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </section>
    )
}

// ==================== Sub-Limits Tab ====================

function SubLimitsTab({ showSuccess, isLight }: TabProps) {
    const [templates, setTemplates] = useState<PISubLimitTemplate[]>([])
    const [newTemplate, setNewTemplate] = useState('')
    const [newAmount, setNewAmount] = useState('')
    const [newCurrency, setNewCurrency] = useState('USD')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editTemplate, setEditTemplate] = useState('')
    const [editAmount, setEditAmount] = useState('')
    const [editCurrency, setEditCurrency] = useState('USD')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setTemplates(await window.api.piGetSubLimitTemplates()) }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newTemplate.trim()) return
        await window.api.piAddSubLimitTemplate({ textTemplate: newTemplate, defaultAmount: parseFloat(newAmount) || 0, defaultCurrency: newCurrency, order: 0 })
        setNewTemplate(''); setNewAmount(''); setNewCurrency('USD')
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

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Sub-Limit Templates</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Use {'{amount}'} in the template text as a placeholder for the value.</p>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <input type="text" value={newTemplate} onChange={e => setNewTemplate(e.target.value)} placeholder='e.g., Liability for crew sub-limited to maximum {amount} any one accident...' style={{ flex: 1 }} required />
                <input type="text" value={newCurrency} onChange={e => setNewCurrency(e.target.value)} style={{ width: '70px' }} />
                <input type="number" value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="Default" style={{ width: '120px' }} />
                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </form>

            {templates.map((t, i) => (
                <div key={t.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    {editingId === t.id ? (
                        <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <input type="text" value={editTemplate} onChange={e => setEditTemplate(e.target.value)} style={{ flex: 1 }} />
                            <input type="text" value={editCurrency} onChange={e => setEditCurrency(e.target.value)} style={{ width: '70px' }} />
                            <input type="number" value={editAmount} onChange={e => setEditAmount(e.target.value)} style={{ width: '100px' }} />
                            <button onClick={async () => { await window.api.piUpdateSubLimitTemplate(t.id, { textTemplate: editTemplate, defaultAmount: parseFloat(editAmount) || 0, defaultCurrency: editCurrency }); setEditingId(null); showSuccess('Updated'); loadData() }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1, fontSize: '0.85rem' }}>
                                {t.textTemplate.replace('{amount}', `${t.defaultCurrency} ${t.defaultAmount.toLocaleString()}`)}
                            </div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === templates.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === templates.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(t.id); setEditTemplate(t.textTemplate); setEditAmount(String(t.defaultAmount)); setEditCurrency(t.defaultCurrency) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteSubLimitTemplate(t.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </section>
    )
}

// ==================== Additional Clauses Tab ====================

function AdditionalClausesTab({ showSuccess, isLight }: TabProps) {
    const [clauses, setClauses] = useState<PIAdditionalClause[]>([])
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editText, setEditText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setClauses(await window.api.piGetAdditionalClauses()) }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newText.trim()) return
        await window.api.piAddAdditionalClause(newText)
        setNewText(''); showSuccess('Additional clause added'); loadData()
    }

    const handleMove = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...clauses]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
        ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClauses(newOrder)
        await window.api.piReorderAdditionalClauses(newOrder.map(c => c.id))
    }

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '6px' }}>Additional Clauses</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>Extra items appended after the main conditions (e.g., JH/JL clauses, conflict exclusions).</p>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <textarea value={newText} onChange={e => setNewText(e.target.value)} placeholder="Clause text..." style={{ flex: 1, minHeight: '50px', resize: 'vertical' }} required />
                <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-end' }}><Plus size={16} /> Add</button>
            </form>

            {clauses.map((c, i) => (
                <div key={c.id} style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {editingId === c.id ? (
                        <div style={{ flex: 1, display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                            <textarea value={editText} onChange={e => setEditText(e.target.value)} style={{ flex: 1, minHeight: '50px', resize: 'vertical' }} />
                            <button onClick={async () => { await window.api.piUpdateAdditionalClause(c.id, editText); setEditingId(null); showSuccess('Updated'); loadData() }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Save</button>
                            <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>Cancel</button>
                        </div>
                    ) : (
                        <>
                            <div style={{ flex: 1, fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>{c.text}</div>
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexShrink: 0 }}>
                                <button onClick={() => handleMove(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button onClick={() => handleMove(i, 'down')} disabled={i === clauses.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === clauses.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => { setEditingId(c.id); setEditText(c.text) }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem' }}><Pencil size={12} /></button>
                                <button onClick={async () => { await window.api.piDeleteAdditionalClause(c.id); showSuccess('Deleted'); loadData() }} className="btn-secondary" style={{ padding: '4px', fontSize: '0.75rem', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                            </div>
                        </>
                    )}
                </div>
            ))}
        </section>
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
                    <h3 style={{ fontSize: '1rem', marginBottom: '14px', color: isLight ? '#c00000' : '#ff4d4d' }}>Excluded Countries</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Trade with these countries is prohibited.</p>
                    {excluded.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No excluded countries</div>
                    ) : excluded.map(c => (
                        <div key={c.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.iso3Code}</span>
                            <button onClick={() => handleToggleType(c.id, c.listType)} className="btn-secondary" title="Move to DDQ list" style={{ padding: '3px 6px', fontSize: '0.68rem' }}>DDQ</button>
                            <button onClick={async () => { await window.api.piDeleteTradingExcludedCountry(c.id); showSuccess('Removed'); loadData() }} className="btn-secondary" style={{ padding: '3px', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                        </div>
                    ))}
                </section>

                <section className="glass-card" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: '14px', color: isLight ? '#8a6d00' : '#ffc107' }}>DDQ Required Countries</h3>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>Trade requires Due Diligence Questionnaire.</p>
                    {ddq.length === 0 ? (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No DDQ countries</div>
                    ) : ddq.map(c => (
                        <div key={c.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{c.iso3Code}</span>
                            <button onClick={() => handleToggleType(c.id, c.listType)} className="btn-secondary" title="Move to Excluded list" style={{ padding: '3px 6px', fontSize: '0.68rem' }}>Excl.</button>
                            <button onClick={async () => { await window.api.piDeleteTradingExcludedCountry(c.id); showSuccess('Removed'); loadData() }} className="btn-secondary" style={{ padding: '3px', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={12} /></button>
                        </div>
                    ))}
                </section>
            </div>
        </div>
    )
}

// ==================== Sanctions Versions Tab ====================

function SanctionsVersionsTab({ showSuccess, showError, isLight }: TabProps) {
    const [versions, setVersions] = useState<PISanctionsVersion[]>([])
    const [newName, setNewName] = useState('')
    const [newKey, setNewKey] = useState('')
    const [newText, setNewText] = useState('')
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editKey, setEditKey] = useState('')
    const [editText, setEditText] = useState('')
    const [formResetKey, setFormResetKey] = useState(0)

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setVersions(await window.api.piGetSanctionsVersions()) }

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
        setEditingId(v.id); setEditName(v.name); setEditKey(v.key); setEditText(v.text)
    }

    const handleUpdate = async () => {
        if (!editingId || !editName.trim() || !editKey.trim()) return
        try {
            await window.api.piUpdateSanctionsVersion(editingId, { name: editName.trim(), key: editKey.trim(), text: editText.trim() })
            setEditingId(null); showSuccess('Version updated'); loadData()
        } catch (err: any) { showError(err.message || 'Failed to update') }
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
                            <div>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                                    <input value={editName} onChange={e => setEditName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                    <input value={editKey} onChange={e => setEditKey(e.target.value)} style={{ ...inputStyle, width: '160px' }} />
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <RichTextEditor value={editText} onChange={setEditText} minHeight={150} />
                                </div>
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button onClick={handleUpdate} className="btn-primary" style={{ fontSize: '0.78rem' }}><Save size={12} /> Save</button>
                                    <button onClick={() => setEditingId(null)} className="btn-secondary" style={{ fontSize: '0.78rem' }}><X size={12} /> Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v.name}</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', background: 'var(--table-header-bg)', padding: '2px 6px', borderRadius: '4px' }}>{v.key}</span>
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                                        <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} className="btn-secondary" style={{ padding: '3px' }}><ChevronUp size={14} /></button>
                                        <button onClick={() => handleMove(idx, 1)} disabled={idx === versions.length - 1} className="btn-secondary" style={{ padding: '3px' }}><ChevronDown size={14} /></button>
                                        <button onClick={() => startEdit(v)} className="btn-secondary" style={{ padding: '3px' }}><Pencil size={14} /></button>
                                        <button onClick={async () => { if (confirm(`Delete "${v.name}"?`)) { await window.api.piDeleteSanctionsVersion(v.id); setFormResetKey(k => k + 1); showSuccess('Deleted'); loadData() } }} className="btn-secondary" style={{ padding: '3px', color: isLight ? '#c00' : '#ff4d4d' }}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxHeight: '120px', overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: v.text }} />
                            </div>
                        )}
                    </div>
                ))}
            </section>
        </div>
    )
}

// ==================== Standard Texts Tab ====================

export const DEFAULT_SECTION_TEXTS: PISectionTexts = {
    insuredFooter: 'For their respective rights and interests and/or respectively for accounts of whom it may concern.',
    limitOfLiabilityDefaultText: 'The limit of liability of the Insurer under this Policy shall not exceed {amount} {currency} any one vessel any one accident or occurrence and in the aggregate during the policy period, except where otherwise specifically provided.',
    conditionsIntro: 'Al-Bahriah Protection & Indemnity Wording 01.01.2025 covering the following Risks Insured:',
    tradingIntro: 'Subject to Paragraph 2 below, any trade of whatsoever nature with the following countries is excluded.',
    tradingConditions: `Trade with the countries set out in paragraph 1 above is however permitted subject to and provided always that the following express conditions are fully complied with in every respect.

No cargoes to be carried by the vessel are sanctioned cargoes, the insured to provide all such documentary evidence as we may reasonably require to evidence the same including but not limited to Mates' receipts, Bills of Lading etc

No individual or entity listed by any of the US, UK or EU sanctions regimes in respect of the country in question is involved in any way with the vessel, intended trade or cargoes to be carried.

The Insured is to provide a Compliance Screening Questionnaire to us not less than 3 working days in advance of the vessel's entry into the territorial waters of the sanctioned country.

The Insured to provide such further information as we may reasonably require about the intended trade in or with the sanctioned country.

The Insurer may decide in our sole and absolute discretion whether or not the Insurer is prepared to offer cover for the trade with the sanctioned country and, if so, on what terms and conditions.

Cover under this Paragraph 2 to be expressly subject, in any event, to the Sanction Limitation and Exclusion clause contained elsewhere in the Policy, which shall remain paramount.`,
    tradingIsrael: 'Warranted no Israeli trading, involvement, cargo, counterparts whatsoever. A breach of this warranty will automatically void the cover, and discharge Insurer\'s from any liability howsoever arising as from inception of the policy.',
    ddqCountriesIntro: 'Due Diligence Questionnaire required for trading with the following countries:',
    warrantiesBreach: `In the event of any breach of the above warranties the Insurer shall be discharged from all liability from the date of the breach whether or not the breach is material to or in any way connected with the risk or any loss or claim and whether or not the breach is remedied before loss but without prejudice to any liability incurred by the Insurer before that date.

The Insurer may in its sole discretion, but shall not be obliged to:

Cancel cover provided under this Policy by notice in writing to the Insured. Such cancellation shall take effect from the date of such notice, or

Continue the Policy on such terms and conditions as it may determine.`,
    warrantiesNote: 'NOTE: The Insured\'s attention is drawn to the provisions of the P&I Terms and Conditions, which also include Warranties.',
    deductiblesAggregate: 'When one incident gives rise to a claim of a different nature, the aggregate of all claims shall be subject to the highest deductible applicable to anyone such claim.',
    deductiblesVDR: 'In any collision, grounding or other type of casualty the VDR (where fitted) will require to be saved and retrieved for insurers to investigate cause. In the event the VDR is not saved and/or retrieved for whatever reason, in addition to any rights of insurers under the applicable Terms and Conditions, the applicable deductible will be doubled.',
    subjectivitiesIntro: 'The following documents to be provided within 7 days prior inception:',
    subjectivitiesNote: 'NOTE: Failure to supply satisfactory information on any subjectivity may result in this quote being withdrawn and/or cover being cancelled and/or claims being excluded.',
    continuationPiClubText: '',
    premiumPaymentIntro: 'Premium shall be payable in {instalments} Instalments on the following dates, at Noon Lebanon LST, time being of the essence:',
    premiumCondition: 'Compliance with this clause shall be a condition precedent to coverage and/or the Insurer\'s liability under this policy. Any failure to comply shall entitle the Insurer to reject claims whether arising before or after the breach and demand payment of the full premium including all unpaid instalments.',
    premiumEarned: 'Premium deemed earned in full on inception of risk and shall be payable in full notwithstanding any breach by the Insured or any warranty or other provision of the Policy which discharges the Insurer from liability.',
    informationNote: 'Note: Failure to supply information or provide satisfactory information on any subjectivity (above) may result in this quote being withdrawn and / or cover being cancelled at the sole discretion of Underwriters.',
    importantNotice: 'IMPORTANT NOTICE\n\nAttention is drawn to Clause 4 of the Al-Bahriah P&I Terms and Conditions applicable to this Policy which contains terms contracting out of certain provisions of the English Insurance Act 2015 as respects the fair presentation of the risk, the effect of warranties and other terms, the making of fraudulent claims, the duty of good faith and damages for late payment of claims.'
}

const SECTION_TEXT_FIELDS: { key: keyof PISectionTexts; label: string; section: string; rows?: number }[] = [
    { key: 'insuredFooter', label: 'Insured Footer', section: 'Insured', rows: 2 },
    { key: 'limitOfLiabilityDefaultText', label: 'Default Liability Text ({amount}, {currency} placeholders)', section: 'Limit of Liability', rows: 3 },
    { key: 'conditionsIntro', label: 'Conditions Intro', section: 'Conditions', rows: 2 },
    { key: 'tradingIntro', label: 'Trading Intro', section: 'Trading Warranty', rows: 2 },
    { key: 'tradingConditions', label: 'Trading Conditions (numbered paragraphs)', section: 'Trading Warranty', rows: 10 },
    { key: 'tradingIsrael', label: 'Israel Warranty', section: 'Trading Warranty', rows: 3 },
    { key: 'ddqCountriesIntro', label: 'DDQ Countries Intro', section: 'Trading Warranty', rows: 2 },
    { key: 'warrantiesBreach', label: 'Breach of Warranties', section: 'Warranties', rows: 8 },
    { key: 'warrantiesNote', label: 'Warranties Note', section: 'Warranties', rows: 2 },
    { key: 'deductiblesAggregate', label: 'Aggregate Clause', section: 'Deductibles', rows: 2 },
    { key: 'deductiblesVDR', label: 'VDR Clause', section: 'Deductibles', rows: 3 },
    { key: 'subjectivitiesIntro', label: 'Subjectivities Intro', section: 'Subjectivities', rows: 2 },
    { key: 'subjectivitiesNote', label: 'Subjectivities Note', section: 'Subjectivities', rows: 2 },
    { key: 'continuationPiClubText', label: 'Continuation P&I Club Text', section: 'Continuation P&I Club', rows: 3 },
    { key: 'premiumPaymentIntro', label: 'Payment Intro ({instalments} = number)', section: 'Premium', rows: 2 },
    { key: 'premiumCondition', label: 'Payment Condition Precedent', section: 'Premium', rows: 4 },
    { key: 'premiumEarned', label: 'Premium Earned Clause', section: 'Premium', rows: 3 },
    { key: 'informationNote', label: 'Information Note', section: 'Information', rows: 2 },
    { key: 'importantNotice', label: 'Important Notice', section: 'Important Notice', rows: 5 }
]

function StandardTextsTab({ showSuccess }: TabProps) {
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
        showSuccess('Standard texts saved')
    }

    const handleReset = () => {
        setTexts(DEFAULT_SECTION_TEXTS)
    }

    if (!loaded) return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading...</div>

    let currentSection = ''

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

            {SECTION_TEXT_FIELDS.map(field => {
                const showHeader = field.section !== currentSection
                currentSection = field.section
                return (
                    <div key={field.key}>
                        {showHeader && (
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--accent-primary)', marginTop: '16px', marginBottom: '8px', borderBottom: '1px solid var(--table-border)', paddingBottom: '4px' }}>
                                {field.section}
                            </div>
                        )}
                        <div style={{ marginBottom: '12px' }}>
                            <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>{field.label}</label>
                            <RichTextEditor
                                value={texts[field.key] || ''}
                                onChange={val => setTexts(prev => ({ ...prev, [field.key]: val }))}
                                minHeight={Math.max(60, (field.rows || 3) * 22)}
                            />
                        </div>
                    </div>
                )
            })}
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

// ==================== Logo Tab ====================

function LogoTab({ showSuccess }: TabProps) {
    const [logoPath, setLogoPath] = useState<string | null>(null)
    const [loaded, setLoaded] = useState(false)

    useEffect(() => { loadData() }, [])
    const loadData = async () => {
        const path = await window.api.piGetQuotationLogoPath()
        setLogoPath(path)
        setLoaded(true)
    }

    const handleSelect = async () => {
        const result = await window.api.setupSelectConfigFile()
        if (result) {
            await window.api.piSetQuotationLogoPath(result)
            setLogoPath(result)
            showSuccess('Logo path saved')
        }
    }

    const handleClear = async () => {
        await window.api.piSetQuotationLogoPath('')
        setLogoPath(null)
        showSuccess('Logo cleared')
    }

    if (!loaded) return <div style={{ color: 'var(--text-secondary)', padding: '20px' }}>Loading...</div>

    return (
        <section className="glass-card" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '4px' }}>Quotation Logo</h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>Upload a company logo to appear at the top of exported quotations.</p>

            {logoPath && (
                <div style={{ marginBottom: '16px', padding: '12px', borderRadius: '8px', border: '1px solid var(--table-border)', display: 'inline-block' }}>
                    <img src={`safe-file://${logoPath}`} alt="Logo preview" style={{ maxWidth: '300px', maxHeight: '120px', display: 'block' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '6px', wordBreak: 'break-all' }}>{logoPath}</div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={handleSelect} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                    <Image size={14} /> {logoPath ? 'Change Logo' : 'Select Logo'}
                </button>
                {logoPath && (
                    <button onClick={handleClear} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Clear Logo</button>
                )}
            </div>
        </section>
    )
}
