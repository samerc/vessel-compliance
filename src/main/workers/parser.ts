import { parentPort } from 'worker_threads'
import fs from 'fs'
import path from 'path'
import type { PDFParse as PDFParseType } from 'pdf-parse'
import * as mammoth from 'mammoth'
import { parseDefectTables, parseDefectText, type ParsedDefect } from './defectParser'

// Condition-survey defect import: Word files are read from their tables (exact), PDFs from text.
// The parsing rules live in defectParser.ts.
// Runs as an Electron utility process (process.parentPort, messages wrapped in { data }); the
// worker_threads port is kept for running it standalone in tests.
// pdf.js only takes its Node.js code path (polyfills, in-process worker) when it believes it runs in
// Node; it treats any Electron process whose process.type is not 'browser' as a web page. This is an
// isolated utility process with no DOM, so hide the Electron process type BEFORE pdf-parse loads.
if ((process as any).type && (process as any).type !== 'browser') {
  try { Object.defineProperty(process, 'type', { value: undefined, configurable: true, writable: true }) } catch { /* keep going */ }
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as { PDFParse: typeof PDFParseType }

const utilityPort = (process as any).parentPort as
  | { on: (ev: 'message', cb: (e: { data: any }) => void) => void; postMessage: (m: unknown) => void }
  | undefined
const port = {
  on: (cb: (msg: any) => void): void => {
    if (utilityPort) utilityPort.on('message', (e) => cb(e.data))
    else parentPort?.on('message', cb)
  },
  post: (m: unknown): void => { if (utilityPort) utilityPort.postMessage(m); else parentPort?.postMessage(m) },
  close: (): void => { if (!utilityPort) parentPort?.close() }
}

port.on(async ({ filePath }) => {
  try {
    const ext = path.extname(filePath).toLowerCase()
    const buffer = fs.readFileSync(filePath)
    let defects: ParsedDefect[]

    if (ext === '.pdf') {
      const parser = new PDFParse({ data: buffer })
      try {
        const { text } = await parser.getText()
        defects = parseDefectText(text)
      } finally {
        await parser.destroy().catch(() => {})
      }
    } else {
      const { value: html } = await mammoth.convertToHtml({ buffer })
      defects = parseDefectTables(html) ?? parseDefectText((await mammoth.extractRawText({ buffer })).value)
    }

    if (defects.length === 0) {
      throw new Error('No defects found. Is this the "Deficiencies & Recommendations" page of a condition survey report?')
    }
    port.post({ success: true, defects })
  } catch (error: any) {
    port.post({ success: false, error: error.message })
  }
  // One file per process: exit once pdf.js has finished cleaning up (the parent kills it if it lingers)
  port.close()
  if (utilityPort) setTimeout(() => process.exit(0), 1000)
})
