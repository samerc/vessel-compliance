import { useEffect, useState } from 'react'
import { GitCompareArrows, Loader2, Ship } from 'lucide-react'
import type {
  DocumentType,
  Vessel,
  VesselClassification,
  VesselDocument,
  VesselDynamicPolicy
} from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { Modal } from './ui'
import SanctionsBadge from './ui/SanctionsBadge'

// Side-by-side comparison of two vessels (Vessels page: bulk select or the filter panel)

interface PolicySummary {
  typeName: string
  policyNumber: string
  status: string
}

interface DocStats {
  compliant: number
  total: number
  missing: number
  expired: number
  pct: number
}

interface CompareSide {
  vessel: Vessel
  policies: PolicySummary[]
  docs: DocStats
  classification: string
  fleet: string
  customer: string
  flag: string
}

const CompareRow = ({
  label,
  val1,
  val2,
  highlight
}: {
  label: string
  val1: React.ReactNode
  val2: React.ReactNode
  highlight?: boolean
}): React.JSX.Element => (
  <tr>
    <td className="muted" style={{ fontWeight: 600, width: '160px' }}>
      {label}
    </td>
    <td style={{ fontWeight: highlight ? 700 : 400 }}>{val1}</td>
    <td style={{ fontWeight: highlight ? 700 : 400 }}>{val2}</td>
  </tr>
)

const SectionHeader = ({ label }: { label: string }): React.JSX.Element => (
  <tr>
    <td
      colSpan={3}
      style={{
        paddingTop: '16px',
        paddingBottom: '6px',
        fontWeight: 600,
        fontSize: '0.8rem',
        color: 'var(--accent-primary)'
      }}
    >
      {label}
    </td>
  </tr>
)

const asArr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

function docStats(docs: VesselDocument[], types: DocumentType[]): DocStats {
  const today = new Date()
  let compliant = 0
  let missing = 0
  let expired = 0
  for (const t of types) {
    const doc = docs.find((d) => d.documentTypeId === t.id)
    if (!doc?.filePath) {
      missing++
      continue
    }
    if (doc.expiryDate && new Date(doc.expiryDate) < today) {
      expired++
      continue
    }
    compliant++
  }
  const total = types.length
  return {
    compliant,
    total,
    missing,
    expired,
    pct: total > 0 ? Math.round((compliant / total) * 100) : 100
  }
}

export default function VesselCompareModal({
  vesselIds,
  onClose
}: {
  /** The two vessels to compare */
  vesselIds: [string, string]
  onClose: () => void
}): React.JSX.Element {
  const { showError } = useToast()
  const [sides, setSides] = useState<[CompareSide, CompareSide] | null>(null)
  const [id1, id2] = vesselIds

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const [vessels, p1, p2, d1, d2, docTypes, cls1, cls2, policyTypes, fleets, flags, classes] =
          await Promise.all([
            window.api.getVessels(),
            window.api.getVesselDynamicPolicies(id1),
            window.api.getVesselDynamicPolicies(id2),
            window.api.getVesselDocuments(id1),
            window.api.getVesselDocuments(id2),
            window.api.getDocumentTypes(),
            window.api.getVesselClassifications(id1),
            window.api.getVesselClassifications(id2),
            window.api.getPolicyTypes(),
            window.api.getFleets(),
            window.api.getFlagStates(),
            window.api.getClassificationSocieties()
          ])
        const ptName = new Map(
          asArr<{ id: string; name: string }>(policyTypes).map((p) => [p.id, p.name])
        )
        const fleetName = new Map(
          asArr<{ id: string; name: string }>(fleets).map((f) => [f.id, f.name])
        )
        const flagName = new Map(
          asArr<{ id: string; name: string }>(flags).map((f) => [f.id, f.name])
        )
        const className = new Map(
          asArr<{ id: string; name: string; abbreviation?: string }>(classes).map((c) => [
            c.id,
            c.abbreviation || c.name
          ])
        )
        const all = asArr<Vessel>(vessels)
        const build = (
          id: string,
          policies: unknown,
          docs: unknown,
          cls: unknown
        ): CompareSide | null => {
          const vessel = all.find((v) => v.id === id)
          if (!vessel) return null
          const active = asArr<VesselDynamicPolicy>(policies).filter((p) => p.status === 'active')
          // Customer is kept on the policy: every customer with an active policy on the vessel
          const customers = [...new Set(active.map((p) => p.customerName).filter(Boolean))]
          return {
            vessel,
            policies: active.map((p) => ({
              typeName: ptName.get(p.policyTypeId) || 'Unknown',
              policyNumber: p.policyNumber || '-',
              status: p.status
            })),
            docs: docStats(asArr<VesselDocument>(docs), asArr<DocumentType>(docTypes)),
            classification:
              asArr<VesselClassification>(cls)
                .map((c) => className.get(c.classificationSocietyId) || 'Unknown')
                .join(', ') || '-',
            fleet: (vessel.fleetId && fleetName.get(vessel.fleetId)) || '-',
            customer: customers.join(', ') || '-',
            flag: (vessel.flagStateId && flagName.get(vessel.flagStateId)) || '-'
          }
        }
        const s1 = build(id1, p1, d1, cls1)
        const s2 = build(id2, p2, d2, cls2)
        if (!alive) return
        if (!s1 || !s2) {
          showError('Vessel not found')
          onClose()
          return
        }
        setSides([s1, s2])
      } catch (err) {
        if (alive)
          showError((err instanceof Error && err.message) || 'Failed to load comparison data')
      }
    }
    void run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id1, id2])

  const pctColor = (pct: number): string =>
    pct === 100 ? 'var(--success)' : pct >= 80 ? 'var(--warning)' : 'var(--danger)'
  const countCell = (n: number): React.JSX.Element => (
    <span style={{ color: n > 0 ? 'var(--danger)' : 'var(--success)' }}>{n}</span>
  )

  return (
    <Modal
      title="Vessel Comparison"
      icon={<GitCompareArrows size={18} />}
      onClose={onClose}
      width={800}
    >
      {!sides ? (
        <div style={{ padding: '60px', textAlign: 'center' }}>
          <Loader2
            size={32}
            className="spinner"
            style={{ opacity: 0.4, display: 'block', margin: '0 auto 14px' }}
          />
          <div style={{ color: 'var(--text-secondary)' }}>Loading comparison data...</div>
        </div>
      ) : (
        (() => {
          const [a, b] = sides
          const typeNames = [...new Set([...a.policies, ...b.policies].map((p) => p.typeName))]
          const fmtPolicy = (p: PolicySummary | undefined): React.JSX.Element =>
            p ? (
              <span
                style={{
                  color: p.status === 'active' ? 'var(--success)' : 'var(--text-secondary)'
                }}
              >
                {p.policyNumber} ({p.status})
              </span>
            ) : (
              <span style={{ opacity: 0.3 }}>-</span>
            )
          return (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    {[a, b].map((s) => (
                      <th key={s.vessel.id}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Ship size={14} color="var(--accent-primary)" />
                          {s.vessel.name}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <SectionHeader label="General" />
                  <CompareRow label="Name" val1={a.vessel.name} val2={b.vessel.name} highlight />
                  <CompareRow label="IMO" val1={a.vessel.imoNumber} val2={b.vessel.imoNumber} />
                  <CompareRow
                    label="Type"
                    val1={a.vessel.vesselType || '-'}
                    val2={b.vessel.vesselType || '-'}
                  />
                  <CompareRow label="Flag" val1={a.flag} val2={b.flag} />
                  <CompareRow
                    label="Built"
                    val1={a.vessel.builtYear || '-'}
                    val2={b.vessel.builtYear || '-'}
                  />
                  <CompareRow
                    label="Gross Tonnage"
                    val1={a.vessel.grossTonnage?.toLocaleString() || '-'}
                    val2={b.vessel.grossTonnage?.toLocaleString() || '-'}
                  />
                  <CompareRow
                    label="Classification"
                    val1={a.classification}
                    val2={b.classification}
                  />
                  <CompareRow label="Customer" val1={a.customer} val2={b.customer} />
                  <CompareRow label="Fleet" val1={a.fleet} val2={b.fleet} />

                  <SectionHeader label="Policies" />
                  {typeNames.length > 0 ? (
                    typeNames.map((t) => (
                      <CompareRow
                        key={t}
                        label={t}
                        val1={fmtPolicy(a.policies.find((p) => p.typeName === t))}
                        val2={fmtPolicy(b.policies.find((p) => p.typeName === t))}
                      />
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="muted">
                        No active policies
                      </td>
                    </tr>
                  )}

                  <SectionHeader label="Documents" />
                  <CompareRow
                    label="Compliant"
                    val1={
                      <span style={{ color: pctColor(a.docs.pct) }}>
                        {a.docs.compliant}/{a.docs.total} ({a.docs.pct}%)
                      </span>
                    }
                    val2={
                      <span style={{ color: pctColor(b.docs.pct) }}>
                        {b.docs.compliant}/{b.docs.total} ({b.docs.pct}%)
                      </span>
                    }
                  />
                  <CompareRow
                    label="Missing"
                    val1={countCell(a.docs.missing)}
                    val2={countCell(b.docs.missing)}
                  />
                  <CompareRow
                    label="Expired"
                    val1={countCell(a.docs.expired)}
                    val2={countCell(b.docs.expired)}
                  />

                  <SectionHeader label="Sanctions" />
                  <CompareRow
                    label="Status"
                    val1={<SanctionsBadge status={a.vessel.ofacStatus} />}
                    val2={<SanctionsBadge status={b.vessel.ofacStatus} />}
                  />
                </tbody>
              </table>
            </div>
          )
        })()
      )}
    </Modal>
  )
}
