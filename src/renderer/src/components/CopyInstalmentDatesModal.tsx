import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Search } from 'lucide-react'
import type { PolicyDocInstalment, PolicyListRow } from '../../../shared/types'
import { formatDate } from '../utils/dateUtils'
import { EmptyState, Modal, Spinner } from './ui'

interface Props {
  /** The policy being edited (left out of the list) */
  excludePolicyId?: string
  /** Policies starting on this date are listed first (a fleet usually shares its dates) */
  inceptionDate?: string
  onApply: (dates: string[]) => void
  onClose: () => void
}

/**
 * Pick another policy and copy its instalment due dates (converter and Policy Detail). Only the
 * dates and their number are taken; the amounts are split again on this policy's own premium.
 */
export default function CopyInstalmentDatesModal({
  excludePolicyId,
  inceptionDate,
  onApply,
  onClose
}: Props): React.JSX.Element {
  const [policies, setPolicies] = useState<PolicyListRow[] | null>(null)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<PolicyListRow | null>(null)
  const [dates, setDates] = useState<string[] | null>(null)

  useEffect(() => {
    let live = true
    window.api
      .getPoliciesList()
      .then((rows) => live && setPolicies(Array.isArray(rows) ? rows : []))
      .catch(() => live && setPolicies([]))
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!picked) return
    let live = true
    window.api
      .policyGetInstalments(picked.id)
      .then((rows: PolicyDocInstalment[]) => {
        if (!live) return
        const list = (Array.isArray(rows) ? rows : [])
          .slice()
          .sort((a, b) => a.instalmentNumber - b.instalmentNumber)
          .map((r) => String(r.dueDate || '').slice(0, 10))
        setDates(list)
      })
      .catch(() => live && setDates([]))
    return () => {
      live = false
    }
  }, [picked])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const day = (d?: string | null): string => String(d || '').slice(0, 10)
    return (policies || [])
      .filter((p) => p.id !== excludePolicyId && p.status !== 'superseded')
      .filter(
        (p) =>
          !q ||
          (p.policyNumber || '').toLowerCase().includes(q) ||
          (p.vesselName || '').toLowerCase().includes(q) ||
          (p.customerName || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const sa = inceptionDate && day(a.inceptionDate) === day(inceptionDate) ? 0 : 1
        const sb = inceptionDate && day(b.inceptionDate) === day(inceptionDate) ? 0 : 1
        return sa - sb || String(b.createdAt).localeCompare(String(a.createdAt))
      })
      .slice(0, 60)
  }, [policies, search, excludePolicyId, inceptionDate])

  return (
    <Modal
      title="Copy instalment dates"
      icon={<CalendarDays size={18} />}
      onClose={onClose}
      width={620}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!dates || dates.length === 0 || dates.some((d) => !d)}
            onClick={() => dates && onApply(dates)}
          >
            {dates && dates.length > 0
              ? `Use these ${dates.length} date${dates.length === 1 ? '' : 's'}`
              : 'Use these dates'}
          </button>
        </>
      }
    >
      <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 10px' }}>
        The number of instalments and their due dates are copied; the amounts are split again on
        this policy&apos;s premium.
      </p>
      <div style={{ position: 'relative', marginBottom: '10px' }}>
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
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search policy number, vessel or customer..."
          style={{ width: '100%', paddingLeft: '30px' }}
        />
      </div>
      {policies === null ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Spinner size={18} label="Loading policies..." />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState title="No policies found" text="Try another search." />
      ) : (
        <div className="table-wrap" style={{ maxHeight: '260px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Policy</th>
                <th>Vessel</th>
                <th style={{ width: '110px' }}>Inception</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  className={`clickable${picked?.id === p.id ? ' selected' : ''}`}
                  onClick={() => {
                    setDates(null)
                    setPicked(p)
                  }}
                >
                  <td style={{ fontWeight: 600 }}>{p.policyNumber}</td>
                  <td>{p.vesselName || '-'}</td>
                  <td className="muted">{formatDate(p.inceptionDate) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {picked && (
        <div style={{ marginTop: '12px', fontSize: '0.85rem' }}>
          <div className="field-label" style={{ marginBottom: '6px' }}>
            Instalments of {picked.policyNumber}
          </div>
          {dates === null ? (
            <Spinner size={14} label="Loading..." />
          ) : dates.length === 0 ? (
            <span className="muted">This policy has no instalments.</span>
          ) : (
            <ol style={{ margin: 0, paddingLeft: '20px', lineHeight: 1.7 }}>
              {dates.map((d, i) => (
                <li key={i}>{formatDate(d) || 'No date'}</li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Modal>
  )
}
