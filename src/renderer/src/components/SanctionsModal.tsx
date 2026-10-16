import { AlertTriangle, Shield, ShieldCheck, ShieldAlert } from 'lucide-react'
import { SanctionsMatch } from '../../../shared/types'
import { formatDate } from '../utils/dateUtils'
import { Modal } from './ui'

interface SanctionsModalProps {
  searchedName: string
  matches: SanctionsMatch[]
  onClose: () => void
  onMarkClean: () => void
  onConfirmMatch: () => void
}

const sectionLabel: React.CSSProperties = {
  fontSize: '0.75rem',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: '4px'
}

export default function SanctionsModal({
  searchedName,
  matches,
  onClose,
  onMarkClean,
  onConfirmMatch
}: SanctionsModalProps): React.JSX.Element {
  const getSourceLabel = (source: string): string => {
    switch (source.toLowerCase()) {
      case 'ofac':
        return 'OFAC (US)'
      case 'eu':
        return 'EU Sanctions'
      case 'un':
        return 'UN Sanctions'
      default:
        return source.toUpperCase()
    }
  }

  const getSourceColor = (source: string): '#ff6b6b' | '#4dabf7' | '#69db7c' | '#ffd43b' => {
    switch (source.toLowerCase()) {
      case 'ofac':
        return '#ff6b6b'
      case 'eu':
        return '#4dabf7'
      case 'un':
        return '#69db7c'
      default:
        return '#ffd43b'
    }
  }

  return (
    <Modal
      title="Potential Sanctions Match"
      icon={<AlertTriangle size={18} />}
      onClose={onClose}
      width={700}
      footer={
        <>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginRight: 'auto',
              color: 'var(--text-secondary)',
              fontSize: '0.8rem'
            }}
          >
            <Shield size={14} />
            Data from Sanctions API (OFAC, UN, EU)
          </span>
          <button onClick={onMarkClean} className="btn-primary">
            <ShieldCheck size={16} />
            Mark as Clean
          </button>
          <button onClick={onConfirmMatch} className="btn-danger">
            <ShieldAlert size={16} />
            Confirm Match
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, marginBottom: '6px', fontSize: '0.9rem' }}>
        Searched: <strong>{searchedName}</strong>
      </p>
      <p
        style={{
          marginTop: 0,
          marginBottom: '20px',
          color: 'var(--text-secondary)',
          fontSize: '0.9rem'
        }}
      >
        Found {matches.length} potential match{matches.length !== 1 ? 'es' : ''} in sanctions
        databases. Please review carefully before proceeding.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {matches.map((match, index) => (
          <div
            key={match.id || index}
            style={{
              background: 'var(--bg-card)',
              border: 'var(--glass-border)',
              borderRadius: '12px',
              padding: '16px',
              borderLeft: `4px solid ${getSourceColor(match.source)}`
            }}
          >
            {/* Source Badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px'
              }}
            >
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
                ID: <span className="mono">{match.source_id}</span>
              </span>
              {match.score !== undefined && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background:
                      match.score >= 0.9
                        ? 'rgba(255, 77, 77, 0.2)'
                        : match.score >= 0.7
                          ? 'rgba(255, 193, 7, 0.2)'
                          : 'var(--bg-card-hover)',
                    color:
                      match.score >= 0.9
                        ? 'var(--danger)'
                        : match.score >= 0.7
                          ? 'var(--warning)'
                          : 'var(--text-secondary)',
                    marginLeft: 'auto'
                  }}
                >
                  {Math.round(match.score * 100)}% match
                </span>
              )}
              {match.listed_on && !match.score && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginLeft: 'auto'
                  }}
                >
                  Listed: {formatDate(match.listed_on)}
                </span>
              )}
            </div>

            {/* Names */}
            <div style={{ marginBottom: '12px' }}>
              <div style={sectionLabel}>Known names / aliases</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {match.names.map((name, i) => (
                  <span
                    key={i}
                    style={{
                      background: 'var(--bg-primary)',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      border: 'var(--glass-border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Target Type */}
            <div style={{ marginBottom: match.remarks ? '12px' : 0 }}>
              <div style={sectionLabel}>Type</div>
              <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>
                {match.target_type}
              </span>
            </div>

            {/* Remarks */}
            {match.remarks && (
              <div>
                <div style={sectionLabel}>Remarks</div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5
                  }}
                >
                  {match.remarks}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
