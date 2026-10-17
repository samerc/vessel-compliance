import { useState } from 'react'
import { AlertTriangle, Shield, ShieldCheck, ShieldAlert, Loader2 } from 'lucide-react'
import { SanctionsMatch } from '../../../shared/types'
import { formatDate } from '../utils/dateUtils'
import { Field, Modal } from './ui'

interface SanctionsModalProps {
  searchedName: string
  matches: SanctionsMatch[]
  onClose: () => void
  /** Each decision gets the reviewer's reason; the modal stays open while it saves */
  onMarkClean: (note: string) => Promise<void> | void
  onConfirmMatch: (note: string) => Promise<void> | void
}

const SOURCE_INFO: Record<string, { label: string; color: string }> = {
  ofac: { label: 'OFAC (US)', color: '#ff6b6b' },
  eu: { label: 'EU Sanctions', color: '#4dabf7' },
  uk: { label: 'UK (FCDO)', color: '#ff922b' },
  un: { label: 'UN Sanctions', color: '#69db7c' },
  isf: { label: 'ISF (Lebanon)', color: '#e599f7' },
  sic: { label: 'SIC (Lebanon)', color: '#ffd43b' }
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
  const getSourceLabel = (source: string): string =>
    SOURCE_INFO[source.toLowerCase()]?.label || source.toUpperCase()
  const getSourceColor = (source: string): string =>
    SOURCE_INFO[source.toLowerCase()]?.color || '#adb5bd'

  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'clean' | 'match' | null>(null)
  const decide = async (which: 'clean' | 'match'): Promise<void> => {
    setBusy(which)
    try {
      await (which === 'clean' ? onMarkClean(note) : onConfirmMatch(note))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      title="Potential Sanctions Match"
      icon={<AlertTriangle size={18} />}
      onClose={onClose}
      width={700}
      closeOnOverlay={false}
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
            Local copies of the OFAC, EU, UK, UN, ISF and SIC lists
          </span>
          <button onClick={() => void decide('clean')} className="btn-primary" disabled={!!busy}>
            {busy === 'clean' ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />}
            Not a match (clear)
          </button>
          <button onClick={() => void decide('match')} className="btn-danger" disabled={!!busy}>
            {busy === 'match' ? <Loader2 size={16} className="spin" /> : <ShieldAlert size={16} />}
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
      <div style={{ marginBottom: '16px' }}>
        <Field label="Reason (optional, kept with the decision)" htmlFor="sanctions-modal-note">
          <textarea
            id="sanctions-modal-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. different date of birth / nationality"
            style={{ resize: 'vertical' }}
          />
        </Field>
      </div>

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

            {/* Type, IMO, listing date, positions */}
            <div
              style={{
                display: 'flex',
                gap: '24px',
                flexWrap: 'wrap',
                marginBottom: match.remarks ? '12px' : 0
              }}
            >
              <div>
                <div style={sectionLabel}>Type</div>
                <span style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>
                  {match.target_type}
                </span>
              </div>
              {match.imo_number && (
                <div>
                  <div style={sectionLabel}>IMO</div>
                  <span style={{ fontSize: '0.85rem' }}>{match.imo_number}</span>
                </div>
              )}
              {match.listed_on && (
                <div>
                  <div style={sectionLabel}>Listed on</div>
                  <span style={{ fontSize: '0.85rem' }}>{formatDate(match.listed_on)}</span>
                </div>
              )}
              {match.positions && match.positions.length > 0 && (
                <div style={{ minWidth: 0 }}>
                  <div style={sectionLabel}>Positions</div>
                  <span style={{ fontSize: '0.85rem' }}>{match.positions.join('; ')}</span>
                </div>
              )}
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
