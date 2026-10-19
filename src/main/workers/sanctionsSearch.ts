// Sanctions searches in their own utility process. A search scores thousands of list entries and
// takes 0.5-3 s; on the main process that froze every screen (the weekly check of ~2,300 names
// made the app stutter for 20 minutes). This process opens the same sanctions.db and keeps its
// own index, rebuilt when the main process says the lists changed (dataVersion).
import { SanctionsService, type SearchOptions } from '../sanctions/SanctionsService'

interface SearchRequest {
  id: number
  dir: string
  version: number
  query: string
  options: SearchOptions
}

const proc = process as unknown as {
  parentPort?: {
    on: (ev: 'message', cb: (e: { data: SearchRequest }) => void) => void
    postMessage: (m: unknown) => void
  }
}
const port = proc.parentPort!

let svc: SanctionsService | null = null
let loaded: { dir: string; version: number } | null = null

port.on('message', ({ data: req }) => {
  try {
    if (!svc || !loaded || loaded.dir !== req.dir || loaded.version !== req.version) {
      svc?.close()
      svc = new SanctionsService()
      svc.initialize(req.dir)
      loaded = { dir: req.dir, version: req.version }
    }
    port.postMessage({ id: req.id, success: true, result: svc.search(req.query, req.options) })
  } catch (e) {
    // Rebuild on the next request
    loaded = null
    port.postMessage({ id: req.id, success: false, error: (e as Error)?.message || String(e) })
  }
})
