import { normalizeText } from '../normalize'
import { SanctionsEntity } from '../SanctionsDatabase'

export function parseEuSanctions(csvData: string): { entities: SanctionsEntity[]; releaseDate: string | null } {
  const entries: SanctionsEntity[] = []
  const lines = csvData.split('\n')
  if (lines.length < 2) return { entities: entries, releaseDate: null }

  const header = parseCSVLine(lines[0])
  const colIndex: Record<string, number> = {}
  header.forEach((col, idx) => { colIndex[col] = idx })

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const row = parseCSVLine(line)
      const entity = parseEuRow(row, colIndex)
      if (entity) entries.push(entity)
    } catch { /* skip malformed */ }
  }

  return { entities: entries, releaseDate: null }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parseEuRow(row: string[], colIndex: Record<string, number>): SanctionsEntity | null {
  const getValue = (col: string) => {
    const idx = colIndex[col]
    return idx !== undefined ? row[idx] || '' : ''
  }

  const name = getValue('caption') || getValue('name')
  if (!name) return null

  const schema = getValue('schema').toLowerCase()
  let entityType = 'unknown'
  if (schema.includes('person')) entityType = 'individual'
  else if (schema.includes('vessel')) entityType = 'vessel'
  else if (schema.includes('airplane') || schema.includes('aircraft')) entityType = 'aircraft'
  else if (schema.includes('organization') || schema.includes('company') || schema.includes('legalentity')) entityType = 'entity'

  const aliasStr = getValue('aliases')
  const aliases = aliasStr ? aliasStr.split(';').map(a => a.trim()).filter(Boolean) : []

  const addressStr = getValue('addresses')
  const addresses = addressStr ? addressStr.split(';').map(a => a.trim()).filter(Boolean) : []

  const identifications: { type: string; number: string; country: string }[] = []
  const idStr = getValue('identifiers')
  if (idStr) {
    idStr.split(';').forEach(id => {
      const trimmed = id.trim()
      if (trimmed) identifications.push({ type: 'ID', number: trimmed, country: '' })
    })
  }

  const countries = getValue('countries')
  const nationality = countries ? countries.split(';')[0].trim() : null

  const datasets = getValue('datasets') || 'EU'
  const programs = datasets.split(';').map(d => d.trim()).filter(Boolean)

  return {
    source: 'EU',
    source_id: getValue('id') || getValue('entity_id'),
    entity_type: entityType,
    name,
    name_normalized: normalizeText(name),
    aliases,
    date_of_birth: getValue('birth_date') || null,
    nationality,
    addresses,
    identifications,
    programs: programs.length > 0 ? programs : ['EU FSF'],
    remarks: getValue('notes') || null,
    vessel_imo: entityType === 'vessel' ? (identifications.find(id => id.number.match(/^\d{7}$/))?.number || null) : null,
    listed_date: getValue('first_seen') || getValue('created_at') || null,
    mother_name: null,
    father_name: null
  }
}
