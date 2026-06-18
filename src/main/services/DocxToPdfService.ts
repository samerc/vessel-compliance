import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const execAsync = promisify(exec)

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

  throw new Error('PDF conversion failed — neither Microsoft Word nor LibreOffice could convert the file. Please install one of them.')
}

async function convertViaWord(docxPath: string, pdfPath: string): Promise<void> {
  const absDocx = path.resolve(docxPath).replace(/\//g, '\\')
  const absPdf = path.resolve(pdfPath).replace(/\//g, '\\')
  const tmpScript = path.join(os.tmpdir(), `vc_convert_${Date.now()}.ps1`)

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
    try { fs.unlinkSync(tmpScript) } catch { /* ignore */ }
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
    '/usr/bin/libreoffice',
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
      await execAsync('soffice --version', { timeout: 5000 })
      loPath = 'soffice'
    } catch { /* not on PATH */ }
  }

  if (!loPath) throw new Error('LibreOffice not found. Checked: ' + loPaths.join(', '))

  console.log(`[DocxToPdf] Using LibreOffice at: ${loPath}`)
  await execAsync(
    `"${loPath}" --headless --convert-to pdf --outdir "${outDir}" "${absDocx}"`,
    { timeout: 120000 }
  )
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
      <w:t xml:space="preserve"> of </w:t></w:r>${totalPages
    ? `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:t>${totalPages}</w:t></w:r>`
    : `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:fldChar w:fldCharType="begin"/></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:instrText> NUMPAGES </w:instrText></w:r>
    <w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr>
      <w:fldChar w:fldCharType="end"/></w:r>`}
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
  filePrefix: string,
  policyNumber?: string,
  policyTypeTitle?: string
): Promise<{ pdfPath: string; tempFiles: string[]; totalPages: number }> {
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

    // 4. First pass T&C: get page count (no hardcoded total yet, use NUMPAGES field)
    const tcPass1Buffer = await setDocxPageStart(tcDocxBuffer, policyPageCount + 1, policyNumber, policyTypeTitle)
    const tcPass1Path = path.join(outputDir, `${filePrefix}_tc_pass1.docx`)
    fs.writeFileSync(tcPass1Path, tcPass1Buffer)
    tempFiles.push(tcPass1Path)

    const tcPass1PdfPath = await convertDocxToPdf(tcPass1Path)
    tempFiles.push(tcPass1PdfPath)

    const tcPageCount = await countPdfPages(tcPass1PdfPath)
    const totalPages = policyPageCount + tcPageCount

    // 5. Second pass T&C: inject hardcoded combined total
    const tcFinalBuffer = await setDocxPageStart(tcDocxBuffer, policyPageCount + 1, policyNumber, policyTypeTitle, totalPages)
    const tcDocxPath = path.join(outputDir, `${filePrefix}_tc.docx`)
    fs.writeFileSync(tcDocxPath, tcFinalBuffer)
    tempFiles.push(tcDocxPath)

    const tcPdfPath = await convertDocxToPdf(tcDocxPath)
    tempFiles.push(tcPdfPath)

    // 6. Merge both PDFs
    const mergedPdfPath = path.join(outputDir, `${filePrefix}.pdf`)
    await mergePdfs([policyPdfPath, tcPdfPath], mergedPdfPath)
    tempFiles.push(mergedPdfPath)

    return { pdfPath: mergedPdfPath, tempFiles, totalPages }
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
