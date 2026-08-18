// Shared amount → words helper used by policy documents and receipts.
// Returns Title Case, e.g. "US Dollars One Hundred Twenty-Five Thousand Three Hundred Sixty-Nine Only".

export function currencyName(code: string): string {
  const map: Record<string, string> = {
    USD: 'US Dollars',
    EUR: 'Euros',
    GBP: 'British Pounds',
    AED: 'UAE Dirhams',
    LBP: 'Lebanese Pounds',
    CHF: 'Swiss Francs',
    JPY: 'Japanese Yen'
  }
  return map[code?.toUpperCase()] || code || 'US Dollars'
}

export function integerToWords(n: number): string {
  if (n === 0) return 'Zero'

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  const scales: [number, string][] = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
    [100, 'Hundred']
  ]

  if (n < 0) return 'Negative ' + integerToWords(-n)

  let result = ''
  let remaining = n

  for (const [value, label] of scales) {
    if (remaining >= value) {
      const count = Math.floor(remaining / value)
      result += integerToWords(count) + ' ' + label + ' '
      remaining = remaining % value
    }
  }

  if (remaining >= 20) {
    result += tens[Math.floor(remaining / 10)]
    const r = remaining % 10
    if (r > 0) result += '-' + ones[r]
    result += ' '
  } else if (remaining > 0) {
    result += ones[remaining] + ' '
  }

  return result.trim()
}

export function numberToWords(amount: number, currency: string): string {
  const currencyWord = currencyName(currency)
  const rounded = Math.round(amount * 100) / 100
  const intPart = Math.floor(rounded)
  const decPart = Math.round((rounded - intPart) * 100)

  const words = integerToWords(intPart)
  if (decPart > 0) {
    return `${currencyWord} ${words} and ${integerToWords(decPart)} Cents Only`
  }
  return `${currencyWord} ${words} Only`
}
