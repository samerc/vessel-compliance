import { useEffect } from 'react'
import { confirmDialog } from '../components/DialogHost'

// Pages with unsaved edits register here; App.tsx asks before navigating away
// (sidebar, Ctrl+K, Recent, breadcrumbs, back handlers). Module level, like DialogHost.

const DEFAULT_MESSAGE = 'Leave without saving? Your changes will be lost.'

interface GuardEntry {
  message?: string
}

const active = new Set<GuardEntry>()

/** Registers the calling page as having unsaved changes while `isDirty` is true */
export function useUnsavedGuard(isDirty: boolean, message?: string): void {
  useEffect(() => {
    if (!isDirty) return
    const entry: GuardEntry = { message }
    active.add(entry)
    return () => {
      active.delete(entry)
    }
  }, [isDirty, message])
}

/** True when any mounted page has unsaved changes */
export function hasUnsavedChanges(): boolean {
  return active.size > 0
}

/** Asks before leaving when there are unsaved changes; resolves true when it is OK to leave.
 *  A confirmed leave drops the guards, so a second check on the same navigation does not ask again. */
export async function confirmLeave(): Promise<boolean> {
  if (active.size === 0) return true
  const last = [...active][active.size - 1]
  const ok = await confirmDialog(last.message || DEFAULT_MESSAGE, {
    title: 'Unsaved changes',
    confirmLabel: 'Leave'
  })
  if (ok) active.clear()
  return ok
}

/** Runs `leave` right away when nothing is unsaved, otherwise after the user confirms */
export function leaveThen(leave: () => void): void {
  if (active.size === 0) {
    leave()
    return
  }
  void confirmLeave().then((ok) => {
    if (ok) leave()
  })
}
