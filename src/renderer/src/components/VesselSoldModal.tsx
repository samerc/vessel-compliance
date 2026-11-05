import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { AssuredRole, Entity, VesselAssured, VesselDynamicPolicy } from '../../../shared/types'
import { Combobox, Field, Modal } from './ui'
import { OfacService } from '../services/OfacService'
import { asArray } from '../utils/ipc'
import { formatDate } from '../utils/dateUtils'
import { todayIso } from '../utils/policyAssureds'

interface NewOwnerRow {
  key: string
  role: string
  text: string
  entityId: string | null
}

const newRow = (role: string): NewOwnerRow => ({
  key: crypto.randomUUID(),
  role,
  text: '',
  entityId: null
})

/** A sale in one step: date, new name, who ends, who comes on, and what the policies do */
export default function VesselSoldModal({
  vesselId,
  vesselName,
  onClose,
  onDone,
  onError
}: {
  vesselId: string
  vesselName: string
  onClose: () => void
  onDone: () => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [date, setDate] = useState(todayIso())
  const [name, setName] = useState(vesselName)
  const [current, setCurrent] = useState<VesselAssured[]>([])
  const [ending, setEnding] = useState<Set<string>>(new Set())
  const [entities, setEntities] = useState<Entity[]>([])
  const [roles, setRoles] = useState<AssuredRole[]>([])
  const [policies, setPolicies] = useState<VesselDynamicPolicy[]>([])
  const [chosen, setChosen] = useState<string[]>([])
  const [rows, setRows] = useState<NewOwnerRow[]>([newRow('Registered Owners'), newRow('Managers')])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([
      window.api.getVesselAssureds(vesselId),
      window.api.getEntities(),
      window.api.getAssuredRoles(),
      window.api.getVesselDynamicPolicies(vesselId)
    ]).then(([va, e, r, p]) => {
      if (!alive) return
      const list = asArray<VesselAssured>(va)
      setCurrent(list)
      setEnding(new Set(list.map((a) => a.id)))
      setEntities(asArray<Entity>(e))
      setRoles(asArray<AssuredRole>(r))
      setPolicies(asArray<VesselDynamicPolicy>(p).filter((x) => x.status === 'active'))
    })
    return () => {
      alive = false
    }
  }, [vesselId])

  const patch = (key: string, change: Partial<NewOwnerRow>): void =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)))

  const filled = rows.filter((r) => r.text.trim() && r.role.trim())
  const nothing = ending.size === 0 && filled.length === 0 && name.trim() === vesselName

  const submit = async (): Promise<void> => {
    if (!date || !name.trim() || nothing) return
    setSaving(true)
    try {
      // A new owner is usually a new company: created as in Add Assured, with its sanctions check
      const newAssureds: { entityId: string; role: string }[] = []
      for (const r of filled) {
        let entityId = r.entityId
        if (!entityId) {
          const typed = r.text.trim()
          const known = entities.find((e) => e.name.toLowerCase() === typed.toLowerCase())
          if (known) entityId = known.id
          else {
            const scan = await OfacService.checkNewRecord(typed)
            if (scan.warning) onError(scan.warning)
            const created = await window.api.addEntity({
              name: typed,
              type: 'company',
              ...scan.fields
            })
            entityId = created.id
          }
        }
        newAssureds.push({ entityId, role: r.role.trim() })
      }
      await window.api.applyVesselSale(vesselId, {
        date,
        newName: name.trim(),
        endAssuredIds: [...ending],
        newAssureds,
        policyIds: chosen
      })
      onDone()
    } catch (e) {
      onError((e instanceof Error && e.message) || 'Could not record the sale')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Vessel sold: ${vesselName}`}
      onClose={onClose}
      width={820}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={saving || !date || !name.trim() || nothing}
          >
            Record sale
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-grid cols-2">
          <Field label="Date of sale" required>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Vessel name" hint="Change it if the new owner renamed the vessel" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              style={{ textTransform: 'uppercase' }}
            />
          </Field>
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '8px' }}>
            Current assureds that end
          </div>
          {current.length === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              No assureds on this vessel.
            </div>
          )}
          {current.map((a) => (
            <label
              key={a.id}
              style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '0.88rem' }}
            >
              <input
                type="checkbox"
                checked={ending.has(a.id)}
                onChange={(e) =>
                  setEnding((s) => {
                    const next = new Set(s)
                    if (e.target.checked) next.add(a.id)
                    else next.delete(a.id)
                    return next
                  })
                }
              />
              <span>
                {a.entityName} <span style={{ color: 'var(--text-secondary)' }}>({a.role})</span>
              </span>
            </label>
          ))}
        </div>

        <div>
          <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '8px' }}>
            New assureds
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {rows.map((r) => (
              <div key={r.key} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ flex: '0 0 220px' }}>
                  <Combobox
                    options={roles}
                    getKey={(o) => o.id}
                    getLabel={(o) => o.name}
                    value={r.role}
                    onInputChange={(role) => patch(r.key, { role })}
                    onSelect={(o) => patch(r.key, { role: o.name })}
                    autoHighlight={false}
                    hideWhenEmpty
                    aria-label="Role"
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Combobox
                    options={entities}
                    getKey={(o) => o.id}
                    getLabel={(o) => o.name}
                    value={r.text}
                    onInputChange={(text) => patch(r.key, { text, entityId: null })}
                    onSelect={(o) => patch(r.key, { text: o.name, entityId: o.id })}
                    autoHighlight={false}
                    hideWhenEmpty
                    placeholder="Search, or type a new company..."
                    aria-label={`Company for ${r.role || 'this role'}`}
                  />
                </div>
                <button
                  type="button"
                  className="btn-ghost btn-icon"
                  aria-label="Remove this row"
                  onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn-secondary btn-sm"
            style={{ marginTop: '8px' }}
            onClick={() => setRows((list) => [...list, newRow('')])}
          >
            <Plus size={13} /> Add another
          </button>
        </div>

        {policies.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Active policies</div>
            <div
              style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 8px' }}
            >
              Nothing changes on a policy unless you choose it here. Cancelling and re-issuing is
              done on the policy itself.
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Policy</th>
                    <th>Cover</th>
                    <th style={{ width: '48%' }}>On this policy</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((p) => {
                    const label =
                      (p.policyNumber || '').replace(' (RENEWED - PLEASE VERIFY)', '') ||
                      'No number'
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="mono">{label}</span>
                        </td>
                        <td>{p.policyTypeName}</td>
                        <td>
                          <select
                            aria-label={`On policy ${label}`}
                            value={chosen.includes(p.id) ? 'apply' : 'leave'}
                            onChange={(e) =>
                              setChosen((c) =>
                                e.target.value === 'apply'
                                  ? [...c, p.id]
                                  : c.filter((id) => id !== p.id)
                              )
                            }
                          >
                            <option value="leave">Leave as is (cancel and re-issue)</option>
                            <option value="apply">
                              Change from {formatDate(date)} (endorsement)
                            </option>
                          </select>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
