import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type {
  AssuredRole,
  Entity,
  SaleCancellation,
  SalePolicy,
  VesselAssured
} from '../../../shared/types'
import { Combobox, Field, Modal } from './ui'
import { StrMoneyInput } from './quotation-tabs/shared'
import { OfacService } from '../services/OfacService'
import { asArray } from '../utils/ipc'
import { formatDate } from '../utils/dateUtils'
import { todayIso } from '../utils/policyAssureds'
import { upccPercentFor } from '../../../shared/premium'
import type { GivenDiscount } from '../utils/premiumCalc'
import {
  atTime,
  calcCancellation,
  cancellationWhen,
  parseGivenText,
  type CancellationResult
} from '../utils/cancellationCalc'

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

type SaleAction = 'advice' | 'quiet' | 'leave'
interface DiscountField {
  type: GivenDiscount['type']
  value: string
}
interface PolicyChoice {
  action: SaleAction
  reclaim: boolean
  ncb: DiscountField
  upcc: DiscountField
  instalments: { instalmentNumber: number; dueDate: string }[]
}

const keyOf = (p: SalePolicy): string => p.vesselPolicyId || p.policyDocId || ''
const asField = (d: GivenDiscount | null): DiscountField =>
  d && d.value > 0 ? { type: d.type, value: String(d.value) } : { type: 'pct', value: '' }
const asGiven = (d: DiscountField): GivenDiscount | null =>
  parseFloat(d.value) > 0 ? { type: d.type, value: parseFloat(d.value) } : null
const money = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** The NCB / UPCC a policy made in the app was given, from its quotation */
async function givenFromQuotation(
  quotationId: string,
  vesselId: string
): Promise<{ ncb: GivenDiscount | null; upcc: GivenDiscount | null } | null> {
  const [q, qvs] = await Promise.all([
    window.api.getQuotation(quotationId),
    window.api.getQuotationVessels(quotationId)
  ])
  if (!q || 'error' in q) return null
  const qv = asArray(qvs).find((v) => v.vesselId === vesselId) || null
  return {
    ncb:
      q.ncbEnabled && !qv?.ncbExcluded
        ? q.ncbDiscountType === 'amount'
          ? { type: 'amount', value: Number(q.ncbDiscountAmount) || 0 }
          : { type: 'pct', value: Number(q.ncbDiscountPercent) || 0 }
        : null,
    upcc:
      q.upccEnabled && !qv?.upccExcluded
        ? q.upccDiscountType === 'amount'
          ? { type: 'amount', value: Number(q.upccDiscountAmount) || 0 }
          : { type: 'pct', value: upccPercentFor(q, qv) }
        : null
  }
}

/**
 * A sale in one step: date and time, new name, who ends, who comes on, and the vessel's active
 * policies cancelled from that moment with their pro-rata return premium. With no new assured
 * the vessel is set to inactive.
 */
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
  const [time, setTime] = useState('12:00')
  const [name, setName] = useState(vesselName)
  const [current, setCurrent] = useState<VesselAssured[]>([])
  const [ending, setEnding] = useState<Set<string>>(new Set())
  const [entities, setEntities] = useState<Entity[]>([])
  const [roles, setRoles] = useState<AssuredRole[]>([])
  const [policies, setPolicies] = useState<SalePolicy[]>([])
  const [choices, setChoices] = useState<Record<string, PolicyChoice>>({})
  const [rows, setRows] = useState<NewOwnerRow[]>([newRow('Registered Owners'), newRow('Managers')])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([
      window.api.getVesselAssureds(vesselId),
      window.api.getEntities(),
      window.api.getAssuredRoles(),
      window.api.getVesselSalePolicies(vesselId)
    ]).then(async ([va, e, r, p]) => {
      if (!alive) return
      const list = asArray<VesselAssured>(va)
      setCurrent(list)
      setEnding(new Set(list.map((a) => a.id)))
      setEntities(asArray<Entity>(e))
      setRoles(asArray<AssuredRole>(r))
      const pols = asArray<SalePolicy>(p)
      setPolicies(pols)
      // Every policy is cancelled (with its DA / CA when it was made in the app). The NCB /
      // UPCC it was given is shown and reclaimed only when the user ticks it
      const next: Record<string, PolicyChoice> = {}
      for (const pol of pols) {
        let ncb = parseGivenText(pol.ncbText)
        let upcc = parseGivenText(pol.upccText)
        let instalments: PolicyChoice['instalments'] = []
        if (pol.policyDocId) {
          try {
            const inst = await window.api.policyGetInstalments(pol.policyDocId)
            instalments = asArray<{ instalmentNumber: number; dueDate: string }>(inst).map((i) => ({
              instalmentNumber: i.instalmentNumber,
              dueDate: i.dueDate
            }))
            const fromQ = pol.quotationId
              ? await givenFromQuotation(pol.quotationId, vesselId)
              : null
            if (fromQ) ({ ncb, upcc } = fromQ)
          } catch {
            /* the policy's own values stay */
          }
        }
        // A policy that had already ended (still marked active) is left as it is by default
        const ended =
          !!pol.expiryDate && atTime(pol.expiryDate, pol.expiryTime) <= atTime(todayIso(), '12:00')
        next[keyOf(pol)] = {
          action: ended ? 'leave' : pol.policyDocId ? 'advice' : 'quiet',
          reclaim: false,
          ncb: asField(ncb),
          upcc: asField(upcc),
          instalments
        }
      }
      if (alive) setChoices(next)
    })
    return () => {
      alive = false
    }
  }, [vesselId])

  const patch = (key: string, change: Partial<NewOwnerRow>): void =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)))
  const choose = (key: string, change: Partial<PolicyChoice>): void =>
    setChoices((c) => ({ ...c, [key]: { ...c[key], ...change } }))

  const resultOf = (p: SalePolicy): CancellationResult | null => {
    const c = choices[keyOf(p)]
    if (!c) return null
    return calcCancellation({
      annualPremium: Number(p.premium) || 0,
      inceptionDate: p.inceptionDate || '',
      inceptionTime: p.inceptionTime,
      expiryDate: p.expiryDate || '',
      expiryTime: p.expiryTime,
      cancelDate: date,
      cancelTime: time,
      commissionPct: Number(p.commissionPercent) || 0,
      reclaim: c.reclaim ? { ncb: asGiven(c.ncb), upcc: asGiven(c.upcc) } : null,
      instalments: c.action === 'advice' ? c.instalments : []
    })
  }

  const filled = rows.filter((r) => r.text.trim() && r.role.trim())
  const toCancel = policies.filter((p) => {
    const a = choices[keyOf(p)]?.action
    return a === 'advice' || a === 'quiet'
  })
  // A DA / CA needs an amount: missing premium / dates, or a reclaim above the return, stop it
  const blocked = toCancel.filter(
    (p) => choices[keyOf(p)]?.action === 'advice' && !((resultOf(p)?.returnPremium || 0) > 0)
  )
  const nothing =
    ending.size === 0 && filled.length === 0 && name.trim() === vesselName && toCancel.length === 0

  const submit = async (): Promise<void> => {
    if (!date || !time || !name.trim() || nothing) return
    if (blocked.length > 0) {
      onError(
        `No return premium for ${blocked.map((p) => p.policyNumber || p.typeName).join(', ')}: check its premium and dates, or cancel it without DA/CA`
      )
      return
    }
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
      const when = cancellationWhen(date, time)
      const cancellations: SaleCancellation[] = toCancel.map((p) => {
        const c = choices[keyOf(p)]
        const res = resultOf(p)
        const cur = p.currency || 'USD'
        const advice = c.action === 'advice' && !!p.policyDocId
        const note =
          `Cancelled ${formatDate(date)} ${time}: vessel sold.` +
          (res
            ? ` Return premium ${cur} ${money(res.returnPremium)} (${res.remainingDays}/${res.totalDays} days` +
              (res.given ? `, NCB/UPCC ${cur} ${money(res.given.total)} reclaimed` : '') +
              ').'
            : ' No return premium worked out (premium or dates missing).') +
          (advice ? ' DA/CA issued.' : '')
        return {
          vesselPolicyId: p.vesselPolicyId,
          policyDocId: p.policyDocId,
          issueAdvice: advice,
          effectiveDate: date,
          returnPremium: res?.returnPremium || 0,
          currency: cur,
          commissionPercent: Number(p.commissionPercent) || 0,
          annualPremium: Number(p.premium) || null,
          instalments: res?.instalments || [],
          endorsementContent:
            `<p>It is hereby agreed that, following the sale of the vessel, the above-mentioned policy is cancelled effective ${when}.</p>` +
            (res?.given
              ? `<p>The No Claims Bonus / UPCC of ${cur} ${money(res.given.total)} granted on this policy is reclaimed and deducted from the return premium.</p>`
              : ''),
          note,
          label: `${p.typeName || 'Policy'} ${p.policyNumber || ''}`.trim()
        }
      })
      await window.api.applyVesselSale(vesselId, {
        date,
        time,
        newName: name.trim(),
        endAssuredIds: [...ending],
        newAssureds,
        policyIds: [],
        cancellations,
        deactivateVessel: newAssureds.length === 0
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
      width={860}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={saving || !date || !time || !name.trim() || nothing}
          >
            Record sale
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-grid cols-3">
          <Field label="Date of sale" required>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time of sale" required hint="In the policies' time zone">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
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
          {filled.length === 0 && (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '6px' }}>
              No new assured: the vessel will be set to inactive.
            </div>
          )}
        </div>

        {policies.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Active policies</div>
            <div
              style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '2px 0 8px' }}
            >
              Cancelled from {formatDate(date)} {time}. The return premium is pro-rata over the
              policy&apos;s own period, as in the Pro-Rata calculator.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {policies.map((p) => (
                <SalePolicyCard
                  key={keyOf(p)}
                  policy={p}
                  choice={choices[keyOf(p)]}
                  result={resultOf(p)}
                  saleAt={atTime(date, time)}
                  onChange={(change) => choose(keyOf(p), change)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

/** One active policy: its period and premium, what happens to it, and its return premium */
function SalePolicyCard({
  policy: p,
  choice: c,
  result: res,
  saleAt,
  onChange
}: {
  policy: SalePolicy
  /** Sale date and time, "YYYY-MM-DDTHH:MM" */
  saleAt: string
  choice: PolicyChoice | undefined
  result: CancellationResult | null
  onChange: (change: Partial<PolicyChoice>) => void
}): React.JSX.Element {
  const cur = p.currency || 'USD'
  const label = p.policyNumber || 'No number'
  const hasGiven = !!c && (parseFloat(c.ncb.value) > 0 || parseFloat(c.upcc.value) > 0)
  const ended = !!p.expiryDate && atTime(p.expiryDate, p.expiryTime) <= saleAt
  const at = (d: string | null, t: string | null, none: string): string =>
    d ? `${formatDate(d)} ${t || '12:00'}` : none
  return (
    <div
      style={{
        border: 'var(--glass-border)',
        borderRadius: '8px',
        padding: '10px 12px',
        opacity: c?.action === 'leave' ? 0.6 : 1
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ fontSize: '0.88rem' }}>
          <span style={{ fontWeight: 600 }}>{p.typeName || 'Policy'}</span>{' '}
          <span className="mono">{label}</span>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {at(p.inceptionDate, p.inceptionTime, 'no inception date')} to{' '}
            {at(p.expiryDate, p.expiryTime, 'no end date')}
            {' · '}
            {p.premium ? `annual premium ${cur} ${money(Number(p.premium))}` : 'no premium'}
            {p.policyDocId ? '' : ' · entered on the vessel'}
          </div>
          {ended && (
            <div style={{ fontSize: '0.8rem', color: 'var(--warning, var(--text-secondary))' }}>
              Ended before the sale (still marked active)
            </div>
          )}
        </div>
        <select
          aria-label={`On policy ${label}`}
          value={c?.action || 'leave'}
          onChange={(e) => onChange({ action: e.target.value as SaleAction })}
          disabled={!c}
        >
          {p.policyDocId && <option value="advice">Cancel and issue DA/CA</option>}
          <option value="quiet">{p.policyDocId ? 'Cancel without DA/CA' : 'Cancel'}</option>
          <option value="leave">Leave as is</option>
        </select>
      </div>
      {c && c.action !== 'leave' && (
        <div style={{ marginTop: '8px', fontSize: '0.84rem' }}>
          {res ? (
            <div>
              {res.remainingDays} of {res.totalDays} days: {cur} {money(res.grossReturn)}
              {res.given && ` less NCB/UPCC ${cur} ${money(res.given.total)}`} ={' '}
              <strong style={{ color: res.returnPremium <= 0 ? 'var(--danger)' : undefined }}>
                return premium {cur} {money(res.returnPremium)}
              </strong>
              {c.action === 'advice' && res.returnCommission > 0 && (
                <span style={{ color: 'var(--text-secondary)' }}>
                  {' '}
                  (commission {cur} {money(res.returnCommission)})
                </span>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--danger)' }}>
              The premium or the dates are missing: no return premium can be worked out
              {c.action === 'quiet' ? ' (the policy is still set to cancelled)' : ''}
            </div>
          )}
          {hasGiven && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
              <input
                type="checkbox"
                checked={c.reclaim}
                onChange={(e) => onChange({ reclaim: e.target.checked })}
              />
              Reclaim the NCB/UPCC given (taken off the return premium)
            </label>
          )}
          {hasGiven && c.reclaim && (
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
              {(['ncb', 'upcc'] as const).map((k) => (
                <div key={k} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <span style={{ width: '40px' }}>{k.toUpperCase()}</span>
                  <select
                    value={c[k].type}
                    onChange={(e) =>
                      onChange({ [k]: { ...c[k], type: e.target.value as GivenDiscount['type'] } })
                    }
                    aria-label={`${k.toUpperCase()} type`}
                    style={{ width: '90px' }}
                  >
                    <option value="pct">%</option>
                    <option value="amount">Amount</option>
                  </select>
                  {c[k].type === 'amount' ? (
                    <StrMoneyInput
                      value={c[k].value}
                      onChange={(v) => onChange({ [k]: { ...c[k], value: v } })}
                      aria-label={`${k.toUpperCase()} given`}
                    />
                  ) : (
                    <input
                      type="number"
                      value={c[k].value}
                      onChange={(e) => onChange({ [k]: { ...c[k], value: e.target.value } })}
                      aria-label={`${k.toUpperCase()} given`}
                      style={{ width: '90px' }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
