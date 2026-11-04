// Amount formatting shared by MoneyInput and the screens that show amounts

/** 1250000 -> "1,250,000" (up to 2 decimals); blank for 0 / empty */
export function fmtMoney(val: number | undefined | null): string {
  if (val == null || val === 0) return ''
  return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * What the user typed or pasted -> a number. Commas, spaces and a currency code are ignored
 * ("USD 1,250,000.00"), and k / m are thousands / millions ("250k", "2.5m").
 */
export function parseMoney(str: string): number | undefined {
  const cleaned = str.replace(/[,\s]/g, '')
  if (!cleaned) return undefined
  const short = /^(-?\d*\.?\d+)(k|m|mn)$/i.exec(cleaned)
  if (short) {
    const n = parseFloat(short[1]) * (short[2].toLowerCase() === 'k' ? 1e3 : 1e6)
    return Math.round(n * 100) / 100
  }
  const n = parseFloat(cleaned.replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? undefined : n
}
