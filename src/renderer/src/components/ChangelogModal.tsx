import React, { useState, useEffect } from 'react'
import { X, ExternalLink, Calendar, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { changelogService, ChangelogEntry } from '../services/ChangelogService'

interface ChangelogModalProps {
    onClose: () => void
}

export default function ChangelogModal({ onClose }: ChangelogModalProps): React.JSX.Element {
    const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedVersion, setExpandedVersion] = useState<string | null>(null)

    useEffect(() => {
        const fetchChangelogs = async () => {
            try {
                setLoading(true)
                const data = await changelogService.getChangelogs()
                setChangelogs(data)
                if (data.length > 0) {
                    setExpandedVersion(data[0].version)
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load changelogs')
            } finally {
                setLoading(false)
            }
        }

        fetchChangelogs()
    }, [])

    // Simple formatter to handle basic markdown-like syntax in GitHub notes
    const formatNotes = (notes: string) => {
        if (!notes) return <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No release notes available.</p>

        return notes.split('\n').map((line, i) => {
            // Headers
            if (line.startsWith('### ')) return <h4 key={i} style={{ marginTop: '16px', marginBottom: '8px', color: 'var(--accent-primary)' }}>{line.replace('### ', '')}</h4>
            if (line.startsWith('## ')) return <h3 key={i} style={{ marginTop: '20px', marginBottom: '10px', color: 'var(--accent-primary)' }}>{line.replace('## ', '')}</h3>

            // List items
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                return (
                    <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '4px', paddingLeft: '8px' }}>
                        <span style={{ color: 'var(--accent-primary)' }}>•</span>
                        <span>{line.trim().substring(2)}</span>
                    </div>
                )
            }

            // Empty lines
            if (!line.trim()) return <div key={i} style={{ height: '8px' }} />

            // Bold text
            const parts = line.split(/(\*\*.*?\*\*)/g)
            return (
                <p key={i} style={{ marginBottom: '6px', lineHeight: '1.5' }}>
                    {parts.map((part, j) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={j}>{part.substring(2, part.length - 2)}</strong>
                        }
                        return part
                    })}
                </p>
            )
        })
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    return (
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
            <div className="modal-content" style={{ maxWidth: '700px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: 'rgba(var(--accent-primary-rgb, 66, 133, 244), 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--accent-primary)'
                        }}>
                            <RefreshCw size={20} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Release History</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>What's new in Vessel Compliance</p>
                        </div>
                    </div>
                    <button className="close-button" onClick={onClose} aria-label="Close modal">
                        <X size={20} />
                    </button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>
                    {loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', opacity: 0.6 }}>
                            <RefreshCw size={32} className="spinning" style={{ marginBottom: '16px' }} />
                            <p>Fetching changelogs from GitHub...</p>
                        </div>
                    )}

                    {error && (
                        <div style={{
                            padding: '24px',
                            borderRadius: '12px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: 'var(--danger)',
                            display: 'flex',
                            gap: '16px',
                            alignItems: 'flex-start'
                        }}>
                            <AlertCircle size={24} style={{ flexShrink: 0 }} />
                            <div>
                                <h3 style={{ margin: '0 0 8px 0', color: 'var(--danger)' }}>Connection Error</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    style={{
                                        marginTop: '16px',
                                        padding: '8px 16px',
                                        borderRadius: '6px',
                                        background: 'var(--danger)',
                                        color: 'white',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    Retry Request
                                </button>
                            </div>
                        </div>
                    )}

                    {!loading && !error && changelogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>
                            No release history found.
                        </div>
                    )}

                    {!loading && !error && changelogs.map((entry) => (
                        <div
                            key={entry.version}
                            style={{
                                marginBottom: '16px',
                                borderRadius: '12px',
                                background: 'var(--glass-bg)',
                                border: '1px solid var(--glass-border)',
                                overflow: 'hidden',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            <div
                                onClick={() => setExpandedVersion(expandedVersion === entry.version ? null : entry.version)}
                                style={{
                                    padding: '16px 20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    background: expandedVersion === entry.version ? 'rgba(255,255,255,0.03)' : 'transparent'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        background: 'var(--accent-primary)',
                                        color: 'white',
                                        fontSize: '0.75rem',
                                        fontWeight: '700',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                                    }}>
                                        {entry.version}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '1rem', fontWeight: '600' }}>{entry.name || `Version ${entry.version}`}</div>
                                        <div style={{ fontSize: '0.75rem', opacity: 0.6, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Calendar size={12} />
                                            {formatDate(entry.date)}
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight
                                    size={18}
                                    style={{
                                        opacity: 0.5,
                                        transform: expandedVersion === entry.version ? 'rotate(90deg)' : 'none',
                                        transition: 'transform 0.2s'
                                    }}
                                />
                            </div>

                            {expandedVersion === entry.version && (
                                <div style={{
                                    padding: '0 20px 20px 20px',
                                    fontSize: '0.9rem',
                                    borderTop: '1px solid var(--glass-border)',
                                    marginTop: '0'
                                }}>
                                    <div style={{ paddingTop: '16px' }}>
                                        {formatNotes(entry.notes)}
                                    </div>
                                    <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px dashed var(--glass-border)' }}>
                                        <a
                                            href={entry.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{
                                                color: 'var(--accent-primary)',
                                                textDecoration: 'none',
                                                fontSize: '0.8rem',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px'
                                            }}
                                            className="hover-underline"
                                        >
                                            View on GitHub <ExternalLink size={12} />
                                        </a>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="modal-footer" style={{ justifyContent: 'center', padding: '16px' }}>
                    <button className="primary-button" onClick={onClose} style={{ minWidth: '120px' }}>
                        Got it
                    </button>
                </div>
            </div>

            <style>{`
        .spinning {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .hover-underline:hover {
          text-decoration: underline;
        }
      `}</style>
        </div>
    )
}
