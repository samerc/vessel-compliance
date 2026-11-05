import { useState } from 'react'
import type { VesselNameHistory } from '../../../shared/types'
import { Field, Modal } from './ui'
import { confirmDialog } from './DialogHost'
import { formatDate } from '../utils/dateUtils'
import { todayIso } from '../utils/policyAssureds'

/** Saving a changed vessel name: a real rename keeps the old name, a typo does not */
export function RenameVesselModal({
  from,
  to,
  onCancel,
  onConfirm
}: {
  from: string
  to: string
  onCancel: () => void
  onConfirm: (change: { kind: 'rename' | 'typo'; date?: string }) => void
}): React.JSX.Element {
  const [kind, setKind] = useState<'rename' | 'typo'>('rename')
  const [date, setDate] = useState(todayIso())

  const option = (value: 'rename' | 'typo', title: string, text: string): React.JSX.Element => (
    <label
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        padding: '12px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.88rem',
        border:
          kind === value ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: kind === value ? 'var(--accent-tint)' : 'transparent'
      }}
    >
      <input
        type="radio"
        name="vessel-name-change"
        checked={kind === value}
        onChange={() => setKind(value)}
      />
      <span>
        <strong style={{ fontWeight: 600 }}>{title}</strong>{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
      </span>
    </label>
  )

  return (
    <Modal
      title="Vessel name changed"
      onClose={onCancel}
      width={620}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={kind === 'rename' && !date}
            onClick={() => onConfirm(kind === 'rename' ? { kind, date } : { kind })}
          >
            Save
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
          {from} to {to}
        </div>
        {option(
          'rename',
          'The vessel was renamed.',
          'The old name stays as a former name, and policies from before this date keep showing it.'
        )}
        {kind === 'rename' && (
          <div className="form-grid cols-2">
            <Field label="Renamed on" required>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>
        )}
        {option(
          'typo',
          'It was a typo.',
          'The corrected name applies everywhere. No former name is kept.'
        )}
      </div>
    </Modal>
  )
}

/** Correct the date of a former name, or remove one that was really a typo */
export function FormerNamesModal({
  history,
  onChanged,
  onClose,
  onError
}: {
  history: VesselNameHistory[]
  onChanged: () => void
  onClose: () => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null)
  const [date, setDate] = useState('')

  const saveDate = async (id: string): Promise<void> => {
    try {
      await window.api.setVesselNameHistoryDate(id, date)
      setEditing(null)
      onChanged()
    } catch (e) {
      onError((e instanceof Error && e.message) || 'Could not change the date')
    }
  }
  const remove = async (h: VesselNameHistory): Promise<void> => {
    if (!(await confirmDialog(`Remove ${h.previousName} from the former names? It was a typo.`)))
      return
    try {
      await window.api.deleteVesselNameHistory(h.id)
      onChanged()
    } catch (e) {
      onError((e instanceof Error && e.message) || 'Could not remove the former name')
    }
  }

  return (
    <Modal
      title="Former names"
      onClose={onClose}
      width={620}
      footer={
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Until</th>
              <th>Changed by</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id}>
                <td style={{ fontWeight: 600 }}>{h.previousName}</td>
                <td>
                  {editing === h.id ? (
                    <input
                      type="date"
                      aria-label={`Date of ${h.previousName}`}
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  ) : (
                    formatDate(h.changedAt)
                  )}
                </td>
                <td className="muted">{h.changedBy || '-'}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {editing === h.id ? (
                    <>
                      <button
                        className="btn-primary btn-sm"
                        disabled={!date}
                        onClick={() => saveDate(h.id)}
                      >
                        Save
                      </button>{' '}
                      <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setEditing(h.id)
                          setDate(String(h.changedAt || '').slice(0, 10))
                        }}
                      >
                        Edit date
                      </button>{' '}
                      <button className="btn-ghost btn-sm" onClick={() => remove(h)}>
                        It was a typo, remove
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
