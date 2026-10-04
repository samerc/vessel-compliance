import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Ship,
  Calendar,
  DollarSign,
  Settings,
  Shield,
  ClipboardCheck,
  AlertTriangle,
  Pencil,
  Loader2,
  LayoutList,
  ListChecks
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import {
  Quotation,
  QuotationVessel,
  QuotationPIAlternative,
  QuotationHullAlternative,
  QuotationInstalment,
  FlagState,
  QuotationAgreedValueOption,
  QuotationDiscount
} from '../../../shared/types'
import {
  computePayablePremium,
  splitInstalments,
  addMonthsISO,
  round2,
  vesselTechnical,
  PremiumContext,
  PremiumLolOption
} from '../../../shared/premium'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'
import SectionOrderModal from './quotation-tabs/SectionOrderModal'
import { resolvePolicySurveyWarranty } from '../utils/surveyWarrantyText'
import { formatDate } from '../utils/dateUtils'
import { MoneyInput } from './quotation-tabs/shared'

interface PolicySetupWizardProps {
  quotationId: string
  onComplete: (policyId: string) => void
  onCancel: () => void
}

const DEFAULT_TIMEZONE_OPTIONS = ['Lebanon Standard Time', 'GMT', 'UTC', 'CET', 'EST', 'PST']

// Step id 6 (Subjectivities) is inserted between Details and Cards when the quotation has any;
// step id 7 (Survey Warranties) after it when the selected vessels have survey warranties.
const STEP_LABELS = [
  'Vessel',
  'Period',
  'Premium',
  'Details',
  'Cards',
  'Review',
  'Subjectivities',
  'Survey Warranties'
]
const STEP_ICONS = [Ship, Calendar, DollarSign, Settings, Shield, ClipboardCheck, ListChecks]

interface InsuredRow {
  entityId: string
  entityName: string // typed/selected name — may be a custom name with no matching entity
  role: string
  addressText: string
  addressLabel: string // internal name for a NEW address saved back to the entity
  addressId: string // id of a picked existing entity_address, '' when typing a new one
  isNew: boolean // true when addressText is a new address to save back to the entity
}

interface WizardData {
  // Step 1
  selectedVesselIds: string[]
  selectedAltId: string
  // Step 2
  inceptionDate: string
  inceptionTime: string
  expiryDate: string
  expiryTime: string
  timezone: string
  totalPremium: number
  // Payable premium per selected vessel (vesselId → amount). Each vessel becomes its own
  // policy, so a multi-vessel conversion must carry each vessel's own premium.
  vesselPremiums: Record<string, number>
  // Step 3
  instalmentDates: string[]
  instalmentAmounts: number[]
  // Non-refundable: same model as the quotation — 1st instalment OR a percentage (or none)
  nonRefundableType: 'first_instalment' | 'percentage' | null
  nonRefundablePercent: number
  outstandingPremiumEnabled: boolean
  outstandingPremiumText: string
  // Step 4
  commissionEnabled: boolean
  commissionPercent: number | ''
  bankId: string
  exchangeRate: number
  insuredByVessel: Record<string, InsuredRow[]> // vesselId → insured rows
  // Step 5
  blueCards: string[]
  blueCardNone: boolean
  blueCardAddressedTo: Record<string, string>
  blueCardInception: string
  blueCardExpiry: string
  blueCardOwners: Record<string, string> // cardType → entityId
  // LOL / Agreed Value Option selection
  selectedLolOptionId: string
  selectedAgreedValueOptionId: string
  // Per-policy section order override (null = use the policy-settings default for the type)
  sectionOrder: string[] | null
  // QR verification code toggle (P&I only; default from settings, off unless enabled)
  qrEnabled: boolean
  // Subjectivities kept for the resulting policy (quotation_subjectivity IDs). Empty = "NIL".
  selectedSubjectivityIds: string[]
  // Subjectivity compliance days printed on the policy (0 = prior inception)
  subjectivityDays: number
  // Survey warranty wording per vessel (converter vessel id -> warranty id -> text);
  // a missing entry uses the quotation's wording, '' removes the warranty
  surveyWarrantyEdits: Record<string, Record<string, string>>
}

interface SurveyWarrantyItem {
  id: string
  text: string
  vesselScope: string[] | null
  alternativeId: string | null
}

type LolOptionLite = PremiumLolOption

// Payable premium per selected vessel + the instalment amounts (summed over vessels).
function seedPremiums(
  ctx: PremiumContext,
  selectedIds: string[],
  altId: string,
  lolId: string,
  instalmentCount: number
): { vesselPremiums: Record<string, number>; totalPremium: number; instalmentAmounts: number[] } {
  const vesselPremiums: Record<string, number> = {}
  for (const vid of selectedIds) {
    const qv = ctx.vessels.find((v) => (v.vesselId || v.id) === vid)
    if (!qv) continue
    vesselPremiums[vid] = computePayablePremium(
      vesselTechnical(ctx, qv, altId, lolId),
      ctx.quotation,
      ctx.discounts,
      qv
    )
  }
  const totalPremium = round2(Object.values(vesselPremiums).reduce((s, a) => s + a, 0))
  return {
    vesselPremiums,
    totalPremium,
    instalmentAmounts: sumVesselInstalments(vesselPremiums, instalmentCount)
  }
}

/** safeHandle returns `{ error: true, message }` instead of throwing; null when the call succeeded. */
function ipcFailure(result: unknown): { message?: string } | null {
  if (result && typeof result === 'object' && 'error' in result && result.error) {
    const message = 'message' in result ? result.message : undefined
    return { message: typeof message === 'string' ? message : undefined }
  }
  return null
}

// Instalment due date: each 30 days = 1 calendar month from inception (month-end clamped)
function instalmentDueDate(inception: string, daysFromInception: number): string {
  return addMonthsISO(inception, Math.round(daysFromInception / 30))
}

/** When the inception date/time changed between `prev` and `next`: expiry = 1 year later at the
 *  same time (00:00 inception → 1 year minus 1 day at 23:59); a new inception date also
 *  recalculates the instalment due dates. */
function applyInceptionChange(
  prev: WizardData,
  next: WizardData,
  instalments: QuotationInstalment[]
): WizardData {
  if (!next.inceptionDate) return next
  let out = next
  if (next.inceptionDate !== prev.inceptionDate || next.inceptionTime !== prev.inceptionTime) {
    const oneYear = addMonthsISO(next.inceptionDate, 12)
    if (next.inceptionTime === '00:00') {
      const [y, m, d] = oneYear.split('-').map(Number)
      const exp = new Date(y, m - 1, d - 1)
      const expiryDate = `${exp.getFullYear()}-${String(exp.getMonth() + 1).padStart(2, '0')}-${String(exp.getDate()).padStart(2, '0')}`
      out = { ...out, expiryDate, expiryTime: '23:59' }
    } else {
      out = { ...out, expiryDate: oneYear, expiryTime: next.inceptionTime }
    }
  }
  if (next.inceptionDate !== prev.inceptionDate && instalments.length > 0) {
    const inception = next.inceptionDate
    out = {
      ...out,
      instalmentDates: instalments.map((inst) =>
        instalmentDueDate(inception, inst.daysFromInception)
      )
    }
  }
  return out
}

// Fleet-level instalment amounts = per-vessel splits added together
function sumVesselInstalments(vesselPremiums: Record<string, number>, count: number): number[] {
  const totals = Array.from({ length: count }, () => 0)
  for (const amt of Object.values(vesselPremiums)) {
    splitInstalments(amt, count).forEach((a, i) => {
      totals[i] += a
    })
  }
  return totals.map(round2)
}

/** A broker is on the business when the quotation's customer is a broker, a c/o name is set, or
 *  an insured carries a Broker role. Commission (and so a Credit Advice) only applies then. */
function quoteHasBroker(q: Quotation | null, rows: InsuredRow[]): boolean {
  if (!q) return false
  if (q.customerType === 'broker' && q.customerEntityId) return true
  if (q.coName && q.coName.trim()) return true
  return rows.some((r) => /broker/i.test(r.role || ''))
}

export default function PolicySetupWizard({
  quotationId,
  onComplete,
  onCancel
}: PolicySetupWizardProps): React.JSX.Element {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const { showSuccess, showError } = useToast()

  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(true)
  const [converting, setConverting] = useState(false)

  // Loaded data
  const [quotation, setQuotation] = useState<Quotation | null>(null)
  const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
  const [piAlts, setPiAlts] = useState<QuotationPIAlternative[]>([])
  const [hullAlts, setHullAlts] = useState<QuotationHullAlternative[]>([])
  const [instalments, setInstalments] = useState<QuotationInstalment[]>([])
  const [banks, setBanks] = useState<
    { id: string; name: string; details: string; order: number }[]
  >([])
  const [flagStates, setFlagStates] = useState<FlagState[]>([])
  const [timezoneOptions, setTimezoneOptions] = useState<string[]>(DEFAULT_TIMEZONE_OPTIONS)
  const [baseCurrency, setBaseCurrency] = useState('USD')

  // Wizard state
  const [data, setData] = useState<WizardData>({
    selectedVesselIds: [],
    selectedAltId: '',
    inceptionDate: '',
    inceptionTime: '12:00',
    expiryDate: '',
    expiryTime: '12:00',
    timezone: 'Lebanon Standard Time',
    totalPremium: 0,
    vesselPremiums: {},
    instalmentDates: [],
    instalmentAmounts: [],
    nonRefundableType: null,
    nonRefundablePercent: 0,
    outstandingPremiumEnabled: false,
    outstandingPremiumText: '',
    commissionEnabled: false,
    commissionPercent: '',
    bankId: '',
    exchangeRate: 1,
    insuredByVessel: {},
    blueCards: [],
    blueCardNone: false,
    blueCardAddressedTo: {},
    blueCardInception: '',
    blueCardExpiry: '',
    blueCardOwners: {},
    selectedLolOptionId: '',
    selectedAgreedValueOptionId: '',
    sectionOrder: null,
    qrEnabled: false,
    selectedSubjectivityIds: [],
    subjectivityDays: 7,
    surveyWarrantyEdits: {}
  })
  // The quotation's survey warranties (placeholders filled, policy wording)
  const [surveyItems, setSurveyItems] = useState<SurveyWarrantyItem[]>([])

  // Quotation subjectivities available to keep/uncheck in the wizard
  const [subjectivityItems, setSubjectivityItems] = useState<{ id: string; text: string }[]>([])

  const [lolOptions, setLolOptions] = useState<LolOptionLite[]>([])
  // Extra quotation discounts (beyond NCB/UPCC) + hull alternative × vessel premium matrix
  const [discounts, setDiscounts] = useState<QuotationDiscount[]>([])
  const [altVesselPrems, setAltVesselPrems] = useState<Record<string, number>>({})
  const [agreedValueOptions, setAgreedValueOptions] = useState<QuotationAgreedValueOption[]>([])
  // Insured editor data
  const [allEntities, setAllEntities] = useState<{ id: string; name: string }[]>([])
  const [entityAddrs, setEntityAddrs] = useState<
    Record<string, { id: string; addressLine1: string; label?: string }[]>
  >({})
  // Vessels of this quotation that already have a policy (multi-vessel: convert the rest later)
  const [convertedVesselIds, setConvertedVesselIds] = useState<string[]>([])
  const [showSectionOrder, setShowSectionOrder] = useState(false)

  const isPI = quotation?.quotationTypeCode === 'P'
  const allAlts = useMemo(() => [...piAlts, ...hullAlts], [piAlts, hullAlts])
  const hasAlts = allAlts.length > 1
  const isMultiVessel = qVessels.length > 1
  // More than one vessel being converted now → one policy per vessel, each with its own premium
  const isMultiSelection = data.selectedVesselIds.length > 1
  const hasBroker = useMemo(
    () => quoteHasBroker(quotation, Object.values(data.insuredByVessel || {}).flat()),
    [quotation, data.insuredByVessel]
  )

  // Determine which steps to show
  const steps = useMemo(() => {
    const s = [0, 1, 2, 3] // Vessel, Period, Instalments, Details
    if (subjectivityItems.length > 0) s.push(6) // Subjectivities (any type) when the quotation has any
    if (surveyItems.length > 0) s.push(7) // Survey warranties: wording can be edited per policy
    // Step 4 (Blue Cards) only for P&I
    if (isPI) s.push(4)
    s.push(5) // Review is always last
    return s
  }, [isPI, subjectivityItems.length, surveyItems.length])

  const currentStepIndex = steps.indexOf(currentStep)
  const isLastStep = currentStepIndex === steps.length - 1
  const isFirstStep = currentStepIndex === 0

  // A different quotation shows the loading state again (reset during render, not in the effect)
  const [loadedFor, setLoadedFor] = useState(quotationId)
  if (loadedFor !== quotationId) {
    setLoadedFor(quotationId)
    setLoading(true)
  }

  const loadData = useCallback(async () => {
    try {
      const [
        q,
        qv,
        bankData,
        instData,
        piAltsRes,
        hullAltsRes,
        fs,
        entRes,
        qaRes,
        eaRes,
        convRes,
        subjRes,
        swRes
      ] = await Promise.all([
        window.api.getQuotation(quotationId),
        window.api.getQuotationVessels(quotationId),
        window.api.bankGetAll(),
        window.api.getQuotationInstalments(quotationId),
        window.api.piGetQuotationAlternatives(quotationId),
        window.api.hullGetQuotationAlternatives(quotationId),
        window.api.getFlagStates(),
        window.api.getEntities(),
        window.api.getQuotationAssureds(quotationId),
        window.api.getEntityAddresses(),
        // Guard: preload may lag renderer on a hot-update (main/preload need a full rebuild)
        typeof window.api.policyGetConvertedVesselIds === 'function'
          ? window.api.policyGetConvertedVesselIds(quotationId)
          : Promise.resolve([]),
        window.api.getQuotationSubjectivities(quotationId),
        window.api.quotationSurveyWarrantyGetAll(quotationId)
      ])
      const alreadyConverted = Array.isArray(convRes) ? convRes : []
      setConvertedVesselIds(alreadyConverted)

      // Subjectivities: show the quotation's list, all kept by default
      const safeSubj = (Array.isArray(subjRes) ? subjRes : []).map((s) => ({
        id: s.id,
        text: s.text
      }))
      setSubjectivityItems(safeSubj)
      setSurveyItems(
        (Array.isArray(swRes) ? swRes : [])
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((sw) => ({
            id: sw.id,
            text: resolvePolicySurveyWarranty(sw),
            vesselScope: Array.isArray(sw.vesselScope) ? sw.vesselScope : null,
            alternativeId: sw.alternativeId || null
          }))
      )
      setData((d) => ({ ...d, selectedSubjectivityIds: safeSubj.map((s) => s.id) }))

      if (!q || ('error' in q && q.error)) {
        showError('Failed to load quotation')
        return
      }

      setQuotation(q as Quotation)
      const vessels = Array.isArray(qv) ? qv : []
      setQVessels(vessels)
      if (Array.isArray(bankData)) setBanks(bankData)
      const safeInstalments = Array.isArray(instData) ? instData : []
      setInstalments(safeInstalments)
      if (Array.isArray(fs)) setFlagStates(fs)

      const safePiAlts = Array.isArray(piAltsRes) ? piAltsRes : []
      const safeHullAlts = Array.isArray(hullAltsRes) ? hullAltsRes : []
      setPiAlts(safePiAlts)
      setHullAlts(safeHullAlts)

      // Insured editor: entities, per-entity address map, per-vessel insured rows (from quotation assureds)
      setAllEntities((Array.isArray(entRes) ? entRes : []).map((e) => ({ id: e.id, name: e.name })))
      const addrMap: Record<string, { id: string; addressLine1: string; label?: string }[]> = {}
      for (const a of Array.isArray(eaRes) ? eaRes : []) {
        if (!addrMap[a.entityId]) addrMap[a.entityId] = []
        addrMap[a.entityId].push({ id: a.id, addressLine1: a.addressLine1 || '', label: a.label })
      }
      setEntityAddrs(addrMap)
      const entName = (id: string): string =>
        (Array.isArray(entRes) ? entRes : []).find((e) => e.id === id)?.name || ''
      const safeQA = Array.isArray(qaRes) ? qaRes : []
      const insuredByVessel: Record<string, InsuredRow[]> = {}
      for (const v of vessels) {
        const vid = (v.vesselId || v.id) as string
        insuredByVessel[vid] = safeQA
          .filter((a) => !a.vesselLabel || a.vesselLabel === v.vesselLabel)
          .map((a): InsuredRow => {
            const firstAddr = ((a.entityId ? addrMap[a.entityId] : undefined) || [])[0]
            return {
              entityId: a.entityId || '',
              entityName: a.name || (a.entityId ? entName(a.entityId) : '') || '',
              role: a.role || '',
              addressText: firstAddr?.addressLine1 || '',
              addressLabel: '',
              addressId: firstAddr?.id || '',
              isNew: false
            }
          })
      }
      const allInsuredRows = Object.values(insuredByVessel).flat()
      const regOwner =
        allInsuredRows.find((r) => r.role.toLowerCase().includes('registered owner')) ||
        allInsuredRows[0]
      const defaultOwnerId = regOwner?.entityId || ''
      const defaultBlueCardOwners: Record<string, string> = {}
      for (const ct of ['BBC', 'WRC', 'MLC4.2', 'MLC2.5.2'])
        defaultBlueCardOwners[ct] = defaultOwnerId

      // Load LOL options and agreed value options
      let safeLolOptions: typeof lolOptions = []
      try {
        const [lolRes, avRes] = await Promise.all([
          window.api.lolGetOptions(quotationId),
          window.api.hullGetAgreedValueOptions(quotationId)
        ])
        if (Array.isArray(lolRes)) {
          safeLolOptions = lolRes
          setLolOptions(lolRes)
        }
        if (Array.isArray(avRes)) setAgreedValueOptions(avRes)
      } catch {
        /* ignore */
      }

      // Load custom timezones
      try {
        const tzSetting = await window.api.getSetting('policy_timezones')
        if (tzSetting) {
          const parsed = JSON.parse(tzSetting)
          if (Array.isArray(parsed) && parsed.length > 0) setTimezoneOptions(parsed)
        }
      } catch {
        /* use defaults */
      }

      // Load base currency
      try {
        const bcSetting = await window.api.getSetting('base_currency')
        if (bcSetting) setBaseCurrency(bcSetting)
      } catch {
        /* use default USD */
      }

      // Extra discounts + hull alternative × vessel premiums (both feed the payable maths)
      const quot = q as Quotation
      let safeDiscounts: QuotationDiscount[] = []
      const safeAltVesselPrems: Record<string, number> = {}
      try {
        const [discRes, avpRes] = await Promise.all([
          window.api.quotationDiscountGetByQuotation(quotationId),
          quot.quotationTypeCode === 'H'
            ? window.api.hullGetAltVesselPremiums(quotationId)
            : Promise.resolve([])
        ])
        if (Array.isArray(discRes)) safeDiscounts = discRes
        for (const r of Array.isArray(avpRes) ? avpRes : []) {
          if (r.premiumAmount != null)
            safeAltVesselPrems[`${r.alternativeId}:${r.quotationVesselId}`] = Number(
              r.premiumAmount
            )
        }
      } catch {
        /* non-critical — falls back to fleet-level premiums */
      }
      setDiscounts(safeDiscounts)
      setAltVesselPrems(safeAltVesselPrems)

      // Default alternative / LOL option = the first one (only when there is a real choice)
      const allAltsLocal = [...safePiAlts, ...safeHullAlts]
      const firstAltId = allAltsLocal.length > 1 ? allAltsLocal[0].id : ''
      const firstLolId =
        safeLolOptions.length > 0 && safeLolOptions.some((o) => o.premiumAmount != null)
          ? safeLolOptions[0].id
          : ''

      // Payable premium per vessel being converted (skip vessels that already have a policy),
      // so a multi-vessel conversion gives every policy its own premium and instalments.
      const initialSelection = vessels
        .map((v) => v.vesselId || v.id)
        .filter((id) => !alreadyConverted.includes(id))
      const seeded = seedPremiums(
        {
          quotation: quot,
          vessels,
          piAlts: safePiAlts,
          hullAlts: safeHullAlts,
          lolOptions: safeLolOptions,
          altVesselPrems: safeAltVesselPrems,
          discounts: safeDiscounts
        },
        initialSelection,
        firstAltId,
        firstLolId,
        safeInstalments.length
      )
      const payable = seeded.totalPremium
      let initDates: string[] = safeInstalments.map(() => '')
      const initAmounts = seeded.instalmentAmounts

      // Try to pre-fill inception/expiry from vessel's existing policy
      let inception = ''
      let expiry = ''
      const withVessel = vessels.filter((v) => v.vesselId)
      if (withVessel.length > 0) {
        try {
          const policies = await window.api.getVesselDynamicPolicies(withVessel[0].vesselId!)
          const endDate = resolveEffectivePolicyExpiry(policies)
          if (endDate) {
            inception = endDate
            // +1 year (string math, clamps 29 Feb → 28 Feb)
            expiry = addMonthsISO(endDate, 12)
          }
        } catch {
          /* ignore */
        }
      }

      // Calculate instalment dates from inception if we have both
      if (inception && safeInstalments.length > 0) {
        initDates = safeInstalments.map((inst) =>
          instalmentDueDate(inception, inst.daysFromInception)
        )
      }

      // Resolve commission from hierarchy: customer override → policy type default
      let resolvedCommission: number | '' = ''
      try {
        const customerId = quot.customerEntityId || null
        const typeId = quot.policyTypeId || quot.quotationTypeId
        if (typeId) {
          const comm = await window.api.commissionResolve(customerId, typeId)
          if (comm != null) resolvedCommission = comm
        }
      } catch (err) {
        console.warn('[PolicyWizard] Commission resolve failed:', err)
      }

      // QR default (P&I only) — settings toggle pre-fills the per-policy choice
      let qrDefault = false
      try {
        const isPICode = (quot.quotationTypeCode || '') === 'P'
        if (isPICode) qrDefault = (await window.api.getSetting('qr_default_enabled')) === 'true'
      } catch {
        /* default off */
      }

      setData((prev) =>
        applyInceptionChange(
          prev,
          {
            ...prev,
            // Don't pre-select vessels that already have a policy (avoids duplicate conversion)
            selectedVesselIds: initialSelection,
            selectedAltId: firstAltId,
            selectedLolOptionId: firstLolId,
            inceptionDate: inception,
            expiryDate: expiry,
            totalPremium: payable,
            vesselPremiums: seeded.vesselPremiums,
            instalmentDates: initDates,
            instalmentAmounts: initAmounts,
            nonRefundableType: (quot.nonRefundableType as WizardData['nonRefundableType']) || null,
            nonRefundablePercent: quot.nonRefundablePercent || 0,
            // No broker on the business = no commission by default (can still be ticked by hand)
            commissionEnabled:
              quoteHasBroker(quot, allInsuredRows) &&
              resolvedCommission !== '' &&
              Number(resolvedCommission) > 0,
            commissionPercent: resolvedCommission,
            insuredByVessel,
            outstandingPremiumEnabled: !!quot.outstandingPremiumEnabled,
            outstandingPremiumText: quot.outstandingPremiumText || '',
            blueCardInception: inception,
            blueCardExpiry: expiry,
            blueCardOwners: defaultBlueCardOwners,
            qrEnabled: qrDefault
          },
          safeInstalments
        )
      )
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [quotationId, showError])

  useEffect(() => {
    const run = async (): Promise<void> => {
      await loadData()
    }
    void run()
  }, [loadData])

  // Inception changes re-derive the expiry date/time and the instalment dates
  // (applied in the same update, see applyInceptionChange)
  const updateData = (partial: Partial<WizardData>): void => {
    setData((prev) => applyInceptionChange(prev, { ...prev, ...partial }, instalments))
  }

  // Default day-from-inception spacing per instalment count (mirrors PremiumTab)
  const instalmentDaysFor = (count: number, index: number): number => {
    const known: Record<number, number[]> = {
      1: [0],
      2: [0, 180],
      3: [0, 120, 240],
      4: [0, 90, 180, 270],
      12: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    }
    return known[count]?.[index] ?? Math.round((index * 360) / count)
  }

  // Change the number of instalments: rebuild dates (from inception) and split the premium evenly
  const changeInstalmentCount = (rawCount: number): void => {
    const count = Math.max(1, Math.min(24, Math.floor(rawCount) || 1))
    const newInstalments: QuotationInstalment[] = Array.from({ length: count }, (_, i) => ({
      id: `wiz-inst-${i}`,
      quotationId,
      instalmentNumber: i + 1,
      daysFromInception: instalmentDaysFor(count, i)
    }))
    const dates = data.inceptionDate
      ? newInstalments.map((inst) => instalmentDueDate(data.inceptionDate, inst.daysFromInception))
      : Array.from({ length: count }, () => '')
    const amounts = isMultiSelection
      ? sumVesselInstalments(data.vesselPremiums, count)
      : splitInstalments(data.totalPremium || 0, count)
    setInstalments(newInstalments)
    setData((prev) => ({ ...prev, instalmentDates: dates, instalmentAmounts: amounts }))
  }

  // Re-derive per-vessel payable premiums + instalment amounts for a selection / alternative / LOL
  const reseedPremiums = (
    selection: string[],
    altId: string,
    lolId: string
  ): Partial<WizardData> => {
    if (!quotation) return {}
    return seedPremiums(
      { quotation, vessels: qVessels, piAlts, hullAlts, lolOptions, altVesselPrems, discounts },
      selection,
      altId,
      lolId,
      data.instalmentDates.length
    )
  }
  const computePayable = (techPremium: number): number =>
    quotation ? computePayablePremium(techPremium, quotation, discounts) : techPremium

  // Hull technical premium (selected alternative, else quotation premium) — excludes IV
  const hullTechnical = (() => {
    const piAlt = piAlts.find((a) => a.id === data.selectedAltId)
    const hullAlt = hullAlts.find((a) => a.id === data.selectedAltId)
    const altPremium = piAlt?.premiumAmount ?? hullAlt?.premiumAmount ?? null
    return altPremium != null ? altPremium : quotation?.premiumAmount || 0
  })()

  // Named-assured options for blue cards — unique insured entities across selected vessels (Registered Owner first)
  const ownerOptions = (() => {
    const seen = new Set<string>()
    const opts: { id: string; name: string; role: string }[] = []
    for (const vid of data.selectedVesselIds) {
      for (const r of data.insuredByVessel[vid] || []) {
        if (!r.entityId || seen.has(r.entityId)) continue
        seen.add(r.entityId)
        opts.push({ id: r.entityId, name: r.entityName, role: r.role })
      }
    }
    opts.sort((a, b) => {
      const ao = a.role.toLowerCase().includes('registered owner') ? 0 : 1
      const bo = b.role.toLowerCase().includes('registered owner') ? 0 : 1
      return ao - bo
    })
    return opts
  })()

  const handleAltChange = (altId: string): void => {
    if (!quotation) return
    updateData({
      selectedAltId: altId,
      ...reseedPremiums(data.selectedVesselIds, altId, data.selectedLolOptionId)
    })
  }

  // Edit one vessel's payable premium (multi-vessel conversion) → re-split that vessel's instalments
  const updateVesselPremium = (vid: string, amount: number): void => {
    const vesselPremiums = { ...data.vesselPremiums, [vid]: round2(amount) }
    updateData({
      vesselPremiums,
      totalPremium: round2(Object.values(vesselPremiums).reduce((s, a) => s + a, 0)),
      instalmentAmounts: sumVesselInstalments(vesselPremiums, data.instalmentDates.length)
    })
  }

  const recalcPremiumFromInstalments = (amounts: number[]): void => {
    const sum = round2(amounts.reduce((s, a) => s + (a || 0), 0))
    const only = data.selectedVesselIds[0]
    updateData({
      instalmentAmounts: amounts,
      totalPremium: sum,
      ...(only ? { vesselPremiums: { [only]: sum } } : {})
    })
  }

  // Validation per step
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 0: // Vessel & Alternative
        if (data.selectedVesselIds.length === 0) return 'Select at least one vessel'
        if (hasAlts && !data.selectedAltId) return 'Please select an alternative'
        if (lolOptions.length > 1 && !data.selectedLolOptionId)
          return 'Please select a limit of liability option'
        return null
      case 1: // Period & Premium
        if (!data.inceptionDate) return 'Inception date is required'
        if (!data.expiryDate) return 'Expiry date is required'
        if (!data.inceptionTime) return 'Inception time is required'
        if (!data.expiryTime) return 'Expiry time is required'
        if (!data.timezone.trim()) return 'Timezone is required'
        if (data.totalPremium <= 0) return 'Premium must be greater than 0'
        return null
      case 2: // Instalments
        if (data.instalmentDates.some((d) => !d)) return 'All instalment dates are required'
        if (data.instalmentAmounts.some((a) => !a || a <= 0))
          return 'All instalment amounts must be greater than 0'
        if (isMultiSelection) {
          const zero = data.selectedVesselIds.find((vid) => !(data.vesselPremiums[vid] > 0))
          if (zero) {
            const qv = qVessels.find((v) => (v.vesselId || v.id) === zero)
            return `Premium for ${(qv?.name || qv?.vesselLabel || 'a vessel').toUpperCase()} must be greater than 0`
          }
        }
        return null
      case 3: // Details
        if (!data.bankId && banks.length > 0) return 'Please select a bank'
        return null
      case 4: // Blue Cards
        if (!data.blueCardNone && data.blueCards.length === 0)
          return 'Please select blue cards or choose "None"'
        return null
      default:
        return null
    }
  }

  const handleNext = (): void => {
    const error = validateStep(currentStep)
    if (error) {
      showError(error)
      return
    }
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) setCurrentStep(steps[nextIndex])
  }

  const handleBack = (): void => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) setCurrentStep(steps[prevIndex])
  }

  const goToStep = (step: number): void => {
    const targetIndex = steps.indexOf(step)
    if (targetIndex < 0) return
    // Only allow going to completed steps
    if (targetIndex < currentStepIndex) setCurrentStep(step)
  }

  const handleConvert = async (): Promise<void> => {
    if (!quotation) return
    // Validate all steps
    for (const step of steps.slice(0, -1)) {
      const error = validateStep(step)
      if (error) {
        showError(error)
        setCurrentStep(step)
        return
      }
    }

    setConverting(true)
    try {
      const commPct =
        data.commissionEnabled && typeof data.commissionPercent === 'number'
          ? data.commissionPercent
          : 0
      // Flatten the per-vessel insured lists into a single array with vesselId
      const insured = Object.entries(data.insuredByVessel).flatMap(([vesselId, rows]) =>
        (rows || [])
          .filter((r) => r.entityId || (r.entityName || '').trim())
          .map((r) => ({
            vesselId,
            entityId: r.entityId,
            entityName: (r.entityName || '').trim(),
            role: r.role,
            addressText: r.addressText || '',
            addressLabel: (r.addressLabel || '').trim(),
            isNewAddress: !!r.isNew
          }))
      )
      // Each vessel gets its own policy → its own premium + instalment split (same dates).
      // A single vessel keeps the instalment amounts exactly as edited in the wizard.
      const instCount = data.instalmentDates.length
      const perVessel: Record<string, { premiumAmount: number; instalmentAmounts: number[] }> = {}
      for (const vid of data.selectedVesselIds) {
        const prem = isMultiSelection ? data.vesselPremiums[vid] || 0 : data.totalPremium || 0
        perVessel[vid] = {
          premiumAmount: prem,
          instalmentAmounts: isMultiSelection
            ? splitInstalments(prem, instCount)
            : data.instalmentAmounts.slice(0, instCount)
        }
      }
      const result = await window.api.policyConvertFromQuotation(quotation.id, {
        vesselIds: data.selectedVesselIds,
        perVessel,
        inceptionDate: data.inceptionDate,
        inceptionTime: data.inceptionTime,
        expiryDate: data.expiryDate,
        expiryTime: data.expiryTime,
        timezone: data.timezone,
        instalments: data.instalmentDates.map((dueDate, i) => ({
          dueDate,
          premiumAmount: data.instalmentAmounts[i] || 0,
          commissionAmount:
            Math.round((((data.instalmentAmounts[i] || 0) * commPct) / 100) * 100) / 100,
          // Only the 1st instalment can be non-refundable (percentage is a policy-level note)
          isNonRefundable: data.nonRefundableType === 'first_instalment' && i === 0
        })),
        // Always store the wizard's explicit choice on the policy ('none' distinguishes it
        // from legacy NULL = inherit-from-quotation)
        nonRefundableType: data.nonRefundableType || 'none',
        nonRefundablePercent:
          data.nonRefundableType === 'percentage' ? data.nonRefundablePercent || 0 : null,
        commissionPercent: data.commissionEnabled ? commPct || null : null,
        bankId: data.bankId || null,
        showAddresses: true,
        blueCards: data.blueCardNone ? [] : data.blueCards,
        selectedAlternativeId: data.selectedAltId || null,
        exchangeRate: data.exchangeRate || 1,
        selectedLolOptionId: data.selectedLolOptionId || null,
        selectedAgreedValueOptionId: data.selectedAgreedValueOptionId || null,
        premiumAmount: data.totalPremium || null,
        sectionOrder: data.sectionOrder,
        qrEnabled: data.qrEnabled,
        insured,
        outstandingPremiumEnabled: data.outstandingPremiumEnabled,
        outstandingPremiumText: data.outstandingPremiumEnabled ? data.outstandingPremiumText : null,
        blueCardInception: data.blueCardInception || null,
        blueCardExpiry: data.blueCardExpiry || null,
        blueCardOwners: data.blueCardOwners,
        // Only send a selection when the quotation had subjectivities (step was shown);
        // otherwise null keeps legacy behavior (no subjectivities section).
        selectedSubjectivityIds: subjectivityItems.length > 0 ? data.selectedSubjectivityIds : null,
        subjectivityDays: data.subjectivityDays,
        // Final survey warranty wording per vessel (only when the quotation has any)
        surveyWarrantyTexts:
          surveyItems.length > 0
            ? Object.fromEntries(
                data.selectedVesselIds.map((vid) => [
                  vid,
                  surveyItemsForVessel(surveyItems, qVessels, vid, data.selectedAltId)
                    .map((sw) => ({
                      id: sw.id,
                      text: data.surveyWarrantyEdits[vid]?.[sw.id] ?? sw.text
                    }))
                    .filter((w) => w.text.trim())
                ])
              )
            : null
      })
      const failure = ipcFailure(result)
      if (failure) {
        showError(failure.message || 'Conversion failed')
        return
      }
      const policies = Array.isArray(result) ? result : []
      showSuccess(
        `${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} created successfully`
      )
      if (policies[0]?.id) onComplete(policies[0].id)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to convert to policy')
    } finally {
      setConverting(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    boxSizing: 'border-box'
  }

  const cardBg = isLight ? '#ffffff' : 'var(--bg-card)'

  if (loading) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <Loader2 size={32} className="spinner" style={{ color: 'var(--accent-primary)' }} />
        <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>
          Loading quotation data...
        </p>
      </div>
    )
  }

  if (!quotation) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>Failed to load quotation</p>
        <button onClick={onCancel} className="btn-secondary" style={{ marginTop: '12px' }}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Cancel link */}
      <button
        onClick={onCancel}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '16px',
          padding: 0
        }}
      >
        <ArrowLeft size={16} /> Back to Quotation
      </button>

      {/* Title */}
      <h1
        style={{
          fontSize: '1.5rem',
          margin: '0 0 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        <Shield size={24} color="var(--accent-primary)" />
        Policy Setup
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 24px' }}>
        {quotation.referenceNumber} — {quotation.quotationTypeName || quotation.quotationTypeCode}
      </p>

      {/* Progress Bar */}
      <div
        style={{
          background: cardBg,
          borderRadius: '14px',
          padding: '24px 32px',
          border: '1px solid var(--glass-border-color)',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {steps.map((step, idx) => {
            const StepIcon = STEP_ICONS[step]
            const isCompleted = idx < currentStepIndex
            const isCurrent = idx === currentStepIndex
            const isFuture = idx > currentStepIndex
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center' }}>
                {/* Step circle */}
                <div
                  onClick={() => (isCompleted ? goToStep(step) : undefined)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: isCompleted ? 'pointer' : 'default'
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: isCompleted
                        ? 'var(--accent-primary)'
                        : isCurrent
                          ? 'var(--accent-primary)'
                          : 'transparent',
                      border: isCurrent
                        ? '3px solid var(--accent-primary)'
                        : isCompleted
                          ? 'none'
                          : '2px solid var(--text-secondary)',
                      boxShadow: isCurrent
                        ? '0 0 0 4px rgba(var(--accent-primary-rgb), 0.2)'
                        : 'none',
                      color: isCompleted || isCurrent ? '#fff' : 'var(--text-secondary)',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isCompleted ? <Check size={16} /> : <StepIcon size={16} />}
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      color: isCurrent
                        ? 'var(--accent-primary)'
                        : isFuture
                          ? 'var(--text-secondary)'
                          : 'var(--text-primary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {STEP_LABELS[step]}
                  </span>
                </div>
                {/* Connector line */}
                {idx < steps.length - 1 && (
                  <div
                    style={{
                      width: '48px',
                      height: '2px',
                      margin: '0 8px',
                      marginBottom: '22px',
                      background:
                        idx < currentStepIndex ? 'var(--accent-primary)' : 'var(--glass-border)',
                      transition: 'background 0.2s'
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div
        style={{
          background: cardBg,
          borderRadius: '14px',
          padding: '28px',
          border: '1px solid var(--glass-border-color)',
          marginBottom: '24px',
          minHeight: '200px'
        }}
      >
        {currentStep === 0 && (
          <StepVesselAlternative
            qVessels={qVessels}
            allAlts={allAlts}
            hasAlts={hasAlts}
            isMultiVessel={isMultiVessel}
            data={data}
            quotation={quotation}
            isLight={isLight}
            lolOptions={lolOptions}
            agreedValueOptions={agreedValueOptions}
            convertedVesselIds={convertedVesselIds}
            onToggleVessel={(id) => {
              if (convertedVesselIds.includes(id)) return
              const newSelection = data.selectedVesselIds.includes(id)
                ? data.selectedVesselIds.filter((v) => v !== id)
                : [...data.selectedVesselIds, id]
              updateData({
                selectedVesselIds: newSelection,
                ...reseedPremiums(newSelection, data.selectedAltId, data.selectedLolOptionId)
              })
            }}
            onSelectAlt={handleAltChange}
            onSelectLolOption={(id) =>
              updateData({
                selectedLolOptionId: id,
                ...reseedPremiums(data.selectedVesselIds, data.selectedAltId, id)
              })
            }
            onSelectAgreedValueOption={(id) => updateData({ selectedAgreedValueOptionId: id })}
            labelStyle={labelStyle}
          />
        )}

        {currentStep === 1 && (
          <StepPeriodPremium
            data={data}
            timezoneOptions={timezoneOptions}
            onUpdate={updateData}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
          />
        )}

        {currentStep === 2 && (
          <StepInstalments
            data={data}
            quotation={quotation}
            isLight={isLight}
            onUpdate={updateData}
            recalcPremiumFromInstalments={recalcPremiumFromInstalments}
            onChangeCount={changeInstalmentCount}
            hullTechnical={hullTechnical}
            inputStyle={inputStyle}
            qVessels={qVessels}
            isMultiSelection={isMultiSelection}
            onUpdateVesselPremium={updateVesselPremium}
            computePayable={computePayable}
          />
        )}

        {currentStep === 3 && (
          <StepDetails
            data={data}
            banks={banks}
            hasBroker={hasBroker}
            premiumCurrency={quotation?.premiumCurrency || 'USD'}
            baseCurrency={baseCurrency}
            onUpdate={updateData}
            allEntities={allEntities}
            entityAddrs={entityAddrs}
            qVessels={qVessels}
            isLight={isLight}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
            onEditSectionOrder={() => setShowSectionOrder(true)}
          />
        )}

        {currentStep === 4 && (
          <StepBlueCards
            data={data}
            qVessels={qVessels}
            flagStates={flagStates}
            isLight={isLight}
            onUpdate={updateData}
            ownerOptions={ownerOptions}
            labelStyle={labelStyle}
          />
        )}

        {currentStep === 6 && (
          <StepSubjectivities
            items={subjectivityItems}
            selectedIds={data.selectedSubjectivityIds}
            subjectivityDays={data.subjectivityDays}
            isLight={isLight}
            onUpdate={updateData}
          />
        )}

        {currentStep === 7 && (
          <StepSurveyWarranties
            items={surveyItems}
            qVessels={qVessels}
            selectedVesselIds={data.selectedVesselIds}
            altId={data.selectedAltId}
            edits={data.surveyWarrantyEdits}
            onUpdate={updateData}
          />
        )}

        {currentStep === 5 && (
          <StepReview
            data={data}
            quotation={quotation}
            qVessels={qVessels}
            allAlts={allAlts}
            hasAlts={hasAlts}
            banks={banks}
            hasBroker={hasBroker}
            isPI={!!isPI}
            isLight={isLight}
            onGoToStep={setCurrentStep}
          />
        )}
      </div>

      {/* Navigation Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          {!isFirstStep && (
            <button
              onClick={handleBack}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px' }}
            >
              <ArrowLeft size={16} /> Back
            </button>
          )}
        </div>
        <div>
          {isLastStep ? (
            <button
              onClick={handleConvert}
              disabled={converting}
              className="btn-primary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 28px',
                fontSize: '0.95rem'
              }}
            >
              {converting ? <Loader2 size={18} className="spinner" /> : <Check size={18} />}
              Create Policy
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px' }}
            >
              Next <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>

      {showSectionOrder && quotation && (
        <SectionOrderModal
          quotation={{
            ...quotation,
            id: quotationId,
            quotationTypeCode: quotation.quotationTypeCode,
            sectionOrder: data.sectionOrder ?? undefined
          }}
          docLabel="policy"
          isLight={isLight}
          showSuccess={showSuccess}
          showError={showError}
          // Load defaults from the policy settings (not the quotation defaults)
          defaultsLoader={async (tc) => {
            try {
              const raw = await window.api.getSetting(`policy_section_order_defaults_${tc}`)
              return raw ? JSON.parse(raw) : []
            } catch {
              return []
            }
          }}
          // Don't persist here — just capture the order onto the wizard state
          persist={async (order) => {
            updateData({ sectionOrder: order })
          }}
          onClose={() => setShowSectionOrder(false)}
          onSave={() => setShowSectionOrder(false)}
        />
      )}
    </div>
  )
}

// ==================== Step Components ====================

function StepVesselAlternative({
  qVessels,
  allAlts,
  hasAlts,
  isMultiVessel,
  data,
  quotation,
  isLight,
  lolOptions,
  agreedValueOptions,
  convertedVesselIds,
  onToggleVessel,
  onSelectAlt,
  onSelectLolOption,
  onSelectAgreedValueOption,
  labelStyle
}: {
  qVessels: QuotationVessel[]
  allAlts: (QuotationPIAlternative | QuotationHullAlternative)[]
  hasAlts: boolean
  isMultiVessel: boolean
  data: WizardData
  quotation: Quotation
  isLight: boolean
  lolOptions: {
    id: string
    label: string | null
    amount: number
    currency: string
    premiumAmount: number | null
    order: number
  }[]
  agreedValueOptions: QuotationAgreedValueOption[]
  convertedVesselIds: string[]
  onToggleVessel: (id: string) => void
  onSelectAlt: (id: string) => void
  onSelectLolOption: (id: string) => void
  onSelectAgreedValueOption: (id: string) => void
  labelStyle: React.CSSProperties
}): React.JSX.Element {
  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Vessel & Alternative Selection</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        {isMultiVessel
          ? 'Select which vessels to create policies for. Each vessel gets its own policy.'
          : 'Confirm the vessel for this policy.'}
      </p>

      {/* Vessel list */}
      <div style={{ marginBottom: hasAlts ? '24px' : '0' }}>
        <label style={labelStyle}>Vessels</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {qVessels.map((v) => {
            const id = v.vesselId || v.id
            const isConverted = convertedVesselIds.includes(id)
            const selected = data.selectedVesselIds.includes(id)
            return (
              <label
                key={v.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: selected
                    ? '1.5px solid var(--accent-primary)'
                    : '1px solid var(--input-border)',
                  background: selected ? 'rgba(var(--accent-primary-rgb), 0.06)' : 'transparent',
                  cursor: isConverted ? 'not-allowed' : isMultiVessel ? 'pointer' : 'default',
                  opacity: isConverted ? 0.55 : 1,
                  transition: 'all 0.15s'
                }}
              >
                {isMultiVessel && (
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={isConverted}
                    onChange={() => onToggleVessel(id)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                  />
                )}
                {!isMultiVessel && (
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background:
                        'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Ship size={16} color="#fff" />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '0.9rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    {v.name || v.vesselLabel}
                    {isConverted && (
                      <span
                        style={{
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          textTransform: 'uppercase',
                          color: '#b464ff',
                          background: 'rgba(180,100,255,0.14)',
                          border: '1px solid rgba(180,100,255,0.35)',
                          borderRadius: '5px',
                          padding: '1px 6px'
                        }}
                      >
                        Converted
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '12px',
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      marginTop: '2px'
                    }}
                  >
                    {v.imoNumber && <span>IMO {v.imoNumber}</span>}
                    {v.vesselType && <span>{v.vesselType}</span>}
                  </div>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      {/* Alternative selection */}
      {hasAlts && (
        <div>
          <label style={labelStyle}>Select Alternative</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {allAlts.map((alt, idx) => (
              <button
                key={alt.id}
                onClick={() => onSelectAlt(alt.id)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border:
                    data.selectedAltId === alt.id
                      ? '2px solid var(--accent-primary)'
                      : '1px solid var(--input-border)',
                  background:
                    data.selectedAltId === alt.id
                      ? 'rgba(var(--accent-primary-rgb), 0.1)'
                      : 'transparent',
                  color:
                    data.selectedAltId === alt.id
                      ? 'var(--accent-primary)'
                      : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {alt.label || `Alternative ${idx + 1}`}
                {alt.premiumAmount != null
                  ? ` — ${quotation.premiumCurrency || 'USD'} ${alt.premiumAmount.toLocaleString()}`
                  : ''}
                {quotation.ivEnabled && quotation.ivPremiumAmount
                  ? ` + IV ${quotation.ivPremiumAmount.toLocaleString()}`
                  : ''}
              </button>
            ))}
          </div>
          {(quotation.ncbEnabled || quotation.upccEnabled) && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {quotation.ncbEnabled && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(34,197,94,0.1)',
                    color: isLight ? '#166534' : '#86efac',
                    fontWeight: 600
                  }}
                >
                  NCB {quotation.ncbDiscountPercent}%
                </span>
              )}
              {quotation.upccEnabled && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: 'rgba(59,130,246,0.1)',
                    color: isLight ? '#1e40af' : '#93c5fd',
                    fontWeight: 600
                  }}
                >
                  UPCC {quotation.upccDiscountPercent}%
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* LOL Option selection (P&I only, when multiple LOL options exist) */}
      {lolOptions.length > 1 && (
        <div style={{ marginTop: '24px' }}>
          <label style={labelStyle}>Select Limit of Liability</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {lolOptions.map((opt, idx) => (
              <button
                key={opt.id}
                onClick={() => onSelectLolOption(opt.id)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border:
                    data.selectedLolOptionId === opt.id
                      ? '2px solid var(--accent-primary)'
                      : '1px solid var(--input-border)',
                  background:
                    data.selectedLolOptionId === opt.id
                      ? 'rgba(var(--accent-primary-rgb), 0.1)'
                      : 'transparent',
                  color:
                    data.selectedLolOptionId === opt.id
                      ? 'var(--accent-primary)'
                      : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {opt.label || `LOL ${idx + 1}`} — {opt.currency} {opt.amount?.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Agreed Value Option selection (Hull, when multiple options exist) */}
      {agreedValueOptions.length > 1 && (
        <div style={{ marginTop: '24px' }}>
          <label style={labelStyle}>Select Agreed Value Option</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {agreedValueOptions.map((opt, idx) => (
              <button
                key={opt.id}
                onClick={() => onSelectAgreedValueOption(opt.id)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border:
                    data.selectedAgreedValueOptionId === opt.id
                      ? '2px solid var(--accent-primary)'
                      : '1px solid var(--input-border)',
                  background:
                    data.selectedAgreedValueOptionId === opt.id
                      ? 'rgba(var(--accent-primary-rgb), 0.1)'
                      : 'transparent',
                  color:
                    data.selectedAgreedValueOptionId === opt.id
                      ? 'var(--accent-primary)'
                      : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {opt.label || `Option ${idx + 1}`} — {opt.currency || 'USD'}{' '}
                {opt.amount?.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* IV is shown on the Premium step, not here */}
    </div>
  )
}

function StepPeriodPremium({
  data,
  timezoneOptions,
  onUpdate,
  labelStyle,
  inputStyle
}: {
  data: WizardData
  timezoneOptions: string[]
  onUpdate: (partial: Partial<WizardData>) => void
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
}): React.JSX.Element {
  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Period</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Set the policy inception and expiry dates.
      </p>

      {/* Inception */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          marginBottom: '16px'
        }}
      >
        <div>
          <label style={labelStyle}>Inception Date</label>
          <input
            type="date"
            value={data.inceptionDate}
            onChange={(e) => onUpdate({ inceptionDate: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Time</label>
          <input
            type="time"
            value={data.inceptionTime}
            onChange={(e) => onUpdate({ inceptionTime: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Timezone</label>
          <input
            type="text"
            list="wizard-tz-options"
            value={data.timezone}
            onChange={(e) => onUpdate({ timezone: e.target.value })}
            style={inputStyle}
            placeholder="Type or select..."
          />
          <datalist id="wizard-tz-options">
            {timezoneOptions.map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
        </div>
      </div>

      {/* Expiry */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div>
          <label style={labelStyle}>Expiry Date</label>
          <input
            type="date"
            value={data.expiryDate}
            onChange={(e) => onUpdate({ expiryDate: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Time</label>
          <input
            type="time"
            value={data.expiryTime}
            onChange={(e) => onUpdate({ expiryTime: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div />
      </div>
    </div>
  )
}

function StepInstalments({
  data,
  quotation,
  isLight,
  onUpdate,
  recalcPremiumFromInstalments,
  onChangeCount,
  hullTechnical,
  inputStyle,
  qVessels,
  isMultiSelection,
  onUpdateVesselPremium,
  computePayable
}: {
  data: WizardData
  quotation: Quotation
  isLight: boolean
  onUpdate: (partial: Partial<WizardData>) => void
  recalcPremiumFromInstalments: (amounts: number[]) => void
  onChangeCount: (count: number) => void
  hullTechnical: number
  inputStyle: React.CSSProperties
  qVessels: QuotationVessel[]
  isMultiSelection: boolean
  onUpdateVesselPremium: (vesselId: string, amount: number) => void
  computePayable: (tech: number) => number
}): React.JSX.Element {
  const labelUpper: React.CSSProperties = {
    fontSize: '0.7rem',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    marginBottom: '8px'
  }
  const count = data.instalmentDates.length

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Premium & Instalments</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Set the payable premium, the number of instalments, and review dates and amounts.
      </p>

      {/* Premium + number of instalments */}
      <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginBottom: '20px' }}>
        {isMultiSelection ? (
          <div style={{ flex: '1 1 320px', maxWidth: '420px' }}>
            <div style={labelUpper}>Payable Premium per Vessel</div>
            <div
              style={{
                border: '1px solid var(--table-border)',
                borderRadius: '10px',
                overflow: 'hidden'
              }}
            >
              {data.selectedVesselIds.map((vid) => {
                const qv = qVessels.find((v) => (v.vesselId || v.id) === vid)
                return (
                  <div
                    key={vid}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--table-border)'
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        textTransform: 'uppercase'
                      }}
                    >
                      {qv?.name || qv?.vesselLabel || vid}
                    </span>
                    <MoneyInput
                      value={data.vesselPremiums[vid]}
                      onChange={(val) => onUpdateVesselPremium(vid, val || 0)}
                      style={{
                        ...inputStyle,
                        width: '140px',
                        flex: 'none',
                        textAlign: 'right',
                        padding: '5px 8px'
                      }}
                      showZero
                    />
                  </div>
                )
              })}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'rgba(var(--accent-primary-rgb), 0.06)',
                  fontSize: '0.82rem'
                }}
              >
                <span style={{ fontWeight: 700 }}>Total</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                  {data.totalPremium.toLocaleString(undefined, { maximumFractionDigits: 2 })}{' '}
                  {quotation?.premiumCurrency || 'USD'}
                </span>
              </div>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              One policy per vessel — each vessel&apos;s premium is split over the instalments below
            </p>
          </div>
        ) : (
          <div>
            <div style={labelUpper}>Payable Premium</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '300px' }}>
              <MoneyInput
                value={data.totalPremium}
                onChange={(v) => {
                  const val = v || 0
                  const only = data.selectedVesselIds[0]
                  onUpdate({
                    totalPremium: val,
                    instalmentAmounts: splitInstalments(val, data.instalmentDates.length),
                    ...(only ? { vesselPremiums: { [only]: val } } : {})
                  })
                }}
                placeholder="Premium amount"
                style={{ ...inputStyle, flex: 1, textAlign: 'right' }}
              />
              <span
                style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}
              >
                {quotation?.premiumCurrency || 'USD'}
              </span>
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
              Changing premium will recalculate instalment amounts
            </p>
          </div>
        )}
        <div>
          <div style={labelUpper}>Number of Instalments</div>
          <input
            type="number"
            min={1}
            max={24}
            value={count || 1}
            onChange={(e) => onChangeCount(parseInt(e.target.value) || 1)}
            style={{ ...inputStyle, width: '120px', textAlign: 'right' }}
          />
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
            Regenerates dates & splits the premium evenly
          </p>
        </div>
      </div>

      {/* Hull + IV premium breakdown (Hull quotations with IV). Technical/Payable split
          only shown when there's an NCB/UPCC discount — otherwise a single amount. */}
      {quotation.ivEnabled &&
        (() => {
          const cp = computePayable
          const hasDiscount = cp(100) !== 100
          const cur = quotation.premiumCurrency || 'USD'
          const fmt = (n: number): string =>
            `${cur} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
          const rows = [
            { label: 'Hull', tech: hullTechnical, pay: cp(hullTechnical) },
            {
              label: 'IV',
              tech: quotation.ivPremiumAmount || 0,
              pay: cp(quotation.ivPremiumAmount || 0)
            }
          ]
          const totalTech = rows.reduce((s, r) => s + r.tech, 0)
          const totalPay = rows.reduce((s, r) => s + r.pay, 0)
          const cols = hasDiscount ? '1.2fr 1fr 1fr' : '1.2fr 1fr'
          return (
            <div
              style={{
                marginBottom: '20px',
                border: '1px solid var(--glass-border-color)',
                borderRadius: '10px',
                overflow: 'hidden',
                maxWidth: '540px'
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: cols,
                  padding: '8px 14px',
                  background: 'rgba(var(--accent-primary-rgb), 0.06)',
                  ...labelUpper,
                  marginBottom: 0
                }}
              >
                <span>Premium</span>
                {hasDiscount && <span style={{ textAlign: 'right' }}>Technical</span>}
                <span style={{ textAlign: 'right' }}>{hasDiscount ? 'Payable' : 'Amount'}</span>
              </div>
              {rows.map((r) => (
                <div
                  key={r.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: cols,
                    padding: '8px 14px',
                    fontSize: '0.85rem',
                    borderTop: '1px solid var(--table-border)'
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{r.label}</span>
                  {hasDiscount && (
                    <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {fmt(r.tech)}
                    </span>
                  )}
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>
                    {fmt(hasDiscount ? r.pay : r.tech)}
                  </span>
                </div>
              ))}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: cols,
                  padding: '8px 14px',
                  fontSize: '0.85rem',
                  borderTop: '1px solid var(--glass-border-color)',
                  background: 'rgba(var(--accent-primary-rgb), 0.04)'
                }}
              >
                <span style={{ fontWeight: 700 }}>Total</span>
                {hasDiscount && (
                  <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                    {fmt(totalTech)}
                  </span>
                )}
                <span
                  style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-primary)' }}
                >
                  {fmt(hasDiscount ? totalPay : totalTech)}
                </span>
              </div>
            </div>
          )
        })()}

      {count === 0 && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Full premium is due as a single payment on inception. Increase the count above to split it
          into instalments.
        </p>
      )}

      {count > 0 && (
        <>
          <div style={{ height: '1px', background: 'var(--glass-border)', margin: '0 0 16px' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.instalmentDates.map((date, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: '1px solid var(--table-border)',
                  background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)'
                }}
              >
                <span
                  style={{
                    fontSize: '0.82rem',
                    color: 'var(--text-secondary)',
                    minWidth: '32px',
                    fontWeight: 700,
                    background: 'rgba(var(--accent-primary-rgb), 0.1)',
                    padding: '2px 8px',
                    borderRadius: '6px',
                    textAlign: 'center'
                  }}
                >
                  #{i + 1}
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    const updated = [...data.instalmentDates]
                    updated[i] = e.target.value
                    onUpdate({ instalmentDates: updated })
                  }}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="number"
                  value={data.instalmentAmounts[i] || ''}
                  readOnly={isMultiSelection}
                  title={
                    isMultiSelection
                      ? 'Sum of the per-vessel instalments — edit the vessel premiums above'
                      : undefined
                  }
                  onChange={(e) => {
                    if (isMultiSelection) return
                    const updated = [...data.instalmentAmounts]
                    updated[i] = parseFloat(e.target.value) || 0
                    recalcPremiumFromInstalments(updated)
                  }}
                  placeholder="Amount"
                  style={{ ...inputStyle, width: '130px', flex: 'none', textAlign: 'right' }}
                />
                <span
                  style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '36px' }}
                >
                  {quotation.premiumCurrency || 'USD'}
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '12px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(var(--accent-primary-rgb), 0.06)'
            }}
          >
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Total
            </span>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
              {data.totalPremium.toLocaleString()} {quotation.premiumCurrency || 'USD'}
            </span>
          </div>

          {/* Non-refundable — 1st instalment OR a percentage (mirrors the quotation) */}
          <div style={{ marginTop: '16px' }}>
            <label style={labelUpper}>Non-Refundable</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(
                [
                  { key: null, label: 'None' },
                  { key: 'first_instalment', label: '1st Instalment' },
                  { key: 'percentage', label: 'Percentage' }
                ] as { key: WizardData['nonRefundableType']; label: string }[]
              ).map((opt) => {
                const active = data.nonRefundableType === opt.key
                return (
                  <button
                    key={String(opt.key)}
                    type="button"
                    onClick={() => onUpdate({ nonRefundableType: opt.key })}
                    style={{
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      fontWeight: active ? 700 : 400,
                      border: active
                        ? '2px solid var(--accent-primary)'
                        : '1px solid var(--input-border)',
                      background: active ? 'rgba(var(--accent-primary-rgb), 0.08)' : 'transparent',
                      color: active ? 'var(--accent-primary)' : 'var(--text-secondary)'
                    }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
            {data.nonRefundableType === 'percentage' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={data.nonRefundablePercent || ''}
                  onChange={(e) =>
                    onUpdate({ nonRefundablePercent: parseFloat(e.target.value) || 0 })
                  }
                  placeholder="e.g. 25"
                  style={{ ...inputStyle, width: '160px' }}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  % of premium is non-refundable
                </span>
              </div>
            )}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
              Each 30 days from inception equals 1 calendar month.
            </p>
          </div>
        </>
      )}

      {/* Outstanding premium notice — toggle + editable text (overrides the quotation for this policy) */}
      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid var(--glass-border-color)'
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontSize: '0.88rem',
            marginBottom: data.outstandingPremiumEnabled ? '8px' : 0
          }}
        >
          <input
            type="checkbox"
            checked={data.outstandingPremiumEnabled}
            onChange={(e) => onUpdate({ outstandingPremiumEnabled: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
          />
          Show outstanding-premium notice on the policy
        </label>
        {data.outstandingPremiumEnabled && (
          <textarea
            value={data.outstandingPremiumText}
            onChange={(e) => onUpdate({ outstandingPremiumText: e.target.value })}
            rows={2}
            placeholder="All outstanding premium to be settled prior inception"
            style={{ ...inputStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
          />
        )}
      </div>
    </div>
  )
}

function StepDetails({
  data,
  banks,
  hasBroker,
  premiumCurrency,
  baseCurrency,
  onUpdate,
  allEntities,
  entityAddrs,
  qVessels,
  isLight,
  labelStyle,
  inputStyle,
  onEditSectionOrder
}: {
  data: WizardData
  banks: { id: string; name: string; details: string; order: number }[]
  hasBroker: boolean
  premiumCurrency: string
  baseCurrency: string
  onUpdate: (partial: Partial<WizardData>) => void
  allEntities: { id: string; name: string }[]
  entityAddrs: Record<string, { id: string; addressLine1: string; label?: string }[]>
  qVessels: QuotationVessel[]
  isLight: boolean
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
  onEditSectionOrder: () => void
}): React.JSX.Element {
  const sameAsBase = premiumCurrency.toUpperCase() === baseCurrency.toUpperCase()
  const vesselIds = data.selectedVesselIds
  const [activeVid, setActiveVid] = useState(vesselIds[0] || '')
  const vid = vesselIds.includes(activeVid) ? activeVid : vesselIds[0] || ''
  const rows = data.insuredByVessel[vid] || []
  const setRows = (newRows: InsuredRow[]): void =>
    onUpdate({ insuredByVessel: { ...data.insuredByVessel, [vid]: newRows } })
  const updateRow = (idx: number, patch: Partial<InsuredRow>): void =>
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const addRow = (): void =>
    setRows([
      ...rows,
      {
        entityId: '',
        entityName: '',
        role: '',
        addressText: '',
        addressLabel: '',
        addressId: '',
        isNew: false
      }
    ])
  const removeRow = (idx: number): void => setRows(rows.filter((_, i) => i !== idx))
  // Typed value matches an existing entity → link it (and default its address); otherwise keep as a custom name
  const onEntityInput = (idx: number, text: string): void => {
    const match = allEntities.find((e) => e.name.toLowerCase() === text.trim().toLowerCase())
    if (match) {
      const first = (entityAddrs[match.id] || [])[0]
      updateRow(idx, {
        entityId: match.id,
        entityName: match.name,
        addressText: first?.addressLine1 || '',
        addressId: first?.id || '',
        isNew: false
      })
    } else {
      updateRow(idx, { entityId: '', entityName: text, addressId: '', isNew: false })
    }
  }
  const onAddrChange = (idx: number, r: InsuredRow, val: string): void => {
    if (val === '__new__') {
      updateRow(idx, { addressId: '', isNew: true, addressText: '' })
      return
    }
    const a = (entityAddrs[r.entityId] || []).find((x) => x.id === val)
    updateRow(idx, { addressId: val, isNew: false, addressText: a?.addressLine1 || '' })
  }
  const vesselName = (id: string): string => {
    const v = qVessels.find((q) => (q.vesselId || q.id) === id)
    return v ? v.name || v.vesselLabel || id : id
  }
  const cellInput: React.CSSProperties = { ...inputStyle, padding: '6px 8px', fontSize: '0.82rem' }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Additional Details</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Configure commission, bank, and the insured on the policy.
      </p>

      {/* Commission — toggle to include/skip */}
      <div style={{ marginBottom: '20px' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            cursor: 'pointer',
            fontSize: '0.88rem',
            marginBottom: data.commissionEnabled ? '8px' : 0
          }}
        >
          <input
            type="checkbox"
            checked={data.commissionEnabled}
            onChange={(e) => onUpdate({ commissionEnabled: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
          />
          Include commission{hasBroker ? ' (broker — generates Credit Advice)' : ''}
        </label>
        {!hasBroker && (
          <div
            style={{
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              margin: '-2px 0 8px 26px'
            }}
          >
            No broker on this business, so commission is off by default.
          </div>
        )}
        {data.commissionEnabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              value={data.commissionPercent}
              onChange={(e) =>
                onUpdate({
                  commissionPercent: e.target.value === '' ? '' : parseFloat(e.target.value)
                })
              }
              min={0}
              max={100}
              step={0.01}
              placeholder="e.g. 15"
              style={{ ...inputStyle, width: '160px' }}
            />
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>%</span>
          </div>
        )}
      </div>

      {/* Exchange Rate */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>
          Exchange Rate ({premiumCurrency} to {baseCurrency})
        </label>
        <input
          type="number"
          value={data.exchangeRate}
          onChange={(e) => onUpdate({ exchangeRate: parseFloat(e.target.value) || 1 })}
          min={0}
          step={0.000001}
          readOnly={sameAsBase}
          style={{
            ...inputStyle,
            width: '200px',
            ...(sameAsBase ? { opacity: 0.6, cursor: 'not-allowed' } : {})
          }}
        />
        {sameAsBase && (
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Same as base currency — rate fixed at 1
          </p>
        )}
      </div>

      {/* Bank */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Bank</label>
        {banks.length > 0 ? (
          <select
            value={data.bankId}
            onChange={(e) => onUpdate({ bankId: e.target.value })}
            style={inputStyle}
          >
            <option value="">Select bank...</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
            No banks configured
          </p>
        )}
      </div>

      {/* Insured & Addresses */}
      <div>
        <label style={labelStyle}>Insured & Addresses</label>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          These appear on the policy. Pick an existing address or add a new one (a new address is
          saved back to the entity).
        </p>
        {vesselIds.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
            {vesselIds.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveVid(id)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  fontWeight: id === vid ? 700 : 400,
                  border:
                    id === vid
                      ? '2px solid var(--accent-primary)'
                      : '1px solid var(--input-border)',
                  background: id === vid ? 'rgba(var(--accent-primary-rgb), 0.08)' : 'transparent',
                  color: id === vid ? 'var(--accent-primary)' : 'var(--text-secondary)'
                }}
              >
                {vesselName(id)}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map((r, idx) => {
            const addrs = entityAddrs[r.entityId] || []
            return (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--table-border)',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)'
                }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1fr auto',
                    gap: '8px',
                    alignItems: 'center'
                  }}
                >
                  <input
                    type="text"
                    list={`wiz-ent-${vid}-${idx}`}
                    value={r.entityName}
                    onChange={(e) => onEntityInput(idx, e.target.value)}
                    placeholder="Type to search or add a name…"
                    style={cellInput}
                  />
                  <datalist id={`wiz-ent-${vid}-${idx}`}>
                    {allEntities.map((e) => (
                      <option key={e.id} value={e.name} />
                    ))}
                  </datalist>
                  <input
                    type="text"
                    value={r.role}
                    onChange={(e) => updateRow(idx, { role: e.target.value })}
                    placeholder="Role (e.g. Registered Owners)"
                    style={cellInput}
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    title="Remove"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--danger)',
                      padding: '4px',
                      fontSize: '0.9rem'
                    }}
                  >
                    ✕
                  </button>
                </div>
                {!r.entityId && (r.entityName || '').trim() && (
                  <p
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--accent-primary)',
                      margin: '4px 0 0'
                    }}
                  >
                    Custom insured — not linked to an existing entity.
                  </p>
                )}
                <div style={{ marginTop: '8px' }}>
                  {r.entityId && (
                    <select
                      value={r.isNew ? '__new__' : r.addressId}
                      onChange={(e) => onAddrChange(idx, r, e.target.value)}
                      style={{ ...cellInput, width: '100%' }}
                    >
                      {addrs.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.addressLine1}
                          {a.label ? ` (${a.label})` : ''}
                        </option>
                      ))}
                      {addrs.length === 0 && !r.isNew && <option value="">No saved address</option>}
                      <option value="__new__">+ New address…</option>
                    </select>
                  )}
                  {(r.isNew || !r.entityId) && (
                    <>
                      {r.entityId && (
                        <input
                          type="text"
                          value={r.addressLabel}
                          onChange={(e) => updateRow(idx, { addressLabel: e.target.value })}
                          placeholder="Address name (internal, optional)"
                          style={{ ...cellInput, width: '100%', marginTop: '6px' }}
                        />
                      )}
                      <textarea
                        value={r.addressText}
                        onChange={(e) =>
                          updateRow(idx, {
                            addressText: e.target.value,
                            isNew: !!r.entityId,
                            addressId: ''
                          })
                        }
                        rows={2}
                        placeholder="Full address…"
                        style={{
                          ...cellInput,
                          width: '100%',
                          marginTop: '6px',
                          resize: 'vertical',
                          fontFamily: 'inherit'
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {rows.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No insured on this vessel yet.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="btn-secondary"
          style={{ marginTop: '10px', padding: '5px 14px', fontSize: '0.8rem' }}
        >
          + Add insured
        </button>
      </div>

      {/* Section order — override the policy-settings default for this policy */}
      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid var(--glass-border-color)'
        }}
      >
        <label style={labelStyle}>Section Order</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onEditSectionOrder}
            className="btn-secondary"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              fontSize: '0.82rem'
            }}
          >
            <LayoutList size={14} /> {data.sectionOrder ? 'Edit Section Order' : 'Reorder Sections'}
          </button>
          <span
            style={{
              fontSize: '0.75rem',
              color: data.sectionOrder ? 'var(--accent-primary)' : 'var(--text-secondary)'
            }}
          >
            {data.sectionOrder
              ? 'Custom order for this policy'
              : 'Using the default order for this type'}
          </span>
          {data.sectionOrder && (
            <button
              type="button"
              onClick={() => onUpdate({ sectionOrder: null })}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: '0.75rem',
                textDecoration: 'underline'
              }}
            >
              Reset to default
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function StepBlueCards({
  data,
  qVessels,
  flagStates,
  isLight,
  onUpdate,
  ownerOptions,
  labelStyle
}: {
  data: WizardData
  qVessels: QuotationVessel[]
  flagStates: FlagState[]
  isLight: boolean
  onUpdate: (partial: Partial<WizardData>) => void
  ownerOptions: { id: string; name: string; role: string }[]
  labelStyle: React.CSSProperties
}): React.JSX.Element {
  // Find the vessel's flag state for ratification checks
  const vesselFlagStates = useMemo(() => {
    const result: { vesselName: string; flagState: FlagState | null }[] = []
    for (const v of qVessels) {
      if (v.flag) {
        const fs = flagStates.find((f) => f.name === v.flag || f.iso3Code === v.flag)
        result.push({ vesselName: v.name || v.vesselLabel, flagState: fs || null })
      } else {
        result.push({ vesselName: v.name || v.vesselLabel, flagState: null })
      }
    }
    return result
  }, [qVessels, flagStates])

  const primaryFlag = vesselFlagStates[0]?.flagState

  const toggleCard = (card: string): void => {
    const current = data.blueCards
    const updated = current.includes(card) ? current.filter((c) => c !== card) : [...current, card]
    onUpdate({ blueCards: updated, blueCardNone: false })
  }

  const setNone = (): void => {
    onUpdate({
      blueCardNone: !data.blueCardNone,
      blueCards: !data.blueCardNone ? [] : data.blueCards
    })
  }

  const bbcWarning = data.blueCards.includes('BBC') && primaryFlag && !primaryFlag.ratifiedBunker
  const wrcWarning = data.blueCards.includes('WRC') && primaryFlag && !primaryFlag.ratifiedWreck

  const ratifiedBunkerFlags = useMemo(
    () => flagStates.filter((f) => f.ratifiedBunker),
    [flagStates]
  )
  const ratifiedWreckFlags = useMemo(() => flagStates.filter((f) => f.ratifiedWreck), [flagStates])

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.88rem',
    boxSizing: 'border-box'
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Blue Cards</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
        Select which blue cards to issue for this P&I policy.
      </p>

      {/* Blue-card period (may be shorter than the policy period) */}
      {!data.blueCardNone && (
        <div style={{ marginBottom: '18px' }}>
          <label style={labelStyle}>Blue-card period</label>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div
                style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}
              >
                Inception
              </div>
              <input
                type="date"
                value={data.blueCardInception}
                onChange={(e) => onUpdate({ blueCardInception: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div>
              <div
                style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '4px' }}
              >
                Expiry
              </div>
              <input
                type="date"
                value={data.blueCardExpiry}
                onChange={(e) => onUpdate({ blueCardExpiry: e.target.value })}
                style={inputStyle}
              />
            </div>
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Defaults to the policy period. Set a shorter period if the cards are issued for less
            than the policy term.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* None option */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: data.blueCardNone
              ? '1.5px solid var(--text-secondary)'
              : '1px solid var(--input-border)',
            background: data.blueCardNone
              ? isLight
                ? 'rgba(0,0,0,0.03)'
                : 'rgba(255,255,255,0.03)'
              : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          <input
            type="radio"
            checked={data.blueCardNone}
            onChange={setNone}
            style={{ width: '16px', height: '16px', accentColor: 'var(--text-secondary)' }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            None
          </span>
        </label>

        {/* Card options — always visible so selecting a card clears "None" and you never get locked */}
        <div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
            <button
              onClick={() => {
                const all = ['BBC', 'WRC', 'MLC4.2', 'MLC2.5.2']
                onUpdate({ blueCards: all, blueCardNone: false })
              }}
              className="btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            >
              Select All
            </button>
            <button
              onClick={() => onUpdate({ blueCards: [] })}
              className="btn-secondary"
              style={{ padding: '4px 12px', fontSize: '0.75rem' }}
            >
              Clear
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {['BBC', 'WRC', 'MLC4.2', 'MLC2.5.2'].map((card) => (
              <label
                key={card}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  border: data.blueCards.includes(card)
                    ? '1.5px solid var(--accent-primary)'
                    : '1px solid var(--input-border)',
                  background: data.blueCards.includes(card)
                    ? 'rgba(var(--accent-primary-rgb), 0.06)'
                    : 'transparent',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                <input
                  type="checkbox"
                  checked={data.blueCards.includes(card)}
                  onChange={() => toggleCard(card)}
                  style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                />
                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{card}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Named assured per card (defaults to Registered Owner) */}
      {!data.blueCardNone && data.blueCards.length > 0 && ownerOptions.length > 0 && (
        <div style={{ marginTop: '18px' }}>
          <label style={labelStyle}>Named assured on each card</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.blueCards.map((card) => (
              <div
                key={card}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr',
                  gap: '10px',
                  alignItems: 'center'
                }}
              >
                <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{card}</span>
                <select
                  value={data.blueCardOwners[card] || ''}
                  onChange={(e) =>
                    onUpdate({ blueCardOwners: { ...data.blueCardOwners, [card]: e.target.value } })
                  }
                  style={inputStyle}
                >
                  {ownerOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                      {o.role ? ` — ${o.role}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Defaults to the Registered Owner.
          </p>
        </div>
      )}

      {/* BBC ratification warning */}
      {bbcWarning && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(255,180,30,0.1)',
            border: '1px solid rgba(255,180,30,0.3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={16} color="#ffb020" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffb020' }}>
              Flag {primaryFlag.name} has not ratified the Bunker Convention
            </span>
          </div>
          <label style={labelStyle}>Issue BBC to:</label>
          <select
            value={data.blueCardAddressedTo['BBC'] || ''}
            onChange={(e) =>
              onUpdate({
                blueCardAddressedTo: { ...data.blueCardAddressedTo, BBC: e.target.value }
              })
            }
            style={inputStyle}
          >
            <option value="">Select flag state...</option>
            {ratifiedBunkerFlags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.iso3Code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* WRC ratification warning */}
      {wrcWarning && (
        <div
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(255,180,30,0.1)',
            border: '1px solid rgba(255,180,30,0.3)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={16} color="#ffb020" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffb020' }}>
              Flag {primaryFlag.name} has not ratified the Wreck Removal Convention
            </span>
          </div>
          <label style={labelStyle}>Issue WRC to:</label>
          <select
            value={data.blueCardAddressedTo['WRC'] || ''}
            onChange={(e) =>
              onUpdate({
                blueCardAddressedTo: { ...data.blueCardAddressedTo, WRC: e.target.value }
              })
            }
            style={inputStyle}
          >
            <option value="">Select flag state...</option>
            {ratifiedWreckFlags.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} ({f.iso3Code})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* QR verification code toggle (P&I policy) */}
      <div
        style={{
          marginTop: '22px',
          paddingTop: '16px',
          borderTop: '1px solid var(--table-border)'
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            border: data.qrEnabled
              ? '1.5px solid var(--accent-primary)'
              : '1px solid var(--input-border)',
            background: data.qrEnabled ? 'rgba(var(--accent-primary-rgb), 0.06)' : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          <input
            type="checkbox"
            checked={data.qrEnabled}
            onChange={(e) => onUpdate({ qrEnabled: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
            Include QR verification code in the policy
          </span>
        </label>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
          Embeds a verification QR code on the closing page of the exported P&amp;I policy. Requires
          a verification URL configured in Policy Settings &rarr; QR Verification.
        </p>
      </div>
    </div>
  )
}

/** Survey warranties that apply to one converter vessel id (vessel scope = quotation vessel ids) */
function surveyItemsForVessel(
  items: SurveyWarrantyItem[],
  qVessels: QuotationVessel[],
  vid: string,
  altId: string
): SurveyWarrantyItem[] {
  const qv = qVessels.find((v) => (v.vesselId || v.id) === vid)
  return items.filter(
    (sw) =>
      (!sw.alternativeId || !altId || sw.alternativeId === altId) &&
      (!sw.vesselScope ||
        sw.vesselScope.length === 0 ||
        qVessels.length <= 1 ||
        (qv ? sw.vesselScope.includes(qv.id) : true))
  )
}

function StepSurveyWarranties({
  items,
  qVessels,
  selectedVesselIds,
  altId,
  edits,
  onUpdate
}: {
  items: SurveyWarrantyItem[]
  qVessels: QuotationVessel[]
  selectedVesselIds: string[]
  altId: string
  edits: Record<string, Record<string, string>>
  onUpdate: (partial: Partial<WizardData>) => void
}): React.JSX.Element {
  const setText = (vid: string, id: string, text: string): void =>
    onUpdate({ surveyWarrantyEdits: { ...edits, [vid]: { ...(edits[vid] || {}), [id]: text } } })
  const resetText = (vid: string, id: string): void => {
    const forVessel = { ...(edits[vid] || {}) }
    delete forVessel[id]
    onUpdate({ surveyWarrantyEdits: { ...edits, [vid]: forVessel } })
  }
  const nameOf = (vid: string): string => {
    const qv = qVessels.find((v) => (v.vesselId || v.id) === vid)
    return (qv?.name || qv?.vesselLabel || 'Vessel').toUpperCase()
  }
  return (
    <div>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>Survey Warranties</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
        The wording printed on the policy. Edit it as needed; clearing a box removes that warranty
        from this policy. The quotation is not changed.
      </p>
      {selectedVesselIds.map((vid) => {
        const list = surveyItemsForVessel(items, qVessels, vid, altId)
        return (
          <div key={vid} style={{ marginBottom: '18px' }}>
            {selectedVesselIds.length > 1 && (
              <div style={{ fontWeight: 700, fontSize: '0.85rem', margin: '0 0 8px' }}>
                M/V {nameOf(vid)}
              </div>
            )}
            {list.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                No survey warranties for this vessel.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {list.map((sw) => {
                  const edited = edits[vid]?.[sw.id]
                  const value = edited ?? sw.text
                  return (
                    <div key={sw.id}>
                      <textarea
                        value={value}
                        rows={Math.min(6, Math.max(2, Math.ceil(value.length / 90)))}
                        onChange={(e) => setText(vid, sw.id, e.target.value)}
                        style={{
                          width: '100%',
                          resize: 'vertical',
                          fontFamily: 'inherit',
                          fontSize: '0.85rem',
                          opacity: value.trim() ? 1 : 0.6
                        }}
                        placeholder="Removed from this policy"
                      />
                      {edited != null && (
                        <button
                          type="button"
                          onClick={() => resetText(vid, sw.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            fontSize: '0.75rem',
                            textDecoration: 'underline',
                            padding: 0
                          }}
                        >
                          Restore the quotation wording
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function StepSubjectivities({
  items,
  selectedIds,
  subjectivityDays,
  isLight,
  onUpdate
}: {
  items: { id: string; text: string }[]
  selectedIds: string[]
  subjectivityDays: number
  isLight: boolean
  onUpdate: (partial: Partial<WizardData>) => void
}): React.JSX.Element {
  const stripHtml = (s: string): string =>
    (s || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&nbsp;/g, ' ')
      .trim()
  const setSelected = (ids: string[]): void =>
    onUpdate({ selectedSubjectivityIds: items.filter((i) => ids.includes(i.id)).map((i) => i.id) })
  const toggle = (id: string): void => {
    const set = new Set(selectedIds)
    set.has(id) ? set.delete(id) : set.add(id)
    setSelected([...set])
  }
  const allChecked = items.length > 0 && selectedIds.length === items.length

  return (
    <div>
      <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem' }}>Subjectivities</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
        Uncheck any subjectivity you don&apos;t want on this policy. Kept items render exactly as in
        the quotation. If none are kept, the policy shows <strong>NIL</strong> in this section.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          Subjectivities to be complied with within
        </label>
        <input
          type="number"
          min={0}
          value={subjectivityDays}
          onChange={(e) =>
            onUpdate({ subjectivityDays: Math.max(0, parseInt(e.target.value, 10) || 0) })
          }
          style={{ width: '80px' }}
        />
        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          days (
          {subjectivityDays === 0
            ? 'prints "prior inception"'
            : `prints "within ${subjectivityDays} days"`}
          )
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setSelected(allChecked ? [] : items.map((i) => i.id))}
          style={{
            padding: '5px 12px',
            borderRadius: '6px',
            fontSize: '0.78rem',
            cursor: 'pointer',
            border: '1px solid var(--input-border)',
            background: 'transparent',
            color: 'var(--text-secondary)'
          }}
        >
          {allChecked ? 'Clear all' : 'Select all'}
        </button>
        <span
          style={{
            fontSize: '0.78rem',
            color: selectedIds.length === 0 ? 'var(--danger)' : 'var(--text-secondary)'
          }}
        >
          {selectedIds.length} of {items.length} kept
          {selectedIds.length === 0 ? ' — will show NIL' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map((it) => {
          const checked = selectedIds.includes(it.id)
          return (
            <label
              key={it.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                border: `1px solid ${checked ? 'var(--accent-primary)' : 'var(--input-border)'}`,
                background: checked
                  ? isLight
                    ? 'rgba(var(--accent-primary-rgb), 0.06)'
                    : 'rgba(var(--accent-primary-rgb), 0.10)'
                  : 'transparent'
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(it.id)}
                style={{ marginTop: '2px' }}
              />
              <span
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-primary)',
                  textDecoration: checked ? 'none' : 'line-through',
                  opacity: checked ? 1 : 0.55
                }}
              >
                {stripHtml(it.text)}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function StepReview({
  data,
  quotation,
  qVessels,
  allAlts,
  hasAlts,
  banks,
  isPI,
  isLight,
  onGoToStep
}: {
  data: WizardData
  quotation: Quotation
  qVessels: QuotationVessel[]
  allAlts: (QuotationPIAlternative | QuotationHullAlternative)[]
  hasAlts: boolean
  banks: { id: string; name: string; details: string; order: number }[]
  hasBroker: boolean
  isPI: boolean
  isLight: boolean
  onGoToStep: (step: number) => void
}): React.JSX.Element {
  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.8px',
    textTransform: 'uppercase',
    color: 'var(--text-secondary)',
    marginBottom: '6px'
  }

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px',
    borderRadius: '10px',
    border: '1px solid var(--table-border)',
    background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)',
    marginBottom: '12px'
  }

  const editLink = (step: number): React.JSX.Element => (
    <button
      onClick={() => onGoToStep(step)}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--accent-primary)',
        fontSize: '0.75rem',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: 0
      }}
    >
      <Pencil size={12} /> Edit
    </button>
  )

  const selectedAlt = allAlts.find((a) => a.id === data.selectedAltId)
  const selectedBank = banks.find((b) => b.id === data.bankId)

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Review & Confirm</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Please review all details before creating the policy.
      </p>

      {/* Vessels */}
      <div style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <span style={{ ...labelStyle, marginBottom: 0 }}>Vessels</span>
          {editLink(0)}
        </div>
        {qVessels
          .filter((v) => data.selectedVesselIds.includes(v.vesselId || v.id))
          .map((v) => (
            <div key={v.id} style={{ fontSize: '0.88rem', marginBottom: '2px' }}>
              <strong>{v.name || v.vesselLabel}</strong>
              {v.imoNumber && (
                <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  IMO {v.imoNumber}
                </span>
              )}
            </div>
          ))}
      </div>

      {/* Alternative */}
      {hasAlts && selectedAlt && (
        <div style={sectionStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <span style={{ ...labelStyle, marginBottom: 0 }}>Alternative</span>
            {editLink(0)}
          </div>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            {selectedAlt.label || 'Alternative'}
            {selectedAlt.premiumAmount != null
              ? ` — ${quotation.premiumCurrency || 'USD'} ${selectedAlt.premiumAmount.toLocaleString()}`
              : ''}
          </span>
        </div>
      )}

      {/* Period */}
      <div style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <span style={{ ...labelStyle, marginBottom: 0 }}>Period</span>
          {editLink(1)}
        </div>
        <div style={{ fontSize: '0.88rem' }}>
          <strong>{formatDate(data.inceptionDate) || data.inceptionDate}</strong>{' '}
          {data.inceptionTime} &rarr;{' '}
          <strong>{formatDate(data.expiryDate) || data.expiryDate}</strong> {data.expiryTime}
          <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>
            ({data.timezone})
          </span>
        </div>
      </div>

      {/* Premium & Instalments */}
      <div style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <span style={{ ...labelStyle, marginBottom: 0 }}>Premium & Instalments</span>
          {editLink(2)}
        </div>
        <div
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: 'var(--accent-primary)',
            marginBottom: '10px'
          }}
        >
          {data.totalPremium.toLocaleString()} {quotation.premiumCurrency || 'USD'}
        </div>
        {data.selectedVesselIds.length > 1 && (
          <div style={{ fontSize: '0.82rem', marginBottom: '10px' }}>
            {data.selectedVesselIds.map((vid) => {
              const qv = qVessels.find((v) => (v.vesselId || v.id) === vid)
              return (
                <div
                  key={vid}
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}
                >
                  <span style={{ textTransform: 'uppercase' }}>
                    {qv?.name || qv?.vesselLabel || vid}
                  </span>
                  <span style={{ fontWeight: 600 }}>
                    {(data.vesselPremiums[vid] || 0).toLocaleString()}{' '}
                    {quotation.premiumCurrency || 'USD'}
                  </span>
                </div>
              )
            })}
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              One policy per vessel. Instalments below are fleet totals.
            </div>
          </div>
        )}
        {data.instalmentDates.length > 0 && (
          <div style={{ fontSize: '0.82rem' }}>
            {data.instalmentDates.map((date, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '3px 0',
                  borderBottom:
                    i < data.instalmentDates.length - 1 ? '1px solid var(--table-border)' : 'none'
                }}
              >
                <span style={{ minWidth: '28px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  #{i + 1}
                </span>
                <span style={{ flex: 1 }}>{date}</span>
                <span style={{ fontWeight: 600 }}>
                  {(data.instalmentAmounts[i] || 0).toLocaleString()}{' '}
                  {quotation.premiumCurrency || 'USD'}
                </span>
                {data.nonRefundableType === 'first_instalment' && i === 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255,77,77,0.1)',
                      color: 'var(--danger)',
                      fontWeight: 600
                    }}
                  >
                    NR
                  </span>
                )}
              </div>
            ))}
            {data.nonRefundableType === 'percentage' && data.nonRefundablePercent > 0 && (
              <div
                style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}
              >
                {data.nonRefundablePercent}% of premium is non-refundable
              </div>
            )}
          </div>
        )}
      </div>

      {/* Details */}
      <div style={sectionStyle}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}
        >
          <span style={{ ...labelStyle, marginBottom: 0 }}>Details</span>
          {editLink(3)}
        </div>
        <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div>
            Commission:{' '}
            <strong>
              {data.commissionEnabled && typeof data.commissionPercent === 'number'
                ? `${data.commissionPercent}%`
                : 'None'}
            </strong>
          </div>
          <div>
            Bank: <strong>{selectedBank?.name || 'Not selected'}</strong>
          </div>
          <div>
            Outstanding premium:{' '}
            <strong>{data.outstandingPremiumEnabled ? 'Shown' : 'Hidden'}</strong>
          </div>
        </div>
      </div>

      {/* Blue Cards */}
      {isPI && (
        <div style={sectionStyle}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <span style={{ ...labelStyle, marginBottom: 0 }}>Blue Cards</span>
            {editLink(4)}
          </div>
          <div style={{ fontSize: '0.88rem' }}>
            {data.blueCardNone ? (
              <span style={{ color: 'var(--text-secondary)' }}>None</span>
            ) : data.blueCards.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {data.blueCards.map((card) => (
                  <span
                    key={card}
                    style={{
                      padding: '3px 10px',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      background: 'rgba(var(--accent-primary-rgb), 0.1)',
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {card}
                  </span>
                ))}
              </div>
            ) : (
              <span style={{ color: 'var(--text-secondary)' }}>Not configured</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
