import { jsPDF } from 'jspdf'

interface PdfTextSegment {
  text: string
  bold?: boolean
  italic?: boolean
}

/**
 * Render HTML content to a jsPDF document at the given position.
 * Handles <strong>/<b>, <em>/<i>, <p>, <br>, <ul>/<li>, plain text.
 * Returns the final Y position after rendering.
 */
export function renderHtmlToPdf(
  doc: jsPDF,
  html: string,
  x: number,
  y: number,
  maxWidth: number,
  opts?: { fontSize?: number; lineHeight?: number; pageBreakY?: number }
): number {
  const fontSize = opts?.fontSize ?? 11
  const lineHeight = opts?.lineHeight ?? 5.5
  const pageBreakY = opts?.pageBreakY ?? 280

  if (!html || html.trim() === '') return y

  // If no HTML tags, render as plain text
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return renderPlainText(doc, html, x, y, maxWidth, fontSize, lineHeight, pageBreakY)
  }

  const parser = new DOMParser()
  const parsed = parser.parseFromString(html, 'text/html')

  function checkPageBreak() {
    if (y + lineHeight > pageBreakY) {
      doc.addPage()
      y = 20
    }
  }

  function extractSegments(node: Node, inherited: { bold?: boolean; italic?: boolean } = {}): PdfTextSegment[] {
    const segments: PdfTextSegment[] = []
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || ''
        if (text) segments.push({ text, ...inherited })
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName.toLowerCase()
        const style = { ...inherited }
        if (tag === 'strong' || tag === 'b') style.bold = true
        if (tag === 'em' || tag === 'i') style.italic = true
        if (tag === 'br') {
          segments.push({ text: '\n', ...inherited })
        } else {
          segments.push(...extractSegments(el, style))
        }
      }
    }
    return segments
  }

  function renderSegments(segments: PdfTextSegment[], indent = 0) {
    // Flatten segments into lines, then render each line with mixed formatting
    // For simplicity, render segment by segment tracking X position
    let currentX = x + indent

    for (const seg of segments) {
      if (seg.text === '\n') {
        y += lineHeight
        currentX = x + indent
        checkPageBreak()
        continue
      }

      const fontStyle = seg.bold && seg.italic ? 'bolditalic' : seg.bold ? 'bold' : seg.italic ? 'italic' : 'normal'
      doc.setFont('helvetica', fontStyle)
      doc.setFontSize(fontSize)
      doc.setTextColor(0, 0, 0)

      // Word-wrap the text within remaining line width
      const words = seg.text.split(/(\s+)/)
      for (const word of words) {
        if (!word) continue
        const wordWidth = doc.getTextWidth(word)

        if (currentX + wordWidth > x + maxWidth && currentX > x + indent) {
          // Wrap to next line
          y += lineHeight
          currentX = x + indent
          checkPageBreak()
        }

        doc.text(word, currentX, y)
        currentX += wordWidth
      }
    }

    y += lineHeight
    checkPageBreak()
  }

  function processNode(node: Node) {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').trim()
        if (text) {
          renderSegments([{ text }])
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName.toLowerCase()

        if (tag === 'p') {
          const segments = extractSegments(el)
          if (segments.length > 0 && segments.some(s => s.text.trim())) {
            renderSegments(segments)
          } else {
            y += lineHeight * 0.5
          }
        } else if (tag === 'ul' || tag === 'ol') {
          let idx = 0
          for (const li of Array.from(el.children)) {
            if (li.tagName.toLowerCase() === 'li') {
              idx++
              const bullet = tag === 'ul' ? '\u2022 ' : `${idx}. `
              const segments = extractSegments(li)
              renderSegments([{ text: bullet }, ...segments], 8)
            }
          }
        } else if (tag === 'br') {
          y += lineHeight * 0.5
        } else {
          processNode(el)
        }
      }
    }
  }

  processNode(parsed.body)
  return y
}

function renderPlainText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  pageBreakY: number
): number {
  doc.setFontSize(fontSize)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(0, 0, 0)
  const lines = doc.splitTextToSize(text, maxWidth)
  for (const line of lines) {
    if (y + lineHeight > pageBreakY) {
      doc.addPage()
      y = 20
    }
    doc.text(line, x, y)
    y += lineHeight
  }
  return y
}

/**
 * Strip HTML tags and return plain text.
 */
export function stripHtml(html: string): string {
  if (!html) return ''
  if (!/<[a-z][\s\S]*>/i.test(html)) return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}
