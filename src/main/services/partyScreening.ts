import { db, MySQLAdapter } from '../mysql/adapter'
import { sanctionsService } from '../sanctions/SanctionsService'
import { searchSanctions } from '../sanctions/searchProcess'
import type {
  PartyScreeningStatus,
  SanctionsScreening,
  ScreenedParty,
  ScreeningContextType,
  ScreeningPartyInput,
  ScreeningStatus,
  ScreeningTrigger
} from '../../shared/types'

/** A clear check counts this long (and only when made after the last list update) */
export const SCREENING_FRESH_DAYS = 30

const RANK: Record<PartyScreeningStatus, number> = {
  MATCH: 4,
  REVIEW: 3,
  ERROR: 2,
  NOT_SCREENED: 1,
  CLEAR: 0
}

export function worstStatus(statuses: PartyScreeningStatus[]): PartyScreeningStatus {
  return statuses.reduce<PartyScreeningStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'CLEAR')
}

/** When the lists on this PC were last updated (SQLite stores UTC "YYYY-MM-DD HH:MM:SS") */
function lastListUpdate(): Date | null {
  let latest: Date | null = null
  for (const s of sanctionsService.getStatus().sources) {
    if (!s.updated_at) continue
    const d = new Date(s.updated_at.replace(' ', 'T') + (s.updated_at.endsWith('Z') ? '' : 'Z'))
    if (!isNaN(d.getTime()) && (!latest || d > latest)) latest = d
  }
  return latest
}

function isFresh(checkedAt: Date | null, listsAt: Date | null): boolean {
  if (!checkedAt) return false
  if (Date.now() - checkedAt.getTime() > SCREENING_FRESH_DAYS * 86400_000) return false
  return !listsAt || checkedAt >= listsAt
}

/** A stored status read as the screening picture, without searching */
function statusFrom(
  stored: string | null | undefined,
  checkedAt: Date | null,
  listsAt: Date | null
): PartyScreeningStatus {
  if (stored === 'MATCH' || stored === 'SANCTIONED') return 'MATCH'
  if (stored === 'POTENTIAL_MATCH') return 'REVIEW'
  if (stored === 'CLEARED' && isFresh(checkedAt, listsAt)) return 'CLEAR'
  return 'NOT_SCREENED'
}

/** Same party twice (an owner who is also the manager) is screened once, with both roles */
async function resolveParties(
  input: ScreeningPartyInput[]
): Promise<{ kind: 'vessel' | 'entity' | 'name'; id: string; name: string; role: string }[]> {
  type Resolved = { kind: 'vessel' | 'entity' | 'name'; id: string; name: string; role: string }
  const out = new Map<string, Resolved>()
  for (const p of input) {
    const name = (p.name || '').trim().replace(/\s+/g, ' ')
    if (!name) continue
    // A registry vessel or Directory entity by its id; anything else by the name typed
    const linked = (p.kind === 'vessel' || p.kind === 'entity') && !!p.id
    const kind = linked ? (p.kind as 'vessel' | 'entity') : 'name'
    const id = linked ? (p.id as string) : await db.upsertScreenedName(name)
    const role = (p.role || '').trim() || 'Party'
    const prev = out.get(`${kind}:${id}`)
    if (prev) {
      if (!prev.role.split(', ').includes(role)) prev.role += `, ${role}`
    } else out.set(`${kind}:${id}`, { kind, id, name, role })
  }
  return [...out.values()]
}

/** The current picture of the parties, from their stored statuses (no searching) */
export async function partiesStatus(input: ScreeningPartyInput[]): Promise<ScreenedParty[]> {
  const parties = await resolveParties(input)
  const stored = await db.getSanctionsSubjects(parties)
  const listsAt = lastListUpdate()
  return parties.map((p) => {
    const s = stored.get(`${p.kind}:${p.id}`)
    return {
      ...p,
      status: statusFrom(s?.status, s?.checkedAt ?? null, listsAt),
      checkedAt: s?.checkedAt ? s.checkedAt.toISOString() : null,
      reused: true
    }
  })
}

/**
 * Screens the parties of a quotation, conversion, endorsement or receipt. A party with a
 * recent clear check, a pending review or a decided match is not searched again. A search
 * follows the weekly check's rules: list entries a reviewer cleared are skipped, new hits go
 * to the Compliance Center review, and a confirmed match is never turned clear here.
 */
export async function screenParties(opts: {
  input: ScreeningPartyInput[]
  trigger: ScreeningTrigger
  contextType: ScreeningContextType
  contextId: string
  contextLabel: string | null
  user: string | null
}): Promise<SanctionsScreening> {
  const parties = await resolveParties(opts.input)
  const stored = await db.getSanctionsSubjects(parties)
  await sanctionsService.whenReady()
  const listsAt = lastListUpdate()
  const settings = await db.getComplianceScheduleSettings()
  const threshold = (settings.threshold || 85) / 100
  const problem = sanctionsService.screeningProblem()

  const results: ScreenedParty[] = []
  let logId: string | null = null
  let clearedHits: Map<string, Set<string>> | null = null
  for (const p of parties) {
    const s = stored.get(`${p.kind}:${p.id}`)
    const known = statusFrom(s?.status, s?.checkedAt ?? null, listsAt)
    const base = { ...p, checkedAt: s?.checkedAt ? s.checkedAt.toISOString() : null }
    if (known !== 'NOT_SCREENED') {
      results.push({ ...base, status: known, reused: true })
      continue
    }
    if (problem) {
      results.push({ ...base, status: 'ERROR', reused: false })
      continue
    }
    try {
      const data = await searchSanctions(p.name, {
        threshold: 0.6,
        limit: 10,
        mode: 'both',
        minScore: threshold
      })
      if (!clearedHits) clearedHits = await db.getSanctionsClearedHits()
      const cleared = clearedHits.get(`${p.kind}:${p.id}`)
      const details = data.results
        .filter((r) => r.score >= threshold)
        .map((r) => ({
          id: r.entity.source_id || '',
          target_type: r.entity.entity_type || 'unknown',
          source: r.entity.source || 'unknown',
          source_id: r.entity.source_id || '',
          names: [r.entity.name, ...(r.entity.aliases || [])].filter(Boolean),
          score: r.score
        }))
      const newHits = details.filter((d) => !cleared?.has(MySQLAdapter.sanctionsHitKey(d)))
      const checkedAt = new Date().toISOString()
      if (newHits.length > 0) {
        const bestScore = Math.max(...newHits.map((d) => d.score))
        await db.setSanctionsSubjectStatus(p.kind, p.id, {
          status: 'POTENTIAL_MATCH',
          matchFound: true
        })
        if (!logId)
          logId = await db.createComplianceCheckLog({
            totalChecked: parties.length,
            status: 'completed',
            source: 'screening'
          })
        await db.addComplianceCheckResult({
          logId,
          entityType: p.kind,
          entityId: p.id,
          entityName: p.name,
          matchScore: bestScore * 100,
          matchDetails: JSON.stringify(newHits)
        })
        db.notifyGroupsForEvent(
          'compliance_match',
          `Sanctions match found: ${p.name}`,
          `Score: ${Math.round(bestScore * 100)}% (${opts.trigger} ${opts.contextLabel || ''})`.trim(),
          p.kind === 'name' ? undefined : p.kind,
          p.kind === 'name' ? undefined : p.id
        ).catch(() => {})
        results.push({
          ...base,
          status: 'REVIEW',
          checkedAt,
          reused: false,
          bestScore: Math.round(bestScore * 100),
          hitCount: newHits.length
        })
      } else {
        await db.setSanctionsSubjectStatus(p.kind, p.id, { status: 'CLEARED', matchFound: false })
        results.push({ ...base, status: 'CLEAR', checkedAt, reused: false })
      }
    } catch (e) {
      console.error(`[screening] ${p.name}:`, e)
      results.push({ ...base, status: 'ERROR', reused: false })
    }
  }

  const record = {
    trigger: opts.trigger,
    contextType: opts.contextType,
    contextId: opts.contextId,
    contextLabel: opts.contextLabel,
    parties: results,
    outcome: worstStatus(results.map((r) => r.status)),
    error: problem && results.some((r) => r.status === 'ERROR') ? problem : null,
    createdBy: opts.user
  }
  // The quotation editor's background check is not kept when it searched nothing new
  if (opts.trigger === 'quotation' && results.every((r) => r.reused))
    return {
      ...record,
      id: '',
      overrideBy: null,
      overrideReason: null,
      overrideAt: null,
      createdAt: new Date().toISOString()
    }
  return db.createScreening(record)
}

/** The parties of a quotation / policy and the badge picture, without searching */
export async function screeningStatus(
  contextType: 'quotation' | 'policy',
  contextId: string
): Promise<ScreeningStatus> {
  const { parties: input } =
    contextType === 'policy'
      ? await db.getPolicyScreeningParties(contextId)
      : await db.getQuotationScreeningParties(contextId)
  const parties = await partiesStatus(input)
  const [latest] = await db.getScreenings(contextType, [contextId], 1)
  return {
    parties,
    outcome: worstStatus(parties.map((p) => p.status)),
    latest: latest || null
  }
}

/**
 * A blocking step may go ahead: every party clear, or a permitted user overrode the block.
 * A party confirmed sanctioned (MATCH) can never be overridden.
 */
export function screeningAllows(s: SanctionsScreening | null): boolean {
  return !!s && (s.outcome === 'CLEAR' || (!!s.overrideAt && s.outcome !== 'MATCH'))
}
