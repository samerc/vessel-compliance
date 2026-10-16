import { useEffect, useMemo, useState } from 'react'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'
import type {
  DocumentType,
  SurveyHistoryRow,
  Vessel,
  VesselCustomDocType,
  VesselDocument,
  VesselDynamicPolicy,
  VesselQuotationRow
} from '../../../shared/types'

// Summary tiles under the vessel header: one per related area, each opens its tab

export type VesselTab = 'documents' | 'policies' | 'quotations' | 'surveys' | 'assureds'

interface Props {
  vessel: Vessel
  docTypes: DocumentType[]
  vesselDocs: VesselDocument[]
  customDocTypes: VesselCustomDocType[]
  dynamicPolicies: VesselDynamicPolicy[]
  onOpen: (tab: VesselTab) => void
}

const DAY = 86400000

function fmt(s?: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const OPEN_QUOTATION = new Set(['draft', 'sent', 'approved', 'exported'])

const SANCTIONS: Record<string, { label: string; color: string }> = {
  CLEARED: { label: 'Cleared', color: 'var(--success)' },
  POTENTIAL_MATCH: { label: 'To review', color: 'var(--warning)' },
  MATCH: { label: 'Match', color: 'var(--danger)' },
  SANCTIONED: { label: 'Sanctioned', color: 'var(--danger)' },
  ERROR: { label: 'Check failed', color: 'var(--warning)' },
  PENDING: { label: 'Not checked', color: 'var(--text-secondary)' }
}

function Tile({
  label,
  value,
  detail,
  color,
  onClick
}: {
  label: string
  value: string
  detail?: string
  color?: string
  onClick?: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      className="vessel-tile"
      onClick={onClick}
      disabled={!onClick}
      style={{
        flex: '1 1 170px',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '3px',
        padding: '12px 14px',
        borderRadius: '10px',
        border: '1px solid var(--glass-border-color)',
        background: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        font: 'inherit',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default'
      }}
    >
      <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
        {label}
      </span>
      <span style={{ fontSize: '1.1rem', fontWeight: 600, color: color ?? 'var(--text-primary)' }}>
        {value}
      </span>
      {detail && (
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {detail}
        </span>
      )}
    </button>
  )
}

export default function VesselSummaryTiles({
  vessel,
  docTypes,
  vesselDocs,
  customDocTypes,
  dynamicPolicies,
  onOpen
}: Props): React.JSX.Element {
  const [quotations, setQuotations] = useState<VesselQuotationRow[] | null>(null)
  const [surveys, setSurveys] = useState<SurveyHistoryRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .vesselGetQuotations(vessel.id)
      .then((d) => !cancelled && setQuotations(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setQuotations([]))
    window.api
      .getSurveyHistory(vessel.id)
      .then((d) => !cancelled && setSurveys(Array.isArray(d) ? d : []))
      .catch(() => !cancelled && setSurveys([]))
    return () => {
      cancelled = true
    }
  }, [vessel.id])

  // Same rule as the documents tab: required without a file = missing; annual documents
  // follow the P&I (else H&M) policy end date
  const docs = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const soon = new Date(today.getTime() + 30 * DAY)
    const policyExpiry = resolveEffectivePolicyExpiry(dynamicPolicies)
    let missing = 0
    let expired = 0
    let expiring = 0
    const types = [
      ...docTypes,
      ...customDocTypes.map((c) => ({ id: c.id, required: true, annualRenewal: false }))
    ]
    for (const t of types) {
      const doc = vesselDocs.find((d) => d.documentTypeId === t.id)
      const required = doc ? doc.required : t.required
      if (!doc?.filePath) {
        if (required) missing++
        continue
      }
      const exp = t.annualRenewal && policyExpiry ? policyExpiry : doc.expiryDate
      if (!exp) continue
      const e = new Date(exp)
      if (e < today) expired++
      else if (e <= soon) expiring++
    }
    return { missing, expired, expiring }
  }, [docTypes, customDocTypes, vesselDocs, dynamicPolicies])

  const active = dynamicPolicies.filter((p) => p.status === 'active')
  const openQuotes = (quotations ?? []).filter((q) => OPEN_QUOTATION.has(q.status))
  const openDefects = (surveys ?? []).reduce((n, s) => n + Number(s.openDefects || 0), 0)
  const lastSurvey = surveys?.[0]
  const sanctions = SANCTIONS[vessel.ofacStatus ?? 'PENDING'] ?? SANCTIONS.PENDING

  const toFix = docs.missing + docs.expired
  const docDetail = [
    docs.expired && `${docs.expired} expired`,
    docs.missing && `${docs.missing} missing`,
    docs.expiring && `${docs.expiring} expiring in 30 days`
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
      <Tile
        label="Documents"
        value={toFix > 0 ? `${toFix} to fix` : docs.expiring > 0 ? 'Expiring soon' : 'In order'}
        color={
          toFix > 0 ? 'var(--danger)' : docs.expiring > 0 ? 'var(--warning)' : 'var(--success)'
        }
        detail={docDetail || 'Nothing missing or expired'}
        onClick={() => onOpen('documents')}
      />
      <Tile
        label="Policies"
        value={`${active.length} active`}
        detail={
          active.length
            ? [...new Set(active.map((p) => p.policyTypeName).filter(Boolean))].join(', ')
            : 'No active policy'
        }
        onClick={() => onOpen('policies')}
      />
      <Tile
        label="Quotations"
        value={quotations === null ? '–' : `${openQuotes.length} open`}
        detail={
          openQuotes[0]
            ? `${openQuotes[0].referenceNumber}${openQuotes.length > 1 ? ` +${openQuotes.length - 1}` : ''}`
            : quotations && quotations.length
              ? `${quotations.length} in total`
              : 'None yet'
        }
        onClick={() => onOpen('quotations')}
      />
      <Tile
        label="Sanctions"
        value={sanctions.label}
        color={sanctions.color}
        detail={vessel.ofacCheckedAt ? `Checked ${fmt(vessel.ofacCheckedAt)}` : undefined}
      />
      <Tile
        label="Surveys"
        value={
          surveys === null
            ? '–'
            : openDefects > 0
              ? `${openDefects} open defect${openDefects === 1 ? '' : 's'}`
              : surveys.length
                ? 'No open defects'
                : 'No surveys'
        }
        color={openDefects > 0 ? 'var(--warning)' : undefined}
        detail={lastSurvey ? `Last survey ${fmt(lastSurvey.surveyDate)}` : undefined}
        onClick={() => onOpen('surveys')}
      />
    </div>
  )
}
