import { useState, useEffect, useCallback } from 'react'
import { Search, Shield, AlertTriangle, Info, Ship, ChevronRight, ChevronDown, Plus, Pencil, Trash2, Upload, X, Users, Settings, FileText } from 'lucide-react'
import { SanctionsMatch } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import SanctionsCheckReport from './SanctionsCheckReport'

interface SicEntry {
    id: number
    name: string
    entity_type: string
    source_id: string | null
    aliases: string[]
    date_of_birth: string | null
    nationality: string | null
    remarks: string | null
    listed_date: string | null
    mother_name: string | null
    father_name: string | null
}

const EMPTY_FORM: Omit<SicEntry, 'id'> = {
    name: '',
    entity_type: 'individual',
    source_id: '',
    aliases: [],
    date_of_birth: '',
    nationality: '',
    remarks: '',
    listed_date: '',
    mother_name: '',
    father_name: ''
}

interface RemarkTemplate {
    label: string
    text: string
}

export default function SanctionsSearch() {
    const { user } = useAuth()
    const { theme } = useTheme()
    const { showSuccess, showError } = useToast()
    const isLight = theme === 'light' || theme === 'aurora'

    const [activeTab, setActiveTab] = useState<'search' | 'sic' | 'report'>('search')

    // Search state
    const [query, setQuery] = useState('')
    const [threshold, setThreshold] = useState(user?.sanctionsThreshold || 60)
    const [sources, setSources] = useState<string[]>(['ofac', 'un', 'eu', 'uk', 'isf', 'sic'])
    const [results, setResults] = useState<SanctionsMatch[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // SIC state
    const [sicEntries, setSicEntries] = useState<SicEntry[]>([])
    const [sicSearch, setSicSearch] = useState('')
    const [sicLoading, setSicLoading] = useState(false)
    const [showSicModal, setShowSicModal] = useState(false)
    const [editingSic, setEditingSic] = useState<SicEntry | null>(null)
    const [sicForm, setSicForm] = useState<Omit<SicEntry, 'id'>>(EMPTY_FORM)
    const [aliasInput, setAliasInput] = useState('')
    const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
    const [remarkTemplates, setRemarkTemplates] = useState<RemarkTemplate[]>([])
    const [showTemplateManager, setShowTemplateManager] = useState(false)
    const [templateForm, setTemplateForm] = useState<RemarkTemplate>({ label: '', text: '' })
    const [editingTemplateIdx, setEditingTemplateIdx] = useState<number | null>(null)

    useEffect(() => {
        if (user?.sanctionsThreshold !== undefined) {
            setThreshold(user.sanctionsThreshold)
        }
    }, [user])

    const loadRemarkTemplates = useCallback(async () => {
        try {
            const templates = await (window.api as any).sicGetRemarkTemplates()
            setRemarkTemplates(Array.isArray(templates) ? templates : [])
        } catch { /* ignore */ }
    }, [])

    const loadSicEntries = useCallback(async () => {
        setSicLoading(true)
        try {
            const entries = await (window.api as any).sicGetEntities()
            setSicEntries(Array.isArray(entries) ? entries : [])
        } catch { /* ignore */ }
        setSicLoading(false)
    }, [])

    useEffect(() => {
        loadRemarkTemplates()
    }, [loadRemarkTemplates])

    useEffect(() => {
        if (activeTab === 'sic') loadSicEntries()
    }, [activeTab, loadSicEntries])

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!query.trim()) return

        setIsSearching(true)
        setError(null)
        setHasSearched(true)
        setExpandedId(null)

        try {
            const response = await (window.api as any).checkSanctions(query, threshold / 100, sources)

            if (response.status === 'ERROR') {
                setError((response as any).error || 'An error occurred during search')
                setResults([])
            } else {
                const filteredMatches = (response.matches || []).filter(
                    (m: SanctionsMatch) => Math.round((m.score || 0) * 100) >= threshold
                )
                setResults(filteredMatches)
            }
        } catch (err: any) {
            setError(err.message || 'Failed to connect to sanctions service')
        } finally {
            setIsSearching(false)
        }
    }

    const handleThresholdChange = (newThreshold: number) => {
        setThreshold(newThreshold)
        if (user) {
            (window.api as any).updateSanctionsThreshold(newThreshold)
        }
    }

    const toggleSource = (source: string) => {
        setSources(prev =>
            prev.includes(source)
                ? prev.filter(s => s !== source)
                : [...prev, source]
        )
    }

    const getSourceColor = (source: string) => {
        switch (source.toLowerCase()) {
            case 'ofac': return '#ff6b6b'
            case 'eu': return '#4dabf7'
            case 'uk': return '#ff922b'
            case 'un': return '#69db7c'
            case 'isf': return '#e599f7'
            case 'sic': return '#ffd43b'
            default: return '#ffd43b'
        }
    }

    const getScoreColor = (score?: number) => {
        if (!score) return 'var(--text-secondary)'
        if (score >= 0.9) return '#ff6b6b'
        if (score >= 0.7) return '#ffc107'
        return '#00ff88'
    }

    // SIC handlers
    const openAddSic = () => {
        setEditingSic(null)
        setSicForm({ ...EMPTY_FORM })
        setAliasInput('')
        setShowSicModal(true)
    }

    const openEditSic = (entry: SicEntry) => {
        setEditingSic(entry)
        setSicForm({
            name: entry.name,
            entity_type: entry.entity_type || 'individual',
            source_id: entry.source_id || '',
            aliases: entry.aliases || [],
            date_of_birth: entry.date_of_birth || '',
            nationality: entry.nationality || '',
            remarks: entry.remarks || '',
            listed_date: entry.listed_date || '',
            mother_name: entry.mother_name || '',
            father_name: entry.father_name || ''
        })
        setAliasInput('')
        setShowSicModal(true)
    }

    const handleSaveSic = async () => {
        if (!sicForm.name.trim()) return
        try {
            const payload = {
                name: sicForm.name.trim(),
                entityType: sicForm.entity_type,
                sourceId: sicForm.source_id || null,
                aliases: sicForm.aliases,
                dateOfBirth: sicForm.date_of_birth || null,
                nationality: sicForm.nationality || null,
                remarks: sicForm.remarks || null,
                listedDate: sicForm.listed_date || null,
                motherName: sicForm.mother_name || null,
                fatherName: sicForm.father_name || null
            }
            if (editingSic) {
                await (window.api as any).sicUpdateEntity(editingSic.id, payload)
                showSuccess('SIC entry updated')
            } else {
                await (window.api as any).sicAddEntity(payload)
                showSuccess('SIC entry added')
            }
            setShowSicModal(false)
            loadSicEntries()
        } catch (err: any) {
            showError(err.message || 'Failed to save')
        }
    }

    const handleDeleteSic = async (id: number) => {
        try {
            await (window.api as any).sicDeleteEntity(id)
            showSuccess('SIC entry deleted')
            setDeleteConfirm(null)
            loadSicEntries()
        } catch (err: any) {
            showError(err.message || 'Failed to delete')
        }
    }

    const handleImportSic = async () => {
        try {
            const filePath = await window.api.dialogOpenFile()
            if (!filePath) return
            const importResult = await (window.api as any).sicImport(filePath)
            showSuccess(`Imported ${importResult.count} SIC entries`)
            loadSicEntries()
        } catch (err: any) {
            showError(err.message || 'Import failed')
        }
    }

    const addAlias = () => {
        const a = aliasInput.trim()
        if (!a || sicForm.aliases.includes(a)) return
        setSicForm(prev => ({ ...prev, aliases: [...prev.aliases, a] }))
        setAliasInput('')
    }

    const removeAlias = (idx: number) => {
        setSicForm(prev => ({ ...prev, aliases: prev.aliases.filter((_, i) => i !== idx) }))
    }

    const openTemplateManager = () => {
        setEditingTemplateIdx(null)
        setTemplateForm({ label: '', text: '' })
        setShowTemplateManager(true)
    }

    const startEditTemplate = (t: RemarkTemplate, idx: number) => {
        setEditingTemplateIdx(idx)
        setTemplateForm({ label: t.label, text: t.text })
    }

    const saveTemplate = async () => {
        if (!templateForm.label.trim() || !templateForm.text.trim()) return
        const updated = [...remarkTemplates]
        if (editingTemplateIdx !== null) {
            updated[editingTemplateIdx] = { ...templateForm }
        } else {
            updated.push({ ...templateForm })
        }
        try {
            await (window.api as any).sicSetRemarkTemplates(updated)
            setRemarkTemplates(updated)
            setEditingTemplateIdx(null)
            setTemplateForm({ label: '', text: '' })
            showSuccess(editingTemplateIdx !== null ? 'Template updated' : 'Template added')
        } catch (err: any) {
            showError(err.message || 'Failed to save')
        }
    }

    const deleteTemplate = async (idx: number) => {
        const updated = remarkTemplates.filter((_, i) => i !== idx)
        try {
            await (window.api as any).sicSetRemarkTemplates(updated)
            setRemarkTemplates(updated)
            if (editingTemplateIdx === idx) {
                setEditingTemplateIdx(null)
                setTemplateForm({ label: '', text: '' })
            }
            showSuccess('Template deleted')
        } catch (err: any) {
            showError(err.message || 'Failed to delete')
        }
    }

    const filteredSic = sicEntries.filter(e => {
        if (!sicSearch) return true
        const q = sicSearch.toLowerCase()
        return (
            e.name.toLowerCase().includes(q) ||
            (e.nationality || '').toLowerCase().includes(q) ||
            (e.mother_name || '').toLowerCase().includes(q) ||
            (e.father_name || '').toLowerCase().includes(q) ||
            (e.source_id || '').toLowerCase().includes(q) ||
            (e.aliases || []).some(a => a.toLowerCase().includes(q))
        )
    })

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        fontSize: '0.88rem',
        borderRadius: '8px',
        border: '1px solid var(--input-border)',
        background: 'var(--input-bg)',
        color: 'var(--text-primary)'
    }

    const labelStyle: React.CSSProperties = {
        fontSize: '0.75rem',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.5px',
        marginBottom: '4px',
        display: 'block'
    }

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-primary)' }}>Sanctions Search</h1>
                    <p style={{ color: 'var(--text-secondary)', marginTop: '8px', marginBottom: 0 }}>
                        Ad-hoc lookup across global sanctions databases and local SIC list.
                    </p>
                </div>
            </div>

            {/* Tab bar */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0' }}>
                {[
                    { key: 'search' as const, label: 'Search', icon: <Search size={15} /> },
                    { key: 'sic' as const, label: 'SIC List', icon: <Users size={15} /> },
                    { key: 'report' as const, label: 'Check Report', icon: <FileText size={15} /> }
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 20px',
                            border: 'none',
                            borderBottom: activeTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                            background: 'none',
                            color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            fontWeight: activeTab === tab.key ? 700 : 500,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        {tab.icon} {tab.label}
                        {tab.key === 'sic' && sicEntries.length > 0 && (
                            <span style={{
                                fontSize: '0.7rem', fontWeight: 700, padding: '1px 7px', borderRadius: '10px',
                                background: '#ffd43b22', color: '#ffd43b'
                            }}>
                                {sicEntries.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* ============ SEARCH TAB ============ */}
            {activeTab === 'search' && (
                <>
            <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
                <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                            <Search
                                size={20}
                                style={{
                                    position: 'absolute',
                                    left: '14px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--text-secondary)'
                                }}
                            />
                            <input
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name, entity, or vessel..."
                                style={{
                                    width: '100%',
                                    padding: '12px 12px 12px 48px',
                                    fontSize: '1rem'
                                }}
                                aria-label="Entity name search"
                            />
                        </div>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isSearching || !query.trim()}
                            style={{ padding: '0 32px' }}
                        >
                            {isSearching ? 'Searching...' : 'Search'}
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 300px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)' }}>
                                    MINIMUM MATCH THRESHOLD
                                </label>
                                <span style={{ fontSize: '0.85rem', fontWeight: '700', color: getScoreColor(threshold / 100) }}>
                                    {threshold}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min="10"
                                max="95"
                                step="5"
                                value={threshold}
                                onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
                                style={{ width: '100%', height: '6px', cursor: 'pointer' }}
                                aria-label="Minimum match threshold"
                            />
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                <span>Broader (10%)</span>
                                <span>Exact (95%)</span>
                            </div>
                        </div>

                        <div style={{ flex: '1 1 300px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px' }}>
                                SANCTIONS LISTS
                            </label>
                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {['OFAC', 'UN', 'EU', 'UK', 'ISF', 'SIC'].map(source => (
                                    <button
                                        key={source}
                                        type="button"
                                        onClick={() => toggleSource(source.toLowerCase())}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '8px',
                                            border: `1px solid ${sources.includes(source.toLowerCase()) ? getSourceColor(source) : 'var(--input-border)'}`,
                                            background: sources.includes(source.toLowerCase()) ? `${getSourceColor(source)}15` : 'transparent',
                                            color: sources.includes(source.toLowerCase()) ? getSourceColor(source) : 'var(--text-secondary)',
                                            fontSize: '0.8rem',
                                            fontWeight: '600',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        {source}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </form>
            </div>

            {error && (
                <div role="alert" aria-live="polite" style={{
                    padding: '16px',
                    background: 'rgba(255, 77, 77, 0.1)',
                    border: '1px solid rgba(255, 77, 77, 0.3)',
                    borderRadius: '12px',
                    color: 'var(--danger)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    marginBottom: '24px'
                }}>
                    <AlertTriangle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {!isSearching && hasSearched && results.length === 0 && !error && (
                <div style={{ textAlign: 'center', padding: '64px 24px' }}>
                    <Shield size={48} style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '16px' }} />
                    <h3>No matches found</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>No entities in the selected databases exceeded the {threshold}% threshold.</p>
                </div>
            )}

            {!hasSearched && (
                <div style={{ textAlign: 'center', padding: '64px 24px', opacity: 0.5 }}>
                    <Info size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
                    <h3>Enter a name to begin</h3>
                    <p style={{ color: 'var(--text-secondary)' }}>Search results will appear here with detailed match information.</p>
                </div>
            )}

            {results.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{results.length} result{results.length !== 1 ? 's' : ''}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>—</span>
                    {Object.entries(results.reduce((acc, m) => { const t = m.target_type || 'Unknown'; acc[t] = (acc[t] || 0) + 1; return acc }, {} as Record<string, number>)).map(([type, count]) => (
                        <span key={type} style={{
                            fontSize: '0.78rem', padding: '3px 10px', borderRadius: '12px',
                            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                            color: 'var(--text-secondary)'
                        }}>
                            {type}: {count}
                        </span>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {(() => {
                    const groups: Record<string, SanctionsMatch[]> = {}
                    for (const m of results) {
                        const type = m.target_type || 'Unknown'
                        if (!groups[type]) groups[type] = []
                        groups[type].push(m)
                    }
                    const typeOrder = ['Individual', 'Entity', 'Vessel', 'Aircraft']
                    const sortedTypes = Object.keys(groups).sort((a, b) => {
                        const ia = typeOrder.indexOf(a)
                        const ib = typeOrder.indexOf(b)
                        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
                    })
                    const typeIcons: Record<string, string> = { Individual: '👤', Entity: '🏢', Vessel: '🚢', Aircraft: '✈️' }
                    const typeColors: Record<string, string> = { Individual: '#ffa726', Entity: '#42a5f5', Vessel: '#26c6da', Aircraft: '#ab47bc' }

                    return sortedTypes.map(type => (
                        <div key={type}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                padding: '10px 4px', marginTop: '8px', marginBottom: '4px',
                                borderBottom: `2px solid ${typeColors[type] || 'var(--table-border)'}`,
                            }}>
                                <span style={{ fontSize: '1.1rem' }}>{typeIcons[type] || '📋'}</span>
                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: typeColors[type] || 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {type}
                                </span>
                                <span style={{
                                    fontSize: '0.72rem', fontWeight: 600,
                                    padding: '2px 8px', borderRadius: '10px',
                                    background: `${typeColors[type] || 'var(--accent-primary)'}18`,
                                    color: typeColors[type] || 'var(--text-secondary)'
                                }}>
                                    {groups[type].length}
                                </span>
                            </div>
                            {groups[type].map((match) => (
                    <div
                        key={match.id}
                        className="glass-card"
                        style={{
                            padding: '0',
                            overflow: 'hidden',
                            borderLeft: `4px solid ${getSourceColor(match.source)}`,
                            marginBottom: '12px'
                        }}
                    >
                        <div
                            style={{
                                padding: '20px 24px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '20px',
                                cursor: 'pointer'
                            }}
                            onClick={() => setExpandedId(expandedId === match.id ? null : match.id)}
                        >
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                                        {match.names[0]}
                                    </span>
                                    <span style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        background: `${getSourceColor(match.source)}20`,
                                        color: getSourceColor(match.source),
                                        fontSize: '0.65rem',
                                        fontWeight: '800',
                                        textTransform: 'uppercase'
                                    }}>
                                        {match.source}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Shield size={14} /> {match.target_type}
                                    </span>
                                    {match.imo_number && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4dabf7', fontWeight: 'bold' }}>
                                            <Ship size={14} /> IMO: {match.imo_number}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                                <div style={{
                                    fontSize: '1.2rem',
                                    fontWeight: '800',
                                    color: getScoreColor(match.score)
                                }}>
                                    {Math.round((match.score || 0) * 100)}%
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                    MATCH SCORE
                                </div>
                            </div>

                            {expandedId === match.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        </div>

                        {expandedId === match.id && (
                            <div style={{
                                padding: '0 24px 24px',
                                borderTop: '1px solid var(--glass-border)',
                                background: isLight ? 'rgba(0, 0, 0, 0.02)' : 'rgba(255, 255, 255, 0.02)'
                            }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '20px' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                            ALIASES & KNOWN NAMES
                                        </h4>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                            {match.names.map((n, i) => (
                                                <span key={i} style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    background: 'var(--input-bg)',
                                                    fontSize: '0.8rem'
                                                }}>
                                                    {n}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 style={{ margin: '0 0 12px 0', fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                            DETAILS & REMARKS
                                        </h4>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                                            {match.remarks || 'No additional remarks provided.'}
                                        </p>
                                        {match.source_id && (
                                            <div style={{ marginTop: '12px', fontSize: '0.8rem' }}>
                                                <span style={{ color: 'var(--text-secondary)' }}>Source ID: </span>
                                                <code style={{ color: 'var(--text-primary)' }}>{match.source_id}</code>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                        </div>
                    ))
                })()}
            </div>
                </>
            )}

            {/* ============ SIC LIST TAB ============ */}
            {activeTab === 'sic' && (
                <div>
                    {/* Toolbar */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                            <input
                                type="text"
                                value={sicSearch}
                                onChange={e => setSicSearch(e.target.value)}
                                placeholder="Search SIC entries..."
                                style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '0.88rem' }}
                            />
                        </div>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {filteredSic.length} of {sicEntries.length} entries
                        </span>
                        <button className="btn-secondary" onClick={openTemplateManager} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}>
                            <Settings size={14} /> Templates
                        </button>
                        <button className="btn-secondary" onClick={handleImportSic} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}>
                            <Upload size={14} /> Import Excel
                        </button>
                        <button className="btn-primary" onClick={openAddSic} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}>
                            <Plus size={14} /> Add Entry
                        </button>
                    </div>

                    {/* Table */}
                    {sicLoading ? (
                        <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>Loading...</div>
                    ) : filteredSic.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '64px 24px', opacity: 0.5 }}>
                            <Users size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
                            <h3>{sicEntries.length === 0 ? 'No SIC entries yet' : 'No matching entries'}</h3>
                            <p style={{ color: 'var(--text-secondary)' }}>
                                {sicEntries.length === 0 ? 'Import from an Excel file or add entries manually.' : 'Try a different search term.'}
                            </p>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Name</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Father</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Mother</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Nationality</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>DOB</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Date</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>SIC Ref</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px', width: '80px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSic.map(entry => (
                                        <tr key={entry.id} style={{ borderTop: '1px solid var(--glass-border)' }}>
                                            <td style={{ padding: '10px 14px', fontWeight: 600, fontSize: '0.88rem' }}>
                                                {entry.name}
                                                {entry.aliases && entry.aliases.length > 0 && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                                                        aka: {entry.aliases.join(', ')}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{entry.father_name || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{entry.mother_name || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{entry.nationality || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{entry.date_of_birth || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{entry.listed_date || '—'}</td>
                                            <td style={{ padding: '10px 14px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{entry.source_id || '—'}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => openEditSic(entry)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }}
                                                        title="Edit"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    {deleteConfirm === entry.id ? (
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                onClick={() => handleDeleteSic(entry.id)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px', fontSize: '0.7rem', fontWeight: 700 }}
                                                            >
                                                                Confirm
                                                            </button>
                                                            <button
                                                                onClick={() => setDeleteConfirm(null)}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', fontSize: '0.7rem' }}
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => setDeleteConfirm(entry.id)}
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={15} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ============ SIC MODAL ============ */}
            {showSicModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1a1d28',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '560px',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        border: '1px solid var(--glass-border)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{editingSic ? 'Edit SIC Entry' : 'Add SIC Entry'}</h2>
                            <button onClick={() => setShowSicModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={labelStyle}>Full Name *</label>
                                <input value={sicForm.name} onChange={e => setSicForm(p => ({ ...p, name: e.target.value }))} style={inputStyle} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Father&apos;s Name</label>
                                    <input value={sicForm.father_name || ''} onChange={e => setSicForm(p => ({ ...p, father_name: e.target.value }))} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Mother&apos;s Name</label>
                                    <input value={sicForm.mother_name || ''} onChange={e => setSicForm(p => ({ ...p, mother_name: e.target.value }))} style={inputStyle} />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Nationality</label>
                                    <input value={sicForm.nationality || ''} onChange={e => setSicForm(p => ({ ...p, nationality: e.target.value }))} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Date of Birth</label>
                                    <input value={sicForm.date_of_birth || ''} onChange={e => setSicForm(p => ({ ...p, date_of_birth: e.target.value }))} style={inputStyle} placeholder="e.g. 1985 or 1985-03-15" />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={labelStyle}>Date Added</label>
                                    <input type="date" value={sicForm.listed_date || ''} onChange={e => setSicForm(p => ({ ...p, listed_date: e.target.value }))} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>SIC Reference</label>
                                    <input value={sicForm.source_id || ''} onChange={e => setSicForm(p => ({ ...p, source_id: e.target.value }))} style={inputStyle} placeholder="e.g. SIC Ref 1149/26/9446" />
                                </div>
                            </div>

                            <div>
                                <label style={labelStyle}>Type</label>
                                <select value={sicForm.entity_type} onChange={e => setSicForm(p => ({ ...p, entity_type: e.target.value }))} style={inputStyle}>
                                    <option value="individual">Individual</option>
                                    <option value="entity">Entity / Organization</option>
                                    <option value="vessel">Vessel</option>
                                </select>
                            </div>

                            <div>
                                <label style={labelStyle}>Aliases</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input
                                        value={aliasInput}
                                        onChange={e => setAliasInput(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                                        placeholder="Add alias and press Enter"
                                        style={{ ...inputStyle, flex: 1 }}
                                    />
                                    <button className="btn-secondary" onClick={addAlias} style={{ padding: '8px 12px', fontSize: '0.8rem' }}>Add</button>
                                </div>
                                {sicForm.aliases.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                        {sicForm.aliases.map((a, i) => (
                                            <span key={i} style={{
                                                padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem',
                                                background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                                                display: 'flex', alignItems: 'center', gap: '4px'
                                            }}>
                                                {a}
                                                <button onClick={() => removeAlias(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, lineHeight: 1 }}>
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={labelStyle}>Remarks / Subject</label>
                                    <button type="button" onClick={() => { setShowSicModal(false); openTemplateManager() }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', fontSize: '0.7rem', fontWeight: 600, padding: 0 }}>
                                        Manage Templates
                                    </button>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                    {remarkTemplates.map((t, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => setSicForm(p => ({ ...p, remarks: t.text }))}
                                            style={{
                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600,
                                                border: `1px solid ${sicForm.remarks === t.text ? 'var(--accent-primary)' : 'var(--input-border)'}`,
                                                background: sicForm.remarks === t.text ? 'rgba(0,170,200,0.1)' : 'transparent',
                                                color: sicForm.remarks === t.text ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                cursor: 'pointer', transition: 'all 0.15s'
                                            }}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <textarea
                                    value={sicForm.remarks || ''}
                                    onChange={e => setSicForm(p => ({ ...p, remarks: e.target.value }))}
                                    style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }}
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <button className="btn-secondary" onClick={() => setShowSicModal(false)} style={{ padding: '8px 20px', fontSize: '0.85rem' }}>Cancel</button>
                            <button className="btn-primary" onClick={handleSaveSic} disabled={!sicForm.name.trim()} style={{ padding: '8px 20px', fontSize: '0.85rem' }}>
                                {editingSic ? 'Save Changes' : 'Add Entry'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ TEMPLATE MANAGER MODAL ============ */}
            {showTemplateManager && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1a1d28',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '620px',
                        maxHeight: '85vh',
                        overflowY: 'auto',
                        border: '1px solid var(--glass-border)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Remark Templates</h2>
                            <button onClick={() => setShowTemplateManager(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Existing templates */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                            {remarkTemplates.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    No templates yet. Add one below.
                                </div>
                            )}
                            {remarkTemplates.map((t, idx) => (
                                <div key={idx} style={{
                                    padding: '12px 14px', borderRadius: '10px',
                                    border: editingTemplateIdx === idx ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                                    background: editingTemplateIdx === idx ? (isLight ? 'rgba(0,170,200,0.04)' : 'rgba(0,170,200,0.06)') : 'transparent'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.label}</span>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                                onClick={() => startEditTemplate(t, idx)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }}
                                                title="Edit"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => deleteTemplate(idx)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                                title="Delete"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.4, whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'hidden' }}>
                                        {t.text}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Add / Edit form */}
                        <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
                            <h4 style={{ margin: '0 0 12px', fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {editingTemplateIdx !== null ? 'Edit Template' : 'Add Template'}
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div>
                                    <label style={labelStyle}>Label</label>
                                    <input
                                        value={templateForm.label}
                                        onChange={e => setTemplateForm(p => ({ ...p, label: e.target.value }))}
                                        placeholder="Short name for the template"
                                        style={inputStyle}
                                    />
                                </div>
                                <div>
                                    <label style={labelStyle}>Text</label>
                                    <textarea
                                        value={templateForm.text}
                                        onChange={e => setTemplateForm(p => ({ ...p, text: e.target.value }))}
                                        placeholder="Full remark text..."
                                        style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                                        rows={3}
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        className="btn-primary"
                                        onClick={saveTemplate}
                                        disabled={!templateForm.label.trim() || !templateForm.text.trim()}
                                        style={{ padding: '7px 16px', fontSize: '0.82rem' }}
                                    >
                                        {editingTemplateIdx !== null ? 'Save Changes' : 'Add Template'}
                                    </button>
                                    {editingTemplateIdx !== null && (
                                        <button
                                            className="btn-secondary"
                                            onClick={() => { setEditingTemplateIdx(null); setTemplateForm({ label: '', text: '' }) }}
                                            style={{ padding: '7px 16px', fontSize: '0.82rem' }}
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ============ CHECK REPORT TAB ============ */}
            {activeTab === 'report' && <SanctionsCheckReport />}
        </div>
    )
}
