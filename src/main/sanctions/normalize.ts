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

export function extractText(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(v => extractText(v)).filter(Boolean).join(' ')
  }
  if (typeof value === 'object') {
    if (value._) return value._
    if (value['$']) return ''
    const values = Object.values(value)
    for (const v of values) {
      const text = extractText(v)
      if (text) return text
    }
  }
  return String(value)
}

export function parseDate(dateStr: any): string | null {
  if (!dateStr) return null
  const str = extractText(dateStr).trim()
  if (!str) return null
  return str
}

export function normalizeAliases(aliases: any): string[] {
  if (!aliases) return []
  if (!Array.isArray(aliases)) aliases = [aliases]
  return aliases
    .map((a: any) => extractText(a))
    .filter((a: string) => a && a.trim())
    .map((a: string) => a.trim())
}

export function normalizeEntityType(type: any): string {
  if (!type) return 'unknown'
  const typeStr = extractText(type).toLowerCase()
  if (typeStr.includes('individual') || typeStr.includes('person')) return 'individual'
  if (typeStr.includes('vessel') || typeStr.includes('ship')) return 'vessel'
  if (typeStr.includes('aircraft')) return 'aircraft'
  if (typeStr.includes('entity') || typeStr.includes('organization') || typeStr.includes('company')) return 'entity'
  return 'unknown'
}
