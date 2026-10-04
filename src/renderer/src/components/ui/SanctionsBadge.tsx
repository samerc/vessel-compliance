import { Shield, ShieldAlert, ShieldCheck, RefreshCw, Loader2 } from 'lucide-react'
import Badge from './Badge'
import type { BadgeTone } from './Badge'
import { formatDateTime } from '../../utils/dateUtils'

interface SanctionsBadgeProps {
  status?: string | null
  checking?: boolean
  checkedAt?: string | null
  /** Opens the match review (only offered for possible matches and sanctioned) */
  onReview?: () => void
  onRecheck?: () => void
}

/** Sanctions screening status pill shared by the vessel, entity and assured views */
export default function SanctionsBadge({
  status,
  checking,
  checkedAt,
  onReview,
  onRecheck
}: SanctionsBadgeProps) {
  if (checking) {
    return (
      <Badge tone="accent">
        <Loader2 size={11} className="spinner" /> CHECKING...
      </Badge>
    )
  }

  const isMatch = status === 'MATCH' || status === 'SANCTIONED'
  const isPotentialMatch = status === 'POTENTIAL_MATCH'
  const isError = status === 'ERROR'
  const isPending = !status || status === 'PENDING'

  let tone: BadgeTone = 'success'
  let text = 'CLEARED'
  let icon = <ShieldCheck size={11} />
  if (isPending) {
    tone = 'neutral'
    text = 'NOT CHECKED'
    icon = <Shield size={11} opacity={0.6} />
  } else if (isError) {
    tone = 'warning'
    text = 'CHECK FAILED'
    icon = <Shield size={11} />
  } else if (isMatch) {
    tone = 'danger'
    text = 'SANCTIONED'
    icon = <ShieldAlert size={11} />
  } else if (isPotentialMatch) {
    tone = 'warning'
    text = 'POSSIBLE MATCH'
    icon = <ShieldAlert size={11} />
  }

  const reviewable = (isMatch || isPotentialMatch) && !!onReview
  const title = isError
    ? 'The check failed. Click refresh to try again.'
    : reviewable
      ? 'Click to review matches'
      : `Last checked: ${checkedAt ? formatDateTime(checkedAt) : 'Never'}`

  return (
    <span
      onClick={(e) => {
        e.stopPropagation()
        if (reviewable) onReview!()
      }}
      style={{ cursor: reviewable ? 'pointer' : 'default', display: 'inline-flex' }}
      title={title}
    >
      <Badge tone={tone} style={{ fontSize: '0.68rem', borderRadius: '6px' }}>
        {icon}
        {text}
        {onRecheck && (
          <RefreshCw
            size={10}
            style={{ marginLeft: '3px', cursor: 'pointer', opacity: 0.6 }}
            className="hover-spin"
            aria-label="Check again"
            onClick={(e) => {
              e.stopPropagation()
              onRecheck()
            }}
          />
        )}
      </Badge>
    </span>
  )
}
