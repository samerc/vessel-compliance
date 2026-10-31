// Settings items (warranties, clauses, exclusions, conditions...) that a quotation links to.
// An item can be hidden in settings (or replaced by a newer version of its wording): it is then
// no longer OFFERED for new quotations, but quotations that already use it keep showing and
// exporting it. So the master lists keep hidden rows (lookups by id need them) and only what
// is offered is filtered with these helpers.

interface SettingsItemLike {
  id: string
  isHidden?: boolean | number | null
  /** Cargo clause tables: active false = hidden */
  active?: boolean | number | null
  replacedBy?: string | null
}

/** True when the item is hidden in settings (no longer offered for new quotations). */
export function isHiddenItem(item: SettingsItemLike | null | undefined): boolean {
  if (!item) return false
  if (item.isHidden) return true
  return item.active === false || item.active === 0
}

/** Offered = not hidden, or already selected in this quotation (kept visible there). */
export function isOffered(item: SettingsItemLike, selected = false): boolean {
  return selected || !isHiddenItem(item)
}

/** The items to offer: the non-hidden ones plus any hidden one that is already selected. */
export function offeredItems<T extends SettingsItemLike>(
  list: T[],
  selectedIds?: Iterable<string | null | undefined> | null
): T[] {
  const selected = new Set<string>()
  if (selectedIds) for (const id of selectedIds) if (id) selected.add(id)
  return list.filter((item) => isOffered(item, selected.has(item.id)))
}

/** Ids from a preset / default set without the hidden items. Unknown ids are kept. */
export function withoutHiddenIds<T extends SettingsItemLike>(ids: string[], list: T[]): string[] {
  const hidden = new Set(list.filter(isHiddenItem).map((i) => i.id))
  return ids.filter((id) => !hidden.has(id))
}

/**
 * A resolver from any item id to the latest version of it, following replacedBy chains
 * (old -> newer -> newest). Ids that were never replaced resolve to themselves.
 */
export function latestIdResolver(
  ...lists: (SettingsItemLike[] | null | undefined)[]
): (id: string | null | undefined) => string | null | undefined {
  const next = new Map<string, string>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const item of list) if (item.replacedBy) next.set(item.id, item.replacedBy)
  }
  return (id) => {
    if (!id) return id
    let cur = id
    const seen = new Set<string>([cur])
    while (next.has(cur)) {
      const n = next.get(cur) as string
      if (seen.has(n)) break
      seen.add(n)
      cur = n
    }
    return cur
  }
}
