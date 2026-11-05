import { useState } from 'react'
import type { VesselAssured, VesselDynamicPolicy } from '../../../shared/types'
import { Combobox, Field, Modal } from './ui'
import { formatDate } from '../utils/dateUtils'
import { todayIso } from '../utils/policyAssureds'

/** The policy's period, from its date fields */
function periodOf(p: VesselDynamicPolicy): string {
  const dates = (p.values || []).filter((v) => v.fieldType === 'date' && v.valueDate)
  const pick = (re: RegExp): string | undefined =>
    dates.find((v) => re.test(v.characteristicName || ''))?.valueDate
  const from = pick(/inception|start/i)
  const to = pick(/end|expir/i)
  return from || to ? `${formatDate(from) || '-'} - ${formatDate(to) || '-'}` : '-'
}

const policyLabel = (p: VesselDynamicPolicy): string =>
  (p.policyNumber || '').replace(' (RENEWED - PLEASE VERIFY)', '') || 'No number'

function PolicyChoices({
  policies,
  chosen,
  onChange,
  leaveLabel,
  applyLabel
}: {
  policies: VesselDynamicPolicy[]
  chosen: string[]
  onChange: (ids: string[]) => void
  leaveLabel: string
  applyLabel: string
}): React.JSX.Element {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Policy</th>
            <th>Cover</th>
            <th>Period</th>
            <th style={{ width: '42%' }}>On this policy</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.id}>
              <td>
                <span className="mono">{policyLabel(p)}</span>
              </td>
              <td>{p.policyTypeName}</td>
              <td className="muted">{periodOf(p)}</td>
              <td>
                <select
                  aria-label={`On policy ${policyLabel(p)}`}
                  value={chosen.includes(p.id) ? 'apply' : 'leave'}
                  onChange={(e) =>
                    onChange(
                      e.target.value === 'apply'
                        ? [...chosen, p.id]
                        : chosen.filter((id) => id !== p.id)
                    )
                  }
                >
                  <option value="leave">{leaveLabel}</option>
                  <option value="apply">{applyLabel}</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Removing an assured: a real change goes to the history, a mistake is deleted */
export function RemoveAssuredModal({
  assured,
  vesselName,
  policies,
  entities,
  onClose,
  onDone,
  onError
}: {
  assured: VesselAssured
  vesselName: string
  /** The vessel's policies */
  policies: VesselDynamicPolicy[]
  entities: { id: string; name: string }[]
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [why, setWhy] = useState<'changed' | 'mistake'>('changed')
  const [endDate, setEndDate] = useState(todayIso())
  const [replaceText, setReplaceText] = useState('')
  const [replacement, setReplacement] = useState<{ id: string; name: string } | null>(null)
  const [chosen, setChosen] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Active policies with this company in this role
  const affected = policies.filter(
    (p) =>
      p.status === 'active' &&
      (p.assureds || []).some(
        (a) => a.entityId === assured.entityId && a.role === assured.role && !a.toDate
      )
  )
  const name = assured.entityName || 'this assured'

  const submit = async (): Promise<void> => {
    if (why === 'changed' && !endDate) return
    setSaving(true)
    try {
      if (why === 'mistake') {
        await window.api.deleteVesselAssured(assured.id)
        onDone('Assured deleted')
      } else {
        await window.api.removeVesselAssuredWithHistory(assured.id, {
          endDate,
          replacementEntityId: replacement?.id || null,
          policyIds: chosen
        })
        onDone('Assured moved to the history')
      }
    } catch (e) {
      onError((e instanceof Error && e.message) || 'Could not remove the assured')
      setSaving(false)
    }
  }

  const option = (value: 'changed' | 'mistake', title: string, text: string): React.JSX.Element => (
    <label
      style={{
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
        padding: '12px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.88rem',
        border: why === value ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: why === value ? 'var(--accent-tint)' : 'transparent'
      }}
    >
      <input
        type="radio"
        name="assured-remove-why"
        checked={why === value}
        onChange={() => setWhy(value)}
      />
      <span>
        <strong style={{ fontWeight: 600 }}>{title}</strong>{' '}
        <span style={{ color: 'var(--text-secondary)' }}>{text}</span>
      </span>
    </label>
  )

  return (
    <Modal
      title={`Remove ${name} from ${vesselName}`}
      onClose={onClose}
      width={760}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className={why === 'mistake' ? 'btn-danger' : 'btn-primary'}
            onClick={submit}
            disabled={saving || (why === 'changed' && !endDate)}
          >
            {why === 'mistake' ? 'Delete assured' : 'End assured'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{assured.role}</div>
        {option(
          'changed',
          'The assured changed.',
          "Sold, or another company took over. Kept in the vessel's history."
        )}
        {option(
          'mistake',
          'It was entered by mistake.',
          'Deleted, with no history and no change to policies.'
        )}
        {why === 'changed' && (
          <>
            <div className="form-grid cols-2">
              <Field label="Ended on" required>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </Field>
              <Field label="Replaced by (optional)">
                <Combobox
                  options={entities.filter((e) => e.id !== assured.entityId)}
                  getKey={(e) => e.id}
                  getLabel={(e) => e.name}
                  value={replaceText}
                  onInputChange={(t) => {
                    setReplaceText(t)
                    setReplacement(null)
                  }}
                  onSelect={(e) => {
                    setReplaceText(e.name)
                    setReplacement(e)
                  }}
                  placeholder="Search company..."
                  aria-label="Replaced by"
                />
              </Field>
            </div>
            {affected.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                  Active policies with this assured
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Nothing changes on a policy unless you choose it here.
                </div>
                <PolicyChoices
                  policies={affected}
                  chosen={chosen}
                  onChange={setChosen}
                  leaveLabel="Leave as is (cancel and re-issue)"
                  applyLabel={`Change from ${formatDate(endDate)} (endorsement)`}
                />
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}

/** After adding an assured to the vessel: which active policies get it too */
export function AddAssuredToPoliciesModal({
  entityId,
  entityName,
  role,
  policies,
  onClose,
  onDone,
  onError
}: {
  entityId: string
  entityName: string
  role: string
  /** The vessel's active policies */
  policies: VesselDynamicPolicy[]
  onClose: () => void
  onDone: (message: string) => void
  onError: (message: string) => void
}): React.JSX.Element {
  const [fromDate, setFromDate] = useState(todayIso())
  const [chosen, setChosen] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (chosen.length === 0) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await window.api.addVesselAssuredToPolicies(chosen, { entityId, role, fromDate })
      onDone(`Added to ${chosen.length} ${chosen.length === 1 ? 'policy' : 'policies'}`)
    } catch (e) {
      onError((e instanceof Error && e.message) || 'Could not add the assured to the policies')
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`Add ${entityName} to policies?`}
      onClose={onClose}
      width={760}
      closeOnOverlay={false}
      footer={
        <button className="btn-primary" onClick={submit} disabled={saving || !fromDate}>
          Done
        </button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {entityName} is now on the vessel as {role}. Nothing changes on a policy unless you choose
          it here.
        </div>
        <div className="form-grid cols-2">
          <Field label="From">
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
        </div>
        <PolicyChoices
          policies={policies}
          chosen={chosen}
          onChange={setChosen}
          leaveLabel="Leave as is"
          applyLabel={`Add from ${formatDate(fromDate)}`}
        />
      </div>
    </Modal>
  )
}
