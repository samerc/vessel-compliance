import { X, AlertTriangle, Shield, ShieldCheck, ShieldAlert } from 'lucide-react'
import { SanctionsMatch } from '../../../shared/types'

interface SanctionsModalProps {
  searchedName: string
  matches: SanctionsMatch[]
  onClose: () => void
  onMarkClean: () => void
  onConfirmMatch: () => void
}

export default function SanctionsModal({ searchedName, matches, onClose, onMarkClean, onConfirmMatch }: SanctionsModalProps) {
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
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        className="glass-card"
        style={{
          width: '90%',
          maxWidth: '700px',
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: 'rgba(255, 193, 7, 0.1)'
          }}
        >
          <AlertTriangle size={24} color="#ffc107" />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Potential Sanctions Match</h2>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Searched: <strong>{searchedName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px',
              cursor: 'pointer',
              color: 'var(--text-primary)',
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
          <p style={{ marginTop: 0, marginBottom: '20px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Found {matches.length} potential match{matches.length !== 1 ? 'es' : ''} in sanctions databases.
            Please review carefully before proceeding.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {matches.map((match, index) => (
              <div
                key={match.id || index}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
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
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                      Listed: {new Date(match.listed_on).toLocaleDateString()}
                    </span>
                  )}
                </div>

                {/* Names */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Known Names / Aliases
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {match.names.map((name, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          padding: '4px 10px',
                          borderRadius: '4px',
                          fontSize: '0.85rem',
                          border: '1px solid rgba(255, 255, 255, 0.1)'
                        }}
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Target Type */}
                <div style={{ marginBottom: match.remarks ? '12px' : 0 }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Type
                  </div>
                  <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>
                    {match.target_type}
                  </span>
                </div>

                {/* Remarks */}
                {match.remarks && (
                  <div>
                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Remarks
                    </div>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
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
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            <Shield size={14} />
            <span>Data from Sanctions API (OFAC, UN, EU)</span>
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button
              onClick={onMarkClean}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(0, 255, 136, 0.3)',
                background: 'rgba(0, 255, 136, 0.1)',
                color: '#00ff88',
                cursor: 'pointer',
                fontWeight: '500',
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
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 77, 77, 0.3)',
                background: 'rgba(255, 77, 77, 0.1)',
                color: '#ff4d4d',
                cursor: 'pointer',
                fontWeight: '500',
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
