// Settings / master lists read by the quotation editor tabs (clauses, warranties, templates...).
// They do not change while a quotation is open, but the tabs unmount on every switch, so without
// this cache each tab visit (and each reload after an edit) re-read them over IPC. The cache lives
// for one editor session: QuotationEditor clears it on mount and unmount.
//
// Only cache lists the editor itself never edits. Quotation rows (selections, vessels, assureds)
// and lists the tabs can add to (assured roles, flag states, fleets, vessels, entities) are
// always read fresh.

import { isIpcError } from '../../utils/ipc'

type Api = typeof window.api
type NoArgKey = Extract<
  {
    [K in keyof Api]-?: Api[K] extends () => Promise<unknown> ? K : never
  }[keyof Api],
  string
>
type Resolved<K extends NoArgKey> = Api[K] extends () => Promise<infer R> ? R : never

const cache = new Map<string, Promise<unknown>>()

// app_settings.quotation_settings_version: the main process bumps it on every save of a
// settings list (any user, any PC). undefined = no baseline yet for this editor session
let knownVersion: string | null | undefined

/** Read through the session cache. Errors and IPC error values are not kept. */
export function cachedIpc<T>(key: string, load: () => Promise<T>): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined
  if (!hit) {
    hit = load().then(
      (v) => {
        if (isIpcError(v)) cache.delete(key)
        return v
      },
      (err) => {
        cache.delete(key)
        throw err
      }
    )
    cache.set(key, hit)
  }
  // A fresh array per caller, so sorting or splicing in one tab never reorders another tab's list
  return hit.then((v) => (Array.isArray(v) ? ([...v] as T) : v))
}

/** A no-argument window.api list read through the session cache, e.g. masterData('piGetClauses'). */
export function masterData<K extends NoArgKey>(name: K): Promise<Resolved<K>> {
  return cachedIpc(name, () => (window.api[name] as () => Promise<Resolved<K>>)())
}

/** A string setting (window.api.getSetting) read through the session cache. */
export function cachedSetting(key: string): ReturnType<Api['getSetting']> {
  return cachedIpc(`getSetting:${key}`, () => window.api.getSetting(key))
}

export function clearMasterDataCache(): void {
  cache.clear()
  knownVersion = undefined
}

/**
 * One cheap read: when someone saved a settings list since the last check, the cache is
 * cleared and true is returned (the caller reloads what it shows). The first call of an
 * editor session only records the version.
 */
export async function checkSettingsVersion(): Promise<boolean> {
  let v: string | null
  try {
    const r = await window.api.getSetting('quotation_settings_version')
    if (isIpcError(r)) return false
    v = typeof r === 'string' ? r : null
  } catch {
    return false
  }
  const changed = knownVersion !== undefined && v !== knownVersion
  knownVersion = v
  if (changed) cache.clear()
  return changed
}
