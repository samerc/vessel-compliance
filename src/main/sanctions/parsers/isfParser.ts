import XLSX from 'xlsx-js-style'
import { normalizeText } from '../normalize'
import { SanctionsEntity } from '../SanctionsDatabase'

export function parseIsfSanctions(buffer: Buffer): { entities: SanctionsEntity[]; releaseDate: string | null } {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]

  const entries: SanctionsEntity[] = []
  if (data.length < 3) return { entities: entries, releaseDate: null }

  // Row 0 = title, Row 1 = header, data starts at Row 2
  for (let i = 2; i < data.length; i++) {
    const row = data[i]
    if (!row || !row[1]) continue
    try {
      const entity = parseIsfRow(row)
      if (entity) entries.push(entity)
    } catch { /* skip */ }
  }

  return { entities: entries, releaseDate: null }
}

function parseIsfRow(row: any[]): SanctionsEntity | null {
  const name = cleanText(row[1])
  if (!name) return null

  const groupType = cleanText(row[13]) || ''
  const entityType = groupType.toLowerCase().includes('entity') ? 'entity' : 'individual'

  const aliasStr = cleanText(row[14]) || ''
  const aliases = aliasStr
    ? aliasStr.split(/ - /).map(a => a.trim().replace(/^-\s*/, '').replace(/\s*-$/, '')).filter(a => a && a.length > 1)
    : []

  let dob: string | null = null
  if (row[5] != null) {
    if (typeof row[5] === 'number') {
      dob = row[5] > 10000 ? excelDateToString(row[5]) : String(row[5])
    } else {
      dob = cleanText(row[5]) || null
    }
  }

  const nationality = cleanText(row[7]) || null

  const addresses: string[] = []
  const birthPlace = cleanText(row[6])
  const residence = cleanText(row[11])
  if (birthPlace) addresses.push('Birth: ' + birthPlace)
  if (residence) addresses.push('Residence: ' + residence)

  const identifications: { type: string; number: string; country: string }[] = []
  const passport = cleanText(row[8])
  const idCard = cleanText(row[9])
  if (passport) identifications.push({ type: 'Passport', number: passport, country: '' })
  if (idCard) identifications.push({ type: 'ID Card', number: idCard, country: '' })

  const programs: string[] = []
  const regime = cleanText(row[15])
  const resolution = cleanText(row[18])
  if (regime) programs.push(regime)
  if (resolution) programs.push(resolution)

  let listedDate: string | null = null
  if (row[16] != null) {
    listedDate = typeof row[16] === 'number' ? excelDateToString(row[16]) : cleanText(row[16]) || null
  }

  const remarkParts: string[] = []
  const title = cleanText(row[2])
  const position = cleanText(row[10])
  const otherInfo = cleanText(row[12])
  const remarks = cleanText(row[19])
  if (title) remarkParts.push('Title: ' + title)
  if (position) remarkParts.push('Position: ' + position)
  if (otherInfo) remarkParts.push(otherInfo)
  if (remarks) remarkParts.push(remarks)

  return {
    source: 'ISF',
    source_id: row[0] != null ? String(row[0]) : null,
    entity_type: entityType,
    name,
    name_normalized: normalizeText(name),
    aliases,
    date_of_birth: dob,
    nationality,
    addresses,
    identifications,
    programs,
    remarks: remarkParts.join('; ') || null,
    vessel_imo: null,
    listed_date: listedDate
  }
}

function excelDateToString(serial: number): string {
  const utcDays = Math.floor(serial - 25569)
  const d = new Date(utcDays * 86400 * 1000)
  const year = d.getUTCFullYear()
  const month = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function cleanText(val: any): string {
  if (val == null) return ''
  if (typeof val === 'number') return String(val)
  return String(val).trim().replace(/\s+/g, ' ')
}
