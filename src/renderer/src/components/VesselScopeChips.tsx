import { QuotationVessel } from '../../../shared/types'

interface VesselScopeChipsProps {
  vessels: QuotationVessel[]
  vesselScope: string[] | null | undefined
  onChange: (scope: string[] | null) => void
}

/**
 * Inline vessel scope selector for multi-vessel quotations.
 * Shows nothing when < 2 vessels. Shows compact chip row otherwise.
 * NULL scope = all vessels. Array = specific vessel IDs.
 */
export default function VesselScopeChips({ vessels, vesselScope, onChange }: VesselScopeChipsProps) {
  if (vessels.length < 2) return null

  const allSelected = !vesselScope || vesselScope.length === 0 || vesselScope.length === vessels.length

  const toggle = (vesselId: string) => {
    if (allSelected) {
      // Switching from "all" to specific: select only this one
      onChange([vesselId])
      return
    }
    const current = vesselScope || []
    if (current.includes(vesselId)) {
      const next = current.filter(id => id !== vesselId)
      // If nothing left or all selected, reset to null (all)
      onChange(next.length === 0 || next.length === vessels.length ? null : next)
    } else {
      const next = [...current, vesselId]
      onChange(next.length === vessels.length ? null : next)
    }
  }

  const selectAll = () => onChange(null)

  const isChecked = (vesselId: string) => allSelected || (vesselScope || []).includes(vesselId)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 3, marginBottom: 2, paddingLeft: 30 }}>
      <button
        type="button"
        onClick={selectAll}
        style={{
          fontSize: '0.65rem',
          padding: '1px 6px',
          borderRadius: 3,
          border: `1px solid ${allSelected ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
          background: allSelected ? 'rgba(0,170,200,0.15)' : 'transparent',
          color: allSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          lineHeight: '1.4'
        }}
      >
        All
      </button>
      {vessels.map(v => {
        const checked = isChecked(v.id)
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => toggle(v.id)}
            style={{
              fontSize: '0.65rem',
              padding: '1px 6px',
              borderRadius: 3,
              border: `1px solid ${checked && !allSelected ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
              background: checked && !allSelected ? 'rgba(0,170,200,0.15)' : 'transparent',
              color: checked && !allSelected ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer',
              lineHeight: '1.4',
              textTransform: 'uppercase'
            }}
            title={v.name || v.vesselLabel}
          >
            {v.vesselLabel}
          </button>
        )
      })}
    </div>
  )
}
