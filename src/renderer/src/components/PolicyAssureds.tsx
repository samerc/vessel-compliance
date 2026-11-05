import { useEffect, useState } from 'react'
import { Plus, RefreshCw, X } from 'lucide-react'
import type { AssuredRole, VesselPolicyAssured } from '../../../shared/types'
import { Combobox, Field } from './ui'
import { formatDate } from '../utils/dateUtils'
import { asArray } from '../utils/ipc'
import { dayBefore, isCareOfRole, todayIso } from '../utils/policyAssureds'

/** The assureds shown on a policy of the vessel's Policies tab */
export function PolicyAssuredList({
  assureds,
  onAdd
}: {
  assureds?: VesselPolicyAssured[]
  onAdd?: () => void
}): React.JSX.Element {
  const list = assureds || []
  return (
    <div style={{ fontSize: '0.85rem', marginTop: '12px' }}>
      <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
        Assured on this policy
      </span>
      {list.length === 0 && (
        <div style={{ color: 'var(--text-secondary)' }}>
          Not recorded
          {onAdd && (
            <>
              {' · '}
              <button
                type="button"
                className="btn-ghost btn-sm"
                style={{ color: 'var(--accent-primary)', padding: 0 }}
                onClick={onAdd}
              >
                Add assured
              </button>
            </>
          )}
        </div>
      )}
      {list.map((a) => (
        <div key={a.id} style={a.toDate ? { color: 'var(--text-secondary)' } : undefined}>
          <span style={{ fontWeight: 500 }}>{a.entityName}</span>
          {a.role ? ` (${a.role})` : ''}
          {a.fromDate ? `, from ${formatDate(a.fromDate)}` : ''}
          {a.toDate ? `, to ${formatDate(a.toDate)}` : ''}
        </div>
      ))}
    </div>
  )
}

type EntityOption = { id: string; name: string }

/** The assured list in the policy form. The form saves it with the policy */
export function PolicyAssuredsEditor({
  vesselId,
  policyId,
  rows,
  onChange,
  entities
}: {
  vesselId: string
  policyId: string
  rows: VesselPolicyAssured[]
  onChange: (rows: VesselPolicyAssured[]) => void
  entities: EntityOption[]
}): React.JSX.Element {
  const [roles, setRoles] = useState<AssuredRole[]>([])
  const [adding, setAdding] = useState(false)
  const [addText, setAddText] = useState('')
  const [addEntity, setAddEntity] = useState<EntityOption | null>(null)
  const [addRole, setAddRole] = useState('')
  // The row being changed from a date (endorsement)
  const [changing, setChanging] = useState<string | null>(null)
  const [changeDate, setChangeDate] = useState(todayIso())
  const [changeText, setChangeText] = useState('')
  const [changeEntity, setChangeEntity] = useState<EntityOption | null>(null)

  useEffect(() => {
    let alive = true
    window.api
      .getAssuredRoles()
      .then((r) => {
        if (alive) setRoles(asArray<AssuredRole>(r))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const newRow = (e: EntityOption, role: string, fromDate?: string): VesselPolicyAssured => ({
    id: `new-${crypto.randomUUID()}`,
    policyId,
    entityId: e.id,
    entityName: e.name,
    role,
    fromDate: fromDate || null,
    toDate: null
  })
  const hasOpen = (entityId: string | null, role: string): boolean =>
    rows.some((r) => r.entityId === entityId && r.role === role && !r.toDate)

  const fillFromVessel = async (): Promise<void> => {
    const current = asArray<{ entityId: string; entityName?: string; role: string }>(
      await window.api.getVesselAssureds(vesselId)
    )
    const missing = current.filter((a) => !isCareOfRole(a.role) && !hasOpen(a.entityId, a.role))
    if (missing.length === 0) return
    onChange([
      ...rows,
      ...missing.map((a) => newRow({ id: a.entityId, name: a.entityName || '' }, a.role))
    ])
  }
  const confirmAdd = (): void => {
    if (!addEntity || !addRole.trim()) return
    onChange([...rows, newRow(addEntity, addRole.trim())])
    setAdding(false)
    setAddText('')
    setAddEntity(null)
    setAddRole('')
  }
  const confirmChange = (row: VesselPolicyAssured): void => {
    if (!changeEntity || !changeDate) return
    onChange([
      ...rows.map((r) => (r.id === row.id ? { ...r, toDate: dayBefore(changeDate) } : r)),
      newRow(changeEntity, row.role, changeDate)
    ])
    setChanging(null)
    setChangeText('')
    setChangeEntity(null)
  }
  const patch = (id: string, field: 'fromDate' | 'toDate', value: string): void =>
    onChange(rows.map((r) => (r.id === id ? { ...r, [field]: value || null } : r)))

  const entityPicker = (
    text: string,
    setText: (t: string) => void,
    setPicked: (e: EntityOption | null) => void,
    label: string
  ): React.JSX.Element => (
    <Combobox
      options={entities}
      getKey={(e) => e.id}
      getLabel={(e) => e.name}
      value={text}
      onInputChange={(t) => {
        setText(t)
        setPicked(null)
      }}
      onSelect={(e) => {
        setText(e.name)
        setPicked(e)
      }}
      placeholder="Search company..."
      aria-label={label}
    />
  )

  return (
    <div style={{ marginTop: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '8px'
        }}
      >
        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Assured on this policy</span>
        <span style={{ display: 'flex', gap: '8px' }}>
          <button type="button" className="btn-secondary btn-sm" onClick={fillFromVessel}>
            <RefreshCw size={13} /> Fill from vessel
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setAdding(true)}>
            <Plus size={13} /> Add assured
          </button>
        </span>
      </div>

      {adding && (
        <div className="form-grid cols-2" style={{ marginBottom: '10px' }}>
          <Field label="Company">
            {entityPicker(addText, setAddText, setAddEntity, 'Company to add')}
          </Field>
          <Field label="Role">
            <Combobox
              options={roles}
              getKey={(r) => r.id}
              getLabel={(r) => r.name}
              value={addRole}
              onInputChange={setAddRole}
              onSelect={(r) => setAddRole(r.name)}
              autoHighlight={false}
              hideWhenEmpty
              aria-label="Role"
            />
          </Field>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={!addEntity || !addRole.trim()}
              onClick={confirmAdd}
            >
              Add
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Not recorded</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th title="Blank = from the start of the policy">From</th>
                <th title="Blank = to the end of the policy">To</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={r.toDate ? { opacity: 0.7 } : undefined}>
                  <td style={{ fontWeight: 500 }}>{r.entityName}</td>
                  <td className="muted">{r.role}</td>
                  <td>
                    <input
                      type="date"
                      aria-label={`From date of ${r.entityName}`}
                      value={r.fromDate || ''}
                      onChange={(e) => patch(r.id, 'fromDate', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      aria-label={`To date of ${r.entityName}`}
                      value={r.toDate || ''}
                      onChange={(e) => patch(r.id, 'toDate', e.target.value)}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    {!r.toDate && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        title="Endorsement: another company takes over from a date"
                        onClick={() => {
                          setChanging(r.id)
                          setChangeDate(todayIso())
                          setChangeText('')
                          setChangeEntity(null)
                        }}
                      >
                        Change from a date
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn-ghost btn-icon"
                      title="Remove from this policy"
                      aria-label={`Remove ${r.entityName} from this policy`}
                      onClick={() => onChange(rows.filter((x) => x.id !== r.id))}
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {changing &&
        (() => {
          const row = rows.find((r) => r.id === changing)
          if (!row) return null
          return (
            <div className="form-grid cols-2" style={{ marginTop: '10px' }}>
              <Field label={`New company instead of ${row.entityName} (${row.role})`}>
                {entityPicker(changeText, setChangeText, setChangeEntity, 'New company')}
              </Field>
              <Field label="From">
                <input
                  type="date"
                  value={changeDate}
                  onChange={(e) => setChangeDate(e.target.value)}
                />
              </Field>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={!changeEntity || !changeDate}
                  onClick={() => confirmChange(row)}
                >
                  Apply
                </button>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setChanging(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )
        })()}
    </div>
  )
}
