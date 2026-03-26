import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const execAsync = promisify(exec)

/**
 * Convert a DOCX file to PDF using Microsoft Word COM automation via PowerShell.
 * Returns the path to the generated PDF file.
 */
export async function convertDocxToPdf(docxPath: string): Promise<string> {
  const pdfPath = docxPath.replace(/\.docx$/i, '.pdf')
  const absDocx = path.resolve(docxPath).replace(/\//g, '\\')
  const absPdf = path.resolve(pdfPath).replace(/\//g, '\\')

  const tmpScript = path.join(os.tmpdir(), `vc_convert_${Date.now()}.ps1`)

  // wdFormatPDF = 17
  const script = [
    '$ErrorActionPreference = "Stop"',
    '$word = New-Object -ComObject Word.Application',
    '$word.Visible = $false',
    'try {',
    `    $doc = $word.Documents.Open("${absDocx}")`,
    `    $doc.SaveAs2("${absPdf}", 17)`,
    '    $doc.Close([ref]$false)',
    '} finally {',
    '    $word.Quit([ref]$false)',
    '    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null',
    '}',
  ].join('\n')

  fs.writeFileSync(tmpScript, script, 'utf-8')

  try {
    await execAsync(
      `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpScript}"`,
      { timeout: 120000 }
    )
  } finally {
    try {
      fs.unlinkSync(tmpScript)
    } catch {
      /* ignore cleanup error */
    }
  }

  if (!fs.existsSync(absPdf)) {
    throw new Error('PDF conversion failed — output file not found. Is Microsoft Word installed?')
  }

  return absPdf
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
 * Modify a DOCX buffer to set the starting page number.
 * This injects a <w:pgNumType w:start="N"/> into the section properties,
 * so the footer page number field starts at the given offset.
 */
export async function setDocxPageStart(
  docxBuffer: Buffer,
  startPage: number
): Promise<Buffer> {
  const JSZip = require('jszip')
  const zip = await JSZip.loadAsync(docxBuffer)

  const docXmlFile = zip.file('word/document.xml')
  if (!docXmlFile) {
    throw new Error('Invalid DOCX — missing word/document.xml')
  }

  let docXml: string = await docXmlFile.async('string')

  // Remove any existing pgNumType element
  docXml = docXml.replace(/<w:pgNumType[^/]*\/>/g, '')

  // Add pgNumType before the closing </w:sectPr>
  docXml = docXml.replace(
    /<\/w:sectPr>/,
    `<w:pgNumType w:start="${startPage}"/></w:sectPr>`
  )

  zip.file('word/document.xml', docXml)
  const result = await zip.generateAsync({ type: 'nodebuffer' })
  return Buffer.from(result)
}

/**
 * Full pipeline: generate a combined policy + T&C PDF.
 *
 * Steps:
 * 1. Save policy DOCX blob to temp file
 * 2. Convert to PDF via Word COM
 * 3. Count pages in policy PDF
 * 4. Modify T&C DOCX to start page numbering after the policy
 * 5. Convert T&C DOCX to PDF
 * 6. Merge both PDFs
 * 7. Return the merged PDF path (caller is responsible for cleanup)
 */
export async function buildPolicyWithTC(
  policyDocxBuffer: Buffer,
  tcDocxBuffer: Buffer,
  outputDir: string,
  filePrefix: string
): Promise<{ pdfPath: string; tempFiles: string[] }> {
  const tempFiles: string[] = []

  try {
    // 1. Save policy DOCX to temp
    const policyDocxPath = path.join(outputDir, `${filePrefix}_policy.docx`)
    fs.writeFileSync(policyDocxPath, policyDocxBuffer)
    tempFiles.push(policyDocxPath)

    // 2. Convert policy DOCX to PDF
    const policyPdfPath = await convertDocxToPdf(policyDocxPath)
    tempFiles.push(policyPdfPath)

    // 3. Count pages in policy PDF
    const policyPageCount = await countPdfPages(policyPdfPath)

    // 4. Modify T&C DOCX to start page numbering after policy
    const modifiedTcBuffer = await setDocxPageStart(tcDocxBuffer, policyPageCount + 1)
    const tcDocxPath = path.join(outputDir, `${filePrefix}_tc.docx`)
    fs.writeFileSync(tcDocxPath, modifiedTcBuffer)
    tempFiles.push(tcDocxPath)

    // 5. Convert T&C DOCX to PDF
    const tcPdfPath = await convertDocxToPdf(tcDocxPath)
    tempFiles.push(tcPdfPath)

    // 6. Merge both PDFs
    const mergedPdfPath = path.join(outputDir, `${filePrefix}.pdf`)
    await mergePdfs([policyPdfPath, tcPdfPath], mergedPdfPath)
    tempFiles.push(mergedPdfPath)

    return { pdfPath: mergedPdfPath, tempFiles }
  } catch (error) {
    // Clean up temp files on error
    for (const f of tempFiles) {
      try {
        fs.unlinkSync(f)
      } catch {
        /* ignore */
      }
    }
    throw error
  }
}
