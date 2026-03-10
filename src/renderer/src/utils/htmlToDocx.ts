import { Paragraph, TextRun, AlignmentType } from 'docx'

interface TextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

/**
 * Parse HTML string into docx Paragraphs.
 * Supports: <strong>/<b>, <em>/<i>, <u>, <p>, <br>, <ul>/<ol>/<li>, plain text
 */
export function parseHtmlToParagraphs(
  html: string,
  opts?: { size?: number; font?: string; color?: string; alignment?: typeof AlignmentType[keyof typeof AlignmentType] }
): Paragraph[] {
  if (!html || html.trim() === '') return []

  const size = opts?.size ?? 22
  const font = opts?.font ?? 'Arial'
  const color = opts?.color ?? '000000'

  // If no HTML tags, treat as plain text with line breaks
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.split('\n').map(line =>
      line.trim()
        ? new Paragraph({
            spacing: { after: 80 },
            alignment: opts?.alignment,
            children: [new TextRun({ text: line, size, font, color })]
          })
        : new Paragraph({ spacing: { after: 40 }, children: [] })
    )
  }

  const paragraphs: Paragraph[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function extractSegments(node: Node, inherited: { bold?: boolean; italic?: boolean; underline?: boolean } = {}): TextSegment[] {
    const segments: TextSegment[] = []

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
        if (tag === 'u') style.underline = true

        segments.push(...extractSegments(el, style))

        if (tag === 'br') segments.push({ text: '\n', ...inherited })
      }
    }

    return segments
  }

  function makeParagraphFromSegments(segments: TextSegment[], listPrefix?: string): Paragraph {
    const children: TextRun[] = []
    if (listPrefix) {
      children.push(new TextRun({ text: listPrefix, size, font, color }))
    }
    children.push(...segments.map(seg => new TextRun({
      text: seg.text,
      size,
      font,
      color,
      bold: seg.bold,
      italics: seg.italic,
      underline: seg.underline ? {} : undefined
    })))

    return new Paragraph({
      spacing: { after: 80 },
      alignment: opts?.alignment,
      ...(listPrefix ? { indent: { left: 140, hanging: 140 } } : {}),
      children
    })
  }

  function processNode(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').trim()
        if (text) {
          paragraphs.push(new Paragraph({
            spacing: { after: 80 },
            alignment: opts?.alignment,
            children: [new TextRun({ text, size, font, color })]
          }))
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName.toLowerCase()

        if (tag === 'p') {
          const segments = extractSegments(el)
          if (segments.length === 0 || segments.every(s => !s.text.trim())) {
            paragraphs.push(new Paragraph({ spacing: { after: 40 }, children: [] }))
          } else {
            paragraphs.push(makeParagraphFromSegments(segments))
          }
        } else if (tag === 'ul' || tag === 'ol') {
          let idx = 0
          for (const li of Array.from(el.children)) {
            if (li.tagName.toLowerCase() === 'li') {
              idx++
              const prefix = tag === 'ol' ? `${idx}. ` : '- '
              const segments = extractSegments(li)
              paragraphs.push(makeParagraphFromSegments(segments, prefix))
            }
          }
        } else if (tag === 'br') {
          paragraphs.push(new Paragraph({ spacing: { after: 40 }, children: [] }))
        } else {
          // Recurse for other wrapper elements
          processNode(el)
        }
      }
    }
  }

  processNode(doc.body)
  return paragraphs.length > 0 ? paragraphs : [new Paragraph({ spacing: { after: 40 }, children: [] })]
}

/**
 * Convert HTML to plain text (strip all tags).
 */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  if (!/<[a-z][\s\S]*>/i.test(html)) return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  return doc.body.textContent || ''
}
