import { X } from 'lucide-react'

/** yyyy-mm-dd of a local date (toISOString would shift it to UTC) */
function iso(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const PRESETS: { label: string; range: () => [string, string] }[] = [
  {
    label: 'Last 30 days',
    range: () => {
      const t = new Date()
      return [iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 29)), iso(t)]
    }
  },
  {
    label: 'This month',
    range: () => {
      const t = new Date()
      return [
        iso(new Date(t.getFullYear(), t.getMonth(), 1)),
        iso(new Date(t.getFullYear(), t.getMonth() + 1, 0))
      ]
    }
  },
  {
    label: 'Last month',
    range: () => {
      const t = new Date()
      return [
        iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)),
        iso(new Date(t.getFullYear(), t.getMonth(), 0))
      ]
    }
  },
  {
    label: 'This year',
    range: () => {
      const y = new Date().getFullYear()
      return [`${y}-01-01`, `${y}-12-31`]
    }
  },
  {
    label: 'Last year',
    range: () => {
      const y = new Date().getFullYear() - 1
      return [`${y}-01-01`, `${y}-12-31`]
    }
  }
]

/**
 * A from / to date filter: two date fields, quick picks (last 30 days, this month...) and a clear
 * button. Dates are yyyy-mm-dd strings, '' = open end. The end cannot be set before the start.
 *
 *   <DateRange from={dateFrom} to={dateTo} onChange={(f, t) => { setDateFrom(f); setDateTo(t) }} />
 */
export default function DateRange({
  from,
  to,
  onChange,
  label = 'Date',
  presets = true,
  inputStyle
}: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  /** Names the fields for screen readers: "<label> from" / "<label> to" */
  label?: string
  presets?: boolean
  inputStyle?: React.CSSProperties
}): React.JSX.Element {
  return (
    <div className="date-range" role="group" aria-label={`${label} range`}>
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange(e.target.value, to)}
        aria-label={`${label} from`}
        title={`${label} from`}
        style={inputStyle}
      />
      <span className="muted">to</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(from, e.target.value)}
        aria-label={`${label} to`}
        title={`${label} to`}
        style={inputStyle}
      />
      {presets && (
        <select
          value=""
          onChange={(e) => {
            const p = PRESETS.find((x) => x.label === e.target.value)
            if (p) onChange(...p.range())
          }}
          aria-label={`${label}: quick pick`}
          title="Quick pick"
          style={inputStyle}
        >
          <option value="">Quick pick...</option>
          {PRESETS.map((p) => (
            <option key={p.label} value={p.label}>
              {p.label}
            </option>
          ))}
        </select>
      )}
      {(from || to) && (
        <button
          type="button"
          className="btn-ghost btn-icon btn-sm"
          onClick={() => onChange('', '')}
          aria-label={`Clear ${label.toLowerCase()} range`}
          title="Clear dates"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
