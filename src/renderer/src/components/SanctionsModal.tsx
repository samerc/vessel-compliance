import { useEffect, useRef } from 'react'
import { X, AlertTriangle, Shield, ShieldCheck, ShieldAlert } from 'lucide-react'
import { SanctionsMatch } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { formatDate } from '../utils/dateUtils'

interface SanctionsModalProps {
  searchedName: string
  matches: SanctionsMatch[]
  onClose: () => void
  onMarkClean: () => void
  onConfirmMatch: () => void
}

export default function SanctionsModal({ searchedName, matches, onClose, onMarkClean, onConfirmMatch }: SanctionsModalProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const getSourceLabel = (source: string) => {
    switch (source.toLowerCase()) {
      case 'ofac': return 'OFAC (US)'
      case 'eu': return 'EU Sanctions'
      case 'un': return 'UN Sanctions'
      default: return source.toUpperCase()
    }
  }

  const getSourceColor = (source: string) => {
    switch (source.toLowerCase()) {
      case 'ofac': return '#ff6b6b'
      case 'eu': return '#4dabf7'
      case 'un': return '#69db7c'
      default: return '#ffd43b'
    }
  }

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sanctions-modal-title"
        className="glass-card"
        style={{
          width: '90%',
          maxWidth: '700px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: isLight ? '#ffffff' : 'rgba(30, 30, 40, 0.95)',
          color: isLight ? '#1a1a1a' : '#ffffff',
          boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.2)' : '0 10px 40px rgba(0,0,0,0.5)',
          border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: isLight ? '#fff8e1' : 'rgba(255, 193, 7, 0.1)'
          }}
        >
          <AlertTriangle size={24} color="#ffc107" />
          <div style={{ flex: 1 }}>
            <h2 id="sanctions-modal-title" style={{ margin: 0, fontSize: '1.25rem', color: isLight ? '#1a1a1a' : '#ffffff' }}>Potential Sanctions Match</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: isLight ? '#666' : 'var(--text-secondary)' }}>
              Searched: <strong>{searchedName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              color: isLight ? '#666' : 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          <p style={{ marginTop: 0, marginBottom: '20px', color: isLight ? '#444' : 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Found {matches.length} potential match{matches.length !== 1 ? 'es' : ''} in sanctions databases.
            Please review carefully before proceeding.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {matches.map((match, index) => (
              <div
                key={match.id || index}
                style={{
                  background: isLight ? '#f8f9fa' : 'rgba(255, 255, 255, 0.03)',
                  border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '12px',
                  padding: '16px',
                  borderLeft: `4px solid ${getSourceColor(match.source)}`
                }}
              >
                {/* Source Badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span
                    style={{
                      background: getSourceColor(match.source),
                      color: '#000',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: '600'
                    }}
                  >
                    {getSourceLabel(match.source)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: isLight ? '#666' : 'var(--text-secondary)' }}>
                    ID: {match.source_id}
                  </span>
                  {match.score !== undefined && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: match.score >= 0.9 ? 'rgba(255, 77, 77, 0.2)' : match.score >= 0.7 ? 'rgba(255, 193, 7, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                        color: match.score >= 0.9 ? '#ff6b6b' : match.score >= 0.7 ? '#ffc107' : 'var(--text-secondary)',
                        marginLeft: 'auto'
                      }}
                    >
                      {Math.round(match.score * 100)}% match
                    </span>
                  )}
                  {match.listed_on && !match.score && (
                    <span style={{ fontSize: '0.75rem', color: isLight ? '#666' : 'var(--text-secondary)', marginLeft: 'auto' }}>
                      Listed: {formatDate(match.listed_on)}
                    </span>
                  )}
                </div>

                {/* Names */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isLight ? '#666' : 'var(--text-secondary)', marginBottom: '4px' }}>
                    Known Names / Aliases
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {match.names.map((name, i) => (
                      <span
                        key={i}
                        style={{
                          background: isLight ? '#fff' : 'rgba(255, 255, 255, 0.05)',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          border: isLight ? '1px solid #ddd' : '1px solid rgba(255, 255, 255, 0.1)',
                          color: isLight ? '#333' : '#fff'
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Target Type */}
                <div style={{ marginBottom: match.remarks ? '12px' : 0 }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isLight ? '#666' : 'var(--text-secondary)', marginBottom: '4px' }}>
                    Type
                  </div>
                  <span style={{ fontSize: '0.85rem', textTransform: 'capitalize', color: isLight ? '#333' : '#fff' }}>
                    {match.target_type}
                  </span>
                </div>

                {/* Remarks */}
                {match.remarks && (
                  <div>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: isLight ? '#666' : 'var(--text-secondary)', marginBottom: '4px' }}>
                      Remarks
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: isLight ? '#444' : 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {match.remarks}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: isLight ? '#fafafa' : 'transparent'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isLight ? '#666' : 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <Shield size={14} />
            <span>Data from Sanctions API (OFAC, UN, EU)</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={onMarkClean}
              className="btn-primary"
              style={{
                background: '#0a905d', // Solid Green
                borderColor: '#0a905d',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ShieldCheck size={16} />
              Mark as Clean
            </button>
            <button
              onClick={onConfirmMatch}
              className="btn-primary"
              style={{
                background: '#d32f2f', // Solid Red
                borderColor: '#d32f2f',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <ShieldAlert size={16} />
              Confirm Match
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
