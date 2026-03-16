import { useState, useEffect } from 'react'
import { Search, Shield, AlertTriangle, Info, Ship, ChevronRight, ChevronDown } from 'lucide-react'
import { SanctionsMatch } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function SanctionsSearch() {
    const { user } = useAuth()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    const [query, setQuery] = useState('')
    const [threshold, setThreshold] = useState(user?.sanctionsThreshold || 60)
    const [sources, setSources] = useState<string[]>(['ofac', 'un', 'eu'])
    const [results, setResults] = useState<SanctionsMatch[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [hasSearched, setHasSearched] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Load user preference on mount/user change
    useEffect(() => {
        if (user?.sanctionsThreshold !== undefined) {
            setThreshold(user.sanctionsThreshold)
        }
    }, [user])

    const handleSearch = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!query.trim()) return

        setIsSearching(true)
        setError(null)
        setHasSearched(true)
        setExpandedId(null)

        try {
            // API expects threshold as 0.0 - 1.0
            const response = await (window.api as any).checkSanctions(query, threshold / 100, sources)

            if (response.status === 'ERROR') {
                setError((response as any).error || 'An error occurred during search')
                setResults([])
            } else {
                // Double check filtering in the frontend for extra safety
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
        // Persist to user settings
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
            case 'un': return '#69db7c'
            default: return '#ffd43b'
        }
    }

    const getScoreColor = (score?: number) => {
        if (!score) return 'var(--text-secondary)'
        if (score >= 0.9) return '#ff6b6b'
        if (score >= 0.7) return '#ffc107'
        return '#00ff88'
    }

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <div style={{ marginBottom: '32px' }}>
                <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'var(--text-primary)' }}>Sanctions Search</h1>
                <p style={{ color: 'var(--text-secondary)', marginTop: '8px' }}>
                    Ad-hoc lookup across global sanctions databases (OFAC, UN, EU).
                </p>
            </div>

            {/* Search Controls */}
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
                        {/* Threshold Slider */}
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

                        {/* Source Filters */}
                        <div style={{ flex: '1 1 300px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', display: 'block', marginBottom: '12px' }}>
                                SANCTIONS LISTS
                            </label>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {['OFAC', 'UN', 'EU'].map(source => (
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

            {/* Errors */}
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

            {/* Results */}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {results.map((match) => (
                    <div
                        key={match.id}
                        className="glass-card"
                        style={{
                            padding: '0',
                            overflow: 'hidden',
                            borderLeft: `4px solid ${getSourceColor(match.source)}`
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
        </div>
    )
}
