import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  FileCheck,
  Printer,
  Paperclip,
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
  FileSpreadsheet,
  FileArchive,
  MoreHorizontal,
  PenTool,
  LayoutList,
  CalendarDays,
  FolderOpen
} from 'lucide-react'
import CopyInstalmentDatesModal from './CopyInstalmentDatesModal'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateShort, formatDate } from '../utils/dateUtils'
import type { DeclarationFields, BlueCardData } from '../services/PolicyExportService'
import { getReportSettings } from '../services/ReportSettingsService'
import ConfirmationModal from './ConfirmationModal'
import EndorsementManager from './EndorsementManager'
import {
  countDays,
  calcProRataPremium,
  distributeInstalments,
  discountGivenFromPayable
} from '../utils/premiumCalc'
import type { DiscountGiven, GivenDiscount } from '../utils/premiumCalc'
import type {
  Entity,
  FlagState,
  FlagStatePort,
  PIClause,
  PIExclusion,
  PISubjectivity,
  PIWarranty,
  PolicyBlueCard,
  BlueCardOwner,
  PolicyDocAddress,
  PolicyDocInstalment,
  PolicyDocument,
  Quotation,
  QuotationCustomSection,
  QuotationCustomWarranty,
  QuotationHullAdditionalCondition,
  QuotationHullCondition,
  VesselAssured,
  EntityAddress,
  ReceiptPolicySummary
} from '../../../shared/types'
import { splitInstalments, upccPercentFor } from '../../../shared/premium'
import { ok, asArray } from '../utils/ipc'
import { isPiLike } from '../../../shared/quotationTypes'
import { MoneyInput } from './quotation-tabs/shared'
import SectionOrderModal from './quotation-tabs/SectionOrderModal'
import { Modal, Field, Tabs } from './ui'
import { confirmDialog } from './DialogHost'
import { DEFAULT_UPCC_TITLE } from '../utils/surveyWarrantyText'
import { useUnsavedGuard, confirmLeave } from '../utils/useUnsavedGuard'

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
  onNavigateToQuotation?: (
    quotationId: string,
    policyContext?: { policyId: string; policyNumber: string }
  ) => void
  onNavigateToPolicy?: (policyId: string) => void
}

/** The loaded policy (premiumCurrency comes from its quotation) */
type PolicyRecord = PolicyDocument & { premiumCurrency?: string }

/** Instalments may carry a legacy `amount` field */
type Instalment = PolicyDocInstalment & { amount?: number }

type PolicyAddress = PolicyDocAddress

type BlueCard = PolicyBlueCard

/** A master P&I clause; `text` and `code` are read but are not part of PIClause */
type PIClauseMaster = PIClause & { text?: string; code?: string }

/** A read-only coverage line shown in the Coverage tab */
interface CoverageItem {
  id?: string
  text: string
  name?: string
  code?: string
}

type LolOption = Awaited<ReturnType<typeof window.api.lolGetOptions>>[number]

type PolicyRevision = Awaited<ReturnType<typeof window.api.policyGetRevisions>>[number]

type PolicyBundle = [
  PolicyDocument | null,
  PolicyDocInstalment[],
  PolicyDocAddress[],
  PolicyBlueCard[]
]

function fetchPolicyBundle(id: string): Promise<PolicyBundle> {
  return Promise.all([
    window.api.policyGetById(id),
    window.api.policyGetInstalments(id),
    window.api.policyGetAddresses(id),
    window.api.policyGetBlueCards(id)
  ])
}

/** The message of a thrown value, or the fallback (same as `err.message || fallback`) */
function errMessage(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const m = err.message
    if (m) return String(m)
  }
  return fallback
}

const CARD_TYPES = ['BBC', 'WRC', 'MLC4.2', 'MLC2.5.2'] as const
type CardType = (typeof CARD_TYPES)[number]

const CARD_TYPE_LABELS: Record<string, string> = {
  BBC: 'Bunker Oil',
  WRC: 'Wreck Removal',
  'MLC4.2': "Shipowners' Liability",
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
  /** Further assureds printed under the owner */
  additionalOwners: BlueCardOwner[]
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
  cancelled: { bg: 'rgba(255, 77, 77, 0.15)', text: 'var(--danger)' },
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

function formatPeriod(date?: string | null, time?: string | null): string {
  if (!date) return '-'
  const formatted = formatDateShort(date)
  if (time) return `${formatted} ${time}`
  return formatted
}

export default function PolicyDetail({
  policyId,
  onBack,
  onNavigateToVessel,
  onNavigateToQuotation,
  onNavigateToPolicy
}: PolicyDetailProps): React.JSX.Element | null {
  const [policy, setPolicy] = useState<PolicyRecord | null>(null)
  // Read view tabs, their counts, and "Add Endorsement" from the header (remounts the manager in
  // add mode)
  const [readTab, setReadTab] = useState<'overview' | 'blueCards' | 'endorsements' | 'revisions'>(
    'overview'
  )
  const [endorsementCount, setEndorsementCount] = useState<number | null>(null)
  const [revisionCount, setRevisionCount] = useState<number | null>(null)
  const [addEndorsementNonce, setAddEndorsementNonce] = useState(0)
  useEffect(() => {
    if (!policy) return
    let alive = true
    Promise.all([
      window.api.endorsementList(policy.id),
      policy.policyNumber ? window.api.policyGetRevisions(policy.policyNumber) : Promise.resolve([])
    ])
      .then(([ends, revs]) => {
        if (!alive) return
        setEndorsementCount(Array.isArray(ends) ? ends.length : null)
        setRevisionCount(Array.isArray(revs) ? revs.length : null)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [policy])

  // Receipts naming this policy (by id or number)
  const [receiptSummary, setReceiptSummary] = useState<ReceiptPolicySummary | null>(null)
  useEffect(() => {
    if (!policy) return
    let alive = true
    window.api
      .receiptSummaries([policy.id, policy.policyNumber].filter(Boolean) as string[])
      .then((list) => {
        if (!alive || !Array.isArray(list)) return
        // One receipt can be found by both the id and the number: merge without double counting
        const seen = new Set<string>()
        const merged: ReceiptPolicySummary = { key: policy.id, receipts: [], totals: {} }
        for (const s of list)
          for (const r of s.receipts) {
            if (seen.has(r.receiptNumber)) continue
            seen.add(r.receiptNumber)
            merged.receipts.push(r)
            merged.totals[r.currency] = (merged.totals[r.currency] || 0) + r.amount
          }
        setReceiptSummary(merged)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [policy])
  const [instalments, setInstalments] = useState<Instalment[]>([])
  const [addresses, setAddresses] = useState<PolicyAddress[]>([])
  const [blueCards, setBlueCards] = useState<BlueCard[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingPolicy, setExportingPolicy] = useState(false)
  const [exportingDA, setExportingDA] = useState(false)
  const [exportingCA, setExportingCA] = useState(false)
  const [, setExportingBC] = useState(false)
  const [exportingQB, setExportingQB] = useState(false)
  const [exportingPdfTC, setExportingPdfTC] = useState(false)
  // "For signing" PDF or signed scan + T&C being built: the message of the waiting overlay
  const [pdfBusy, setPdfBusy] = useState<string | null>(null)
  const [exportingBundle, setExportingBundle] = useState(false)
  const [showDeclarationModal, setShowDeclarationModal] = useState(false)
  const [declarationFields, setDeclarationFields] = useState<DeclarationFields | null>(null)
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  // Where the Actions menu opens (measured from the button when it is clicked)
  const [actionsMenuPos, setActionsMenuPos] = useState({ top: 0, right: 0 })
  const [confirmation, setConfirmation] = useState<{
    show: boolean
    title: string
    message: string
    onConfirm: () => void
    isDangerous?: boolean
  }>({ show: false, title: '', message: '', onConfirm: () => {} })
  const [, setRenewing] = useState(false)
  const [signing, setSigning] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelMode, setCancelMode] = useState<'instalment' | 'date'>('instalment')
  const [cancelAfterInstalment, setCancelAfterInstalment] = useState(0)
  const [cancelDate, setCancelDate] = useState('')
  const [cancelling, setCancelling] = useState(false)
  // Cancel on date: the NCB/UPCC given can be reclaimed (taken off the return premium). Filled
  // from the quotation when the dialog opens; off by default (only some cancellations)
  const [cancelReclaim, setCancelReclaim] = useState(false)
  const [cancelNcb, setCancelNcb] = useState<{ type: GivenDiscount['type']; value: string }>({
    type: 'pct',
    value: ''
  })
  const [cancelUpcc, setCancelUpcc] = useState<{ type: GivenDiscount['type']; value: string }>({
    type: 'pct',
    value: ''
  })
  // Cancel dialog: the NCB/UPCC this vessel was given, from the quotation
  const cancelQuotationId = showCancelModal ? policy?.quotationId : undefined
  const cancelVesselId = policy?.vesselId
  useEffect(() => {
    if (!cancelQuotationId) return
    let stale = false
    const load = async (): Promise<void> => {
      const [q, qvs] = await Promise.all([
        window.api.getQuotation(cancelQuotationId),
        window.api.getQuotationVessels(cancelQuotationId)
      ])
      if (stale || !q || 'error' in q) return
      const qv = asArray(qvs).find((v) => v.vesselId === cancelVesselId) || null
      const ncbOn = !!q.ncbEnabled && !qv?.ncbExcluded
      const upccOn = !!q.upccEnabled && !qv?.upccExcluded
      setCancelReclaim(false)
      setCancelNcb(
        !ncbOn
          ? { type: 'pct', value: '' }
          : q.ncbDiscountType === 'amount'
            ? { type: 'amount', value: String(q.ncbDiscountAmount || '') }
            : { type: 'pct', value: String(q.ncbDiscountPercent || '') }
      )
      setCancelUpcc(
        !upccOn
          ? { type: 'pct', value: '' }
          : q.upccDiscountType === 'amount'
            ? { type: 'amount', value: String(q.upccDiscountAmount || '') }
            : { type: 'pct', value: String(upccPercentFor(q, qv) || '') }
      )
    }
    void load()
    return () => {
      stale = true
    }
  }, [cancelQuotationId, cancelVesselId])

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
  const [editInstalments, setEditInstalments] = useState<
    {
      instalmentNumber: number
      dueDate: string
      premiumAmount: number
      commissionAmount: number
      isNonRefundable: boolean
    }[]
  >([])
  const [editAddresses, setEditAddresses] = useState<
    { entityId: string; entityName: string; role: string; addressText: string }[]
  >([])
  const [editCancelReplace, setEditCancelReplace] = useState(false)
  const [editCancelReplaceText, setEditCancelReplaceText] = useState('')
  const [editHideBroker, setEditHideBroker] = useState(false)
  const [editSubjectivityDays, setEditSubjectivityDays] = useState(7)
  const [editUpccTitle, setEditUpccTitle] = useState('')
  const [editSectionOrder, setEditSectionOrder] = useState<string[] | null>(null)
  const [showSectionOrder, setShowSectionOrder] = useState(false)

  // Unsaved edits: the edit fields compared with what they held when edit mode opened
  // (baseline taken on the first render in edit mode, reset during render on leaving it)
  const editState = isEditing
    ? JSON.stringify([
        editInception,
        editInceptionTime,
        editExpiry,
        editExpiryTime,
        editTimezone,
        editPremium,
        editCommission,
        editBankId,
        editInstalments,
        editAddresses,
        editCancelReplace,
        editCancelReplaceText,
        editHideBroker,
        editSubjectivityDays,
        editUpccTitle,
        editSectionOrder
      ])
    : null
  const [editBaseline, setEditBaseline] = useState<string | null>(null)
  if (editState !== null && editBaseline === null) setEditBaseline(editState)
  if (editState === null && editBaseline !== null) setEditBaseline(null)
  useUnsavedGuard(editState !== null && editBaseline !== null && editState !== editBaseline)

  // Supplementary data for editing
  const [banks, setBanks] = useState<
    { id: string; name: string; details: string; order: number }[]
  >([])

  // Coverage tab state
  const [quotationData, setQuotationData] = useState<Quotation | null>(null)
  const [coverageWarranties, setCoverageWarranties] = useState<CoverageItem[]>([])
  const [coverageCustomWarranties, setCoverageCustomWarranties] = useState<
    QuotationCustomWarranty[]
  >([])
  const [coverageDeductibles, setCoverageDeductibles] = useState<CoverageItem[]>([])
  const [coverageExclusions, setCoverageExclusions] = useState<CoverageItem[]>([])
  const [coverageClauses, setCoverageClauses] = useState<CoverageItem[]>([])
  const [coverageSubjectivities, setCoverageSubjectivities] = useState<CoverageItem[]>([])
  const [coverageCustomSections, setCoverageCustomSections] = useState<QuotationCustomSection[]>([])
  const [coverageLolOptions, setCoverageLolOptions] = useState<LolOption[]>([])
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageExpanded, setCoverageExpanded] = useState<Record<string, boolean>>({})

  // Blue card management state
  const [bcModalOpen, setBcModalOpen] = useState(false)
  const [bcEditId, setBcEditId] = useState<string | null>(null)
  const [bcModalMode, setBcModalMode] = useState<'issue' | 'reissue' | 'edit'>('issue')
  const [bcPreselectedType, setBcPreselectedType] = useState<CardType | null>(null)
  const [bcReissueSource, setBcReissueSource] = useState<BlueCard | null>(null)
  // Inline "add flag state" from the blue card addressed-to selector
  const [bcAddingFlag, setBcAddingFlag] = useState(false)
  const [newFlagForm, setNewFlagForm] = useState({
    name: '',
    iso3: '',
    ratBunker: false,
    ratWreck: false,
    authName: '',
    authAddr: ''
  })
  const [bcSaving, setBcSaving] = useState(false)
  const [bcForm, setBcForm] = useState<BlueCardFormData>({
    cardType: 'BBC',
    inceptionDate: '',
    expiryDate: '',
    ownerEntityId: '',
    ownerName: '',
    ownerAddress: '',
    additionalOwners: [],
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
  const [entityAddresses, setEntityAddresses] = useState<EntityAddress[]>([])
  const [assuredEntities, setAssuredEntities] = useState<
    Array<{ id: string; name: string; address?: string }>
  >([])

  const { showError, showSuccess } = useToast()
  const { hasPermission, user } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'

  // Set when the policy cannot be loaded; the effect below then goes back to the list
  // (the parent passes a new onBack each render, so the loaders do not call it directly)
  const [policyNotFound, setPolicyNotFound] = useState(false)
  useEffect(() => {
    if (policyNotFound) onBack()
  }, [policyNotFound, onBack])

  const applyPolicyBundle = useCallback(
    (bundle: PolicyBundle): void => {
      const [found, inst, addr, bc] = bundle
      if (!found || ('error' in found && found.error)) {
        showError('Policy not found')
        setPolicyNotFound(true)
        return
      }

      setPolicy(found)
      setInstalments(Array.isArray(inst) ? inst : [])
      setAddresses(Array.isArray(addr) ? addr : [])
      setBlueCards(Array.isArray(bc) ? bc : [])
    },
    [showError]
  )

  // Reload after a change (save, sign, export...)
  const loadData = useCallback(async (): Promise<void> => {
    setLoading(true)
    try {
      applyPolicyBundle(await fetchPolicyBundle(policyId))
    } catch (err) {
      showError(errMessage(err, 'Failed to load policy'))
    } finally {
      setLoading(false)
    }
  }, [policyId, applyPolicyBundle, showError])

  // Show the loading state again when another policy is opened in place (e.g. a new revision)
  const [loadingPolicyId, setLoadingPolicyId] = useState(policyId)
  if (loadingPolicyId !== policyId) {
    setLoadingPolicyId(policyId)
    setLoading(true)
    setPolicyNotFound(false)
  }

  // Initial load, and again whenever the policy id changes
  useEffect(() => {
    let alive = true
    fetchPolicyBundle(policyId)
      .then((bundle) => {
        if (alive) applyPolicyBundle(bundle)
      })
      .catch((err) => {
        if (alive) showError(errMessage(err, 'Failed to load policy'))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [policyId, applyPolicyBundle, showError])

  // Track recent item view when policy loads
  const recentPolicyId = policy?.id
  const recentPolicyNumber = policy?.policyNumber
  const recentVesselName = policy?.vesselName
  useEffect(() => {
    if (!recentPolicyId) return
    window.api
      .recentItemsAdd(
        'policy',
        recentPolicyId,
        recentPolicyNumber || 'Policy',
        recentVesselName || undefined
      )
      .then(() => {
        window.dispatchEvent(new Event('recent-item-added'))
      })
      .catch(() => {})
  }, [recentPolicyId, recentPolicyNumber, recentVesselName])

  // Load supplementary data for blue card management + editing
  useEffect(() => {
    const loadSupplementary = async (): Promise<void> => {
      try {
        const [fs, entities, bnks, addrs] = await Promise.all([
          window.api.getFlagStates(),
          window.api.getEntities(),
          window.api.bankGetAll(),
          window.api.getEntityAddresses()
        ])
        setEntityAddresses(Array.isArray(addrs) ? addrs : [])
        setFlagStates(Array.isArray(fs) ? fs : [])
        setBanks(Array.isArray(bnks) ? bnks : [])
        // Build a simple entity lookup for assured entities
        const entMap = Array.isArray(entities)
          ? entities.map((e: Entity & { address?: string }) => ({
              id: e.id,
              name: e.name,
              address: e.address
            }))
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
    const flagStateId = policy?.flagStateId
    if (!flagStateId) return
    const loadPorts = async (): Promise<void> => {
      try {
        const ports = await window.api.flagStateGetPorts(flagStateId)
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
    setEditInstalments(
      instalments.map((inst) => ({
        instalmentNumber: inst.instalmentNumber,
        dueDate: inst.dueDate || '',
        premiumAmount: inst.premiumAmount || 0,
        commissionAmount: inst.commissionAmount || 0,
        isNonRefundable: inst.isNonRefundable
      }))
    )
    setEditAddresses(
      addresses.map((addr) => ({
        entityId: addr.entityId || '',
        entityName: addr.entityName || '',
        role: addr.role || '',
        addressText: addr.addressText || ''
      }))
    )
    setEditCancelReplace(!!policy.cancelReplaceText)
    setEditCancelReplaceText(policy.cancelReplaceText || '')
    setEditHideBroker(!!policy.hideBroker)
    setEditSubjectivityDays(policy.subjectivityDays ?? 7)
    setEditUpccTitle(policy.upccTitle || '')
    setEditSectionOrder(policy.sectionOrder || null)
    setActiveTab('overview')
    setIsEditing(true)
  }, [policy, instalments, addresses])

  // Save edited policy
  const handleSavePolicy = async (): Promise<void> => {
    if (!policy) return
    setSaving(true)
    try {
      ok(
        await window.api.policyUpdate(policyId, {
          inceptionDate: editInception,
          inceptionTime: editInceptionTime,
          expiryDate: editExpiry,
          expiryTime: editExpiryTime,
          timezone: editTimezone,
          premiumAmount: editPremium,
          commissionPercent: editCommission || null,
          bankId: editBankId || null,
          cancelReplaceText: editCancelReplace ? editCancelReplaceText : null,
          hideBroker: editHideBroker,
          subjectivityDays: editSubjectivityDays,
          upccTitle: editUpccTitle.trim() || null,
          sectionOrder: editSectionOrder,
          // Editing invalidates the frozen export snapshot so the next export re-freezes
          // with the change (exports are otherwise identical on re-export).
          exportSnapshot: null
        })
      )
      await window.api.policySetInstalments(policyId, editInstalments)
      await window.api.policySetAddresses(
        policyId,
        editAddresses.map((a) => ({
          entityId: a.entityId,
          entityName: a.entityName,
          role: a.role,
          addressText: a.addressText
        }))
      )
      // Sync addresses to entity_addresses so they are available system-wide
      for (const addr of editAddresses) {
        if (addr.entityId && addr.addressText && addr.addressText.trim()) {
          try {
            const existing = await window.api.getEntityAddresses(addr.entityId)
            const alreadyExists =
              Array.isArray(existing) &&
              existing.some((ea) => ea.addressLine1?.trim() === addr.addressText?.trim())
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
    } catch (err) {
      showError(errMessage(err, 'Failed to save policy'))
    } finally {
      setSaving(false)
    }
  }

  // Create new revision
  const handleCreateRevision = (): void => {
    setConfirmation({
      show: true,
      title: 'Create Revision?',
      message:
        'Create a new revision of this policy? The current version will be marked as superseded.',
      onConfirm: async () => {
        setConfirmation((prev) => ({ ...prev, show: false }))
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
        } catch (err) {
          showError(errMessage(err, 'Failed to create revision'))
        }
      }
    })
  }

  // Load coverage data from linked quotation
  const loadCoverageData = useCallback(async (): Promise<void> => {
    if (!policy?.quotationId) return
    setCoverageLoading(true)
    try {
      const [
        q,
        warranties,
        customWarranties,
        deductibles,
        exclusions,
        clauses,
        subjectivities,
        allWarranties,
        ,
        allExclusionsMaster,
        allClausesMaster,
        allSubjectivitiesMaster,
        hullConditions,
        hullAdditionalConditions,
        hullClauses,
        allHullConditions,
        hullAlternatives,
        customExclusions
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
      const masterWarrantyMap = new Map(
        (Array.isArray(allWarranties) ? allWarranties : []).map(
          (w): [string, PIWarranty & { name?: string }] => [w.id, w]
        )
      )
      const resolvedWarranties = (Array.isArray(warranties) ? warranties : []).map((w) => {
        const master = masterWarrantyMap.get(w.piWarrantyId)
        return { ...w, text: master?.text || master?.name || '', name: master?.name || '' }
      })
      setCoverageWarranties(resolvedWarranties)
      setCoverageCustomWarranties(Array.isArray(customWarranties) ? customWarranties : [])
      // Resolve deductible text — deductibles have title+description directly
      setCoverageDeductibles(
        (Array.isArray(deductibles) ? deductibles : []).map((d) => {
          const parts = [d.title, d.description].filter(Boolean)
          let text = parts.join(' — ')
          if (d.amount) text += ` ${d.currency || 'USD'} ${Number(d.amount).toLocaleString()}`
          return { ...d, text: text || 'Deductible' }
        })
      )
      // Resolve exclusion text — exclusions have customText or reference master
      const masterExclMap = new Map(
        (Array.isArray(allExclusionsMaster) ? allExclusionsMaster : []).map(
          (e): [string, PIExclusion] => [e.id, e]
        )
      )
      setCoverageExclusions(
        (Array.isArray(exclusions) ? exclusions : []).map(
          (e: { piExclusionId?: string; customText?: string; text?: string }) => {
            const master = e.piExclusionId ? masterExclMap.get(e.piExclusionId) : undefined
            return { ...e, text: e.customText || master?.text || e.text || '' }
          }
        )
      )
      // Resolve clause names — clauses reference master pi_clauses with name+code
      const masterClauseMap = new Map(
        (Array.isArray(allClausesMaster) ? allClausesMaster : []).map(
          (c): [string, PIClauseMaster] => [c.id, c]
        )
      )
      // Deduplicate clauses by piClauseId
      const seenClauseIds = new Set<string>()
      const dedupedClauses = (Array.isArray(clauses) ? clauses : []).filter(
        (c: { piClauseId: string; text?: string }) => {
          if (seenClauseIds.has(c.piClauseId)) return false
          seenClauseIds.add(c.piClauseId)
          return true
        }
      )
      setCoverageClauses(
        dedupedClauses.map((c: { piClauseId: string; text?: string }) => {
          const master = masterClauseMap.get(c.piClauseId)
          return {
            ...c,
            text: master?.name || master?.text || c.text || '',
            code: master?.code || ''
          }
        })
      )
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
        const selectedAlt = selectedAltId
          ? safeHullAlts.find((a) => a.id === selectedAltId)
          : safeHullAlts[0]
        const selectedClause = selectedAlt
          ? safeHullClauses.find((c) => c.id === selectedAlt.hullClauseId)
          : null
        // Filter conditions to selected alt
        const filteredConds = selectedAltId
          ? safeHullConds.filter((c) => c.alternativeId === selectedAltId || !c.alternativeId)
          : safeHullConds
        // Dedup
        const seenHull = new Map<string, QuotationHullCondition>()
        for (const c of filteredConds.filter((x) => x.alternativeId))
          seenHull.set(c.hullConditionId, c)
        for (const c of filteredConds.filter((x) => !x.alternativeId)) {
          if (!seenHull.has(c.hullConditionId)) seenHull.set(c.hullConditionId, c)
        }
        const hullClauseItems = Array.from(seenHull.values()).map((qc) => {
          const def = safeAllHullConds.find((c) => c.id === qc.hullConditionId)
          return {
            text: `Cl. ${def?.conditionNumber || '?'} — ${qc.textOverride || def?.text || ''}`,
            code: `Cl. ${def?.conditionNumber || '?'}`
          }
        })
        // Add clause description as first item
        if (selectedClause)
          hullClauseItems.unshift({
            text: selectedClause.description || selectedClause.name,
            code: ''
          })
        // Add additional conditions
        for (const qa of safeHullAddl) {
          const text =
            qa.textOverride ||
            (qa as QuotationHullAdditionalCondition & { text?: string }).text ||
            ''
          if (text) hullClauseItems.push({ text, code: '' })
        }
        setCoverageClauses(hullClauseItems)
      }
      // For Hull/War: add custom exclusions to exclusions
      const safeCustomExcl = Array.isArray(customExclusions) ? customExclusions : []
      if (safeCustomExcl.length > 0) {
        setCoverageExclusions((prev) => [
          ...prev,
          ...safeCustomExcl.map((e) => ({ text: e.text || '' }))
        ])
      }
      // Resolve subjectivity text
      const masterSubjMap = new Map(
        (Array.isArray(allSubjectivitiesMaster) ? allSubjectivitiesMaster : []).map(
          (s): [string, PISubjectivity] => [s.id, s]
        )
      )
      setCoverageSubjectivities(
        (Array.isArray(subjectivities) ? subjectivities : []).map((s) => {
          const master = s.piSubjectivityId ? masterSubjMap.get(s.piSubjectivityId) : undefined
          return { ...s, text: master?.text || s.text || '' }
        })
      )
      // Load custom sections and LOL options
      try {
        const [cs, lol] = await Promise.all([
          window.api.getQuotationCustomSections(policy.quotationId),
          isPiLike(policy.quotationTypeCode) || isPiLike(q?.quotationTypeCode)
            ? window.api.lolGetOptions(policy.quotationId)
            : Promise.resolve([])
        ])
        setCoverageCustomSections(Array.isArray(cs) ? cs : [])
        setCoverageLolOptions(Array.isArray(lol) ? lol : [])
      } catch {
        /* non-critical */
      }
    } catch {
      // Non-critical
    } finally {
      setCoverageLoading(false)
    }
  }, [policy])

  // Switch edit tab; the coverage data loads when its tab is first opened
  const selectEditTab = (tab: EditTab): void => {
    setActiveTab(tab)
    if (isEditing && tab === 'coverage' && !quotationData && !coverageLoading) {
      loadCoverageData()
    }
  }

  // Recalculate instalment amounts when premium or commission change
  const recalcInstalments = (
    newPremium: number,
    newCommission: number,
    currentInstalments: typeof editInstalments
  ): typeof editInstalments => {
    if (currentInstalments.length === 0) return currentInstalments
    // Rounding remainder goes into the 1st instalment so the instalments add up to the premium
    // (exports print the instalment sum)
    const amounts = splitInstalments(newPremium, currentInstalments.length)
    const commRate = newCommission / 100
    return currentInstalments.map((inst, i) => ({
      ...inst,
      premiumAmount: amounts[i],
      commissionAmount: Math.round(amounts[i] * commRate * 100) / 100
    }))
  }

  // Add instalment row
  const addInstalment = (): void => {
    const next = editInstalments.length + 1
    setEditInstalments((prev) => [
      ...prev,
      {
        instalmentNumber: next,
        dueDate: '',
        premiumAmount: 0,
        commissionAmount: 0,
        isNonRefundable: false
      }
    ])
  }

  // Instalment dates copied from another policy: its number of instalments and due dates, the
  // amounts split again on this policy's premium and commission
  const [copyDatesOpen, setCopyDatesOpen] = useState(false)
  const applyCopiedDates = (dates: string[]): void => {
    const rows = dates.map((dueDate, i) => ({
      instalmentNumber: i + 1,
      dueDate,
      premiumAmount: 0,
      commissionAmount: 0,
      isNonRefundable: editInstalments[i]?.isNonRefundable ?? false
    }))
    setEditInstalments(recalcInstalments(editPremium, editCommission, rows))
    setCopyDatesOpen(false)
  }

  // Remove instalment row
  const removeInstalment = (idx: number): void => {
    setEditInstalments((prev) =>
      prev.filter((_, i) => i !== idx).map((inst, i) => ({ ...inst, instalmentNumber: i + 1 }))
    )
  }

  // Add address row
  const addAddress = (): void => {
    setEditAddresses((prev) => [
      ...prev,
      { entityId: '', entityName: '', role: '', addressText: '' }
    ])
  }

  // Remove address row
  const removeAddress = (idx: number): void => {
    setEditAddresses((prev) => prev.filter((_, i) => i !== idx))
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
  const vesselFlagStateId = policy?.flagStateId
  const vesselFlagState = useMemo(() => {
    if (!vesselFlagStateId || flagStates.length === 0) return null
    return flagStates.find((fs) => fs.id === vesselFlagStateId) || null
  }, [vesselFlagStateId, flagStates])

  // Build owner options from vessel assureds
  const ownerOptions = useMemo(() => {
    // Address as the conversion writes it: the assured's chosen address, else the entity's first
    const formatAddress = (a?: EntityAddress): string =>
      a
        ? [
            a.addressLine1,
            a.addressLine2,
            [a.city, a.postalCode].filter(Boolean).join(' '),
            a.country
          ]
            .map((x) => (x || '').trim())
            .filter(Boolean)
            .join('\n')
        : ''
    const opts: Array<{ id: string; name: string; address?: string; role?: string }> = []
    for (const va of vesselAssureds) {
      const entity = assuredEntities.find((e) => e.id === va.entityId)
      if (entity) {
        const addr =
          entityAddresses.find((a) => a.id === va.addressId) ||
          entityAddresses.find((a) => a.entityId === va.entityId)
        opts.push({ ...entity, address: formatAddress(addr) || entity.address, role: va.role })
      }
    }
    // Sort: "Registered Owner" roles first
    opts.sort((a, b) => {
      const aIsOwner = a.role?.toLowerCase().includes('registered owner') ? 0 : 1
      const bIsOwner = b.role?.toLowerCase().includes('registered owner') ? 0 : 1
      return aIsOwner - bIsOwner
    })
    return opts
  }, [vesselAssureds, assuredEntities, entityAddresses])

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

  // Cancel & replace applies only when the new blue card's period OVERLAPS the source card's
  // period. Consecutive periods (new inception == old expiry) do NOT overlap → no cancel/replace.
  const computeReissueCancelReplace = (
    source: BlueCard,
    newInception: string,
    newExpiry: string
  ): { on: boolean; text: string } => {
    const overlaps =
      !!source.expiryDate &&
      !!newInception &&
      new Date(newInception) < new Date(source.expiryDate) &&
      (!newExpiry || !source.inceptionDate || new Date(source.inceptionDate) < new Date(newExpiry))
    return {
      on: overlaps,
      text: overlaps
        ? `This certificate cancels and replaces certificate ${source.cardNumber} issued on ${formatDate(source.issuedDate) || source.issuedDate || 'N/A'}.`
        : ''
    }
  }

  // Update a blue-card date; in reissue mode, re-derive cancel & replace from the new period.
  const updateBcDate = (field: 'inceptionDate' | 'expiryDate', value: string): void => {
    setBcForm((f) => {
      const next = { ...f, [field]: value }
      if (bcModalMode === 'reissue' && bcReissueSource) {
        const cr = computeReissueCancelReplace(bcReissueSource, next.inceptionDate, next.expiryDate)
        next.cancelReplace = cr.on
        next.cancelReplaceText = cr.text
      }
      return next
    })
  }

  // Add a flag state inline (from the addressed-to selector) and select it as the addressee.
  const handleAddFlagInline = async (): Promise<void> => {
    if (!newFlagForm.name.trim() || !newFlagForm.iso3.trim()) {
      showError('Flag name and ISO3 code are required')
      return
    }
    try {
      const created = ok(
        await window.api.addFlagState({
          name: newFlagForm.name.trim(),
          iso3Code: newFlagForm.iso3.trim().toUpperCase(),
          ratifiedBunker: newFlagForm.ratBunker,
          ratifiedWreck: newFlagForm.ratWreck,
          authorityName: newFlagForm.authName.trim() || null,
          authorityAddress: newFlagForm.authAddr.trim() || null
        })
      )
      setFlagStates((prev) => [...prev, created])
      setBcForm((f) => ({
        ...f,
        addressedToFlagId: created.id,
        addressedToName: created.authorityName || '',
        addressedToAddress: created.authorityAddress || ''
      }))
      setBcAddingFlag(false)
      setNewFlagForm({
        name: '',
        iso3: '',
        ratBunker: false,
        ratWreck: false,
        authName: '',
        authAddr: ''
      })
      showSuccess('Flag state added')
    } catch (err) {
      showError(errMessage(err, 'Failed to add flag state'))
    }
  }

  // Open issue modal
  const openIssueModal = (preselectedType?: CardType): void => {
    const ct = preselectedType || 'BBC'
    const defaultPort =
      flagPorts.length === 1 ? flagPorts[0].name : flagPorts.find((p) => p.isDefault)?.name || ''
    const fs = vesselFlagState
    const isRatified = ct === 'BBC' ? fs?.ratifiedBunker : ct === 'WRC' ? fs?.ratifiedWreck : false

    setBcForm({
      cardType: ct,
      inceptionDate: policy?.inceptionDate || '',
      expiryDate: policy?.expiryDate || '',
      ownerEntityId: ownerOptions.length > 0 ? ownerOptions[0].id : '',
      ownerName: ownerOptions.length > 0 ? ownerOptions[0].name : '',
      ownerAddress: ownerOptions.length > 0 ? ownerOptions[0].address || '' : '',
      additionalOwners: [],
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
    setBcAddingFlag(false)
    setBcModalOpen(true)
  }

  // Open reissue modal from existing card
  const openReissueModal = (card: BlueCard): void => {
    const ct = card.cardType as CardType
    // New card is issued today; expiry carries over from the source card. Cancel & replace is
    // driven by whether the new period overlaps the source period (not just "old card active").
    const newInception = todayISO
    const newExpiry = card.expiryDate || policy?.expiryDate || ''
    const cr = computeReissueCancelReplace(card, newInception, newExpiry)

    setBcForm({
      cardType: ct,
      inceptionDate: newInception,
      expiryDate: newExpiry,
      ownerEntityId: card.ownerEntityId || '',
      ownerName: card.ownerName || '',
      ownerAddress: card.ownerAddress || '',
      additionalOwners: card.additionalOwners || [],
      portOfRegistry: card.portOfRegistry || '',
      // Carry the source addressee; the user can switch to another flag state for the reissue.
      addressedToFlagId: card.addressedToFlagId || '',
      addressedToName: card.addressedToName || '',
      addressedToAddress: card.addressedToAddress || '',
      cancelReplace: cr.on,
      cancelReplaceText: cr.text
    })
    setBcModalMode('reissue')
    setBcPreselectedType(ct)
    setBcEditId(null)
    setBcReissueSource(card)
    setBcAddingFlag(false)
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
      additionalOwners: card.additionalOwners || [],
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
    setBcAddingFlag(false)
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
    const isRatified = ct === 'BBC' ? fs?.ratifiedBunker : ct === 'WRC' ? fs?.ratifiedWreck : false
    setBcForm((f) => ({
      ...f,
      cardType: ct,
      addressedToFlagId: isRatified && fs ? fs.id : f.addressedToFlagId,
      addressedToName: isRatified && fs ? fs.authorityName || '' : f.addressedToName,
      addressedToAddress: isRatified && fs ? fs.authorityAddress || '' : f.addressedToAddress
    }))
  }

  // Save blue card (issue, reissue, or edit)
  const handleSaveBlueCard = async (): Promise<void> => {
    if (!bcForm.inceptionDate || !bcForm.expiryDate) {
      showError('Inception and expiry dates are required')
      return
    }
    // BBC/WRC must be addressed to a ratified flag state authority — block otherwise.
    if (needsAddressedTo(bcForm.cardType) && !bcForm.addressedToFlagId) {
      showError(
        'Select the flag state authority this certificate is addressed to (add one if it is not listed)'
      )
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
          additionalOwners: bcForm.additionalOwners,
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
            cardNumber = (policy?.policyNumber || '') + '-' + (maxRev + 2) + '/' + bcForm.cardType
          } else {
            cardNumber = (policy?.policyNumber || '') + '/' + bcForm.cardType
          }
        }

        const revisionNumber =
          bcModalMode === 'reissue' && bcReissueSource ? bcReissueSource.revisionNumber + 1 : 0

        await window.api.policyAddBlueCard({
          policyId,
          cardType: bcForm.cardType,
          cardNumber,
          inceptionDate: bcForm.inceptionDate,
          expiryDate: bcForm.expiryDate,
          revisionNumber,
          issuedDate: todayISO,
          status: 'active',
          // the adapter stores an empty/undefined value as NULL
          ownerEntityId: bcForm.ownerEntityId || undefined,
          ownerName: bcForm.ownerName || undefined,
          ownerAddress: bcForm.ownerAddress || undefined,
          additionalOwners: bcForm.additionalOwners,
          portOfRegistry: bcForm.portOfRegistry || undefined,
          addressedToFlagId: bcForm.addressedToFlagId || undefined,
          addressedToName: bcForm.addressedToName || undefined,
          addressedToAddress: bcForm.addressedToAddress || undefined,
          cancelReplaceText: bcForm.cancelReplace ? bcForm.cancelReplaceText : undefined
        })
        showSuccess(bcModalMode === 'reissue' ? 'Blue card reissued' : 'Blue card issued')
      }
      // Blue card changes invalidate the frozen snapshot so exports re-freeze with them
      try {
        await window.api.policyUpdate(policyId, { exportSnapshot: null })
      } catch {
        /* non-critical */
      }
      setBcModalOpen(false)
      // Reload blue cards
      const bc = await window.api.policyGetBlueCards(policyId)
      setBlueCards(Array.isArray(bc) ? bc : [])
    } catch (err) {
      showError(errMessage(err, 'Failed to save blue card'))
    } finally {
      setBcSaving(false)
    }
  }

  // Export single blue card
  const buildBlueCardData = (card: BlueCard, companyName: string): BlueCardData => ({
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
    additionalOwners: card.additionalOwners || [],
    flagAuthorityName: card.addressedToName || '',
    flagAuthorityAddress: card.addressedToAddress || '',
    companyName: companyName || 'Insurance Company',
    cancelReplaceText: card.cancelReplaceText || ''
  })

  const handleExportSingleBC = async (card: BlueCard): Promise<void> => {
    try {
      const reportSettings = await getReportSettings()
      const { exportBlueCardDocx } = await import('../services/PolicyExportService')
      await exportBlueCardDocx(
        buildBlueCardData(card, reportSettings.companyName || 'Insurance Company'),
        card.cardType as 'BBC' | 'WRC' | 'MLC4.2' | 'MLC2.5.2',
        policyId
      )
      showSuccess(`${card.cardType} blue card exported`)
    } catch (err) {
      showError(errMessage(err, 'Failed to export blue card'))
    }
  }

  // The first export of the policy document locks it (no more Edit, only New Revision or
  // Endorsement): say so before it happens
  const confirmFirstExport = async (): Promise<boolean> => {
    if (!policy || policy.exportedAt || !hasPermission('policies:manage')) return true
    return confirmDialog(
      'This is the first export of the policy. After it the policy can no longer be edited: changes need a New Revision or an Endorsement. Export now?',
      { title: 'First export', confirmLabel: 'Export', isDangerous: false }
    )
  }

  const handleExportBundle = async (): Promise<void> => {
    setShowActionsMenu(false)
    if (!(await confirmFirstExport())) return
    setExportingBundle(true)
    try {
      const reportSettings = await getReportSettings()
      const activeBCs = isPIType ? blueCards.filter((bc) => bc.status === 'active') : []
      const bundleBlueCards = activeBCs.map((card) => ({
        data: buildBlueCardData(card, reportSettings.companyName || 'Insurance Company'),
        cardType: card.cardType as 'BBC' | 'WRC' | 'MLC4.2' | 'MLC2.5.2'
      }))
      const { exportPolicyBundleZip } = await import('../services/PolicyExportService')
      await exportPolicyBundleZip(policyId, {
        includeCA: commissionAmount != null && commissionAmount > 0,
        blueCards: bundleBlueCards
      })
      showSuccess('All documents exported as ZIP')
    } catch (err) {
      showError(errMessage(err, 'Failed to export documents'))
    } finally {
      setExportingBundle(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--glass-border-color)',
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
    borderBottom: '1px solid var(--glass-border-color)'
  }

  const cardTitleStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-primary)'
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.8rem',
    fontWeight: 500,
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }

  const valueStyle: React.CSSProperties = {
    fontSize: '0.88rem',
    color: 'var(--text-primary)',
    fontWeight: 500
  }

  const headerBtnStyle: React.CSSProperties = {
    padding: '10px 20px',
    fontSize: '0.9rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  }
  const actionItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: '0.85rem',
    textAlign: 'left'
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
  const tc = typeColors[policy.quotationTypeCode ?? ''] || typeColors.P
  const isPIType = policy.quotationTypeCode === 'P'
  const commissionAmount =
    policy.commissionPercent && policy.premiumAmount
      ? Math.round((policy.commissionPercent / 100) * policy.premiumAmount * 100) / 100
      : null
  const netPremium =
    policy.premiumAmount && commissionAmount != null
      ? Math.round((policy.premiumAmount - commissionAmount) * 100) / 100
      : null

  const handleSignPolicy = async (): Promise<void> => {
    setSigning(true)
    try {
      const result: { success: boolean; error?: unknown; message?: string } =
        await window.api.policySign(policyId)
      if (result?.error) {
        showError(result.message || 'Failed to sign policy')
      } else {
        // Capture export snapshot so future exports are frozen
        try {
          const { capturePolicyExportSnapshot } = await import('../services/PolicyExportService')
          await capturePolicyExportSnapshot(policyId)
        } catch (snapErr) {
          console.error('Failed to capture export snapshot:', snapErr)
          // Non-blocking — signing still succeeds even if snapshot fails
        }
        showSuccess('Policy signed successfully')
        await loadData()
      }
    } catch (err) {
      showError(errMessage(err, 'Failed to sign policy'))
    } finally {
      setSigning(false)
    }
  }

  const handleExportPolicy = async (): Promise<void> => {
    if (!(await confirmFirstExport())) return
    setExportingPolicy(true)
    try {
      const { exportPolicyDocx } = await import('../services/PolicyExportService')
      await exportPolicyDocx(policyId)
      showSuccess('Policy document exported')
      await loadData() // Reload to update exportedAt (hides Edit button)
    } catch (err) {
      showError(errMessage(err, 'Failed to export policy'))
    } finally {
      setExportingPolicy(false)
    }
  }

  const handleExportPdfTC = async (): Promise<void> => {
    if (!(await confirmFirstExport())) return
    setExportingPdfTC(true)
    try {
      const { exportPolicyPdfWithTC } = await import('../services/PolicyExportService')
      await exportPolicyPdfWithTC(policyId)
      showSuccess('Policy PDF with T&C exported')
      await loadData()
    } catch (err) {
      showError(errMessage(err, 'Failed to export PDF with T&C'))
    } finally {
      setExportingPdfTC(false)
    }
  }

  // Wet-ink signing: print this PDF (its footer counts the T&C pages), sign, scan, then add the
  // T&C to the scan below
  const handleExportForSigning = async (): Promise<void> => {
    if (!(await confirmFirstExport())) return
    setPdfBusy('Preparing the policy for signing. Please wait...')
    try {
      const { exportPolicyForSigning } = await import('../services/PolicyExportService')
      const r = await exportPolicyForSigning(policyId)
      showSuccess(
        `Policy for signing exported: ${r.policyPages} page${r.policyPages === 1 ? '' : 's'}, numbered to ${r.total} with the T&C`
      )
      await loadData()
    } catch (err) {
      showError(errMessage(err, 'Failed to export the policy for signing'))
    } finally {
      setPdfBusy(null)
    }
  }

  const handleAppendTcToScan = async (): Promise<void> => {
    setPdfBusy('Adding the T&C to the signed policy. Please wait...')
    try {
      const { appendTcToSignedScan } = await import('../services/PolicyExportService')
      const r = await appendTcToSignedScan(policyId, (msg) =>
        confirmDialog(msg, {
          title: 'Signed policy',
          confirmLabel: 'Add the T&C',
          isDangerous: false
        })
      )
      if (r)
        showSuccess(
          `Signed policy saved with the T&C: ${r.scanPages} signed + ${r.tcPages} T&C pages = ${r.total}`
        )
    } catch (err) {
      showError(errMessage(err, 'Failed to add the T&C to the signed policy'))
    } finally {
      setPdfBusy(null)
    }
  }

  const handleExportDA = async (): Promise<void> => {
    setExportingDA(true)
    try {
      const { exportDebitAdviceDocx } = await import('../services/PolicyExportService')
      await exportDebitAdviceDocx(policyId)
      showSuccess('Debit advice exported')
    } catch (err) {
      showError(errMessage(err, 'Failed to export debit advice'))
    } finally {
      setExportingDA(false)
    }
  }

  const handleExportCA = async (): Promise<void> => {
    setExportingCA(true)
    try {
      const { exportCreditAdviceDocx } = await import('../services/PolicyExportService')
      await exportCreditAdviceDocx(policyId)
      showSuccess('Credit advice exported')
    } catch (err) {
      showError(errMessage(err, 'Failed to export credit advice'))
    } finally {
      setExportingCA(false)
    }
  }

  // The year folder the converter made; every export of the policy is saved there
  const handleOpenFolder = async (): Promise<void> => {
    const res = await window.api.policyOpenFolder(policyId)
    if (res && res.error) showError(res.message || 'Could not open the folder')
  }

  const handleExportQuickBooks = async (): Promise<void> => {
    setExportingQB(true)
    try {
      const { exportPolicyToQuickBooks } = await import('../services/QuickBooksExportService')
      await exportPolicyToQuickBooks(policyId)
      showSuccess('QuickBooks Excel exported')
    } catch (err) {
      showError(errMessage(err, 'Failed to export QuickBooks Excel'))
    } finally {
      setExportingQB(false)
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header: the title keeps its line; the actions wrap below it when space runs out */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
          flexWrap: 'wrap'
        }}
      >
        <button
          onClick={onBack}
          className="btn-secondary"
          style={{ padding: '8px', display: 'flex', alignItems: 'center' }}
          title="Back to Policies"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: '1 1 360px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h1
              style={{
                fontSize: '1.75rem',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                whiteSpace: 'nowrap'
              }}
            >
              <FileCheck size={26} />
              {policy.policyNumber || 'Untitled Policy'}
              {policy.revisionNumber > 0 ? `-R${policy.revisionNumber}` : ''}
            </h1>
            {(policy.policyNumber || '').startsWith('POL-DRAFT-') && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  background: 'rgba(150, 150, 150, 0.15)',
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.05em'
                }}
              >
                Draft
              </span>
            )}
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
                  color: 'var(--warning)'
                }}
              >
                Editing
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* Add Endorsement: opens the Endorsements tab with a new endorsement */}
          {!isEditing && hasPermission('policies:manage') && policy.status === 'active' && (
            <button
              className="btn-secondary"
              style={{ ...headerBtnStyle }}
              onClick={() => {
                setReadTab('endorsements')
                setAddEndorsementNonce((n) => n + 1)
              }}
              title="Add an endorsement to this policy"
            >
              <FileCheck size={16} /> Add Endorsement
            </button>
          )}
          {/* Edit Policy — primary action (only before first export) */}
          {!isEditing &&
            hasPermission('policies:manage') &&
            policy.status === 'active' &&
            !policy.exportedAt && (
              <button
                className="btn-primary"
                style={{ ...headerBtnStyle }}
                onClick={enterEditMode}
                title="Edit Policy"
              >
                <Edit3 size={16} /> Edit Policy
              </button>
            )}
          {/* After the first export: Edit stays visible but explains the way forward */}
          {!isEditing &&
            hasPermission('policies:manage') &&
            policy.status === 'active' &&
            !!policy.exportedAt && (
              <span title="Exported: use New Revision or an Endorsement to make changes">
                <button
                  className="btn-secondary"
                  style={{ ...headerBtnStyle, pointerEvents: 'none' }}
                  disabled
                  aria-label="Edit Policy (exported: use New Revision or an Endorsement)"
                >
                  <Edit3 size={16} /> Edit Policy
                </button>
              </span>
            )}

          {/* Sign Policy button — only for users with policies:sign AND policy not yet signed */}
          {!isEditing &&
            hasPermission('policies:sign') &&
            policy.status === 'active' &&
            !policy.signedBy && (
              <button
                className="btn-secondary"
                style={{ ...headerBtnStyle }}
                disabled={signing}
                onClick={() => {
                  setConfirmation({
                    show: true,
                    title: 'Sign Policy',
                    message: `Sign this policy as ${user?.username || 'current user'}? This action cannot be undone.`,
                    onConfirm: async () => {
                      setConfirmation((prev) => ({ ...prev, show: false }))
                      handleSignPolicy()
                    }
                  })
                }}
                title="Sign Policy"
              >
                <PenTool size={16} /> {signing ? 'Signing...' : 'Sign'}
              </button>
            )}

          {/* Signed badge */}
          {policy.signedBy && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: 'rgba(0, 200, 100, 0.12)',
                color: 'var(--success)',
                border: '1px solid rgba(0, 200, 100, 0.25)'
              }}
              title={`Signed by ${policy.signedByName || 'unknown'} on ${policy.signedAt ? formatDateShort(policy.signedAt) : 'unknown date'}`}
            >
              <PenTool size={14} />
              Signed by {policy.signedByName || 'unknown'}
              {policy.signedAt && ` · ${formatDateShort(policy.signedAt)}`}
            </span>
          )}

          {/* Exports frozen badge */}
          {policy.exportSnapshot && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.7rem',
                fontWeight: 600,
                background: 'rgba(var(--accent-primary-rgb), 0.10)',
                color: 'var(--accent-primary)',
                border: '1px solid rgba(var(--accent-primary-rgb), 0.25)'
              }}
              title="Exports use frozen data captured at signing"
            >
              <Shield size={13} />
              Exports frozen
            </span>
          )}

          {/* Main exports, visible; the rest stay in the Actions menu */}
          {!isEditing && hasPermission('reports:export') && (
            <>
              <button
                className={policy.exportedAt ? 'btn-primary' : 'btn-secondary'}
                style={{ ...headerBtnStyle }}
                onClick={handleExportBundle}
                disabled={exportingBundle}
                title="Policy, debit and credit advice and every active blue card in one ZIP"
              >
                <FileArchive size={16} /> {exportingBundle ? 'Zipping...' : 'Export All'}
              </button>
              <button
                className="btn-secondary"
                style={{ ...headerBtnStyle }}
                onClick={handleExportPolicy}
                disabled={exportingPolicy}
                title="Export the policy document (Word)"
              >
                <Download size={16} /> Export Policy
              </button>
            </>
          )}
          {!isEditing && policy.exportFolder && (
            <button
              className="btn-secondary"
              style={{ ...headerBtnStyle }}
              onClick={handleOpenFolder}
              title={`Open the policy folder: ${policy.exportFolder}`}
            >
              <FolderOpen size={16} /> Open Folder
            </button>
          )}

          {/* Actions dropdown */}
          <div style={{ position: 'relative' }} ref={actionsMenuRef}>
            <button
              className="btn-secondary"
              style={{ ...headerBtnStyle }}
              onClick={() => {
                if (!showActionsMenu) {
                  const rect = actionsMenuRef.current?.getBoundingClientRect()
                  setActionsMenuPos({
                    top: (rect?.bottom || 0) + 4,
                    right: window.innerWidth - (rect?.right || 0)
                  })
                }
                setShowActionsMenu(!showActionsMenu)
              }}
            >
              <MoreHorizontal size={16} /> Actions
            </button>
            {showActionsMenu &&
              createPortal(
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
                    onClick={() => setShowActionsMenu(false)}
                  />
                  <div
                    style={{
                      position: 'fixed',
                      top: actionsMenuPos.top,
                      right: actionsMenuPos.right,
                      zIndex: 9999,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--glass-border-color)',
                      borderRadius: '10px',
                      padding: '6px',
                      minWidth: '220px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                    }}
                  >
                    {/* Revision & Renew */}
                    {hasPermission('policies:manage') && policy.status === 'active' && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false)
                          handleCreateRevision()
                        }}
                        style={actionItemStyle}
                        className="hover-effect"
                      >
                        <Copy size={15} /> New Revision
                      </button>
                    )}
                    {hasPermission('quotations:create') && policy.status === 'active' && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false)
                          setConfirmation({
                            show: true,
                            title: 'Create Renewal Quotation?',
                            message:
                              'Create a new quotation pre-filled from this policy? The period will be advanced by one year.',
                            onConfirm: async () => {
                              setConfirmation((prev) => ({ ...prev, show: false }))
                              setRenewing(true)
                              try {
                                const result = ok(await window.api.policyRenew(policyId))
                                if (result?.quotationId) {
                                  showSuccess('Renewal quotation created')
                                  onNavigateToQuotation?.(result.quotationId)
                                } else showError('Failed to create renewal')
                              } catch (err) {
                                showError(errMessage(err, 'Failed'))
                              } finally {
                                setRenewing(false)
                              }
                            }
                          })
                        }}
                        style={{ ...actionItemStyle, color: 'var(--success)' }}
                        className="hover-effect"
                      >
                        <RefreshCw size={15} /> Renew
                      </button>
                    )}

                    {hasPermission('policies:manage') && policy.status === 'active' && (
                      <button
                        onClick={() => {
                          setShowActionsMenu(false)
                          setShowCancelModal(true)
                        }}
                        style={{ ...actionItemStyle, color: 'var(--danger)' }}
                        className="hover-effect"
                      >
                        <X size={15} /> Cancel Policy
                      </button>
                    )}

                    {hasPermission('reports:export') && (
                      <>
                        <div
                          style={{
                            height: '1px',
                            background: 'var(--glass-border-color)',
                            margin: '4px 0'
                          }}
                        />

                        {/* Other exports (Export All / Export Policy are header buttons) */}
                        <button
                          onClick={() => {
                            setShowActionsMenu(false)
                            handleExportPdfTC()
                          }}
                          disabled={exportingPdfTC}
                          style={actionItemStyle}
                          className="hover-effect"
                        >
                          <FileCheck size={15} />{' '}
                          {exportingPdfTC ? 'Converting...' : 'Export Policy (PDF + T&C)'}
                        </button>
                        <button
                          onClick={() => {
                            setShowActionsMenu(false)
                            void handleExportForSigning()
                          }}
                          disabled={!!pdfBusy}
                          style={actionItemStyle}
                          className="hover-effect"
                          title="A PDF of the policy to print and sign; its page numbers already count the T&C"
                        >
                          <Printer size={15} /> Export for Signing (PDF)
                        </button>
                        <button
                          onClick={() => {
                            setShowActionsMenu(false)
                            void handleAppendTcToScan()
                          }}
                          disabled={!!pdfBusy}
                          style={actionItemStyle}
                          className="hover-effect"
                          title="Choose the scanned signed policy: the T&C is added after it, numbered on"
                        >
                          <Paperclip size={15} /> Add T&C to Signed Scan...
                        </button>
                        <button
                          onClick={() => {
                            setShowActionsMenu(false)
                            handleExportDA()
                          }}
                          disabled={exportingDA}
                          style={actionItemStyle}
                          className="hover-effect"
                        >
                          <Download size={15} /> Export Debit Advice
                        </button>
                        {commissionAmount != null && commissionAmount > 0 && (
                          <button
                            onClick={() => {
                              setShowActionsMenu(false)
                              handleExportCA()
                            }}
                            disabled={exportingCA}
                            style={actionItemStyle}
                            className="hover-effect"
                          >
                            <Download size={15} /> Export Credit Advice
                          </button>
                        )}
                        {policy.quotationTypeCode === 'W' && (
                          <button
                            onClick={async () => {
                              setShowActionsMenu(false)
                              try {
                                const { loadDeclarationFields } =
                                  await import('../services/PolicyExportService')
                                const fields = await loadDeclarationFields(policyId)
                                setDeclarationFields(fields)
                                setShowDeclarationModal(true)
                              } catch (err) {
                                showError(errMessage(err, 'Failed to load declaration'))
                              }
                            }}
                            style={actionItemStyle}
                            className="hover-effect"
                          >
                            <Download size={15} /> Export Declaration
                          </button>
                        )}
                        {isPIType &&
                          blueCards.filter((bc) => bc.status === 'active').length > 0 && (
                            <>
                              <div
                                style={{
                                  height: '1px',
                                  background: 'var(--glass-border-color)',
                                  margin: '4px 0'
                                }}
                              />
                              <div
                                style={{
                                  padding: '6px 12px',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  color: 'var(--text-secondary)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px'
                                }}
                              >
                                Blue Cards
                              </div>
                              {blueCards
                                .filter((bc) => bc.status === 'active')
                                .map((bc) => (
                                  <button
                                    key={bc.id}
                                    onClick={async () => {
                                      setShowActionsMenu(false)
                                      setExportingBC(true)
                                      try {
                                        // toasts the result itself
                                        await handleExportSingleBC(bc)
                                      } finally {
                                        setExportingBC(false)
                                      }
                                    }}
                                    style={actionItemStyle}
                                    className="hover-effect"
                                  >
                                    <Download size={15} /> {bc.cardNumber || bc.cardType}
                                  </button>
                                ))}
                            </>
                          )}

                        <div
                          style={{
                            height: '1px',
                            background: 'var(--glass-border-color)',
                            margin: '4px 0'
                          }}
                        />

                        <button
                          onClick={() => {
                            setShowActionsMenu(false)
                            handleExportQuickBooks()
                          }}
                          disabled={exportingQB}
                          style={{ ...actionItemStyle, color: 'var(--accent-primary)' }}
                          className="hover-effect"
                        >
                          <FileSpreadsheet size={15} /> Export to QuickBooks
                        </button>
                      </>
                    )}
                  </div>
                </>,
                document.body
              )}
          </div>
          {hasPermission('policies:manage') && (
            <button
              onClick={() =>
                setConfirmation({
                  show: true,
                  title: 'Delete Policy?',
                  message: `Delete policy ${policy.policyNumber}? This cannot be undone.`,
                  isDangerous: true,
                  onConfirm: async () => {
                    setConfirmation((prev) => ({ ...prev, show: false }))
                    try {
                      await window.api.policyDelete(policyId)
                      showSuccess('Policy deleted')
                      onBack()
                    } catch (err) {
                      showError(errMessage(err, 'Failed to delete'))
                    }
                  }
                })
              }
              className="btn-secondary"
              style={{
                background: 'rgba(255, 77, 77, 0.12)',
                border: '1px solid rgba(255, 77, 77, 0.35)',
                color: 'var(--danger)',
                padding: '10px 20px',
                fontSize: '0.9rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* ─── EDIT MODE ─── */}
      {isEditing && (
        <>
          {/* Tab bar */}
          <div
            style={{
              display: 'flex',
              gap: '4px',
              marginBottom: '20px',
              borderBottom: '1px solid var(--glass-border-color)',
              paddingBottom: '0'
            }}
          >
            {(
              [
                { key: 'overview', label: 'Overview', icon: <Ship size={15} /> },
                { key: 'insured', label: 'Insured', icon: <Users size={15} /> },
                { key: 'premium', label: 'Premium', icon: <DollarSign size={15} /> },
                { key: 'coverage', label: 'Coverage', icon: <Shield size={15} /> }
              ] as { key: EditTab; label: string; icon: React.ReactNode }[]
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => selectEditTab(tab.key)}
                style={{
                  padding: '10px 18px',
                  fontSize: '0.82rem',
                  fontWeight: activeTab === tab.key ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom:
                    activeTab === tab.key
                      ? '2px solid var(--accent-primary)'
                      : '2px solid transparent',
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
              <div
                style={{
                  marginBottom: '20px',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: 'var(--table-header-bg)',
                  border: '1px solid var(--glass-border-color)'
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                    {policy.vesselName || '-'}
                  </span>
                  {policy.imoNumber && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      IMO {policy.imoNumber}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {[
                    policy.vesselType,
                    policy.flagStateName,
                    policy.builtYear
                      ? policy.rebuiltYear
                        ? `Built ${policy.builtYear} / Rebuilt ${policy.rebuiltYear}`
                        : `Built ${policy.builtYear}`
                      : null,
                    policy.grossTonnage
                      ? `GT ${Number(policy.grossTonnage).toLocaleString()}`
                      : null
                  ]
                    .filter(Boolean)
                    .join(' | ')}
                </div>
                {policy.customerName && (
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      marginTop: '4px'
                    }}
                  >
                    Customer: {policy.customerName}
                  </div>
                )}
              </div>

              {/* Editable period */}
              <div className="form-grid cols-2" style={{ marginBottom: '16px' }}>
                <Field label="Inception date">
                  <input
                    type="date"
                    value={editInception}
                    onChange={(e) => setEditInception(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Field label="Inception time">
                  <input
                    type="time"
                    value={editInceptionTime}
                    onChange={(e) => setEditInceptionTime(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Field label="Expiry date">
                  <input
                    type="date"
                    value={editExpiry}
                    onChange={(e) => setEditExpiry(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Field label="Expiry time">
                  <input
                    type="time"
                    value={editExpiryTime}
                    onChange={(e) => setEditExpiryTime(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
              </div>

              <div className="form-grid" style={{ marginBottom: '16px' }}>
                <Field label="Timezone" span="all">
                  <select value={editTimezone} onChange={(e) => setEditTimezone(e.target.value)}>
                    {DEFAULT_TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                    {editTimezone && !DEFAULT_TIMEZONE_OPTIONS.includes(editTimezone) && (
                      <option value={editTimezone}>{editTimezone}</option>
                    )}
                  </select>
                </Field>
              </div>

              {/* Cancel & Replace */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  background: editCancelReplace
                    ? isLight
                      ? 'rgba(255, 176, 32, 0.06)'
                      : 'rgba(255, 176, 32, 0.08)'
                    : 'transparent',
                  border: editCancelReplace
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
                    checked={editCancelReplace}
                    onChange={(e) => setEditCancelReplace(e.target.checked)}
                  />
                  Cancel & Replace
                </label>
                {editCancelReplace && (
                  <textarea
                    placeholder="Cancel & replace text..."
                    value={editCancelReplaceText}
                    onChange={(e) => setEditCancelReplaceText(e.target.value)}
                    rows={2}
                    style={{ width: '100%', resize: 'vertical', marginTop: '8px' }}
                  />
                )}
              </div>

              {/* Broker mention */}
              <div
                style={{ padding: '12px', borderRadius: '8px', border: '1px solid transparent' }}
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
                    checked={editHideBroker}
                    onChange={(e) => setEditHideBroker(e.target.checked)}
                  />
                  Do not mention broker on documents
                </label>
                <div
                  style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                    marginLeft: '24px'
                  }}
                >
                  Hides the “c/o {'{broker}'}” line on the policy and debit advice. The credit
                  advice always shows the broker (it is the broker’s document).
                </div>
              </div>

              {/* Document options: subjectivity days, UPCC name, section order */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid transparent',
                  alignItems: 'end'
                }}
                className="form-grid cols-2"
              >
                <Field
                  label="Subjectivities to be complied with within (days)"
                  hint='0 prints "prior inception"'
                >
                  <input
                    type="number"
                    min={0}
                    value={editSubjectivityDays}
                    onChange={(e) =>
                      setEditSubjectivityDays(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                  />
                </Field>
                <Field label="UPCC section name" hint="Empty = the quotation's name">
                  <input
                    value={editUpccTitle}
                    onChange={(e) => setEditUpccTitle(e.target.value)}
                    placeholder={quotationData?.upccTitle || DEFAULT_UPCC_TITLE}
                  />
                </Field>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowSectionOrder(true)}
                    disabled={!policy.quotationId}
                  >
                    <LayoutList size={14} />{' '}
                    {editSectionOrder ? 'Edit Section Order' : 'Reorder Sections'}
                  </button>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: editSectionOrder ? 'var(--accent-primary)' : 'var(--text-secondary)'
                    }}
                  >
                    {editSectionOrder
                      ? 'Custom order for this policy'
                      : 'Using the default order for this type'}
                  </span>
                  {editSectionOrder && (
                    <button
                      type="button"
                      onClick={() => setEditSectionOrder(null)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        fontSize: '0.75rem',
                        textDecoration: 'underline'
                      }}
                    >
                      Use default
                    </button>
                  )}
                </div>
              </div>
              {showSectionOrder && policy.quotationId && (
                <SectionOrderModal
                  quotation={
                    {
                      id: policy.quotationId,
                      quotationTypeCode: policy.quotationTypeCode || 'P',
                      sectionOrder: editSectionOrder ?? undefined
                    } as Quotation
                  }
                  docLabel="policy"
                  isLight={isLight}
                  showSuccess={showSuccess}
                  showError={showError}
                  // Defaults come from the policy settings (not the quotation defaults)
                  defaultsLoader={async (tc) => {
                    try {
                      const raw = await window.api.getSetting(`policy_section_order_defaults_${tc}`)
                      return raw ? JSON.parse(raw) : []
                    } catch {
                      return []
                    }
                  }}
                  // Saved with the rest of the policy edit
                  persist={async (order) => {
                    setEditSectionOrder(order)
                  }}
                  onClose={() => setShowSectionOrder(false)}
                  onSave={() => setShowSectionOrder(false)}
                />
              )}
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
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onClick={addAddress}
                >
                  <Plus size={13} /> Add Address
                </button>
              </div>

              {editAddresses.length === 0 && (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}
                >
                  No addresses. Click &quot;Add Address&quot; to add one.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {editAddresses.map((addr, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      background: 'var(--table-header-bg)',
                      border: '1px solid var(--glass-border-color)',
                      position: 'relative'
                    }}
                  >
                    <button
                      onClick={() => removeAddress(idx)}
                      style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                        padding: '2px'
                      }}
                      title="Remove address"
                    >
                      <X size={16} />
                    </button>
                    <div className="form-grid cols-2" style={{ marginBottom: '10px' }}>
                      <Field label="Entity">
                        <select
                          value={addr.entityId || ''}
                          onChange={(e) => {
                            const ent = assuredEntities.find((en) => en.id === e.target.value)
                            setEditAddresses((prev) =>
                              prev.map((a, i) =>
                                i === idx
                                  ? {
                                      ...a,
                                      entityId: e.target.value,
                                      entityName: ent?.name || a.entityName
                                    }
                                  : a
                              )
                            )
                          }}
                          style={{ width: '100%' }}
                        >
                          <option value="">Select entity...</option>
                          {assuredEntities.map((ent) => (
                            <option key={ent.id} value={ent.id}>
                              {ent.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Role">
                        <input
                          type="text"
                          value={addr.role}
                          onChange={(e) =>
                            setEditAddresses((prev) =>
                              prev.map((a, i) => (i === idx ? { ...a, role: e.target.value } : a))
                            )
                          }
                          placeholder="e.g. Assured, Owner..."
                          style={{ width: '100%' }}
                        />
                      </Field>
                    </div>
                    <Field label="Address">
                      <textarea
                        value={addr.addressText}
                        onChange={(e) =>
                          setEditAddresses((prev) =>
                            prev.map((a, i) =>
                              i === idx ? { ...a, addressText: e.target.value } : a
                            )
                          )
                        }
                        placeholder="Full address..."
                        rows={2}
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                    </Field>
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

              <div className="form-grid cols-3" style={{ marginBottom: '20px' }}>
                <Field label="Premium amount">
                  <MoneyInput
                    value={editPremium}
                    onChange={(v) => {
                      const val = v || 0
                      setEditPremium(val)
                      setEditInstalments((prev) => recalcInstalments(val, editCommission, prev))
                    }}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Field label="Commission %">
                  <MoneyInput
                    value={editCommission}
                    onChange={(v) => {
                      const val = v || 0
                      setEditCommission(val)
                      setEditInstalments((prev) => recalcInstalments(editPremium, val, prev))
                    }}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Field label="Bank">
                  <select
                    value={editBankId}
                    onChange={(e) => setEditBankId(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    <option value="">No bank selected</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              {/* Instalments */}
              <div style={{ marginBottom: '12px' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '10px'
                  }}
                >
                  <span className="field-label">Instalments</span>
                  <button
                    className="btn-secondary"
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={addInstalment}
                  >
                    <Plus size={12} /> Add
                  </button>
                  <button
                    className="btn-secondary"
                    style={{
                      padding: '3px 10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onClick={() => setCopyDatesOpen(true)}
                    title="Take the number of instalments and their due dates from another policy"
                  >
                    <CalendarDays size={12} /> Copy dates from a policy
                  </button>
                  {copyDatesOpen && (
                    <CopyInstalmentDatesModal
                      excludePolicyId={policyId}
                      inceptionDate={editInception || policy?.inceptionDate || undefined}
                      onClose={() => setCopyDatesOpen(false)}
                      onApply={applyCopiedDates}
                    />
                  )}
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      fontStyle: 'italic'
                    }}
                  >
                    Changing premium recalculates instalment amounts
                  </span>
                </div>

                {editInstalments.length > 0 && (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Due Date</th>
                          <th style={{ textAlign: 'right' }}>Premium</th>
                          <th style={{ textAlign: 'right' }}>Commission</th>
                          <th style={{ textAlign: 'center' }}>NR</th>
                          <th style={{ width: '40px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {editInstalments.map((inst, idx) => (
                          <tr key={idx}>
                            <td>{inst.instalmentNumber}</td>
                            <td>
                              <input
                                type="date"
                                value={inst.dueDate}
                                onChange={(e) =>
                                  setEditInstalments((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, dueDate: e.target.value } : r
                                    )
                                  )
                                }
                                style={{ padding: '4px 8px' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <MoneyInput
                                value={inst.premiumAmount}
                                onChange={(val) =>
                                  setEditInstalments((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, premiumAmount: val || 0 } : r
                                    )
                                  )
                                }
                                style={{ width: '120px', padding: '4px 8px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <MoneyInput
                                value={inst.commissionAmount}
                                onChange={(val) =>
                                  setEditInstalments((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, commissionAmount: val || 0 } : r
                                    )
                                  )
                                }
                                style={{ width: '120px', padding: '4px 8px', textAlign: 'right' }}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={inst.isNonRefundable}
                                onChange={(e) =>
                                  setEditInstalments((prev) =>
                                    prev.map((r, i) =>
                                      i === idx ? { ...r, isNonRefundable: e.target.checked } : r
                                    )
                                  )
                                }
                              />
                            </td>
                            <td>
                              <button
                                onClick={() => removeInstalment(idx)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--danger)',
                                  padding: '2px'
                                }}
                                title="Remove instalment"
                              >
                                <X size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coverage Tab (read-only) */}
          {activeTab === 'coverage' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Shield size={18} style={{ color: 'var(--accent-primary)' }} />
                <span style={cardTitleStyle}>Coverage</span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    fontStyle: 'italic',
                    marginLeft: '8px'
                  }}
                >
                  Read-only — sourced from linked quotation
                </span>
                {onNavigateToQuotation && policy.quotationId && (
                  <button
                    className="btn-secondary"
                    style={{
                      marginLeft: 'auto',
                      padding: '5px 14px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                    onClick={async () => {
                      try {
                        // Auto-create quotation revision and navigate to it
                        const newRevision: (Quotation & { error?: unknown }) | string =
                          await window.api.createQuotationRevision(policy.quotationId)
                        if (
                          newRevision &&
                          !(typeof newRevision === 'object' && newRevision.error)
                        ) {
                          const revId =
                            typeof newRevision === 'string'
                              ? newRevision
                              : newRevision.id || policy.quotationId
                          // Find the new alternative ID that corresponds to the selected one
                          let newSelectedAltId: string | null = null
                          if (policy.selectedAlternativeId) {
                            // Get old alternatives to find the hull_clause_id of the selected one
                            const oldAlts = await window.api.hullGetQuotationAlternatives(
                              policy.quotationId
                            )
                            const selectedOldAlt = Array.isArray(oldAlts)
                              ? oldAlts.find((a) => a.id === policy.selectedAlternativeId)
                              : null
                            if (selectedOldAlt) {
                              // Get new alternatives and match by hull_clause_id
                              const newAlts = await window.api.hullGetQuotationAlternatives(revId)
                              const matchingNewAlt = Array.isArray(newAlts)
                                ? newAlts.find(
                                    (a) => a.hullClauseId === selectedOldAlt.hullClauseId
                                  )
                                : null
                              if (matchingNewAlt) {
                                newSelectedAltId = matchingNewAlt.id
                                // Strip the non-selected alternative using the NEW ID
                                await window.api.stripNonSelectedAlternative(
                                  revId,
                                  matchingNewAlt.id
                                )
                              }
                            } else {
                              // P&I / FD&D alternative: the revision copies them in the same order
                              const oldPi = asArray(
                                await window.api.piGetQuotationAlternatives(policy.quotationId)
                              )
                              const oldIdx = oldPi.findIndex(
                                (a) => a.id === policy.selectedAlternativeId
                              )
                              if (oldIdx >= 0) {
                                const newPi = asArray(
                                  await window.api.piGetQuotationAlternatives(revId)
                                )
                                const sameLabel = (x?: { label?: string | null }): boolean =>
                                  (x?.label || '') === (oldPi[oldIdx].label || '')
                                const match = sameLabel(newPi[oldIdx])
                                  ? newPi[oldIdx]
                                  : newPi.find(sameLabel) || newPi[oldIdx]
                                if (match) {
                                  newSelectedAltId = match.id
                                  await window.api.stripNonSelectedAlternative(revId, match.id)
                                }
                              }
                            }
                          }
                          // Update the policy to reference the new quotation revision + new alt ID
                          const updateFields: Record<string, unknown> = { quotationId: revId }
                          if (newSelectedAltId)
                            updateFields.selectedAlternativeId = newSelectedAltId
                          ok(await window.api.policyUpdate(policy.id, updateFields))
                          showSuccess('Quotation revision created. Navigating to editor...')
                          onNavigateToQuotation(revId, {
                            policyId: policy.id,
                            policyNumber: policy.policyNumber || ''
                          })
                        } else {
                          showError('Failed to create quotation revision')
                        }
                      } catch (err) {
                        showError(errMessage(err, 'Failed to create revision'))
                      }
                    }}
                  >
                    Edit Coverage in Quotation <ChevronRight size={14} />
                  </button>
                )}
              </div>

              {coverageLoading ? (
                <div
                  style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}
                >
                  <Loader2 size={20} className="spinner" style={{ marginBottom: '8px' }} /> Loading
                  coverage data...
                </div>
              ) : !quotationData ? (
                <div
                  style={{
                    padding: '24px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}
                >
                  No linked quotation data available
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Warranties */}
                  {(coverageWarranties.length > 0 || coverageCustomWarranties.length > 0) && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.warranties ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({ ...prev, warranties: !prev.warranties }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.warranties ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Warranties</span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageWarranties.length + coverageCustomWarranties.length}
                        </span>
                      </div>
                      {coverageExpanded.warranties && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {coverageWarranties.map((w, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)'
                              }}
                            >
                              {w.text || w.name || `Warranty ${i + 1}`}
                            </div>
                          ))}
                          {coverageCustomWarranties.map((cw, i) => (
                            <div
                              key={`cw-${i}`}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)',
                                fontStyle: 'italic'
                              }}
                            >
                              {cw.text || `Custom Warranty ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Deductibles */}
                  {coverageDeductibles.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.deductibles ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({
                            ...prev,
                            deductibles: !prev.deductibles
                          }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.deductibles ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Deductibles</span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageDeductibles.length}
                        </span>
                      </div>
                      {coverageExpanded.deductibles && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {coverageDeductibles.map((d, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)'
                              }}
                            >
                              {d.text || d.name || `Deductible ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Exclusions */}
                  {coverageExclusions.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.exclusions ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({ ...prev, exclusions: !prev.exclusions }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.exclusions ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Exclusions</span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageExclusions.length}
                        </span>
                      </div>
                      {coverageExpanded.exclusions && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {coverageExclusions.map((ex, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)'
                              }}
                            >
                              {ex.text || ex.name || `Exclusion ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Clauses */}
                  {coverageClauses.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.clauses ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({ ...prev, clauses: !prev.clauses }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.clauses ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          Conditions / Clauses
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageClauses.length}
                        </span>
                      </div>
                      {coverageExpanded.clauses && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {coverageClauses.map((c, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)'
                              }}
                            >
                              {c.text || c.name || c.code || `Clause ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Subjectivities */}
                  {coverageSubjectivities.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.subjectivities ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({
                            ...prev,
                            subjectivities: !prev.subjectivities
                          }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.subjectivities ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Subjectivities</span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageSubjectivities.length}
                        </span>
                      </div>
                      {coverageExpanded.subjectivities && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {coverageSubjectivities.map((s, i) => (
                            <div
                              key={i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)'
                              }}
                            >
                              {s.text || s.name || `Subjectivity ${i + 1}`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* LOL Alternatives */}
                  {coverageLolOptions.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.lolOptions ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({ ...prev, lolOptions: !prev.lolOptions }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.lolOptions ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          LOL Alternatives
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageLolOptions.length}
                        </span>
                      </div>
                      {coverageExpanded.lolOptions && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px'
                          }}
                        >
                          {coverageLolOptions.map((opt, i) => (
                            <div
                              key={opt.id || i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)',
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center'
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {opt.label || `Alternative ${i + 1}`}
                              </span>
                              <span>
                                {opt.currency || 'USD'} {Number(opt.amount || 0).toLocaleString()}
                              </span>
                              {opt.premiumAmount != null && (
                                <span
                                  style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}
                                >
                                  Premium: {Number(opt.premiumAmount).toLocaleString()}
                                </span>
                              )}
                              {policy.selectedLolOptionId === opt.id && (
                                <span
                                  style={{
                                    fontSize: '0.65rem',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(34,197,94,0.15)',
                                    color: 'var(--success)',
                                    fontWeight: 600
                                  }}
                                >
                                  Selected
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Custom Sections */}
                  {coverageCustomSections.length > 0 && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'var(--table-header-bg)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          marginBottom: coverageExpanded.customSections ? '10px' : 0
                        }}
                        onClick={() =>
                          setCoverageExpanded((prev) => ({
                            ...prev,
                            customSections: !prev.customSections
                          }))
                        }
                      >
                        <ChevronRight
                          size={16}
                          style={{
                            transform: coverageExpanded.customSections ? 'rotate(90deg)' : 'none',
                            transition: 'transform 0.15s'
                          }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                          Custom Sections
                        </span>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            background: 'rgba(var(--accent-primary-rgb), 0.12)',
                            color: 'var(--accent-primary)'
                          }}
                        >
                          {coverageCustomSections.length}
                        </span>
                      </div>
                      {coverageExpanded.customSections && (
                        <div
                          style={{
                            paddingLeft: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}
                        >
                          {coverageCustomSections.map((cs, i) => (
                            <div
                              key={cs.id || i}
                              style={{
                                fontSize: '0.82rem',
                                color: 'var(--text-primary)',
                                padding: '4px 0',
                                borderBottom: '1px solid var(--glass-border-color)'
                              }}
                            >
                              {cs.title && (
                                <div style={{ fontWeight: 600, marginBottom: '2px' }}>
                                  {cs.title}
                                </div>
                              )}
                              {cs.text && (
                                <div
                                  style={{
                                    color: 'var(--text-secondary)',
                                    fontSize: '0.78rem',
                                    whiteSpace: 'pre-wrap'
                                  }}
                                >
                                  {cs.text}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* War Excess Info */}
                  {quotationData?.warExcessEnabled && (
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'color-mix(in srgb, var(--warning) 7%, transparent)',
                        border: '1px solid var(--glass-border-color)'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '8px' }}>
                        War P&I Excess
                      </div>
                      <div
                        style={{
                          fontSize: '0.82rem',
                          color: 'var(--text-primary)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px'
                        }}
                      >
                        {quotationData.warSection1Text && (
                          <div>Section 1: {quotationData.warSection1Text}</div>
                        )}
                        {quotationData.warSection2Text && (
                          <div>Section 2: {quotationData.warSection2Text}</div>
                        )}
                        {quotationData.warCombinedLimitText && (
                          <div
                            style={{
                              marginTop: '4px',
                              color: 'var(--text-secondary)',
                              fontSize: '0.78rem'
                            }}
                          >
                            {quotationData.warCombinedLimitText}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {coverageWarranties.length === 0 &&
                    coverageCustomWarranties.length === 0 &&
                    coverageDeductibles.length === 0 &&
                    coverageExclusions.length === 0 &&
                    coverageClauses.length === 0 &&
                    coverageSubjectivities.length === 0 &&
                    coverageCustomSections.length === 0 && (
                      <div
                        style={{
                          padding: '24px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)',
                          fontSize: '0.85rem'
                        }}
                      >
                        No coverage items found in the linked quotation
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Sticky save/cancel footer */}
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              padding: '14px 20px',
              marginTop: '16px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--glass-border-color)',
              borderRadius: '12px',
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '10px',
              zIndex: 10
            }}
          >
            <button
              className="btn-secondary"
              style={{ padding: '8px 20px', fontSize: '0.85rem' }}
              onClick={() =>
                void confirmLeave().then((leave) => {
                  if (leave) setIsEditing(false)
                })
              }
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              style={{
                padding: '8px 24px',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
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
          <Tabs
            style={{ marginBottom: '16px' }}
            value={readTab}
            onChange={setReadTab}
            items={[
              { key: 'overview', label: 'Overview', icon: <Ship size={15} /> },
              {
                key: 'blueCards',
                label: 'Blue Cards',
                icon: <CreditCard size={15} />,
                count: blueCards.length,
                hidden: !isPIType
              },
              {
                key: 'endorsements',
                label: 'Endorsements',
                icon: <FileCheck size={15} />,
                count: endorsementCount ?? undefined
              },
              {
                key: 'revisions',
                label: 'Revisions',
                icon: <Clock size={15} />,
                count: revisionCount ?? undefined
              }
            ]}
          />
          {readTab === 'overview' && (
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
                        <div style={valueStyle}>
                          {policy.rebuiltYear
                            ? `${policy.builtYear} / Rebuilt ${policy.rebuiltYear}`
                            : policy.builtYear}
                        </div>
                      </div>
                    )}
                    {policy.grossTonnage && (
                      <div>
                        <div style={labelStyle}>Gross tonnage</div>
                        <div style={valueStyle}>{Number(policy.grossTonnage).toLocaleString()}</div>
                      </div>
                    )}
                  </div>

                  {/* Customer */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={labelStyle}>Customer</div>
                    <div style={valueStyle}>
                      {policy.customerName || (
                        <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          -
                        </span>
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
                      <div style={labelStyle}>Source quotation</div>
                      <div style={valueStyle}>
                        {onNavigateToQuotation ? (
                          <span
                            onClick={() =>
                              onNavigateToQuotation(policy.quotationId, {
                                policyId: policy.id,
                                policyNumber: policy.policyNumber
                              })
                            }
                            style={{
                              color: 'var(--accent)',
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: '0.85rem'
                            }}
                          >
                            {policy.quotationReference ||
                              quotationData?.referenceNumber ||
                              policy.quotationId}
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.85rem' }}>
                            {policy.quotationReference ||
                              quotationData?.referenceNumber ||
                              policy.quotationId}
                          </span>
                        )}
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
                        {formatAmount(policy.premiumAmount, policy.premiumCurrency)}
                      </div>
                    </div>
                    {policy.perAnnumPremium != null && (
                      <div>
                        <div style={labelStyle}>Per annum premium</div>
                        <div style={{ ...valueStyle, fontWeight: 600 }}>
                          {formatAmount(policy.perAnnumPremium, policy.premiumCurrency)}
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
                              ({formatAmount(commissionAmount, policy.premiumCurrency)})
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {netPremium != null && (
                      <div>
                        <div style={labelStyle}>Net premium</div>
                        <div
                          style={{
                            ...valueStyle,
                            fontWeight: 600,
                            color: 'var(--success)'
                          }}
                        >
                          {formatAmount(netPremium, policy.premiumCurrency)}
                        </div>
                      </div>
                    )}
                    {receiptSummary && (
                      <div>
                        <div style={labelStyle}>Received</div>
                        <div style={valueStyle}>
                          {receiptSummary.receipts.length === 0 ? (
                            <span className="muted">No receipts yet</span>
                          ) : (
                            <span
                              title={receiptSummary.receipts
                                .map(
                                  (r) =>
                                    `${r.receiptNumber} · ${formatDateShort(r.receiptDate)} · ${formatAmount(r.amount, r.currency)}`
                                )
                                .join('\n')}
                            >
                              <strong>
                                {Object.entries(receiptSummary.totals)
                                  .map(([cur, amt]) => formatAmount(amt, cur))
                                  .join(' + ')}
                              </strong>{' '}
                              <span className="muted">
                                ({receiptSummary.receipts.length} receipt
                                {receiptSummary.receipts.length === 1 ? '' : 's'}, last{' '}
                                {formatDateShort(
                                  receiptSummary.receipts[receiptSummary.receipts.length - 1]
                                    .receiptDate
                                )}
                                )
                              </span>
                            </span>
                          )}
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
                        <div style={labelStyle}>Pro rata</div>
                        <div style={valueStyle}>Yes</div>
                      </div>
                    )}
                    {policy.exchangeRate != null && policy.exchangeRate !== 1 && (
                      <div>
                        <div style={labelStyle}>Exchange rate</div>
                        <div style={valueStyle}>{policy.exchangeRate.toFixed(6)}</div>
                      </div>
                    )}
                  </div>

                  {/* Instalment table */}
                  {instalments.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      <div className="field-label" style={{ marginBottom: '8px' }}>
                        Instalments
                      </div>
                      {(() => {
                        // Compact: currency once in the headings, one line per cell, and the
                        // commission / net columns only when there is a commission
                        const cur = policy.premiumCurrency || 'USD'
                        const num = (n?: number | null): string =>
                          n == null
                            ? '-'
                            : Number(n).toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                              })
                        const hasComm = instalments.some((i) => (i.commissionAmount || 0) !== 0)
                        const th: React.CSSProperties = { padding: '8px 10px' }
                        const td: React.CSSProperties = {
                          padding: '8px 10px',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums'
                        }
                        return (
                          <div className="table-wrap">
                            <table className="data-table">
                              <thead>
                                <tr>
                                  <th style={{ ...th, width: '1%' }}>#</th>
                                  <th style={th}>Due Date</th>
                                  <th style={{ ...th, textAlign: 'right' }}>Premium ({cur})</th>
                                  {hasComm && (
                                    <th style={{ ...th, textAlign: 'right' }}>Commission</th>
                                  )}
                                  {hasComm && <th style={{ ...th, textAlign: 'right' }}>Net</th>}
                                  <th style={{ ...th, textAlign: 'center', width: '1%' }}>NR</th>
                                </tr>
                              </thead>
                              <tbody>
                                {instalments.map((inst) => (
                                  <tr key={inst.instalmentNumber}>
                                    <td style={td}>{inst.instalmentNumber}</td>
                                    <td style={td}>
                                      {inst.dueDate ? formatDateShort(inst.dueDate) : '-'}
                                    </td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>
                                      {num(inst.premiumAmount)}
                                    </td>
                                    {hasComm && (
                                      <td style={{ ...td, textAlign: 'right' }}>
                                        {num(inst.commissionAmount)}
                                      </td>
                                    )}
                                    {hasComm && (
                                      <td
                                        style={{
                                          ...td,
                                          textAlign: 'right',
                                          color: 'var(--success)'
                                        }}
                                      >
                                        {num(
                                          (inst.premiumAmount || 0) - (inst.commissionAmount || 0)
                                        )}
                                      </td>
                                    )}
                                    <td style={{ ...td, textAlign: 'center' }}>
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
                                          title="Non-refundable"
                                        >
                                          NR
                                        </span>
                                      ) : (
                                        <span style={{ color: 'var(--text-secondary)' }}>-</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      })()}
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
                          background: 'var(--table-header-bg)',
                          border: '1px solid var(--glass-border-color)'
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
                                background: 'rgba(var(--accent-primary-rgb), 0.08)',
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
            </>
          )}

          {/* Blue Cards Section */}
          {readTab === 'blueCards' && isPIType && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <CreditCard size={18} style={{ color: 'var(--accent-primary)' }} />
                <span style={cardTitleStyle}>Blue Cards</span>
                {blueCards.length > 0 && (
                  <span
                    style={{
                      padding: '2px 10px',
                      borderRadius: '10px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: 'rgba(var(--accent-primary-rgb), 0.12)',
                      color: 'var(--accent-primary)'
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
                  disabled={!hasPermission('policies:manage')}
                  title={
                    hasPermission('policies:manage')
                      ? undefined
                      : 'Requires the Manage Policies permission'
                  }
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
                          background: 'var(--accent-primary)',
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
                            disabled={!hasPermission('policies:manage')}
                            title={
                              hasPermission('policies:manage')
                                ? undefined
                                : 'Requires the Manage Policies permission'
                            }
                          >
                            Issue
                          </button>
                        </>
                      )}
                    </div>

                    {/* Cards for this type */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        paddingLeft: '16px'
                      }}
                    >
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
                                  ? 'rgba(var(--accent-primary-rgb), 0.04)'
                                  : 'rgba(var(--accent-primary-rgb), 0.06)',
                              border: `1px solid ${
                                isSuperseded
                                  ? 'var(--glass-border)'
                                  : isLight
                                    ? 'rgba(var(--accent-primary-rgb), 0.2)'
                                    : 'rgba(var(--accent-primary-rgb), 0.15)'
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
                              {isActive && <Check size={14} style={{ color: '#00c864' }} />}
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
                              {'\u2192'} {card.expiryDate ? formatDateShort(card.expiryDate) : '?'}
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
                                  color: 'var(--warning)',
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
                                    disabled={!hasPermission('policies:manage')}
                                    title={
                                      hasPermission('policies:manage')
                                        ? undefined
                                        : 'Requires the Manage Policies permission'
                                    }
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
                                    disabled={!hasPermission('policies:manage')}
                                    title={
                                      hasPermission('policies:manage')
                                        ? undefined
                                        : 'Requires the Manage Policies permission'
                                    }
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
            <Modal
              title={
                bcModalMode === 'edit'
                  ? 'Edit Blue Card'
                  : bcModalMode === 'reissue'
                    ? 'Reissue Blue Card'
                    : 'Issue New Blue Card'
              }
              icon={<CreditCard size={18} />}
              onClose={() => setBcModalOpen(false)}
              width={560}
              closeOnOverlay={false}
              footer={
                <>
                  <button className="btn-secondary" onClick={() => setBcModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={handleSaveBlueCard} disabled={bcSaving}>
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
                </>
              }
            >
              {/* Card Type */}
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field-label">Card type</label>
                {bcModalMode === 'edit' || bcPreselectedType ? (
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: 'rgba(var(--accent-primary-rgb), 0.08)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--accent-primary)'
                    }}
                  >
                    {bcForm.cardType} — {CARD_TYPE_LABELS[bcForm.cardType]}
                  </div>
                ) : (
                  <select
                    value={bcForm.cardType}
                    onChange={(e) => handleCardTypeChange(e.target.value as CardType)}
                    style={{ width: '100%' }}
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
              <div className="form-grid cols-2" style={{ marginBottom: '14px' }}>
                <Field label="Inception date">
                  <input
                    type="date"
                    value={bcForm.inceptionDate}
                    onChange={(e) => updateBcDate('inceptionDate', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
                <Field label="Expiry date">
                  <input
                    type="date"
                    value={bcForm.expiryDate}
                    onChange={(e) => updateBcDate('expiryDate', e.target.value)}
                    style={{ width: '100%' }}
                  />
                </Field>
              </div>

              {/* Owner */}
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field-label">Owner</label>
                <select
                  value={bcForm.ownerEntityId || '__custom__'}
                  onChange={(e) => handleOwnerChange(e.target.value)}
                  style={{ width: '100%', marginBottom: '8px' }}
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
                  onChange={(e) => setBcForm((f) => ({ ...f, ownerName: e.target.value }))}
                  style={{ width: '100%', marginBottom: '8px' }}
                />
                <textarea
                  placeholder="Owner address"
                  value={bcForm.ownerAddress}
                  onChange={(e) => setBcForm((f) => ({ ...f, ownerAddress: e.target.value }))}
                  rows={2}
                  style={{ width: '100%', resize: 'vertical' }}
                />
                {/* Further assureds: printed under the owner, each with its address */}
                {bcForm.additionalOwners.map((o, idx) => {
                  const setOwner = (patch: Partial<BlueCardOwner>): void =>
                    setBcForm((f) => ({
                      ...f,
                      additionalOwners: f.additionalOwners.map((x, i) =>
                        i === idx ? { ...x, ...patch } : x
                      )
                    }))
                  return (
                    <div
                      key={idx}
                      style={{
                        marginTop: '10px',
                        paddingTop: '10px',
                        borderTop: '1px dashed var(--glass-border-color)'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <select
                          value={o.entityId || '__custom__'}
                          onChange={(e) => {
                            const opt = ownerOptions.find((x) => x.id === e.target.value)
                            setOwner(
                              opt
                                ? { entityId: opt.id, name: opt.name, address: opt.address || '' }
                                : { entityId: null }
                            )
                          }}
                          style={{ flex: 1 }}
                          aria-label={`Assured ${idx + 2}`}
                        >
                          {ownerOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.name}
                              {opt.role ? ` (${opt.role})` : ''}
                            </option>
                          ))}
                          <option value="__custom__">Custom...</option>
                        </select>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          title="Remove this assured"
                          aria-label="Remove this assured"
                          onClick={() =>
                            setBcForm((f) => ({
                              ...f,
                              additionalOwners: f.additionalOwners.filter((_, i) => i !== idx)
                            }))
                          }
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="Assured name"
                        value={o.name}
                        onChange={(e) => setOwner({ name: e.target.value })}
                        style={{ width: '100%', marginBottom: '8px' }}
                      />
                      <textarea
                        placeholder="Assured address"
                        value={o.address || ''}
                        onChange={(e) => setOwner({ address: e.target.value })}
                        rows={2}
                        style={{ width: '100%', resize: 'vertical' }}
                      />
                    </div>
                  )
                })}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ marginTop: '8px' }}
                  onClick={() =>
                    setBcForm((f) => {
                      // Suggest the next assured not on the card yet
                      const used = new Set(
                        [f.ownerEntityId, ...f.additionalOwners.map((x) => x.entityId)].filter(
                          Boolean
                        )
                      )
                      const next = ownerOptions.find((x) => !used.has(x.id))
                      return {
                        ...f,
                        additionalOwners: [
                          ...f.additionalOwners,
                          next
                            ? { entityId: next.id, name: next.name, address: next.address || '' }
                            : { entityId: null, name: '', address: '' }
                        ]
                      }
                    })
                  }
                >
                  <Plus size={14} /> Add another assured
                </button>
              </div>

              {/* Port of Registry */}
              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field-label">Port of registry</label>
                {flagPorts.length > 1 ? (
                  <select
                    value={bcForm.portOfRegistry}
                    onChange={(e) => setBcForm((f) => ({ ...f, portOfRegistry: e.target.value }))}
                    style={{ width: '100%' }}
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
                      flagPorts.length === 1 ? flagPorts[0].name : 'Enter port of registry...'
                    }
                    value={bcForm.portOfRegistry}
                    onChange={(e) => setBcForm((f) => ({ ...f, portOfRegistry: e.target.value }))}
                    style={{ width: '100%' }}
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
                    background: 'var(--table-header-bg)',
                    border: '1px solid var(--glass-border-color)'
                  }}
                >
                  <label className="field-label" style={{ marginBottom: '8px', display: 'block' }}>
                    Addressed to (flag state authority)
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
                          color: 'var(--warning)',
                          fontSize: '0.78rem',
                          fontWeight: 500,
                          marginBottom: '10px'
                        }}
                      >
                        <AlertTriangle size={14} />
                        {vesselFlagState.name} has not ratified the{' '}
                        {bcForm.cardType === 'BBC'
                          ? 'Bunkers Convention'
                          : 'Wreck Removal Convention'}
                        . Select a ratified flag state below.
                      </div>
                    )}

                  <select
                    value={bcForm.addressedToFlagId}
                    onChange={(e) => handleAddressedToFlagChange(e.target.value)}
                    style={{ width: '100%', marginBottom: '8px' }}
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

                  {/* Inline "add flag state" — when the ratified flag needed isn't listed */}
                  {!bcAddingFlag ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBcAddingFlag(true)
                        setNewFlagForm({
                          name: '',
                          iso3: '',
                          ratBunker: bcForm.cardType === 'BBC',
                          ratWreck: bcForm.cardType === 'WRC',
                          authName: '',
                          authAddr: ''
                        })
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginBottom: '8px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        color: 'var(--accent-primary)',
                        fontSize: '0.78rem',
                        fontWeight: 600
                      }}
                    >
                      <Plus size={13} /> Flag state not listed? Add it
                    </button>
                  ) : (
                    <div
                      style={{
                        marginBottom: '10px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px solid var(--input-border)',
                        background: 'var(--bg-primary)'
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr',
                          gap: '8px',
                          marginBottom: '8px'
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Flag state name"
                          value={newFlagForm.name}
                          onChange={(e) => setNewFlagForm((f) => ({ ...f, name: e.target.value }))}
                        />
                        <input
                          type="text"
                          placeholder="ISO3 (e.g. PAN)"
                          maxLength={3}
                          value={newFlagForm.iso3}
                          onChange={(e) =>
                            setNewFlagForm((f) => ({ ...f, iso3: e.target.value.toUpperCase() }))
                          }
                          style={{ textTransform: 'uppercase' }}
                        />
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          gap: '16px',
                          marginBottom: '8px',
                          fontSize: '0.8rem'
                        }}
                      >
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={newFlagForm.ratBunker}
                            onChange={(e) =>
                              setNewFlagForm((f) => ({ ...f, ratBunker: e.target.checked }))
                            }
                          />
                          Ratified Bunker
                        </label>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={newFlagForm.ratWreck}
                            onChange={(e) =>
                              setNewFlagForm((f) => ({ ...f, ratWreck: e.target.checked }))
                            }
                          />
                          Ratified Wreck
                        </label>
                      </div>
                      <input
                        type="text"
                        placeholder="Authority name"
                        value={newFlagForm.authName}
                        onChange={(e) =>
                          setNewFlagForm((f) => ({ ...f, authName: e.target.value }))
                        }
                        style={{ width: '100%', marginBottom: '8px' }}
                      />
                      <textarea
                        placeholder="Authority address"
                        rows={2}
                        value={newFlagForm.authAddr}
                        onChange={(e) =>
                          setNewFlagForm((f) => ({ ...f, authAddr: e.target.value }))
                        }
                        style={{ width: '100%', resize: 'vertical', marginBottom: '8px' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setBcAddingFlag(false)}
                          style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={handleAddFlagInline}
                          style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        >
                          Add &amp; Select
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="Authority name"
                    value={bcForm.addressedToName}
                    onChange={(e) => setBcForm((f) => ({ ...f, addressedToName: e.target.value }))}
                    style={{ width: '100%', marginBottom: '8px' }}
                  />
                  <textarea
                    placeholder="Authority address"
                    value={bcForm.addressedToAddress}
                    onChange={(e) =>
                      setBcForm((f) => ({ ...f, addressedToAddress: e.target.value }))
                    }
                    rows={2}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
              )}

              {/* Cancel & Replace */}
              <div
                style={{
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
                    onChange={(e) => setBcForm((f) => ({ ...f, cancelReplace: e.target.checked }))}
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
                    style={{ width: '100%', resize: 'vertical', marginTop: '8px' }}
                  />
                )}
              </div>
            </Modal>
          )}

          {/* Endorsements Card */}
          {readTab === 'endorsements' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <FileCheck size={18} style={{ color: 'var(--text-secondary)' }} />
                <span style={cardTitleStyle}>Endorsements</span>
              </div>
              <EndorsementManager
                key={addEndorsementNonce}
                policyDocId={policyId}
                policyNumber={policy.policyNumber}
                premiumCurrency={policy.premiumCurrency || 'USD'}
                initialAddMode={addEndorsementNonce > 0}
                onCount={setEndorsementCount}
              />
            </div>
          )}

          {/* Revision History Card */}
          {readTab === 'revisions' && (
            <div style={cardStyle}>
              <div style={cardHeaderStyle}>
                <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
                <span style={cardTitleStyle}>Revision History</span>
              </div>
              <RevisionHistorySection
                policyNumber={policy.policyNumber}
                currentPolicyId={policyId}
                onViewRevision={onNavigateToPolicy}
              />
            </div>
          )}
        </>
      )}

      {confirmation.show && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          confirmLabel={confirmation.isDangerous ? 'Delete' : 'Confirm'}
          isDangerous={confirmation.isDangerous}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation((prev) => ({ ...prev, show: false }))}
        />
      )}

      {/* War Declaration Modal */}
      {showDeclarationModal &&
        declarationFields &&
        (() => {
          const f = declarationFields
          const update = (key: keyof DeclarationFields, val: string): void =>
            setDeclarationFields((prev) => (prev ? { ...prev, [key]: val } : prev))
          const fieldRow = (
            label: string,
            key: keyof DeclarationFields,
            rows?: number
          ): React.JSX.Element => (
            <Field label={label}>
              {rows && rows > 1 ? (
                <textarea
                  value={f[key]}
                  onChange={(e) => update(key, e.target.value)}
                  rows={rows}
                  style={{ resize: 'vertical' }}
                />
              ) : (
                <input value={f[key]} onChange={(e) => update(key, e.target.value)} />
              )}
            </Field>
          )
          const wide = (
            label: string,
            key: keyof DeclarationFields,
            rows?: number
          ): React.JSX.Element => (
            <div key={key} style={{ gridColumn: '1 / -1' }}>
              {fieldRow(label, key, rows)}
            </div>
          )
          return (
            <Modal
              title="War Declaration"
              icon={<FileCheck size={18} />}
              onClose={() => setShowDeclarationModal(false)}
              width={700}
              closeOnOverlay={false}
              footer={
                <>
                  <button onClick={() => setShowDeclarationModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const { exportDeclarationDocx } =
                          await import('../services/PolicyExportService')
                        await exportDeclarationDocx(policyId, f)
                        showSuccess('Declaration exported')
                        setShowDeclarationModal(false)
                      } catch (err) {
                        showError(errMessage(err, 'Export failed'))
                      }
                    }}
                    className="btn-primary"
                  >
                    <Download size={14} /> Export
                  </button>
                </>
              }
            >
              <div className="form-section">
                <div className="form-grid cols-2">
                  {fieldRow('Year of account', 'yearOfAccount')}
                  {fieldRow('UMR', 'umr')}
                  {wide('Reinsured', 'reinsured')}
                  {wide('Assured', 'assuredText', 3)}
                </div>
              </div>
              <div className="form-section">
                <h4 className="form-section-title">Vessel</h4>
                <div className="form-grid cols-2">
                  {fieldRow('Name', 'vesselName')}
                  {fieldRow('IMO', 'vesselImo')}
                  {fieldRow('Sum insured', 'vesselSumInsured')}
                  {fieldRow('IV (if applicable)', 'vesselSumInsuredIV')}
                  {fieldRow('Total value', 'vesselTotalValue')}
                  {fieldRow('Built', 'vesselBuilt')}
                  {fieldRow('GT', 'vesselGT')}
                  {fieldRow('Type', 'vesselType')}
                  {wide('Class', 'vesselClass')}
                </div>
              </div>
              <div className="form-section">
                <div className="form-grid cols-2">
                  {wide('Period from', 'periodFrom')}
                  {wide('Period to', 'periodTo')}
                  {wide('Wording', 'wording', 8)}
                  {wide('Warranties', 'warranties', 3)}
                  {fieldRow('Annual rate', 'annualRate')}
                  {fieldRow('Our share', 'ourShare')}
                  {wide('Trading', 'trading', 3)}
                  {wide('Risk code', 'riskCode')}
                  {wide('Amlin ref', 'amlinRef')}
                </div>
              </div>
            </Modal>
          )
        })()}

      {/* Cancel Policy Modal */}
      {showCancelModal &&
        policy &&
        (() => {
          const currency = policy.premiumCurrency || 'USD'
          const commPct = Number(policy.commissionPercent) || 0
          const isPnI = policy.quotationTypeCode === 'P'

          // Calculate return amounts
          let returnPremium = 0
          let returnCommission = 0
          // Pro-rata return before the NCB/UPCC reclaim, and the discount reclaimed
          let grossReturn = 0
          let given: DiscountGiven | null = null
          let returnInstalments: Array<{
            instalmentNumber: number
            dueDate: string
            premiumAmount: number
            commissionAmount: number
          }> = []

          if (cancelMode === 'instalment' && instalments.length > 0) {
            returnInstalments = instalments
              .filter((inst) => inst.instalmentNumber > cancelAfterInstalment)
              .map((inst) => {
                const prem = Number(inst.premiumAmount || inst.amount || 0)
                const comm = Number(inst.commissionAmount || 0)
                return {
                  instalmentNumber: inst.instalmentNumber,
                  dueDate: inst.dueDate,
                  premiumAmount: prem,
                  commissionAmount: comm
                }
              })
            returnPremium = returnInstalments.reduce((s, i) => s + i.premiumAmount, 0)
            returnCommission = returnInstalments.reduce((s, i) => s + i.commissionAmount, 0)
          } else if (cancelMode === 'date' && cancelDate && policy.premiumAmount) {
            // Pro-rata calculation using shared utility
            const totalPrem = Number(policy.premiumAmount) || 0
            const totalPeriod = countDays(policy.inceptionDate ?? '', policy.expiryDate ?? '')
            const remainPeriod = countDays(cancelDate, policy.expiryDate ?? '')
            if (cancelReclaim) {
              const asGiven = (d: {
                type: GivenDiscount['type']
                value: string
              }): GivenDiscount => ({ type: d.type, value: parseFloat(d.value) || 0 })
              given = discountGivenFromPayable(totalPrem, asGiven(cancelNcb), asGiven(cancelUpcc))
              if (given.total <= 0) given = null
            }
            if (totalPeriod.days > 0) {
              const calc = calcProRataPremium(
                remainPeriod.days,
                totalPrem,
                totalPeriod.days,
                1,
                commPct,
                given?.total || 0
              )
              grossReturn = calc.grossProRataPremium
              returnPremium = calc.proRataPremium
              returnCommission = calc.commissionTotal
            }
            // Build instalments using shared bottom-fill
            if (instalments.length > 0 && returnPremium > 0) {
              const dist = distributeInstalments(
                returnPremium,
                totalPrem,
                instalments.map((inst) => ({
                  instalmentNumber: inst.instalmentNumber,
                  dueDate: inst.dueDate
                })),
                commPct
              )
              returnInstalments = dist.map((d) => ({
                instalmentNumber: d.instalmentNumber,
                dueDate: d.dueDate,
                premiumAmount: d.premiumAmount,
                commissionAmount: d.commissionAmount
              }))
            }
          }

          const effectiveDate =
            cancelMode === 'instalment'
              ? cancelAfterInstalment > 0 && instalments[cancelAfterInstalment - 1]?.dueDate
                ? instalments[cancelAfterInstalment - 1].dueDate.slice(0, 10)
                : policy.inceptionDate?.slice(0, 10) || ''
              : cancelDate

          const confirmCancel = async (): Promise<void> => {
            if (returnPremium <= 0 && cancelMode === 'date') {
              showError(
                given && grossReturn > 0
                  ? 'The NCB/UPCC reclaimed is more than the return premium'
                  : 'Enter a valid cancellation date'
              )
              return
            }
            setCancelling(true)
            try {
              const content =
                `<p>It is hereby agreed that the above-mentioned policy is cancelled effective ${effectiveDate ? new Date(effectiveDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'the date hereof'}.</p>` +
                (given
                  ? `<p>The No Claims Bonus / UPCC of ${currency} ${given.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} granted on this policy is reclaimed and deducted from the return premium.</p>`
                  : '')
              await window.api.endorsementCancelPolicy(policyId, {
                effectiveDate: effectiveDate || new Date().toISOString().slice(0, 10),
                endorsementContent: content,
                returnPremium,
                premiumCurrency: currency,
                commissionPercent: commPct,
                instalments: returnInstalments,
                isProRata: cancelMode === 'date',
                annualPremium: cancelMode === 'date' ? Number(policy.premiumAmount) || 0 : null,
                policyNumber: policy.policyNumber
              })
              showSuccess('Policy cancelled')
              setShowCancelModal(false)
              // Reload to reflect cancelled status
              loadData()
            } catch (err) {
              showError(errMessage(err, 'Failed to cancel policy'))
            }
            setCancelling(false)
          }

          return (
            <Modal
              title="Cancel Policy"
              onClose={() => setShowCancelModal(false)}
              width={520}
              closeOnOverlay={false}
              footer={
                <>
                  <button className="btn-secondary" onClick={() => setShowCancelModal(false)}>
                    Close
                  </button>
                  <button className="btn-danger" onClick={confirmCancel} disabled={cancelling}>
                    {cancelling ? <Loader2 size={14} className="spin" /> : <X size={14} />}
                    Cancel Policy
                  </button>
                </>
              }
            >
              <p
                style={{
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '16px'
                }}
              >
                {policy.policyNumber} — {policy.vesselName}
              </p>

              {/* Mode selector */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {(['instalment', 'date'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setCancelMode(m)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      border:
                        cancelMode === m
                          ? '2px solid var(--accent-primary)'
                          : '1px solid var(--glass-border-color)',
                      background:
                        cancelMode === m ? 'rgba(var(--accent-primary-rgb), 0.08)' : 'transparent',
                      color: cancelMode === m ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {m === 'instalment' ? 'Cancel on Instalment' : 'Cancel on Date (Pro-rata)'}
                  </button>
                ))}
              </div>

              {/* Instalment mode */}
              {cancelMode === 'instalment' && instalments.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <Field label="Cancel after instalment">
                    <select
                      value={cancelAfterInstalment}
                      onChange={(e) => setCancelAfterInstalment(Number(e.target.value))}
                    >
                      <option value={0}>From inception (return all)</option>
                      {instalments.map((inst) => (
                        <option key={inst.instalmentNumber} value={inst.instalmentNumber}>
                          After {inst.instalmentNumber}
                          {inst.instalmentNumber === 1
                            ? 'st'
                            : inst.instalmentNumber === 2
                              ? 'nd'
                              : inst.instalmentNumber === 3
                                ? 'rd'
                                : 'th'}{' '}
                          instalment
                          {inst.isNonRefundable ? ' (non-refundable)' : ''}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
              )}

              {/* Date mode */}
              {cancelMode === 'date' && (
                <div style={{ marginBottom: '16px' }}>
                  <Field label="Cancellation effective date">
                    <input
                      type="date"
                      value={cancelDate}
                      onChange={(e) => setCancelDate(e.target.value)}
                    />
                  </Field>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '12px',
                      fontSize: '0.85rem'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={cancelReclaim}
                      onChange={(e) => setCancelReclaim(e.target.checked)}
                    />
                    Reclaim the NCB/UPCC given (taken off the return premium)
                  </label>
                  {cancelReclaim && (
                    <div className="form-grid cols-2" style={{ marginTop: '8px' }}>
                      {(
                        [
                          ['NCB', cancelNcb, setCancelNcb],
                          ['UPCC', cancelUpcc, setCancelUpcc]
                        ] as const
                      ).map(([label, d, setD]) => (
                        <Field
                          key={label}
                          label={label}
                          hint={
                            d.type === 'pct'
                              ? label === 'NCB'
                                ? '% of the technical premium'
                                : '% of the premium after NCB'
                              : `Amount in ${currency}`
                          }
                        >
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <select
                              value={d.type}
                              onChange={(e) =>
                                setD({ ...d, type: e.target.value as GivenDiscount['type'] })
                              }
                              aria-label={`${label} type`}
                              style={{ width: '96px', flexShrink: 0 }}
                            >
                              <option value="pct">%</option>
                              <option value="amount">Amount</option>
                            </select>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={d.value}
                              onChange={(e) => setD({ ...d, value: e.target.value })}
                              aria-label={`${label} given`}
                              style={{ flex: 1, minWidth: 0 }}
                            />
                          </div>
                        </Field>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {cancelMode === 'date' && given && grossReturn > 0 && returnPremium <= 0 && (
                <div style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: '12px' }}>
                  The NCB/UPCC reclaimed ({currency}{' '}
                  {given.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}) is more than
                  the pro-rata return ({currency}{' '}
                  {grossReturn.toLocaleString('en-US', { minimumFractionDigits: 2 })})
                </div>
              )}

              {/* Preview */}
              {returnPremium > 0 && (
                <div
                  style={{
                    background: 'var(--table-header-bg)',
                    border: '1px solid var(--glass-border-color)',
                    borderRadius: '8px',
                    padding: '14px',
                    marginBottom: '16px'
                  }}
                >
                  <div className="field-label" style={{ marginBottom: '8px' }}>
                    Return summary
                  </div>
                  {given && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '6px'
                      }}
                    >
                      Pro-rata return {currency}{' '}
                      {grossReturn.toLocaleString('en-US', { minimumFractionDigits: 2 })} less
                      NCB/UPCC reclaimed {currency}{' '}
                      {given.total.toLocaleString('en-US', { minimumFractionDigits: 2 })} (technical
                      premium{' '}
                      {given.technical.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      {given.ncbAmount > 0 &&
                        `, NCB ${given.ncbAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                      {given.upccAmount > 0 &&
                        `, UPCC ${given.upccAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                      )
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '4px',
                      fontSize: '0.85rem'
                    }}
                  >
                    <span>Return Premium</span>
                    <span style={{ fontWeight: 700 }}>
                      {currency}{' '}
                      {returnPremium.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {returnCommission > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '4px',
                        fontSize: '0.85rem'
                      }}
                    >
                      <span>Commission to Reclaim ({commPct}%)</span>
                      <span style={{ fontWeight: 700 }}>
                        {currency}{' '}
                        {returnCommission.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}
                  {returnInstalments.length > 0 && (
                    <div
                      style={{
                        marginTop: '8px',
                        borderTop: '1px solid var(--glass-border-color)',
                        paddingTop: '8px'
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-secondary)',
                          marginBottom: '4px'
                        }}
                      >
                        Instalments to return:
                      </div>
                      {returnInstalments.map((inst, i) => (
                        <div
                          key={i}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.8rem',
                            marginBottom: '2px'
                          }}
                        >
                          <span>
                            #{inst.instalmentNumber} —{' '}
                            {inst.dueDate ? formatDateShort(inst.dueDate) : '—'}
                          </span>
                          <span>
                            {currency}{' '}
                            {inst.premiumAmount.toLocaleString('en-US', {
                              minimumFractionDigits: 2
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Warnings */}
              <div style={{ fontSize: '0.8rem' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '4px',
                    color: 'var(--danger)'
                  }}
                >
                  <AlertTriangle size={14} /> Policy will be marked as cancelled
                </div>
                {isPnI && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginBottom: '4px',
                      color: 'var(--warning)'
                    }}
                  >
                    <AlertTriangle size={14} /> Active blue cards will be superseded
                  </div>
                )}
              </div>
            </Modal>
          )
        })()}

      {/* Export overlay: blocks the page until the PDF + T&C is built (cannot be closed) */}
      {(exportingPdfTC || pdfBusy) && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              borderRadius: '12px',
              padding: '32px 40px',
              textAlign: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              maxWidth: '360px'
            }}
          >
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid var(--glass-border-color)',
                borderTopColor: 'var(--accent-primary)',
                borderRadius: '50%',
                margin: '0 auto 16px',
                animation: 'spin 1s linear infinite'
              }}
            />
            <div style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '6px' }}>
              Exporting Policy
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {pdfBusy || 'Converting to PDF and merging with T&C. Please wait...'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RevisionHistorySection({
  policyNumber,
  currentPolicyId,
  onViewRevision
}: {
  policyNumber: string
  currentPolicyId: string
  onViewRevision?: (policyId: string) => void
}): React.JSX.Element {
  const [revisions, setRevisions] = useState<PolicyRevision[]>([])
  const [loadingRevisions, setLoading] = useState(true)
  // Nothing to load without a policy number
  const loading = !!policyNumber && loadingRevisions

  useEffect(() => {
    if (!policyNumber) return
    ;(async () => {
      try {
        const revs = await window.api.policyGetRevisions(policyNumber)
        if (Array.isArray(revs)) {
          setRevisions(revs)
        } else {
          // Fallback: just show current policy info
          setRevisions([])
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false)
      }
    })()
  }, [policyNumber])

  if (loading)
    return (
      <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        Loading...
      </div>
    )
  if (revisions.length === 0)
    return (
      <div style={{ padding: '12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
        No revision history
      </div>
    )

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Rev</th>
            <th>Status</th>
            <th>Created</th>
            <th>By</th>
            <th>Exported</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {revisions.map((rev) => {
            const isCurrent = rev.id === currentPolicyId
            return (
              <tr key={rev.id} className={isCurrent ? 'selected' : undefined}>
                <td style={{ fontWeight: isCurrent ? 700 : 400 }}>
                  R{rev.revisionNumber}
                  {isCurrent && (
                    <span
                      style={{
                        marginLeft: '6px',
                        fontSize: '0.7rem',
                        color: 'var(--accent-primary)',
                        fontWeight: 700
                      }}
                    >
                      CURRENT
                    </span>
                  )}
                </td>
                <td>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '8px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background:
                        rev.status === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(150,150,150,0.1)',
                      color: rev.status === 'active' ? 'var(--success)' : 'var(--text-secondary)',
                      border: `1px solid ${rev.status === 'active' ? 'rgba(34,197,94,0.2)' : 'rgba(150,150,150,0.2)'}`
                    }}
                  >
                    {(rev.status || '').toUpperCase()}
                  </span>
                </td>
                <td className="muted">{rev.createdAt ? formatDate(rev.createdAt) : '-'}</td>
                <td className="muted">{rev.createdByName || '-'}</td>
                <td className="muted">{rev.exportedAt ? formatDate(rev.exportedAt) : '-'}</td>
                <td style={{ textAlign: 'right' }}>
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
    </div>
  )
}
