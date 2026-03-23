import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ArrowLeft,
  FileCheck,
  Ship,
  DollarSign,
  Clock,
  ExternalLink,
  Download,
  Loader2,
  Trash2,
  MapPin,
  CreditCard,
  Users,
  Plus,
  RefreshCw,
  Edit3,
  X,
  AlertTriangle,
  Check,
  Save,
  Shield,
  ChevronRight,
  Copy,
  FileSpreadsheet
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateShort, formatDate } from '../utils/dateUtils'
import {
  exportPolicyDocx,
  exportDebitAdviceDocx,
  exportCreditAdviceDocx,
  exportBlueCardsDocx,
  exportBlueCardDocx
} from '../services/PolicyExportService'
import { getReportSettings } from '../services/ReportSettingsService'
import { exportPolicyToQuickBooks } from '../services/QuickBooksExportService'
import ConfirmationModal from './ConfirmationModal'
import type { FlagState, FlagStatePort, VesselAssured } from '../../../shared/types'

const DEFAULT_TIMEZONE_OPTIONS = [
  'Lebanon Standard Time',
  'Lebanon Local Standard Time',
  'GMT',
  'UTC'
]

type EditTab = 'overview' | 'insured' | 'premium' | 'coverage'

interface PolicyDetailProps {
  policyId: string
  onBack: () => void
  onNavigateToVessel?: (vesselId: string) => void
  onNavigateToQuotation?: (quotationId: string, policyContext?: { policyId: string; policyNumber: string }) => void
  onNavigateToPolicy?: (policyId: string) => void
}

interface PolicyRecord {
  id: string
  quotationId: string
  vesselId: string
  policyNumber: string
  status: string
  revisionNumber: number
  inceptionDate: string
  inceptionTime: string
  expiryDate: string
  expiryTime: string
  timezone: string
  commissionPercent: number | null
  showAddresses: boolean
  bankId: string | null
  bankName: string | null
  bankDetails: string | null
  proRata: boolean
  perAnnumPremium: number | null
  premiumAmount: number | null
  selectedAlternativeId: string | null
  cancelReplaceText: string | null
  exportedAt: string | null
  createdBy: string
  createdAt: string
  quotationTypeCode: string
  quotationTypeName: string
  vesselName: string
  imoNumber: string
  vesselType: string
  flagStateId: string
  builtYear: number | null
  grossTonnage: number | null
  flagStateName: string
  flagIso3Code: string | null
  customerName: string
  customerType: string | null
  callSign?: string
  exchangeRate: number
  fleetId: string | null
  fleetName: string | null
  classificationSociety: string | null
  createdByName: string | null
}

interface Instalment {
  instalmentNumber: number
  dueDate: string
  premiumAmount: number
  commissionAmount: number
  isNonRefundable: boolean
}

interface PolicyAddress {
  entityId: string
  entityName: string
  role: string
  addressText: string
}

interface BlueCard {
  id: string
  policyDocId: string
  cardType: string
  cardNumber: string
  inceptionDate: string
  expiryDate: string
  revisionNumber: number
  issuedDate: string
  status: string
  ownerEntityId?: string
  ownerName?: string
  ownerAddress?: string
  portOfRegistry?: string
  addressedToFlagId?: string
  addressedToName?: string
  addressedToAddress?: string
  cancelReplaceText?: string
}

const CARD_TYPES = ['BBC', 'WRC', 'MLC4.2', 'MLC2.5.2'] as const
type CardType = (typeof CARD_TYPES)[number]

const CARD_TYPE_LABELS: Record<string, string> = {
  BBC: 'Bunker Oil',
  WRC: 'Wreck Removal',
  'MLC4.2': 'Shipowners\' Liability',
  'MLC2.5.2': 'Repatriation'
}

const CARD_TYPE_FULL_NAMES: Record<string, string> = {
  BBC: 'International Convention on Civil Liability for Bunker Oil Pollution Damage, 2001',
  WRC: 'Nairobi International Convention on the Removal of Wrecks, 2007',
  'MLC4.2': 'Maritime Labour Convention, 2006 \u2014 Regulation 4.2',
  'MLC2.5.2': 'Maritime Labour Convention, 2006 \u2014 Standard A2.5.2'
}

interface BlueCardFormData {
  cardType: CardType
  inceptionDate: string
  expiryDate: string
  ownerEntityId: string
  ownerName: string
  ownerAddress: string
  portOfRegistry: string
  addressedToFlagId: string
  addressedToName: string
  addressedToAddress: string
  cancelReplace: boolean
  cancelReplaceText: string
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
  expired: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
  cancelled: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
  inactive: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' }
}

const typeColors: Record<string, { bg: string; text: string; lightText: string }> = {
  P: { bg: 'rgba(100, 100, 255, 0.12)', text: '#6464ff', lightText: '#4a4adf' },
  H: { bg: 'rgba(255, 100, 200, 0.12)', text: '#ff64c8', lightText: '#c84a9a' },
  W: { bg: 'rgba(255, 176, 32, 0.12)', text: '#ffb020', lightText: '#b07a10' }
}

function formatAmount(amount?: number | null, currency?: string): string {
  if (amount == null) return '-'
  return `${currency || 'USD'} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(date?: string, time?: string): string {
  if (!date) return '-'
  const formatted = formatDateShort(date)
  if (time) return `${formatted} ${time}`
  return formatted
}

export default function PolicyDetail({ policyId, onBack, onNavigateToVessel, onNavigateToQuotation, onNavigateToPolicy }: PolicyDetailProps) {
  const [policy, setPolicy] = useState<PolicyRecord | null>(null)
  const [instalments, setInstalments] = useState<Instalment[]>([])
  const [addresses, setAddresses] = useState<PolicyAddress[]>([])
  const [blueCards, setBlueCards] = useState<BlueCard[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingPolicy, setExportingPolicy] = useState(false)
  const [exportingDA, setExportingDA] = useState(false)
  const [exportingCA, setExportingCA] = useState(false)
  const [exportingBC, setExportingBC] = useState(false)
  const [exportingQB, setExportingQB] = useState(false)
  const [bcDropdownOpen, setBcDropdownOpen] = useState(false)
  const [confirmation, setConfirmation] = useState<{ show: boolean; title: string; message: string; onConfirm: () => void; isDangerous?: boolean }>({ show: false, title: '', message: '', onConfirm: () => {} })
  const [renewing, setRenewing] = useState(false)

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false)
  const [activeTab, setActiveTab] = useState<EditTab>('overview')
  const [saving, setSaving] = useState(false)

  // Editable policy fields
  const [editInception, setEditInception] = useState('')
  const [editInceptionTime, setEditInceptionTime] = useState('12:00')
  const [editExpiry, setEditExpiry] = useState('')
  const [editExpiryTime, setEditExpiryTime] = useState('12:00')
  const [editTimezone, setEditTimezone] = useState('')
  const [editPremium, setEditPremium] = useState<number>(0)
  const [editCommission, setEditCommission] = useState<number>(0)
  const [editBankId, setEditBankId] = useState('')
  const [editInstalments, setEditInstalments] = useState<{ instalmentNumber: number; dueDate: string; premiumAmount: number; commissionAmount: number; isNonRefundable: boolean }[]>([])
  const [editAddresses, setEditAddresses] = useState<{ entityId: string; entityName: string; role: string; addressText: string }[]>([])
  const [editCancelReplace, setEditCancelReplace] = useState(false)
  const [editCancelReplaceText, setEditCancelReplaceText] = useState('')

  // Supplementary data for editing
  const [banks, setBanks] = useState<{ id: string; name: string; details: string; order: number }[]>([])

  // Coverage tab state
  const [quotationData, setQuotationData] = useState<any>(null)
  const [coverageWarranties, setCoverageWarranties] = useState<any[]>([])
  const [coverageCustomWarranties, setCoverageCustomWarranties] = useState<any[]>([])
  const [coverageDeductibles, setCoverageDeductibles] = useState<any[]>([])
  const [coverageExclusions, setCoverageExclusions] = useState<any[]>([])
  const [coverageClauses, setCoverageClauses] = useState<any[]>([])
  const [coverageSubjectivities, setCoverageSubjectivities] = useState<any[]>([])
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageExpanded, setCoverageExpanded] = useState<Record<string, boolean>>({})

  // Blue card management state
  const [bcModalOpen, setBcModalOpen] = useState(false)
  const [bcEditId, setBcEditId] = useState<string | null>(null)
  const [bcModalMode, setBcModalMode] = useState<'issue' | 'reissue' | 'edit'>('issue')
  const [bcPreselectedType, setBcPreselectedType] = useState<CardType | null>(null)
  const [bcReissueSource, setBcReissueSource] = useState<BlueCard | null>(null)
  const [bcSaving, setBcSaving] = useState(false)
  const [bcForm, setBcForm] = useState<BlueCardFormData>({
    cardType: 'BBC',
    inceptionDate: '',
    expiryDate: '',
    ownerEntityId: '',
    ownerName: '',
    ownerAddress: '',
    portOfRegistry: '',
    addressedToFlagId: '',
    addressedToName: '',
    addressedToAddress: '',
    cancelReplace: false,
    cancelReplaceText: ''
  })
  const [flagStates, setFlagStates] = useState<FlagState[]>([])
  const [flagPorts, setFlagPorts] = useState<FlagStatePort[]>([])
  const [vesselAssureds, setVesselAssureds] = useState<VesselAssured[]>([])
  const [assuredEntities, setAssuredEntities] = useState<Array<{ id: string; name: string; address?: string }>>([])

  const { showError, showSuccess } = useToast()
  const { hasPermission } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [found, inst, addr, bc] = await Promise.all([
        window.api.policyGetById(policyId),
        window.api.policyGetInstalments(policyId),
        window.api.policyGetAddresses(policyId),
        window.api.policyGetBlueCards(policyId)
      ])

      if (!found || (found as any).error) {
        showError('Policy not found')
        onBack()
        return
      }

      setPolicy(found as PolicyRecord)
      setInstalments(Array.isArray(inst) ? inst : [])
      setAddresses(Array.isArray(addr) ? addr : [])
      setBlueCards(Array.isArray(bc) ? bc : [])
    } catch (err: any) {
      showError(err.message || 'Failed to load policy')
    } finally {
      setLoading(false)
    }
  }, [policyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Load supplementary data for blue card management + editing
  useEffect(() => {
    const loadSupplementary = async (): Promise<void> => {
      try {
        const [fs, entities, bnks] = await Promise.all([
          window.api.getFlagStates(),
          window.api.getEntities(),
          window.api.bankGetAll()
        ])
        setFlagStates(Array.isArray(fs) ? fs : [])
        setBanks(Array.isArray(bnks) ? bnks : [])
        // Build a simple entity lookup for assured entities
        const entMap = Array.isArray(entities)
          ? entities.map((e: any) => ({ id: e.id, name: e.name, address: e.address }))
          : []
        setAssuredEntities(entMap)
      } catch {
        // Non-critical - UI will still work without supplementary data
      }
    }
    loadSupplementary()
  }, [])

  // Load vessel assureds when policy loads
  useEffect(() => {
    if (!policy?.vesselId) return
    const loadAssureds = async (): Promise<void> => {
      try {
        const va = await window.api.getVesselAssureds(policy.vesselId)
        setVesselAssureds(Array.isArray(va) ? va : [])
      } catch {
        // Non-critical
      }
    }
    loadAssureds()
  }, [policy?.vesselId])

  // Load ports when flag state is known
  useEffect(() => {
    if (!policy?.flagStateId) return
    const loadPorts = async (): Promise<void> => {
      try {
        const ports = await window.api.flagStateGetPorts(policy.flagStateId)
        setFlagPorts(Array.isArray(ports) ? ports : [])
      } catch {
        // Non-critical
      }
    }
    loadPorts()
  }, [policy?.flagStateId])

  // Enter edit mode — populate edit fields from current data
  const enterEditMode = useCallback(() => {
    if (!policy) return
    setEditInception(policy.inceptionDate || '')
    setEditInceptionTime(policy.inceptionTime || '12:00')
    setEditExpiry(policy.expiryDate || '')
    setEditExpiryTime(policy.expiryTime || '12:00')
    setEditTimezone(policy.timezone || 'GMT')
    setEditPremium(policy.premiumAmount || 0)
    setEditCommission(policy.commissionPercent || 0)
    setEditBankId(policy.bankId || '')
    setEditInstalments(instalments.map(inst => ({
      instalmentNumber: inst.instalmentNumber,
      dueDate: inst.dueDate || '',
      premiumAmount: inst.premiumAmount || 0,
      commissionAmount: inst.commissionAmount || 0,
      isNonRefundable: inst.isNonRefundable
    })))
    setEditAddresses(addresses.map(addr => ({
      entityId: addr.entityId || '',
      entityName: addr.entityName || '',
      role: addr.role || '',
      addressText: addr.addressText || ''
    })))
    setEditCancelReplace(!!policy.cancelReplaceText)
    setEditCancelReplaceText(policy.cancelReplaceText || '')
    setActiveTab('overview')
    setIsEditing(true)
  }, [policy, instalments, addresses])

  // Save edited policy
  const handleSavePolicy = async (): Promise<void> => {
    if (!policy) return
    setSaving(true)
    try {
      await window.api.policyUpdate(policyId, {
        inceptionDate: editInception,
        inceptionTime: editInceptionTime,
        expiryDate: editExpiry,
        expiryTime: editExpiryTime,
        timezone: editTimezone,
        premiumAmount: editPremium,
        commissionPercent: editCommission || null,
        bankId: editBankId || null,
        cancelReplaceText: editCancelReplace ? editCancelReplaceText : null
      })
      await window.api.policySetInstalments(policyId, editInstalments)
      await window.api.policySetAddresses(policyId, editAddresses.map(a => ({
        entityId: a.entityId,
        role: a.role,
        addressText: a.addressText
      })))
      // Sync addresses to entity_addresses so they are available system-wide
      for (const addr of editAddresses) {
        if (addr.entityId && addr.addressText && addr.addressText.trim()) {
          try {
            const existing = await window.api.getEntityAddresses(addr.entityId)
            const alreadyExists = Array.isArray(existing) && existing.some(
              (ea: any) => ea.addressLine1?.trim() === addr.addressText?.trim()
            )
            if (!alreadyExists) {
              await window.api.addEntityAddress({
                entityId: addr.entityId,
                label: addr.role || 'Policy Address',
                addressLine1: addr.addressText
              })
            }
          } catch {
            // Non-critical: don't block policy save if entity address sync fails
          }
        }
      }
      showSuccess('Policy updated')
      setIsEditing(false)
      await loadData()
    } catch (err: any) {
      showError(err.message || 'Failed to save policy')
    } finally {
      setSaving(false)
    }
  }

  // Create new revision
  const handleCreateRevision = (): void => {
    setConfirmation({
      show: true,
      title: 'Create Revision?',
      message: 'Create a new revision of this policy? The current version will be marked as superseded.',
      onConfirm: async () => {
        setConfirmation(prev => ({ ...prev, show: false }))
        try {
          const newId = await window.api.policyCreateRevision(policyId)
          if (newId && typeof newId === 'string') {
            showSuccess('New revision created')
            if (onNavigateToPolicy) {
              onNavigateToPolicy(newId)
            } else {
              await loadData()
            }
          }
        } catch (err: any) {
          showError(err.message || 'Failed to create revision')
        }
      }
    })
  }

  // Load coverage data from linked quotation
  const loadCoverageData = useCallback(async () => {
    if (!policy?.quotationId) return
    setCoverageLoading(true)
    try {
      const [q, warranties, customWarranties, deductibles, exclusions, clauses, subjectivities, allWarranties, , allExclusionsMaster, allClausesMaster, allSubjectivitiesMaster,
        hullConditions, hullAdditionalConditions, hullClauses, allHullConditions, hullAlternatives, customExclusions
      ] = await Promise.all([
        window.api.getQuotation(policy.quotationId),
        window.api.getQuotationWarranties(policy.quotationId),
        window.api.getQuotationCustomWarranties(policy.quotationId),
        window.api.getQuotationDeductibles(policy.quotationId),
        window.api.getQuotationExclusions(policy.quotationId),
        window.api.getQuotationClauses(policy.quotationId),
        window.api.getQuotationSubjectivities(policy.quotationId),
        window.api.piGetWarranties(),
        window.api.piGetDeductibles(),
        window.api.piGetExclusions(),
        window.api.piGetClauses(),
        window.api.getPISubjectivities(),
        window.api.hullGetQuotationHullConditions(policy.quotationId),
        window.api.hullGetQuotationHullAdditionalConditions(policy.quotationId),
        window.api.hullGetClauses(),
        window.api.hullGetClauseConditions(),
        window.api.hullGetQuotationAlternatives(policy.quotationId),
        window.api.getQuotationCustomExclusions(policy.quotationId)
      ])
      setQuotationData(q)
      // Resolve warranty names from master list
      const masterWarrantyMap = new Map((Array.isArray(allWarranties) ? allWarranties : []).map((w: any) => [w.id, w]))
      const resolvedWarranties = (Array.isArray(warranties) ? warranties : []).map((w: any) => {
        const master = masterWarrantyMap.get(w.piWarrantyId)
        return { ...w, text: master?.text || master?.name || '', name: master?.name || '' }
      })
      setCoverageWarranties(resolvedWarranties)
      setCoverageCustomWarranties(Array.isArray(customWarranties) ? customWarranties : [])
      // Resolve deductible text — deductibles have title+description directly
      setCoverageDeductibles((Array.isArray(deductibles) ? deductibles : []).map((d: any) => {
        const parts = [d.title, d.description].filter(Boolean)
        let text = parts.join(' — ')
        if (d.amount) text += ` ${d.currency || 'USD'} ${Number(d.amount).toLocaleString()}`
        return { ...d, text: text || 'Deductible' }
      }))
      // Resolve exclusion text — exclusions have customText or reference master
      const masterExclMap = new Map((Array.isArray(allExclusionsMaster) ? allExclusionsMaster : []).map((e: any) => [e.id, e]))
      setCoverageExclusions((Array.isArray(exclusions) ? exclusions : []).map((e: any) => {
        const master = masterExclMap.get(e.piExclusionId)
        return { ...e, text: e.customText || master?.text || e.text || '' }
      }))
      // Resolve clause names — clauses reference master pi_clauses with name+code
      const masterClauseMap = new Map((Array.isArray(allClausesMaster) ? allClausesMaster : []).map((c: any) => [c.id, c]))
      // Deduplicate clauses by piClauseId
      const seenClauseIds = new Set<string>()
      const dedupedClauses = (Array.isArray(clauses) ? clauses : []).filter((c: any) => {
        if (seenClauseIds.has(c.piClauseId)) return false
        seenClauseIds.add(c.piClauseId)
        return true
      })
      setCoverageClauses(dedupedClauses.map((c: any) => {
        const master = masterClauseMap.get(c.piClauseId)
        return { ...c, text: master?.name || master?.text || c.text || '', code: master?.code || '' }
      }))
      // For Hull: add hull conditions as clauses if P&I clauses are empty
      const typeCode = q?.quotationTypeCode || policy.quotationTypeCode
      if ((typeCode === 'H' || typeCode === 'W') && dedupedClauses.length === 0) {
        const safeHullConds = Array.isArray(hullConditions) ? hullConditions : []
        const safeAllHullConds = Array.isArray(allHullConditions) ? allHullConditions : []
        const safeHullClauses = Array.isArray(hullClauses) ? hullClauses : []
        const safeHullAlts = Array.isArray(hullAlternatives) ? hullAlternatives : []
        const safeHullAddl = Array.isArray(hullAdditionalConditions) ? hullAdditionalConditions : []
        const selectedAltId = policy.selectedAlternativeId
        // Get selected alt's clause
        const selectedAlt = selectedAltId ? safeHullAlts.find((a: any) => a.id === selectedAltId) : safeHullAlts[0]
        const selectedClause = selectedAlt ? safeHullClauses.find((c: any) => c.id === selectedAlt.hullClauseId) : null
        // Filter conditions to selected alt
        const filteredConds = selectedAltId
          ? safeHullConds.filter((c: any) => c.alternativeId === selectedAltId || !c.alternativeId)
          : safeHullConds
        // Dedup
        const seenHull = new Map<string, any>()
        for (const c of filteredConds.filter((x: any) => x.alternativeId)) seenHull.set(c.hullConditionId, c)
        for (const c of filteredConds.filter((x: any) => !x.alternativeId)) { if (!seenHull.has(c.hullConditionId)) seenHull.set(c.hullConditionId, c) }
        const hullClauseItems = Array.from(seenHull.values()).map((qc: any) => {
          const def = safeAllHullConds.find((c: any) => c.id === qc.hullConditionId)
          return { text: `Cl. ${def?.conditionNumber || '?'} — ${qc.textOverride || def?.text || ''}`, code: `Cl. ${def?.conditionNumber || '?'}` }
        })
        // Add clause description as first item
        if (selectedClause) hullClauseItems.unshift({ text: selectedClause.description || selectedClause.name, code: '' })
        // Add additional conditions
        for (const qa of safeHullAddl) {
          const text = qa.textOverride || (qa as any).text || ''
          if (text) hullClauseItems.push({ text, code: '' })
        }
        setCoverageClauses(hullClauseItems)
      }
      // For Hull/War: add custom exclusions to exclusions
      const safeCustomExcl = Array.isArray(customExclusions) ? customExclusions : []
      if (safeCustomExcl.length > 0) {
        setCoverageExclusions(prev => [...prev, ...safeCustomExcl.map((e: any) => ({ text: e.text || '' }))])
      }
      // Resolve subjectivity text
      const masterSubjMap = new Map((Array.isArray(allSubjectivitiesMaster) ? allSubjectivitiesMaster : []).map((s: any) => [s.id, s]))
      setCoverageSubjectivities((Array.isArray(subjectivities) ? subjectivities : []).map((s: any) => {
        const master = masterSubjMap.get(s.piSubjectivityId)
        return { ...s, text: master?.text || s.text || '' }
      }))
    } catch {
      // Non-critical
    } finally {
      setCoverageLoading(false)
    }
  }, [policy?.quotationId])

  // Load coverage when switching to that tab
  useEffect(() => {
    if (isEditing && activeTab === 'coverage' && !quotationData && !coverageLoading) {
      loadCoverageData()
    }
  }, [isEditing, activeTab, quotationData, coverageLoading, loadCoverageData])

  // Recalculate instalment amounts when premium or commission change
  const recalcInstalments = (newPremium: number, newCommission: number, currentInstalments: typeof editInstalments): typeof editInstalments => {
    if (currentInstalments.length === 0) return currentInstalments
    const perInstPremium = newPremium / currentInstalments.length
    const commRate = newCommission / 100
    return currentInstalments.map(inst => ({
      ...inst,
      premiumAmount: Math.round(perInstPremium * 100) / 100,
      commissionAmount: Math.round(perInstPremium * commRate * 100) / 100
    }))
  }

  // Add instalment row
  const addInstalment = (): void => {
    const next = editInstalments.length + 1
    setEditInstalments(prev => [...prev, {
      instalmentNumber: next,
      dueDate: '',
      premiumAmount: 0,
      commissionAmount: 0,
      isNonRefundable: false
    }])
  }

  // Remove instalment row
  const removeInstalment = (idx: number): void => {
    setEditInstalments(prev => prev.filter((_, i) => i !== idx).map((inst, i) => ({ ...inst, instalmentNumber: i + 1 })))
  }

  // Add address row
  const addAddress = (): void => {
    setEditAddresses(prev => [...prev, { entityId: '', entityName: '', role: '', addressText: '' }])
  }

  // Remove address row
  const removeAddress = (idx: number): void => {
    setEditAddresses(prev => prev.filter((_, i) => i !== idx))
  }

  // Group blue cards by type
  const blueCardsByType = useMemo(() => {
    const grouped: Record<string, BlueCard[]> = {}
    for (const ct of CARD_TYPES) {
      grouped[ct] = blueCards.filter((bc) => bc.cardType === ct)
    }
    return grouped
  }, [blueCards])

  // Get vessel's flag state info
  const vesselFlagState = useMemo(() => {
    if (!policy?.flagStateId || flagStates.length === 0) return null
    return flagStates.find((fs) => fs.id === policy.flagStateId) || null
  }, [policy?.flagStateId, flagStates])

  // Build owner options from vessel assureds
  const ownerOptions = useMemo(() => {
    const opts: Array<{ id: string; name: string; address?: string }> = []
    for (const va of vesselAssureds) {
      const entity = assuredEntities.find((e) => e.id === va.entityId)
      if (entity) {
        opts.push(entity)
      }
    }
    return opts
  }, [vesselAssureds, assuredEntities])

  // Increment card number for reissue
  const incrementCardNumber = (cardNumber: string): string => {
    // Pattern: P26200001/BBC or P26200001-2/BBC
    const match = cardNumber.match(/^(.+?)(-(\d+))?(\/(.+))$/)
    if (!match) return cardNumber + '-2'
    const base = match[1]
    const currentRev = match[3] ? parseInt(match[3]) : 1
    const suffix = match[5] || ''
    return `${base}-${currentRev + 1}/${suffix}`
  }

  // Get today's date as YYYY-MM-DD
  const todayISO = new Date().toISOString().slice(0, 10)

  // Determine if a card type needs addressed-to (BBC/WRC only)
  const needsAddressedTo = (ct: string): boolean => ct === 'BBC' || ct === 'WRC'

  // Open issue modal
  const openIssueModal = (preselectedType?: CardType): void => {
    const ct = preselectedType || 'BBC'
    const defaultPort =
      flagPorts.length === 1
        ? flagPorts[0].name
        : flagPorts.find((p) => p.isDefault)?.name || ''
    const fs = vesselFlagState
    const isRatified =
      ct === 'BBC' ? fs?.ratifiedBunker : ct === 'WRC' ? fs?.ratifiedWreck : false

    setBcForm({
      cardType: ct,
      inceptionDate: policy?.inceptionDate || '',
      expiryDate: policy?.expiryDate || '',
      ownerEntityId: ownerOptions.length > 0 ? ownerOptions[0].id : '',
      ownerName: ownerOptions.length > 0 ? ownerOptions[0].name : '',
      ownerAddress: ownerOptions.length > 0 ? ownerOptions[0].address || '' : '',
      portOfRegistry: defaultPort,
      addressedToFlagId: isRatified && fs ? fs.id : '',
      addressedToName: isRatified && fs ? fs.authorityName || '' : '',
      addressedToAddress: isRatified && fs ? fs.authorityAddress || '' : '',
      cancelReplace: false,
      cancelReplaceText: ''
    })
    setBcModalMode('issue')
    setBcPreselectedType(preselectedType || null)
    setBcEditId(null)
    setBcReissueSource(null)
    setBcModalOpen(true)
  }

  // Open reissue modal from existing card
  const openReissueModal = (card: BlueCard): void => {
    const fs = vesselFlagState
    const ct = card.cardType
    const isRatified =
      ct === 'BBC' ? fs?.ratifiedBunker : ct === 'WRC' ? fs?.ratifiedWreck : false

    // Check if periods overlap (old card still active during new period)
    const hasOverlap = card.status === 'active'

    setBcForm({
      cardType: ct as CardType,
      inceptionDate: policy?.inceptionDate || card.expiryDate || '',
      expiryDate: policy?.expiryDate || '',
      ownerEntityId: card.ownerEntityId || '',
      ownerName: card.ownerName || '',
      ownerAddress: card.ownerAddress || '',
      portOfRegistry: card.portOfRegistry || '',
      addressedToFlagId:
        card.addressedToFlagId || (isRatified && fs ? fs.id : ''),
      addressedToName:
        card.addressedToName || (isRatified && fs ? fs.authorityName || '' : ''),
      addressedToAddress:
        card.addressedToAddress ||
        (isRatified && fs ? fs.authorityAddress || '' : ''),
      cancelReplace: hasOverlap,
      cancelReplaceText: hasOverlap
        ? `This certificate cancels and replaces certificate ${card.cardNumber} issued on ${card.issuedDate || 'N/A'}.`
        : ''
    })
    setBcModalMode('reissue')
    setBcPreselectedType(ct as CardType)
    setBcEditId(null)
    setBcReissueSource(card)
    setBcModalOpen(true)
  }

  // Open edit modal
  const openEditModal = (card: BlueCard): void => {
    setBcForm({
      cardType: card.cardType as CardType,
      inceptionDate: card.inceptionDate || '',
      expiryDate: card.expiryDate || '',
      ownerEntityId: card.ownerEntityId || '',
      ownerName: card.ownerName || '',
      ownerAddress: card.ownerAddress || '',
      portOfRegistry: card.portOfRegistry || '',
      addressedToFlagId: card.addressedToFlagId || '',
      addressedToName: card.addressedToName || '',
      addressedToAddress: card.addressedToAddress || '',
      cancelReplace: !!card.cancelReplaceText,
      cancelReplaceText: card.cancelReplaceText || ''
    })
    setBcModalMode('edit')
    setBcPreselectedType(card.cardType as CardType)
    setBcEditId(card.id)
    setBcReissueSource(null)
    setBcModalOpen(true)
  }

  // Handle owner selection change
  const handleOwnerChange = (entityId: string): void => {
    if (entityId === '__custom__') {
      setBcForm((f) => ({ ...f, ownerEntityId: '', ownerName: '', ownerAddress: '' }))
      return
    }
    const entity = assuredEntities.find((e) => e.id === entityId)
    if (entity) {
      setBcForm((f) => ({
        ...f,
        ownerEntityId: entity.id,
        ownerName: entity.name,
        ownerAddress: entity.address || ''
      }))
    }
  }

  // Handle addressed-to flag state change
  const handleAddressedToFlagChange = (flagId: string): void => {
    const fs = flagStates.find((f) => f.id === flagId)
    setBcForm((f) => ({
      ...f,
      addressedToFlagId: flagId,
      addressedToName: fs?.authorityName || '',
      addressedToAddress: fs?.authorityAddress || ''
    }))
  }

  // Handle card type change in form
  const handleCardTypeChange = (ct: CardType): void => {
    const fs = vesselFlagState
    const isRatified =
      ct === 'BBC' ? fs?.ratifiedBunker : ct === 'WRC' ? fs?.ratifiedWreck : false
    setBcForm((f) => ({
      ...f,
      cardType: ct,
      addressedToFlagId: isRatified && fs ? fs.id : f.addressedToFlagId,
      addressedToName: isRatified && fs ? fs.authorityName || '' : f.addressedToName,
      addressedToAddress:
        isRatified && fs ? fs.authorityAddress || '' : f.addressedToAddress
    }))
  }

  // Save blue card (issue, reissue, or edit)
  const handleSaveBlueCard = async (): Promise<void> => {
    if (!bcForm.inceptionDate || !bcForm.expiryDate) {
      showError('Inception and expiry dates are required')
      return
    }
    setBcSaving(true)
    try {
      if (bcModalMode === 'edit' && bcEditId) {
        // Update existing card
        await window.api.policyUpdateBlueCard(bcEditId, {
          inceptionDate: bcForm.inceptionDate,
          expiryDate: bcForm.expiryDate,
          ownerEntityId: bcForm.ownerEntityId || null,
          ownerName: bcForm.ownerName || null,
          ownerAddress: bcForm.ownerAddress || null,
          portOfRegistry: bcForm.portOfRegistry || null,
          addressedToFlagId: bcForm.addressedToFlagId || null,
          addressedToName: bcForm.addressedToName || null,
          addressedToAddress: bcForm.addressedToAddress || null,
          cancelReplaceText: bcForm.cancelReplace ? bcForm.cancelReplaceText : null
        })
        showSuccess('Blue card updated')
      } else {
        // Supersede old card if cancel & replace
        if (bcModalMode === 'reissue' && bcReissueSource && bcForm.cancelReplace) {
          await window.api.policySupersedeBlueCard(bcReissueSource.id)
        } else if (bcModalMode === 'issue' && bcForm.cancelReplace) {
          // Supersede any existing active card of this type
          const existing = blueCards.find(
            (bc) => bc.cardType === bcForm.cardType && bc.status === 'active'
          )
          if (existing) {
            await window.api.policySupersedeBlueCard(existing.id)
          }
        }

        // Determine card number
        let cardNumber: string
        if (bcModalMode === 'reissue' && bcReissueSource) {
          cardNumber = incrementCardNumber(bcReissueSource.cardNumber)
        } else {
          // New issue — base from policy number
          const existingOfType = blueCards.filter((bc) => bc.cardType === bcForm.cardType)
          if (existingOfType.length > 0) {
            const maxRev = Math.max(...existingOfType.map((bc) => bc.revisionNumber))
            cardNumber =
              (policy?.policyNumber || '') + '-' + (maxRev + 2) + '/' + bcForm.cardType
          } else {
            cardNumber = (policy?.policyNumber || '') + '/' + bcForm.cardType
          }
        }

        const revisionNumber =
          bcModalMode === 'reissue' && bcReissueSource
            ? bcReissueSource.revisionNumber + 1
            : 0

        await window.api.policyAddBlueCard({
          policyId,
          cardType: bcForm.cardType,
          cardNumber,
          inceptionDate: bcForm.inceptionDate,
          expiryDate: bcForm.expiryDate,
          revisionNumber,
          issuedDate: todayISO,
          status: 'active',
          ownerEntityId: bcForm.ownerEntityId || null,
          ownerName: bcForm.ownerName || null,
          ownerAddress: bcForm.ownerAddress || null,
          portOfRegistry: bcForm.portOfRegistry || null,
          addressedToFlagId: bcForm.addressedToFlagId || null,
          addressedToName: bcForm.addressedToName || null,
          addressedToAddress: bcForm.addressedToAddress || null,
          cancelReplaceText: bcForm.cancelReplace ? bcForm.cancelReplaceText : null
        })
        showSuccess(
          bcModalMode === 'reissue' ? 'Blue card reissued' : 'Blue card issued'
        )
      }
      setBcModalOpen(false)
      // Reload blue cards
      const bc = await window.api.policyGetBlueCards(policyId)
      setBlueCards(Array.isArray(bc) ? bc : [])
    } catch (err: any) {
      showError(err.message || 'Failed to save blue card')
    } finally {
      setBcSaving(false)
    }
  }

  // Export single blue card
  const handleExportSingleBC = async (card: BlueCard): Promise<void> => {
    try {
      const reportSettings = await getReportSettings()
      await exportBlueCardDocx(
        {
          policyNumber: policy?.policyNumber || '',
          vesselName: policy?.vesselName || '',
          imoNumber: policy?.imoNumber || '',
          flagState: policy?.flagStateName || '',
          grossTonnage: policy?.grossTonnage || 0,
          inceptionDate: card.inceptionDate || policy?.inceptionDate || '',
          inceptionTime: policy?.inceptionTime || '',
          expiryDate: card.expiryDate || policy?.expiryDate || '',
          expiryTime: policy?.expiryTime || '',
          timezone: policy?.timezone || 'GMT',
          callSign: policy?.callSign || '',
          portOfRegistry: card.portOfRegistry || '',
          ownerName: card.ownerName || '',
          ownerAddress: card.ownerAddress || '',
          flagAuthorityName: card.addressedToName || '',
          flagAuthorityAddress: card.addressedToAddress || '',
          companyName: reportSettings.companyName || 'Insurance Company',
          cancelReplaceText: card.cancelReplaceText || ''
        },
        card.cardType as 'BBC' | 'WRC' | 'MLC4.2' | 'MLC2.5.2'
      )
      showSuccess(`${card.cardType} blue card exported`)
    } catch (err: any) {
      showError(err.message || 'Failed to export blue card')
    }
  }

  const cardStyle: React.CSSProperties = {
    background: isLight ? '#ffffff' : 'var(--bg-card)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px'
  }

  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--glass-border)'
  }

  const cardTitleStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-primary)'
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }

  const valueStyle: React.CSSProperties = {
    fontSize: '0.88rem',
    color: 'var(--text-primary)',
    fontWeight: 500
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: '0.73rem',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: '0.85rem'
  }

  const exportBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px'
  }

  if (loading) {
    return (
      <div
        style={{
          padding: '32px',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}
      >
        Loading policy...
      </div>
    )
  }

  if (!policy) return null

  const sc = statusColors[policy.status] || statusColors.inactive
  const tc = typeColors[policy.quotationTypeCode] || typeColors.P
  const isPIType = policy.quotationTypeCode === 'P'
  const commissionAmount =
    policy.commissionPercent && policy.premiumAmount
      ? Math.round((policy.commissionPercent / 100) * policy.premiumAmount * 100) / 100
      : null
  const netPremium =
    policy.premiumAmount && commissionAmount != null
      ? Math.round((policy.premiumAmount - commissionAmount) * 100) / 100
      : null

  const handleExportPolicy = async () => {
    setExportingPolicy(true)
    try {
      await exportPolicyDocx(policyId)
      showSuccess('Policy document exported')
      await loadData() // Reload to update exportedAt (hides Edit button)
    } catch (err: any) {
      showError(err.message || 'Failed to export policy')
    } finally {
      setExportingPolicy(false)
    }
  }

  const handleExportDA = async () => {
    setExportingDA(true)
    try {
      await exportDebitAdviceDocx(policyId)
      showSuccess('Debit advice exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export debit advice')
    } finally {
      setExportingDA(false)
    }
  }

  const handleExportCA = async () => {
    setExportingCA(true)
    try {
      await exportCreditAdviceDocx(policyId)
      showSuccess('Credit advice exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export credit advice')
    } finally {
      setExportingCA(false)
    }
  }

  const handleExportBC = async () => {
    setExportingBC(true)
    try {
      if (blueCards.length === 0) {
        showError('No blue cards found for this policy')
        return
      }
      const cardTypes = blueCards.map((bc) => bc.cardType as 'BBC' | 'WRC' | 'MLC4.2' | 'MLC2.5.2')
      const reportSettings = await getReportSettings()
      await exportBlueCardsDocx(
        {
          policyNumber: policy.policyNumber || '',
          vesselName: policy.vesselName || '',
          imoNumber: policy.imoNumber || '',
          flagState: policy.flagStateName || '',
          grossTonnage: policy.grossTonnage || 0,
          inceptionDate: policy.inceptionDate || '',
          inceptionTime: policy.inceptionTime || '',
          expiryDate: policy.expiryDate || '',
          expiryTime: policy.expiryTime || '',
          timezone: policy.timezone || 'GMT',
          callSign: policy.callSign || '',
          companyName: reportSettings.companyName || 'Insurance Company'
        },
        cardTypes
      )
      showSuccess('Blue cards exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export blue cards')
    } finally {
      setExportingBC(false)
    }
  }

  const handleExportQuickBooks = async () => {
    setExportingQB(true)
    try {
      await exportPolicyToQuickBooks(policyId)
      showSuccess('QuickBooks Excel exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export QuickBooks Excel')
    } finally {
      setExportingQB(false)
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          className="btn-secondary"
          style={{ padding: '8px', display: 'flex', alignItems: 'center' }}
          title="Back to Policies"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
          >
            <h1
              style={{
                fontSize: '1.6rem',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <FileCheck size={26} />
              {policy.policyNumber || 'Untitled Policy'}{policy.revisionNumber > 0 ? `-R${policy.revisionNumber}` : ''}
            </h1>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: tc.bg,
                color: isLight ? tc.lightText : tc.text
              }}
            >
              {policy.quotationTypeName}
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: sc.bg,
                color: sc.text
              }}
            >
              {policy.status}
            </span>
            {policy.revisionNumber > 0 && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  background: 'rgba(100, 100, 255, 0.10)',
                  color: isLight ? '#4a4adf' : '#6464ff'
                }}
              >
                Rev. {policy.revisionNumber}
              </span>
            )}
            {isEditing && (
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: 'rgba(255, 176, 32, 0.15)',
                  color: isLight ? '#b07a10' : '#ffb020'
                }}
              >
                Editing
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {!isEditing && hasPermission('policies:manage') && policy.status === 'active' && (
            <>
              {!policy.exportedAt && (
                <button
                  className="btn-primary"
                  style={{ ...exportBtnStyle, fontWeight: 700 }}
                  onClick={enterEditMode}
                  title="Edit Policy"
                >
                  <Edit3 size={14} /> Edit Policy
                </button>
              )}
              <button
                className="btn-secondary"
                style={exportBtnStyle}
                onClick={handleCreateRevision}
                title="Create New Revision"
              >
                <Copy size={14} /> New Revision
              </button>
            </>
          )}
          {!isEditing && hasPermission('quotations:create') && policy.status === 'active' && (
            <button
              className="btn-secondary"
              style={{ ...exportBtnStyle, background: 'rgba(0, 200, 100, 0.12)', color: isLight ? '#008844' : '#00c864', border: '1px solid rgba(0, 200, 100, 0.3)' }}
              disabled={renewing}
              onClick={() => {
                setConfirmation({
                  show: true,
                  title: 'Create Renewal Quotation?',
                  message: 'Create a new quotation pre-filled from this policy for renewal? The period will be advanced by one year.',
                  onConfirm: async () => {
                    setConfirmation(prev => ({ ...prev, show: false }))
                    setRenewing(true)
                    try {
                      const result = await window.api.policyRenew(policyId)
                      if (result && result.quotationId) {
                        showSuccess('Renewal quotation created')
                        if (onNavigateToQuotation) {
                          onNavigateToQuotation(result.quotationId)
                        }
                      } else {
                        showError('Failed to create renewal quotation')
                      }
                    } catch (err: any) {
                      showError(err.message || 'Failed to create renewal quotation')
                    } finally {
                      setRenewing(false)
                    }
                  }
                })
              }}
              title="Create renewal quotation"
            >
              {renewing ? <Loader2 size={14} className="spinner" /> : <RefreshCw size={14} />} Renew
            </button>
          )}
          <button
            className="btn-secondary"
            style={exportBtnStyle}
            onClick={handleExportPolicy}
            disabled={exportingPolicy}
            title="Export Policy DOCX"
          >
            {exportingPolicy ? (
              <Loader2 size={14} className="spinner" />
            ) : (
              <Download size={14} />
            )}
            Export Policy
          </button>
          <button
            className="btn-secondary"
            style={exportBtnStyle}
            onClick={handleExportDA}
            disabled={exportingDA}
            title="Export Debit Advice DOCX"
          >
            {exportingDA ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
            Export DA
          </button>
          {commissionAmount != null && commissionAmount > 0 && (
            <button
              className="btn-secondary"
              style={exportBtnStyle}
              onClick={handleExportCA}
              disabled={exportingCA}
              title="Export Credit Advice DOCX"
            >
              {exportingCA ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              Export CA
            </button>
          )}
          {isPIType && blueCards.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className="btn-secondary"
                style={exportBtnStyle}
                onClick={() => setBcDropdownOpen(!bcDropdownOpen)}
                disabled={exportingBC}
                title="Export Blue Cards"
              >
                {exportingBC ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
                Blue Cards ▾
              </button>
              {bcDropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                  background: isLight ? '#ffffff' : '#1a1d28',
                  border: '1px solid var(--glass-border)', borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 100, minWidth: '200px',
                  overflow: 'hidden'
                }}>
                  {blueCards.filter(bc => bc.status === 'active').map(bc => (
                    <button
                      key={bc.id}
                      onClick={async () => {
                        setBcDropdownOpen(false)
                        setExportingBC(true)
                        try {
                          await handleExportSingleBC(bc)
                          showSuccess(`${bc.cardType} exported`)
                        } catch (err: any) { showError(err.message || 'Export failed') }
                        finally { setExportingBC(false) }
                      }}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '10px 16px', background: 'transparent',
                        border: 'none', borderBottom: '1px solid var(--table-border)',
                        cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)'
                      }}
                      className="hover-effect"
                    >
                      <Download size={13} style={{ marginRight: '8px', opacity: 0.6 }} />
                      {bc.cardNumber || bc.cardType}
                    </button>
                  ))}
                  <button
                    onClick={async () => {
                      setBcDropdownOpen(false)
                      handleExportBC()
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 16px', background: 'transparent',
                      border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                      color: isLight ? '#007a91' : '#00aac8', fontWeight: 600
                    }}
                    className="hover-effect"
                  >
                    <Download size={13} style={{ marginRight: '8px' }} />
                    Export All Cards
                  </button>
                </div>
              )}
            </div>
          )}
          <button
            className="btn-secondary"
            style={{ ...exportBtnStyle, background: 'rgba(0, 170, 200, 0.10)', color: isLight ? '#007a91' : '#00aac8', border: '1px solid rgba(0, 170, 200, 0.25)' }}
            onClick={handleExportQuickBooks}
            disabled={exportingQB}
            title="Export to QuickBooks Excel"
          >
            {exportingQB ? <Loader2 size={14} className="spinner" /> : <FileSpreadsheet size={14} />}
            QB Export
          </button>
          {hasPermission('policies:manage') && (
            <button
              onClick={() => setConfirmation({
                show: true,
                title: 'Delete Policy?',
                message: `Delete policy ${policy.policyNumber}? This cannot be undone.`,
                isDangerous: true,
                onConfirm: async () => {
                  setConfirmation(prev => ({ ...prev, show: false }))
                  try {
                    await window.api.policyDelete(policyId)
                    showSuccess('Policy deleted')
                    onBack()
                  } catch (err: any) {
                    showError(err.message || 'Failed to delete')
                  }
                }
              })}
              style={{
                background: 'transparent',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                padding: '6px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* ─── EDIT MODE ─── */}
      {isEditing && (
        <>
          {/* Tab bar */}
          <div style={{
            display: 'flex',
            gap: '4px',
            marginBottom: '20px',
            borderBottom: '1px solid var(--glass-border)',
            paddingBottom: '0'
          }}>
            {([
              { key: 'overview', label: 'Overview', icon: <Ship size={15} /> },
              { key: 'insured', label: 'Insured', icon: <Users size={15} /> },
              { key: 'premium', label: 'Premium', icon: <DollarSign size={15} /> },
              { key: 'coverage', label: 'Coverage', icon: <Shield size={15} /> }
            ] as { key: EditTab; label: string; icon: React.ReactNode }[]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '10px 18px',
                  fontSize: '0.82rem',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: activeTab === tab.key ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  color: activeTab === tab.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  marginBottom: '-1px'
                }}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Ship size={18} style={{ color: 'var(--accent-primary)' }} />
                <span style={cardTitleStyle}>Overview & Period</span>
              </div>

              {/* Vessel info (read-only) */}
              <div style={{ marginBottom: '20px', padding: '12px 16px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{policy.vesselName || '-'}</span>
                  {policy.imoNumber && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>IMO {policy.imoNumber}</span>}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {[policy.vesselType, policy.flagStateName, policy.builtYear ? `Built ${policy.builtYear}` : null, policy.grossTonnage ? `GT ${Number(policy.grossTonnage).toLocaleString()}` : null].filter(Boolean).join(' | ')}
                </div>
                {policy.customerName && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Customer: {policy.customerName}</div>}
              </div>

              {/* Editable period */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Inception Date</label>
                  <input
                    type="date"
                    value={editInception}
                    onChange={e => setEditInception(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Inception Time</label>
                  <input
                    type="time"
                    value={editInceptionTime}
                    onChange={e => setEditInceptionTime(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Date</label>
                  <input
                    type="date"
                    value={editExpiry}
                    onChange={e => setEditExpiry(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Expiry Time</label>
                  <input
                    type="time"
                    value={editExpiryTime}
                    onChange={e => setEditExpiryTime(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Timezone</label>
                <select
                  value={editTimezone}
                  onChange={e => setEditTimezone(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                >
                  {DEFAULT_TIMEZONE_OPTIONS.map(tz => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                  {editTimezone && !DEFAULT_TIMEZONE_OPTIONS.includes(editTimezone) && (
                    <option value={editTimezone}>{editTimezone}</option>
                  )}
                </select>
              </div>

              {/* Cancel & Replace */}
              <div style={{
                padding: '12px',
                borderRadius: '8px',
                background: editCancelReplace ? (isLight ? 'rgba(255, 176, 32, 0.06)' : 'rgba(255, 176, 32, 0.08)') : 'transparent',
                border: editCancelReplace ? '1px solid rgba(255, 176, 32, 0.2)' : '1px solid transparent'
              }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500 }}>
                  <input type="checkbox" checked={editCancelReplace} onChange={e => setEditCancelReplace(e.target.checked)} />
                  Cancel & Replace
                </label>
                {editCancelReplace && (
                  <textarea
                    placeholder="Cancel & replace text..."
                    value={editCancelReplaceText}
                    onChange={e => setEditCancelReplaceText(e.target.value)}
                    rows={2}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical', marginTop: '8px' }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Insured Tab */}
          {activeTab === 'insured' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Users size={18} style={{ color: '#6464ff' }} />
                <span style={cardTitleStyle}>Addresses</span>
                <button
                  className="btn-secondary"
                  style={{ marginLeft: 'auto', padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={addAddress}
                >
                  <Plus size={13} /> Add Address
                </button>
              </div>

              {editAddresses.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No addresses. Click "Add Address" to add one.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {editAddresses.map((addr, idx) => (
                  <div key={idx} style={{ padding: '14px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)', position: 'relative' }}>
                    <button
                      onClick={() => removeAddress(idx)}
                      style={{ position: 'absolute', top: '8px', right: '8px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}
                      title="Remove address"
                    >
                      <X size={16} />
                    </button>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                      <div>
                        <label style={labelStyle}>Entity</label>
                        <select
                          value={addr.entityId || ''}
                          onChange={e => {
                            const ent = assuredEntities.find(en => en.id === e.target.value)
                            setEditAddresses(prev => prev.map((a, i) => i === idx ? { ...a, entityId: e.target.value, entityName: ent?.name || a.entityName } : a))
                          }}
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                        >
                          <option value="">Select entity...</option>
                          {assuredEntities.map(ent => (
                            <option key={ent.id} value={ent.id}>{ent.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Role</label>
                        <input
                          type="text"
                          value={addr.role}
                          onChange={e => setEditAddresses(prev => prev.map((a, i) => i === idx ? { ...a, role: e.target.value } : a))}
                          placeholder="e.g. Assured, Owner..."
                          style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Address</label>
                      <textarea
                        value={addr.addressText}
                        onChange={e => setEditAddresses(prev => prev.map((a, i) => i === idx ? { ...a, addressText: e.target.value } : a))}
                        placeholder="Full address..."
                        rows={2}
                        style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Premium Tab */}
          {activeTab === 'premium' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <DollarSign size={18} style={{ color: '#00c864' }} />
                <span style={cardTitleStyle}>Financial Details</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>Premium Amount</label>
                  <input
                    type="number"
                    value={editPremium || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0
                      setEditPremium(val)
                      setEditInstalments(prev => recalcInstalments(val, editCommission, prev))
                    }}
                    step="0.01"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Commission %</label>
                  <input
                    type="number"
                    value={editCommission || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0
                      setEditCommission(val)
                      setEditInstalments(prev => recalcInstalments(editPremium, val, prev))
                    }}
                    step="0.01"
                    min="0"
                    max="100"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Bank</label>
                  <select
                    value={editBankId}
                    onChange={e => setEditBankId(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                  >
                    <option value="">No bank selected</option>
                    {banks.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Instalments */}
              <div style={{ marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <span style={{ ...labelStyle, marginBottom: 0 }}>Instalments</span>
                  <button
                    className="btn-secondary"
                    style={{ padding: '3px 10px', fontSize: '0.72rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                    onClick={addInstalment}
                  >
                    <Plus size={12} /> Add
                  </button>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Changing premium recalculates instalment amounts
                  </span>
                </div>

                {editInstalments.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Due Date</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Premium</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Commission</th>
                        <th style={{ ...thStyle, textAlign: 'center' }}>NR</th>
                        <th style={{ ...thStyle, width: '40px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editInstalments.map((inst, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid var(--table-border)', background: idx % 2 === 0 ? 'transparent' : isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
                          <td style={tdStyle}>{inst.instalmentNumber}</td>
                          <td style={tdStyle}>
                            <input
                              type="date"
                              value={inst.dueDate}
                              onChange={e => setEditInstalments(prev => prev.map((r, i) => i === idx ? { ...r, dueDate: e.target.value } : r))}
                              style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                            />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <input
                              type="number"
                              value={inst.premiumAmount || ''}
                              onChange={e => setEditInstalments(prev => prev.map((r, i) => i === idx ? { ...r, premiumAmount: parseFloat(e.target.value) || 0 } : r))}
                              step="0.01"
                              style={{ width: '120px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.82rem', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <input
                              type="number"
                              value={inst.commissionAmount || ''}
                              onChange={e => setEditInstalments(prev => prev.map((r, i) => i === idx ? { ...r, commissionAmount: parseFloat(e.target.value) || 0 } : r))}
                              step="0.01"
                              style={{ width: '120px', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : '#23263a', color: 'var(--text-primary)', fontSize: '0.82rem', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <input type="checkbox" checked={inst.isNonRefundable} onChange={e => setEditInstalments(prev => prev.map((r, i) => i === idx ? { ...r, isNonRefundable: e.target.checked } : r))} />
                          </td>
                          <td style={tdStyle}>
                            <button
                              onClick={() => removeInstalment(idx)}
                              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}
                              title="Remove instalment"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* Coverage Tab (read-only) */}
          {activeTab === 'coverage' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Shield size={18} style={{ color: '#00aac8' }} />
                <span style={cardTitleStyle}>Coverage</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginLeft: '8px' }}>
                  Read-only — sourced from linked quotation
                </span>
                {onNavigateToQuotation && policy.quotationId && (
                  <button
                    className="btn-secondary"
                    style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                    onClick={async () => {
                      try {
                        // Auto-create quotation revision and navigate to it
                        const newRevision = await window.api.createQuotationRevision(policy.quotationId)
                        if (newRevision && !(newRevision as any).error) {
                          const revId = typeof newRevision === 'string' ? newRevision : (newRevision.id || policy.quotationId)
                          // Find the new alternative ID that corresponds to the selected one
                          let newSelectedAltId: string | null = null
                          if (policy.selectedAlternativeId) {
                            // Get old alternatives to find the hull_clause_id of the selected one
                            const oldAlts = await window.api.hullGetQuotationAlternatives(policy.quotationId)
                            const selectedOldAlt = Array.isArray(oldAlts) ? oldAlts.find((a: any) => a.id === policy.selectedAlternativeId) : null
                            if (selectedOldAlt) {
                              // Get new alternatives and match by hull_clause_id
                              const newAlts = await window.api.hullGetQuotationAlternatives(revId)
                              const matchingNewAlt = Array.isArray(newAlts) ? newAlts.find((a: any) => a.hullClauseId === selectedOldAlt.hullClauseId) : null
                              if (matchingNewAlt) {
                                newSelectedAltId = matchingNewAlt.id
                                // Strip the non-selected alternative using the NEW ID
                                await window.api.stripNonSelectedAlternative(revId, matchingNewAlt.id)
                              }
                            }
                          }
                          // Update the policy to reference the new quotation revision + new alt ID
                          const updateFields: Record<string, any> = { quotationId: revId }
                          if (newSelectedAltId) updateFields.selectedAlternativeId = newSelectedAltId
                          await window.api.policyUpdate(policy.id, updateFields)
                          showSuccess('Quotation revision created. Navigating to editor...')
                          onNavigateToQuotation(revId, { policyId: policy.id, policyNumber: policy.policyNumber || '' })
                        } else {
                          showError('Failed to create quotation revision')
                        }
                      } catch (err: any) {
                        showError(err.message || 'Failed to create revision')
                      }
                    }}
                  >
                    Edit Coverage in Quotation <ChevronRight size={14} />
                  </button>
                )}
              </div>

              {coverageLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Loader2 size={20} className="spinner" style={{ marginBottom: '8px' }} /> Loading coverage data...
                </div>
              ) : !quotationData ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  No linked quotation data available
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Warranties */}
                  {(coverageWarranties.length > 0 || coverageCustomWarranties.length > 0) && (
                    <div style={{ padding: '12px 16px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: coverageExpanded.warranties ? '10px' : 0 }}
                        onClick={() => setCoverageExpanded(prev => ({ ...prev, warranties: !prev.warranties }))}
                      >
                        <ChevronRight size={16} style={{ transform: coverageExpanded.warranties ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Warranties</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(0, 170, 200, 0.12)', color: isLight ? '#007a91' : '#00aac8' }}>
                          {coverageWarranties.length + coverageCustomWarranties.length}
                        </span>
                      </div>
                      {coverageExpanded.warranties && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {coverageWarranties.map((w: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '4px 0', borderBottom: '1px solid var(--glass-border)' }}>
                              {w.text || w.name || `Warranty ${i + 1}`}
                            </div>
                          ))}
                          {coverageCustomWarranties.map((cw: any, i: number) => (
                            <div key={`cw-${i}`} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '4px 0', borderBottom: '1px solid var(--glass-border)', fontStyle: 'italic' }}>
                              {cw.text || `Custom Warranty ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Deductibles */}
                  {coverageDeductibles.length > 0 && (
                    <div style={{ padding: '12px 16px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: coverageExpanded.deductibles ? '10px' : 0 }}
                        onClick={() => setCoverageExpanded(prev => ({ ...prev, deductibles: !prev.deductibles }))}
                      >
                        <ChevronRight size={16} style={{ transform: coverageExpanded.deductibles ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Deductibles</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(0, 170, 200, 0.12)', color: isLight ? '#007a91' : '#00aac8' }}>
                          {coverageDeductibles.length}
                        </span>
                      </div>
                      {coverageExpanded.deductibles && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {coverageDeductibles.map((d: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '4px 0', borderBottom: '1px solid var(--glass-border)' }}>
                              {d.text || d.name || `Deductible ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Exclusions */}
                  {coverageExclusions.length > 0 && (
                    <div style={{ padding: '12px 16px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: coverageExpanded.exclusions ? '10px' : 0 }}
                        onClick={() => setCoverageExpanded(prev => ({ ...prev, exclusions: !prev.exclusions }))}
                      >
                        <ChevronRight size={16} style={{ transform: coverageExpanded.exclusions ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Exclusions</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(0, 170, 200, 0.12)', color: isLight ? '#007a91' : '#00aac8' }}>
                          {coverageExclusions.length}
                        </span>
                      </div>
                      {coverageExpanded.exclusions && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {coverageExclusions.map((ex: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '4px 0', borderBottom: '1px solid var(--glass-border)' }}>
                              {ex.text || ex.name || `Exclusion ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clauses */}
                  {coverageClauses.length > 0 && (
                    <div style={{ padding: '12px 16px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: coverageExpanded.clauses ? '10px' : 0 }}
                        onClick={() => setCoverageExpanded(prev => ({ ...prev, clauses: !prev.clauses }))}
                      >
                        <ChevronRight size={16} style={{ transform: coverageExpanded.clauses ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Conditions / Clauses</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(0, 170, 200, 0.12)', color: isLight ? '#007a91' : '#00aac8' }}>
                          {coverageClauses.length}
                        </span>
                      </div>
                      {coverageExpanded.clauses && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {coverageClauses.map((c: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '4px 0', borderBottom: '1px solid var(--glass-border)' }}>
                              {c.text || c.name || c.code || `Clause ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subjectivities */}
                  {coverageSubjectivities.length > 0 && (
                    <div style={{ padding: '12px 16px', borderRadius: '8px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)' }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: coverageExpanded.subjectivities ? '10px' : 0 }}
                        onClick={() => setCoverageExpanded(prev => ({ ...prev, subjectivities: !prev.subjectivities }))}
                      >
                        <ChevronRight size={16} style={{ transform: coverageExpanded.subjectivities ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Subjectivities</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, background: 'rgba(0, 170, 200, 0.12)', color: isLight ? '#007a91' : '#00aac8' }}>
                          {coverageSubjectivities.length}
                        </span>
                      </div>
                      {coverageExpanded.subjectivities && (
                        <div style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {coverageSubjectivities.map((s: any, i: number) => (
                            <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-primary)', padding: '4px 0', borderBottom: '1px solid var(--glass-border)' }}>
                              {s.text || s.name || `Subjectivity ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {coverageWarranties.length === 0 && coverageCustomWarranties.length === 0 && coverageDeductibles.length === 0 && coverageExclusions.length === 0 && coverageClauses.length === 0 && coverageSubjectivities.length === 0 && (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      No coverage items found in the linked quotation
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Sticky save/cancel footer */}
          <div style={{
            position: 'sticky',
            bottom: 0,
            padding: '14px 20px',
            marginTop: '16px',
            background: isLight ? '#ffffff' : '#1a1d28',
            border: '1px solid var(--glass-border)',
            borderRadius: '12px',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            zIndex: 10
          }}>
            <button
              className="btn-secondary"
              style={{ padding: '8px 20px', fontSize: '0.85rem' }}
              onClick={() => setIsEditing(false)}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              style={{ padding: '8px 24px', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
              onClick={handleSavePolicy}
              disabled={saving}
            >
              {saving ? <Loader2 size={14} className="spinner" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        </>
      )}

      {/* ─── READ-ONLY VIEW ─── */}
      {!isEditing && (
        <>
      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Overview Card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Ship size={18} style={{ color: 'var(--accent-primary)' }} />
            <span style={cardTitleStyle}>Overview</span>
          </div>

          {/* Vessel */}
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}>Vessel</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={valueStyle}>{policy.vesselName || '-'}</span>
              {policy.imoNumber && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  IMO {policy.imoNumber}
                </span>
              )}
              {onNavigateToVessel && policy.vesselId && (
                <button
                  onClick={() => onNavigateToVessel(policy.vesselId)}
                  className="btn-secondary"
                  style={{
                    padding: '3px 6px',
                    fontSize: '0.72rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  title="View vessel"
                >
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Vessel details grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}
          >
            {policy.vesselType && (
              <div>
                <div style={labelStyle}>Type</div>
                <div style={valueStyle}>{policy.vesselType}</div>
              </div>
            )}
            {policy.flagStateName && (
              <div>
                <div style={labelStyle}>Flag</div>
                <div style={valueStyle}>{policy.flagStateName}</div>
              </div>
            )}
            {policy.builtYear && (
              <div>
                <div style={labelStyle}>Built</div>
                <div style={valueStyle}>{policy.builtYear}</div>
              </div>
            )}
            {policy.grossTonnage && (
              <div>
                <div style={labelStyle}>Gross Tonnage</div>
                <div style={valueStyle}>{Number(policy.grossTonnage).toLocaleString()}</div>
              </div>
            )}
          </div>

          {/* Customer */}
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}>Customer</div>
            <div style={valueStyle}>
              {policy.customerName || (
                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>-</span>
              )}
            </div>
          </div>

          {/* Period */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '12px'
            }}
          >
            <div>
              <div style={labelStyle}>Inception</div>
              <div style={valueStyle}>
                {formatPeriod(policy.inceptionDate, policy.inceptionTime)}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Expiry</div>
              <div style={valueStyle}>
                {formatPeriod(policy.expiryDate, policy.expiryTime)}
              </div>
            </div>
          </div>

          {policy.timezone && (
            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Timezone</div>
              <div style={valueStyle}>{policy.timezone}</div>
            </div>
          )}

          {/* Source quotation */}
          {policy.quotationId && (
            <div>
              <div style={labelStyle}>Source Quotation</div>
              <div style={{ ...valueStyle, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {policy.quotationId}
              </div>
            </div>
          )}
        </div>

        {/* Financial Card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <DollarSign size={18} style={{ color: '#00c864' }} />
            <span style={cardTitleStyle}>Financial Details</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}
          >
            <div>
              <div style={labelStyle}>Premium</div>
              <div style={{ ...valueStyle, fontWeight: 600 }}>
                {formatAmount(policy.premiumAmount)}
              </div>
            </div>
            {policy.perAnnumPremium != null && (
              <div>
                <div style={labelStyle}>Per Annum Premium</div>
                <div style={{ ...valueStyle, fontWeight: 600 }}>
                  {formatAmount(policy.perAnnumPremium)}
                </div>
              </div>
            )}
            {policy.commissionPercent != null && policy.commissionPercent > 0 && (
              <div>
                <div style={labelStyle}>Commission</div>
                <div style={valueStyle}>
                  {policy.commissionPercent}%
                  {commissionAmount != null && (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>
                      ({formatAmount(commissionAmount)})
                    </span>
                  )}
                </div>
              </div>
            )}
            {netPremium != null && (
              <div>
                <div style={labelStyle}>Net Premium</div>
                <div style={{ ...valueStyle, fontWeight: 600, color: isLight ? '#047857' : '#34d399' }}>
                  {formatAmount(netPremium)}
                </div>
              </div>
            )}
            {policy.bankName && (
              <div>
                <div style={labelStyle}>Bank</div>
                <div style={valueStyle}>{policy.bankName}</div>
              </div>
            )}
            {policy.proRata && (
              <div>
                <div style={labelStyle}>Pro Rata</div>
                <div style={valueStyle}>Yes</div>
              </div>
            )}
            {policy.exchangeRate != null && policy.exchangeRate !== 1 && (
              <div>
                <div style={labelStyle}>Exchange Rate</div>
                <div style={valueStyle}>{policy.exchangeRate.toFixed(6)}</div>
              </div>
            )}
          </div>

          {/* Instalment table */}
          {instalments.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ ...labelStyle, marginBottom: '8px' }}>Instalments</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Due Date</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Premium</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Commission</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Net</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>NR</th>
                  </tr>
                </thead>
                <tbody>
                  {instalments.map((inst, idx) => (
                    <tr
                      key={inst.instalmentNumber}
                      style={{
                        borderBottom: '1px solid var(--table-border)',
                        background:
                          idx % 2 === 0
                            ? 'transparent'
                            : isLight
                              ? 'rgba(0,0,0,0.02)'
                              : 'rgba(255,255,255,0.02)'
                      }}
                    >
                      <td style={tdStyle}>{inst.instalmentNumber}</td>
                      <td style={tdStyle}>
                        {inst.dueDate ? formatDateShort(inst.dueDate) : '-'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                        {formatAmount(inst.premiumAmount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatAmount(inst.commissionAmount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: isLight ? '#047857' : '#34d399' }}>
                        {formatAmount((inst.premiumAmount || 0) - (inst.commissionAmount || 0))}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {inst.isNonRefundable ? (
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              background: 'rgba(255, 176, 32, 0.15)',
                              color: '#ffb020'
                            }}
                          >
                            NR
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {policy.premiumAmount == null && instalments.length === 0 && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem'
              }}
            >
              No financial data recorded
            </div>
          )}
        </div>
      </div>

      {/* Addresses Card */}
      {addresses.length > 0 && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Users size={18} style={{ color: '#6464ff' }} />
            <span style={cardTitleStyle}>Addresses</span>
            <span
              style={{
                marginLeft: 'auto',
                padding: '2px 10px',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: 'rgba(100, 100, 255, 0.12)',
                color: isLight ? '#4a4adf' : '#6464ff'
              }}
            >
              {addresses.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {addresses.map((addr, idx) => (
              <div
                key={`${addr.entityId}-${idx}`}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {addr.entityName}
                  </span>
                  {addr.role && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background: 'rgba(0, 170, 200, 0.08)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {addr.role}
                    </span>
                  )}
                </div>
                {addr.addressText && (
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px'
                    }}
                  >
                    <MapPin size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
                    {addr.addressText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blue Cards Section */}
      {isPIType && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <CreditCard size={18} style={{ color: '#00aac8' }} />
            <span style={cardTitleStyle}>Blue Cards</span>
            {blueCards.length > 0 && (
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: '10px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  background: 'rgba(0, 170, 200, 0.12)',
                  color: isLight ? '#007a91' : '#00aac8'
                }}
              >
                {blueCards.length}
              </span>
            )}
            <button
              className="btn-primary"
              style={{
                marginLeft: 'auto',
                padding: '5px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
              onClick={() => openIssueModal()}
            >
              <Plus size={14} /> Issue New
            </button>
          </div>

          {/* Card type groups */}
          {CARD_TYPES.map((ct) => {
            const cards = blueCardsByType[ct] || []
            return (
              <div key={ct} style={{ marginBottom: '16px' }}>
                {/* Type header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    padding: '6px 0'
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#00aac8',
                      flexShrink: 0
                    }}
                  />
                  <span
                    style={{
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      color: 'var(--text-primary)'
                    }}
                  >
                    {ct}
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 400
                    }}
                  >
                    {CARD_TYPE_LABELS[ct] || ''}
                  </span>
                  {cards.length === 0 && (
                    <>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                          marginLeft: '8px'
                        }}
                      >
                        No cards issued
                      </span>
                      <button
                        className="btn-secondary"
                        style={{
                          padding: '3px 10px',
                          fontSize: '0.72rem',
                          marginLeft: '4px'
                        }}
                        onClick={() => openIssueModal(ct)}
                      >
                        Issue
                      </button>
                    </>
                  )}
                </div>

                {/* Cards for this type */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '16px' }}>
                  {cards.map((card) => {
                    const isActive = card.status === 'active'
                    const isSuperseded = card.status === 'superseded'
                    return (
                      <div
                        key={card.id}
                        style={{
                          padding: '12px 16px',
                          borderRadius: '8px',
                          background: isSuperseded
                            ? isLight
                              ? 'rgba(0,0,0,0.03)'
                              : 'rgba(255,255,255,0.02)'
                            : isLight
                              ? 'rgba(0, 170, 200, 0.04)'
                              : 'rgba(0, 170, 200, 0.06)',
                          border: `1px solid ${
                            isSuperseded
                              ? 'var(--glass-border)'
                              : isLight
                                ? 'rgba(0, 170, 200, 0.2)'
                                : 'rgba(0, 170, 200, 0.15)'
                          }`,
                          opacity: isSuperseded ? 0.65 : 1
                        }}
                      >
                        {/* Card header row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            marginBottom: '6px'
                          }}
                        >
                          <span
                            style={{
                              fontWeight: 600,
                              fontSize: '0.88rem',
                              color: 'var(--text-primary)'
                            }}
                          >
                            {card.cardNumber || '-'}
                          </span>
                          {/* Status badge */}
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              textTransform: 'uppercase',
                              background: isActive
                                ? 'rgba(0, 200, 100, 0.15)'
                                : 'rgba(150, 150, 150, 0.15)',
                              color: isActive ? '#00c864' : '#999'
                            }}
                          >
                            {card.status}
                          </span>
                          {isActive && (
                            <Check
                              size={14}
                              style={{ color: '#00c864' }}
                            />
                          )}
                          {card.revisionNumber > 0 && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                color: 'var(--text-secondary)',
                                fontWeight: 500
                              }}
                            >
                              Rev. {card.revisionNumber}
                            </span>
                          )}
                        </div>

                        {/* Period */}
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            marginBottom: '4px'
                          }}
                        >
                          Period:{' '}
                          {card.inceptionDate ? formatDateShort(card.inceptionDate) : '?'}{' '}
                          {'\u2192'}{' '}
                          {card.expiryDate ? formatDateShort(card.expiryDate) : '?'}
                          {card.issuedDate && (
                            <span style={{ marginLeft: '12px' }}>
                              Issued: {formatDateShort(card.issuedDate)}
                            </span>
                          )}
                        </div>

                        {/* Owner */}
                        {card.ownerName && (
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-secondary)',
                              marginBottom: '2px'
                            }}
                          >
                            Owner: {card.ownerName}
                          </div>
                        )}

                        {/* Port */}
                        {card.portOfRegistry && (
                          <div
                            style={{
                              fontSize: '0.8rem',
                              color: 'var(--text-secondary)',
                              marginBottom: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <MapPin size={12} />
                            Port: {card.portOfRegistry}
                          </div>
                        )}

                        {/* Cancel & Replace text */}
                        {card.cancelReplaceText && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: isLight ? '#b07a10' : '#ffb020',
                              fontStyle: 'italic',
                              marginTop: '4px'
                            }}
                          >
                            {card.cancelReplaceText}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            marginTop: '8px'
                          }}
                        >
                          <button
                            className="btn-secondary"
                            style={{
                              padding: '3px 10px',
                              fontSize: '0.72rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            onClick={() => handleExportSingleBC(card)}
                          >
                            <Download size={12} /> Export
                          </button>
                          {isActive && (
                            <>
                              <button
                                className="btn-secondary"
                                style={{
                                  padding: '3px 10px',
                                  fontSize: '0.72rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={() => openReissueModal(card)}
                              >
                                <RefreshCw size={12} /> Reissue
                              </button>
                              <button
                                className="btn-secondary"
                                style={{
                                  padding: '3px 10px',
                                  fontSize: '0.72rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                                onClick={() => openEditModal(card)}
                              >
                                <Edit3 size={12} /> Edit
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Blue Card Issue/Reissue/Edit Modal */}
      {bcModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setBcModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: isLight ? '#ffffff' : '#1a1d28',
              borderRadius: '14px',
              padding: '24px',
              width: '560px',
              maxHeight: '85vh',
              overflowY: 'auto',
              border: '1px solid var(--glass-border)'
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px'
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <CreditCard size={20} style={{ color: '#00aac8' }} />
                {bcModalMode === 'edit'
                  ? 'Edit Blue Card'
                  : bcModalMode === 'reissue'
                    ? 'Reissue Blue Card'
                    : 'Issue New Blue Card'}
              </h3>
              <button
                onClick={() => setBcModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '4px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Card Type */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Card Type</label>
              {bcModalMode === 'edit' || bcPreselectedType ? (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(0, 170, 200, 0.08)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: isLight ? '#007a91' : '#00aac8'
                  }}
                >
                  {bcForm.cardType} — {CARD_TYPE_LABELS[bcForm.cardType]}
                </div>
              ) : (
                <select
                  value={bcForm.cardType}
                  onChange={(e) => handleCardTypeChange(e.target.value as CardType)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                >
                  {CARD_TYPES.map((ct) => (
                    <option key={ct} value={ct}>
                      {ct} — {CARD_TYPE_LABELS[ct]}
                    </option>
                  ))}
                </select>
              )}
              <div
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  marginTop: '4px',
                  fontStyle: 'italic'
                }}
              >
                {CARD_TYPE_FULL_NAMES[bcForm.cardType]}
              </div>
            </div>

            {/* Period */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '14px'
              }}
            >
              <div>
                <label style={labelStyle}>Inception Date</label>
                <input
                  type="date"
                  value={bcForm.inceptionDate}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, inceptionDate: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
              <div>
                <label style={labelStyle}>Expiry Date</label>
                <input
                  type="date"
                  value={bcForm.expiryDate}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, expiryDate: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              </div>
            </div>

            {/* Owner */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Owner</label>
              <select
                value={bcForm.ownerEntityId || '__custom__'}
                onChange={(e) => handleOwnerChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--input-border)',
                  background: isLight ? '#fff' : '#23263a',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  marginBottom: '8px'
                }}
              >
                {ownerOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
                <option value="__custom__">Custom...</option>
              </select>
              <input
                type="text"
                placeholder="Owner name"
                value={bcForm.ownerName}
                onChange={(e) =>
                  setBcForm((f) => ({ ...f, ownerName: e.target.value }))
                }
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--input-border)',
                  background: isLight ? '#fff' : '#23263a',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  marginBottom: '8px'
                }}
              />
              <textarea
                placeholder="Owner address"
                value={bcForm.ownerAddress}
                onChange={(e) =>
                  setBcForm((f) => ({ ...f, ownerAddress: e.target.value }))
                }
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--input-border)',
                  background: isLight ? '#fff' : '#23263a',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  resize: 'vertical'
                }}
              />
            </div>

            {/* Port of Registry */}
            <div style={{ marginBottom: '14px' }}>
              <label style={labelStyle}>Port of Registry</label>
              {flagPorts.length > 1 ? (
                <select
                  value={bcForm.portOfRegistry}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, portOfRegistry: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                >
                  <option value="">Select port...</option>
                  {flagPorts.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                      {p.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder={
                    flagPorts.length === 1
                      ? flagPorts[0].name
                      : 'Enter port of registry...'
                  }
                  value={bcForm.portOfRegistry}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, portOfRegistry: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem'
                  }}
                />
              )}
            </div>

            {/* Addressed To (BBC/WRC only) */}
            {needsAddressedTo(bcForm.cardType) && (
              <div
                style={{
                  marginBottom: '14px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)'
                }}
              >
                <label style={{ ...labelStyle, marginBottom: '8px', display: 'block' }}>
                  Addressed To (Flag State Authority)
                </label>

                {/* Ratification warning */}
                {vesselFlagState &&
                  ((bcForm.cardType === 'BBC' && !vesselFlagState.ratifiedBunker) ||
                    (bcForm.cardType === 'WRC' && !vesselFlagState.ratifiedWreck)) && (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        borderRadius: '6px',
                        background: 'rgba(255, 176, 32, 0.12)',
                        color: isLight ? '#b07a10' : '#ffb020',
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        marginBottom: '10px'
                      }}
                    >
                      <AlertTriangle size={14} />
                      {vesselFlagState.name} has not ratified the{' '}
                      {bcForm.cardType === 'BBC' ? 'Bunkers Convention' : 'Wreck Removal Convention'}.
                      Select a ratified flag state below.
                    </div>
                  )}

                <select
                  value={bcForm.addressedToFlagId}
                  onChange={(e) => handleAddressedToFlagChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    marginBottom: '8px'
                  }}
                >
                  <option value="">Select flag state...</option>
                  {flagStates
                    .filter((fs) =>
                      bcForm.cardType === 'BBC' ? fs.ratifiedBunker : fs.ratifiedWreck
                    )
                    .map((fs) => (
                      <option key={fs.id} value={fs.id}>
                        {fs.name}
                        {fs.authorityName ? ` — ${fs.authorityName}` : ''}
                      </option>
                    ))}
                </select>
                <input
                  type="text"
                  placeholder="Authority name"
                  value={bcForm.addressedToName}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, addressedToName: e.target.value }))
                  }
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    marginBottom: '8px'
                  }}
                />
                <textarea
                  placeholder="Authority address"
                  value={bcForm.addressedToAddress}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, addressedToAddress: e.target.value }))
                  }
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {/* Cancel & Replace */}
            <div
              style={{
                marginBottom: '18px',
                padding: '12px',
                borderRadius: '8px',
                background: bcForm.cancelReplace
                  ? isLight
                    ? 'rgba(255, 176, 32, 0.06)'
                    : 'rgba(255, 176, 32, 0.08)'
                  : 'transparent',
                border: bcForm.cancelReplace
                  ? '1px solid rgba(255, 176, 32, 0.2)'
                  : '1px solid transparent'
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: 500
                }}
              >
                <input
                  type="checkbox"
                  checked={bcForm.cancelReplace}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, cancelReplace: e.target.checked }))
                  }
                />
                Cancel & Replace existing card
              </label>
              {bcForm.cancelReplace && (
                <textarea
                  placeholder="Cancel & replace text..."
                  value={bcForm.cancelReplaceText}
                  onChange={(e) =>
                    setBcForm((f) => ({ ...f, cancelReplaceText: e.target.value }))
                  }
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--input-border)',
                    background: isLight ? '#fff' : '#23263a',
                    color: 'var(--text-primary)',
                    fontSize: '0.82rem',
                    resize: 'vertical',
                    marginTop: '8px'
                  }}
                />
              )}
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                className="btn-secondary"
                onClick={() => setBcModalOpen(false)}
                style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveBlueCard}
                disabled={bcSaving}
                style={{
                  padding: '8px 20px',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {bcSaving ? (
                  <Loader2 size={14} className="spinner" />
                ) : bcModalMode === 'edit' ? (
                  'Save Changes'
                ) : bcModalMode === 'reissue' ? (
                  'Reissue Card'
                ) : (
                  'Issue Card'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision History Card */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
          <span style={cardTitleStyle}>Revision History</span>
        </div>
        <RevisionHistorySection policyNumber={policy.policyNumber} currentPolicyId={policyId} onViewRevision={onNavigateToPolicy} />
      </div>
        </>
      )}

      {confirmation.show && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.isDangerous ? 'Delete' : 'Confirm'}
          isDangerous={confirmation.isDangerous}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  )
}

function RevisionHistorySection({ policyNumber, currentPolicyId, onViewRevision }: {
  policyNumber: string
  currentPolicyId: string
  onViewRevision?: (policyId: string) => void
}) {
  const [revisions, setRevisions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { theme } = useTheme()
  const isLight = theme === 'light'

  useEffect(() => {
    if (!policyNumber) { setLoading(false); return }
    (async () => {
      try {
        const revs = await window.api.policyGetRevisions(policyNumber)
        if (Array.isArray(revs)) {
          setRevisions(revs)
        } else {
          // Fallback: just show current policy info
          setRevisions([])
        }
      } catch { /* ignore */ }
      finally { setLoading(false) }
    })()
  }, [policyNumber])

  if (loading) return <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Loading...</div>
  if (revisions.length === 0) return <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>No revision history</div>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--table-border)', textAlign: 'left' }}>
          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Rev</th>
          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Created</th>
          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>By</th>
          <th style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase' }}>Exported</th>
          <th style={{ padding: '8px 12px' }}></th>
        </tr>
      </thead>
      <tbody>
        {revisions.map(rev => {
          const isCurrent = rev.id === currentPolicyId
          return (
            <tr key={rev.id} style={{
              borderBottom: '1px solid var(--table-border)',
              background: isCurrent ? (isLight ? 'rgba(0,170,200,0.06)' : 'rgba(0,170,200,0.08)') : 'transparent'
            }}>
              <td style={{ padding: '8px 12px', fontWeight: isCurrent ? 700 : 400 }}>
                R{rev.revisionNumber}
                {isCurrent && <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 700 }}>CURRENT</span>}
              </td>
              <td style={{ padding: '8px 12px' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: 600,
                  background: rev.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(150,150,150,0.1)',
                  color: rev.status === 'active' ? '#22c55e' : 'var(--text-secondary)',
                  border: `1px solid ${rev.status === 'active' ? 'rgba(34,197,94,0.2)' : 'rgba(150,150,150,0.2)'}`
                }}>{(rev.status || '').toUpperCase()}</span>
              </td>
              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                {rev.createdAt ? formatDate(rev.createdAt) : '-'}
              </td>
              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                {rev.createdByName || '-'}
              </td>
              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>
                {rev.exportedAt ? formatDate(rev.exportedAt) : '-'}
              </td>
              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                {!isCurrent && onViewRevision && (
                  <button
                    onClick={() => onViewRevision(rev.id)}
                    className="btn-secondary"
                    style={{ padding: '3px 10px', fontSize: '0.75rem' }}
                  >
                    View
                  </button>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
