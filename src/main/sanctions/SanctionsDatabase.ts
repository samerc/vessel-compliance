import Database from 'better-sqlite3'
import path from 'path'

export interface SanctionsEntity {
  id?: number
  source: string
  source_id: string | null
  entity_type: string
  name: string
  name_normalized: string
  aliases: string[]
  date_of_birth: string | null
  nationality: string | null
  addresses: string[]
  identifications: { type: string; number: string; country: string }[]
  programs: string[]
  vessel_imo: string | null
  remarks: string | null
  listed_date: string | null
  mother_name: string | null
  father_name: string | null
}

export interface DataUpdate {
  source: string
  updated_at: string
  record_count: number
  status: string
  release_date: string | null
}

export class SanctionsDatabase {
  private db: Database.Database | null = null

  open(dbDir: string): void {
    const dbPath = path.join(dbDir, 'sanctions.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.createSchema()
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  private createSchema(): void {
    if (!this.db) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        source_id TEXT,
        entity_type TEXT,
        name TEXT NOT NULL,
        name_normalized TEXT,
        aliases TEXT,
        date_of_birth TEXT,
        nationality TEXT,
        addresses TEXT,
        identifications TEXT,
        programs TEXT,
        vessel_imo TEXT,
        remarks TEXT,
        listed_date TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_source ON entities(source);
      CREATE INDEX IF NOT EXISTS idx_name_norm ON entities(name_normalized);
      CREATE INDEX IF NOT EXISTS idx_entity_type ON entities(entity_type);
      CREATE INDEX IF NOT EXISTS idx_vessel_imo ON entities(vessel_imo);

      CREATE TABLE IF NOT EXISTS data_updates (
        source TEXT PRIMARY KEY,
        updated_at TEXT,
        record_count INTEGER DEFAULT 0,
        status TEXT DEFAULT 'completed',
        release_date TEXT
      );
    `)
    // Migration: add mother_name, father_name columns
    try {
      const cols = this.db!.prepare("PRAGMA table_info(entities)").all() as any[]
      const colNames = cols.map((c: any) => c.name)
      if (!colNames.includes('mother_name')) {
        this.db!.exec('ALTER TABLE entities ADD COLUMN mother_name TEXT')
      }
      if (!colNames.includes('father_name')) {
        this.db!.exec('ALTER TABLE entities ADD COLUMN father_name TEXT')
      }
    } catch { /* ignore */ }
  }

  getAllEntities(): SanctionsEntity[] {
    if (!this.db) return []
    const rows = this.db.prepare('SELECT * FROM entities').all() as any[]
    return rows.map(r => this.deserializeEntity(r))
  }

  getEntityCount(source?: string): number {
    if (!this.db) return 0
    if (source) {
      const row = this.db.prepare('SELECT COUNT(*) as cnt FROM entities WHERE source = ?').get(source) as any
      return row?.cnt || 0
    }
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM entities').get() as any
    return row?.cnt || 0
  }

  searchExact(query: string, options: { source?: string; limit?: number } = {}): SanctionsEntity[] {
    if (!this.db) return []
    const normalizedQuery = query.toLowerCase().trim()
    let sql = `SELECT * FROM entities WHERE (name_normalized LIKE ? OR aliases LIKE ? OR (vessel_imo IS NOT NULL AND vessel_imo = ?) OR mother_name LIKE ? OR father_name LIKE ?)`
    const params: any[] = [`%${normalizedQuery}%`, `%${normalizedQuery}%`, query.trim(), `%${normalizedQuery}%`, `%${normalizedQuery}%`]
    if (options.source) {
      sql += ' AND source = ?'
      params.push(options.source)
    }
    sql += ' LIMIT ?'
    params.push(options.limit || 100)
    const rows = this.db.prepare(sql).all(...params) as any[]
    return rows.map(r => this.deserializeEntity(r))
  }

  insertEntitiesBatch(entities: SanctionsEntity[]): void {
    if (!this.db) return
    const insert = this.db.prepare(`
      INSERT INTO entities (source, source_id, entity_type, name, name_normalized, aliases, date_of_birth, nationality, addresses, identifications, programs, vessel_imo, remarks, listed_date, mother_name, father_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const tx = this.db.transaction((items: SanctionsEntity[]) => {
      for (const e of items) {
        insert.run(
          e.source,
          e.source_id || null,
          e.entity_type || 'unknown',
          e.name,
          e.name_normalized || '',
          JSON.stringify(e.aliases || []),
          e.date_of_birth || null,
          e.nationality || null,
          JSON.stringify(e.addresses || []),
          JSON.stringify(e.identifications || []),
          JSON.stringify(e.programs || []),
          e.vessel_imo || null,
          e.remarks || null,
          e.listed_date || null,
          e.mother_name || null,
          e.father_name || null
        )
      }
    })
    tx(entities)
  }

  clearEntitiesBySource(source: string): void {
    if (!this.db) return
    this.db.prepare('DELETE FROM entities WHERE source = ?').run(source)
  }

  getDataUpdates(): DataUpdate[] {
    if (!this.db) return []
    return this.db.prepare('SELECT * FROM data_updates ORDER BY source').all() as DataUpdate[]
  }

  upsertDataUpdate(source: string, recordCount: number, status: string, releaseDate: string | null): void {
    if (!this.db) return
    this.db.prepare(`
      INSERT INTO data_updates (source, updated_at, record_count, status, release_date)
      VALUES (?, datetime('now'), ?, ?, ?)
      ON CONFLICT(source) DO UPDATE SET
        updated_at = datetime('now'),
        record_count = excluded.record_count,
        status = excluded.status,
        release_date = excluded.release_date
    `).run(source, recordCount, status, releaseDate || null)
  }

  getSicEntities(): SanctionsEntity[] {
    if (!this.db) return []
    const rows = this.db.prepare("SELECT * FROM entities WHERE source = 'SIC' ORDER BY name").all() as any[]
    return rows.map(r => this.deserializeEntity(r))
  }

  getSicEntity(id: number): SanctionsEntity | null {
    if (!this.db) return null
    const row = this.db.prepare('SELECT * FROM entities WHERE id = ? AND source = ?').get(id, 'SIC') as any
    return row ? this.deserializeEntity(row) : null
  }

  insertSicEntity(e: Omit<SanctionsEntity, 'id'>): number {
    if (!this.db) return 0
    const result = this.db.prepare(`
      INSERT INTO entities (source, source_id, entity_type, name, name_normalized, aliases, date_of_birth, nationality, addresses, identifications, programs, vessel_imo, remarks, listed_date, mother_name, father_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'SIC',
      e.source_id || null,
      e.entity_type || 'individual',
      e.name,
      e.name_normalized || '',
      JSON.stringify(e.aliases || []),
      e.date_of_birth || null,
      e.nationality || null,
      JSON.stringify(e.addresses || []),
      JSON.stringify(e.identifications || []),
      JSON.stringify(e.programs || []),
      e.vessel_imo || null,
      e.remarks || null,
      e.listed_date || null,
      e.mother_name || null,
      e.father_name || null
    )
    this.updateSicDataUpdate()
    return Number(result.lastInsertRowid)
  }

  updateSicEntity(id: number, e: Partial<SanctionsEntity>): void {
    if (!this.db) return
    const fields: string[] = []
    const values: any[] = []
    if (e.name !== undefined) { fields.push('name = ?'); values.push(e.name) }
    if (e.name_normalized !== undefined) { fields.push('name_normalized = ?'); values.push(e.name_normalized) }
    if (e.source_id !== undefined) { fields.push('source_id = ?'); values.push(e.source_id || null) }
    if (e.entity_type !== undefined) { fields.push('entity_type = ?'); values.push(e.entity_type) }
    if (e.aliases !== undefined) { fields.push('aliases = ?'); values.push(JSON.stringify(e.aliases || [])) }
    if (e.date_of_birth !== undefined) { fields.push('date_of_birth = ?'); values.push(e.date_of_birth || null) }
    if (e.nationality !== undefined) { fields.push('nationality = ?'); values.push(e.nationality || null) }
    if (e.remarks !== undefined) { fields.push('remarks = ?'); values.push(e.remarks || null) }
    if (e.listed_date !== undefined) { fields.push('listed_date = ?'); values.push(e.listed_date || null) }
    if (e.mother_name !== undefined) { fields.push('mother_name = ?'); values.push(e.mother_name || null) }
    if (e.father_name !== undefined) { fields.push('father_name = ?'); values.push(e.father_name || null) }
    if (fields.length === 0) return
    values.push(id)
    this.db.prepare(`UPDATE entities SET ${fields.join(', ')} WHERE id = ? AND source = 'SIC'`).run(...values)
    this.updateSicDataUpdate()
  }

  deleteSicEntity(id: number): void {
    if (!this.db) return
    this.db.prepare("DELETE FROM entities WHERE id = ? AND source = 'SIC'").run(id)
    this.updateSicDataUpdate()
  }

  private updateSicDataUpdate(): void {
    const count = this.getEntityCount('SIC')
    this.upsertDataUpdate('SIC', count, 'success', null)
  }

  private deserializeEntity(row: any): SanctionsEntity {
    return {
      id: row.id,
      source: row.source,
      source_id: row.source_id,
      entity_type: row.entity_type,
      name: row.name,
      name_normalized: row.name_normalized,
      aliases: this.parseJson(row.aliases, []),
      date_of_birth: row.date_of_birth,
      nationality: row.nationality,
      addresses: this.parseJson(row.addresses, []),
      identifications: this.parseJson(row.identifications, []),
      programs: this.parseJson(row.programs, []),
      vessel_imo: row.vessel_imo,
      remarks: row.remarks,
      listed_date: row.listed_date,
      mother_name: row.mother_name || null,
      father_name: row.father_name || null
    }
  }

  private parseJson(val: any, fallback: any): any {
    if (!val) return fallback
    try { return JSON.parse(val) } catch { return fallback }
  }
}
