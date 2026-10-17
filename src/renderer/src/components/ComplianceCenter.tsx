import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRequestedSubTab, SubTabProps } from '../utils/useRequestedSubTab'
import {
  AlertCircle,
  Clock,
  CheckCircle,
  ShieldAlert,
  Shield,
  Eye,
  History,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileWarning,
  Database,
  RefreshCw,
  ChevronDown as ChevronDownIcon,
  Settings,
  Plus,
  Pencil,
  Trash2,
  List,
  Layers,
  Search,
  FileText,
  Briefcase
} from 'lucide-react'
import {
  Vessel,
  VesselDocument,
  DocumentType,
  ComplianceCheckLog,
  ComplianceCheckResult,
  CustomValidationRule,
  EntityDocumentType,
  EntityDocument,
  VesselAssured,
  EndorsementDueRow,
  PolicyExpiryRow,
  Entity,
  VesselDynamicPolicy
} from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatDateTime } from '../utils/dateUtils'
import { ok } from '../utils/ipc'
import { confirmDialog, promptDialog } from './DialogHost'
import { PageHeader, Tabs, Badge, Field, EmptyState, Spinner } from './ui'
import { effectiveDocExpiry, getDocStatus } from '../utils/docStatus'
import AlertsByCustomer from './AlertsByCustomer'
import SanctionsReviewDetail from './SanctionsReviewDetail'

const STATIC_RULES = [
  {
    id: 'vessels_no_customer',
    name: 'Vessels without customer',
    description: 'Active vessels with no customer assigned'
  },
  {
    id: 'vessels_no_fleet',
    name: 'Vessels without fleet',
    description: 'Active vessels not assigned to any fleet'
  },
  {
    id: 'entities_no_email',
    name: 'Entities without email',
    description: 'Entities missing email address'
  },
  {
    id: 'entities_no_phone',
    name: 'Entities without phone',
    description: 'Entities missing phone number'
  },
  {
    id: 'policies_no_premium',
    name: 'Policies without premium',
    description: 'Active policies with no premium amount'
  },
  {
    id: 'vessels_no_policies',
    name: 'Vessels without policies',
    description: 'Active vessels with no active policies'
  },
  {
    id: 'orphaned_entities',
    name: 'Orphaned entities',
    description: 'Entities not linked to any vessel'
  },
  { id: 'empty_fleets', name: 'Empty fleets', description: 'Fleets with no vessels assigned' }
]

const RULE_FIELDS: Record<
  string,
  { key: string; label: string; type: 'text' | 'number' | 'boolean' }[]
> = {
  vessel: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'imo_number', label: 'IMO Number', type: 'text' },
    { key: 'vessel_type', label: 'Vessel Type', type: 'text' },
    { key: 'flag_state_id', label: 'Flag State', type: 'text' },
    { key: 'built_year', label: 'Built Year', type: 'number' },
    { key: 'gross_tonnage', label: 'Gross Tonnage', type: 'number' },
    { key: 'customer_id', label: 'Customer', type: 'text' },
    { key: 'fleet_id', label: 'Fleet', type: 'text' },
    { key: 'classification_society', label: 'Classification', type: 'text' },
    { key: 'is_active', label: 'Active Status', type: 'boolean' }
  ],
  entity: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'type', label: 'Type', type: 'text' },
    { key: 'email', label: 'Email', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'identifier', label: 'Identifier', type: 'text' }
  ],
  policy: [
    { key: 'policy_number', label: 'Policy Number', type: 'text' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'premium_amount', label: 'Premium', type: 'number' },
    { key: 'commission_percent', label: 'Commission %', type: 'number' }
  ],
  fleet: [{ key: 'name', label: 'Name', type: 'text' }]
}

const OPERATORS = [
  { key: 'is_null', label: 'Is Null', needsValue: false },
  { key: 'is_empty', label: 'Is Empty', needsValue: false },
  { key: 'equals', label: 'Equals', needsValue: true },
  { key: 'not_equals', label: 'Not Equals', needsValue: true },
  { key: 'less_than', label: 'Less Than', needsValue: true },
  { key: 'greater_than', label: 'Greater Than', needsValue: true },
  { key: 'contains', label: 'Contains', needsValue: true },
  { key: 'not_contains', label: 'Not Contains', needsValue: true }
]

const ENTITY_TYPES = [
  { key: 'vessel', label: 'Vessel' },
  { key: 'entity', label: 'Entity' },
  { key: 'policy', label: 'Policy' },
  { key: 'fleet', label: 'Fleet' }
]

const SEVERITIES = [
  { key: 'warning', label: 'Warning', color: '#f59e0b' },
  { key: 'error', label: 'Error', color: '#ff4d4d' },
  { key: 'info', label: 'Info', color: '#00aac8' }
]

const EMPTY_RULE_FORM = {
  name: '',
  description: '',
  entityType: 'vessel',
  fieldName: '',
  operator: 'is_null',
  value: '',
  severity: 'warning'
}

/**
 * vessel_assureds row as read here. getVesselAssureds returns only the VesselAssured columns,
 * so the entity fields below are never set (kept because the alert builder reads them).
 */
type AssuredRow = VesselAssured & { entityType?: string; entityName?: string; name?: string }

/** One document/entity/endorsement alert in the Document Alerts tab */
interface DocAlert {
  id: string
  vesselId: string
  /** Entity documents: the entity they belong to */
  entityId?: string
  vessel: string
  document: string
  category: 'vessel' | 'entity' | 'endorsement'
  type: 'missing' | 'expired' | 'soon'
  severity: 'high' | 'critical' | 'medium'
  message: string
  date: string
}

type VesselSection = 'documents' | 'assureds' | 'surveys' | 'policies'

/** Vessel tab that shows what an alert is about (entity documents live with the assureds) */
const alertSection = (alert: Pick<DocAlert, 'category'>): VesselSection =>
  alert.category === 'entity'
    ? 'assureds'
    : alert.category === 'endorsement'
      ? 'surveys'
      : 'documents'

interface ComplianceCenterProps extends SubTabProps {
  onNavigateToVessel?: (vesselId: string, section?: VesselSection) => void
  onNavigateToEntity?: (entityId: string) => void
  initialTab?: 'documents' | 'policies' | 'sanctions' | 'dataQuality'
  onTabChange?: (tab: 'documents' | 'policies' | 'sanctions' | 'dataQuality') => void
}

export default function ComplianceCenter({
  onNavigateToVessel,
  onNavigateToEntity,
  initialTab,
  onTabChange,
  subTab,
  subTabNonce
}: ComplianceCenterProps): React.JSX.Element {
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [docs, setDocs] = useState<VesselDocument[]>([])
  // vesselId -> policy end date that annual documents follow
  const [policyExpiries, setPolicyExpiries] = useState<Record<string, string>>({})
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [entityDocTypes, setEntityDocTypes] = useState<EntityDocumentType[]>([])
  const [entityDocs, setEntityDocs] = useState<EntityDocument[]>([])
  const [allAssureds, setAllAssureds] = useState<AssuredRow[]>([])
  const [filter, setFilter] = useState<'all' | 'missing' | 'expired' | 'soon'>('all')
  const [docViewMode, setDocViewMode] = useState<'vessel' | 'document' | 'flat' | 'customer'>(
    'vessel'
  )
  const [expandedVessels, setExpandedVessels] = useState<Set<string>>(new Set())
  const toggleGroup = (key: string): void =>
    setExpandedVessels((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  // Flat view: sort and pages
  const [flatSort, setFlatSort] = useState<{
    key: 'vessel' | 'document' | 'type' | 'date' | 'severity'
    dir: 'asc' | 'desc'
  }>({ key: 'severity', dir: 'desc' })
  const [flatPage, setFlatPage] = useState(0)
  const [docSearch, setDocSearch] = useState('')
  // First load of the documents tab still running (never show "fully compliant" before it ends)
  const [docsLoading, setDocsLoading] = useState(true)
  const [endorsementsDue, setEndorsementsDue] = useState<EndorsementDueRow[]>([])
  const [activeTab, setActiveTabRaw] = useState<
    'documents' | 'policies' | 'sanctions' | 'dataQuality'
  >(initialTab || 'documents')
  const setActiveTab = (tab: 'documents' | 'policies' | 'sanctions' | 'dataQuality'): void => {
    setActiveTabRaw(tab)
    onTabChange?.(tab)
  }
  const { showSuccess, showError } = useToast()
  const { theme } = useTheme()
  const { hasPermission } = useAuth()
  const isLight = theme === 'light' || theme === 'aurora'
  const canReview = hasPermission('compliance:review')

  // Sanctions compliance state
  const [pendingResults, setPendingResults] = useState<ComplianceCheckResult[]>([])
  const [sanctionsLoading, setSanctionsLoading] = useState(true)
  const [checkLogs, setCheckLogs] = useState<ComplianceCheckLog[]>([])
  const [policyAlerts, setPolicyAlerts] = useState<PolicyExpiryRow[]>([])
  const [policyExpiringSoon, setPolicyExpiringSoon] = useState<PolicyExpiryRow[]>([])
  const [policyFilter, setPolicyFilter] = useState<'expired' | 'expiring'>('expired')
  const [selectedSanctions, setSelectedSanctions] = useState<Set<string>>(new Set())
  // The pending hit open in the review panel (undefined = the first one, null = panel closed)
  const [selectedResultId, setSelectedResultId] = useState<string | null | undefined>(undefined)
  const [reviewEntities, setReviewEntities] = useState<Record<string, Entity>>({})
  const [decidingOne, setDecidingOne] = useState(false)
  const [resultsPage, setResultsPage] = useState(1)
  const [resultsLimit, setResultsLimit] = useState(10)
  const [resultsTotal, setResultsTotal] = useState(0)
  const [resultsTotalPages, setResultsTotalPages] = useState(0)

  // Data Quality state
  const [validationRules, setValidationRules] = useState<
    {
      id: string
      name: string
      description: string
      category: string
      count: number
      items: { id: string; name: string; type: string }[]
    }[]
  >([])
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
  const [validationLoading, setValidationLoading] = useState(false)
  const [showRuleSettings, setShowRuleSettings] = useState(false)
  const [ruleToggles, setRuleToggles] = useState<Record<string, boolean>>({})

  // Custom validation rules state
  const [customRules, setCustomRules] = useState<CustomValidationRule[]>([])
  const [customRuleViolations, setCustomRuleViolations] = useState<
    {
      ruleId: string
      ruleName: string
      severity: string
      count: number
      items: { id: string; name: string }[]
    }[]
  >([])
  const [showAddRule, setShowAddRule] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [ruleForm, setRuleForm] = useState(EMPTY_RULE_FORM)

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const [vData, dData, tData, edtData, edData, assuredData, endorsements, peData] =
        await Promise.all([
          window.api.getVessels(),
          window.api.getVesselDocuments(),
          window.api.getDocumentTypes(),
          window.api.getEntityDocumentTypes(),
          window.api.getEntityDocuments(),
          window.api.getVesselAssureds(),
          window.api.surveyWarrantyGetEndorsementsDue().catch(() => []),
          window.api.getVesselPolicyExpiries()
        ])
      setPolicyExpiries(peData && typeof peData === 'object' && !('error' in peData) ? peData : {})
      setVessels(Array.isArray(vData) ? vData.filter((v) => v.isActive !== false) : [])
      setDocs(Array.isArray(dData) ? dData : [])
      setDocTypes(Array.isArray(tData) ? tData : [])
      setEntityDocTypes(Array.isArray(edtData) ? edtData.filter((t) => t.isActive) : [])
      setEntityDocs(Array.isArray(edData) ? edData : [])
      setAllAssureds(Array.isArray(assuredData) ? assuredData : [])
      setEndorsementsDue(Array.isArray(endorsements) ? endorsements : [])
    } catch (error) {
      console.error('ComplianceCenter: Failed to load data:', error)
      setVessels([])
      setDocs([])
      setDocTypes([])
    } finally {
      setDocsLoading(false)
    }
  }, [])

  const loadSanctionsData = useCallback(async (): Promise<void> => {
    try {
      const [result, logs] = await Promise.all([
        window.api.complianceGetCheckResultsPaginated({
          page: resultsPage,
          limit: resultsLimit,
          status: 'pending_review'
        }),
        window.api.complianceGetCheckLogs()
      ])
      setPendingResults(Array.isArray(result?.data) ? result.data : [])
      setResultsTotal(result?.total ?? 0)
      setResultsTotalPages(result?.totalPages ?? 0)
      setCheckLogs(Array.isArray(logs) ? logs : [])
    } catch (error) {
      console.error('ComplianceCenter: Failed to load sanctions data:', error)
      // Set empty arrays to prevent blank screen
      setPendingResults([])
      setResultsTotal(0)
      setResultsTotalPages(0)
      setCheckLogs([])
    } finally {
      setSanctionsLoading(false)
    }
  }, [resultsPage, resultsLimit])

  const loadCustomRules = useCallback(async (): Promise<void> => {
    try {
      const rules = await window.api.validationRulesGetAll()
      if (Array.isArray(rules)) setCustomRules(rules)
    } catch {
      setCustomRules([])
    }
  }, [])

  const loadPolicyAlerts = useCallback(async (): Promise<void> => {
    try {
      const [expired, expiring] = await Promise.all([
        window.api.getExpiredActivePolicies(),
        window.api.getExpiringSoonPolicies(90)
      ])
      setPolicyAlerts(Array.isArray(expired) ? expired : [])
      setPolicyExpiringSoon(Array.isArray(expiring) ? expiring : [])
    } catch {
      setPolicyAlerts([])
      setPolicyExpiringSoon([])
    }
  }, [])

  const loadDataValidation = useCallback(async (): Promise<void> => {
    setValidationLoading(true)
    try {
      const [result, customResults] = await Promise.all([
        window.api.complianceGetDataValidation(),
        window.api.validationRulesRun()
      ])
      if (result && Array.isArray(result.rules)) {
        setValidationRules(result.rules)
      } else {
        setValidationRules([])
      }
      if (Array.isArray(customResults)) {
        setCustomRuleViolations(customResults)
      }
    } catch {
      setValidationRules([])
      setCustomRuleViolations([])
    } finally {
      setValidationLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial loads: every loader sets state only after its IPC call resolves
    const run = async (): Promise<void> => {
      await Promise.all([loadData(), loadPolicyAlerts(), loadCustomRules()])
    }
    void run()
    window.api.getSetting('data_validation_rules').then((raw) => {
      if (raw) {
        try {
          setRuleToggles(JSON.parse(raw))
        } catch {
          /* ignore */
        }
      }
    })
  }, [loadData, loadPolicyAlerts, loadCustomRules])

  useEffect(() => {
    const run = async (): Promise<void> => {
      await loadSanctionsData()
    }
    void run()
  }, [loadSanctionsData])

  useRequestedSubTab(
    subTab,
    subTabNonce,
    ['documents', 'policies', 'sanctions', 'dataQuality'] as const,
    (k) => {
      setActiveTab(k)
      if (k === 'dataQuality') loadDataValidation()
    }
  )

  const toggleRule = (ruleId: string): void => {
    setExpandedRules((prev) => {
      const next = new Set(prev)
      if (next.has(ruleId)) next.delete(ruleId)
      else next.add(ruleId)
      return next
    })
  }

  const toggleRuleEnabled = (ruleId: string): void => {
    const next = { ...ruleToggles, [ruleId]: !(ruleToggles[ruleId] !== false) }
    setRuleToggles(next)
    window.api.setSetting('data_validation_rules', JSON.stringify(next)).then(ok)
  }

  const handleSaveRule = async (): Promise<void> => {
    if (!ruleForm.name.trim()) {
      showError('Rule name is required')
      return
    }
    if (!ruleForm.fieldName) {
      showError('Field is required')
      return
    }
    const operatorDef = OPERATORS.find((o) => o.key === ruleForm.operator)
    if (operatorDef?.needsValue && !ruleForm.value.trim()) {
      showError('Value is required for this operator')
      return
    }

    try {
      if (editingRuleId) {
        ok(
          await window.api.validationRulesUpdate(editingRuleId, {
            name: ruleForm.name,
            description: ruleForm.description || null,
            entityType: ruleForm.entityType,
            fieldName: ruleForm.fieldName,
            operator: ruleForm.operator,
            value: operatorDef?.needsValue ? ruleForm.value : null,
            severity: ruleForm.severity
          })
        )
        showSuccess('Rule updated')
      } else {
        await window.api.validationRulesAdd({
          name: ruleForm.name,
          description: ruleForm.description || null,
          entityType: ruleForm.entityType,
          fieldName: ruleForm.fieldName,
          operator: ruleForm.operator,
          value: operatorDef?.needsValue ? ruleForm.value : null,
          severity: ruleForm.severity,
          isEnabled: true,
          order: customRules.length
        })
        showSuccess('Rule created')
      }
      setShowAddRule(false)
      setEditingRuleId(null)
      setRuleForm(EMPTY_RULE_FORM)
      loadCustomRules()
      loadDataValidation()
    } catch (e) {
      showError((e as { message?: string } | null)?.message || 'Failed to save rule')
    }
  }

  const handleDeleteRule = async (id: string): Promise<void> => {
    try {
      await window.api.validationRulesDelete(id)
      showSuccess('Rule deleted')
      loadCustomRules()
      loadDataValidation()
    } catch (e) {
      showError((e as { message?: string } | null)?.message || 'Failed to delete rule')
    }
  }

  const handleToggleCustomRule = async (rule: CustomValidationRule): Promise<void> => {
    try {
      await window.api.validationRulesUpdate(rule.id, { isEnabled: !rule.isEnabled })
      loadCustomRules()
      loadDataValidation()
    } catch (e) {
      showError((e as { message?: string } | null)?.message || 'Failed to toggle rule')
    }
  }

  const handleEditRule = (rule: CustomValidationRule): void => {
    setEditingRuleId(rule.id)
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      entityType: rule.entityType,
      fieldName: rule.fieldName,
      operator: rule.operator,
      value: rule.value || '',
      severity: rule.severity
    })
    setShowAddRule(true)
  }

  const handleDecideMatch = async (
    resultId: string,
    decision: 'sanctioned' | 'cleared'
  ): Promise<void> => {
    if (decidingOne) return
    // The reason is kept with the decision (audit); cancelling the prompt cancels the decision
    const note = await promptDialog(
      decision === 'cleared'
        ? 'Why is this not a match? (optional, kept with the decision)'
        : 'Reason for sanctioning (optional, kept with the decision)'
    )
    if (note === null) return
    // The next hit opens after the decision (the one below, or the last)
    const idx = pendingResults.findIndex((r) => r.id === resultId)
    const next = pendingResults[idx + 1] || pendingResults[idx - 1]
    setDecidingOne(true)
    try {
      await window.api.complianceDecideResult(resultId, decision, note)
      showSuccess(`Match marked as ${decision}`)
      if (selectedResultId === resultId) setSelectedResultId(next ? next.id : undefined)
      loadSanctionsData()
    } catch (error) {
      console.error('Failed to decide match:', error)
      showError((error as { message?: string } | null)?.message || 'Failed to update the match')
    } finally {
      setDecidingOne(false)
    }
  }

  // Selected hit: the chosen one while it is still pending, else the first on the page
  const selectedResult =
    selectedResultId === null
      ? undefined
      : (pendingResults.find((r) => r.id === selectedResultId) ?? pendingResults[0])

  // Entities for the review panel's "our record" (loaded once, when the tab is first opened)
  const reviewEntitiesLoaded = useRef(false)
  useEffect(() => {
    if (activeTab !== 'sanctions' || reviewEntitiesLoaded.current) return
    reviewEntitiesLoaded.current = true
    window.api
      .getEntities()
      .then((list) => {
        if (Array.isArray(list)) setReviewEntities(Object.fromEntries(list.map((e) => [e.id, e])))
      })
      .catch(() => {})
  }, [activeTab])

  // Keyboard review: J / K move, C clears, S sanctions (not while typing or in a dialog)
  useEffect(() => {
    if (activeTab !== 'sanctions') return
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target instanceof Element ? e.target : null
      if (
        t &&
        (t.closest('input, textarea, select, [contenteditable=true]') || t.closest('[role=dialog]'))
      )
        return
      if (document.querySelector('[role=dialog]')) return
      const key = e.key.toLowerCase()
      if (!['j', 'k', 'c', 's'].includes(key) || pendingResults.length === 0) return
      const idx = selectedResult ? pendingResults.findIndex((r) => r.id === selectedResult.id) : -1
      if (key === 'j' || key === 'k') {
        const n = key === 'j' ? Math.min(pendingResults.length - 1, idx + 1) : Math.max(0, idx - 1)
        setSelectedResultId(pendingResults[n].id)
      } else if (selectedResult && canReview) {
        void handleDecideMatch(selectedResult.id, key === 'c' ? 'cleared' : 'sanctioned')
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Bulk Clear / Sanction: confirm once, one call per result, ONE reload + summary toast.
  // Guarded so a second click cannot start a parallel run over the same selection.
  const bulkDecidingRef = useRef(false)
  const [bulkDeciding, setBulkDeciding] = useState(false)
  const handleBulkDecide = async (decision: 'sanctioned' | 'cleared'): Promise<void> => {
    if (bulkDecidingRef.current || selectedSanctions.size === 0) return
    const n = selectedSanctions.size
    const label = decision === 'cleared' ? 'Clear' : 'Sanction'
    const confirmed = await confirmDialog(
      `${label} ${n} selected match${n === 1 ? '' : 'es'}? This updates each subject's sanctions status.`
    )
    if (!confirmed) return
    const note = await promptDialog('Reason (optional, kept with each decision)')
    if (note === null) return
    bulkDecidingRef.current = true
    setBulkDeciding(true)
    let failed = 0
    try {
      for (const id of selectedSanctions) {
        try {
          ok(await window.api.complianceDecideResult(id, decision, note))
        } catch {
          failed++
        }
      }
      setSelectedSanctions(new Set())
      if (failed === 0) showSuccess(`${n} match${n === 1 ? '' : 'es'} marked as ${decision}`)
      else showError(`${n - failed} of ${n} updated — ${failed} failed`)
      loadSanctionsData()
    } finally {
      bulkDecidingRef.current = false
      setBulkDeciding(false)
    }
  }

  // Every document/entity alert across the fleet — recomputed only when its inputs change
  // (it used to rebuild on every render, e.g. each keystroke and every progress tick)
  const allAlerts = useMemo((): DocAlert[] => {
    // Midnight, like the vessel page: a document expiring today is not expired yet
    const today = new Date(new Date().setHours(0, 0, 0, 0))
    const thirtyDaysFromNow = new Date()
    thirtyDaysFromNow.setDate(today.getDate() + 30)

    const alerts: DocAlert[] = []
    const docMap = new Map<string, VesselDocument>()
    for (const d of docs) docMap.set(`${d.vesselId}:${d.documentTypeId}`, d)

    vessels.forEach((v) => {
      // Vessel document alerts
      docTypes.forEach((t) => {
        const doc = docMap.get(`${v.id}:${t.id}`)
        const isRequired = doc ? doc.required : t.required
        const hasFile = !!doc?.filePath

        if (isRequired && !hasFile) {
          alerts.push({
            id: `${v.id}-${t.id}-missing`,
            vesselId: v.id,
            vessel: v.name,
            document: t.name,
            category: 'vessel',
            type: 'missing',
            severity: 'high',
            message: 'Required file missing',
            date: '-'
          })
        }

        // Annual documents follow the vessel's policy end date (same rule as the vessel page)
        const effExpiry = effectiveDocExpiry(
          t.annualRenewal,
          doc?.expiryDate,
          policyExpiries[v.id] || v.policyExpiryDate
        )
        const status = hasFile
          ? getDocStatus({
              hasFile,
              expiryDate: effExpiry,
              required: isRequired,
              annualRenewal: t.annualRenewal,
              receivedDate: doc?.receivedDate,
              soonDays: 30,
              today
            })
          : null
        if (hasFile && effExpiry) {
          if (status === 'expired') {
            alerts.push({
              id: `${v.id}-${t.id}-expired`,
              vesselId: v.id,
              vessel: v.name,
              document: t.name,
              category: 'vessel',
              type: 'expired',
              severity: 'critical',
              message: 'Document expired',
              date: effExpiry
            })
          } else if (status === 'expiring') {
            alerts.push({
              id: `${v.id}-${t.id}-soon`,
              vesselId: v.id,
              vessel: v.name,
              document: t.name,
              category: 'vessel',
              type: 'soon',
              severity: 'medium',
              message: 'Expiring soon',
              date: effExpiry
            })
          }
        }
      })

      // Entity document alerts for this vessel's assureds
      const vesselAssureds = allAssureds.filter((a) => a.vesselId === v.id)
      const seenEntities = new Set<string>()
      vesselAssureds.forEach((a) => {
        if (!a.entityId || seenEntities.has(a.entityId)) return
        seenEntities.add(a.entityId)
        const entityType = a.entityType === 'person' ? 'person' : 'company'
        const applicableTypes = entityDocTypes.filter(
          (t) => t.entityScope === 'both' || t.entityScope === entityType
        )
        applicableTypes.forEach((t) => {
          if (!t.isRequired) return
          const ed = entityDocs.find((d) => d.entityId === a.entityId && d.documentTypeId === t.id)
          const hasFile = !!ed?.filePath

          if (!hasFile) {
            alerts.push({
              id: `${v.id}-entity-${a.entityId}-${t.id}-missing`,
              entityId: a.entityId,
              vesselId: v.id,
              vessel: v.name,
              document: `${t.name} (${a.entityName || a.name})`,
              category: 'entity',
              type: 'missing',
              severity: 'high',
              message: 'Required entity document missing',
              date: '-'
            })
          }

          if (hasFile && ed?.expiryDate) {
            const expiry = new Date(ed.expiryDate)
            if (expiry < today) {
              alerts.push({
                id: `${v.id}-entity-${a.entityId}-${t.id}-expired`,
                entityId: a.entityId,
                vesselId: v.id,
                vessel: v.name,
                document: `${t.name} (${a.entityName || a.name})`,
                category: 'entity',
                type: 'expired',
                severity: 'critical',
                message: 'Entity document expired',
                date: ed.expiryDate
              })
            } else if (expiry < thirtyDaysFromNow) {
              alerts.push({
                id: `${v.id}-entity-${a.entityId}-${t.id}-soon`,
                entityId: a.entityId,
                vesselId: v.id,
                vessel: v.name,
                document: `${t.name} (${a.entityName || a.name})`,
                category: 'entity',
                type: 'soon',
                severity: 'medium',
                message: 'Entity document expiring soon',
                date: ed.expiryDate
              })
            }
          }
        })
      })
    })

    // Endorsement due alerts
    for (const e of endorsementsDue) {
      alerts.push({
        id: `endorsement-${e.surveyId}`,
        vesselId: e.vesselId,
        vessel: e.vesselName || 'Unknown',
        document: `Endorsement (${e.surveyType || 'Survey'} - ${e.surveyDate || ''})`,
        category: 'endorsement',
        type: 'missing',
        severity: 'high',
        message: 'Endorsement not issued',
        date: e.endorsementReminderDate || '-'
      })
    }

    return alerts
  }, [
    vessels,
    docs,
    docTypes,
    entityDocTypes,
    entityDocs,
    allAssureds,
    endorsementsDue,
    policyExpiries
  ])

  // Counts per type are of the whole fleet: they do not change with the filter or search
  const alertCounts = useMemo(() => {
    const c = { missing: 0, expired: 0, soon: 0 }
    for (const a of allAlerts) if (a.type in c) c[a.type as keyof typeof c]++
    return c
  }, [allAlerts])

  // The alerts shown: type filter + search
  const alerts = useMemo(() => {
    let filtered = allAlerts.filter((a) => filter === 'all' || a.type === filter)
    if (docSearch.trim()) {
      const q = docSearch.toLowerCase()
      filtered = filtered.filter(
        (a) => a.vessel.toLowerCase().includes(q) || a.document.toLowerCase().includes(q)
      )
    }
    return filtered
  }, [allAlerts, filter, docSearch])

  // Flat view: sorted, 50 a page
  const FLAT_PAGE_SIZE = 50
  const SEVERITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1 }
  const flatSorted = [...alerts].sort((a, b) => {
    const k = flatSort.key
    const av =
      k === 'severity'
        ? SEVERITY_RANK[a.severity] || 0
        : k === 'date'
          ? a.date === '-'
            ? ''
            : a.date
          : String(a[k] ?? '').toLowerCase()
    const bv =
      k === 'severity'
        ? SEVERITY_RANK[b.severity] || 0
        : k === 'date'
          ? b.date === '-'
            ? ''
            : b.date
          : String(b[k] ?? '').toLowerCase()
    const c = av < bv ? -1 : av > bv ? 1 : 0
    return flatSort.dir === 'asc' ? c : -c
  })
  const flatPages = Math.max(1, Math.ceil(flatSorted.length / FLAT_PAGE_SIZE))
  const flatPageSafe = Math.min(flatPage, flatPages - 1)
  const flatPageAlerts = flatSorted.slice(
    flatPageSafe * FLAT_PAGE_SIZE,
    (flatPageSafe + 1) * FLAT_PAGE_SIZE
  )

  // Group alerts by vessel
  const alertsByVessel = alerts.reduce<
    Record<string, { vesselId: string; vessel: string; alerts: DocAlert[] }>
  >((acc, a) => {
    if (!acc[a.vesselId]) acc[a.vesselId] = { vesselId: a.vesselId, vessel: a.vessel, alerts: [] }
    acc[a.vesselId].alerts.push(a)
    return acc
  }, {})
  const vesselGroups = Object.values(alertsByVessel).sort(
    (a, b) => b.alerts.length - a.alerts.length
  )

  // Group alerts by document type
  const alertsByDocument = alerts.reduce<Record<string, { document: string; alerts: DocAlert[] }>>(
    (acc, a) => {
      const docKey = a.document.replace(/\s*\(.*\)$/, '') // Strip entity name for grouping
      if (!acc[docKey]) acc[docKey] = { document: docKey, alerts: [] }
      acc[docKey].alerts.push(a)
      return acc
    },
    {}
  )
  const documentGroups = Object.values(alertsByDocument).sort(
    (a, b) => b.alerts.length - a.alerts.length
  )

  const handleChangePolicyStatus = async (policyId: string, newStatus: string): Promise<void> => {
    try {
      await window.api.updateVesselDynamicPolicy(policyId, {
        status: newStatus as VesselDynamicPolicy['status']
      })
      showSuccess(`Policy status changed to ${newStatus}`)
      loadPolicyAlerts()
    } catch (e) {
      showError((e as { message?: string }).message || 'Failed to update policy status')
    }
  }

  return (
    <div className="fade-in page">
      <PageHeader
        icon={<ShieldAlert size={26} />}
        title="Compliance Center"
        subtitle="Centralized monitoring for document alerts and sanctions screening."
      />
      <Tabs
        style={{ marginBottom: '24px' }}
        value={activeTab}
        onChange={(k) => {
          setActiveTab(k)
          if (k === 'dataQuality') loadDataValidation()
        }}
        items={[
          {
            key: 'documents',
            icon: <AlertCircle size={16} />,
            label: (
              <>
                Document Alerts{' '}
                {allAlerts.length > 0 && <Badge tone="danger">{allAlerts.length}</Badge>}
              </>
            )
          },
          {
            key: 'policies',
            icon: <FileWarning size={16} />,
            label: (
              <>
                Policy Alerts{' '}
                {policyAlerts.length + policyExpiringSoon.length > 0 && (
                  <Badge tone="warning">{policyAlerts.length + policyExpiringSoon.length}</Badge>
                )}
              </>
            )
          },
          {
            key: 'sanctions',
            icon: <Shield size={16} />,
            label: (
              <>
                Sanctions Screening{' '}
                {resultsTotal > 0 && <Badge tone="warning">{resultsTotal}</Badge>}
              </>
            )
          },
          { key: 'dataQuality', icon: <Database size={16} />, label: 'Data Quality' }
        ]}
      />

      {activeTab === 'documents' && (
        <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents">
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginBottom: '20px',
              alignItems: 'center',
              flexWrap: 'wrap'
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--table-header-bg)',
                padding: '4px',
                borderRadius: '8px',
                width: 'fit-content'
              }}
            >
              <FilterButton
                active={filter === 'all'}
                onClick={() => setFilter('all')}
                label="All"
                count={allAlerts.length}
              />
              <FilterButton
                active={filter === 'missing'}
                onClick={() => setFilter('missing')}
                label="Missing"
                color="var(--danger)"
                count={alertCounts.missing}
              />
              <FilterButton
                active={filter === 'expired'}
                onClick={() => setFilter('expired')}
                label="Expired"
                color="var(--danger)"
                count={alertCounts.expired}
              />
              <FilterButton
                active={filter === 'soon'}
                onClick={() => setFilter('soon')}
                label="Expiring Soon"
                color="var(--warning)"
                count={alertCounts.soon}
              />
            </div>
            <div
              style={{
                display: 'flex',
                gap: '4px',
                background: 'var(--table-header-bg)',
                padding: '4px',
                borderRadius: '8px'
              }}
            >
              {(['vessel', 'document', 'flat', 'customer'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDocViewMode(mode)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: docViewMode === mode ? 'var(--bg-card)' : 'transparent',
                    color: docViewMode === mode ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontWeight: docViewMode === mode ? 600 : 400,
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {mode === 'vessel' && (
                    <>
                      <Layers size={13} /> Vessel
                    </>
                  )}
                  {mode === 'document' && (
                    <>
                      <FileText size={13} /> Document
                    </>
                  )}
                  {mode === 'flat' && (
                    <>
                      <List size={13} /> Flat
                    </>
                  )}
                  {mode === 'customer' && (
                    <>
                      <Briefcase size={13} /> Customer
                    </>
                  )}
                </button>
              ))}
            </div>
            {(docViewMode === 'vessel' || docViewMode === 'document') && alerts.length > 0 && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  const keys =
                    docViewMode === 'vessel'
                      ? vesselGroups.map((g) => g.vesselId)
                      : documentGroups.map((g) => g.document)
                  const allOpen = keys.every((k) => expandedVessels.has(k))
                  setExpandedVessels(allOpen ? new Set() : new Set(keys))
                }}
              >
                {(docViewMode === 'vessel'
                  ? vesselGroups.map((g) => g.vesselId)
                  : documentGroups.map((g) => g.document)
                ).every((k) => expandedVessels.has(k))
                  ? 'Collapse all'
                  : 'Expand all'}
              </button>
            )}
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)'
                }}
              />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search vessels or documents..."
                style={{ paddingLeft: '30px', width: '240px' }}
              />
            </div>
          </div>

          {docsLoading ? (
            <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
              <Spinner size={20} label="Checking the fleet's documents..." />
            </div>
          ) : allAlerts.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<CheckCircle size={40} color="var(--success)" />}
                title="Fleet is fully compliant"
                text="No missing, expired or expiring documents."
              />
            </div>
          ) : alerts.length === 0 ? (
            <div className="glass-card">
              <EmptyState
                icon={<Search size={40} />}
                title="No alerts match your filter"
                text={`${allAlerts.length} alert${allAlerts.length === 1 ? '' : 's'} in total.`}
                action={
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setFilter('all')
                      setDocSearch('')
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            </div>
          ) : docViewMode === 'customer' ? (
            /* Grouped by customer / broker (vessels' active policies) */
            <AlertsByCustomer
              alerts={alerts}
              onOpenAlert={(alert) => onNavigateToVessel?.(alert.vesselId, alertSection(alert))}
            />
          ) : docViewMode === 'vessel' ? (
            /* Grouped by vessel view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {vesselGroups.map((group) => {
                const isExpanded = expandedVessels.has(group.vesselId)
                return (
                  <div
                    key={group.vesselId}
                    className="glass-card"
                    style={{ padding: '0', overflow: 'hidden' }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: isExpanded ? '1px solid var(--table-border)' : 'none',
                        background: 'var(--table-header-bg)',
                        cursor: 'pointer'
                      }}
                      onClick={() => toggleGroup(group.vesselId)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleGroup(group.vesselId)
                        }
                      }}
                    >
                      <ChevronDownIcon
                        size={14}
                        style={{
                          transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                          transition: 'transform 0.15s',
                          flexShrink: 0,
                          color: 'var(--text-secondary)'
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{group.vessel}</span>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: 'rgba(255,77,77,0.15)',
                          color: 'var(--danger)',
                          marginLeft: 'auto'
                        }}
                      >
                        {group.alerts.length}
                      </span>
                    </div>
                    {isExpanded && (
                      <table className="data-table">
                        <tbody>
                          {group.alerts.map((alert) => {
                            const rowBorder =
                              alert.type === 'expired' || alert.type === 'missing'
                                ? 'var(--danger)'
                                : 'var(--warning)'
                            return (
                              <tr
                                key={alert.id}
                                className="clickable"
                                style={{ borderLeft: `4px solid ${rowBorder}` }}
                                onClick={() =>
                                  onNavigateToVessel?.(alert.vesselId, alertSection(alert))
                                }
                              >
                                <td>
                                  {alert.category === 'entity' && (
                                    <button
                                      type="button"
                                      title="Open this entity in the Directory"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (alert.entityId) onNavigateToEntity?.(alert.entityId)
                                      }}
                                      className="badge badge-violet"
                                      style={{
                                        marginRight: '6px',
                                        border: 'none',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Entity
                                    </button>
                                  )}
                                  {alert.document}
                                </td>
                                <td style={{ width: '120px' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '0.8rem'
                                    }}
                                  >
                                    {alert.type === 'missing' && (
                                      <ShieldAlert size={14} color="var(--danger)" />
                                    )}
                                    {alert.type === 'expired' && (
                                      <AlertCircle size={14} color="var(--danger)" />
                                    )}
                                    {alert.type === 'soon' && (
                                      <Clock size={14} color="var(--warning)" />
                                    )}
                                    <span style={{ textTransform: 'capitalize' }}>
                                      {alert.type === 'soon' ? 'Expiring' : alert.type}
                                    </span>
                                  </div>
                                </td>
                                <td className="muted" style={{ textAlign: 'right' }}>
                                  {alert.date !== '-' && alert.date}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
          ) : docViewMode === 'document' ? (
            /* Grouped by document type view */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {documentGroups.map((group) => {
                const isExpanded = expandedVessels.has(group.document)
                return (
                  <div
                    key={group.document}
                    className="glass-card"
                    style={{ padding: '0', overflow: 'hidden' }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: isExpanded ? '1px solid var(--table-border)' : 'none',
                        background: 'var(--table-header-bg)',
                        cursor: 'pointer'
                      }}
                      onClick={() => toggleGroup(group.document)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggleGroup(group.document)
                        }
                      }}
                    >
                      <ChevronDownIcon
                        size={14}
                        style={{
                          transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                          transition: 'transform 0.15s',
                          flexShrink: 0,
                          color: 'var(--text-secondary)'
                        }}
                      />
                      <FileText
                        size={15}
                        style={{ color: 'var(--accent-primary)', flexShrink: 0 }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{group.document}</span>
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: 'rgba(255,77,77,0.15)',
                          color: 'var(--danger)',
                          marginLeft: 'auto'
                        }}
                      >
                        {group.alerts.length}
                      </span>
                    </div>
                    {isExpanded && (
                      <table className="data-table">
                        <tbody>
                          {group.alerts.map((alert) => {
                            const rowBorder =
                              alert.type === 'expired' || alert.type === 'missing'
                                ? 'var(--danger)'
                                : 'var(--warning)'
                            return (
                              <tr
                                key={alert.id}
                                className="clickable"
                                style={{ borderLeft: `4px solid ${rowBorder}` }}
                                onClick={() =>
                                  onNavigateToVessel?.(alert.vesselId, alertSection(alert))
                                }
                              >
                                <td style={{ fontWeight: 600 }}>{alert.vessel}</td>
                                <td style={{ width: '120px' }}>
                                  <div
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '0.8rem'
                                    }}
                                  >
                                    {alert.type === 'missing' && (
                                      <ShieldAlert size={14} color="var(--danger)" />
                                    )}
                                    {alert.type === 'expired' && (
                                      <AlertCircle size={14} color="var(--danger)" />
                                    )}
                                    {alert.type === 'soon' && (
                                      <Clock size={14} color="var(--warning)" />
                                    )}
                                    <span style={{ textTransform: 'capitalize' }}>
                                      {alert.type === 'soon' ? 'Expiring' : alert.type}
                                    </span>
                                  </div>
                                </td>
                                <td className="muted" style={{ textAlign: 'right' }}>
                                  {alert.date !== '-' && alert.date}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            /* Flat list view */
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Document compliance alerts</caption>
                <thead>
                  <tr>
                    {(
                      [
                        ['vessel', 'Vessel'],
                        ['document', 'Document'],
                        ['type', 'Type'],
                        ['date', 'Date'],
                        ['severity', 'Severity']
                      ] as const
                    ).map(([key, label]) => (
                      <th
                        key={key}
                        scope="col"
                        className="sortable"
                        aria-sort={
                          flatSort.key === key
                            ? flatSort.dir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        style={{
                          cursor: 'pointer',
                          ...(key === 'severity' ? { textAlign: 'right' as const } : {})
                        }}
                        onClick={() => {
                          setFlatSort((s) =>
                            s.key === key
                              ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
                              : { key, dir: key === 'date' || key === 'severity' ? 'desc' : 'asc' }
                          )
                          setFlatPage(0)
                        }}
                      >
                        {label}
                        {flatSort.key === key && (flatSort.dir === 'asc' ? ' ▲' : ' ▼')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {flatPageAlerts.map((alert) => {
                    const rowBorder =
                      alert.type === 'expired' || alert.type === 'missing'
                        ? 'var(--danger)'
                        : 'var(--warning)'
                    return (
                      <tr
                        key={alert.id}
                        className="clickable"
                        style={{ borderLeft: `4px solid ${rowBorder}` }}
                        onClick={() => onNavigateToVessel?.(alert.vesselId, alertSection(alert))}
                      >
                        <td style={{ fontWeight: 600 }}>{alert.vessel}</td>
                        <td>
                          {alert.category === 'entity' && (
                            <button
                              type="button"
                              title="Open this entity in the Directory"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (alert.entityId) onNavigateToEntity?.(alert.entityId)
                              }}
                              className="badge badge-violet"
                              style={{ marginRight: '6px', border: 'none', cursor: 'pointer' }}
                            >
                              Entity
                            </button>
                          )}
                          {alert.document}
                        </td>
                        <td>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              fontSize: '0.82rem'
                            }}
                          >
                            {alert.type === 'missing' && (
                              <ShieldAlert size={14} color="var(--danger)" />
                            )}
                            {alert.type === 'expired' && (
                              <AlertCircle size={14} color="var(--danger)" />
                            )}
                            {alert.type === 'soon' && <Clock size={14} color="var(--warning)" />}
                            <span style={{ textTransform: 'capitalize' }}>
                              {alert.type === 'soon' ? 'Expiring' : alert.type}
                            </span>
                          </div>
                        </td>
                        <td className="muted">{alert.date !== '-' ? alert.date : ''}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '10px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              background:
                                alert.severity === 'critical'
                                  ? 'rgba(255,77,77,0.15)'
                                  : alert.severity === 'high'
                                    ? 'rgba(255,120,77,0.15)'
                                    : 'rgba(255,204,0,0.12)',
                              color:
                                alert.severity === 'critical'
                                  ? 'var(--danger)'
                                  : alert.severity === 'high'
                                    ? '#ff784d'
                                    : 'var(--warning)'
                            }}
                          >
                            {alert.severity}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {flatPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: '1px solid var(--table-border)',
                    fontSize: '0.85rem',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <span>
                    {flatPageSafe * FLAT_PAGE_SIZE + 1}-
                    {Math.min((flatPageSafe + 1) * FLAT_PAGE_SIZE, flatSorted.length)} of{' '}
                    {flatSorted.length}
                  </span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={flatPageSafe === 0}
                      onClick={() => setFlatPage(flatPageSafe - 1)}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span>
                      {flatPageSafe + 1} / {flatPages}
                    </span>
                    <button
                      className="btn-secondary btn-sm"
                      disabled={flatPageSafe >= flatPages - 1}
                      onClick={() => setFlatPage(flatPageSafe + 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'policies' &&
        (() => {
          const activePolicies = policyFilter === 'expired' ? policyAlerts : policyExpiringSoon
          return (
            <div role="tabpanel" id="panel-policies" aria-labelledby="tab-policies">
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  background: 'var(--table-header-bg)',
                  padding: '4px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  width: 'fit-content'
                }}
              >
                <FilterButton
                  active={policyFilter === 'expired'}
                  onClick={() => setPolicyFilter('expired')}
                  label="Expired"
                  color="var(--danger)"
                  count={policyAlerts.length}
                />
                <FilterButton
                  active={policyFilter === 'expiring'}
                  onClick={() => setPolicyFilter('expiring')}
                  label="Expiring Soon (90 days)"
                  color="#ffa500"
                  count={policyExpiringSoon.length}
                />
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <caption className="sr-only">Policy alerts</caption>
                  <thead>
                    <tr>
                      <th scope="col">Vessel</th>
                      <th scope="col">Policy Type</th>
                      <th scope="col">Policy Number</th>
                      <th scope="col">End Date</th>
                      <th scope="col" style={{ textAlign: 'right' }}>
                        {policyFilter === 'expired' ? 'Days Overdue' : 'Days Left'}
                      </th>
                      <th scope="col" style={{ textAlign: 'center' }}>
                        Status
                      </th>
                      <th scope="col" style={{ textAlign: 'center' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activePolicies.map((alert, idx) => {
                      const endDate = alert.endDate ? new Date(alert.endDate) : null
                      const today = new Date()
                      const diffDays = endDate
                        ? Math.floor((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                        : 0
                      const isExpired = diffDays < 0
                      const absDays = Math.abs(diffDays)
                      return (
                        <tr
                          key={alert.id || idx}
                          style={{
                            borderLeft: `4px solid ${isExpired ? 'var(--danger)' : absDays <= 30 ? '#ffa500' : 'var(--warning)'}`
                          }}
                        >
                          <td style={{ fontWeight: 600 }}>{alert.vesselName}</td>
                          <td>{alert.policyTypeName}</td>
                          <td className="muted">{alert.policyNumber || '-'}</td>
                          <td style={{ color: isExpired ? 'var(--danger)' : 'var(--warning)' }}>
                            {formatDate(alert.endDate) || alert.endDate || '-'}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span
                              style={{
                                padding: '3px 8px',
                                borderRadius: '10px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: isExpired
                                  ? 'rgba(255,77,77,0.15)'
                                  : absDays <= 30
                                    ? 'rgba(255,165,0,0.15)'
                                    : 'rgba(255,204,0,0.1)',
                                color: isExpired
                                  ? 'var(--danger)'
                                  : absDays <= 30
                                    ? '#ffa500'
                                    : 'var(--warning)'
                              }}
                            >
                              {isExpired
                                ? `${absDays}d overdue`
                                : absDays === 0
                                  ? 'Today'
                                  : `${absDays}d left`}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <select
                              value={alert.status || 'active'}
                              onChange={(e) => handleChangePolicyStatus(alert.id, e.target.value)}
                              style={{ padding: '4px 8px', fontSize: '0.78rem', cursor: 'pointer' }}
                            >
                              <option value="active">Active</option>
                              <option value="expired">Expired</option>
                              <option value="cancelled">Cancelled</option>
                              <option value="inactive">Inactive</option>
                            </select>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => onNavigateToVessel?.(alert.vesselId, 'policies')}
                              className="btn-secondary btn-sm"
                            >
                              <Eye size={13} /> View
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {activePolicies.length === 0 && (
                      <tr>
                        <td colSpan={7} style={{ padding: '64px', textAlign: 'center' }}>
                          <CheckCircle
                            size={48}
                            color="var(--success)"
                            style={{ marginBottom: '16px', opacity: 0.5 }}
                          />
                          <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>
                            No policy alerts
                          </div>
                          <p style={{ color: 'var(--text-secondary)' }}>
                            {policyFilter === 'expired'
                              ? 'No expired active policies.'
                              : 'No policies expiring within 90 days.'}
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

      {activeTab === 'dataQuality' && (
        <div role="tabpanel" id="panel-dataQuality" aria-labelledby="tab-dataQuality">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Database size={20} color="var(--accent-primary)" />
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Data Quality</h3>
              {(validationRules.length > 0 || customRuleViolations.length > 0) &&
                (() => {
                  const builtInIssues = validationRules
                    .filter((r) => ruleToggles[r.id] !== false)
                    .reduce((sum, r) => sum + r.count, 0)
                  const customIssues = customRuleViolations.reduce((sum, r) => sum + r.count, 0)
                  const totalIssues = builtInIssues + customIssues
                  return (
                    <span
                      style={{
                        padding: '2px 10px',
                        borderRadius: '10px',
                        fontSize: '0.8rem',
                        fontWeight: '700',
                        background:
                          totalIssues > 0 ? 'rgba(255, 77, 77, 0.15)' : 'rgba(0, 255, 136, 0.15)',
                        color: totalIssues > 0 ? 'var(--danger)' : 'var(--success)'
                      }}
                    >
                      {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
                    </span>
                  )
                })()}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setShowRuleSettings(!showRuleSettings)}
                title="Validation Rules Settings"
                style={{
                  background: showRuleSettings
                    ? 'rgba(var(--accent-primary-rgb), 0.1)'
                    : 'transparent',
                  border: showRuleSettings
                    ? '1px solid var(--accent-primary)'
                    : '1px solid var(--glass-border-color)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  padding: '7px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: showRuleSettings ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  fontSize: '0.82rem'
                }}
                className="hover-effect"
              >
                <Settings size={14} />
              </button>
              <button
                onClick={loadDataValidation}
                disabled={validationLoading}
                className="btn-secondary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem',
                  padding: '7px 14px'
                }}
              >
                <RefreshCw
                  size={14}
                  style={{ animation: validationLoading ? 'spin 1s linear infinite' : 'none' }}
                />
                Refresh
              </button>
            </div>
          </div>

          {showRuleSettings && (
            <div
              style={{
                marginBottom: '16px',
                padding: '16px 20px',
                borderRadius: '10px',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border-color)'
              }}
            >
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}
              >
                <Settings size={16} color="var(--accent-primary)" />
                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>
                  Validation Rules Settings
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {STATIC_RULES.map((rule) => {
                  const enabled = ruleToggles[rule.id] !== false
                  return (
                    <div
                      key={rule.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--glass-border-color)',
                        opacity: enabled ? 1 : 0.5
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: '600', fontSize: '0.84rem' }}>{rule.name}</div>
                        <div
                          style={{
                            fontSize: '0.73rem',
                            color: 'var(--text-secondary)',
                            marginTop: '1px'
                          }}
                        >
                          {rule.description}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleRuleEnabled(rule.id)}
                        style={{
                          width: '40px',
                          height: '22px',
                          borderRadius: '11px',
                          border: 'none',
                          background: enabled
                            ? 'var(--accent-primary)'
                            : isLight
                              ? '#ccc'
                              : 'rgba(255,255,255,0.15)',
                          cursor: 'pointer',
                          position: 'relative',
                          flexShrink: 0,
                          transition: 'background 0.2s'
                        }}
                        title={enabled ? 'Disable rule' : 'Enable rule'}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '2px',
                            left: enabled ? '20px' : '2px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            background: '#fff',
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                          }}
                        />
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'var(--glass-border-color)', margin: '16px 0' }} />

              {/* Custom Rules Section */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px'
                }}
              >
                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>Custom Rules</span>
                {hasPermission('admin:settings') && (
                  <button
                    onClick={() => {
                      setEditingRuleId(null)
                      setRuleForm(EMPTY_RULE_FORM)
                      setShowAddRule(!showAddRule)
                    }}
                    className="hover-effect"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      background: 'rgba(var(--accent-primary-rgb), 0.1)',
                      border: '1px solid rgba(var(--accent-primary-rgb), 0.3)',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={13} />
                    Add Rule
                  </button>
                )}
              </div>

              {/* Add/Edit Rule Form */}
              {showAddRule && (
                <div
                  style={{
                    padding: '14px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--accent-primary)'
                  }}
                >
                  <div className="form-grid cols-2" style={{ marginBottom: '14px' }}>
                    <Field label="Name">
                      <input
                        value={ruleForm.name}
                        onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder="Rule name"
                      />
                    </Field>
                    <Field label="Entity type">
                      <select
                        value={ruleForm.entityType}
                        onChange={(e) =>
                          setRuleForm((f) => ({
                            ...f,
                            entityType: e.target.value,
                            fieldName: RULE_FIELDS[e.target.value]?.[0]?.key || ''
                          }))
                        }
                      >
                        {ENTITY_TYPES.map((t) => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <div className="form-grid cols-3" style={{ marginBottom: '14px' }}>
                    <Field label="Field">
                      <select
                        value={ruleForm.fieldName}
                        onChange={(e) => setRuleForm((f) => ({ ...f, fieldName: e.target.value }))}
                      >
                        <option value="">Select field...</option>
                        {(RULE_FIELDS[ruleForm.entityType] || []).map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Operator">
                      <select
                        value={ruleForm.operator}
                        onChange={(e) => setRuleForm((f) => ({ ...f, operator: e.target.value }))}
                      >
                        {OPERATORS.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Value">
                      <input
                        value={ruleForm.value}
                        onChange={(e) => setRuleForm((f) => ({ ...f, value: e.target.value }))}
                        placeholder={
                          OPERATORS.find((o) => o.key === ruleForm.operator)?.needsValue
                            ? 'Value...'
                            : '(not needed)'
                        }
                        disabled={!OPERATORS.find((o) => o.key === ruleForm.operator)?.needsValue}
                        style={{
                          opacity: OPERATORS.find((o) => o.key === ruleForm.operator)?.needsValue
                            ? 1
                            : 0.4
                        }}
                      />
                    </Field>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Field label="Severity">
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {SEVERITIES.map((s) => (
                          <button
                            key={s.key}
                            onClick={() => setRuleForm((f) => ({ ...f, severity: s.key }))}
                            style={{
                              padding: '4px 12px',
                              borderRadius: '6px',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              background:
                                ruleForm.severity === s.key ? s.color + '22' : 'transparent',
                              border:
                                ruleForm.severity === s.key
                                  ? `2px solid ${s.color}`
                                  : '1px solid var(--glass-border-color)',
                              color:
                                ruleForm.severity === s.key ? s.color : 'var(--text-secondary)',
                              cursor: 'pointer',
                              textTransform: 'capitalize'
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <div
                      style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        gap: '8px',
                        alignSelf: 'flex-end'
                      }}
                    >
                      <button
                        onClick={() => {
                          setShowAddRule(false)
                          setEditingRuleId(null)
                          setRuleForm(EMPTY_RULE_FORM)
                        }}
                        className="btn-secondary btn-sm"
                      >
                        Cancel
                      </button>
                      <button onClick={handleSaveRule} className="btn-primary btn-sm">
                        {editingRuleId ? 'Update' : 'Save'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Rules List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {customRules.length === 0 && !showAddRule && (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '0.82rem'
                    }}
                  >
                    No custom validation rules configured.
                  </div>
                )}
                {customRules.map((rule) => {
                  const sevDef = SEVERITIES.find((s) => s.key === rule.severity) || SEVERITIES[0]
                  const fieldDef = RULE_FIELDS[rule.entityType]?.find(
                    (f) => f.key === rule.fieldName
                  )
                  const opDef = OPERATORS.find((o) => o.key === rule.operator)
                  return (
                    <div
                      key={rule.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--glass-border-color)',
                        opacity: rule.isEnabled ? 1 : 0.5
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: '600', fontSize: '0.84rem' }}>
                            {rule.name}
                          </span>
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '0.65rem',
                              fontWeight: '700',
                              background: sevDef.color + '22',
                              color: sevDef.color,
                              textTransform: 'uppercase'
                            }}
                          >
                            {rule.severity}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '0.73rem',
                            color: 'var(--text-secondary)',
                            marginTop: '1px'
                          }}
                        >
                          {rule.entityType} &rarr; {fieldDef?.label || rule.fieldName}{' '}
                          {opDef?.label.toLowerCase() || rule.operator}
                          {opDef?.needsValue ? ` "${rule.value}"` : ''}
                        </div>
                      </div>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                      >
                        {hasPermission('admin:settings') && (
                          <>
                            <button
                              onClick={() => handleEditRule(rule)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--text-secondary)',
                                padding: '4px',
                                display: 'flex'
                              }}
                              title="Edit rule"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteRule(rule.id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--danger)',
                                padding: '4px',
                                display: 'flex'
                              }}
                              title="Delete rule"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleToggleCustomRule(rule)}
                          style={{
                            width: '40px',
                            height: '22px',
                            borderRadius: '11px',
                            border: 'none',
                            background: rule.isEnabled
                              ? 'var(--accent-primary)'
                              : isLight
                                ? '#ccc'
                                : 'rgba(255,255,255,0.15)',
                            cursor: 'pointer',
                            position: 'relative',
                            flexShrink: 0,
                            transition: 'background 0.2s'
                          }}
                          title={rule.isEnabled ? 'Disable rule' : 'Enable rule'}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: '2px',
                              left: rule.isEnabled ? '20px' : '2px',
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              background: '#fff',
                              transition: 'left 0.2s',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {validationLoading && validationRules.length === 0 ? (
            <div className="glass-card" style={{ padding: '64px', textAlign: 'center' }}>
              <RefreshCw
                size={32}
                style={{
                  animation: 'spin 1s linear infinite',
                  opacity: 0.3,
                  display: 'block',
                  margin: '0 auto 14px'
                }}
              />
              <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                Running validation checks...
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <caption className="sr-only">Data quality validation rules</caption>
                <thead>
                  <tr>
                    <th scope="col" style={{ width: '32px' }}></th>
                    <th scope="col">Rule</th>
                    <th scope="col">Category</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Violations
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {validationRules
                    .filter((r) => ruleToggles[r.id] !== false)
                    .map((rule) => {
                      const isExpanded = expandedRules.has(rule.id)
                      const hasIssues = rule.count > 0
                      return (
                        <>
                          {/* Fragment wrapper for rule + expanded rows */}
                          <tr
                            key={rule.id}
                            onClick={() => hasIssues && toggleRule(rule.id)}
                            className={hasIssues ? 'clickable' : undefined}
                            style={{
                              borderLeft: `4px solid ${hasIssues ? 'var(--danger)' : 'var(--success)'}`
                            }}
                          >
                            <td style={{ textAlign: 'center' }}>
                              {hasIssues ? (
                                <ChevronDownIcon
                                  size={16}
                                  color="var(--text-secondary)"
                                  style={{
                                    transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                    transition: 'transform 0.15s'
                                  }}
                                />
                              ) : (
                                <CheckCircle size={16} color="var(--success)" />
                              )}
                            </td>
                            <td>
                              <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>
                                {rule.name}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-secondary)',
                                  marginTop: '2px'
                                }}
                              >
                                {rule.description}
                              </div>
                            </td>
                            <td>
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '4px',
                                  fontSize: '0.72rem',
                                  fontWeight: '600',
                                  background: 'rgba(var(--accent-primary-rgb), 0.1)',
                                  color: 'var(--accent-primary)',
                                  textTransform: 'uppercase'
                                }}
                              >
                                {rule.category}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span
                                style={{
                                  padding: '4px 12px',
                                  borderRadius: '20px',
                                  fontSize: '0.82rem',
                                  fontWeight: '800',
                                  background: hasIssues
                                    ? 'rgba(255, 77, 77, 0.15)'
                                    : 'rgba(0, 255, 136, 0.15)',
                                  color: hasIssues ? 'var(--danger)' : 'var(--success)'
                                }}
                              >
                                {rule.count}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && rule.items.length > 0 && (
                            <tr key={`${rule.id}-items`}>
                              <td
                                colSpan={4}
                                style={{
                                  padding: '0 16px 16px 48px',
                                  background: 'var(--table-header-bg)'
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    maxHeight: '240px',
                                    overflowY: 'auto'
                                  }}
                                >
                                  {rule.items.map((item) => (
                                    <div
                                      key={item.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (item.type === 'vessel' && onNavigateToVessel)
                                          onNavigateToVessel(item.id, 'documents')
                                      }}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        cursor:
                                          item.type === 'vessel' && onNavigateToVessel
                                            ? 'pointer'
                                            : 'default',
                                        fontSize: '0.82rem'
                                      }}
                                    >
                                      <span
                                        style={{
                                          width: '6px',
                                          height: '6px',
                                          borderRadius: '50%',
                                          background: 'var(--danger)',
                                          flexShrink: 0
                                        }}
                                      />
                                      <span style={{ fontWeight: '500' }}>{item.name}</span>
                                      <span
                                        style={{
                                          marginLeft: 'auto',
                                          fontSize: '0.68rem',
                                          fontWeight: '600',
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          background: 'var(--bg-card-hover)',
                                          color: 'var(--text-secondary)',
                                          textTransform: 'uppercase'
                                        }}
                                      >
                                        {item.type}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  {/* Custom rule violations */}
                  {customRuleViolations.map((rule) => {
                    const isExpanded = expandedRules.has(rule.ruleId)
                    const hasIssues = rule.count > 0
                    const sevDef = SEVERITIES.find((s) => s.key === rule.severity) || SEVERITIES[0]
                    return (
                      <>
                        {/* Fragment wrapper for custom rule + expanded rows */}
                        <tr
                          key={rule.ruleId}
                          onClick={() => hasIssues && toggleRule(rule.ruleId)}
                          className={hasIssues ? 'clickable' : undefined}
                          style={{
                            borderLeft: `4px solid ${hasIssues ? sevDef.color : 'var(--success)'}`
                          }}
                        >
                          <td style={{ textAlign: 'center' }}>
                            {hasIssues ? (
                              <ChevronDownIcon
                                size={16}
                                color="var(--text-secondary)"
                                style={{
                                  transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                  transition: 'transform 0.15s'
                                }}
                              />
                            ) : (
                              <CheckCircle size={16} color="var(--success)" />
                            )}
                          </td>
                          <td>
                            <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>
                              {rule.ruleName}
                            </div>
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--text-secondary)',
                                marginTop: '2px'
                              }}
                            >
                              Custom rule
                            </div>
                          </td>
                          <td>
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '4px',
                                fontSize: '0.72rem',
                                fontWeight: '600',
                                background: sevDef.color + '1a',
                                color: sevDef.color,
                                textTransform: 'uppercase'
                              }}
                            >
                              {rule.severity}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span
                              style={{
                                padding: '4px 12px',
                                borderRadius: '20px',
                                fontSize: '0.82rem',
                                fontWeight: '800',
                                background: hasIssues
                                  ? sevDef.color + '26'
                                  : 'rgba(0, 255, 136, 0.15)',
                                color: hasIssues ? sevDef.color : 'var(--success)'
                              }}
                            >
                              {rule.count}
                            </span>
                          </td>
                        </tr>
                        {isExpanded && rule.items.length > 0 && (
                          <tr key={`${rule.ruleId}-items`}>
                            <td
                              colSpan={4}
                              style={{
                                padding: '0 16px 16px 48px',
                                background: 'var(--table-header-bg)'
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '2px',
                                  maxHeight: '240px',
                                  overflowY: 'auto'
                                }}
                              >
                                {rule.items.map((item) => (
                                  <div
                                    key={item.id}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px',
                                      padding: '6px 10px',
                                      borderRadius: '6px',
                                      fontSize: '0.82rem'
                                    }}
                                  >
                                    <span
                                      style={{
                                        width: '6px',
                                        height: '6px',
                                        borderRadius: '50%',
                                        background: sevDef.color,
                                        flexShrink: 0
                                      }}
                                    />
                                    <span style={{ fontWeight: '500' }}>{item.name}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                  {validationRules.length === 0 &&
                    customRuleViolations.length === 0 &&
                    !validationLoading && (
                      <tr>
                        <td colSpan={4} style={{ padding: '64px', textAlign: 'center' }}>
                          <Database size={48} style={{ opacity: 0.15, marginBottom: '16px' }} />
                          <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>
                            No validation data
                          </div>
                          <p style={{ color: 'var(--text-secondary)' }}>
                            Click Refresh to run data quality checks.
                          </p>
                        </td>
                      </tr>
                    )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'sanctions' &&
        (() => {
          return (
            <div
              role="tabpanel"
              id="panel-sanctions"
              aria-labelledby="tab-sanctions"
              style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}
            >
              {/* Pending Reviews */}
              <div className="table-wrap">
                <div
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--table-border)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}
                >
                  <ShieldAlert size={20} color="var(--warning)" />
                  <h3 style={{ margin: 0 }}>Pending Review</h3>
                  {resultsTotal > 0 && (
                    <span
                      style={{
                        background: 'rgba(255, 193, 7, 0.2)',
                        color: 'var(--warning)',
                        padding: '2px 10px',
                        borderRadius: '10px',
                        fontSize: '0.8rem'
                      }}
                    >
                      {resultsTotal} pending
                    </span>
                  )}
                  {selectedSanctions.size > 0 && canReview && (
                    <div
                      style={{
                        marginLeft: 'auto',
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                        {selectedSanctions.size} selected
                      </span>
                      <button
                        disabled={bulkDeciding}
                        onClick={() => handleBulkDecide('cleared')}
                        style={{
                          background: 'rgba(0,255,136,0.1)',
                          border: '1px solid rgba(0,255,136,0.3)',
                          color: 'var(--success)',
                          cursor: 'pointer',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <CheckCircle size={13} /> Clear All
                      </button>
                      <button
                        disabled={bulkDeciding}
                        onClick={() => handleBulkDecide('sanctioned')}
                        style={{
                          background: 'rgba(255,77,77,0.1)',
                          border: '1px solid rgba(255,77,77,0.3)',
                          color: 'var(--danger)',
                          cursor: 'pointer',
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <ShieldAlert size={13} /> Sanction All
                      </button>
                    </div>
                  )}
                </div>
                <table className="data-table">
                  <caption className="sr-only">Pending sanctions reviews</caption>
                  <thead>
                    <tr>
                      {canReview && (
                        <th scope="col" style={{ width: '32px' }}>
                          <input
                            type="checkbox"
                            checked={
                              pendingResults.length > 0 &&
                              selectedSanctions.size === pendingResults.length
                            }
                            onChange={(e) => {
                              if (e.target.checked)
                                setSelectedSanctions(new Set(pendingResults.map((r) => r.id)))
                              else setSelectedSanctions(new Set())
                            }}
                          />
                        </th>
                      )}
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col">Match Score</th>
                      <th scope="col">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingResults.map((result) => {
                      const isSel = result.id === selectedResult?.id
                      return (
                        <tr
                          key={result.id}
                          className={`clickable${isSel ? ' selected' : ''}`}
                          onClick={() => setSelectedResultId(result.id)}
                          aria-selected={isSel}
                        >
                          {canReview && (
                            <td style={{ width: '32px' }} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Select ${result.entityName}`}
                                checked={selectedSanctions.has(result.id)}
                                onChange={(e) => {
                                  const next = new Set(selectedSanctions)
                                  if (e.target.checked) next.add(result.id)
                                  else next.delete(result.id)
                                  setSelectedSanctions(next)
                                }}
                              />
                            </td>
                          )}
                          <td style={{ fontWeight: 600 }}>{result.entityName}</td>
                          <td>
                            <Badge tone={result.entityType === 'vessel' ? 'accent' : 'violet'}>
                              {result.entityType === 'vessel' ? 'Vessel' : 'Entity'}
                            </Badge>
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: '600',
                                color:
                                  Number(result.matchScore) >= 90
                                    ? 'var(--danger)'
                                    : Number(result.matchScore) >= 80
                                      ? 'var(--warning)'
                                      : 'var(--text-secondary)'
                              }}
                            >
                              {Number(result.matchScore || 0).toFixed(0)}%
                            </span>
                          </td>
                          <td className="muted">
                            {result.createdAt ? formatDate(result.createdAt) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                    {pendingResults.length === 0 && sanctionsLoading && (
                      <tr>
                        <td
                          colSpan={canReview ? 5 : 4}
                          style={{ padding: '48px', textAlign: 'center' }}
                        >
                          <Spinner size={20} label="Loading reviews..." />
                        </td>
                      </tr>
                    )}
                    {pendingResults.length === 0 && !sanctionsLoading && (
                      <tr>
                        <td
                          colSpan={canReview ? 5 : 4}
                          style={{ padding: '48px', textAlign: 'center' }}
                        >
                          <CheckCircle
                            size={40}
                            color="var(--success)"
                            style={{ marginBottom: '12px', opacity: 0.5 }}
                          />
                          <div style={{ fontWeight: '600' }}>No pending reviews</div>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            All sanctions matches have been reviewed.
                          </p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {resultsTotalPages > 1 && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '16px',
                      borderTop: '1px solid var(--table-border)'
                    }}
                  >
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      Showing {(resultsPage - 1) * resultsLimit + 1} to{' '}
                      {Math.min(resultsPage * resultsLimit, resultsTotal)} of {resultsTotal} results
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        className="btn-secondary"
                        disabled={resultsPage === 1}
                        onClick={() => setResultsPage(1)}
                        style={{ padding: '6px' }}
                        aria-label="First page"
                      >
                        <ChevronsLeft size={16} />
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={resultsPage === 1}
                        onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                        style={{ padding: '6px' }}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span style={{ margin: '0 8px', fontSize: '0.9rem' }}>
                        Page {resultsPage} of {resultsTotalPages}
                      </span>
                      <button
                        className="btn-secondary"
                        disabled={resultsPage === resultsTotalPages}
                        onClick={() => setResultsPage((p) => Math.min(resultsTotalPages, p + 1))}
                        style={{ padding: '6px' }}
                        aria-label="Next page"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <button
                        className="btn-secondary"
                        disabled={resultsPage === resultsTotalPages}
                        onClick={() => setResultsPage(resultsTotalPages)}
                        style={{ padding: '6px' }}
                        aria-label="Last page"
                      >
                        <ChevronsRight size={16} />
                      </button>
                      <select
                        value={resultsLimit}
                        onChange={(e) => setResultsLimit(Number(e.target.value))}
                        style={{
                          marginLeft: '16px',
                          padding: '4px',
                          borderRadius: '4px',
                          fontSize: '0.9rem'
                        }}
                        aria-label="Results per page"
                      >
                        <option value="10">10 / page</option>
                        <option value="25">25 / page</option>
                        <option value="50">50 / page</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                {selectedResult && (
                  <SanctionsReviewDetail
                    result={selectedResult}
                    vessel={
                      selectedResult.entityType === 'vessel'
                        ? vessels.find((v) => v.id === selectedResult.entityId)
                        : undefined
                    }
                    entity={
                      selectedResult.entityType === 'entity'
                        ? reviewEntities[selectedResult.entityId]
                        : undefined
                    }
                    entityVessels={
                      selectedResult.entityType === 'entity'
                        ? allAssureds
                            .filter((a) => a.entityId === selectedResult.entityId)
                            .map((a) => ({
                              vesselName:
                                vessels.find((v) => v.id === a.vesselId)?.name || 'Inactive vessel',
                              role: a.role
                            }))
                        : []
                    }
                    vesselAssureds={
                      selectedResult.entityType === 'vessel'
                        ? allAssureds.filter((a) => a.vesselId === selectedResult.entityId)
                        : []
                    }
                    canReview={canReview}
                    deciding={decidingOne}
                    position={{
                      index: pendingResults.findIndex((r) => r.id === selectedResult.id),
                      total: pendingResults.length
                    }}
                    onDecide={(d) => void handleDecideMatch(selectedResult.id, d)}
                    onOpen={() => {
                      if (selectedResult.entityType === 'vessel')
                        onNavigateToVessel?.(selectedResult.entityId, 'assureds')
                      else onNavigateToEntity?.(selectedResult.entityId)
                    }}
                    onClose={() => setSelectedResultId(null)}
                  />
                )}
                {/* Recent Check History */}
                <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--table-border)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}
                  >
                    <History size={20} color="var(--accent-primary)" />
                    <h3 style={{ margin: 0 }}>Check History</h3>
                  </div>
                  <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                    {checkLogs.map((log) => (
                      <div
                        key={log.id}
                        style={{
                          padding: '14px 20px',
                          borderBottom: '1px solid var(--table-border)'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px'
                          }}
                        >
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {log.runAt ? formatDateTime(log.runAt) : '-'}
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              background:
                                log.status === 'completed'
                                  ? 'rgba(0, 255, 136, 0.1)'
                                  : log.status === 'failed'
                                    ? 'rgba(255, 77, 77, 0.1)'
                                    : 'rgba(var(--accent-primary-rgb), 0.1)',
                              color:
                                log.status === 'completed'
                                  ? 'var(--success)'
                                  : log.status === 'failed'
                                    ? 'var(--danger)'
                                    : 'var(--accent-primary)',
                              textTransform: 'uppercase'
                            }}
                          >
                            {log.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.9rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Checked:</span>{' '}
                          {log.totalChecked} |{' '}
                          <span
                            style={{
                              color:
                                log.matchesFound > 0 ? 'var(--warning)' : 'var(--text-secondary)'
                            }}
                          >
                            Matches: {log.matchesFound}
                          </span>
                        </div>
                        {log.error && (
                          <div
                            style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px' }}
                          >
                            Error: {log.error}
                          </div>
                        )}
                      </div>
                    ))}
                    {checkLogs.length === 0 && (
                      <div
                        style={{
                          padding: '32px',
                          textAlign: 'center',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        No compliance checks have been run yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}
    </div>
  )
}

interface FilterButtonProps {
  active: boolean
  onClick: () => void
  label: string
  color?: string
  count?: number
}

function FilterButton({
  active,
  onClick,
  label,
  color,
  count
}: FilterButtonProps): React.JSX.Element {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 16px',
        borderRadius: '6px',
        border: 'none',
        background: active ? 'var(--bg-card-hover)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontSize: '0.85rem',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'var(--transition)'
      }}
    >
      {color && (
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>
      )}
      {label}
      {count !== undefined && <span style={{ opacity: 0.5 }}>({count})</span>}
    </button>
  )
}
