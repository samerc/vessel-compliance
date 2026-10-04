export interface ChangelogEntry {
  version: string
  name: string
  date: string
  notes: string
  url: string
}

class ChangelogService {
  private cache: ChangelogEntry[] | null = null

  async getChangelogs(): Promise<ChangelogEntry[]> {
    if (this.cache) return this.cache

    try {
      const result = await window.api.updateGetChangelogs()
      if ('error' in result) {
        throw new Error(result.message || 'Failed to fetch changelogs')
      }
      // GitHub may return null name/date/notes (shared Changelog type); callers treat them as strings
      const entries = result as ChangelogEntry[]
      this.cache = entries
      return entries
    } catch (error) {
      console.error('ChangelogService error:', error)
      throw error
    }
  }

  clearCache(): void {
    this.cache = null
  }
}

export const changelogService = new ChangelogService()
