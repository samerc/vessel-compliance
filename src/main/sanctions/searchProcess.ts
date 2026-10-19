import { utilityProcess } from 'electron'
import { join } from 'path'
import { sanctionsService, type SearchOptions } from './SanctionsService'

type SearchOutput = ReturnType<typeof sanctionsService.search>

// Sanctions searches run in a utility process (workers/sanctionsSearch.ts) so the app stays
// responsive during the weekly check and big searches. The process is started on the first
// search and closed after 10 idle minutes. If it cannot start or fails, the search runs here as
// before (slower for the app, same result).
let child: Electron.UtilityProcess | null = null
let seq = 0
let idle: NodeJS.Timeout | null = null
let failures = 0
const pending = new Map<
  number,
  { resolve: (v: SearchOutput) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
>()

export function stopSanctionsSearchProcess(): void {
  if (idle) clearTimeout(idle)
  idle = null
  try {
    child?.kill()
  } catch {
    /* already gone */
  }
  child = null
}

function start(): Electron.UtilityProcess {
  // Same build as this file (hot-update or installed): never the installer's older copy
  const c = utilityProcess.fork(join(__dirname, 'sanctionsSearch.js'), [], {
    serviceName: 'Sanctions search',
    stdio: 'pipe'
  })
  let stderr = ''
  c.stderr?.on('data', (d: Buffer) => {
    stderr = (stderr + d.toString()).slice(-2000)
  })
  c.on('message', (m: { id: number; success: boolean; result?: SearchOutput; error?: string }) => {
    const p = pending.get(m?.id)
    if (!p) return
    pending.delete(m.id)
    clearTimeout(p.timer)
    if (m.success && m.result) p.resolve(m.result)
    else p.reject(new Error(m.error || 'Sanctions search failed'))
  })
  c.on('exit', (code) => {
    if (child === c) child = null
    if (pending.size) console.error('[sanctions] search process exited', code, stderr)
    for (const [id, p] of pending) {
      clearTimeout(p.timer)
      p.reject(new Error(`Sanctions search process stopped (code ${code})`))
      pending.delete(id)
    }
  })
  return c
}

function searchInProcess(query: string, options: SearchOptions): Promise<SearchOutput> {
  const dir = sanctionsService.getDbDir()
  if (!dir) return Promise.reject(new Error('Sanctions lists not opened'))
  if (!child) child = start()
  if (idle) clearTimeout(idle)
  idle = setTimeout(stopSanctionsSearchProcess, 10 * 60 * 1000)
  idle.unref()
  const id = ++seq
  return new Promise((resolve, reject) => {
    // The first search builds the index there (a few seconds, more on a network share)
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Sanctions search timed out'))
      stopSanctionsSearchProcess()
    }, 60000)
    pending.set(id, { resolve, reject, timer })
    child!.postMessage({
      id,
      dir,
      version: sanctionsService.getDataVersion(),
      query,
      options
    })
  })
}

/** sanctionsService.search, run in the search process (falls back to this process) */
export async function searchSanctions(
  query: string,
  options: SearchOptions = {}
): Promise<SearchOutput> {
  // After repeated failures stop trying for this session
  if (failures < 3) {
    try {
      const r = await searchInProcess(query, options)
      failures = 0
      return r
    } catch (e) {
      failures++
      console.error('[sanctions] search process failed, searching in the app instead:', e)
    }
  }
  return sanctionsService.search(query, options)
}
