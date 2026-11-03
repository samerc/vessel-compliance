// A policy follows its quotation until it is signed. Clauses, warranties and texts are read from
// the quotation at every export; what the converter copied onto the policy (premium,
// instalments, insured, the chosen subjectivities, survey warranty wording) is compared here.
// The baseline is what the quotation said when the policy was made (or last updated from it):
// only a change of the QUOTATION since then is offered, so the policy's own edits never count.
import type {
  PolicyDocument,
  PolicyDocInstalment,
  PolicyDocAddress,
  QuotationVessel
} from '../../../shared/types'
import {
  computePayablePremium,
  vesselTechnical,
  splitInstalments,
  addMonthsISO,
  round2,
  PremiumContext
} from '../../../shared/premium'
import { isPiLike } from '../../../shared/quotationTypes'
import { resolvePolicySurveyWarranty } from './surveyWarrantyText'
import { asArray, ok, isIpcError } from './ipc'

export interface QuotationBaseline {
  premium: number
  instalmentDays: number[]
  /** `entityId|role` of each insured */
  insured: string[]
  subjectivities: string[]
  surveyWarranties: string[]
}

/** What the quotation says now for one policy, with what is needed to apply it */
interface QuotationView {
  policyId: string
  baseline: QuotationBaseline
  insuredRows: { entityId: string; entityName: string; role: string; addressText: string }[]
  subjectivities: { id: string; text: string }[]
}

export type QuotationChangeKey =
  'premium' | 'instalments' | 'insured' | 'subjectivities' | 'surveyWarranties'

export interface QuotationChange {
  key: QuotationChangeKey
  label: string
  policyValue: string
  quotationValue: string
}

export interface QuotationChanges {
  changes: QuotationChange[]
  view: QuotationView
}

async function loadQuotationView(policy: PolicyDocument): Promise<QuotationView | null> {
  const qid = policy.quotationId
  const q = await window.api.getQuotation(qid)
  if (!q || isIpcError(q)) return null
  const code = q.quotationTypeCode || ''
  const [
    vesselsRaw,
    piAltsRaw,
    hullAltsRaw,
    lolRaw,
    discountsRaw,
    altPremsRaw,
    war,
    instalmentsRaw,
    assuredsRaw,
    entitiesRaw,
    addressesRaw,
    subjectivitiesRaw,
    surveysRaw
  ] = await Promise.all([
    window.api.getQuotationVessels(qid),
    window.api.piGetQuotationAlternatives(qid),
    window.api.hullGetQuotationAlternatives(qid),
    window.api.lolGetOptions(qid),
    window.api.quotationDiscountGetByQuotation(qid),
    code === 'H'
      ? window.api.hullGetAltVesselPremiums(qid)
      : isPiLike(code)
        ? window.api.piGetAltVesselPremiums(qid)
        : Promise.resolve([]),
    code === 'W' ? window.api.warGetSettings() : Promise.resolve(null),
    window.api.getQuotationInstalments(qid),
    window.api.getQuotationAssureds(qid),
    window.api.getEntities(),
    window.api.getEntityAddresses(),
    window.api.getQuotationSubjectivities(qid),
    window.api.quotationSurveyWarrantyGetAll(qid)
  ])
  const vessels = asArray(vesselsRaw)
  const piAlts = asArray(piAltsRaw)
  const hullAlts = asArray(hullAltsRaw)
  const lolOptions = asArray(lolRaw)
  const discounts = asArray(discountsRaw)
  const altPrems = asArray(altPremsRaw)
  const instalments = asArray(instalmentsRaw)
  const assureds = asArray(assuredsRaw)
  const entities = asArray(entitiesRaw)
  const addresses = asArray(addressesRaw)
  const subjectivities = asArray(subjectivitiesRaw)
  const surveys = asArray(surveysRaw)
  const qv: QuotationVessel | undefined = vessels.find(
    (v) => (v.vesselId || v.id) === policy.vesselId
  )
  if (!qv) return null

  // Premium: the converter's maths for this vessel and the policy's alternative / LOL option
  const altVesselPrems: Record<string, number> = {}
  for (const r of altPrems as {
    alternativeId: string
    quotationVesselId: string
    premiumAmount: number | null
  }[])
    if (r.premiumAmount != null)
      altVesselPrems[`${r.alternativeId}:${r.quotationVesselId}`] = Number(r.premiumAmount)
  const ctx: PremiumContext = {
    quotation: q,
    vessels,
    piAlts,
    hullAlts,
    lolOptions,
    altVesselPrems,
    discounts,
    warDefaults:
      war && !isIpcError(war)
        ? { rate: war.defaultRate, excessRate: war.defaultExcessRate }
        : undefined
  }
  const altId = policy.selectedAlternativeId || ''
  const premium = round2(
    computePayablePremium(
      vesselTechnical(ctx, qv, altId, policy.selectedLolOptionId || ''),
      q,
      discounts,
      qv
    )
  )

  // Insured: the quotation assureds for this vessel, each with its first address
  const entName = (id: string): string => entities.find((e) => e.id === id)?.name || ''
  const insuredRows = assureds
    .filter((a) => !a.vesselLabel || a.vesselLabel === qv.vesselLabel)
    .map((a) => ({
      entityId: a.entityId || '',
      entityName: a.name || (a.entityId ? entName(a.entityId) : ''),
      role: a.role || '',
      addressText:
        (a.entityId ? addresses.find((x) => x.entityId === a.entityId)?.addressLine1 : '') || ''
    }))

  // Survey warranties that apply to this vessel and alternative, in the policy's wording
  const surveyWarranties = surveys
    .slice()
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .filter(
      (sw) =>
        (!sw.alternativeId || !altId || sw.alternativeId === altId) &&
        (!Array.isArray(sw.vesselScope) ||
          sw.vesselScope.length === 0 ||
          vessels.length <= 1 ||
          sw.vesselScope.includes(qv.id))
    )
    .map((sw) => resolvePolicySurveyWarranty(sw))
    .filter((t) => t.trim())

  return {
    policyId: policy.id,
    baseline: {
      premium,
      instalmentDays: instalments
        .slice()
        .sort((a, b) => a.instalmentNumber - b.instalmentNumber)
        .map((i) => i.daysFromInception),
      insured: insuredRows.map((r) => `${r.entityId}|${r.role}`),
      subjectivities: subjectivities.map((s) => s.text),
      surveyWarranties
    },
    insuredRows,
    subjectivities: subjectivities.map((s) => ({ id: s.id, text: s.text }))
  }
}

function parseBaseline(raw: string | null | undefined): QuotationBaseline | null {
  if (!raw) return null
  try {
    const b = JSON.parse(raw)
    return b && typeof b.premium === 'number' ? (b as QuotationBaseline) : null
  } catch {
    return null
  }
}

async function storeBaseline(policyId: string, baseline: QuotationBaseline): Promise<void> {
  ok(await window.api.policyUpdate(policyId, { quotationBaseline: JSON.stringify(baseline) }))
}

/** Right after a conversion: what the quotation said, for every new policy */
export async function captureQuotationBaseline(policyId: string): Promise<void> {
  const policy = await window.api.policyGetById(policyId)
  if (!policy || isIpcError(policy)) return
  const view = await loadQuotationView(policy)
  if (view) await storeBaseline(policyId, view.baseline)
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
const money = (n: number, ccy?: string): string =>
  `${ccy || 'USD'} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const days = (d: number[]): string =>
  `${d.length} instalment${d.length === 1 ? '' : 's'}${d.length ? ` (day ${d.join(', ')})` : ''}`
const list = (items: string[]): string => (items.length ? items.join('; ') : 'none')

/**
 * The quotation's changes since the baseline. An unsigned policy without a baseline (made
 * before this check) takes the quotation as it is now and shows nothing.
 */
export async function findQuotationChanges(
  policy: PolicyDocument,
  instalments: PolicyDocInstalment[],
  addresses: PolicyDocAddress[]
): Promise<QuotationChanges | null> {
  const view = await loadQuotationView(policy)
  if (!view) return null
  const base = parseBaseline(policy.quotationBaseline)
  if (!base) {
    await storeBaseline(policy.id, view.baseline)
    return { changes: [], view }
  }
  const now = view.baseline
  const changes: QuotationChange[] = []
  if (Math.abs(now.premium - base.premium) >= 0.005)
    changes.push({
      key: 'premium',
      label: 'Premium',
      policyValue: money(
        policy.proRata && policy.perAnnumPremium ? policy.perAnnumPremium : policy.premiumAmount,
        policy.premiumCurrency
      ),
      quotationValue: money(now.premium, policy.premiumCurrency)
    })
  if (!same(now.instalmentDays, base.instalmentDays))
    changes.push({
      key: 'instalments',
      label: 'Instalments',
      policyValue: `${instalments.length} instalment${instalments.length === 1 ? '' : 's'}${
        instalments.length
          ? ` (due ${instalments
              .slice()
              .sort((a, b) => a.instalmentNumber - b.instalmentNumber)
              .map((i) => i.dueDate)
              .join(', ')})`
          : ''
      }`,
      quotationValue: days(now.instalmentDays)
    })
  if (!same([...now.insured].sort(), [...base.insured].sort()))
    changes.push({
      key: 'insured',
      label: 'Insured',
      policyValue: list(addresses.map((a) => `${a.entityName || ''} (${a.role})`)),
      quotationValue: list(view.insuredRows.map((r) => `${r.entityName} (${r.role})`))
    })
  // A policy keeping every subjectivity (no selection) already follows the quotation
  const added = view.subjectivities.filter((s) => !base.subjectivities.includes(s.text))
  if (policy.selectedSubjectivityIds && added.length > 0)
    changes.push({
      key: 'subjectivities',
      label: 'New subjectivities',
      policyValue: 'not on the policy',
      quotationValue: list(added.map((s) => s.text))
    })
  // Wording edited in the converter is stored on the policy; none stored = follows already
  if (policy.surveyWarrantyTexts && !same(now.surveyWarranties, base.surveyWarranties))
    changes.push({
      key: 'surveyWarranties',
      label: 'Survey warranties',
      policyValue: list(policy.surveyWarrantyTexts.map((w) => w.text)),
      quotationValue: list(now.surveyWarranties)
    })
  if (changes.length === 0 && !same(now, base)) await storeBaseline(policy.id, now)
  return { changes, view }
}

/** Applies the chosen changes; the rest are dismissed (the baseline moves to the quotation) */
export async function applyQuotationChanges(
  policy: PolicyDocument,
  instalments: PolicyDocInstalment[],
  found: QuotationChanges,
  keys: QuotationChangeKey[]
): Promise<void> {
  const { view } = found
  const now = view.baseline
  const fields: Record<string, unknown> = {}
  let premium = policy.premiumAmount
  if (keys.includes('premium')) {
    if (policy.proRata && policy.perAnnumPremium && policy.perAnnumPremium > 0) {
      premium = round2(now.premium * (policy.premiumAmount / policy.perAnnumPremium))
      fields.perAnnumPremium = now.premium
    } else premium = now.premium
    fields.premiumAmount = premium
  }
  if (keys.includes('subjectivities') && policy.selectedSubjectivityIds) {
    const base = parseBaseline(policy.quotationBaseline)
    const added = view.subjectivities
      .filter((s) => !(base?.subjectivities || []).includes(s.text))
      .map((s) => s.id)
    fields.selectedSubjectivityIds = [...new Set([...policy.selectedSubjectivityIds, ...added])]
  }
  if (keys.includes('surveyWarranties')) fields.surveyWarrantyTexts = null
  fields.quotationBaseline = JSON.stringify(now)
  ok(await window.api.policyUpdate(policy.id, fields))

  if (keys.includes('premium') || keys.includes('instalments')) {
    const sorted = instalments.slice().sort((a, b) => a.instalmentNumber - b.instalmentNumber)
    const dates = keys.includes('instalments')
      ? now.instalmentDays.map((d) => addMonthsISO(policy.inceptionDate || '', Math.round(d / 30)))
      : sorted.map((i) => i.dueDate)
    const amounts = splitInstalments(premium, dates.length)
    const pct = Number(policy.commissionPercent) || 0
    ok(
      await window.api.policySetInstalments(
        policy.id,
        dates.map((dueDate, i) => ({
          instalmentNumber: i + 1,
          dueDate,
          premiumAmount: amounts[i] || 0,
          commissionAmount: round2(((amounts[i] || 0) * pct) / 100),
          isNonRefundable: sorted[i]
            ? !!sorted[i].isNonRefundable
            : policy.nonRefundableType === 'first_instalment' && i === 0
        }))
      )
    )
  }
  if (keys.includes('insured')) ok(await window.api.policySetAddresses(policy.id, view.insuredRows))
}
