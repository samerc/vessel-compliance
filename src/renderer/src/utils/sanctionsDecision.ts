import type { SanctionsMatch } from '../../../shared/types'

/**
 * A Clear / Confirm match decision taken on a vessel or entity outside the Compliance Center
 * (entity panel, directory, vessel list). It takes the same path as the Compliance Center:
 * pending check results are decided with the reason, cleared list entries are remembered (the
 * weekly check will not flag them again) and the subject's status is set. Throws on failure.
 */
export async function decideSanctionsSubject(
  subject: { entityId?: string; vesselId?: string },
  decision: 'cleared' | 'sanctioned',
  note: string,
  matches: SanctionsMatch[]
): Promise<void> {
  const subjectType = subject.vesselId ? 'vessel' : 'entity'
  const subjectId = subject.vesselId || subject.entityId
  if (!subjectId) throw new Error('Nothing to decide on')
  await window.api.complianceDecideSubject({
    subjectType,
    subjectId,
    decision,
    note: note.trim() || null,
    matches: matches.map((m) => ({ source: m.source, source_id: m.source_id, names: m.names }))
  })
}
