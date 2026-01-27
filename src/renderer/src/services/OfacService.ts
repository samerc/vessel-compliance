import { SanctionsMatch } from '../../../shared/types'

export interface OfacCheckResult {
    status: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING' | 'POTENTIAL_MATCH'
    matchFound: boolean
    timestamp: string
    matches: SanctionsMatch[]
    error?: string
}

// Sanctions check is performed via IPC to avoid CORS issues.
// The main process calls the sanctions.fancyshark.com API (OFAC, UN, EU lists).
export class OfacService {
    static async checkSanctions(name: string): Promise<OfacCheckResult> {
        return window.api.checkSanctions(name)
    }
}
