import React, { useState, useEffect } from 'react'
import { ExternalLink, Calendar, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react'
import { changelogService, ChangelogEntry } from '../services/ChangelogService'
import { formatDateLong } from '../utils/dateUtils'
import { Modal } from './ui'

interface ChangelogModalProps {
  onClose: () => void
}

export default function ChangelogModal({ onClose }: ChangelogModalProps): React.JSX.Element {
  const [changelogs, setChangelogs] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const fetchChangelogs = async (): Promise<void> => {
      try {
        setLoading(true)
        const data = await changelogService.getChangelogs()
        setChangelogs(data)
        if (data.length > 0) {
          setExpandedVersion(data[0].version)
        }
      } catch (err) {
        setError((err instanceof Error ? err.message : '') || 'Failed to load changelogs')
      } finally {
        setLoading(false)
      }
    }

    fetchChangelogs()
  }, [reloadKey])

  // Simple formatter to handle basic markdown-like syntax in GitHub notes
  const formatNotes = (notes: string): React.ReactNode => {
    if (!notes)
      return <p style={{ opacity: 0.5, fontStyle: 'italic' }}>No release notes available.</p>

    return notes.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('### '))
        return (
          <h4
            key={i}
            style={{ marginTop: '16px', marginBottom: '8px', color: 'var(--accent-primary)' }}
          >
            {line.replace('### ', '')}
          </h4>
        )
      if (line.startsWith('## '))
        return (
          <h3
            key={i}
            style={{ marginTop: '20px', marginBottom: '10px', color: 'var(--accent-primary)' }}
          >
            {line.replace('## ', '')}
          </h3>
        )

      // List items
      if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
        return (
          <div
            key={i}
            style={{ display: 'flex', gap: '8px', marginBottom: '4px', paddingLeft: '8px' }}
          >
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

  const formatChangelogDate = (dateStr: string): string => {
    return formatDateLong(dateStr)
  }

  return (
    <Modal
      title="Release history"
      icon={<RefreshCw size={18} />}
      onClose={onClose}
      width={700}
      footer={
        <button className="btn-primary" onClick={onClose} style={{ minWidth: '120px' }}>
          Got it
        </button>
      }
    >
      <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
        What&apos;s new in Vessel Compliance
      </p>
      <div>
        {loading && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 0',
              opacity: 0.6
            }}
          >
            <RefreshCw size={32} className="spinning" style={{ marginBottom: '16px' }} />
            <p>Fetching changelogs from GitHub...</p>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '24px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--danger)',
              display: 'flex',
              gap: '16px',
              alignItems: 'flex-start'
            }}
          >
            <AlertCircle size={24} style={{ flexShrink: 0 }} />
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: 'var(--danger)' }}>Connection Error</h3>
              <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.9 }}>{error}</p>
              <button
                className="btn-danger btn-sm"
                onClick={() => {
                  setError(null)
                  setReloadKey((k) => k + 1)
                }}
                style={{ marginTop: '16px' }}
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

        {!loading &&
          !error &&
          changelogs.map((entry) => (
            <div
              key={entry.version}
              style={{
                marginBottom: '16px',
                borderRadius: '12px',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border-color)',
                overflow: 'hidden',
                transition: 'all 0.2s ease'
              }}
            >
              <div
                onClick={() =>
                  setExpandedVersion(expandedVersion === entry.version ? null : entry.version)
                }
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: expandedVersion === entry.version ? 'var(--row-hover)' : 'transparent'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div
                    style={{
                      padding: '4px 10px',
                      borderRadius: '20px',
                      background: 'var(--accent-primary)',
                      color: 'white',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                    }}
                  >
                    {entry.version}
                  </div>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: '600' }}>
                      {entry.name || `Version ${entry.version}`}
                    </div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        opacity: 0.6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <Calendar size={12} />
                      {formatChangelogDate(entry.date)}
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
                <div
                  style={{
                    padding: '0 20px 20px 20px',
                    fontSize: '0.9rem',
                    borderTop: '1px solid var(--glass-border-color)',
                    marginTop: '0'
                  }}
                >
                  <div style={{ paddingTop: '16px' }}>{formatNotes(entry.notes)}</div>
                  <div
                    style={{
                      marginTop: '20px',
                      paddingTop: '12px',
                      borderTop: '1px dashed var(--glass-border-color)'
                    }}
                  >
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

      <style>{`
        .hover-underline:hover {
          text-decoration: underline;
        }
      `}</style>
    </Modal>
  )
}
