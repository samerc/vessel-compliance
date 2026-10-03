import Fuse, { type FuseResult } from 'fuse.js'
import { SanctionsDatabase, SanctionsEntity, DataUpdate } from './SanctionsDatabase'
import { parseOfacSdn } from './parsers/ofacParser'
import { parseEuSanctions } from './parsers/euParser'
import { parseUnSanctions } from './parsers/unParser'
import { parseIsfSanctions } from './parsers/isfParser'
import { parseSicExcel } from './parsers/sicParser'
import { parseUkSanctions } from './parsers/ukParser'

const DATA_SOURCES = {
  OFAC: 'https://www.treasury.gov/ofac/downloads/sdn.xml',
  EU: 'https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv',
  UN: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  UK: 'https://data.opensanctions.org/datasets/latest/gb_fcdo_sanctions/targets.simple.csv',
  ISF_PAGE: 'https://isf.gov.lb/national-terrorism-financial-list'
}

const FETCH_TIMEOUT = 300000 // 5 minutes

const FUSE_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'name_normalized', weight: 0.5 },
    { name: 'vessel_imo', weight: 0.8 },
    { name: 'aliasesFlat', weight: 0.3 },
    { name: 'mother_name', weight: 0.3 },
    { name: 'father_name', weight: 0.3 }
  ],
  threshold: 1.0,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
  findAllMatches: true
}

// Trigram candidate prefilter for fuzzy search. A full Fuse scan scores every one of ~34k
// entities per query (avg ~4 s, up to ~10 s on the main thread). Fuse scores each item
// independently, so scoring only the entities that share enough character trigrams with the
// query gives the same scores for those items. Measured on real data: with a minimum overlap
// of 15% of the query's trigrams, every match the full scan finds at >= 0.70 was kept (and all
// true matches of exact, typo'd and shortened names at >= 0.60) at ~6x the speed. Below 0.60
// similarity some weak matches share no trigram at all, so the prefilter is only used when the
// caller discards anything under PREFILTER_MIN_SCORE anyway (otherwise: full scan, as before).
// Overlap needed per caller minimum: 15% is exact from 0.70 up; between 0.60 and 0.70 a
// weak match can share a single trigram (e.g. "Emile Khlat" ~ "Esmail KHATIB" at 0.61), so
// that band uses 5% (= at least one shared trigram for normal-length names).
const PREFILTER_MIN_SCORE = 0.6
function prefilterOverlap(minScore: number): number {
  return minScore >= 0.7 ? 0.15 : 0.05
}
// When the prefilter would keep most of the list anyway, a plain full scan is cheaper
const PREFILTER_MAX_SHARE = 0.6

// Unicode-aware (keeps Arabic etc.), unlike normalizeText which keeps ASCII \w only
function gramNormalize(s: string): string {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function trigrams(s: string): Set<string> {
  const out = new Set<string>()
  for (const w of gramNormalize(s).split(' ')) {
    if (!w) continue
    const padded = ` ${w} `
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  }
  return out
}

export interface SearchOptions {
  threshold?: number // 0-1 (Fuse scale)
  sources?: string[] // e.g. ['OFAC', 'UN']
  limit?: number
  mode?: 'exact' | 'fuzzy' | 'both'
  // Lowest similarity (0-1) the caller will keep. >= PREFILTER_MIN_SCORE enables the fast
  // trigram prefilter (same results above that score); omitted = full scan
  minScore?: number
}

export interface SearchResult {
  match_type: 'exact' | 'fuzzy'
  score: number // 0-1 (1 = perfect)
  entity: Omit<SanctionsEntity, 'id'>
}

export class SanctionsService {
  private db = new SanctionsDatabase()
  private fuseIndex: Fuse<any> | null = null
  private entityCache: SanctionsEntity[] = []
  private searchable: any[] = []
  private gramIndex: Map<string, number[]> = new Map()
  private gramCounts: Uint16Array = new Uint16Array(0)
  public initialized = false

  initialize(dbDir: string): void {
    this.db.open(dbDir)
    this.buildIndex()
    this.initialized = true
  }

  close(): void {
    this.db.close()
    this.fuseIndex = null
    this.entityCache = []
    this.initialized = false
  }

  private buildIndex(): void {
    this.entityCache = this.db.getAllEntities()
    const searchable = this.entityCache.map(e => ({
      ...e,
      aliasesFlat: Array.isArray(e.aliases) ? e.aliases.join(' ') : ''
    }))
    this.fuseIndex = new Fuse(searchable, FUSE_OPTIONS)
    this.searchable = searchable
    // Inverted trigram index over every searched field (see prefilterOverlap)
    const gramIndex = new Map<string, number[]>()
    searchable.forEach((e, idx) => {
      const text = [e.name, e.name_normalized, e.aliasesFlat, e.mother_name, e.father_name, e.vessel_imo].filter(Boolean).join(' ')
      for (const g of trigrams(text)) {
        let list = gramIndex.get(g)
        if (!list) gramIndex.set(g, (list = []))
        list.push(idx)
      }
    })
    this.gramIndex = gramIndex
    this.gramCounts = new Uint16Array(searchable.length)
  }

  // Fuse over the trigram candidates only; falls back to the full index when the query has no
  // usable trigrams or the candidates are most of the list anyway
  private fuzzyCandidatesSearch(query: string, minScore: number): FuseResult<any>[] {
    if (!this.fuseIndex) return []
    if (!(minScore >= PREFILTER_MIN_SCORE)) return this.fuseIndex.search(query)
    const qGrams = trigrams(query)
    if (qGrams.size === 0) return this.fuseIndex.search(query)
    const counts = this.gramCounts
    const touched: number[] = []
    for (const g of qGrams) {
      const list = this.gramIndex.get(g)
      if (!list) continue
      for (const i of list) {
        if (counts[i] === 0) touched.push(i)
        counts[i]++
      }
    }
    const need = Math.max(1, Math.ceil(qGrams.size * prefilterOverlap(minScore)))
    const candidates = touched.filter(i => counts[i] >= need)
    for (const i of touched) counts[i] = 0
    if (candidates.length > this.searchable.length * PREFILTER_MAX_SHARE) return this.fuseIndex.search(query)
    if (candidates.length === 0) return []
    const sub = new Fuse(candidates.map(i => this.searchable[i]), FUSE_OPTIONS)
    return sub.search(query)
  }

  search(query: string, options: SearchOptions = {}): { query: string; total: number; results: SearchResult[] } {
    const mode = options.mode || 'both'
    const limit = options.limit || 100
    const threshold = options.threshold ?? 0.6
    let results: SearchResult[] = []

    if (mode === 'exact' || mode === 'both') {
      const exactResults = this.searchExact(query, options)
      results.push(...exactResults)
    }

    if (mode === 'fuzzy' || mode === 'both') {
      const fuzzyResults = this.searchFuzzy(query, threshold, options)
      if (mode === 'both') {
        const exactKeys = new Set(results.map(r => `${r.entity.source}-${r.entity.source_id}`))
        results.push(...fuzzyResults.filter(r => !exactKeys.has(`${r.entity.source}-${r.entity.source_id}`)))
      } else {
        results.push(...fuzzyResults)
      }
    }

    results.sort((a, b) => b.score - a.score)
    results = results.slice(0, limit)
    return { query, total: results.length, results }
  }

  private searchExact(query: string, options: SearchOptions): SearchResult[] {
    const sourceFilter = options.sources?.length === 1 ? options.sources[0] : undefined
    const rows = this.db.searchExact(query, { source: sourceFilter, limit: options.limit || 100 })
    let filtered = rows
    if (options.sources && options.sources.length > 1) {
      const srcSet = new Set(options.sources.map(s => s.toUpperCase()))
      filtered = rows.filter(r => srcSet.has(r.source))
    }
    return filtered.map(entity => ({ match_type: 'exact' as const, score: 1.0, entity: stripId(entity) }))
  }

  private searchFuzzy(query: string, threshold: number, options: SearchOptions): SearchResult[] {
    if (!this.fuseIndex) return []
    let fuseResults = this.fuzzyCandidatesSearch(query, options.minScore ?? 0)
    fuseResults = fuseResults.filter(r => (r.score ?? 1) <= threshold)
    if (options.sources && options.sources.length > 0) {
      const srcSet = new Set(options.sources.map(s => s.toUpperCase()))
      fuseResults = fuseResults.filter(r => srcSet.has(r.item.source))
    }
    fuseResults = fuseResults.slice(0, options.limit || 100)
    return fuseResults.map(r => ({
      match_type: 'fuzzy' as const,
      score: parseFloat((1 - (r.score ?? 1)).toFixed(4)),
      entity: stripId(r.item)
    }))
  }

  async refreshSource(source: string, onProgress?: (msg: string) => void): Promise<{ source: string; count: number; status: string; releaseDate: string | null; error?: string }> {
    const src = source.toUpperCase()
    try {
      console.log(`[Sanctions] Refreshing ${src}...`)
      onProgress?.(`Downloading ${src} data...`)
      let entities: SanctionsEntity[] = []
      let releaseDate: string | null = null

      if (src === 'OFAC') {
        console.log(`[Sanctions] Downloading OFAC from ${DATA_SOURCES.OFAC}...`)
        const xmlData = await this.fetchText(DATA_SOURCES.OFAC)
        console.log(`[Sanctions] Downloaded OFAC XML: ${(xmlData.length / 1024 / 1024).toFixed(1)}MB, parsing...`)
        const parsed = await parseOfacSdn(xmlData)
        console.log(`[Sanctions] Parsed ${parsed.entities.length} OFAC entities`)
        entities = parsed.entities
        releaseDate = parsed.releaseDate
      } else if (src === 'EU') {
        const csvData = await this.fetchText(DATA_SOURCES.EU)
        const parsed = parseEuSanctions(csvData)
        entities = parsed.entities
        releaseDate = parsed.releaseDate
      } else if (src === 'UN') {
        const xmlData = await this.fetchText(DATA_SOURCES.UN)
        const parsed = await parseUnSanctions(xmlData)
        entities = parsed.entities
        releaseDate = parsed.releaseDate
      } else if (src === 'UK') {
        const csvData = await this.fetchText(DATA_SOURCES.UK)
        const parsed = parseUkSanctions(csvData)
        entities = parsed.entities
        releaseDate = parsed.releaseDate
      } else if (src === 'ISF') {
        const downloadUrl = await this.getIsfDownloadUrl()
        if (!downloadUrl) throw new Error('Could not find Excel download link on ISF page')
        const buffer = await this.fetchBuffer(downloadUrl)
        const parsed = parseIsfSanctions(buffer)
        entities = parsed.entities
        releaseDate = parsed.releaseDate || this.extractDateFromUrl(downloadUrl)
      } else {
        throw new Error(`Unknown source: ${source}`)
      }

      console.log(`[Sanctions] Storing ${entities.length} ${src} entities...`)
      onProgress?.(`Storing ${entities.length} ${src} entities...`)
      this.db.clearEntitiesBySource(src)
      this.db.insertEntitiesBatch(entities)
      this.db.upsertDataUpdate(src, entities.length, 'success', releaseDate)

      console.log(`[Sanctions] Rebuilding search index...`)
      onProgress?.('Rebuilding search index...')
      this.buildIndex()

      console.log(`[Sanctions] ${src} refresh complete: ${entities.length} entities`)
      return { source: src, count: entities.length, status: 'success', releaseDate }
    } catch (err: any) {
      const msg = err.message || 'Unknown error'
      console.error(`[Sanctions] ${src} refresh failed:`, msg)
      this.db.upsertDataUpdate(src, 0, `error: ${msg}`, null)
      return { source: src, count: 0, status: 'error', releaseDate: null, error: msg }
    }
  }

  async refreshAll(onProgress?: (msg: string) => void): Promise<{ source: string; count: number; status: string; releaseDate: string | null; error?: string }[]> {
    const sources = ['OFAC', 'EU', 'UK', 'UN', 'ISF']
    const results: { source: string; count: number; status: string; releaseDate: string | null; error?: string }[] = []
    for (const src of sources) {
      onProgress?.(`Refreshing ${src}...`)
      results.push(await this.refreshSource(src, onProgress))
    }
    return results
  }

  getStatus(): { sources: (DataUpdate & { entityCount: number })[]; totalEntities: number } {
    const updates = this.db.getDataUpdates()
    const allSources = ['OFAC', 'EU', 'UK', 'UN', 'ISF', 'SIC']
    const sources = allSources.map(src => {
      const update = updates.find(u => u.source === src)
      return {
        source: src,
        updated_at: update?.updated_at || '',
        record_count: update?.record_count || 0,
        status: update?.status || 'never',
        release_date: update?.release_date || null,
        entityCount: this.db.getEntityCount(src)
      }
    })
    return { sources, totalEntities: this.db.getEntityCount() }
  }

  getSicEntities(): SanctionsEntity[] {
    return this.db.getSicEntities()
  }

  getSicEntity(id: number): SanctionsEntity | null {
    return this.db.getSicEntity(id)
  }

  addSicEntity(entity: Omit<SanctionsEntity, 'id'>): number {
    const id = this.db.insertSicEntity(entity)
    this.buildIndex()
    return id
  }

  updateSicEntity(id: number, entity: Partial<SanctionsEntity>): void {
    this.db.updateSicEntity(id, entity)
    this.buildIndex()
  }

  deleteSicEntity(id: number): void {
    this.db.deleteSicEntity(id)
    this.buildIndex()
  }

  importSicFromFile(filePath: string): { count: number } {
    const fs = require('fs')
    const buffer = fs.readFileSync(filePath)
    const parsed = parseSicExcel(buffer)
    this.db.clearEntitiesBySource('SIC')
    this.db.insertEntitiesBatch(parsed.entities)
    this.db.upsertDataUpdate('SIC', parsed.entities.length, 'success', null)
    this.buildIndex()
    return { count: parsed.entities.length }
  }

  private async fetchText(url: string): Promise<string> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'VesselCompliance/1.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      return await res.text()
    } finally { clearTimeout(timer) }
  }

  private async fetchBuffer(url: string): Promise<Buffer> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'VesselCompliance/1.0' } })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      return Buffer.from(await res.arrayBuffer())
    } finally { clearTimeout(timer) }
  }

  private async getIsfDownloadUrl(): Promise<string | null> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    try {
      const res = await fetch(DATA_SOURCES.ISF_PAGE, { signal: controller.signal, headers: { 'User-Agent': 'VesselCompliance/1.0' } })
      if (!res.ok) return null
      const html = await res.text()
      const match = html.match(/href=["'](https?:\/\/[^"']*?\.xlsx?)["']/i)
        || html.match(/href=["']([^"']*?\.xlsx?)["']/i)
      if (match) {
        let url = match[1]
        if (url.startsWith('/')) url = 'https://isf.gov.lb' + url
        return url
      }
      return null
    } finally { clearTimeout(timer) }
  }

  private extractDateFromUrl(url: string): string | null {
    const match = url.match(/(\d{4})[-/](\d{1,2})/)
    return match ? `${match[1]}-${match[2].padStart(2, '0')}` : null
  }
}

function stripId(entity: SanctionsEntity): Omit<SanctionsEntity, 'id'> {
  const { id: _, ...rest } = entity
  return rest
}

// Singleton instance
export const sanctionsService = new SanctionsService()
