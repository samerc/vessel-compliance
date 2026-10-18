// Values inside a text deductible's wording, e.g. the FD&D deductible
// "{percent}% of all costs ... {currency} {minimum} Minimum Deductible ...".
// The wording keeps the placeholders; each quotation stores its own values (defaults come from
// Quotation Settings) and the exports fill them in. {currency} is always the quotation's currency.

export type DeductibleValues = Record<string, string | number | null | undefined>

const PLACEHOLDER = /\{([a-z][a-z0-9_]*)\}/gi

/** The placeholders a wording uses, in order of first appearance */
export function deductiblePlaceholders(text: string | null | undefined): string[] {
  const out: string[] = []
  for (const m of (text || '').matchAll(PLACEHOLDER)) {
    const name = m[1].toLowerCase()
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/** How a placeholder is entered and printed: a percentage, a currency code or a money amount */
export function placeholderKind(name: string): 'percent' | 'currency' | 'amount' {
  const n = name.toLowerCase()
  if (n === 'percent' || n.endsWith('percent') || n === 'pct') return 'percent'
  if (n === 'currency' || n.endsWith('currency')) return 'currency'
  return 'amount'
}

/** Label shown next to a placeholder's input ("minimum" -> "Minimum") */
export function placeholderLabel(name: string): string {
  const words = name.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The wording with its values filled in. A placeholder without a value stays as written
 * ({minimum}), so a missing value is noticed instead of printing an empty gap.
 */
export function fillDeductibleText(
  text: string | null | undefined,
  values: DeductibleValues | null | undefined
): string {
  const src = text || ''
  if (!values) return src
  return src.replace(PLACEHOLDER, (whole, rawName: string) => {
    const name = rawName.toLowerCase()
    const v = values[name]
    if (v == null || v === '') return whole
    if (placeholderKind(name) === 'amount') {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''))
      if (Number.isFinite(n)) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    }
    return String(v)
  })
}

/**
 * A quotation's text deductibles with their values filled into the wording (for the exports).
 * {currency} is the quotation's own currency, never a value typed on the deductible.
 */
export function fillTextDeductibles<
  T extends { text: string; fieldValues?: DeductibleValues | null }
>(list: T[] | unknown, currency?: string | null): T[] {
  if (!Array.isArray(list)) return []
  return (list as T[]).map((td) =>
    deductiblePlaceholders(td.text).length > 0
      ? { ...td, text: fillDeductibleText(td.text, withCurrency(td.fieldValues, currency)) }
      : td
  )
}

/** The values with {currency} set to the quotation's currency (default USD) */
export function withCurrency(
  values: DeductibleValues | null | undefined,
  currency: string | null | undefined
): DeductibleValues {
  return { ...(values || {}), currency: currency || 'USD' }
}
