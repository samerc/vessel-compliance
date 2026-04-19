import { useState, useEffect, useMemo, useCallback } from 'react'
import { ArrowLeft, ArrowRight, Check, Ship, Calendar, DollarSign, Settings, Shield, ClipboardCheck, AlertTriangle, Pencil, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { Quotation, QuotationVessel, QuotationPIAlternative, QuotationHullAlternative, QuotationInstalment, FlagState, QuotationAgreedValueOption } from '../../../shared/types'
import { resolveEffectivePolicyExpiry } from '../utils/policyUtils'

interface PolicySetupWizardProps {
  quotationId: string
  onComplete: (policyId: string) => void
  onCancel: () => void
}

const DEFAULT_TIMEZONE_OPTIONS = [
  'Lebanon Standard Time',
  'GMT',
  'UTC',
  'CET',
  'EST',
  'PST'
]

const STEP_LABELS = ['Vessel', 'Period', 'Premium', 'Details', 'Cards', 'Review']
const STEP_ICONS = [Ship, Calendar, DollarSign, Settings, Shield, ClipboardCheck]

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
  // Step 3
  instalmentDates: string[]
  instalmentAmounts: number[]
  instalmentNonRefundable: boolean[]
  // Step 4
  commissionPercent: number | ''
  bankId: string
  showAddresses: boolean
  exchangeRate: number
  // Step 5
  blueCards: string[]
  blueCardNone: boolean
  blueCardAddressedTo: Record<string, string>
  // LOL / Agreed Value Option selection
  selectedLolOptionId: string
  selectedAgreedValueOptionId: string
}

export default function PolicySetupWizard({ quotationId, onComplete, onCancel }: PolicySetupWizardProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
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
  const [banks, setBanks] = useState<{ id: string; name: string; details: string; order: number }[]>([])
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
    instalmentDates: [],
    instalmentAmounts: [],
    instalmentNonRefundable: [],
    commissionPercent: '',
    bankId: '',
    showAddresses: false,
    exchangeRate: 1,
    blueCards: [],
    blueCardNone: false,
    blueCardAddressedTo: {},
    selectedLolOptionId: '',
    selectedAgreedValueOptionId: ''
  })

  const [lolOptions, setLolOptions] = useState<{ id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]>([])
  const [agreedValueOptions, setAgreedValueOptions] = useState<QuotationAgreedValueOption[]>([])

  const isPI = quotation?.quotationTypeCode === 'P'
  const allAlts = useMemo(() => [...piAlts, ...hullAlts], [piAlts, hullAlts])
  const hasAlts = allAlts.length > 1
  const isMultiVessel = qVessels.length > 1
  const hasBroker = !!quotation?.coName

  // Determine which steps to show
  const steps = useMemo(() => {
    const s = [0, 1, 2, 3] // Vessel, Period, Instalments, Details
    // Step 4 (Blue Cards) only for P&I
    if (isPI) s.push(4)
    s.push(5) // Review is always last
    return s
  }, [isPI])

  const currentStepIndex = steps.indexOf(currentStep)
  const isLastStep = currentStepIndex === steps.length - 1
  const isFirstStep = currentStepIndex === 0

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [q, qv, bankData, instData, piAltsRes, hullAltsRes, fs] = await Promise.all([
        window.api.getQuotation(quotationId),
        window.api.getQuotationVessels(quotationId),
        window.api.bankGetAll(),
        window.api.getQuotationInstalments(quotationId),
        window.api.piGetQuotationAlternatives(quotationId),
        window.api.hullGetQuotationAlternatives(quotationId),
        window.api.getFlagStates()
      ])

      if (!q || (q as any).error) {
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

      // Load LOL options and agreed value options
      let safeLolOptions: typeof lolOptions = []
      try {
        const [lolRes, avRes] = await Promise.all([
          window.api.lolGetOptions(quotationId),
          window.api.hullGetAgreedValueOptions(quotationId)
        ])
        if (Array.isArray(lolRes)) { safeLolOptions = lolRes; setLolOptions(lolRes) }
        if (Array.isArray(avRes)) setAgreedValueOptions(avRes)
      } catch { /* ignore */ }

      // Load custom timezones
      try {
        const tzSetting = await window.api.getSetting('policy_timezones')
        if (tzSetting) {
          const parsed = JSON.parse(tzSetting)
          if (Array.isArray(parsed) && parsed.length > 0) setTimezoneOptions(parsed)
        }
      } catch { /* use defaults */ }

      // Load base currency
      try {
        const bcSetting = await window.api.getSetting('base_currency')
        if (bcSetting) setBaseCurrency(bcSetting)
      } catch { /* use default USD */ }

      // Calculate payable premium — use per-vessel premium when multi-vessel
      const quot = q as Quotation
      let techPremium = quot.premiumAmount || 0

      // War excess: premium = Section 1 + Section 2 for the vessel
      if (quot.quotationTypeCode === 'W' && quot.warExcessEnabled && vessels.length > 0) {
        const v = vessels[0]
        const s1Rate = quot.premiumRate || 0
        const s2Rate = quot.warExcessRate || 0
        const s1Amt = v.agreedValue ?? quot.agreedValue ?? 0
        const s2Amt = (v as any).warExcessAmount ?? quot.warExcessAmount ?? 0
        const s1Prem = (v as any).warSection1Premium ?? Math.round(s1Amt * s1Rate / 100 * 100) / 100
        const s2Prem = (v as any).warSection2Premium ?? Math.round((s2Amt - s1Amt) * s2Rate / 100 * 100) / 100
        techPremium = s1Prem + s2Prem
      } else if (vessels.length > 1) {
        // Multi-vessel: use first vessel's premium (each vessel gets its own policy)
        const firstVesselPrem = vessels[0]?.premiumAmount || 0
        if (firstVesselPrem > 0) techPremium = firstVesselPrem
      } else if (vessels.length === 1) {
        const singlePrem = vessels[0]?.premiumAmount || 0
        if (singlePrem > 0) techPremium = singlePrem
      }
      const allAltsLocal = [...safePiAlts, ...safeHullAlts]
      let firstAltId = ''
      let firstLolId = ''
      // LOL options: use first option's premium if available
      if (safeLolOptions.length > 0 && safeLolOptions.some(o => o.premiumAmount != null)) {
        firstLolId = safeLolOptions[0].id
        const lolPrem = safeLolOptions[0].premiumAmount
        if (lolPrem != null && lolPrem > 0) techPremium = lolPrem
      }
      // P&I/Hull alternatives: use first alternative's premium
      if (allAltsLocal.length > 1) {
        firstAltId = allAltsLocal[0].id
        const firstAlt = allAltsLocal[0]
        if (firstAlt.premiumAmount) {
          techPremium = firstAlt.premiumAmount
          if (quot.ivEnabled && quot.ivPremiumAmount) techPremium += quot.ivPremiumAmount
        }
      }
      let payable = techPremium
      if (quot.ncbEnabled && quot.ncbDiscountPercent) payable = payable * (1 - quot.ncbDiscountPercent / 100)
      if (quot.upccEnabled && quot.upccDiscountPercent) payable = payable * (1 - quot.upccDiscountPercent / 100)
      payable = Math.round(payable * 100) / 100

      // Calculate initial instalment amounts
      const count = safeInstalments.length
      let initDates: string[] = []
      let initAmounts: number[] = []
      let initNR: boolean[] = []
      if (count > 0) {
        const perInstalment = Math.round((payable / count) * 100) / 100
        initAmounts = safeInstalments.map((_, i) => {
          if (i === 0) return Math.round((payable - perInstalment * (count - 1)) * 100) / 100
          return perInstalment
        })
        initDates = safeInstalments.map(() => '')
        initNR = safeInstalments.map((_, i) => i === 0 && !!quot.nonRefundableType)
      }

      // Try to pre-fill inception/expiry from vessel's existing policy
      let inception = ''
      let expiry = ''
      const withVessel = vessels.filter(v => v.vesselId)
      if (withVessel.length > 0) {
        try {
          const policies = await window.api.getVesselDynamicPolicies(withVessel[0].vesselId!)
          const endDate = resolveEffectivePolicyExpiry(policies)
          if (endDate) {
            inception = endDate
            // Add 1 year using string math (no timezone issues)
            const parts = endDate.split('-')
            const yr = parseInt(parts[0], 10) + 1
            expiry = `${yr}-${parts[1]}-${parts[2]}`
          }
        } catch { /* ignore */ }
      }

      // Calculate instalment dates from inception if we have both
      if (inception && safeInstalments.length > 0) {
        initDates = safeInstalments.map(inst => {
          const [y, mo, day] = inception.split('-').map(Number)
          const months = Math.round(inst.daysFromInception / 30)
          const d = new Date(y, mo - 1 + months, day)
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        })
      }

      // Resolve commission from hierarchy: customer override → policy type default
      let resolvedCommission: number | '' = ''
      try {
        const customerId = quot.customerEntityId || null
        const policyTypeId = quot.policyTypeId
        if (policyTypeId) {
          const comm = await window.api.commissionResolve(customerId, policyTypeId)
          if (comm != null) resolvedCommission = comm
        }
      } catch { /* ignore */ }

      setData(prev => ({
        ...prev,
        selectedVesselIds: vessels.map(v => v.vesselId || v.id),
        selectedAltId: firstAltId,
        selectedLolOptionId: firstLolId,
        inceptionDate: inception,
        expiryDate: expiry,
        totalPremium: payable,
        instalmentDates: initDates,
        instalmentAmounts: initAmounts,
        instalmentNonRefundable: initNR,
        commissionPercent: resolvedCommission
      }))
    } catch (err: any) {
      showError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }, [quotationId])

  useEffect(() => { loadData() }, [loadData])

  // Recalculate instalment dates when inception date changes
  useEffect(() => {
    if (!data.inceptionDate || instalments.length === 0) return
    const dates = instalments.map(inst => {
      const [y, m, day] = data.inceptionDate.split('-').map(Number)
      const months = Math.round(inst.daysFromInception / 30)
      const newMonth = m - 1 + months
      const d = new Date(y, newMonth, day)
      const yr = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const dy = String(d.getDate()).padStart(2, '0')
      return `${yr}-${mo}-${dy}`
    })
    setData(prev => ({ ...prev, instalmentDates: dates }))
  }, [data.inceptionDate, instalments])

  const updateData = (partial: Partial<WizardData>) => {
    setData(prev => ({ ...prev, ...partial }))
  }

  const computePayable = (techPremium: number): number => {
    if (!quotation) return techPremium
    let pay = techPremium
    if (quotation.ncbEnabled && quotation.ncbDiscountPercent) pay = pay * (1 - quotation.ncbDiscountPercent / 100)
    if (quotation.upccEnabled && quotation.upccDiscountPercent) pay = pay * (1 - quotation.upccDiscountPercent / 100)
    return Math.round(pay * 100) / 100
  }

  const handleAltChange = (altId: string) => {
    if (!quotation) return
    const piAlt = piAlts.find(a => a.id === altId)
    const hullAlt = hullAlts.find(a => a.id === altId)
    const altPremium = piAlt?.premiumAmount ?? hullAlt?.premiumAmount ?? null
    let tech = altPremium != null ? altPremium : (quotation.premiumAmount || 0)
    if (quotation.ivEnabled && quotation.ivPremiumAmount) tech += quotation.ivPremiumAmount
    const pay = computePayable(tech)
    const count = data.instalmentAmounts.length
    let newAmounts = data.instalmentAmounts
    if (count > 0) {
      const perInstalment = Math.round((pay / count) * 100) / 100
      newAmounts = data.instalmentAmounts.map((_, i) => {
        if (i === 0) return Math.round((pay - perInstalment * (count - 1)) * 100) / 100
        return perInstalment
      })
    }
    updateData({ selectedAltId: altId, totalPremium: pay, instalmentAmounts: newAmounts })
  }

  const recalcPremiumFromInstalments = (amounts: number[]) => {
    const sum = amounts.reduce((s, a) => s + (a || 0), 0)
    updateData({ instalmentAmounts: amounts, totalPremium: Math.round(sum * 100) / 100 })
  }

  // Validation per step
  const validateStep = (step: number): string | null => {
    switch (step) {
      case 0: // Vessel & Alternative
        if (data.selectedVesselIds.length === 0) return 'Select at least one vessel'
        if (hasAlts && !data.selectedAltId) return 'Please select an alternative'
        if (lolOptions.length > 1 && !data.selectedLolOptionId) return 'Please select a limit of liability option'
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
        if (data.instalmentDates.some(d => !d)) return 'All instalment dates are required'
        if (data.instalmentAmounts.some(a => !a || a <= 0)) return 'All instalment amounts must be greater than 0'
        return null
      case 3: // Details
        if (!data.bankId && banks.length > 0) return 'Please select a bank'
        return null
      case 4: // Blue Cards
        if (!data.blueCardNone && data.blueCards.length === 0) return 'Please select blue cards or choose "None"'
        return null
      default:
        return null
    }
  }

  const handleNext = () => {
    const error = validateStep(currentStep)
    if (error) {
      showError(error)
      return
    }
    const nextIndex = currentStepIndex + 1
    if (nextIndex < steps.length) setCurrentStep(steps[nextIndex])
  }

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) setCurrentStep(steps[prevIndex])
  }

  const goToStep = (step: number) => {
    const targetIndex = steps.indexOf(step)
    if (targetIndex < 0) return
    // Only allow going to completed steps
    if (targetIndex < currentStepIndex) setCurrentStep(step)
  }

  const handleConvert = async () => {
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
      const commPct = typeof data.commissionPercent === 'number' ? data.commissionPercent : 0
      const result = await window.api.policyConvertFromQuotation(quotation.id, {
        vesselIds: data.selectedVesselIds,
        inceptionDate: data.inceptionDate,
        inceptionTime: data.inceptionTime,
        expiryDate: data.expiryDate,
        expiryTime: data.expiryTime,
        timezone: data.timezone,
        instalments: data.instalmentDates.map((dueDate, i) => ({
          dueDate,
          premiumAmount: data.instalmentAmounts[i] || 0,
          commissionAmount: Math.round((data.instalmentAmounts[i] || 0) * commPct / 100 * 100) / 100,
          isNonRefundable: data.instalmentNonRefundable[i] || false
        })),
        commissionPercent: commPct || null,
        bankId: data.bankId || null,
        showAddresses: data.showAddresses,
        blueCards: data.blueCardNone ? [] : data.blueCards,
        selectedAlternativeId: data.selectedAltId || null,
        exchangeRate: data.exchangeRate || 1,
        selectedLolOptionId: data.selectedLolOptionId || null,
        selectedAgreedValueOptionId: data.selectedAgreedValueOptionId || null
      })
      if ((result as any)?.error) {
        showError((result as any).message || 'Conversion failed')
        return
      }
      const policies = Array.isArray(result) ? result : []
      showSuccess(`${policies.length} polic${policies.length === 1 ? 'y' : 'ies'} created successfully`)
      if (policies[0]?.id) onComplete(policies[0].id)
    } catch (err: any) {
      showError(err.message || 'Failed to convert to policy')
    } finally {
      setConverting(false)
    }
  }

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.65rem', fontWeight: 700,
    letterSpacing: '0.8px', textTransform: 'uppercase',
    color: 'var(--text-secondary)', marginBottom: '6px'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--input-border)', background: 'var(--input-bg)',
    color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box'
  }

  const cardBg = isLight ? '#ffffff' : 'var(--bg-card)'

  if (loading) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <Loader2 size={32} className="spinner" style={{ color: 'var(--accent-primary)' }} />
        <p style={{ color: 'var(--text-secondary)', marginTop: '12px' }}>Loading quotation data...</p>
      </div>
    )
  }

  if (!quotation) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
        <p style={{ color: 'var(--danger)' }}>Failed to load quotation</p>
        <button onClick={onCancel} className="btn-secondary" style={{ marginTop: '12px' }}>Back</button>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
      {/* Cancel link */}
      <button
        onClick={onCancel}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: '0.85rem',
          display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px',
          padding: 0
        }}
      >
        <ArrowLeft size={16} /> Back to Quotation
      </button>

      {/* Title */}
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Shield size={24} color="var(--accent-primary)" />
        Policy Setup
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 24px' }}>
        {quotation.referenceNumber} — {quotation.quotationTypeName || quotation.quotationTypeCode}
      </p>

      {/* Progress Bar */}
      <div style={{
        background: cardBg, borderRadius: '14px', padding: '24px 32px',
        border: '1px solid var(--glass-border)', marginBottom: '24px'
      }}>
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
                  onClick={() => isCompleted ? goToStep(step) : undefined}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    cursor: isCompleted ? 'pointer' : 'default'
                  }}
                >
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isCompleted ? 'var(--accent-primary)' : isCurrent ? 'var(--accent-primary)' : 'transparent',
                    border: isCurrent ? '3px solid var(--accent-primary)' : isCompleted ? 'none' : '2px solid var(--text-secondary)',
                    boxShadow: isCurrent ? '0 0 0 4px rgba(0,170,200,0.2)' : 'none',
                    color: isCompleted || isCurrent ? '#fff' : 'var(--text-secondary)',
                    transition: 'all 0.2s'
                  }}>
                    {isCompleted ? <Check size={16} /> : <StepIcon size={16} />}
                  </div>
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 600,
                    color: isCurrent ? 'var(--accent-primary)' : isFuture ? 'var(--text-secondary)' : 'var(--text-primary)',
                    textTransform: 'uppercase', letterSpacing: '0.5px'
                  }}>
                    {STEP_LABELS[step]}
                  </span>
                </div>
                {/* Connector line */}
                {idx < steps.length - 1 && (
                  <div style={{
                    width: '48px', height: '2px', margin: '0 8px',
                    marginBottom: '22px',
                    background: idx < currentStepIndex ? 'var(--accent-primary)' : 'var(--glass-border)',
                    transition: 'background 0.2s'
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Step Content */}
      <div style={{
        background: cardBg, borderRadius: '14px', padding: '28px',
        border: '1px solid var(--glass-border)', marginBottom: '24px',
        minHeight: '200px'
      }}>
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
            onToggleVessel={(id) => {
              updateData({
                selectedVesselIds: data.selectedVesselIds.includes(id)
                  ? data.selectedVesselIds.filter(v => v !== id)
                  : [...data.selectedVesselIds, id]
              })
            }}
            onSelectAlt={handleAltChange}
            onSelectLolOption={(id) => {
              const opt = lolOptions.find(o => o.id === id)
              if (opt?.premiumAmount != null && quotation) {
                const tech = opt.premiumAmount
                const pay = computePayable(tech)
                const count = data.instalmentAmounts.length
                let newAmounts = data.instalmentAmounts
                if (count > 0) {
                  const perInstalment = Math.round((pay / count) * 100) / 100
                  newAmounts = data.instalmentAmounts.map((_, i) => i === 0 ? Math.round((pay - perInstalment * (count - 1)) * 100) / 100 : perInstalment)
                }
                updateData({ selectedLolOptionId: id, totalPremium: pay, instalmentAmounts: newAmounts })
              } else {
                updateData({ selectedLolOptionId: id })
              }
            }}
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
            inputStyle={inputStyle}
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
            labelStyle={labelStyle}
            inputStyle={inputStyle}
          />
        )}

        {currentStep === 4 && (
          <StepBlueCards
            data={data}
            qVessels={qVessels}
            flagStates={flagStates}
            isLight={isLight}
            onUpdate={updateData}
            labelStyle={labelStyle}
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
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 28px', fontSize: '0.95rem' }}
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
    </div>
  )
}

// ==================== Step Components ====================

function StepVesselAlternative({ qVessels, allAlts, hasAlts, isMultiVessel, data, quotation, isLight, lolOptions, agreedValueOptions, onToggleVessel, onSelectAlt, onSelectLolOption, onSelectAgreedValueOption, labelStyle }: {
  qVessels: QuotationVessel[]
  allAlts: (QuotationPIAlternative | QuotationHullAlternative)[]
  hasAlts: boolean
  isMultiVessel: boolean
  data: WizardData
  quotation: Quotation
  isLight: boolean
  lolOptions: { id: string; label: string | null; amount: number; currency: string; premiumAmount: number | null; order: number }[]
  agreedValueOptions: QuotationAgreedValueOption[]
  onToggleVessel: (id: string) => void
  onSelectAlt: (id: string) => void
  onSelectLolOption: (id: string) => void
  onSelectAgreedValueOption: (id: string) => void
  labelStyle: React.CSSProperties
}) {
  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Vessel & Alternative Selection</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        {isMultiVessel ? 'Select which vessels to create policies for. Each vessel gets its own policy.' : 'Confirm the vessel for this policy.'}
      </p>

      {/* Vessel list */}
      <div style={{ marginBottom: hasAlts ? '24px' : '0' }}>
        <label style={labelStyle}>Vessels</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {qVessels.map(v => {
            const id = v.vesselId || v.id
            const selected = data.selectedVesselIds.includes(id)
            return (
              <label key={v.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 14px', borderRadius: '10px',
                border: selected ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                background: selected ? 'rgba(0,170,200,0.06)' : 'transparent',
                cursor: isMultiVessel ? 'pointer' : 'default',
                transition: 'all 0.15s'
              }}>
                {isMultiVessel && (
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleVessel(id)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
                  />
                )}
                {!isMultiVessel && (
                  <div style={{
                    width: '32px', height: '32px', borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Ship size={16} color="#fff" />
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{v.name || v.vesselLabel}</div>
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
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
                  padding: '8px 18px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                  border: data.selectedAltId === alt.id ? '2px solid var(--accent-primary)' : '1px solid var(--input-border)',
                  background: data.selectedAltId === alt.id ? 'rgba(0,170,200,0.1)' : 'transparent',
                  color: data.selectedAltId === alt.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {(alt as any).label || `Alternative ${idx + 1}`}
                {(alt as any).premiumAmount != null ? ` — ${quotation.premiumCurrency || 'USD'} ${((alt as any).premiumAmount as number).toLocaleString()}` : ''}
                {quotation.ivEnabled && quotation.ivPremiumAmount ? ` + IV ${quotation.ivPremiumAmount.toLocaleString()}` : ''}
              </button>
            ))}
          </div>
          {(quotation.ncbEnabled || quotation.upccEnabled) && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
              {quotation.ncbEnabled && <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(34,197,94,0.1)', color: isLight ? '#166534' : '#86efac', fontWeight: 600 }}>NCB {quotation.ncbDiscountPercent}%</span>}
              {quotation.upccEnabled && <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: '6px', background: 'rgba(59,130,246,0.1)', color: isLight ? '#1e40af' : '#93c5fd', fontWeight: 600 }}>UPCC {quotation.upccDiscountPercent}%</span>}
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
                  padding: '8px 18px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                  border: data.selectedLolOptionId === opt.id ? '2px solid var(--accent-primary)' : '1px solid var(--input-border)',
                  background: data.selectedLolOptionId === opt.id ? 'rgba(0,170,200,0.1)' : 'transparent',
                  color: data.selectedLolOptionId === opt.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s'
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
                  padding: '8px 18px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 600,
                  border: data.selectedAgreedValueOptionId === opt.id ? '2px solid var(--accent-primary)' : '1px solid var(--input-border)',
                  background: data.selectedAgreedValueOptionId === opt.id ? 'rgba(0,170,200,0.1)' : 'transparent',
                  color: data.selectedAgreedValueOptionId === opt.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s'
                }}
              >
                {opt.label || `Option ${idx + 1}`} — {opt.currency || 'USD'} {opt.amount?.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StepPeriodPremium({ data, timezoneOptions, onUpdate, labelStyle, inputStyle }: {
  data: WizardData
  timezoneOptions: string[]
  onUpdate: (partial: Partial<WizardData>) => void
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
}) {
  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Period</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Set the policy inception and expiry dates.
      </p>

      {/* Inception */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div>
          <label style={labelStyle}>Inception Date</label>
          <input type="date" value={data.inceptionDate} onChange={e => onUpdate({ inceptionDate: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Time</label>
          <input type="time" value={data.inceptionTime} onChange={e => onUpdate({ inceptionTime: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Timezone</label>
          <input
            type="text"
            list="wizard-tz-options"
            value={data.timezone}
            onChange={e => onUpdate({ timezone: e.target.value })}
            style={inputStyle}
            placeholder="Type or select..."
          />
          <datalist id="wizard-tz-options">
            {timezoneOptions.map(tz => <option key={tz} value={tz} />)}
          </datalist>
        </div>
      </div>

      {/* Expiry */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '20px' }}>
        <div>
          <label style={labelStyle}>Expiry Date</label>
          <input type="date" value={data.expiryDate} onChange={e => onUpdate({ expiryDate: e.target.value })} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Time</label>
          <input type="time" value={data.expiryTime} onChange={e => onUpdate({ expiryTime: e.target.value })} style={inputStyle} />
        </div>
        <div />
      </div>

    </div>
  )
}

function StepInstalments({ data, quotation, isLight, onUpdate, recalcPremiumFromInstalments, inputStyle }: {
  data: WizardData
  quotation: Quotation
  isLight: boolean
  onUpdate: (partial: Partial<WizardData>) => void
  recalcPremiumFromInstalments: (amounts: number[]) => void
  inputStyle: React.CSSProperties
}) {
  if (data.instalmentDates.length === 0) {
    return (
      <div>
        <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Instalment Schedule</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '20px 0' }}>
          No instalments configured on this quotation. The full premium will be due on a single instalment.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Premium & Instalments</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Set the payable premium and review instalment dates and amounts.
      </p>

      {/* Premium */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '8px' }}>Payable Premium</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', maxWidth: '300px' }}>
          <input
            type="number"
            value={data.totalPremium}
            onChange={e => {
              const val = parseFloat(e.target.value) || 0
              const count = data.instalmentDates.length || 1
              const perInst = Math.round((val / count) * 100) / 100
              const newAmounts = Array.from({ length: count }, (_, idx) =>
                idx === count - 1 ? Math.round((val - perInst * (count - 1)) * 100) / 100 : perInst
              )
              onUpdate({ totalPremium: val, instalmentAmounts: newAmounts })
            }}
            style={{ ...inputStyle, flex: 1, textAlign: 'right' }}
            placeholder="Premium amount"
          />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>{quotation?.premiumCurrency || 'USD'}</span>
        </div>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '6px 0 0' }}>
          Changing premium will recalculate instalment amounts
        </p>
      </div>

      <div style={{ height: '1px', background: 'var(--glass-border)', margin: '0 0 16px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {data.instalmentDates.map((date, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', borderRadius: '10px',
            border: '1px solid var(--table-border)',
            background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)'
          }}>
            <span style={{
              fontSize: '0.82rem', color: 'var(--text-secondary)',
              minWidth: '32px', fontWeight: 700,
              background: 'rgba(0,170,200,0.1)', padding: '2px 8px',
              borderRadius: '6px', textAlign: 'center'
            }}>
              #{i + 1}
            </span>
            <input
              type="date"
              value={date}
              onChange={e => {
                const updated = [...data.instalmentDates]
                updated[i] = e.target.value
                onUpdate({ instalmentDates: updated })
              }}
              style={{ ...inputStyle, flex: 1 }}
            />
            <input
              type="number"
              value={data.instalmentAmounts[i] || ''}
              onChange={e => {
                const updated = [...data.instalmentAmounts]
                updated[i] = parseFloat(e.target.value) || 0
                recalcPremiumFromInstalments(updated)
              }}
              placeholder="Amount"
              style={{ ...inputStyle, width: '130px', flex: 'none', textAlign: 'right' }}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: '36px' }}>{quotation.premiumCurrency || 'USD'}</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={data.instalmentNonRefundable[i] || false}
                onChange={e => {
                  const updated = [...data.instalmentNonRefundable]
                  updated[i] = e.target.checked
                  onUpdate({ instalmentNonRefundable: updated })
                }}
                style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }}
              />
              NR
            </label>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', padding: '8px 14px', borderRadius: '8px', background: 'rgba(0,170,200,0.06)' }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Total</span>
        <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
          {data.totalPremium.toLocaleString()} {quotation.premiumCurrency || 'USD'}
        </span>
      </div>

      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>
        NR = Non-refundable. Each 30 days from inception equals 1 calendar month.
      </p>
    </div>
  )
}

function StepDetails({ data, banks, hasBroker, premiumCurrency, baseCurrency, onUpdate, labelStyle, inputStyle }: {
  data: WizardData
  banks: { id: string; name: string; details: string; order: number }[]
  hasBroker: boolean
  premiumCurrency: string
  baseCurrency: string
  onUpdate: (partial: Partial<WizardData>) => void
  labelStyle: React.CSSProperties
  inputStyle: React.CSSProperties
}) {
  const sameAsBase = premiumCurrency.toUpperCase() === baseCurrency.toUpperCase()
  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Additional Details</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Configure commission, bank, and address settings.
      </p>

      {/* Commission */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Commission %{hasBroker ? '' : ' (optional)'}</label>
        <input
          type="number"
          value={data.commissionPercent}
          onChange={e => onUpdate({ commissionPercent: e.target.value === '' ? '' : parseFloat(e.target.value) })}
          min={0}
          max={100}
          step={0.01}
          placeholder={hasBroker ? 'e.g. 15' : '0'}
          style={{ ...inputStyle, width: '160px' }}
        />
        {hasBroker && <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>Broker commission — will generate Credit Advice</p>}
      </div>

      {/* Exchange Rate */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Exchange Rate ({premiumCurrency} to {baseCurrency})</label>
        <input
          type="number"
          value={data.exchangeRate}
          onChange={e => onUpdate({ exchangeRate: parseFloat(e.target.value) || 1 })}
          min={0}
          step={0.000001}
          readOnly={sameAsBase}
          style={{ ...inputStyle, width: '200px', ...(sameAsBase ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }}
        />
        {sameAsBase && <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>Same as base currency — rate fixed at 1</p>}
      </div>

      {/* Bank */}
      <div style={{ marginBottom: '20px' }}>
        <label style={labelStyle}>Bank</label>
        {banks.length > 0 ? (
          <select value={data.bankId} onChange={e => onUpdate({ bankId: e.target.value })} style={inputStyle}>
            <option value="">Select bank...</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>No banks configured</p>
        )}
      </div>

      {/* Show Addresses */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.88rem' }}>
          <input
            type="checkbox"
            checked={data.showAddresses}
            onChange={e => onUpdate({ showAddresses: e.target.checked })}
            style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
          />
          Show Addresses in Policy Document
        </label>
      </div>
    </div>
  )
}

function StepBlueCards({ data, qVessels, flagStates, isLight, onUpdate, labelStyle }: {
  data: WizardData
  qVessels: QuotationVessel[]
  flagStates: FlagState[]
  isLight: boolean
  onUpdate: (partial: Partial<WizardData>) => void
  labelStyle: React.CSSProperties
}) {
  // Find the vessel's flag state for ratification checks
  const vesselFlagStates = useMemo(() => {
    const result: { vesselName: string; flagState: FlagState | null }[] = []
    for (const v of qVessels) {
      if (v.flag) {
        const fs = flagStates.find(f => f.name === v.flag || f.iso3Code === v.flag)
        result.push({ vesselName: v.name || v.vesselLabel, flagState: fs || null })
      } else {
        result.push({ vesselName: v.name || v.vesselLabel, flagState: null })
      }
    }
    return result
  }, [qVessels, flagStates])

  const primaryFlag = vesselFlagStates[0]?.flagState

  const toggleCard = (card: string) => {
    const current = data.blueCards
    const updated = current.includes(card)
      ? current.filter(c => c !== card)
      : [...current, card]
    onUpdate({ blueCards: updated, blueCardNone: false })
  }

  const setNone = () => {
    onUpdate({ blueCardNone: !data.blueCardNone, blueCards: !data.blueCardNone ? [] : data.blueCards })
  }

  const bbcWarning = data.blueCards.includes('BBC') && primaryFlag && !primaryFlag.ratifiedBunker
  const wrcWarning = data.blueCards.includes('WRC') && primaryFlag && !primaryFlag.ratifiedWreck

  const ratifiedBunkerFlags = useMemo(() => flagStates.filter(f => f.ratifiedBunker), [flagStates])
  const ratifiedWreckFlags = useMemo(() => flagStates.filter(f => f.ratifiedWreck), [flagStates])

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', borderRadius: '8px',
    border: '1px solid var(--input-border)', background: 'var(--input-bg)',
    color: 'var(--text-primary)', fontSize: '0.88rem', boxSizing: 'border-box'
  }

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Blue Cards</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Select which blue cards to issue for this P&I policy.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* None option */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '10px 14px', borderRadius: '10px',
          border: data.blueCardNone ? '1.5px solid var(--text-secondary)' : '1px solid var(--input-border)',
          background: data.blueCardNone ? (isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)') : 'transparent',
          cursor: 'pointer', transition: 'all 0.15s'
        }}>
          <input
            type="radio"
            checked={data.blueCardNone}
            onChange={setNone}
            style={{ width: '16px', height: '16px', accentColor: 'var(--text-secondary)' }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>None</span>
        </label>

        {/* Card options */}
        {!data.blueCardNone && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {['BBC', 'WRC', 'MLC4.2', 'MLC2.5.2'].map(card => (
              <label key={card} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', borderRadius: '10px',
                border: data.blueCards.includes(card) ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                background: data.blueCards.includes(card) ? 'rgba(0,170,200,0.06)' : 'transparent',
                cursor: 'pointer', transition: 'all 0.15s'
              }}>
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
        )}
      </div>

      {/* BBC ratification warning */}
      {bbcWarning && (
        <div style={{
          marginTop: '16px', padding: '12px 14px', borderRadius: '10px',
          background: 'rgba(255,180,30,0.1)', border: '1px solid rgba(255,180,30,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={16} color="#ffb020" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffb020' }}>
              Flag {primaryFlag.name} has not ratified the Bunker Convention
            </span>
          </div>
          <label style={labelStyle}>Issue BBC to:</label>
          <select
            value={data.blueCardAddressedTo['BBC'] || ''}
            onChange={e => onUpdate({ blueCardAddressedTo: { ...data.blueCardAddressedTo, BBC: e.target.value } })}
            style={inputStyle}
          >
            <option value="">Select flag state...</option>
            {ratifiedBunkerFlags.map(f => <option key={f.id} value={f.id}>{f.name} ({f.iso3Code})</option>)}
          </select>
        </div>
      )}

      {/* WRC ratification warning */}
      {wrcWarning && (
        <div style={{
          marginTop: '16px', padding: '12px 14px', borderRadius: '10px',
          background: 'rgba(255,180,30,0.1)', border: '1px solid rgba(255,180,30,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={16} color="#ffb020" />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffb020' }}>
              Flag {primaryFlag.name} has not ratified the Wreck Removal Convention
            </span>
          </div>
          <label style={labelStyle}>Issue WRC to:</label>
          <select
            value={data.blueCardAddressedTo['WRC'] || ''}
            onChange={e => onUpdate({ blueCardAddressedTo: { ...data.blueCardAddressedTo, WRC: e.target.value } })}
            style={inputStyle}
          >
            <option value="">Select flag state...</option>
            {ratifiedWreckFlags.map(f => <option key={f.id} value={f.id}>{f.name} ({f.iso3Code})</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function StepReview({ data, quotation, qVessels, allAlts, hasAlts, banks, hasBroker, isPI, isLight, onGoToStep }: {
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
}) {
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.65rem', fontWeight: 700,
    letterSpacing: '0.8px', textTransform: 'uppercase',
    color: 'var(--text-secondary)', marginBottom: '6px'
  }

  const sectionStyle: React.CSSProperties = {
    padding: '14px 16px', borderRadius: '10px',
    border: '1px solid var(--table-border)',
    background: isLight ? '#fafbfc' : 'rgba(255,255,255,0.02)',
    marginBottom: '12px'
  }

  const editLink = (step: number) => (
    <button
      onClick={() => onGoToStep(step)}
      style={{
        background: 'transparent', border: 'none', cursor: 'pointer',
        color: 'var(--accent-primary)', fontSize: '0.75rem', fontWeight: 600,
        display: 'flex', alignItems: 'center', gap: '4px', padding: 0
      }}
    >
      <Pencil size={12} /> Edit
    </button>
  )

  const selectedAlt = allAlts.find(a => a.id === data.selectedAltId)
  const selectedBank = banks.find(b => b.id === data.bankId)

  return (
    <div>
      <h2 style={{ fontSize: '1.1rem', margin: '0 0 4px' }}>Review & Confirm</h2>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Please review all details before creating the policy.
      </p>

      {/* Vessels */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Vessels</span>
          {editLink(0)}
        </div>
        {qVessels.filter(v => data.selectedVesselIds.includes(v.vesselId || v.id)).map(v => (
          <div key={v.id} style={{ fontSize: '0.88rem', marginBottom: '2px' }}>
            <strong>{v.name || v.vesselLabel}</strong>
            {v.imoNumber && <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>IMO {v.imoNumber}</span>}
          </div>
        ))}
      </div>

      {/* Alternative */}
      {hasAlts && selectedAlt && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Alternative</span>
            {editLink(0)}
          </div>
          <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
            {(selectedAlt as any).label || 'Alternative'}
            {(selectedAlt as any).premiumAmount != null ? ` — ${quotation.premiumCurrency || 'USD'} ${((selectedAlt as any).premiumAmount as number).toLocaleString()}` : ''}
          </span>
        </div>
      )}

      {/* Period */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Period</span>
          {editLink(1)}
        </div>
        <div style={{ fontSize: '0.88rem' }}>
          <strong>{data.inceptionDate}</strong> {data.inceptionTime} &rarr; <strong>{data.expiryDate}</strong> {data.expiryTime}
          <span style={{ color: 'var(--text-secondary)', marginLeft: '8px' }}>({data.timezone})</span>
        </div>
      </div>

      {/* Premium & Instalments */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Premium & Instalments</span>
          {editLink(2)}
        </div>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '10px' }}>
          {data.totalPremium.toLocaleString()} {quotation.premiumCurrency || 'USD'}
        </div>
        {data.instalmentDates.length > 0 && (
          <div style={{ fontSize: '0.82rem' }}>
            {data.instalmentDates.map((date, i) => (
              <div key={i} style={{ display: 'flex', gap: '12px', padding: '3px 0', borderBottom: i < data.instalmentDates.length - 1 ? '1px solid var(--table-border)' : 'none' }}>
                <span style={{ minWidth: '28px', fontWeight: 600, color: 'var(--text-secondary)' }}>#{i + 1}</span>
                <span style={{ flex: 1 }}>{date}</span>
                <span style={{ fontWeight: 600 }}>{(data.instalmentAmounts[i] || 0).toLocaleString()} {quotation.premiumCurrency || 'USD'}</span>
                {data.instalmentNonRefundable[i] && <span style={{ fontSize: '0.72rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255,77,77,0.1)', color: 'var(--danger)', fontWeight: 600 }}>NR</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ ...labelStyle, marginBottom: 0 }}>Details</span>
          {editLink(3)}
        </div>
        <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {hasBroker && <div>Commission: <strong>{typeof data.commissionPercent === 'number' ? `${data.commissionPercent}%` : 'Not set'}</strong></div>}
          <div>Bank: <strong>{selectedBank?.name || 'Not selected'}</strong></div>
          <div>Show Addresses: <strong>{data.showAddresses ? 'Yes' : 'No'}</strong></div>
        </div>
      </div>

      {/* Blue Cards */}
      {isPI && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ ...labelStyle, marginBottom: 0 }}>Blue Cards</span>
            {editLink(4)}
          </div>
          <div style={{ fontSize: '0.88rem' }}>
            {data.blueCardNone ? (
              <span style={{ color: 'var(--text-secondary)' }}>None</span>
            ) : data.blueCards.length > 0 ? (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {data.blueCards.map(card => (
                  <span key={card} style={{
                    padding: '3px 10px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600,
                    background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)'
                  }}>
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
