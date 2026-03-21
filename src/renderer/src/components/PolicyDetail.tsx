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
  Check
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
import type { FlagState, FlagStatePort, VesselAssured } from '../../../shared/types'

interface PolicyDetailProps {
  policyId: string
  onBack: () => void
  onNavigateToVessel?: (vesselId: string) => void
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
  customerName: string
  callSign?: string
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

export default function PolicyDetail({ policyId, onBack, onNavigateToVessel }: PolicyDetailProps) {
  const [policy, setPolicy] = useState<PolicyRecord | null>(null)
  const [instalments, setInstalments] = useState<Instalment[]>([])
  const [addresses, setAddresses] = useState<PolicyAddress[]>([])
  const [blueCards, setBlueCards] = useState<BlueCard[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingPolicy, setExportingPolicy] = useState(false)
  const [exportingDA, setExportingDA] = useState(false)
  const [exportingCA, setExportingCA] = useState(false)
  const [exportingBC, setExportingBC] = useState(false)

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

  // Load supplementary data for blue card management
  useEffect(() => {
    const loadSupplementary = async (): Promise<void> => {
      try {
        const [fs, entities] = await Promise.all([
          window.api.getFlagStates(),
          window.api.getEntities()
        ])
        setFlagStates(Array.isArray(fs) ? fs : [])
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
          companyName: reportSettings.companyName || 'Insurance Company'
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
      ? (policy.commissionPercent / 100) * policy.premiumAmount
      : null

  const handleExportPolicy = async () => {
    setExportingPolicy(true)
    try {
      await exportPolicyDocx(policyId)
      showSuccess('Policy document exported')
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
              {policy.policyNumber || 'Untitled Policy'}
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
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
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
            <button
              className="btn-secondary"
              style={exportBtnStyle}
              onClick={handleExportBC}
              disabled={exportingBC}
              title="Export Blue Cards DOCX"
            >
              {exportingBC ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              Export Blue Cards
            </button>
          )}
          {hasPermission('policies:manage') && (
            <button
              onClick={async () => {
                if (
                  !confirm(
                    'Are you sure you want to delete this policy? This cannot be undone.'
                  )
                )
                  return
                try {
                  await window.api.policyDelete(policyId)
                  showSuccess('Policy deleted')
                  onBack()
                } catch (err: any) {
                  showError(err.message || 'Failed to delete')
                }
              }}
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
            {policy.commissionPercent != null && (
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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            marginBottom: '8px'
          }}
        >
          <div>
            <div style={labelStyle}>Revision</div>
            <div style={valueStyle}>{policy.revisionNumber}</div>
          </div>
          <div>
            <div style={labelStyle}>Created</div>
            <div style={valueStyle}>
              {policy.createdAt ? formatDate(policy.createdAt) : '-'}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Created By</div>
            <div style={valueStyle}>{policy.createdBy || '-'}</div>
          </div>
        </div>
      </div>

    </div>
  )
}
