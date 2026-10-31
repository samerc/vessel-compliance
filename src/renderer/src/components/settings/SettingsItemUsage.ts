// Settings items that quotations link to (clauses, warranties, exclusions, conditions...):
// how many quotations use each one, hiding instead of deleting, and the older-wording rows
// the server keeps when a wording used by sent quotations is edited.

import { useCallback, useEffect, useState } from 'react'
import type { SettingsItemKind, SettingsItemUsage } from '../../../../shared/types'
import { confirmDialog } from '../DialogHost'

/** The fields the master list getters return for hidden / replaced items */
export interface LifecycleFields {
  id: string
  isHidden?: number | boolean | null
  replacedBy?: string | null
}

export const isHiddenItem = (item: { isHidden?: number | boolean | null }): boolean =>
  !!item.isHidden

/** Tooltip on the disabled Edit button of an older wording row */
export const OLDER_WORDING_EDIT_TITLE =
  'Older wording: kept as it was in the quotations sent with it. Edit the newer version instead'

export const OLDER_WORDING_TITLE =
  'Replaced by an edited version; kept in the quotations that were sent with it'

export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`

export interface SettingsItemUsageApi {
  usage: Record<string, SettingsItemUsage>
  /** Quotations using the item (drafts + sent) */
  countOf: (id: string) => number
  sentOf: (id: string) => number
  reload: () => Promise<void>
  showHidden: boolean
  setShowHidden: (v: boolean) => void
  /** Hide / show again, then reload the list and the usage */
  setHidden: (id: string, hidden: boolean) => Promise<void>
}

/**
 * Usage of one kind of settings item. `reloadList` reloads the tab's list after a hide / show;
 * `showError` reports a failure.
 */
export function useSettingsItemUsage(
  kind: SettingsItemKind,
  reloadList: () => unknown,
  showError: (msg: string) => void
): SettingsItemUsageApi {
  const [usage, setUsage] = useState<Record<string, SettingsItemUsage>>({})
  const [showHidden, setShowHidden] = useState(false)

  const fetchUsage = useCallback(
    (): Promise<Record<string, SettingsItemUsage>> =>
      window.api
        .settingsItemsUsage(kind)
        .then((u) => (u && typeof u === 'object' && !('error' in u) ? u : {}))
        .catch(() => ({})),
    [kind]
  )

  useEffect(() => {
    let alive = true
    fetchUsage().then((u) => {
      if (alive) setUsage(u)
    })
    return () => {
      alive = false
    }
  }, [fetchUsage])

  const reload = useCallback(async (): Promise<void> => {
    const u = await fetchUsage()
    setUsage(u)
  }, [fetchUsage])

  const setHidden = useCallback(
    async (id: string, hidden: boolean): Promise<void> => {
      try {
        await window.api.settingsItemsSetHidden(kind, id, hidden)
      } catch (err) {
        showError((err instanceof Error && err.message) || 'Failed to change the item')
      }
      await reloadList()
      await reload()
    },
    [kind, reloadList, reload, showError]
  )

  const countOf = (id: string): number => {
    const u = usage[id]
    return u ? u.drafts + u.sent : 0
  }
  const sentOf = (id: string): number => usage[id]?.sent || 0

  return { usage, countOf, sentOf, reload, showHidden, setShowHidden, setHidden }
}

/**
 * Before saving a changed wording used by sent quotations: they keep the current wording,
 * the server makes a new version for drafts and new quotations. True = go ahead.
 */
export async function confirmWordingEdit(sent: number, wordingChanged: boolean): Promise<boolean> {
  if (sent <= 0 || !wordingChanged) return true
  return confirmDialog(
    `This wording is in ${plural(sent, 'quotation that was', 'quotations that were')} sent. ` +
      'They keep the current wording; draft quotations and new quotations get the edited one. Save?',
    { isDangerous: false }
  )
}

/** Swap an item with its visible neighbour (hidden rows in between are skipped). */
export function moveAmongVisible<T extends { id: string }>(
  all: T[],
  visible: T[],
  index: number,
  direction: 'up' | 'down'
): T[] | null {
  const other = visible[direction === 'up' ? index - 1 : index + 1]
  const item = visible[index]
  if (!item || !other) return null
  const next = [...all]
  const a = next.findIndex((x) => x.id === item.id)
  const b = next.findIndex((x) => x.id === other.id)
  if (a === -1 || b === -1) return null
  ;[next[a], next[b]] = [next[b], next[a]]
  return next
}

/** Dim style for a hidden row that is shown */
export const hiddenRowStyle = (hidden: boolean): React.CSSProperties | undefined =>
  hidden ? { opacity: 0.55 } : undefined
