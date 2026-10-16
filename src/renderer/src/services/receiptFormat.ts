// Small receipt formatting helpers, kept apart from ReceiptExportService so pages can
// use them without loading the docx library.

// ── Currency helpers ────────────────────────────────────────────────────
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  LBP: 'LBP ',
  CHF: 'CHF ',
  JPY: '¥'
}

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[(code || 'USD').toUpperCase()] || `${(code || '').toUpperCase()} `
}

export function formatReceiptAmount(amount: number, currency: string): string {
  const n = (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
  return `${currencySymbol(currency)}${n}. -`
}

// Ordinal for instalment: 1 → 1st, 2 → 2nd, 3 → 3rd, 4 → 4th ...
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}
