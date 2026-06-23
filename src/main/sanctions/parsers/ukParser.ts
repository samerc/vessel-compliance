import { parseEuSanctions } from './euParser'
import { SanctionsEntity } from '../SanctionsDatabase'

/**
 * UK FCDO Sanctions List (the consolidated UK list; OFSI's list was merged into it in Jan 2026).
 * OpenSanctions publishes it in the SAME "simple CSV" format as the EU FSF list, so we reuse the
 * EU parser and just re-tag the source/programs.
 * Source: https://data.opensanctions.org/datasets/latest/gb_fcdo_sanctions/targets.simple.csv
 */
export function parseUkSanctions(csvData: string): { entities: SanctionsEntity[]; releaseDate: string | null } {
  const { entities, releaseDate } = parseEuSanctions(csvData)
  return {
    entities: entities.map(e => ({
      ...e,
      source: 'UK',
      // euParser falls back to ['EU FSF'] when the datasets column is empty — use a UK default instead
      programs: e.programs && e.programs.length > 0 && e.programs[0] !== 'EU FSF' ? e.programs : ['UK FCDO']
    })),
    releaseDate
  }
}
