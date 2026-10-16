// Policy / quotation type chip ("P&I", "H&M", "War"...). One colour per type, same in both
// themes; the text is mixed toward the theme's text colour so it stays readable.

const TYPE_COLORS: Record<string, string> = {
  P: '#2E5C99',
  H: '#9B3D78',
  W: '#A86A08',
  F: '#1D7A70',
  C: '#4A6A8A',
  L: '#6B5BA8'
}

const SHORT_NAMES: Record<string, string> = { P: 'P&I', H: 'H&M', W: 'War', F: 'FD&D' }

/** The type's colour, by code, else guessed from the name */
function typeColorFor(code?: string | null, name?: string | null): string {
  if (code && TYPE_COLORS[code]) return TYPE_COLORS[code]
  const n = (name || '').toLowerCase()
  if (n.includes('p&i') || n.includes('protection')) return TYPE_COLORS.P
  if (n.includes('hull') || n.includes('h&m')) return TYPE_COLORS.H
  if (n.includes('war')) return TYPE_COLORS.W
  if (n.includes('fd')) return TYPE_COLORS.F
  if (n.includes('cargo')) return TYPE_COLORS.C
  if (n.includes('hire')) return TYPE_COLORS.L
  return '#5F6F82'
}

export default function TypeChip({
  code,
  name,
  title
}: {
  code?: string | null
  name?: string | null
  title?: string
}): React.JSX.Element {
  const c = typeColorFor(code, name)
  return (
    <span
      title={title ?? name ?? undefined}
      style={{
        display: 'inline-block',
        fontSize: '0.75rem',
        fontWeight: 600,
        padding: '3px 8px',
        borderRadius: '6px',
        background: `color-mix(in srgb, ${c} 14%, transparent)`,
        color: `color-mix(in srgb, ${c} 55%, var(--text-primary))`,
        whiteSpace: 'nowrap'
      }}
    >
      {(code && SHORT_NAMES[code]) || name || code || '-'}
    </span>
  )
}
