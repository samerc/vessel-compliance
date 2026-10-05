// Quotation type rules shared by the editor, the settings and the exports.
// FD&D (code F) is built on P&I: same tabs, lists, alternatives and limit options,
// with its own wording and its own items in the settings lists (type scope 'fdd').

/** P&I and FD&D share the P&I tabs, alternatives and limit-of-liability options. */
export function isPiLike(code?: string | null): boolean {
  return code === 'P' || code === 'F'
}

/** The type_scope token a quotation type matches in the settings lists. */
export function typeScopeToken(code?: string | null): string {
  switch ((code || 'P').toUpperCase()) {
    case 'H':
      return 'hull'
    case 'W':
      return 'war'
    case 'C':
      return 'cargo'
    case 'F':
      return 'fdd'
    default:
      return 'pi'
  }
}

/** True when a settings item (warranty, clause, exclusion...) applies to this quotation type. */
export function inTypeScope(scope: string | null | undefined, code?: string | null): boolean {
  if (!scope || scope === 'all' || scope === 'both') return true
  return scope
    .split(',')
    .map((s) => s.trim())
    .includes(typeScopeToken(code))
}

export const TYPE_SCOPE_LABELS: Record<string, string> = {
  pi: 'P&I',
  fdd: 'FD&D',
  hull: 'Hull',
  war: 'War',
  cargo: 'Cargo'
}

/** Standard texts with an FD&D wording: FD&D quotations use the variant when it is set. */
export const FDD_TEXT_VARIANTS: Record<string, string> = {
  conditionsIntro: 'conditionsIntroFDD',
  limitOfLiabilityDefaultText: 'limitOfLiabilityDefaultTextFDD'
}

/** The standard texts as a quotation of this type sees them (FD&D variants replace the P&I ones). */
export function textsForType<T extends object>(texts: T, code?: string | null): T {
  if (code !== 'F') return texts
  const out = { ...texts } as Record<string, unknown>
  for (const [base, variant] of Object.entries(FDD_TEXT_VARIANTS)) {
    const v = out[variant]
    if (typeof v === 'string' && v.trim()) out[base] = v
  }
  return out as T
}
