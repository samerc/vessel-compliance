import { Paragraph, TextRun, AlignmentType } from 'docx'

interface TextSegment {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSize?: number  // in half-points (docx twips)
  fontFamily?: string
}

/** Convert CSS pt/px to docx half-points (twips). Default fallback = opts.size */
function parseFontSize(css: string | null | undefined, fallback: number): number {
  if (!css) return fallback
  const val = parseFloat(css)
  if (isNaN(val)) return fallback
  if (css.endsWith('pt')) return Math.round(val * 2)       // 1pt = 2 half-points
  if (css.endsWith('px')) return Math.round(val * 1.5)     // approximate px → half-points
  if (css.endsWith('rem')) return Math.round(val * 24)     // 1rem ≈ 12pt = 24 half-points
  return Math.round(val * 2)                               // assume pt if no unit
}

/** Map CSS text-align to docx AlignmentType */
function parseAlignment(css: string | null | undefined): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
  if (!css) return undefined
  switch (css.trim()) {
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    case 'left': return AlignmentType.LEFT
    default: return undefined
  }
}

/**
 * Parse HTML string into docx Paragraphs.
 * Supports: <strong>/<b>, <em>/<i>, <u>, <p>, <br>, <ul>/<ol>/<li>, plain text,
 * inline font-size via style attribute, paragraph text-align, and Arabic/RTL text.
 */
/** Convert CSS line-height value to DOCX line spacing in twips. 240 = single spacing. */
function parseLineHeight(css: string | null | undefined, fallbackMultiplier?: number): number | undefined {
  const multiplier = css ? parseFloat(css) : (fallbackMultiplier || 0)
  if (!multiplier || isNaN(multiplier) || multiplier <= 0) return undefined
  return Math.round(240 * multiplier)
}

export function parseHtmlToParagraphs(
  html: string,
  opts?: { size?: number; font?: string; color?: string; alignment?: typeof AlignmentType[keyof typeof AlignmentType]; lineSpacing?: number; spacingAfter?: number }
): Paragraph[] {
  if (!html || html.trim() === '') return []

  const size = opts?.size ?? 22
  const font = opts?.font ?? 'Arial'
  const color = opts?.color ?? '000000'
  const spacingAfter = opts?.spacingAfter ?? 80
  const defaultLineSpacing = parseLineHeight(null, opts?.lineSpacing)

  // If no HTML tags, treat as plain text with line breaks
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.split('\n').map(line =>
      line.trim()
        ? new Paragraph({
            spacing: { after: spacingAfter, ...(defaultLineSpacing ? { line: defaultLineSpacing, lineRule: 'auto' as any } : {}) },
            alignment: opts?.alignment,
            children: [new TextRun({ text: line, size, font, color })]
          })
        : new Paragraph({ spacing: { after: 40 }, children: [] })
    )
  }

  const paragraphs: Paragraph[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  function extractSegments(node: Node, inherited: { bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number; fontFamily?: string } = {}): TextSegment[] {
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

        // Parse inline font-size from style attribute
        const elFontSize = el.style?.fontSize
        if (elFontSize) {
          style.fontSize = parseFontSize(elFontSize, inherited.fontSize || size)
        }
        // Parse inline font-family from style attribute
        const elFontFamily = el.style?.fontFamily
        if (elFontFamily) {
          style.fontFamily = elFontFamily.replace(/['"]/g, '').split(',')[0].trim()
        }

        segments.push(...extractSegments(el, style))

        if (tag === 'br') segments.push({ text: '\n', ...inherited })
      }
    }

    return segments
  }

  function makeParagraphFromSegments(
    segments: TextSegment[],
    listPrefix?: string,
    alignment?: typeof AlignmentType[keyof typeof AlignmentType],
    bidirectional?: boolean,
    lineSpacingTwips?: number
  ): Paragraph {
    const children: TextRun[] = []
    if (listPrefix) {
      children.push(new TextRun({ text: listPrefix, size, font, color }))
    }
    children.push(...segments.map(seg => new TextRun({
      text: seg.text,
      size: seg.fontSize || size,
      font: seg.fontFamily || font,
      color,
      bold: seg.bold,
      italics: seg.italic,
      underline: seg.underline ? {} : undefined,
      rightToLeft: bidirectional || undefined
    } as any)))

    const effectiveLineSpacing = lineSpacingTwips || defaultLineSpacing
    return new Paragraph({
      spacing: { after: spacingAfter, ...(effectiveLineSpacing ? { line: effectiveLineSpacing, lineRule: 'auto' as any } : {}) },
      alignment: alignment || opts?.alignment,
      bidirectional: bidirectional || undefined,
      ...(listPrefix ? { indent: { left: 140, hanging: 140 } } : {}),
      children
    } as any)
  }

  /** Detect if text contains RTL characters (Arabic, Hebrew) */
  function hasRtl(text: string): boolean {
    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/.test(text)
  }

  function processNode(node: Node): void {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = (child.textContent || '').trim()
        if (text) {
          const rtl = hasRtl(text)
          const effectiveLs = defaultLineSpacing
          paragraphs.push(new Paragraph({
            spacing: { after: spacingAfter, ...(effectiveLs ? { line: effectiveLs, lineRule: 'auto' as any } : {}) },
            alignment: rtl ? AlignmentType.RIGHT : opts?.alignment,
            bidirectional: rtl || undefined,
            children: [new TextRun({ text, size, font, color, rightToLeft: rtl || undefined } as any)]
          } as any))
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement
        const tag = el.tagName.toLowerCase()

        if (tag === 'p') {
          const segments = extractSegments(el)
          if (segments.length === 0 || segments.every(s => !s.text.trim())) {
            paragraphs.push(new Paragraph({ spacing: { after: 40 }, children: [] }))
          } else {
            // Parse text-align and line-height from style
            const align = parseAlignment(el.style?.textAlign)
            const pLineSpacing = parseLineHeight(el.style?.lineHeight)
            const fullText = segments.map(s => s.text).join('')
            const rtl = hasRtl(fullText)
            paragraphs.push(makeParagraphFromSegments(segments, undefined, align || (rtl ? AlignmentType.RIGHT : undefined), rtl, pLineSpacing))
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
