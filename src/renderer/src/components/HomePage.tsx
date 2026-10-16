import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Sun } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { NavTarget } from '../features'
import type {
  ComplianceCheckResult,
  DocumentType,
  OpenDefectRow,
  PolicyRenewalRow,
  Quotation,
  RecentItem,
  Vessel,
  VesselDocument
} from '../../../shared/types'

// Home: what needs the user today. The customizable widget dashboard is the second view.

type QuotationRow = Quotation & { vesselCount?: number }
type VesselSection = 'documents' | 'policies' | 'surveys'

interface Props {
  onNavigate: (target: NavTarget) => void
  onOpenVessel: (vesselId: string, section: VesselSection) => void
  onOpenQuotation: (quotationId: string) => void
  onOpenRecent: (item: RecentItem) => void
  /** The widget dashboard, shown when the user picks the Dashboard view; gets the view switch */
  dashboard: (viewSwitch: React.ReactNode) => React.ReactNode
}

interface ExpiredDoc {
  vesselId: string
  vesselName: string
  docName: string
  expiryDate: string
}

interface Alert {
  key: string
  tone: 'danger' | 'warning'
  title: string
  detail: string
  date: string
  open: () => void
}

const DAY = 86400000

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function shortDate(s: string): string {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// Category colours for policy / quotation types (same in both themes, tinted for the chip)
const TYPE_COLORS: Record<string, string> = {
  P: '#2E5C99',
  H: '#9B3D78',
  W: '#A86A08',
  F: '#1D7A70',
  C: '#4A6A8A',
  L: '#6B5BA8'
}

function typeColorFor(code?: string | null, name?: string | null): string {
  if (code && TYPE_COLORS[code]) return TYPE_COLORS[code]
  const n = (name || '').toLowerCase()
  if (n.includes('p&i') || n.includes('protection')) return TYPE_COLORS.P
  if (n.includes('hull') || n.includes('h&m')) return TYPE_COLORS.H
  if (n.includes('war')) return TYPE_COLORS.W
  if (n.includes('fd')) return TYPE_COLORS.F
  return '#5F6F82'
}

function typeShortName(code?: string | null, name?: string | null): string {
  const byCode: Record<string, string> = { P: 'P&I', H: 'H&M', W: 'War', F: 'FD&D' }
  if (code && byCode[code]) return byCode[code]
  return name || '-'
}

const tint = (color: string, pct = 14): string =>
  `color-mix(in srgb, ${color} ${pct}%, transparent)`

function TypeChip({
  code,
  name
}: {
  code?: string | null
  name?: string | null
}): React.JSX.Element {
  const c = typeColorFor(code, name)
  return (
    <span
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: '6px',
        background: tint(c),
        color: `color-mix(in srgb, ${c} 55%, var(--text-primary))`,
        whiteSpace: 'nowrap'
      }}
    >
      {typeShortName(code, name)}
    </span>
  )
}

function Pill({ label, color }: { label: string; color: string }): React.JSX.Element {
  return (
    <span
      style={{
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: '999px',
        background: tint(color, 16),
        color: `color-mix(in srgb, ${color} 58%, var(--text-primary))`,
        whiteSpace: 'nowrap'
      }}
    >
      {label}
    </span>
  )
}

const QUOTATION_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: '#5F6F82' },
  sent: { label: 'Sent', color: '#2E5C99' },
  approved: { label: 'Approved', color: 'var(--success)' },
  exported: { label: 'Exported', color: '#1D7A70' },
  rejected: { label: 'Rejected', color: 'var(--danger)' },
  converted: { label: 'Converted', color: '#6B5BA8' }
}

const RECENT_TYPE_LABEL: Record<string, string> = {
  vessel: 'Vessel',
  entity: 'Entity',
  quotation: 'Quotation',
  policy: 'Policy'
}

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--glass-border-color)',
  borderRadius: 'var(--radius-card)',
  overflow: 'hidden'
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '11px 16px',
  border: 'none',
  borderTop: '1px solid var(--glass-border-color)',
  background: 'transparent',
  color: 'var(--text-primary)',
  font: 'inherit',
  fontSize: '0.88rem',
  textAlign: 'left',
  cursor: 'pointer'
}

function Section({
  title,
  action,
  children
}: {
  title: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section style={cardStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px'
        }}
      >
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h2>
        {action && (
          <button className="btn-link" onClick={action.onClick} style={linkStyle}>
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

const linkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  color: 'var(--accent-primary)',
  font: 'inherit',
  fontSize: '0.82rem',
  fontWeight: 500,
  cursor: 'pointer'
}

function EmptyRow({ text }: { text: string }): React.JSX.Element {
  return (
    <div
      style={{
        padding: '14px 16px',
        borderTop: '1px solid var(--glass-border-color)',
        color: 'var(--text-secondary)',
        fontSize: '0.85rem'
      }}
    >
      {text}
    </div>
  )
}

function AttentionCard({
  title,
  count,
  badge,
  link,
  onClick,
  loading
}: {
  title: string
  count: number
  badge?: { label: string; color: string }
  link: string
  onClick: () => void
  loading: boolean
}): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      className="home-attention"
      style={{
        ...cardStyle,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '18px',
        textAlign: 'left',
        font: 'inherit',
        color: 'var(--text-primary)',
        cursor: 'pointer'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          width: '100%'
        }}
      >
        <span style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
          {title}
        </span>
        {badge && !loading && <Pill label={badge.label} color={badge.color} />}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 600, lineHeight: 1.1 }}>
        {loading ? '–' : count}
      </div>
      <div style={{ fontSize: '0.82rem', fontWeight: 500, color: 'var(--accent-primary)' }}>
        {link}
      </div>
    </button>
  )
}

export default function HomePage({
  onNavigate,
  onOpenVessel,
  onOpenQuotation,
  onOpenRecent,
  dashboard
}: Props): React.JSX.Element {
  const { user, hasPermission } = useAuth()
  const viewKey = `home_view_u${user?.id ?? ''}`
  const [view, setView] = useState<'today' | 'dashboard'>(() => {
    try {
      return localStorage.getItem(viewKey) === 'dashboard' ? 'dashboard' : 'today'
    } catch {
      return 'today'
    }
  })
  const pickView = (v: 'today' | 'dashboard'): void => {
    setView(v)
    try {
      localStorage.setItem(viewKey, v)
    } catch {
      // per-viewer convenience only
    }
  }

  const canRenewals = hasPermission('policies:view')
  const canQuotations = hasPermission('quotations:view')
  const canCompliance = hasPermission('compliance:view')
  const canSurveys = hasPermission('surveys:view')

  const [loading, setLoading] = useState(true)
  const [pipeline, setPipeline] = useState<PolicyRenewalRow[]>([])
  const [monthRenewals, setMonthRenewals] = useState<PolicyRenewalRow[]>([])
  const [quotations, setQuotations] = useState<QuotationRow[]>([])
  const [expiredDocs, setExpiredDocs] = useState<ExpiredDoc[]>([])
  const [pendingSanctions, setPendingSanctions] = useState<ComplianceCheckResult[]>([])
  const [openDefects, setOpenDefects] = useState<OpenDefectRow[]>([])
  const [recent, setRecent] = useState<RecentItem[]>([])

  useEffect(() => {
    if (view !== 'today') return
    let cancelled = false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const in30 = new Date(today.getTime() + 30 * DAY)
    const arr = <T,>(d: unknown): T[] => (Array.isArray(d) ? (d as T[]) : [])

    const loads: Promise<unknown>[] = [
      window.api.recentItemsGet().then((d) => !cancelled && setRecent(arr<RecentItem>(d)))
    ]
    if (canRenewals) {
      loads.push(
        window.api
          .getRenewalPipeline(isoDate(today), isoDate(in30))
          .then((d) => !cancelled && setPipeline(arr<PolicyRenewalRow>(d))),
        window.api
          .getPolicyRenewalsByMonth(today.getFullYear(), today.getMonth() + 1)
          .then((d) => !cancelled && setMonthRenewals(arr<PolicyRenewalRow>(d)))
      )
    }
    if (canQuotations) {
      loads.push(
        window.api.getQuotations().then((d) => !cancelled && setQuotations(arr<QuotationRow>(d)))
      )
    }
    if (canCompliance) {
      loads.push(
        window.api
          .complianceGetPendingResults()
          .then((d) => !cancelled && setPendingSanctions(arr<ComplianceCheckResult>(d))),
        Promise.all([
          window.api.getVessels(),
          window.api.getVesselDocuments(),
          window.api.getDocumentTypes()
        ]).then(([v, d, t]) => {
          if (cancelled) return
          setExpiredDocs(
            findExpiredDocs(arr<Vessel>(v), arr<VesselDocument>(d), arr<DocumentType>(t), today)
          )
        })
      )
    }
    if (canSurveys) {
      loads.push(
        window.api
          .getOpenDefectsByVessel()
          .then((d) => !cancelled && setOpenDefects(arr<OpenDefectRow>(d)))
      )
    }
    // One failing source leaves its card empty; the rest still show
    void Promise.allSettled(loads).then(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [view, canRenewals, canQuotations, canCompliance, canSurveys])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const draftQuotations = useMemo(
    () => quotations.filter((q) => q.status === 'draft'),
    [quotations]
  )
  const myQuotations = useMemo(
    () =>
      quotations
        .filter((q) => q.createdBy === user?.id && q.status !== 'converted')
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
        .slice(0, 5),
    [quotations, user?.id]
  )
  const expiredVesselCount = useMemo(
    () => new Set(expiredDocs.map((d) => d.vesselId)).size,
    [expiredDocs]
  )
  const noStatusRenewals = pipeline.filter((r) => !r.renewalStatusId).length

  const monthRows = useMemo(() => {
    // Still to come first, then the ones already past this month
    const upcoming = monthRenewals.filter((r) => new Date(r.endDate) >= today)
    const past = monthRenewals.filter((r) => new Date(r.endDate) < today)
    return [...upcoming, ...past].slice(0, 6)
  }, [monthRenewals, today])

  const alerts = useMemo((): Alert[] => {
    const docs: Alert[] = []
    const policies: Alert[] = []
    const defects: Alert[] = []
    for (const d of [...expiredDocs].sort((a, b) => b.expiryDate.localeCompare(a.expiryDate))) {
      docs.push({
        key: `doc-${d.vesselId}-${d.docName}`,
        tone: 'danger',
        title: `${d.docName} expired`,
        detail: d.vesselName,
        date: d.expiryDate,
        open: () => onOpenVessel(d.vesselId, 'documents')
      })
    }
    const in14 = new Date(today.getTime() + 14 * DAY)
    for (const r of pipeline) {
      const end = new Date(r.endDate)
      if (end > in14) continue
      const days = Math.round((end.getTime() - today.getTime()) / DAY)
      policies.push({
        key: `pol-${r.id}`,
        tone: 'warning',
        title: `${r.policyTypeName} policy ends ${days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`,
        detail: r.vesselName,
        date: r.endDate,
        open: () => onOpenVessel(r.vesselId, 'policies')
      })
    }
    for (const d of openDefects) {
      if (!d.dueDate || new Date(d.dueDate) >= today) continue
      defects.push({
        key: `def-${d.defectId}`,
        tone: 'warning',
        title: 'Survey defect overdue',
        detail: d.defectNumber ? `${d.vesselName}, item ${d.defectNumber}` : d.vesselName,
        date: d.dueDate,
        open: () => onOpenVessel(d.vesselId, 'surveys')
      })
    }
    defects.sort((a, b) => b.date.localeCompare(a.date))
    // A few of each kind so expired documents do not hide the rest, then fill up to 6
    const picked = [...docs.slice(0, 3), ...policies.slice(0, 2), ...defects.slice(0, 2)]
    const rest = [...docs.slice(3), ...policies.slice(2), ...defects.slice(2)]
    return [...picked, ...rest].slice(0, 6)
  }, [expiredDocs, pipeline, openDefects, today, onOpenVessel])

  const cards = [
    canRenewals && {
      key: 'renewals',
      title: 'Renewals in 30 days',
      count: pipeline.length,
      badge:
        noStatusRenewals > 0
          ? { label: `${noStatusRenewals} without status`, color: 'var(--warning)' }
          : undefined,
      link: 'Open Renewals',
      onClick: () => onNavigate({ tab: 'renewals' })
    },
    canQuotations && {
      key: 'quotations',
      title: 'Draft quotations',
      count: draftQuotations.length,
      badge: (() => {
        const mine = draftQuotations.filter((q) => q.createdBy === user?.id).length
        return mine > 0 ? { label: `${mine} yours`, color: '#2E5C99' } : undefined
      })(),
      link: 'Open Quotations',
      onClick: () => onNavigate({ tab: 'quotations' })
    },
    canCompliance && {
      key: 'docs',
      title: 'Expired documents',
      count: expiredDocs.length,
      badge:
        expiredVesselCount > 0
          ? {
              label: `${expiredVesselCount} vessel${expiredVesselCount === 1 ? '' : 's'}`,
              color: 'var(--danger)'
            }
          : undefined,
      link: 'Open Compliance Center',
      onClick: () => onNavigate({ tab: 'compliance', sub: 'documents' })
    },
    canCompliance && {
      key: 'sanctions',
      title: 'Sanctions to review',
      count: pendingSanctions.length,
      badge:
        pendingSanctions.length > 0
          ? { label: 'Possible matches', color: 'var(--warning)' }
          : { label: 'All clear', color: 'var(--success)' },
      link: 'Review matches',
      onClick: () => onNavigate({ tab: 'compliance', sub: 'sanctions' })
    }
  ].filter(Boolean) as {
    key: string
    title: string
    count: number
    badge?: { label: string; color: string }
    link: string
    onClick: () => void
  }[]

  const needCount = cards.filter((c) => c.count > 0).length
  const firstName = (user?.fullName || user?.username || '').trim().split(/\s+/)[0]

  const viewSwitch = (
    <div
      role="group"
      aria-label="Home view"
      style={{
        display: 'inline-flex',
        padding: '3px',
        gap: '2px',
        borderRadius: '10px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--glass-border-color)'
      }}
    >
      {(
        [
          ['today', 'Today', <Sun key="i" size={14} />],
          ['dashboard', 'Dashboard', <LayoutGrid key="i" size={14} />]
        ] as const
      ).map(([id, label, icon]) => (
        <button
          key={id}
          onClick={() => pickView(id)}
          aria-pressed={view === id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: '7px',
            border: 'none',
            font: 'inherit',
            fontSize: '0.82rem',
            fontWeight: view === id ? 600 : 500,
            background: view === id ? 'var(--bg-card)' : 'transparent',
            color: view === id ? 'var(--text-primary)' : 'var(--text-secondary)',
            boxShadow: view === id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            cursor: 'pointer'
          }}
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  )

  if (view === 'dashboard') return <>{dashboard(viewSwitch)}</>

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '12px'
        }}
      >
        <div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {new Date().toLocaleDateString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: '1.65rem', fontWeight: 600 }}>
            {greeting()}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {!loading && cards.length > 0 && (
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              {needCount === 0
                ? 'Nothing needs you right now'
                : `${needCount} thing${needCount === 1 ? '' : 's'} need${needCount === 1 ? 's' : ''} your attention`}
            </span>
          )}
          {viewSwitch}
        </div>
      </div>

      {cards.length > 0 && (
        <section
          aria-label="Needs your attention"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '16px'
          }}
        >
          {cards.map((c) => (
            <AttentionCard {...c} key={c.key} loading={loading} />
          ))}
        </section>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', alignItems: 'flex-start' }}>
        <div
          style={{
            flex: '2 1 520px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          {canQuotations && (
            <Section
              title="My quotations"
              action={{ label: 'See all', onClick: () => onNavigate({ tab: 'quotations' }) }}
            >
              {myQuotations.length === 0 ? (
                <EmptyRow text={loading ? 'Loading…' : 'No open quotations of yours.'} />
              ) : (
                myQuotations.map((q) => {
                  const st = q.workflowStepName
                    ? { label: q.workflowStepName, color: q.workflowStepColor || '#5F6F82' }
                    : (QUOTATION_STATUS[q.status] ?? { label: q.status, color: '#5F6F82' })
                  return (
                    <button
                      key={q.id}
                      className="home-row"
                      style={rowStyle}
                      onClick={() => onOpenQuotation(q.id)}
                    >
                      <span
                        className="mono"
                        style={{ width: '160px', flexShrink: 0, color: 'var(--text-secondary)' }}
                      >
                        {q.referenceNumber}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {q.vesselName || q.title || '-'}
                        {(q.vesselCount ?? 0) > 1 && (
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                            {' '}
                            +{(q.vesselCount ?? 0) - 1}
                          </span>
                        )}
                      </span>
                      <TypeChip code={q.quotationTypeCode} name={q.quotationTypeName} />
                      <span style={{ width: '150px', textAlign: 'right', flexShrink: 0 }}>
                        <Pill label={st.label} color={st.color} />
                      </span>
                    </button>
                  )
                })
              )}
            </Section>
          )}

          {canRenewals && (
            <Section
              title="Renewals this month"
              action={{ label: 'Open Renewals', onClick: () => onNavigate({ tab: 'renewals' }) }}
            >
              {monthRows.length === 0 ? (
                <EmptyRow text={loading ? 'Loading…' : 'No renewals this month.'} />
              ) : (
                monthRows.map((r) => {
                  const past = new Date(r.endDate) < today
                  return (
                    <button
                      key={r.id}
                      className="home-row"
                      style={rowStyle}
                      onClick={() => onOpenVessel(r.vesselId, 'policies')}
                    >
                      <span
                        style={{
                          width: '64px',
                          flexShrink: 0,
                          fontSize: '0.82rem',
                          color: past ? 'var(--danger)' : 'var(--text-secondary)'
                        }}
                      >
                        {shortDate(r.endDate)}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {r.vesselName}
                      </span>
                      <TypeChip name={r.policyTypeName} />
                      <span style={{ width: '150px', textAlign: 'right', flexShrink: 0 }}>
                        {r.renewalStatusName ? (
                          <Pill
                            label={r.renewalStatusName}
                            color={r.renewalStatusColor || '#5F6F82'}
                          />
                        ) : (
                          <Pill label="No status" color="#5F6F82" />
                        )}
                      </span>
                    </button>
                  )
                })
              )}
            </Section>
          )}
        </div>

        <div
          style={{
            flex: '1 1 300px',
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
        >
          {(canCompliance || canRenewals || canSurveys) && (
            <Section title="Alerts">
              {alerts.length === 0 ? (
                <EmptyRow text={loading ? 'Loading…' : 'No alerts.'} />
              ) : (
                alerts.map((a) => (
                  <button
                    key={a.key}
                    className="home-row"
                    style={{ ...rowStyle, alignItems: 'flex-start' }}
                    onClick={a.open}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '4px',
                        marginTop: '7px',
                        flex: 'none',
                        background: a.tone === 'danger' ? 'var(--danger)' : 'var(--warning)'
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontWeight: 500 }}>{a.title}</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                        {a.detail}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-secondary)',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {shortDate(a.date)}
                    </span>
                  </button>
                ))
              )}
            </Section>
          )}

          <Section title="Recent">
            {recent.length === 0 ? (
              <EmptyRow text={loading ? 'Loading…' : 'Nothing opened yet.'} />
            ) : (
              recent.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  className="home-row"
                  style={rowStyle}
                  onClick={() => onOpenRecent(item)}
                >
                  <span
                    style={{
                      width: '72px',
                      flexShrink: 0,
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    {RECENT_TYPE_LABEL[item.itemType] ?? item.itemType}
                  </span>
                  <span
                    className={
                      item.itemType === 'quotation' || item.itemType === 'policy'
                        ? 'mono'
                        : undefined
                    }
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {item.itemLabel}
                  </span>
                </button>
              ))
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

// Same expiry rule as the Dashboard: active vessels, a filed document, annual documents
// follow the P&I policy end date
function findExpiredDocs(
  vessels: Vessel[],
  docs: VesselDocument[],
  docTypes: DocumentType[],
  today: Date
): ExpiredDoc[] {
  const active = vessels.filter((v) => v.isActive)
  const ids = new Set(active.map((v) => v.id))
  const docMap = new Map<string, VesselDocument>()
  for (const d of docs) if (ids.has(d.vesselId)) docMap.set(`${d.vesselId}:${d.documentTypeId}`, d)
  const out: ExpiredDoc[] = []
  for (const v of active) {
    for (const t of docTypes) {
      const doc = docMap.get(`${v.id}:${t.id}`)
      if (!doc?.filePath) continue
      const expiry = t.annualRenewal && v.policyExpiryDate ? v.policyExpiryDate : doc.expiryDate
      if (expiry && new Date(expiry) < today) {
        out.push({ vesselId: v.id, vesselName: v.name, docName: t.name, expiryDate: expiry })
      }
    }
  }
  return out
}
