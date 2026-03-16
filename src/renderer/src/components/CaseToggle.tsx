export function toTitleCase(s: string): string {
  return s.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase())
}

export function cycleCase(s: string): string {
  if (!s) return ''
  const upper = s.toUpperCase()
  const title = toTitleCase(s)
  if (s === title) return upper
  if (s === upper) return s.toLowerCase()
  return title
}

function cycleCaseLabel(s: string): string {
  if (!s) return ''
  const upper = s.toUpperCase()
  const title = toTitleCase(s)
  if (s === title) return 'AA'
  if (s === upper) return 'aa'
  return 'Aa'
}

export function CaseToggleBtn({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  if (!value.trim()) return null
  const label = cycleCaseLabel(value)
  return (
    <button
      type="button"
      onClick={() => onChange(cycleCase(value))}
      title={`Switch to ${label === 'Aa' ? 'Title Case' : label === 'AA' ? 'UPPERCASE' : 'lowercase'}`}
      style={{
        position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
        background: 'rgba(var(--accent-primary-rgb,0,210,255),0.1)',
        border: '1px solid rgba(var(--accent-primary-rgb,0,210,255),0.25)',
        borderRadius: '4px', padding: '2px 6px', cursor: 'pointer',
        fontSize: '0.7rem', fontWeight: 700, color: 'var(--accent-primary)',
        lineHeight: 1.2
      }}
    >
      {label}
    </button>
  )
}
