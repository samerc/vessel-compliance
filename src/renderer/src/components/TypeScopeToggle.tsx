import React from 'react'

// P&I / FD&D chips on a P&I settings item (clause, deductible, exclusion, additional clause):
// which quotation types offer the item. Both on = 'all'. At least one stays on.
const OPTIONS: { v: string; label: string; color: string; title: string }[] = [
  { v: 'pi', label: 'P&I', color: '#6464ff', title: 'Offered in P&I quotations' },
  { v: 'fdd', label: 'FD&D', color: '#a855f7', title: 'Offered in FD&D quotations' }
]

interface Props {
  scope?: string | null
  onChange: (scope: string) => void
}

export default function TypeScopeToggle({ scope, onChange }: Props): React.JSX.Element {
  const isOn = (v: string): boolean =>
    !scope ||
    scope === 'all' ||
    scope
      .split(',')
      .map((s) => s.trim())
      .includes(v)

  const toggle = (v: string): void => {
    const next = OPTIONS.filter((o) => (o.v === v ? !isOn(v) : isOn(o.v))).map((o) => o.v)
    if (next.length === 0) return
    onChange(next.length === OPTIONS.length ? 'all' : next.join(','))
  }

  return (
    <div style={{ display: 'flex', gap: '3px', marginRight: '6px' }}>
      {OPTIONS.map((o) => {
        const on = isOn(o.v)
        return (
          <button
            key={o.v}
            type="button"
            title={`${o.title}${on ? '' : ' (off)'}`}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              toggle(o.v)
            }}
            style={{
              fontSize: '0.66rem',
              fontWeight: 600,
              padding: '1px 6px',
              borderRadius: '4px',
              cursor: 'pointer',
              border: `1px solid ${on ? o.color : 'var(--glass-border-color)'}`,
              background: on ? `${o.color}22` : 'transparent',
              color: on ? o.color : 'var(--text-secondary)',
              opacity: on ? 1 : 0.6
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
