import { Loader2 } from 'lucide-react'

interface SpinnerProps {
  size?: number
  /** Optional text shown next to the spinner */
  label?: string
}

export default function Spinner({ size = 16, label }: SpinnerProps): React.JSX.Element {
  if (!label) return <Loader2 size={size} className="spinner" aria-label="Loading" />
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        color: 'var(--text-secondary)'
      }}
    >
      <Loader2 size={size} className="spinner" /> {label}
    </span>
  )
}
