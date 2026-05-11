import Fuse from 'fuse.js'
import { SanctionsDatabase, SanctionsEntity, DataUpdate } from './SanctionsDatabase'
import { parseOfacSdn } from './parsers/ofacParser'
import { parseEuSanctions } from './parsers/euParser'
import { parseUnSanctions } from './parsers/unParser'
import { parseIsfSanctions } from './parsers/isfParser'

const DATA_SOURCES = {
  OFAC: 'https://www.treasury.gov/ofac/downloads/sdn.xml',
  EU: 'https://data.opensanctions.org/datasets/latest/eu_fsf/targets.simple.csv',
  UN: 'https://scsanctions.un.org/resources/xml/en/consolidated.xml',
  ISF_PAGE: 'https://isf.gov.lb/national-terrorism-financial-list'
}

const FETCH_TIMEOUT = 300000 // 5 minutes

const FUSE_OPTIONS = {
  keys: [
    { name: 'name', weight: 0.5 },
    { name: 'name_normalized', weight: 0.5 },
    { name: 'vessel_imo', weight: 0.8 },
    { name: 'aliasesFlat', weight: 0.3 }
  ],
  threshold: 1.0,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
  findAllMatches: true
}

export interface SearchOptions {
  threshold?: number // 0-1 (Fuse scale)
  sources?: string[] // e.g. ['OFAC', 'UN']
  limit?: number
  mode?: 'exact' | 'fuzzy' | 'both'
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
    let fuseResults = this.fuseIndex.search(query)
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
      onProgress?.(`Downloading ${src} data...`)
      let entities: SanctionsEntity[] = []
      let releaseDate: string | null = null

      if (src === 'OFAC') {
        const xmlData = await this.fetchText(DATA_SOURCES.OFAC)
        const parsed = await parseOfacSdn(xmlData)
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

      onProgress?.(`Storing ${entities.length} ${src} entities...`)
      this.db.clearEntitiesBySource(src)
      this.db.insertEntitiesBatch(entities)
      this.db.upsertDataUpdate(src, entities.length, 'success', releaseDate)

      onProgress?.('Rebuilding search index...')
      this.buildIndex()

      return { source: src, count: entities.length, status: 'success', releaseDate }
    } catch (err: any) {
      const msg = err.message || 'Unknown error'
      this.db.upsertDataUpdate(src, 0, `error: ${msg}`, null)
      return { source: src, count: 0, status: 'error', releaseDate: null, error: msg }
    }
  }

  async refreshAll(onProgress?: (msg: string) => void): Promise<{ source: string; count: number; status: string; releaseDate: string | null; error?: string }[]> {
    const sources = ['OFAC', 'EU', 'UN', 'ISF']
    const results: { source: string; count: number; status: string; releaseDate: string | null; error?: string }[] = []
    for (const src of sources) {
      onProgress?.(`Refreshing ${src}...`)
      results.push(await this.refreshSource(src, onProgress))
    }
    return results
  }

  getStatus(): { sources: (DataUpdate & { entityCount: number })[]; totalEntities: number } {
    const updates = this.db.getDataUpdates()
    const allSources = ['OFAC', 'EU', 'UN', 'ISF']
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
