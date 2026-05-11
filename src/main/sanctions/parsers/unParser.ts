import xml2js from 'xml2js'
import { normalizeText, extractText, parseDate } from '../normalize'
import { SanctionsEntity } from '../SanctionsDatabase'

export async function parseUnSanctions(xmlData: string): Promise<{ entities: SanctionsEntity[]; releaseDate: string | null }> {
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true })
  const result = await parser.parseStringPromise(xmlData)

  const entries: SanctionsEntity[] = []
  const consolidated = result.CONSOLIDATED_LIST || result.consolidated_list || result
  const releaseDate = consolidated.dateGenerated || consolidated.DATE_GENERATED || null

  if (consolidated.INDIVIDUALS) {
    let individuals = consolidated.INDIVIDUALS.INDIVIDUAL
    if (individuals) {
      if (!Array.isArray(individuals)) individuals = [individuals]
      for (const ind of individuals) {
        try {
          const entity = parseUnIndividual(ind)
          if (entity) entries.push(entity)
        } catch { /* skip */ }
      }
    }
  }

  if (consolidated.ENTITIES) {
    let entities2 = consolidated.ENTITIES.ENTITY
    if (entities2) {
      if (!Array.isArray(entities2)) entities2 = [entities2]
      for (const ent of entities2) {
        try {
          const entity = parseUnEntity(ent)
          if (entity) entries.push(entity)
        } catch { /* skip */ }
      }
    }
  }

  return { entities: entries, releaseDate }
}

function parseUnIndividual(ind: any): SanctionsEntity | null {
  const nameParts = [
    extractText(ind.FIRST_NAME), extractText(ind.SECOND_NAME),
    extractText(ind.THIRD_NAME), extractText(ind.FOURTH_NAME)
  ].filter(Boolean)
  const primaryName = nameParts.join(' ')
  if (!primaryName) return null

  const aliases: string[] = []
  if (ind.INDIVIDUAL_ALIAS) {
    let aliasList = Array.isArray(ind.INDIVIDUAL_ALIAS) ? ind.INDIVIDUAL_ALIAS : [ind.INDIVIDUAL_ALIAS]
    for (const alias of aliasList) {
      const aliasName = extractText(alias.ALIAS_NAME || alias)
      if (aliasName && aliasName !== primaryName && !aliases.includes(aliasName)) aliases.push(aliasName)
    }
  }

  let dateOfBirth: string | null = null
  if (ind.INDIVIDUAL_DATE_OF_BIRTH) {
    let dobList = Array.isArray(ind.INDIVIDUAL_DATE_OF_BIRTH) ? ind.INDIVIDUAL_DATE_OF_BIRTH : [ind.INDIVIDUAL_DATE_OF_BIRTH]
    if (dobList[0]) dateOfBirth = parseDate(dobList[0].DATE || dobList[0].YEAR || dobList[0])
  }

  let nationality: string | null = null
  if (ind.NATIONALITY) {
    let natList = Array.isArray(ind.NATIONALITY) ? ind.NATIONALITY : [ind.NATIONALITY]
    if (natList[0]) nationality = extractText(natList[0].VALUE || natList[0])
  }

  const addresses: string[] = []
  if (ind.INDIVIDUAL_ADDRESS) {
    let addrList = Array.isArray(ind.INDIVIDUAL_ADDRESS) ? ind.INDIVIDUAL_ADDRESS : [ind.INDIVIDUAL_ADDRESS]
    for (const addr of addrList) {
      const address = parseUnAddress(addr)
      if (address) addresses.push(address)
    }
  }

  const identifications: { type: string; number: string; country: string }[] = []
  if (ind.INDIVIDUAL_DOCUMENT) {
    let docList = Array.isArray(ind.INDIVIDUAL_DOCUMENT) ? ind.INDIVIDUAL_DOCUMENT : [ind.INDIVIDUAL_DOCUMENT]
    for (const doc of docList) {
      identifications.push({
        type: extractText(doc.TYPE_OF_DOCUMENT || doc.TYPE_OF_DOCUMENT2),
        number: extractText(doc.NUMBER || doc.DOCUMENT_NUMBER),
        country: extractText(doc.ISSUING_COUNTRY || doc.COUNTRY_OF_ISSUE)
      })
    }
  }

  const programs: string[] = []
  if (ind.UN_LIST_TYPE) programs.push(extractText(ind.UN_LIST_TYPE))
  if (ind.REFERENCE_NUMBER) programs.push('Ref: ' + extractText(ind.REFERENCE_NUMBER))

  return {
    source: 'UN',
    source_id: extractText(ind.DATAID || ind.REFERENCE_NUMBER),
    entity_type: 'individual',
    name: primaryName,
    name_normalized: normalizeText(primaryName),
    aliases,
    date_of_birth: dateOfBirth,
    nationality,
    addresses,
    identifications,
    programs,
    remarks: extractText(ind.COMMENTS1 || ind.COMMENTS) || null,
    vessel_imo: null,
    listed_date: parseDate(ind.LISTED_ON)
  }
}

function parseUnEntity(ent: any): SanctionsEntity | null {
  const primaryName = extractText(ent.FIRST_NAME || ent.NAME)
  if (!primaryName) return null

  const aliases: string[] = []
  if (ent.ENTITY_ALIAS) {
    let aliasList = Array.isArray(ent.ENTITY_ALIAS) ? ent.ENTITY_ALIAS : [ent.ENTITY_ALIAS]
    for (const alias of aliasList) {
      const aliasName = extractText(alias.ALIAS_NAME || alias)
      if (aliasName && aliasName !== primaryName && !aliases.includes(aliasName)) aliases.push(aliasName)
    }
  }

  const addresses: string[] = []
  if (ent.ENTITY_ADDRESS) {
    let addrList = Array.isArray(ent.ENTITY_ADDRESS) ? ent.ENTITY_ADDRESS : [ent.ENTITY_ADDRESS]
    for (const addr of addrList) {
      const address = parseUnAddress(addr)
      if (address) addresses.push(address)
    }
  }

  const programs: string[] = []
  if (ent.UN_LIST_TYPE) programs.push(extractText(ent.UN_LIST_TYPE))
  if (ent.REFERENCE_NUMBER) programs.push('Ref: ' + extractText(ent.REFERENCE_NUMBER))

  const comments = extractText(ent.COMMENTS1 || ent.COMMENTS) || null

  return {
    source: 'UN',
    source_id: extractText(ent.DATAID || ent.REFERENCE_NUMBER),
    entity_type: 'entity',
    name: primaryName,
    name_normalized: normalizeText(primaryName),
    aliases,
    date_of_birth: null,
    nationality: null,
    addresses,
    identifications: [],
    programs,
    remarks: comments,
    vessel_imo: extractImoFromText(comments),
    listed_date: parseDate(ent.LISTED_ON)
  }
}

function extractImoFromText(text: string | null): string | null {
  if (!text) return null
  const match = text.match(/IMO\s*:?\s*(\d{7})/i) || text.match(/\b\d{7}\b/)
  return match ? match[1] || match[0] : null
}

function parseUnAddress(addr: any): string | null {
  if (!addr) return null
  const parts = [
    extractText(addr.STREET), extractText(addr.CITY),
    extractText(addr.STATE_PROVINCE), extractText(addr.ZIP_CODE),
    extractText(addr.COUNTRY)
  ].filter(Boolean)
  if (parts.length === 0 && addr.NOTE) return extractText(addr.NOTE)
  return parts.length > 0 ? parts.join(', ') : null
}
