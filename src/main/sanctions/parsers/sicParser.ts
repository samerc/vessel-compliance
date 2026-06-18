import XLSX from 'xlsx-js-style'
import { normalizeText } from '../normalize'
import { SanctionsEntity } from '../SanctionsDatabase'

export function parseSicExcel(buffer: Buffer): { entities: SanctionsEntity[]; releaseDate: string | null } {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const entries: SanctionsEntity[] = []

  // Sheet 1: "Regist. of risks under cover"
  // Cols: Last Name, First Name, Father's Name, Mother's Name, Nationality, DOB, (optional record ref)
  if (wb.SheetNames.length > 0) {
    const ws = wb.Sheets[wb.SheetNames[0]]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || (!row[0] && !row[1])) continue
      const lastName = cleanText(row[0])
      const firstName = cleanText(row[1])
      if (!lastName && !firstName) continue
      const name = [firstName, lastName].filter(Boolean).join(' ')
      const fatherName = cleanText(row[2]) || null
      const motherName = cleanText(row[3]) || null
      const nationality = cleanText(row[4]) || null
      const dob = parseDob(row[5])
      const recordRef = cleanText(row[6]) || null

      entries.push({
        source: 'SIC',
        source_id: null,
        entity_type: 'individual',
        name,
        name_normalized: normalizeText(name),
        aliases: [],
        date_of_birth: dob,
        nationality,
        addresses: [],
        identifications: [],
        programs: [],
        vessel_imo: null,
        remarks: recordRef,
        listed_date: null,
        mother_name: motherName,
        father_name: fatherName
      })
    }
  }

  // Sheet 2: yearly entries (e.g. "2026")
  // Cols: Date, Full name, Mother's Name, Nationality, DOB, Subject
  if (wb.SheetNames.length > 1) {
    const ws = wb.Sheets[wb.SheetNames[1]]
    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
    let lastDate: string | null = null
    let lastSubject: string | null = null

    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      if (!row || !row[1]) continue

      const rawDate = row[0]
      if (rawDate != null) {
        lastDate = typeof rawDate === 'number' ? excelDateToString(rawDate) : cleanText(rawDate) || null
        lastSubject = cleanText(row[5]) || null
      }
      const subject = cleanText(row[5]) || lastSubject

      const fullName = cleanText(row[1])
      if (!fullName) continue

      const { primary, aliases } = extractAliases(fullName)
      const motherName = cleanText(row[2]) || null
      const nationality = cleanText(row[3]) || null
      const dob = parseDob(row[4])

      let sicRef: string | null = null
      if (subject) {
        const refMatch = subject.match(/SIC\s+Ref\s+([\d/()A-Za-z.\s]+)/i)
        if (refMatch) sicRef = refMatch[1].trim()
      }

      entries.push({
        source: 'SIC',
        source_id: sicRef,
        entity_type: 'individual',
        name: primary,
        name_normalized: normalizeText(primary),
        aliases,
        date_of_birth: dob,
        nationality,
        addresses: [],
        identifications: [],
        programs: [],
        vessel_imo: null,
        remarks: subject,
        listed_date: lastDate,
        mother_name: motherName,
        father_name: null
      })
    }
  }

  return { entities: entries, releaseDate: null }
}

function extractAliases(fullName: string): { primary: string; aliases: string[] } {
  if (!fullName.toLowerCase().includes(' or ')) return { primary: fullName, aliases: [] }
  const parts = fullName.split(/\s+or\s+/i).map(p => p.trim()).filter(Boolean)
  if (parts.length <= 1) return { primary: fullName, aliases: [] }
  // First part is primary, but it may be "First Last1" and rest are just last name variants
  const primary = parts[0]
  const firstParts = primary.split(/\s+/)
  const firstName = firstParts.length > 1 ? firstParts.slice(0, -1).join(' ') : ''
  const aliases = parts.slice(1).map(p => {
    if (p.includes(' ')) return p
    return firstName ? `${firstName} ${p}` : p
  })
  return { primary, aliases }
}

function parseDob(val: any): string | null {
  if (val == null) return null
  if (typeof val === 'number') {
    if (val > 10000) return excelDateToString(val)
    return String(val)
  }
  const s = cleanText(val)
  return s || null
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
