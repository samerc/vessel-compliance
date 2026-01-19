export interface OfacCheckResult {
    status: 'CLEARED' | 'MATCH' | 'ERROR' | 'PENDING';
    matchFound: boolean;
    timestamp: string;
}

// sanctions.network is a free API covering OFAC, UN, and EU lists.
const API_BASE = 'https://api.sanctions.network/rpc';

export class OfacService {
    static async checkSanctions(name: string): Promise<OfacCheckResult> {
        try {
            // Using trigram similarity search for better matching
            const url = `${API_BASE}/search_sanctions?name=${encodeURIComponent(name)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.statusText}`);
            }

            const results = await response.json();
            const matchFound = Array.isArray(results) && results.length > 0;

            return {
                status: matchFound ? 'MATCH' : 'CLEARED',
                matchFound: matchFound,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('OFAC check failed:', error);
            return {
                status: 'ERROR',
                matchFound: false,
                timestamp: new Date().toISOString()
            };
        }
    }
}
