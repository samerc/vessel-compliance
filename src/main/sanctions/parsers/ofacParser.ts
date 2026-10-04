import xml2js from 'xml2js'
import {
  normalizeText,
  extractText,
  parseDate,
  normalizeEntityType,
  asList,
  type XmlNode
} from '../normalize'
import { SanctionsEntity } from '../SanctionsDatabase'

export async function parseOfacSdn(
  xmlData: string
): Promise<{ entities: SanctionsEntity[]; releaseDate: string | null }> {
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true })
  const result = await parser.parseStringPromise(xmlData)

  const entries: SanctionsEntity[] = []
  const sdnList = result.sdnList || result.SdnList
  let releaseDate: string | null = null

  if (sdnList?.publshInformation) {
    releaseDate = extractText(sdnList.publshInformation.Publish_Date)
  }

  if (!sdnList?.sdnEntry) return { entities: entries, releaseDate }

  let sdnEntries = sdnList.sdnEntry
  if (!Array.isArray(sdnEntries)) sdnEntries = [sdnEntries]

  for (const entry of sdnEntries) {
    try {
      const entity = parseSDNEntry(entry)
      if (entity) entries.push(entity)
    } catch {
      /* skip malformed */
    }
  }

  return { entities: entries, releaseDate }
}

function parseSDNEntry(entry: XmlNode): SanctionsEntity | null {
  const sdnType = extractText(entry.sdnType || entry.SdnType || entry.type)
  const entityType = normalizeEntityType(sdnType)

  let name: string
  if (entry.firstName || entry.lastName) {
    const firstName = extractText(entry.firstName || '')
    const lastName = extractText(entry.lastName || '')
    name = [firstName, lastName].filter(Boolean).join(' ')
  } else {
    name = extractText(entry.lastName || entry.name || entry.Name || '')
  }
  if (!name) return null

  const aliases: string[] = []
  if (entry.akaList) {
    const akaEntries = asList(entry.akaList.aka)
    for (const aka of akaEntries) {
      if (!aka) continue
      const akaName = getAkaName(aka)
      if (akaName && akaName !== name) aliases.push(akaName)
    }
  }

  const addresses: string[] = []
  if (entry.addressList) {
    const addrEntries = asList(entry.addressList.address)
    for (const addr of addrEntries) {
      if (!addr) continue
      const address = parseAddress(addr)
      if (address) addresses.push(address)
    }
  }

  const programs: string[] = []
  if (entry.programList) {
    const progEntries = asList(entry.programList.program)
    programs.push(...progEntries.map((p) => extractText(p)).filter(Boolean))
  }

  const identifications: { type: string; number: string; country: string }[] = []
  if (entry.idList) {
    const idEntries = asList(entry.idList.id)
    for (const id of idEntries) {
      if (!id) continue
      identifications.push({
        type: extractText(id.idType),
        number: extractText(id.idNumber),
        country: extractText(id.idCountry)
      })
    }
  }

  let dateOfBirth: string | null = null
  if (entry.dateOfBirthList) {
    const dobEntries = asList(entry.dateOfBirthList.dateOfBirthItem)
    if (dobEntries[0]) dateOfBirth = parseDate(dobEntries[0].dateOfBirth)
  }

  let nationality: string | null = null
  if (entry.nationalityList) {
    const natEntries = asList(entry.nationalityList.nationality)
    if (natEntries[0]) nationality = extractText(natEntries[0].country || natEntries[0])
  }

  let vesselImo: string | null = null
  if (entityType === 'vessel') {
    const imoId = identifications.find(
      (id) =>
        id.type &&
        (id.type.toLowerCase().includes('imo') ||
          id.type.toLowerCase().includes('vessel registration'))
    )
    if (imoId) {
      const match = imoId.number.match(/\d{7}/)
      vesselImo = match ? match[0] : imoId.number
    }
  }

  return {
    source: 'OFAC',
    source_id: extractText(entry.uid || entry.Uid),
    entity_type: entityType,
    name,
    name_normalized: normalizeText(name),
    aliases,
    date_of_birth: dateOfBirth,
    nationality,
    addresses,
    identifications,
    programs,
    remarks: extractText(entry.remarks || entry.Remarks) || null,
    vessel_imo: vesselImo,
    listed_date: null,
    mother_name: null,
    father_name: null
  }
}

function getAkaName(aka: XmlNode): string {
  if (!aka) return ''
  if (aka.firstName || aka.lastName) {
    const firstName = extractText(aka.firstName || '')
    const lastName = extractText(aka.lastName || '')
    return [firstName, lastName].filter(Boolean).join(' ')
  }
  return extractText(aka.lastName || aka.name || aka)
}

function parseAddress(addr: XmlNode): string | null {
  if (!addr) return null
  const parts = [
    extractText(addr.address1),
    extractText(addr.address2),
    extractText(addr.address3),
    extractText(addr.city),
    extractText(addr.stateOrProvince),
    extractText(addr.postalCode),
    extractText(addr.country)
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}
