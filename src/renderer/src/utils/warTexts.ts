import type { Quotation, WarSettings } from '../../../shared/types'

// War P&I excess (Section 1 + Section 2) wording. One fallback chain for the editor, the
// quotation export and the policy export: quotation field -> War Settings -> built-in default.

export const WAR_DEFAULT_SECTION1_TEXT =
  'Hull, Material, Machinery and Outfit Including War Protection and Indemnity and War Crew Liability up to Sum Insured'
export const WAR_DEFAULT_SECTION2_TEXT =
  'War Protection and Indemnity in excess of the Hull, Material, Machinery and Outfit'
export const WAR_DEFAULT_COMBINED_LIMIT_TEXT =
  'Combined sections 1 & 2 War Protection and Indemnity limit not to exceed {amount}.'

export function warSectionTexts(
  q: Pick<Quotation, 'warSection1Text' | 'warSection2Text' | 'warCombinedLimitText'>,
  ws: WarSettings | null | undefined
): { section1: string; section2: string; combinedLimit: string } {
  return {
    section1: q.warSection1Text || ws?.section1Text || WAR_DEFAULT_SECTION1_TEXT,
    section2: q.warSection2Text || ws?.section2Text || WAR_DEFAULT_SECTION2_TEXT,
    combinedLimit:
      q.warCombinedLimitText || ws?.combinedLimitText || WAR_DEFAULT_COMBINED_LIMIT_TEXT
  }
}
