import React, { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown, Briefcase } from 'lucide-react'
import type { CustomerOverview } from '../../../shared/types'
import { Badge, EmptyState, Spinner, TypeChip } from './ui'
import type { BadgeTone } from './ui'
import { formatDate } from '../utils/dateUtils'

const QUOTATION_TONES: Record<string, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  approved: 'success',
  exported: 'accent',
  rejected: 'danger',
  converted: 'violet'
}

/** App.tsx listens for this and opens the record (vessel, quotation or policy) */
const openRecord = (type: 'vessel' | 'quotation' | 'policy', id: string): void => {
  window.dispatchEvent(new CustomEvent('app-open-record', { detail: { type, id } }))
}

const money = (amount: number | string | null, currency: string | null): string => {
  if (amount == null || amount === '') return '-'
  const n = Number(amount)
  if (isNaN(n)) return '-'
  return `${currency ? currency + ' ' : ''}${n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

// The panel is ~400px wide: compact cells, long text truncated with an ellipsis
const cell: React.CSSProperties = {
  padding: '6px 8px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap'
}
const head: React.CSSProperties = { padding: '6px 8px', fontSize: '0.64rem' }
const mono: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }

/**
 * "Business" section of the entity panel: the quotations, policies, active vessel policies and
 * receipts where this entity is the customer / broker. Rows open the record.
 */
export default function EntityBusinessSection({
  entityId,
  sectionLabel,
  alwaysOpen = false
}: {
  entityId: string
  sectionLabel: React.CSSProperties
  /** Shown as its own tab: no collapsible header, renewals due first */
  alwaysOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(alwaysOpen)
  const [data, setData] = useState<CustomerOverview | null>(null)
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  // Cheap query (~10 ms): loaded when the panel opens so the header can show the count
  useEffect(() => {
    let cancelled = false
    window.api
      .getCustomerOverview(entityId)
      .then((res) => {
        if (cancelled) return
        const ok = res && Array.isArray(res.quotations)
        setData(
          ok
            ? {
                quotations: res.quotations,
                policies: Array.isArray(res.policies) ? res.policies : [],
                vesselPolicies: Array.isArray(res.vesselPolicies) ? res.vesselPolicies : [],
                receipts: Array.isArray(res.receipts) ? res.receipts : []
              }
            : null
        )
        setLoadedFor(entityId)
      })
      .catch(() => {
        if (cancelled) return
        setData(null)
        setLoadedFor(entityId)
      })
    return () => {
      cancelled = true
    }
  }, [entityId])

  const loading = loadedFor !== entityId
  const total = data
    ? data.quotations.length +
      data.policies.length +
      data.vesselPolicies.length +
      data.receipts.length
    : 0

  // Vessel policies ending within 90 days (or ended in the last 30, still to renew)
  const renewals = (() => {
    if (!data) return []
    const today = new Date(new Date().setHours(0, 0, 0, 0)).getTime()
    const DAY = 86400000
    return data.vesselPolicies
      .filter((vp) => {
        if (!vp.endDate) return false
        const t = new Date(vp.endDate).getTime()
        return t >= today - 30 * DAY && t <= today + 90 * DAY
      })
      .sort((a, b) => String(a.endDate).localeCompare(String(b.endDate)))
  })()
  const daysTo = (d: string): number =>
    Math.round(
      (new Date(d).getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / 86400000
    )

  const subTitle = (label: string, count: number): React.JSX.Element => (
    <div style={{ ...sectionLabel, margin: '12px 0 6px' }}>
      {label} <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{count}</span>
    </div>
  )

  return (
    <div
      style={
        alwaysOpen
          ? { padding: '4px 20px 16px' }
          : { padding: '12px 20px', borderTop: '1px solid var(--table-border)' }
      }
    >
      {!alwaysOpen && (
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0
          }}
        >
          {open ? (
            <ChevronDown size={13} color="var(--text-secondary)" />
          ) : (
            <ChevronRight size={13} color="var(--text-secondary)" />
          )}
          <span style={sectionLabel}>Business</span>
          {!loading && total > 0 && (
            <Badge tone="accent" style={{ marginLeft: '4px' }}>
              {total}
            </Badge>
          )}
        </button>
      )}

      {open && (
        <div style={{ marginTop: '6px' }}>
          {loading ? (
            <Spinner size={16} />
          ) : !data || total === 0 ? (
            <EmptyState
              compact
              icon={<Briefcase size={22} />}
              title="No business recorded for this entity yet"
            />
          ) : (
            <>
              {renewals.length > 0 && (
                <>
                  {subTitle('Renewals due', renewals.length)}
                  <div className="table-wrap">
                    <table className="data-table" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...head, width: '42%' }}>Vessel</th>
                          <th style={{ ...head, width: '28%' }}>Cover</th>
                          <th style={head}>Ends</th>
                        </tr>
                      </thead>
                      <tbody>
                        {renewals.map((vp) => {
                          const d = daysTo(vp.endDate!)
                          return (
                            <tr
                              key={vp.id}
                              className="clickable"
                              onClick={() => openRecord('vessel', vp.vesselId)}
                              title="Open vessel"
                            >
                              <td style={{ ...cell, fontWeight: 600 }}>{vp.vesselName}</td>
                              <td style={cell}>{vp.policyTypeName}</td>
                              <td style={cell}>
                                {formatDate(vp.endDate)}{' '}
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    color:
                                      d < 0
                                        ? 'var(--danger)'
                                        : d <= 30
                                          ? 'var(--warning)'
                                          : 'var(--text-secondary)'
                                  }}
                                >
                                  {d < 0 ? `${-d}d ago` : d === 0 ? 'today' : `in ${d}d`}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {data.quotations.length > 0 && (
                <>
                  {subTitle('Quotations', data.quotations.length)}
                  <div className="table-wrap">
                    <table className="data-table" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...head, width: '48%' }}>Quotation</th>
                          <th style={{ ...head, width: '26%' }}>Status</th>
                          <th style={head}>Vessels</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.quotations.map((q) => (
                          <tr
                            key={q.id}
                            className="clickable"
                            onClick={() => openRecord('quotation', q.id)}
                            title={`Open quotation${q.quotationDate ? ' - ' + formatDate(q.quotationDate) : ''}`}
                          >
                            <td style={cell}>
                              <div
                                style={{ ...mono, overflow: 'hidden', textOverflow: 'ellipsis' }}
                              >
                                {q.referenceNumber}
                              </div>
                              <div
                                className="muted"
                                style={{
                                  fontSize: '0.7rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  marginTop: '2px'
                                }}
                              >
                                <TypeChip code={q.typeCode} />
                                {formatDate(q.quotationDate) || '-'}
                              </div>
                            </td>
                            <td style={cell}>
                              <Badge
                                tone={QUOTATION_TONES[q.status] || 'neutral'}
                                title={q.stepName || q.status}
                              >
                                {q.stepName || q.status}
                              </Badge>
                            </td>
                            <td style={cell} title={q.vesselNames || ''}>
                              {q.vesselNames || <span className="muted">-</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {data.policies.length > 0 && (
                <>
                  {subTitle('Policies', data.policies.length)}
                  <div className="table-wrap">
                    <table className="data-table" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...head, width: '36%' }}>Policy</th>
                          <th style={{ ...head, width: '30%' }}>Vessel</th>
                          <th style={{ ...head, width: '34%' }} className="num">
                            Premium
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.policies.map((p) => (
                          <tr
                            key={p.id}
                            className="clickable"
                            onClick={() => openRecord('policy', p.id)}
                            title={`Open policy (${p.status})`}
                          >
                            <td style={cell}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  overflow: 'hidden'
                                }}
                              >
                                <TypeChip code={p.typeCode} />
                                <span
                                  style={{
                                    ...mono,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    // Superseded / cancelled / expired policies read muted
                                    color:
                                      p.status === 'active' ? undefined : 'var(--text-secondary)'
                                  }}
                                >
                                  {p.policyNumber}
                                </span>
                              </div>
                              <div className="muted" style={{ fontSize: '0.7rem' }}>
                                {formatDate(p.inceptionDate) || '-'} -{' '}
                                {formatDate(p.expiryDate) || '-'}
                              </div>
                            </td>
                            <td style={cell} title={p.vesselName || ''}>
                              {p.vesselName || <span className="muted">-</span>}
                            </td>
                            <td style={cell} className="num">
                              {money(p.premiumAmount, p.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {data.vesselPolicies.length > 0 && (
                <>
                  {subTitle('Vessels on active policies', data.vesselPolicies.length)}
                  <div className="table-wrap">
                    <table className="data-table" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...head, width: '40%' }}>Vessel</th>
                          <th style={{ ...head, width: '32%' }}>Type</th>
                          <th style={{ ...head, width: '28%' }}>Ends</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.vesselPolicies.map((vp) => (
                          <tr
                            key={vp.id}
                            className="clickable"
                            onClick={() => openRecord('vessel', vp.vesselId)}
                            title={`Open vessel${vp.policyNumber ? ' - ' + vp.policyNumber : ''}`}
                          >
                            <td style={{ ...cell, textTransform: 'uppercase' }}>{vp.vesselName}</td>
                            <td style={cell} title={vp.policyTypeName}>
                              {vp.policyTypeName}
                            </td>
                            <td style={cell}>{formatDate(vp.endDate) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {data.receipts.length > 0 && (
                <>
                  {subTitle('Receipts', data.receipts.length)}
                  <div className="table-wrap">
                    <table className="data-table" style={{ tableLayout: 'fixed' }}>
                      <thead>
                        <tr>
                          <th style={{ ...head, width: '36%' }}>Receipt</th>
                          <th style={{ ...head, width: '26%' }}>Date</th>
                          <th style={{ ...head, width: '38%' }} className="num">
                            Amount
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.receipts.map((r) => (
                          <tr key={r.id} title={r.vesselName || undefined}>
                            <td style={{ ...cell, ...mono }}>{r.receiptNumber}</td>
                            <td style={cell}>{formatDate(r.receiptDate) || '-'}</td>
                            <td style={cell} className="num">
                              {money(r.amount, r.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
