import { CheckCircle, ExternalLink, ShieldAlert, X } from 'lucide-react'
import type {
  ComplianceCheckResult,
  Entity,
  SanctionsMatch,
  Vessel,
  VesselAssured
} from '../../../shared/types'
import { formatDate } from '../utils/dateUtils'
import { Badge } from './ui'

interface Props {
  result: ComplianceCheckResult
  /** Our record: the screened vessel or entity (when it is loaded) */
  vessel?: Vessel
  entity?: Entity
  /** Vessels the entity is an assured of (entity results) */
  entityVessels: { vesselName: string; role: string }[]
  /** Assureds of the vessel (vessel results) */
  vesselAssureds: VesselAssured[]
  canReview: boolean
  deciding: boolean
  position: { index: number; total: number }
  onDecide: (decision: 'cleared' | 'sanctioned') => void
  onOpen: () => void
  onClose: () => void
}

function Row({
  label,
  value
}: {
  label: string
  value?: React.ReactNode
}): React.JSX.Element | null {
  if (value === undefined || value === null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: '10px', fontSize: '0.84rem', padding: '3px 0' }}>
      <span style={{ width: '110px', flexShrink: 0, color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
  margin: '0 0 8px'
}

/**
 * One pending sanctions hit side by side: our record (what we know about the screened vessel or
 * entity) next to each list entry it matched, with the decision buttons. Keys: J/K next/previous,
 * C clear, S sanction (handled by the Compliance Center).
 */
export default function SanctionsReviewDetail({
  result,
  vessel,
  entity,
  entityVessels,
  vesselAssureds,
  canReview,
  deciding,
  position,
  onDecide,
  onOpen,
  onClose
}: Props): React.JSX.Element {
  let matches: Partial<SanctionsMatch>[] = []
  try {
    const parsed = JSON.parse(result.matchDetails || '[]')
    if (Array.isArray(parsed)) matches = parsed
  } catch {
    matches = []
  }
  matches = [...matches].sort((a, b) => (b.score || 0) - (a.score || 0))
  const isVessel = result.entityType === 'vessel'

  return (
    <div
      className="glass-card"
      style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
      aria-label={`Review of ${result.entityName}`}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--table-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{result.entityName}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            {isVessel ? 'Vessel' : 'Entity'} · best match{' '}
            {Number(result.matchScore || 0).toFixed(0)}% · {position.index + 1} of {position.total}
          </div>
        </div>
        <button className="btn-ghost btn-sm" onClick={onOpen} title="Open the record">
          <ExternalLink size={14} /> Open
        </button>
        <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close review">
          <X size={14} />
        </button>
      </div>

      <div style={{ padding: '14px 18px', overflowY: 'auto', maxHeight: 'calc(100vh - 330px)' }}>
        {/* Our record */}
        <div style={sectionTitle}>Our record</div>
        <div
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: '1px solid var(--table-border)',
            marginBottom: '16px'
          }}
        >
          <Row label="Name" value={result.entityName} />
          {isVessel ? (
            <>
              <Row label="IMO" value={vessel?.imoNumber} />
              <Row label="Type" value={vessel?.vesselType} />
              <Row
                label="Built"
                value={
                  vessel?.builtYear
                    ? `${vessel.builtYear}${vessel.rebuiltYear ? ` / ${vessel.rebuiltYear}` : ''}`
                    : undefined
                }
              />
              <Row label="Call sign" value={vessel?.callSign} />
              <Row
                label="Assureds"
                value={
                  vesselAssureds.length > 0
                    ? vesselAssureds
                        .map((a) => `${a.entityName || 'Unknown'} (${a.role})`)
                        .join(', ')
                    : undefined
                }
              />
              {!vessel && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Inactive vessel: open it for its details.
                </div>
              )}
            </>
          ) : (
            <>
              <Row
                label="Type"
                value={entity ? (entity.type === 'person' ? 'Person' : 'Company') : undefined}
              />
              <Row label="Identifier" value={entity?.identifier} />
              <Row label="Email" value={entity?.email} />
              <Row
                label="Vessels"
                value={
                  entityVessels.length > 0
                    ? entityVessels.map((v) => `${v.vesselName} (${v.role})`).join(', ')
                    : 'Not an assured of any vessel'
                }
              />
            </>
          )}
          <Row
            label="Screened"
            value={result.createdAt ? formatDate(result.createdAt) : undefined}
          />
        </div>

        {/* List entries */}
        <div style={sectionTitle}>Matched list entries ({matches.length})</div>
        {matches.length === 0 && (
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            No details were stored for this match.
          </div>
        )}
        {matches.map((m, i) => (
          <div
            key={`${m.source}:${m.source_id}:${i}`}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              border: '1px solid var(--table-border)',
              marginBottom: '10px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <strong style={{ flex: 1, minWidth: 0 }}>{m.names?.[0] || 'Unnamed entry'}</strong>
              <Badge tone="neutral">{m.source || 'Unknown'}</Badge>
              <span
                style={{
                  fontWeight: 700,
                  color:
                    (m.score || 0) >= 0.9
                      ? 'var(--danger)'
                      : (m.score || 0) >= 0.8
                        ? 'var(--warning)'
                        : 'var(--text-secondary)'
                }}
              >
                {((m.score || 0) * 100).toFixed(0)}%
              </span>
            </div>
            <Row
              label="Also known as"
              value={m.names && m.names.length > 1 ? m.names.slice(1).join('; ') : undefined}
            />
            <Row label="List reference" value={m.source_id} />
            <Row label="Kind" value={m.target_type} />
            <Row label="IMO" value={m.imo_number} />
            <Row label="Listed on" value={m.listed_on ? formatDate(m.listed_on) : undefined} />
            <Row
              label="Positions"
              value={m.positions && m.positions.length > 0 ? m.positions.join('; ') : undefined}
            />
            <Row label="Remarks" value={m.remarks || undefined} />
          </div>
        ))}
      </div>

      {canReview && (
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--table-border)',
            display: 'flex',
            gap: '8px',
            alignItems: 'center'
          }}
        >
          <button
            className="btn-secondary"
            disabled={deciding}
            onClick={() => onDecide('cleared')}
            title="Not the same person / company / vessel (C)"
            style={{ color: 'var(--success)' }}
          >
            <CheckCircle size={15} /> Clear
          </button>
          <button
            className="btn-secondary"
            disabled={deciding}
            onClick={() => onDecide('sanctioned')}
            title="It is the listed party (S)"
            style={{ color: 'var(--danger)' }}
          >
            <ShieldAlert size={15} /> Sanction
          </button>
          <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
            J / K next / previous · C clear · S sanction
          </span>
        </div>
      )}
    </div>
  )
}
