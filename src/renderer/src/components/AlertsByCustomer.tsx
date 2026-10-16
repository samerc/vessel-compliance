import React, { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Briefcase,
  CheckCircle,
  ChevronDown,
  Clock,
  Copy,
  ShieldAlert
} from 'lucide-react'
import type { VesselCustomerMap } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { formatDate } from '../utils/dateUtils'
import { Badge, EmptyState, Spinner } from './ui'

/** The fields of a Compliance Center document alert this view needs */
export interface CustomerAlert {
  id: string
  vesselId: string
  vessel: string
  document: string
  category: 'vessel' | 'entity' | 'endorsement'
  type: 'missing' | 'expired' | 'soon'
  date: string
}

interface CustomerGroup {
  key: string
  name: string
  email: string | null
  type: string | null
  alerts: CustomerAlert[]
}

const NO_CUSTOMER = '__none__'

/** Plain-text chase email: greeting, then per vessel its missing / expired documents */
const buildChaseEmail = (group: CustomerGroup): string => {
  const byVessel = new Map<string, CustomerAlert[]>()
  for (const a of group.alerts) {
    if (!byVessel.has(a.vessel)) byVessel.set(a.vessel, [])
    byVessel.get(a.vessel)!.push(a)
  }
  const lines: string[] = []
  // Semicolons: the list pastes straight into Outlook's To field
  if (group.email)
    lines.push(
      `To: ${group.email
        .split(/\s*[,;]\s*/)
        .filter(Boolean)
        .join('; ')}`,
      ''
    )
  lines.push(
    group.key === NO_CUSTOMER ? 'Dear Sir / Madam,' : `Dear ${group.name},`,
    '',
    'Please find below the documents we are still waiting for on the following vessel(s):'
  )
  for (const [vessel, list] of byVessel) {
    lines.push('', `M/V ${vessel.toUpperCase()}`)
    for (const a of list) {
      const date = a.date && a.date !== '-' ? formatDate(a.date) || a.date : ''
      const state =
        a.type === 'missing'
          ? 'missing'
          : a.type === 'expired'
            ? `expired${date ? ' on ' + date : ''}`
            : `expires on ${date || '-'}`
      lines.push(`- ${a.document}: ${state}`)
    }
  }
  lines.push(
    '',
    'We would be grateful if you could send us the above at your earliest convenience.',
    '',
    'Kind regards,'
  )
  return lines.join('\n')
}

/**
 * Document Alerts grouped by customer / broker (from the vessels' active policies). A vessel with
 * several customers appears under each; vessels with none under "No customer".
 */
export default function AlertsByCustomer({
  alerts,
  onOpenAlert
}: {
  alerts: CustomerAlert[]
  onOpenAlert: (alert: CustomerAlert) => void
}): React.JSX.Element {
  const { showSuccess, showError } = useToast()
  const [customers, setCustomers] = useState<VesselCustomerMap | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    let cancelled = false
    window.api
      .getVesselCustomers()
      .then((res) => {
        if (!cancelled) setCustomers(res && typeof res === 'object' && !('error' in res) ? res : {})
      })
      .catch(() => {
        if (!cancelled) setCustomers({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  const groups = useMemo((): CustomerGroup[] => {
    if (!customers) return []
    const map = new Map<string, CustomerGroup>()
    const add = (key: string, init: Omit<CustomerGroup, 'alerts'>, a: CustomerAlert): void => {
      if (!map.has(key)) map.set(key, { ...init, alerts: [] })
      map.get(key)!.alerts.push(a)
    }
    // Endorsements are internal follow-ups, not documents a customer sends
    for (const a of alerts) {
      if (a.category === 'endorsement') continue
      const list = customers[a.vesselId] || []
      if (list.length === 0) {
        add(NO_CUSTOMER, { key: NO_CUSTOMER, name: 'No customer', email: null, type: null }, a)
        continue
      }
      const seen = new Set<string>()
      for (const c of list) {
        if (seen.has(c.entityId)) continue
        seen.add(c.entityId)
        add(c.entityId, { key: c.entityId, name: c.name, email: c.email, type: c.type }, a)
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.key === NO_CUSTOMER) return 1
      if (b.key === NO_CUSTOMER) return -1
      return b.alerts.length - a.alerts.length || a.name.localeCompare(b.name)
    })
  }, [alerts, customers])

  const copyEmail = async (group: CustomerGroup): Promise<void> => {
    try {
      await navigator.clipboard.writeText(buildChaseEmail(group))
      showSuccess('Chase email copied')
    } catch {
      showError('Could not copy to the clipboard')
    }
  }

  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (!customers) {
    return (
      <div className="glass-card" style={{ padding: '32px', textAlign: 'center' }}>
        <Spinner size={20} label="Loading customers..." />
      </div>
    )
  }

  if (groups.length === 0) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={<CheckCircle size={40} color="var(--success)" />}
          title="Fleet is fully compliant"
          text="No document alerts found."
        />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {groups.map((group) => {
        const isExpanded = expanded.has(group.key)
        const vesselCount = new Set(group.alerts.map((a) => a.vesselId)).size
        return (
          <div key={group.key} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: isExpanded ? '1px solid var(--table-border)' : 'none',
                background: 'var(--table-header-bg)',
                cursor: 'pointer'
              }}
              onClick={() => toggle(group.key)}
            >
              <ChevronDown
                size={14}
                style={{
                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                  color: 'var(--text-secondary)'
                }}
              />
              <Briefcase size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                {group.name}
              </span>
              {group.type && (
                <Badge tone={group.type === 'broker' ? 'info' : 'neutral'}>
                  {group.type === 'broker' ? 'Broker' : 'Direct'}
                </Badge>
              )}
              <span
                className="muted"
                title={group.email || undefined}
                style={{
                  fontSize: '0.78rem',
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {vesselCount} vessel{vesselCount !== 1 ? 's' : ''}
                {group.email ? ` · ${group.email}` : ''}
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexShrink: 0,
                  whiteSpace: 'nowrap'
                }}
              >
                <Badge tone="danger">{group.alerts.length}</Badge>
                <button
                  className="btn-secondary btn-sm"
                  title="Copy a plain-text email asking for the missing and expired documents"
                  onClick={(e) => {
                    e.stopPropagation()
                    void copyEmail(group)
                  }}
                >
                  <Copy size={13} /> Copy chase email
                </button>
              </span>
            </div>
            {isExpanded && (
              <table className="data-table">
                <tbody>
                  {group.alerts.map((alert) => {
                    const rowBorder =
                      alert.type === 'expired' || alert.type === 'missing'
                        ? 'var(--danger)'
                        : 'var(--warning)'
                    return (
                      <tr
                        key={alert.id}
                        className="clickable"
                        style={{ borderLeft: `4px solid ${rowBorder}` }}
                        onClick={() => onOpenAlert(alert)}
                      >
                        <td style={{ fontWeight: 600, width: '200px' }}>{alert.vessel}</td>
                        <td>
                          {alert.category === 'entity' && (
                            <Badge tone="violet" style={{ marginRight: '6px' }}>
                              Entity
                            </Badge>
                          )}
                          {alert.document}
                        </td>
                        <td style={{ width: '120px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.8rem'
                            }}
                          >
                            {alert.type === 'missing' && (
                              <ShieldAlert size={14} color="var(--danger)" />
                            )}
                            {alert.type === 'expired' && (
                              <AlertCircle size={14} color="var(--danger)" />
                            )}
                            {alert.type === 'soon' && <Clock size={14} color="var(--warning)" />}
                            <span style={{ textTransform: 'capitalize' }}>
                              {alert.type === 'soon' ? 'Expiring' : alert.type}
                            </span>
                          </div>
                        </td>
                        <td className="muted" style={{ textAlign: 'right' }}>
                          {alert.date !== '-' && alert.date}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
