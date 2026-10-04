import fs from 'fs'
import path from 'path'
import type { PDFParse as PDFParseType } from 'pdf-parse'
import type { Bbox, Block } from 'tesseract.js'

// SIC letter import: reads scanned letters (image-only PDFs, or a photo/scan file) page by page.
// Runs as an Electron utility process that stays alive while the import screen is used (the OCR
// engine is slow to start), one request at a time. Messages: { id, filePath, page, rotation, langPath }.
// Same pdf.js note as parser.ts: hide the Electron process type BEFORE pdf-parse loads.
const proc = process as NodeJS.Process & {
  type?: string
  parentPort?: {
    on: (ev: 'message', cb: (e: { data: OcrRequest }) => void) => void
    postMessage: (m: unknown) => void
  }
}
if (proc.type && proc.type !== 'browser') {
  try {
    Object.defineProperty(process, 'type', { value: undefined, configurable: true, writable: true })
  } catch {
    /* keep going */
  }
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PDFParse } = require('pdf-parse') as { PDFParse: typeof PDFParseType }
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createWorker } = require('tesseract.js') as typeof import('tesseract.js')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createCanvas, loadImage } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')

interface OcrRequest {
  id: number
  filePath: string
  page: number
  rotation: number
  langPath: string
}
const port = proc.parentPort!

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface OcrWord {
  text: string
  bbox: Box
}
export interface OcrLine {
  text: string
  bbox: Box
  words: OcrWord[]
}

// pdf.js decodes JPEG 2000 scans (some letters) with its openjpeg wasm; it wants a URL-style
// folder path with a trailing slash
const pdfWasmUrl =
  path.join(path.dirname(require.resolve('pdfjs-dist/package.json')), 'wasm').replace(/\\/g, '/') +
  '/'

// Last page read, so a re-read (rotation) does not extract it again
let cacheKey = ''
let cached: { pageCount: number; image: Buffer } | null = null

async function pageImage(
  filePath: string,
  page: number
): Promise<{ pageCount: number; index: number; image: Buffer }> {
  const stat = fs.statSync(filePath)
  if (path.extname(filePath).toLowerCase() !== '.pdf') {
    return { pageCount: 1, index: 0, image: fs.readFileSync(filePath) }
  }
  const key = `${filePath}|${stat.size}|${stat.mtimeMs}|${page}`
  if (key === cacheKey && cached)
    return { pageCount: cached.pageCount, index: page, image: cached.image }
  const parser = new PDFParse({ data: fs.readFileSync(filePath), wasmUrl: pdfWasmUrl })
  try {
    const res = await parser.getImage({
      imageBuffer: true,
      imageDataUrl: false,
      partial: [page + 1]
    })
    const total = res.total || 1
    if (page >= total) return pageImage(filePath, total - 1)
    // A scan has one image per page; take the largest if there are more (logos, stamps)
    const images = res.pages[0]?.images || []
    const best = [...images].sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const image = best ? Buffer.from(best.data) : Buffer.alloc(0)
    cacheKey = key
    cached = { pageCount: total, image }
    return { pageCount: total, index: page, image }
  } finally {
    await parser.destroy().catch(() => {})
  }
}

let worker: Awaited<ReturnType<typeof createWorker>> | null = null
async function getWorker(langPath: string): Promise<NonNullable<typeof worker>> {
  if (!worker) {
    worker = await createWorker(['ara', 'eng'], 1, {
      langPath,
      gzip: false,
      cacheMethod: 'none'
    })
  }
  return worker
}

// OCR output carries direction marks around mixed Arabic/Latin runs
const stripBidi = (t: string): string => t.replace(/[\u200e\u200f\u202a-\u202e]/g, '')

const box = (b: Bbox): Box => ({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 })

async function handle(msg: OcrRequest): Promise<unknown> {
  const { pageCount, index, image } = await pageImage(msg.filePath, Math.max(0, msg.page | 0))
  if (!image.length) return { pageCount, page: index, image: null, width: 0, height: 0, lines: [] }

  // Rotate (ID card photos come sideways) so the OCR boxes match the image shown
  const rotation = [90, 180, 270].includes(msg.rotation) ? msg.rotation : 0
  const img = await loadImage(image)
  const swap = rotation === 90 || rotation === 270
  const width = swap ? img.height : img.width
  const height = swap ? img.width : img.height
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.translate(width / 2, height / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.drawImage(img, -img.width / 2, -img.height / 2)
  const png = canvas.toBuffer('image/png')
  // Shown on screen as JPEG: a fraction of the size of the PNG over IPC
  const jpeg = await canvas.encode('jpeg', 82)

  const w = await getWorker(msg.langPath)
  const { data } = await w.recognize(png, {}, { blocks: true, text: false })
  const lines: OcrLine[] = []
  for (const b of (data.blocks || []) as Block[]) {
    for (const p of b.paragraphs || []) {
      for (const l of p.lines || []) {
        const text = stripBidi(String(l.text || ''))
          .replace(/\s+/g, ' ')
          .trim()
        if (!text) continue
        lines.push({
          text,
          bbox: box(l.bbox),
          words: (l.words || []).map((wd) => ({
            text: stripBidi(String(wd.text || '')),
            bbox: box(wd.bbox)
          }))
        })
      }
    }
  }
  return {
    pageCount,
    page: index,
    image: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    width,
    height,
    lines
  }
}

let queue = Promise.resolve()
port.on('message', (e) => {
  const msg = e.data
  queue = queue.then(async () => {
    try {
      port.postMessage({ id: msg.id, success: true, result: await handle(msg) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      port.postMessage({ id: msg.id, success: false, error: message })
    }
  })
})
