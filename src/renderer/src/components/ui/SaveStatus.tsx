import { useEffect, useState } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'

/**
 * Saving... / Saved / Not saved, from the save events the preload announces for every
 * user save (vc-save-start / vc-save-end / vc-save-error). Shows nothing until the first save
 * after it is mounted.
 */
export default function SaveStatus(): React.JSX.Element | null {
  const [pending, setPending] = useState(0)
  const [state, setState] = useState<'idle' | 'saved' | 'error'>('idle')
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    const start = (): void => setPending((n) => n + 1)
    const end = (): void => {
      setPending((n) => Math.max(0, n - 1))
      setState('saved')
      setSavedAt(new Date())
    }
    const error = (): void => {
      setPending((n) => Math.max(0, n - 1))
      setState('error')
    }
    window.addEventListener('vc-save-start', start)
    window.addEventListener('vc-save-end', end)
    window.addEventListener('vc-save-error', error)
    return () => {
      window.removeEventListener('vc-save-start', start)
      window.removeEventListener('vc-save-end', end)
      window.removeEventListener('vc-save-error', error)
    }
  }, [])

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontSize: '0.75rem',
    whiteSpace: 'nowrap'
  }
  if (pending > 0)
    return (
      <span role="status" style={{ ...style, color: 'var(--text-secondary)' }}>
        <Loader2 size={13} className="spinner" /> Saving...
      </span>
    )
  if (state === 'error')
    return (
      <span role="status" style={{ ...style, color: 'var(--danger)' }}>
        <AlertCircle size={13} /> Last change not saved
      </span>
    )
  if (state === 'saved' && savedAt)
    return (
      <span
        role="status"
        style={{ ...style, color: 'var(--text-secondary)' }}
        title={`Saved at ${savedAt.toLocaleTimeString()}`}
      >
        <Check size={13} color="var(--success)" /> Saved
      </span>
    )
  return null
}
