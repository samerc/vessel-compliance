import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { createHash } from 'crypto'

// execFile (no shell): file paths travel as argv, never as code. A vessel name in a
// file name (e.g. containing $(...) or quotes) must not be able to run commands.
const execFileAsync = promisify(execFile)

/**
 * Convert a DOCX file to PDF.
 * Tries Microsoft Word COM first, falls back to LibreOffice.
 * Returns the path to the generated PDF file.
 */
export async function convertDocxToPdf(docxPath: string): Promise<string> {
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf')

  // Try Word COM first
  try {
    await convertViaWord(docxPath, pdfPath)
    if (fs.existsSync(pdfPath)) return pdfPath
  } catch (wordErr) {
    console.log('[DocxToPdf] Word COM failed, trying LibreOffice...', (wordErr as Error).message)
  }

  // Fall back to LibreOffice
  try {
    await convertViaLibreOffice(docxPath, pdfPath)
    if (fs.existsSync(pdfPath)) return pdfPath
  } catch (loErr) {
    console.log('[DocxToPdf] LibreOffice failed:', (loErr as Error).message)
  }

  throw new Error(
    'PDF conversion failed — neither Microsoft Word nor LibreOffice could convert the file. Please install one of them.'
  )
}

async function convertViaWord(docxPath: string, pdfPath: string): Promise<void> {
  const absDocx = path.resolve(docxPath).replace(/\//g, '\\')
  const absPdf = path.resolve(pdfPath).replace(/\//g, '\\')
  const tmpScript = path.join(os.tmpdir(), `vc_convert_${Date.now()}.ps1`)

  // Paths are passed as -File parameters (bound literally, not parsed as PowerShell)
  const script = [
    'param([string]$InPath, [string]$OutPath)',
    '$ErrorActionPreference = "Stop"',
    '$word = New-Object -ComObject Word.Application',
    '$word.Visible = $false',
    'try {',
    '    $doc = $word.Documents.Open($InPath)',
    '    $doc.SaveAs2($OutPath, 17)',
    '    $doc.Close([ref]$false)',
    '} finally {',
    '    $word.Quit([ref]$false)',
    '    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null',
    '}'
  ].join('\n')

  fs.writeFileSync(tmpScript, script, 'utf-8')
  try {
    await execFileAsync(
      'powershell',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        tmpScript,
        '-InPath',
        absDocx,
        '-OutPath',
        absPdf
      ],
      { timeout: 120000, windowsHide: true }
    )
  } finally {
    try {
      fs.unlinkSync(tmpScript)
    } catch {
      /* ignore */
    }
  }
}

async function convertViaLibreOffice(docxPath: string, pdfPath: string): Promise<void> {
  const absDocx = path.resolve(docxPath)
  const outDir = path.dirname(path.resolve(pdfPath))

  // Try common LibreOffice locations — check file existence instead of --version
  // (soffice --version can hang on Windows if a GUI instance is running)
  const loPaths = [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice'
  ]

  let loPath = ''
  for (const p of loPaths) {
    if (fs.existsSync(p)) {
      loPath = p
      break
    }
  }

  // Fallback: try 'soffice' on PATH
  if (!loPath) {
    try {
      await execFileAsync('soffice', ['--version'], { timeout: 5000, windowsHide: true })
      loPath = 'soffice'
    } catch {
      /* not on PATH */
    }
  }

  if (!loPath) throw new Error('LibreOffice not found. Checked: ' + loPaths.join(', '))

  console.log(`[DocxToPdf] Using LibreOffice at: ${loPath}`)
  await execFileAsync(loPath, ['--headless', '--convert-to', 'pdf', '--outdir', outDir, absDocx], {
    timeout: 120000,
    windowsHide: true
  })
}

/**
 * Count the number of pages in a PDF using pdf-lib.
 */
export async function countPdfPages(pdfPath: string): Promise<number> {
  const { PDFDocument } = await import('pdf-lib')
  const data = fs.readFileSync(pdfPath)
  const pdf = await PDFDocument.load(data)
  return pdf.getPageCount()
}

/**
 * Merge multiple PDF files into one output file using pdf-lib.
 */
export async function mergePdfs(pdfPaths: string[], outputPath: string): Promise<void> {
  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()

  for (const p of pdfPaths) {
    const data = fs.readFileSync(p)
    const pdf = await PDFDocument.load(data)
    const pages = await merged.copyPages(pdf, pdf.getPageIndices())
    for (const page of pages) {
      merged.addPage(page)
    }
  }

  const bytes = await merged.save()
  fs.writeFileSync(outputPath, Buffer.from(bytes))
}

/**
 * Modify a DOCX buffer to set the starting page number and optionally inject a footer.
 * This injects a <w:pgNumType w:start="N"/> into the section properties,
 * so the footer page number field starts at the given offset.
 * If policyNumber/policyTypeTitle are provided, adds a footer with "{Type} Cover {Number}".
 */
export async function setDocxPageStart(
  docxBuffer: Buffer,
  startPage: number,
  policyNumber?: string,
  policyTypeTitle?: string,
  totalPages?: number
): Promise<Buffer> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(docxBuffer)

  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) {
    throw new Error('Invalid DOCX — missing word/document.xml')
  }

  let docXml: string = await docXmlFile.async('string')

  // Remove any existing pgNumType element
  docXml = docXml.replace(/<w:pgNumType[^/]*\/>/g, '')

  // Add pgNumType before the closing </w:sectPr>
  docXml = docXml.replace(/<\/w:sectPr>/, `<w:pgNumType w:start="${startPage}"/></w:sectPr>`)

  // Inject a footer with policy type title + number + page numbers
  if (policyNumber && policyTypeTitle) {
    // Footer XML: centered "{Type} Cover {PolicyNumber}" + "Page X of Y" (Y = totalPages if known)
    const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:after="0" w:line="240"/></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:t xml:space="preserve">${policyTypeTitle} Cover ${policyNumber}</w:t></w:r>
  </w:p>
  <w:p>
    <w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0"/></w:pPr>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:t xml:space="preserve">Page </w:t></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:instrText> PAGE </w:instrText></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:fldChar w:fldCharType="end"/></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:t xml:space="preserve"> of </w:t></w:r>${
        totalPages
          ? `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:t>${totalPages}</w:t></w:r>`
          : `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:instrText> NUMPAGES </w:instrText></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:fldChar w:fldCharType="end"/></w:r>`
      }
  </w:p>
</w:ftr>`
    zip.file('word/footer_tc.xml', footerXml)

    // Add the footer relationship
    const relsFile = zip.file('word/_rels/document.xml.rels')
    if (relsFile) {
      let relsXml: string = await relsFile.async('string')
      const footerRelId = 'rIdTcFooter'
      if (!relsXml.includes(footerRelId)) {
        relsXml = relsXml.replace(
          '</Relationships>',
          `<Relationship Id="${footerRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer_tc.xml"/></Relationships>`
        )
        zip.file('word/_rels/document.xml.rels', relsXml)
      }

      // Remove any existing footer references from sectPr so ours takes priority
      docXml = docXml.replace(/<w:footerReference[^/]*\/>/g, '')

      // Add our footer reference inside sectPr
      docXml = docXml.replace(
        /<\/w:sectPr>/,
        `<w:footerReference w:type="default" r:id="${footerRelId}"/></w:sectPr>`
      )

      // Add footer content type if not already present
      const ctFile = zip.file('[Content_Types].xml')
      if (ctFile) {
        let ctXml: string = await ctFile.async('string')
        if (!ctXml.includes('footer_tc.xml')) {
          ctXml = ctXml.replace(
            '</Types>',
            '<Override PartName="/word/footer_tc.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>'
          )
          zip.file('[Content_Types].xml', ctXml)
        }
      }
    }
  }

  zip.file('word/document.xml', docXml)
  const result = await zip.generateAsync({ type: 'nodebuffer' })
  return Buffer.from(result)
}

/**
 * Policy + T&C as one PDF. The policy pages are counted, the T&C is numbered from the next page.
 * - countOnly: only count (policy pages + T&C pages), no merge; the caller re-generates the policy
 *   with that total in its footer and calls again with totalPages
 * - totalPages: the total to print in the T&C footer (the policy DOCX already carries it)
 */
export async function buildPolicyWithTC(
  policyDocxBuffer: Buffer,
  tcDocxBuffer: Buffer,
  outputDir: string,
  filePrefix: string,
  policyNumber?: string,
  policyTypeTitle?: string,
  opts: { countOnly?: boolean; totalPages?: number } = {}
): Promise<{
  pdfPath: string
  tempFiles: string[]
  totalPages: number
  policyPages: number
  tcPages: number
}> {
  const tempFiles: string[] = []
  try {
    const policyPdfPath = await convertBuffer(
      policyDocxBuffer,
      outputDir,
      `${filePrefix}_policy`,
      tempFiles
    )
    const policyPages = await countPdfPages(policyPdfPath)
    const fill: TcFill = { startPage: policyPages + 1, policyNumber, typeTitle: policyTypeTitle }

    if (opts.countOnly || !opts.totalPages) {
      const tcPages = await countTcPages(
        tcDocxBuffer,
        fill,
        outputDir,
        `${filePrefix}_tc_count`,
        tempFiles
      )
      if (opts.countOnly)
        return {
          pdfPath: '',
          tempFiles,
          totalPages: policyPages + tcPages,
          policyPages,
          tcPages
        }
      opts = { totalPages: policyPages + tcPages }
    }
    const totalPages = opts.totalPages!
    const tcPdfPath = await convertBuffer(
      await prepareTcDocx(tcDocxBuffer, { ...fill, totalPages }),
      outputDir,
      `${filePrefix}_tc`,
      tempFiles
    )
    const tcPages = await countPdfPages(tcPdfPath)
    const mergedPdfPath = path.join(outputDir, `${filePrefix}.pdf`)
    await mergePdfs([policyPdfPath, tcPdfPath], mergedPdfPath)
    tempFiles.push(mergedPdfPath)
    return { pdfPath: mergedPdfPath, tempFiles, totalPages, policyPages, tcPages }
  } catch (error) {
    removeTempFiles(tempFiles)
    throw error
  }
}

// ==================== T&C templates written in Word ====================
// The insurer's T&C files carry their own headers / footers (logo, watermark, "P&I Certificate
// P26210074", "Page 4 of 30", title line). The certificate number and the page total are typed in
// by hand there. They are filled per policy here, keeping everything else of the footer:
//  - placeholders {policy_number} / {number}, {total_pages} / {total}, {type} wherever they are
//  - otherwise: the number after "Certificate" / "Cover", the number after "Page N of", and a
//    leftover "x" typed in front of "Page" (a cut "H2520x" placeholder)
// Word splits such text over several runs ("P", "262", "100", "74"), so the text of a paragraph is
// rebuilt across its runs.

export interface TcFill {
  /** Number of the first T&C page (pages before it: the policy or the signed scan) */
  startPage: number
  /** Total pages of the whole document; left as typed when unknown */
  totalPages?: number
  policyNumber?: string
  /** "P&I", "Hull"... for {type} and for the generated footer of a template without one */
  typeTitle?: string
}

const xmlUnescape = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
const xmlEscape = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const PLACEHOLDER_RE = /\{(policy_number|number|total_pages|total|type)\}/i

/** One edit of a paragraph's text: [start, end) replaced by text */
interface TextEdit {
  start: number
  end: number
  text: string
}

/** Edits for one paragraph of a header / footer */
function tcParagraphEdits(text: string, fill: TcFill, usePlaceholders: boolean): TextEdit[] {
  const edits: TextEdit[] = []
  const add = (start: number, end: number, t: string | undefined): void => {
    if (t == null) return
    if (edits.some((e) => start < e.end && end > e.start)) return
    edits.push({ start, end, text: t })
  }
  const total = fill.totalPages ? String(fill.totalPages) : undefined
  if (usePlaceholders) {
    for (const m of text.matchAll(new RegExp(PLACEHOLDER_RE.source, 'gi'))) {
      const k = m[1].toLowerCase()
      const v =
        k === 'policy_number' || k === 'number'
          ? fill.policyNumber
          : k === 'type'
            ? fill.typeTitle
            : total
      add(m.index!, m.index! + m[0].length, v)
    }
    return edits
  }
  // Certificate / cover number: the rest of the paragraph after the word
  const num = /\b(?:Certificate|Cover)\s+([A-Z]{1,3}\s?\d[\w\-/ ]*?)\s*$/.exec(text)
  if (num && fill.policyNumber) {
    const s = num.index + num[0].lastIndexOf(num[1])
    add(s, s + num[1].length, fill.policyNumber)
  }
  // "Page 4 of 30": the typed total
  const tot = /Page\s*\d*\s*of\s*(\d+)/i.exec(text)
  if (tot && total) {
    const s = tot.index + tot[0].length - tot[1].length
    add(s, s + tot[1].length, total)
  }
  // A cut placeholder left in front of "Page" ("x", "xx")
  const stray = /^\s*([xX]+)(?=\s*Page\b)/.exec(text)
  if (stray) {
    const s = stray.index + stray[0].length - stray[1].length
    add(s, s + stray[1].length, '')
  }
  return edits
}

/** Apply the fill to every paragraph of a header / footer part */
function fillTcPart(xml: string, fill: TcFill, usePlaceholders: boolean): string {
  const runRe = /<w:t(\s[^>]*)?>([^<]*)<\/w:t>/g
  const runs: { start: number; end: number; attrs: string; text: string; para: number }[] = []
  let para = 0
  let last = 0
  for (const m of xml.matchAll(runRe)) {
    // A paragraph end between two text runs starts a new paragraph
    const between = xml.slice(last, m.index)
    para += between.split('</w:p>').length - 1
    runs.push({
      start: m.index!,
      end: m.index! + m[0].length,
      attrs: m[1] || '',
      text: xmlUnescape(m[2]),
      para
    })
    last = m.index! + m[0].length
  }
  const newTexts = runs.map((r) => r.text)
  const byPara = new Map<number, number[]>()
  runs.forEach((r, i) => byPara.set(r.para, [...(byPara.get(r.para) || []), i]))
  for (const idx of byPara.values()) {
    const offsets: number[] = []
    let full = ''
    for (const i of idx) {
      offsets.push(full.length)
      full += runs[i].text
    }
    const edits = tcParagraphEdits(full, fill, usePlaceholders).sort((a, b) => a.start - b.start)
    if (edits.length === 0) continue
    // Rebuild each run: kept characters stay in their run, a replacement goes into the run where
    // the replaced text started
    idx.forEach((i, k) => {
      const rs = offsets[k]
      const re = rs + runs[i].text.length
      let out = ''
      let pos = rs
      for (const e of edits) {
        if (e.end <= rs || e.start >= re) continue
        if (e.start > pos) out += full.slice(pos, e.start)
        if (e.start >= rs) out += e.text
        pos = Math.max(pos, Math.min(e.end, re))
      }
      if (pos < re) out += full.slice(pos, re)
      newTexts[i] = out
    })
  }
  let result = ''
  let cur = 0
  runs.forEach((r, i) => {
    result += xml.slice(cur, r.start)
    const t = newTexts[i]
    const attrs =
      t !== t.trim() && !/xml:space/.test(r.attrs) ? `${r.attrs} xml:space="preserve"` : r.attrs
    result += `<w:t${attrs}>${xmlEscape(t)}</w:t>`
    cur = r.end
  })
  return result + xml.slice(cur)
}

/** Sets the first section's page numbering to start at `start`; later sections continue */
function setSectionPageStart(docXml: string, start: number): string {
  let first = true
  return docXml.replace(/<w:sectPr\b[^>]*>[\s\S]*?<\/w:sectPr>/g, (sect) => {
    if (!first) return sect.replace(/(<w:pgNumType\b[^>]*?)\s+w:start="\d+"/, '$1')
    first = false
    // "Continuous" means nothing for the first section in Word, but LibreOffice then ignores its
    // page number start (the P&I T&C printed "Page 1" instead of 4)
    sect = sect.replace(/<w:type w:val="continuous"\/>/, '')
    if (/<w:pgNumType\b/.test(sect))
      return sect.replace(/<w:pgNumType\b([^>]*?)(\/?)>/, (_m, attrs: string, close: string) => {
        const kept = attrs.replace(/\s+w:start="\d+"/, '')
        return `<w:pgNumType${kept} w:start="${start}"${close}>`
      })
    // Keep the schema order: pgNumType comes before cols / docGrid
    const tag = `<w:pgNumType w:start="${start}"/>`
    if (/<w:cols\b/.test(sect)) return sect.replace(/<w:cols\b/, `${tag}<w:cols`)
    if (/<w:docGrid\b/.test(sect)) return sect.replace(/<w:docGrid\b/, `${tag}<w:docGrid`)
    return sect.replace(/<\/w:sectPr>$/, `${tag}</w:sectPr>`)
  })
}

/**
 * Prepares a Word T&C template for one policy: page numbers start after the policy (or the signed
 * scan), and the footer's certificate number and page total are filled in. A template without a
 * page-number footer gets the generated one ("{Type} Cover {number}" + "Page X of Y").
 */
export async function prepareTcDocx(docxBuffer: Buffer, fill: TcFill): Promise<Buffer> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(docxBuffer)
  const parts = Object.keys(zip.files).filter((n) => /^word\/(header|footer)\d*\.xml$/.test(n))
  const xmls = new Map<string, string>()
  for (const n of parts) xmls.set(n, await zip.file(n)!.async('string'))
  const hasPageField = [...xmls.entries()].some(
    ([n, x]) => n.includes('footer') && /\bPAGE\b/.test(x)
  )
  if (!hasPageField)
    return setDocxPageStart(
      docxBuffer,
      fill.startPage,
      fill.policyNumber,
      fill.typeTitle,
      fill.totalPages
    )
  // Placeholders anywhere in the headers / footers switch off the automatic detection
  const usePlaceholders = [...xmls.values()].some((x) =>
    PLACEHOLDER_RE.test(
      xmlUnescape([...x.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''))
    )
  )
  for (const [n, x] of xmls) zip.file(n, fillTcPart(x, fill, usePlaceholders))
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Invalid DOCX: missing word/document.xml')
  zip.file('word/document.xml', setSectionPageStart(await docFile.async('string'), fill.startPage))
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }))
}

/** Converts a DOCX buffer in a temp file and returns the PDF path (both paths go to tempFiles) */
async function convertBuffer(
  buf: Buffer,
  outputDir: string,
  name: string,
  tempFiles: string[]
): Promise<string> {
  const docxPath = path.join(outputDir, `${name}.docx`)
  fs.writeFileSync(docxPath, buf)
  tempFiles.push(docxPath)
  const pdfPath = await convertDocxToPdf(docxPath)
  tempFiles.push(pdfPath)
  return pdfPath
}

// T&C page counts per template file (its layout does not depend on the numbers filled into the
// footer): a conversion takes 10-40 s, so the count is worked out once per template per session
const tcPageCounts = new Map<string, number>()

async function countTcPages(
  tcDocxBuffer: Buffer,
  fill: TcFill,
  outputDir: string,
  name: string,
  tempFiles: string[]
): Promise<number> {
  const key = createHash('sha1').update(tcDocxBuffer).digest('hex')
  const known = tcPageCounts.get(key)
  if (known) return known
  const pdf = await convertBuffer(
    await prepareTcDocx(tcDocxBuffer, fill),
    outputDir,
    name,
    tempFiles
  )
  const n = await countPdfPages(pdf)
  tcPageCounts.set(key, n)
  return n
}

/** Removes temp files, ignoring the ones already gone */
export function removeTempFiles(files: string[]): void {
  for (const f of files) {
    try {
      fs.unlinkSync(f)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Signed scan + T&C: the scanned signed policy (printed with "Page X of {total}") followed by the
 * T&C numbered from the page after the scan, with the same total.
 */
export async function appendTcToPdf(
  scanPdf: Buffer,
  tcDocxBuffer: Buffer,
  outputDir: string,
  filePrefix: string,
  policyNumber?: string,
  typeTitle?: string
): Promise<{ pdfPath: string; tempFiles: string[]; scanPages: number; tcPages: number }> {
  const tempFiles: string[] = []
  try {
    const scanPath = path.join(outputDir, `${filePrefix}_scan.pdf`)
    fs.writeFileSync(scanPath, scanPdf)
    tempFiles.push(scanPath)
    const scanPages = await countPdfPages(scanPath)
    const fill: TcFill = { startPage: scanPages + 1, policyNumber, typeTitle }
    const tcPages = await countTcPages(
      tcDocxBuffer,
      fill,
      outputDir,
      `${filePrefix}_tc_count`,
      tempFiles
    )
    const tcPdf = await convertBuffer(
      await prepareTcDocx(tcDocxBuffer, { ...fill, totalPages: scanPages + tcPages }),
      outputDir,
      `${filePrefix}_tc`,
      tempFiles
    )
    const merged = path.join(outputDir, `${filePrefix}.pdf`)
    await mergePdfs([scanPath, tcPdf], merged)
    tempFiles.push(merged)
    return { pdfPath: merged, tempFiles, scanPages, tcPages }
  } catch (error) {
    removeTempFiles(tempFiles)
    throw error
  }
}
