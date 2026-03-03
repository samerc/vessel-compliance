import { useEffect } from 'react'

/**
 * Calls `onEscape` when the Escape key is pressed.
 * Pass `active = false` to temporarily disable (e.g. when the modal is hidden).
 */
export function useEscapeKey(onEscape: () => void, active = true): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onEscape()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onEscape, active])
}
