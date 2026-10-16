import { SanctionsMatch } from '../../../shared/types'

export interface OfacCheckResult {
  status: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH' | 'SANCTIONED'
  matchFound: boolean
  timestamp: string
  matches: SanctionsMatch[]
  error?: string
  autoMarkCleanOnCheck?: boolean
}

export interface NewRecordSanctions {
  /** Fields to store on the new entity / vessel */
  fields: {
    ofacStatus: OfacCheckResult['status']
    ofacMatchFound: boolean
    ofacCheckedAt?: string
  }
  result?: OfacCheckResult
  /** Set when the check could not run: the record is saved as not checked */
  warning?: string
}

// Screening runs locally in the main process (SanctionsService)
export class OfacService {
  /** Throws when the screening could not run (lists not loaded), so it is never saved as a status */
  static async checkSanctions(name: string): Promise<OfacCheckResult> {
    const result = await window.api.checkSanctions(name)
    if (result.status === 'ERROR') throw new Error(result.error || 'The sanctions check failed')
    return result
  }

  /** Check for a record being created: when the check cannot run, the record is still saved, as not checked */
  static async checkNewRecord(name: string): Promise<NewRecordSanctions> {
    try {
      const result = await OfacService.checkSanctions(name)
      return {
        fields: {
          ofacStatus: result.status,
          ofacMatchFound: result.matchFound,
          ofacCheckedAt: result.timestamp
        },
        result
      }
    } catch (err) {
      return {
        fields: { ofacStatus: 'PENDING', ofacMatchFound: false },
        warning: `Saved without a sanctions check: ${(err instanceof Error && err.message) || 'the check failed'}`
      }
    }
  }
}
