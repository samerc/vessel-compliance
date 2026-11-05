import { useEffect, useState } from 'react'
import { AlertCircle, Loader2 } from 'lucide-react'
import type { QuotationVessel, Vessel, VesselAssured } from '../../../shared/types'
import { Combobox } from './ui'
import { asArray } from '../utils/ipc'
import { useToast } from '../contexts/ToastContext'

const digits = (s?: string | null): string => (s || '').replace(/\D/g, '')
const sameName = (a?: string | null, b?: string | null): boolean =>
  (a || '').trim().toUpperCase() === (b || '').trim().toUpperCase()

/** The record a typed vessel seems to be: by what is in the IMO field, else by its exact name */
function findMatch(qv: QuotationVessel, vessels: Vessel[]): Vessel | undefined {
  const imo = digits(qv.imoNumber)
  const byImo = imo ? vessels.filter((v) => digits(v.imoNumber) === imo) : []
  if (byImo.length) return byImo.find((v) => v.isActive) || byImo[0]
  const byName = vessels.filter((v) => sameName(v.name, qv.name))
  return byName.find((v) => v.isActive) || byName[0]
}

function GateRow({
  qv,
  vessels,
  assureds,
  busy,
  onLink,
  onCreate
}: {
  qv: QuotationVessel
  vessels: Vessel[]
  assureds: VesselAssured[]
  busy: boolean
  onLink: (vesselId: string) => void
  onCreate: (imo: string) => void
}): React.JSX.Element {
  const match = findMatch(qv, vessels)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Vessel | null>(null)
  const [imo, setImo] = useState(qv.imoNumber || '')
  const target = picked || match
  const owners = target
    ? [...new Set(assureds.filter((a) => a.vesselId === target.id).map((a) => a.entityName))]
    : []
  const imoTaken = vessels.some((v) => digits(v.imoNumber) === digits(imo) && digits(imo) !== '')

  return (
    <div
      style={{
        padding: '16px',
        background: 'var(--bg-card)',
        border: 'var(--glass-border)',
        borderRadius: '10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}
    >
      <div>
        <div style={{ fontWeight: 600 }}>{(qv.name || 'Vessel').toUpperCase()}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          On the quotation: IMO {qv.imoNumber || 'not given'}
          {qv.flag ? `, ${qv.flag}` : ''}
        </div>
      </div>

      {target && (
        <div style={{ fontSize: '0.88rem' }}>
          <div>
            {picked ? 'Chosen' : 'Found in the app'}: <strong>{target.name}</strong>, IMO{' '}
            <span className="mono">{target.imoNumber || '-'}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Assureds: {owners.length ? owners.join(', ') : 'none'}
          </div>
          {!sameName(target.name, qv.name) && (
            <div
              style={{
                marginTop: '6px',
                display: 'flex',
                gap: '8px',
                alignItems: 'flex-start',
                color: 'var(--warning)'
              }}
            >
              <AlertCircle size={15} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                The names differ. Once linked, the policy shows the vessel record. If this vessel
                was sold or renamed, use Vessel sold on its page first, then come back.
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        {target && (
          <button className="btn-primary btn-sm" disabled={busy} onClick={() => onLink(target.id)}>
            Link to {target.name}
          </button>
        )}
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <Combobox
            options={vessels}
            getKey={(v) => v.id}
            getLabel={(v) => v.name}
            getDetail={(v) => v.imoNumber}
            value={search}
            onInputChange={(t) => {
              setSearch(t)
              setPicked(null)
            }}
            onSelect={(v) => {
              setSearch(v.name)
              setPicked(v)
            }}
            placeholder="Link to another vessel: search name or IMO..."
            aria-label={`Link ${qv.name || 'this vessel'} to another vessel`}
          />
        </div>
      </div>

      {!match && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          <input
            type="text"
            aria-label={`IMO number for the new record of ${qv.name || 'this vessel'}`}
            placeholder="IMO or registration number"
            value={imo}
            onChange={(e) => setImo(e.target.value)}
            style={{ flex: '0 1 240px' }}
          />
          <button
            className="btn-secondary btn-sm"
            disabled={busy || !imo.trim() || imoTaken}
            title={imoTaken ? 'A vessel with this number is already in the app' : undefined}
            onClick={() => onCreate(imo.trim())}
          >
            Create vessel record
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * A vessel typed on the quotation has no record, and a policy cannot hang on nothing: it would
 * appear under no vessel and its blue cards would miss port and flag authority. Each one is
 * linked to a vessel or gets a record before the converter opens.
 */
export default function ConvertVesselGate({
  vessels: unlinked,
  onResolved,
  onCancel
}: {
  vessels: QuotationVessel[]
  onResolved: () => void
  onCancel: () => void
}): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [assureds, setAssureds] = useState<VesselAssured[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([window.api.getVessels(), window.api.getVesselAssureds()])
      .then(([v, a]) => {
        if (!alive) return
        setVessels(asArray<Vessel>(v))
        setAssureds(asArray<VesselAssured>(a))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const run = async (work: () => Promise<unknown>, done: string): Promise<void> => {
    setBusy(true)
    try {
      await work()
      showSuccess(done)
      onResolved()
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Could not update the vessel')
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '24px 32px 40px', maxWidth: '860px', margin: '0 auto' }}>
      <button className="btn-ghost btn-sm" onClick={onCancel}>
        Back to Quotation
      </button>
      <h2 style={{ margin: '12px 0 4px' }}>Link the vessels first</h2>
      <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
        These vessels were typed on the quotation and have no vessel record. A policy needs one, so
        it shows under the vessel and its blue cards get the port and flag authority.
      </p>
      {loading ? (
        <Loader2 size={24} className="spinner" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {unlinked.map((qv) => (
            <GateRow
              key={qv.id}
              qv={qv}
              vessels={vessels}
              assureds={assureds}
              busy={busy}
              onLink={(vesselId) =>
                run(() => window.api.setQuotationVesselLink(qv.id, vesselId), 'Vessel linked')
              }
              onCreate={(imo) =>
                run(
                  () => window.api.createVesselFromQuotationVessel(qv.id, imo),
                  'Vessel record created'
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}
