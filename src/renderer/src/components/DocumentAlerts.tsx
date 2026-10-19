import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileText,
  Gauge,
  Layers,
  List,
  Search,
  ShieldAlert
} from 'lucide-react'
import type { VesselCustomerMap } from '../../../shared/types'
import { formatDate } from '../utils/dateUtils'
import { daysText, pct, type DocAlert, type VesselCompleteness } from '../utils/docAlerts'
import { EmptyState, SegmentedControl, Spinner } from './ui'
import AlertsByCustomer from './AlertsByCustomer'

type VesselSection = 'documents' | 'assureds' | 'surveys' | 'policies'
type View = 'todo' | 'vessel' | 'document' | 'customer' | 'completeness'
type Kind = DocAlert['type']
/** A to-do row: missing documents of one vessel are folded into one row */
type Row = DocAlert & { missingDocs?: string[] }

/** Vessel tab that shows what an alert is about (entity documents live with the assureds) */
const alertSection = (alert: Pick<DocAlert, 'category'>): VesselSection =>
  alert.category === 'entity'
    ? 'assureds'
    : alert.category === 'endorsement'
      ? 'surveys'
      : 'documents'

const PAGE_SIZE = 50
const VIEW_KEY = 'doc_alerts_view'

const readView = (): View => {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    if (
      v === 'todo' ||
      v === 'vessel' ||
      v === 'document' ||
      v === 'customer' ||
      v === 'completeness'
    )
      return v
  } catch {
    /* storage unavailable */
  }
  return 'todo'
}

const typeColor = (a: DocAlert): string =>
  a.type === 'expired'
    ? 'var(--danger)'
    : a.type === 'soon'
      ? 'var(--warning)'
      : 'var(--accent-primary)'

interface Props {
  alerts: DocAlert[]
  completeness: VesselCompleteness[]
  customers: VesselCustomerMap
  loading: boolean
  onOpenVessel?: (vesselId: string, section?: VesselSection) => void
  onOpenEntity?: (entityId: string) => void
}

/**
 * Compliance Center "Document Alerts": a to-do list of expired / expiring documents (missing
 * ones only where a renewal or quotation is coming up), groupings as options, and each vessel's
 * documents completeness.
 */
export default function DocumentAlerts({
  alerts,
  completeness,
  customers,
  loading,
  onOpenVessel,
  onOpenEntity
}: Props): React.JSX.Element {
  const [view, setViewRaw] = useState<View>(readView)
  const setView = (v: View): void => {
    setViewRaw(v)
    setPage(0)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      /* storage unavailable */
    }
  }
  // Expired + expiring by default; missing (renewal / quotation coming up) one click away
  const [kinds, setKinds] = useState<Set<Kind>>(() => new Set<Kind>(['expired', 'soon']))
  const [scoreFilter, setScoreFilter] = useState<'incomplete' | 'busy' | 'all'>('incomplete')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (key: string): void =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const customerNames = (vesselId: string): string =>
    (customers[vesselId] || []).map((c) => c.name).join(', ')

  const counts = useMemo(() => {
    const c = { expired: 0, soon: 0, missing: 0 }
    const vessels = new Set<string>()
    for (const a of alerts) {
      if (a.type !== 'missing') c[a.type]++
      else if (a.category === 'endorsement') c.missing++
      else if (!vessels.has(a.vesselId)) {
        vessels.add(a.vesselId)
        c.missing++
      }
    }
    return c
  }, [alerts])

  const q = search.trim().toLowerCase()
  const shown = useMemo(
    () =>
      alerts.filter(
        (a) =>
          kinds.has(a.type) &&
          (!q ||
            a.vessel.toLowerCase().includes(q) ||
            a.document.toLowerCase().includes(q) ||
            (a.otherVessels || []).some((v) => v.toLowerCase().includes(q)) ||
            customerNames(a.vesselId).toLowerCase().includes(q))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alerts, kinds, q, customers]
  )

  const scores = useMemo(
    () =>
      completeness.filter(
        (c) =>
          (scoreFilter === 'all' || (scoreFilter === 'busy' ? c.busy : c.have < c.total)) &&
          (!q ||
            c.vessel.toLowerCase().includes(q) ||
            customerNames(c.vesselId).toLowerCase().includes(q))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [completeness, scoreFilter, q, customers]
  )
  const fleetScore = useMemo(() => {
    const have = completeness.reduce((s, c) => s + c.have, 0)
    const total = completeness.reduce((s, c) => s + c.total, 0)
    return {
      pct: pct({ have, total }),
      complete: completeness.filter((c) => c.have >= c.total).length
    }
  }, [completeness])

  const groups = useMemo(() => {
    if (view !== 'vessel' && view !== 'document') return []
    const map = new Map<
      string,
      { key: string; title: string; vesselId?: string; alerts: DocAlert[] }
    >()
    for (const a of shown) {
      const key = view === 'vessel' ? a.vesselId : a.document.replace(/\s*\(.*\)$/, '')
      if (!map.has(key))
        map.set(key, {
          key,
          title: view === 'vessel' ? a.vessel : key,
          vesselId: view === 'vessel' ? a.vesselId : undefined,
          alerts: []
        })
      map.get(key)!.alerts.push(a)
    }
    return [...map.values()].sort((a, b) => b.alerts.length - a.alerts.length)
  }, [shown, view])

  // To do: a vessel's missing documents in one row (kept where its first one sorts)
  const todoRows = useMemo((): Row[] => {
    const rows: Row[] = []
    const folded = new Map<string, Row>()
    for (const a of shown) {
      if (a.type !== 'missing' || a.category === 'endorsement') {
        rows.push(a)
        continue
      }
      const row = folded.get(a.vesselId)
      if (row) {
        row.missingDocs!.push(a.document)
        continue
      }
      const r: Row = {
        ...a,
        id: `${a.vesselId}-missing`,
        category: 'vessel',
        missingDocs: [a.document]
      }
      folded.set(a.vesselId, r)
      rows.push(r)
    }
    return rows
  }, [shown])

  const list = view === 'completeness' ? scores : view === 'todo' ? todoRows : shown
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const pageSafe = Math.min(page, pages - 1)
  const pageSlice = <T,>(rows: T[]): T[] =>
    rows.slice(pageSafe * PAGE_SIZE, (pageSafe + 1) * PAGE_SIZE)

  const open = (a: DocAlert): void => onOpenVessel?.(a.vesselId, alertSection(a))

  const docCell = (a: Row): React.JSX.Element =>
    a.missingDocs ? (
      <div title={a.missingDocs.join(', ')}>
        <div style={{ fontWeight: 600 }}>
          {a.missingDocs.length === 1
            ? a.missingDocs[0]
            : `${a.missingDocs.length} documents missing`}
        </div>
        {a.missingDocs.length > 1 && (
          <div className="muted" style={{ fontSize: '0.76rem' }}>
            {a.missingDocs.slice(0, 4).join(', ')}
            {a.missingDocs.length > 4 ? ` +${a.missingDocs.length - 4}` : ''}
          </div>
        )}
      </div>
    ) : (
      <>
        {a.category === 'entity' && (
          <button
            type="button"
            title="Open this entity in the Directory"
            onClick={(e) => {
              e.stopPropagation()
              if (a.entityId) onOpenEntity?.(a.entityId)
            }}
            className="badge badge-violet"
            style={{ marginRight: '6px', border: 'none', cursor: 'pointer' }}
          >
            Entity
          </button>
        )}
        {a.document}
      </>
    )

  const statusCell = (a: DocAlert): React.JSX.Element => {
    const color = typeColor(a)
    const icon =
      a.type === 'expired' ? (
        <AlertCircle size={14} color="var(--danger)" />
      ) : a.type === 'soon' ? (
        <Clock size={14} color="var(--warning)" />
      ) : (
        <ShieldAlert size={14} color="var(--accent-primary)" />
      )
    const main =
      a.type === 'expired'
        ? `Expired ${daysText(a.days)}`.replace('Expired today', 'Expires today')
        : a.type === 'soon'
          ? `Expires ${daysText(a.days)}`
          : a.category === 'endorsement'
            ? 'Not issued'
            : 'Missing'
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.82rem' }}>
        <span style={{ marginTop: '2px' }}>{icon}</span>
        <div>
          <div style={{ color, fontWeight: 600 }}>{main}</div>
          {a.category === 'endorsement' && a.days !== null && (
            <div className="muted" style={{ fontSize: '0.76rem' }}>
              Reminder {daysText(a.days)}
            </div>
          )}
          {a.type === 'missing' && a.reason && a.category !== 'endorsement' && (
            <div className="muted" style={{ fontSize: '0.76rem' }}>
              {a.reason}
            </div>
          )}
        </div>
      </div>
    )
  }

  const vesselCell = (a: DocAlert): React.JSX.Element => (
    <>
      <span style={{ fontWeight: 600 }}>{a.vessel}</span>
      {a.otherVessels && a.otherVessels.length > 0 && (
        <span className="muted" title={a.otherVessels.join(', ')} style={{ fontSize: '0.76rem' }}>
          {' '}
          +{a.otherVessels.length} vessel{a.otherVessels.length === 1 ? '' : 's'}
        </span>
      )}
    </>
  )

  const openButton = (onClick: () => void, title: string): React.JSX.Element => (
    <button
      type="button"
      className="btn-ghost btn-sm"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
    >
      <ExternalLink size={14} />
    </button>
  )

  const alertRows = (rows: Row[], hideVessel = false): React.JSX.Element[] =>
    rows.map((a) => (
      <tr
        key={a.id}
        className="clickable"
        style={{ borderLeft: `4px solid ${typeColor(a)}` }}
        onClick={() => open(a)}
      >
        {!hideVessel && <td>{vesselCell(a)}</td>}
        <td>{docCell(a)}</td>
        <td className="muted" style={{ whiteSpace: 'nowrap' }}>
          {a.date !== '-' ? formatDate(a.date) || a.date : ''}
        </td>
        <td>{statusCell(a)}</td>
        {!hideVessel && (
          <td className="muted" style={{ fontSize: '0.8rem' }}>
            {customerNames(a.vesselId) || '-'}
          </td>
        )}
        <td style={{ width: '40px' }}>
          {openButton(
            () => open(a),
            a.category === 'entity'
              ? "Open the vessel's assureds"
              : a.category === 'endorsement'
                ? "Open the vessel's surveys"
                : "Open the vessel's documents"
          )}
        </td>
      </tr>
    ))

  const alertHead = (hideVessel = false): React.JSX.Element => (
    <thead>
      <tr>
        {!hideVessel && <th>Vessel</th>}
        <th>Document</th>
        <th style={{ width: '110px' }}>Date</th>
        <th style={{ width: '240px' }}>Status</th>
        {!hideVessel && <th style={{ width: '200px' }}>Customer</th>}
        <th style={{ width: '40px' }} />
      </tr>
    </thead>
  )

  const pager =
    pages > 1 ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderTop: '1px solid var(--table-border)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)'
        }}
      >
        <span>
          {pageSafe * PAGE_SIZE + 1}-{Math.min((pageSafe + 1) * PAGE_SIZE, list.length)} of{' '}
          {list.length}
        </span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className="btn-secondary btn-sm"
            disabled={pageSafe === 0}
            onClick={() => setPage(pageSafe - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>
          <span>
            {pageSafe + 1} / {pages}
          </span>
          <button
            className="btn-secondary btn-sm"
            disabled={pageSafe >= pages - 1}
            onClick={() => setPage(pageSafe + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    ) : null

  const chip = (
    key: Kind,
    label: string,
    count: number,
    color: string,
    title?: string
  ): React.JSX.Element => (
    <button
      key={key}
      onClick={() => {
        setKinds((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
        setPage(0)
      }}
      className={kinds.has(key) ? 'chip active' : 'chip'}
      aria-pressed={kinds.has(key)}
      title={title}
    >
      {color && (
        <span
          aria-hidden="true"
          style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}
        />
      )}
      {label}
      <span className="chip-count">{count}</span>
    </button>
  )

  const scoreChip = (
    key: 'incomplete' | 'busy' | 'all',
    label: string,
    count: number
  ): React.JSX.Element => (
    <button
      key={key}
      onClick={() => {
        setScoreFilter(key)
        setPage(0)
      }}
      className={scoreFilter === key ? 'chip active' : 'chip'}
      aria-pressed={scoreFilter === key}
    >
      {label}
      <span className="chip-count">{count}</span>
    </button>
  )

  let body: React.JSX.Element
  if (loading) {
    body = (
      <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
        <Spinner size={20} label="Checking the fleet's documents..." />
      </div>
    )
  } else if (view === 'completeness') {
    body =
      scores.length === 0 ? (
        <div className="glass-card">
          <EmptyState
            icon={<CheckCircle size={40} color="var(--success)" />}
            title={q ? 'No vessel matches your search' : 'Nothing to show'}
            text={
              scoreFilter === 'incomplete'
                ? 'Every vessel has all its required documents.'
                : 'No vessels in this list.'
            }
          />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <caption className="sr-only">Documents completeness per vessel</caption>
            <thead>
              <tr>
                <th>Vessel</th>
                <th style={{ width: '200px' }}>Customer</th>
                <th style={{ width: '170px' }}>Documents</th>
                <th>Missing</th>
                <th className="num" style={{ width: '80px' }}>
                  Expired
                </th>
                <th style={{ width: '40px' }} />
              </tr>
            </thead>
            <tbody>
              {pageSlice(scores).map((c) => {
                const p = pct(c)
                const color =
                  p >= 100 ? 'var(--success)' : p >= 70 ? 'var(--warning)' : 'var(--danger)'
                return (
                  <tr
                    key={c.vesselId}
                    className="clickable"
                    onClick={() => onOpenVessel?.(c.vesselId, 'documents')}
                  >
                    <td>
                      <span style={{ fontWeight: 600 }}>{c.vessel}</span>
                      {c.busy && (
                        <span
                          className="badge badge-warning"
                          style={{ marginLeft: '8px', whiteSpace: 'nowrap' }}
                          title="Renewal within 30 days or a quotation in progress: its missing documents are in the to-do list"
                        >
                          Coming up
                        </span>
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: '0.8rem' }}>
                      {customerNames(c.vesselId) || '-'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            borderRadius: '3px',
                            background: 'var(--input-bg)',
                            overflow: 'hidden'
                          }}
                        >
                          <div style={{ width: `${p}%`, height: '100%', background: color }} />
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '44px' }}>
                          {c.have}/{c.total}
                        </span>
                      </div>
                    </td>
                    <td
                      className="muted"
                      style={{ fontSize: '0.8rem' }}
                      title={c.missing.join('\n')}
                    >
                      {c.missing.length === 0
                        ? '-'
                        : c.missing.slice(0, 3).join(', ') +
                          (c.missing.length > 3 ? ` +${c.missing.length - 3}` : '')}
                    </td>
                    <td className="num" style={{ color: c.expired ? 'var(--danger)' : undefined }}>
                      {c.expired || '-'}
                    </td>
                    <td>
                      {openButton(
                        () => onOpenVessel?.(c.vesselId, 'documents'),
                        "Open the vessel's documents"
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {pager}
        </div>
      )
  } else if (alerts.length === 0) {
    body = (
      <div className="glass-card">
        <EmptyState
          icon={<CheckCircle size={40} color="var(--success)" />}
          title="Nothing to chase"
          text="No expired or expiring documents, and nothing missing on vessels renewing soon or being quoted."
        />
      </div>
    )
  } else if (shown.length === 0) {
    body = (
      <div className="glass-card">
        <EmptyState
          icon={<Search size={40} />}
          title="No alerts match your filter"
          text={`${alerts.length} alert${alerts.length === 1 ? '' : 's'} in total.`}
          action={
            <button
              className="btn-secondary"
              onClick={() => {
                setKinds(new Set<Kind>(['expired', 'soon', 'missing']))
                setSearch('')
              }}
            >
              Clear filters
            </button>
          }
        />
      </div>
    )
  } else if (view === 'customer') {
    body = (
      <AlertsByCustomer
        alerts={shown}
        onOpenAlert={(a) => onOpenVessel?.(a.vesselId, alertSection(a))}
      />
    )
  } else if (view === 'vessel' || view === 'document') {
    const allOpen = groups.length > 0 && groups.every((g) => expanded.has(g.key))
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div>
          <button
            className="btn-ghost btn-sm"
            onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}
          >
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
        </div>
        {groups.map((g) => {
          const isOpen = expanded.has(g.key)
          const n = { expired: 0, soon: 0, missing: 0 }
          for (const a of g.alerts) n[a.type]++
          return (
            <div key={g.key} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={isOpen}
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: isOpen ? '1px solid var(--table-border)' : 'none',
                  background: 'var(--table-header-bg)',
                  cursor: 'pointer'
                }}
                onClick={() => toggle(g.key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggle(g.key)
                  }
                }}
              >
                <ChevronDown
                  size={14}
                  style={{
                    transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)',
                    transition: 'transform 0.15s',
                    color: 'var(--text-secondary)'
                  }}
                />
                {view === 'document' && (
                  <FileText size={15} style={{ color: 'var(--accent-primary)' }} />
                )}
                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{g.title}</span>
                {view === 'vessel' && customerNames(g.key) && (
                  <span className="muted" style={{ fontSize: '0.78rem' }}>
                    {customerNames(g.key)}
                  </span>
                )}
                <span
                  style={{ marginLeft: 'auto', display: 'flex', gap: '10px', fontSize: '0.78rem' }}
                >
                  {n.expired > 0 && (
                    <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                      {n.expired} expired
                    </span>
                  )}
                  {n.soon > 0 && (
                    <span style={{ color: 'var(--warning)', fontWeight: 700 }}>
                      {n.soon} expiring
                    </span>
                  )}
                  {n.missing > 0 && (
                    <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                      {n.missing} missing
                    </span>
                  )}
                </span>
              </div>
              {isOpen && (
                <table className="data-table">
                  {alertHead(view === 'vessel')}
                  <tbody>{alertRows(g.alerts, view === 'vessel')}</tbody>
                </table>
              )}
            </div>
          )
        })}
      </div>
    )
  } else {
    body = (
      <div className="table-wrap">
        <table className="data-table">
          <caption className="sr-only">Documents to chase</caption>
          {alertHead()}
          <tbody>{alertRows(pageSlice(todoRows))}</tbody>
        </table>
        {pager}
      </div>
    )
  }

  return (
    <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents">
      <div
        style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '14px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <SegmentedControl
          value={view}
          onChange={setView}
          items={[
            { key: 'todo', label: 'To do', icon: <List size={13} /> },
            { key: 'vessel', label: 'By vessel', icon: <Layers size={13} /> },
            { key: 'document', label: 'By document', icon: <FileText size={13} /> },
            { key: 'customer', label: 'By customer', icon: <Briefcase size={13} /> },
            { key: 'completeness', label: 'Completeness', icon: <Gauge size={13} /> }
          ]}
        />
        <div style={{ position: 'relative', marginLeft: 'auto' }}>
          <Search
            size={14}
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-secondary)'
            }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(0)
            }}
            placeholder="Search vessels, documents, customers..."
            style={{ paddingLeft: '30px', width: '260px' }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '16px',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}
      >
        {view === 'completeness' ? (
          <>
            {scoreChip(
              'incomplete',
              'Incomplete',
              completeness.filter((c) => c.have < c.total).length
            )}
            {scoreChip(
              'busy',
              'Renewal or quotation coming up',
              completeness.filter((c) => c.busy).length
            )}
            {scoreChip('all', 'All vessels', completeness.length)}
            {!loading && (
              <span className="muted" style={{ fontSize: '0.8rem', marginLeft: '8px' }}>
                Fleet {fleetScore.pct}% complete - {fleetScore.complete} of {completeness.length}{' '}
                vessels have every required document
              </span>
            )}
          </>
        ) : (
          <>
            {chip('expired', 'Expired', counts.expired, 'var(--danger)')}
            {chip('soon', 'Expiring in 30 days', counts.soon, 'var(--warning)')}
            {chip(
              'missing',
              'Missing before renewal / quotation',
              counts.missing,
              'var(--accent-primary)',
              'Vessels renewing within 30 days or with a quotation in progress that miss required documents (one row per vessel), and endorsements not issued. Other missing documents are in Completeness.'
            )}
            {!loading && (
              <button
                type="button"
                className="btn-ghost btn-sm"
                style={{ marginLeft: '4px' }}
                onClick={() => setView('completeness')}
                title="Missing documents on the other vessels are in Completeness"
              >
                Fleet documents {fleetScore.pct}% complete
              </button>
            )}
          </>
        )}
      </div>

      {body}
    </div>
  )
}
