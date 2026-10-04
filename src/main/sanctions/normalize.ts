export function normalizeText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return ''
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim()
}

/**
 * A node of an xml2js document parsed with `explicitArray: false, mergeAttrs: true`. Deliberately
 * loose: a child may really be a string or an array of nodes, so values are always read through
 * `extractText` / `asList`, which handle every shape.
 */
export interface XmlNode {
  [key: string]: XmlNode
}

/** xml2js gives a single child as the node itself and repeated children as an array. */
export function asList(value: XmlNode | XmlNode[]): XmlNode[] {
  return Array.isArray(value) ? value : [value]
}

/** Text of a parsed XML/CSV value (xml2js nodes keep their text in `_`, attributes in `$`). */
export function extractText(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map((v) => extractText(v))
      .filter(Boolean)
      .join(' ')
  }
  if (typeof value === 'object') {
    const node = value as Record<string, unknown>
    if (node._) return node._ as string
    if (node['$']) return ''
    const values = Object.values(node)
    for (const v of values) {
      const text = extractText(v)
      if (text) return text
    }
  }
  return String(value)
}

export function parseDate(dateStr: unknown): string | null {
  if (!dateStr) return null
  const str = extractText(dateStr).trim()
  if (!str) return null
  return str
}

export function normalizeAliases(aliases: unknown): string[] {
  if (!aliases) return []
  const list: unknown[] = Array.isArray(aliases) ? aliases : [aliases]
  return list
    .map((a) => extractText(a))
    .filter((a: string) => a && a.trim())
    .map((a: string) => a.trim())
}

export function normalizeEntityType(type: unknown): string {
  if (!type) return 'unknown'
  const typeStr = extractText(type).toLowerCase()
  if (typeStr.includes('individual') || typeStr.includes('person')) return 'individual'
  if (typeStr.includes('vessel') || typeStr.includes('ship')) return 'vessel'
  if (typeStr.includes('aircraft')) return 'aircraft'
  if (typeStr.includes('entity') || typeStr.includes('organization') || typeStr.includes('company'))
    return 'entity'
  return 'unknown'
}

/**
 * Arabic spelling variants folded for matching: hamza forms of alef, alef maqsura, ta marbuta,
 * short vowels and tatweel ("أحمد" and "احمد" are the same name). Latin text is unchanged.
 */
export function foldArabic(text: string): string {
  return text
    .replace(/ـ|[ً-ٟ]|ٰ/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
}
