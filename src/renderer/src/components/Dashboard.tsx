import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  Activity, AlertTriangle, CheckCircle, Clock, AlertCircle,
  Ship, FileText, Users, Shield, Wrench, Calendar, FileWarning,
  RefreshCw, Building2, User, TrendingUp, ChevronLeft, ChevronRight, Database,
  Settings, BarChart3, GitBranch, Zap, Layers,
  ChevronUp, ChevronDown, RotateCcw, History
} from 'lucide-react'
import { Vessel, VesselDocument, DocumentType, Entity, SurveyWarranty, WorkflowStep } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateShort } from '../utils/dateUtils'

// ── Widget Registry ──────────────────────────────────────────────────────

interface WidgetDef {
  id: string
  name: string
  description: string
  icon: any
  category: 'overview' | 'compliance' | 'operations' | 'activity'
  defaultEnabled: boolean
  defaultOrder: number
  size: 'full' | 'half' | 'third'
}

const WIDGET_REGISTRY: WidgetDef[] = [
  { id: 'kpi', name: 'Key Metrics', description: 'Active vessels, entities, compliance rate, critical issues, sanctions pending', icon: BarChart3, category: 'overview', defaultEnabled: true, defaultOrder: 0, size: 'full' },
  { id: 'expirations', name: 'Upcoming Expirations', description: 'Documents and policies expiring soon', icon: Clock, category: 'compliance', defaultEnabled: true, defaultOrder: 1, size: 'half' },
  { id: 'operational', name: 'Operational Status', description: 'Document compliance, entity docs, sanctions status', icon: Activity, category: 'compliance', defaultEnabled: true, defaultOrder: 2, size: 'half' },
  { id: 'recentVessels', name: 'Recently Added Vessels', description: 'Latest vessels added to the system', icon: Ship, category: 'activity', defaultEnabled: true, defaultOrder: 3, size: 'third' },
  { id: 'recentEntities', name: 'Recently Added Entities', description: 'Latest entities added', icon: Building2, category: 'activity', defaultEnabled: true, defaultOrder: 4, size: 'third' },
  { id: 'recentChanges', name: 'Recent Changes', description: 'Latest audit trail entries', icon: History, category: 'activity', defaultEnabled: true, defaultOrder: 5, size: 'third' },
  { id: 'dataQuality', name: 'Data Quality', description: 'Missing customer assignments, contacts, policy dates', icon: AlertTriangle, category: 'compliance', defaultEnabled: true, defaultOrder: 6, size: 'third' },
  { id: 'weekRenewals', name: 'Renewals This Week', description: 'Policies renewing within the current week', icon: Calendar, category: 'operations', defaultEnabled: true, defaultOrder: 7, size: 'third' },
  { id: 'renewalCalendar', name: 'Renewal Calendar', description: 'Upcoming policy renewals by month', icon: Calendar, category: 'operations', defaultEnabled: false, defaultOrder: 8, size: 'half' },
  { id: 'quickActions', name: 'Quick Actions', description: 'Shortcuts to create vessels, quotations, entities', icon: Zap, category: 'overview', defaultEnabled: false, defaultOrder: 9, size: 'third' },
  { id: 'quotationPipeline', name: 'Quotation Pipeline', description: 'Quotations by workflow status', icon: GitBranch, category: 'operations', defaultEnabled: false, defaultOrder: 10, size: 'half' },
  { id: 'fleetOverview', name: 'Fleet Overview', description: 'Vessel count by fleet with compliance rate', icon: Layers, category: 'overview', defaultEnabled: false, defaultOrder: 11, size: 'third' },
  { id: 'deadlineCalendar', name: 'Deadline Calendar', description: 'Monthly calendar showing policy expirations, survey dates, warranty deadlines', icon: Calendar, category: 'operations', defaultEnabled: false, defaultOrder: 12, size: 'full' },
]

interface WidgetLayout {
  widgets: Array<{ id: string; enabled: boolean; order: number }>
}

function getDefaultLayout(): WidgetLayout {
  return {
    widgets: WIDGET_REGISTRY.map(w => ({ id: w.id, enabled: w.defaultEnabled, order: w.defaultOrder }))
  }
}

function mergeLayoutWithRegistry(layout: WidgetLayout): WidgetLayout {
  const known = new Map(layout.widgets.map(w => [w.id, w]))
  const merged: WidgetLayout['widgets'] = []
  for (const def of WIDGET_REGISTRY) {
    const saved = known.get(def.id)
    if (saved) {
      merged.push(saved)
    } else {
      merged.push({ id: def.id, enabled: def.defaultEnabled, order: 999 })
    }
  }
  merged.sort((a, b) => a.order - b.order)
  return { widgets: merged.map((w, i) => ({ ...w, order: i })) }
}

function getWidgetDef(id: string): WidgetDef | undefined {
  return WIDGET_REGISTRY.find(w => w.id === id)
}

// ── Shared types / helpers ───────────────────────────────────────────────

interface DashboardActivity {
  recentVessels: Array<{ id: string; name: string; imoNumber: string; fleetName?: string; createdAt: string; isActive: boolean }>
  recentEntities: Array<{ id: string; name: string; type: string; createdAt: string }>
  recentAuditEntries: Array<{ vesselId: string; vesselName: string; fieldName: string; newValue?: string; changedAt: string }>
  weekRenewals: Array<{ vesselName: string; imoNumber: string; policyTypeName: string; policyNumber?: string; endDate: string }>
}

interface ExpirationItem {
  vesselName: string
  vesselId: string
  label: string
  expiryDate?: string
  kind: 'doc' | 'policy'
  severity: 'expired' | 'missing' | 'soon' | 'upcoming'
}

function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return '\u2014'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function fmtDate(s?: string | null): string {
  if (!s) return '\u2014'
  return formatDateShort(s) || '\u2014'
}

function formatFieldName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

// ── Widget context (shared data) ─────────────────────────────────────────

interface WidgetData {
  vessels: Vessel[]
  docs: VesselDocument[]
  docTypes: DocumentType[]
  entities: Entity[]
  openDefects: any[]
  pendingSanctions: any[]
  activeWarranties: SurveyWarranty[]
  endorsementsDue: number
  activity: DashboardActivity
  dataQuality: { vesselsNoCustomer: number; entitiesNoEmail: number; entitiesNoPhone: number; policiesNoEndDate: number }
  isLight: boolean
  onViewAlerts: () => void
  onViewSurveyFollowUp?: () => void
  onNavigateToVessel?: (vesselId: string, section: 'documents' | 'policies') => void
  onNavigate?: (tab: string) => void
  // computed
  activeVessels: Vessel[]
  activeVesselIds: Set<string>
  allAlerts: { vessel: string; vesselId: string; document: string; msg: string; type: string; expiryDate?: string }[]
  missingCount: number
  expiredCount: number
  soonCount: number
  globalCompliance: number
  entityDocMissingCount: number
  upcomingItems: ExpirationItem[]
  overdueWarranties: number
}

// ── Main component ───────────────────────────────────────────────────────

export default function Dashboard({
  onViewAlerts,
  onViewSurveyFollowUp,
  onNavigateToVessel,
  onNavigate
}: {
  onViewAlerts: () => void
  onViewSurveyFollowUp?: () => void
  onNavigateToVessel?: (vesselId: string, section: 'documents' | 'policies') => void
  onNavigate?: (tab: string) => void
}) {
  const { theme } = useTheme()
  const { user } = useAuth()
  const isLight = theme === 'light'
  const { showError } = useToast()

  // ── Data state ──
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [docs, setDocs] = useState<VesselDocument[]>([])
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [openDefects, setOpenDefects] = useState<any[]>([])
  const [pendingSanctions, setPendingSanctions] = useState<any[]>([])
  const [activeWarranties, setActiveWarranties] = useState<SurveyWarranty[]>([])
  const [endorsementsDue, setEndorsementsDue] = useState<number>(0)
  const [activity, setActivity] = useState<DashboardActivity>({ recentVessels: [], recentEntities: [], recentAuditEntries: [], weekRenewals: [] })
  const [dataQuality, setDataQuality] = useState<{ vesselsNoCustomer: number; entitiesNoEmail: number; entitiesNoPhone: number; policiesNoEndDate: number }>({ vesselsNoCustomer: 0, entitiesNoEmail: 0, entitiesNoPhone: 0, policiesNoEndDate: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  // ── Layout state ──
  const [layout, setLayout] = useState<WidgetLayout>(getDefaultLayout())
  const [editMode, setEditMode] = useState(false)
  const [editFilter, setEditFilter] = useState<string>('all')
  const [showOnboarding, setShowOnboarding] = useState(false)
  const layoutLoadedRef = useRef(false)

  // Load layout from server
  useEffect(() => {
    if (!user?.id) return
    window.api.dashboardGetLayout().then(saved => {
      if (saved && saved.widgets) {
        setLayout(mergeLayoutWithRegistry(saved))
      }
      layoutLoadedRef.current = true
      // Check onboarding (use localStorage as fallback since session may be stale)
      if (!user.dashboardOnboarded && !localStorage.getItem('dashboard_onboarded_' + user.id)) {
        setShowOnboarding(true)
      }
    }).catch(() => {
      layoutLoadedRef.current = true
    })
  }, [user?.id, user?.dashboardOnboarded])

  // Save layout when it changes (skip initial load)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const saveLayout = useCallback((newLayout: WidgetLayout) => {
    setLayout(newLayout)
    if (!layoutLoadedRef.current) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      window.api.dashboardSaveLayout(newLayout).catch(() => {})
    }, 500)
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [vData, dData, tData, eData] = await Promise.all([
        window.api.getVessels(),
        window.api.getVesselDocuments(),
        window.api.getDocumentTypes(),
        window.api.getEntities()
      ])
      setVessels(Array.isArray(vData) ? vData : [])
      setDocs(Array.isArray(dData) ? dData : [])
      setDocTypes(Array.isArray(tData) ? tData : [])
      setEntities(Array.isArray(eData) ? eData : [])
    } catch {
      showError('Failed to load core dashboard data')
    }

    const secondaryResults = await Promise.allSettled([
      window.api.getOpenDefectsByVessel().then(d => setOpenDefects(Array.isArray(d) ? d : [])),
      window.api.complianceGetPendingResults().then(d => setPendingSanctions(Array.isArray(d) ? d : [])),
      window.api.surveyWarrantyGetAll().then(d => setActiveWarranties(Array.isArray(d) ? d : [])),
      window.api.surveyWarrantyGetEndorsementsDue().then(d => setEndorsementsDue(Array.isArray(d) ? d.length : 0)),
      window.api.dashboardGetActivity().then(d =>
        setActivity(
          d && Array.isArray((d as any).recentVessels)
            ? (d as any)
            : { recentVessels: [], recentEntities: [], recentAuditEntries: [], weekRenewals: [] }
        )
      ),
      window.api.dashboardGetDataQualityAlerts().then(d => {
        if (d && typeof d === 'object' && !('error' in d)) setDataQuality(d)
      })
    ])
    const failCount = secondaryResults.filter(r => r.status === 'rejected').length
    if (failCount > 0) showError(`${failCount} dashboard section${failCount > 1 ? 's' : ''} failed to load`)
    setLastRefreshed(new Date())
    setIsLoading(false)
  }, [showError])

  useEffect(() => { loadData() }, [loadData])

  // ── Computed values ──
  const activeVessels = useMemo(() => vessels.filter(v => v.isActive), [vessels])
  const activeVesselIds = useMemo(() => new Set(activeVessels.map(v => v.id)), [activeVessels])

  const docMap = useMemo(() => {
    const map = new Map<string, VesselDocument>()
    for (const d of docs) {
      if (activeVesselIds.has(d.vesselId)) map.set(`${d.vesselId}:${d.documentTypeId}`, d)
    }
    return map
  }, [docs, activeVesselIds])

  const allAlerts = useMemo(() => {
    const today = new Date()
    const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 30)
    const ninetyDays = new Date(); ninetyDays.setDate(today.getDate() + 90)
    const alerts: { vessel: string; vesselId: string; document: string; msg: string; type: string; expiryDate?: string }[] = []

    for (const v of activeVessels) {
      for (const t of docTypes) {
        const doc = docMap.get(`${v.id}:${t.id}`)
        const isRequired = doc ? doc.required : t.required
        const hasFile = !!doc?.filePath
        const effectiveExpiry = (t.annualRenewal && v.policyExpiryDate) ? v.policyExpiryDate : doc?.expiryDate

        if (isRequired && !hasFile) {
          alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Missing File', type: 'missing' })
        } else if (hasFile && effectiveExpiry) {
          const expiry = new Date(effectiveExpiry)
          if (expiry < today) {
            alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Expired', type: 'expired', expiryDate: effectiveExpiry })
          } else if (expiry < thirtyDays) {
            const isShortCycle = t.annualRenewal && doc?.receivedDate &&
              (new Date(effectiveExpiry).getTime() - new Date(doc.receivedDate).getTime()) / 86400000 < 60
            if (!isShortCycle) {
              alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Expiring Soon', type: 'soon', expiryDate: effectiveExpiry })
            }
          } else if (expiry < ninetyDays) {
            alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Expiring in 90 days', type: 'upcoming', expiryDate: effectiveExpiry })
          }
        }
      }
    }
    return alerts
  }, [activeVessels, docTypes, docMap])

  const missingCount = useMemo(() => allAlerts.filter(a => a.type === 'missing').length, [allAlerts])
  const expiredCount = useMemo(() => allAlerts.filter(a => a.type === 'expired').length, [allAlerts])
  const soonCount = useMemo(() => allAlerts.filter(a => a.type === 'soon').length, [allAlerts])

  const globalCompliance = useMemo(() => {
    if (activeVessels.length === 0 || docTypes.length === 0) return 100
    const criticalCount = allAlerts.filter(a => a.type === 'missing' || a.type === 'expired').length
    const total = activeVessels.length * docTypes.length
    return Math.round(((total - criticalCount) / total) * 100)
  }, [activeVessels, docTypes, allAlerts])

  const policyStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30)
    const expiringVessels: { name: string; date: string; vesselId: string }[] = []

    for (const v of activeVessels) {
      if (!v.policyExpiryDate) continue
      const exp = new Date(v.policyExpiryDate)
      if (exp < thirtyDays) {
        expiringVessels.push({ name: v.name, date: v.policyExpiryDate, vesselId: v.id })
      }
    }
    expiringVessels.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return { expiringVessels }
  }, [activeVessels])

  const overdueWarranties = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return activeWarranties.filter(w => {
      if (w.deadlineType !== 'days' || !w.deadlineDays || !w.inceptionDate) return false
      const dl = new Date(w.inceptionDate)
      dl.setDate(dl.getDate() + w.deadlineDays)
      return dl < today
    }).length
  }, [activeWarranties])

  const upcomingItems = useMemo((): ExpirationItem[] => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const items: ExpirationItem[] = []

    for (const a of allAlerts) {
      if (a.type === 'upcoming') continue
      items.push({
        vesselName: a.vessel,
        vesselId: a.vesselId,
        label: a.document,
        expiryDate: a.expiryDate,
        kind: 'doc',
        severity: a.type === 'expired' ? 'expired' : a.type === 'missing' ? 'missing' : 'soon'
      })
    }

    for (const p of policyStats.expiringVessels) {
      items.push({
        vesselName: p.name,
        vesselId: p.vesselId,
        label: 'Policy Expiry',
        expiryDate: p.date,
        kind: 'policy',
        severity: new Date(p.date) < today ? 'expired' : 'soon'
      })
    }

    const ORDER = { expired: 0, missing: 1, soon: 2, upcoming: 3 }
    items.sort((a, b) => {
      const so = ORDER[a.severity] - ORDER[b.severity]
      if (so !== 0) return so
      if (!a.expiryDate) return -1
      if (!b.expiryDate) return 1
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    })
    return items.slice(0, 12)
  }, [allAlerts, policyStats])

  const entityDocMissingCount = useMemo(() => {
    let count = 0
    for (const e of entities) {
      if (e.type === 'company') {
        if (!e.certificateOfIncorporationPath) count++
        if (!e.articlesOfAssociationPath) count++
        if (!e.kycFilePath) count++
      } else {
        if (!e.passportFilePath) count++
      }
    }
    return count
  }, [entities])

  const widgetData: WidgetData = useMemo(() => ({
    vessels, docs, docTypes, entities, openDefects, pendingSanctions, activeWarranties, endorsementsDue,
    activity, dataQuality, isLight, onViewAlerts, onViewSurveyFollowUp, onNavigateToVessel, onNavigate,
    activeVessels, activeVesselIds, allAlerts, missingCount, expiredCount, soonCount, globalCompliance,
    entityDocMissingCount, upcomingItems, overdueWarranties
  }), [
    vessels, docs, docTypes, entities, openDefects, pendingSanctions, activeWarranties, endorsementsDue,
    activity, dataQuality, isLight, onViewAlerts, onViewSurveyFollowUp, onNavigateToVessel, onNavigate,
    activeVessels, activeVesselIds, allAlerts, missingCount, expiredCount, soonCount, globalCompliance,
    entityDocMissingCount, upcomingItems, overdueWarranties
  ])

  // ── Layout helpers ──
  const enabledWidgets = useMemo(() =>
    layout.widgets.filter(w => w.enabled).sort((a, b) => a.order - b.order),
    [layout]
  )

  const toggleWidget = (id: string) => {
    const newWidgets = layout.widgets.map(w =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    )
    saveLayout({ widgets: newWidgets })
  }

  const moveWidget = (id: string, direction: 'up' | 'down') => {
    const sorted = [...layout.widgets].sort((a, b) => a.order - b.order)
    const idx = sorted.findIndex(w => w.id === id)
    if (idx < 0) return
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const temp = sorted[idx].order
    sorted[idx] = { ...sorted[idx], order: sorted[swapIdx].order }
    sorted[swapIdx] = { ...sorted[swapIdx], order: temp }
    saveLayout({ widgets: sorted })
  }

  const resetToDefault = () => {
    saveLayout(getDefaultLayout())
  }

  const dismissOnboarding = () => {
    setShowOnboarding(false)
    localStorage.setItem('dashboard_onboarded_' + user?.id, 'true')
    window.api.dashboardSetOnboarded().catch(() => {})
  }

  // ── Styles ──
  const cardStyle: React.CSSProperties = {
    background: isLight ? '#fff' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${isLight ? '#e4e7ef' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: '14px',
    padding: '20px'
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const sizeToSpan = (size: string) => {
    if (size === 'full') return 'span 3'
    if (size === 'half') return 'span 2'
    return 'span 1'
  }

  const categories = [
    { key: 'all', label: 'All' },
    { key: 'overview', label: 'Overview' },
    { key: 'compliance', label: 'Compliance' },
    { key: 'operations', label: 'Operations' },
    { key: 'activity', label: 'Activity' }
  ]

  const filteredEditWidgets = useMemo(() => {
    const sorted = [...layout.widgets].sort((a, b) => a.order - b.order)
    if (editFilter === 'all') return sorted
    return sorted.filter(w => {
      const def = getWidgetDef(w.id)
      return def?.category === editFilter
    })
  }, [layout, editFilter])

  return (
    <div className="fade-in" style={{ padding: '0 2px' }}>

      {/* ── Onboarding Overlay ── */}
      {showOnboarding && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div style={{
            background: isLight ? '#ffffff' : '#1a1d28',
            borderRadius: '16px', padding: '32px', maxWidth: '440px', width: '90%',
            border: `1px solid ${isLight ? '#e4e7ef' : 'rgba(255,255,255,0.1)'}`,
            textAlign: 'center'
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '14px',
              background: 'linear-gradient(135deg, var(--accent-primary), #2563eb)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <Settings size={28} color="#fff" />
            </div>
            <h2 style={{ margin: '0 0 10px', fontSize: '1.25rem', fontWeight: '800' }}>
              Welcome to Your Dashboard
            </h2>
            <p style={{ margin: '0 0 24px', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6 }}>
              Your dashboard is customizable. Click the gear icon to add, remove, and rearrange widgets to suit your workflow.
            </p>
            <button
              onClick={dismissOnboarding}
              className="btn-primary"
              style={{ padding: '10px 32px', fontSize: '0.88rem', fontWeight: '700' }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {dateStr} · {activeVessels.length} active vessel{activeVessels.length !== 1 ? 's' : ''} · {entities.length} entit{entities.length !== 1 ? 'ies' : 'y'}
            {lastRefreshed && (
              <span style={{ marginLeft: '10px', opacity: 0.6 }}>· Updated {relativeTime(lastRefreshed.toISOString())}</span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setEditMode(!editMode)}
            className={editMode ? 'btn-primary' : 'btn-secondary'}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
            title="Customize dashboard"
          >
            <Settings size={14} />
            {editMode ? 'Done' : 'Customize'}
          </button>
          <button
            onClick={loadData}
            disabled={isLoading}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
          >
            <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Edit Mode ── */}
      {editMode && (
        <div style={{
          ...cardStyle,
          marginBottom: '24px',
          padding: '20px 24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>Customize Widgets</h3>
            <button
              onClick={resetToDefault}
              className="btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem', padding: '5px 12px' }}
            >
              <RotateCcw size={12} />
              Reset to Default
            </button>
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setEditFilter(cat.key)}
                style={{
                  padding: '4px 14px',
                  borderRadius: '8px',
                  fontSize: '0.76rem',
                  fontWeight: '600',
                  border: `1px solid ${editFilter === cat.key ? 'var(--accent-primary)' : (isLight ? '#e4e7ef' : 'rgba(255,255,255,0.1)')}`,
                  background: editFilter === cat.key ? 'rgba(0,170,200,0.1)' : 'transparent',
                  color: editFilter === cat.key ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Widget list */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {filteredEditWidgets.map((w) => {
              const def = getWidgetDef(w.id)
              if (!def) return null
              const Icon = def.icon
              return (
                <div
                  key={w.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: `1px solid ${w.enabled ? 'var(--accent-primary)' : (isLight ? '#e4e7ef' : 'rgba(255,255,255,0.08)')}`,
                    background: w.enabled
                      ? (isLight ? 'rgba(0,170,200,0.04)' : 'rgba(0,170,200,0.06)')
                      : (isLight ? '#f8f9fb' : 'rgba(255,255,255,0.02)'),
                    opacity: w.enabled ? 1 : 0.7,
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '8px',
                      background: w.enabled ? 'linear-gradient(135deg, var(--accent-primary), #2563eb)' : (isLight ? '#e4e7ef' : 'rgba(255,255,255,0.1)'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Icon size={15} color={w.enabled ? '#fff' : 'var(--text-secondary)'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '0.82rem', marginBottom: '2px' }}>{def.name}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{def.description}</div>
                      <div style={{ marginTop: '6px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{
                          fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase',
                          padding: '1px 6px', borderRadius: '4px',
                          background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                          color: 'var(--text-secondary)', letterSpacing: '0.04em'
                        }}>
                          {def.size}
                        </span>
                        <span style={{
                          fontSize: '0.62rem', fontWeight: '700', textTransform: 'uppercase',
                          padding: '1px 6px', borderRadius: '4px',
                          background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                          color: 'var(--text-secondary)', letterSpacing: '0.04em'
                        }}>
                          {def.category}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                      {/* Toggle */}
                      <button
                        onClick={() => toggleWidget(w.id)}
                        style={{
                          width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer',
                          background: w.enabled ? 'var(--accent-primary)' : (isLight ? '#ccc' : 'rgba(255,255,255,0.2)'),
                          position: 'relative', transition: 'background 0.2s ease'
                        }}
                      >
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                          position: 'absolute', top: '2px',
                          left: w.enabled ? '18px' : '2px',
                          transition: 'left 0.2s ease',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                        }} />
                      </button>
                      {/* Reorder */}
                      <div style={{ display: 'flex', gap: '1px', marginTop: '4px' }}>
                        <button
                          onClick={() => moveWidget(w.id, 'up')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)' }}
                          title="Move up"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => moveWidget(w.id, 'down')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--text-secondary)' }}
                          title="Move down"
                        >
                          <ChevronDown size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Widget Grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px'
      }}>
        {enabledWidgets.map(w => {
          const def = getWidgetDef(w.id)
          if (!def) return null
          return (
            <div key={w.id} style={{ gridColumn: sizeToSpan(def.size), maxHeight: '420px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <WidgetRenderer id={w.id} data={widgetData} cardStyle={{ ...cardStyle, maxHeight: '420px', overflow: 'auto', flex: 1 }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Widget Renderer ──────────────────────────────────────────────────────

function WidgetRenderer({ id, data, cardStyle }: { id: string; data: WidgetData; cardStyle: React.CSSProperties }) {
  switch (id) {
    case 'kpi': return <KPIWidget data={data} />
    case 'expirations': return <ExpirationsWidget data={data} cardStyle={cardStyle} />
    case 'operational': return <OperationalWidget data={data} cardStyle={cardStyle} />
    case 'recentVessels': return <RecentVesselsWidget data={data} cardStyle={cardStyle} />
    case 'recentEntities': return <RecentEntitiesWidget data={data} cardStyle={cardStyle} />
    case 'recentChanges': return <RecentChangesWidget data={data} cardStyle={cardStyle} />
    case 'dataQuality': return <DataQualityWidget data={data} cardStyle={cardStyle} />
    case 'weekRenewals': return <WeekRenewalsWidget data={data} cardStyle={cardStyle} />
    case 'renewalCalendar': return <RenewalCalendarWidget cardStyle={cardStyle} data={data} />
    case 'quotationPipeline': return <QuotationPipelineWidget cardStyle={cardStyle} data={data} />
    case 'quickActions': return <QuickActionsWidget cardStyle={cardStyle} data={data} />
    case 'fleetOverview': return <FleetOverviewWidget cardStyle={cardStyle} data={data} />
    case 'deadlineCalendar': return <DeadlineCalendarWidget cardStyle={cardStyle} data={data} />
    default: return null
  }
}

// ── KPI Widget ───────────────────────────────────────────────────────────

function KPIWidget({ data }: { data: WidgetData }) {
  const { activeVessels, vessels, entities, globalCompliance, missingCount, expiredCount, pendingSanctions } = data
  const sanctionsPending = pendingSanctions.length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px' }}>
      <KPICard icon={<Ship size={18} color="#fff" />} iconBg="linear-gradient(135deg, #0ea5e9, #2563eb)" label="Active Vessels" value={activeVessels.length} sub={`${vessels.length - activeVessels.length} inactive`} />
      <KPICard icon={<Users size={18} color="#fff" />} iconBg="linear-gradient(135deg, #8b5cf6, #6d28d9)" label="Entities" value={entities.length} sub={`${entities.filter(e => e.type === 'company').length} co · ${entities.filter(e => e.type === 'person').length} persons`} />
      <KPICard icon={<TrendingUp size={18} color="#fff" />} iconBg={globalCompliance === 100 ? 'linear-gradient(135deg, #10b981, #059669)' : globalCompliance > 80 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ef4444, #dc2626)'} label="Doc Compliance" value={`${globalCompliance}%`} sub={`${activeVessels.length} active vessels`} valueColor={globalCompliance === 100 ? '#10b981' : globalCompliance > 80 ? '#f59e0b' : 'var(--danger)'} />
      <KPICard icon={<AlertTriangle size={18} color="#fff" />} iconBg={missingCount + expiredCount > 0 ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)'} label="Critical Issues" value={missingCount + expiredCount} sub={`${missingCount} missing · ${expiredCount} expired`} valueColor={missingCount + expiredCount > 0 ? 'var(--danger)' : '#10b981'} />
      <KPICard icon={<Shield size={18} color="#fff" />} iconBg={sanctionsPending > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)'} label="Sanctions Pending" value={sanctionsPending} sub="Awaiting review" valueColor={sanctionsPending > 0 ? '#f59e0b' : '#10b981'} />
    </div>
  )
}

// ── Expirations Widget ───────────────────────────────────────────────────

function ExpirationsWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { upcomingItems, isLight, onViewAlerts, onNavigateToVessel } = data

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, var(--accent-primary), #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={14} color="#fff" />
          </div>
          Upcoming Expirations
          {upcomingItems.length > 0 && (
            <span style={{ padding: '1px 8px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: '700', background: 'rgba(255,77,77,0.12)', color: 'var(--danger)' }}>
              {upcomingItems.length}
            </span>
          )}
        </h3>
        <button
          onClick={onViewAlerts}
          style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}
        >
          View All <ChevronRight size={13} />
        </button>
      </div>

      {upcomingItems.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '10px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={22} color="#10b981" />
          </div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>All documents and policies are current</span>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              {['Status', 'Vessel', 'Document / Policy', 'Days', 'Expires'].map(h => (
                <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--table-border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {upcomingItems.slice(0, 12).map((item, idx) => {
              const isExp = item.severity === 'expired'
              const isMiss = item.severity === 'missing'
              const isSoon = item.severity === 'soon'
              const color = (isExp || isMiss) ? 'var(--danger)' : isSoon ? '#f59e0b' : '#10b981'
              const bgLabel = (isExp || isMiss) ? 'rgba(255,77,77,0.1)' : isSoon ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
              const statusLabel = isExp ? 'EXPIRED' : isMiss ? 'MISSING' : 'EXPIRING'
              const days = item.expiryDate ? daysUntil(item.expiryDate) : null
              const rowBg = idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.018)' : 'rgba(255,255,255,0.012)')

              return (
                <tr
                  key={idx}
                  onClick={() => onNavigateToVessel?.(item.vesselId, item.kind === 'policy' ? 'policies' : 'documents')}
                  style={{ background: rowBg, cursor: onNavigateToVessel ? 'pointer' : 'default' }}
                >
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '800', background: bgLabel, color, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}>
                      {isMiss ? <AlertCircle size={9} /> : isExp ? <AlertTriangle size={9} /> : <Clock size={9} />}
                      {statusLabel}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.vesselName}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.kind === 'policy' ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Shield size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                        {item.label}
                      </span>
                    ) : item.label}
                  </td>
                  <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    {days !== null ? (
                      <span style={{ fontWeight: '700', color, fontSize: '0.8rem' }}>
                        {days < 0 ? `${Math.abs(days)}d over` : days === 0 ? 'today' : `${days}d`}
                      </span>
                    ) : '\u2014'}
                  </td>
                  <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                    {item.expiryDate ? fmtDate(item.expiryDate) : '\u2014'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ── Operational Status Widget ────────────────────────────────────────────

function OperationalWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { missingCount, expiredCount, soonCount, entityDocMissingCount, openDefects, activeWarranties, overdueWarranties, endorsementsDue, onViewSurveyFollowUp } = data

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Activity size={14} color="#fff" />
        </div>
        Operational Status
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <StatusRow icon={<FileText size={14} />} label="Critical Documents" value={missingCount + expiredCount} color={(missingCount + expiredCount) > 0 ? 'var(--danger)' : '#10b981'} />
        <StatusRow icon={<Clock size={14} />} label="Expiring in 30 days" value={soonCount} color={soonCount > 0 ? '#f59e0b' : '#10b981'} />
        <StatusRow icon={<Users size={14} />} label="Entity Docs Missing" value={entityDocMissingCount} color={entityDocMissingCount > 0 ? '#f97316' : '#10b981'} />
        <StatusRow icon={<Wrench size={14} />} label="Open Defects" value={openDefects.length} color={openDefects.length > 0 ? '#f97316' : '#10b981'} />
        <StatusRow icon={<FileWarning size={14} />} label="Active Warranties" value={activeWarranties.length} color={activeWarranties.length > 0 ? '#f59e0b' : '#10b981'} />
        {overdueWarranties > 0 && (
          <StatusRow icon={<AlertTriangle size={14} />} label="Overdue Warranties" value={overdueWarranties} color="var(--danger)" />
        )}
        <StatusRow icon={<Calendar size={14} />} label="Endorsements Due" value={endorsementsDue} color={endorsementsDue > 0 ? '#f59e0b' : '#10b981'} />
      </div>

      {onViewSurveyFollowUp && (activeWarranties.length > 0 || endorsementsDue > 0) && (
        <button
          onClick={onViewSurveyFollowUp}
          className="btn-secondary"
          style={{ width: '100%', marginTop: '16px', fontSize: '0.78rem', padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
        >
          <FileWarning size={13} /> View Survey Follow-Up
        </button>
      )}
    </div>
  )
}

// ── Recent Vessels Widget ────────────────────────────────────────────────

function RecentVesselsWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { activity, isLight } = data

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ship size={13} color="#fff" />
        </div>
        Recently Added Vessels
      </h3>
      {activity.recentVessels.length === 0 ? (
        <EmptyActivity label="No vessels yet" />
      ) : (
        <div>
          {activity.recentVessels.map((v, idx) => (
            <div key={v.id} style={{
              display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
              borderRadius: '8px',
              background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
            }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: v.isActive ? 'rgba(14,165,233,0.12)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ship size={14} color={v.isActive ? '#0ea5e9' : 'var(--text-secondary)'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '0.82rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px', marginTop: '1px' }}>
                  <span>IMO {v.imoNumber}</span>
                  {v.fleetName && <span>· {v.fleetName}</span>}
                </div>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {relativeTime(v.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Recent Entities Widget ───────────────────────────────────────────────

function RecentEntitiesWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { activity, isLight } = data

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={13} color="#fff" />
        </div>
        Recently Added Entities
      </h3>
      {activity.recentEntities.length === 0 ? (
        <EmptyActivity label="No entities yet" />
      ) : (
        <div>
          {activity.recentEntities.map((e, idx) => {
            const isCompany = e.type === 'company'
            return (
              <div key={e.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                borderRadius: '8px',
                background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
              }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: isCompany ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isCompany ? <Building2 size={14} color="#8b5cf6" /> : <User size={14} color="#10b981" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '5px', background: isCompany ? 'rgba(139,92,246,0.1)' : 'rgba(16,185,129,0.1)', color: isCompany ? '#8b5cf6' : '#10b981', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                    {e.type}
                  </span>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {relativeTime(e.createdAt)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Recent Changes Widget ────────────────────────────────────────────────

function RecentChangesWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { activity, isLight } = data

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Activity size={13} color="#fff" />
        </div>
        Recent Changes
      </h3>
      {activity.recentAuditEntries.length === 0 ? (
        <EmptyActivity label="No recent changes" />
      ) : (
        <div>
          {activity.recentAuditEntries.map((entry, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px',
              borderRadius: '8px',
              background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
            }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                <Ship size={13} color="#f59e0b" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '700', fontSize: '0.82rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.vesselName}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{formatFieldName(entry.fieldName)}</span>
                  {entry.newValue && (
                    <>
                      <span>{'\u2192'}</span>
                      <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.newValue}</span>
                    </>
                  )}
                </div>
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {relativeTime(entry.changedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Data Quality Widget ──────────────────────────────────────────────────

function DataQualityWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { dataQuality, isLight } = data

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #e6a800, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Database size={13} color="#fff" />
        </div>
        <span style={{ fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Data Quality</span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <DataQualityRow label="Vessels without customer" count={dataQuality.vesselsNoCustomer} isLight={isLight} />
        <DataQualityRow label="Entities without email" count={dataQuality.entitiesNoEmail} isLight={isLight} />
        <DataQualityRow label="Entities without phone" count={dataQuality.entitiesNoPhone} isLight={isLight} />
        <DataQualityRow label="Policies without end date" count={dataQuality.policiesNoEndDate} isLight={isLight} />
      </div>
    </div>
  )
}

// ── Week Renewals Widget ─────────────────────────────────────────────────

function WeekRenewalsWidget({ data, cardStyle }: { data: WidgetData; cardStyle: React.CSSProperties }) {
  const { activity, isLight } = data

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calendar size={13} color="#fff" />
        </div>
        Renewals This Week
      </h3>
      {activity.weekRenewals.length === 0 ? (
        <EmptyActivity label="No renewals this week" />
      ) : (
        <div>
          {activity.weekRenewals.slice(0, 10).map((r, idx) => {
            const days = daysUntil(r.endDate)
            return (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                borderRadius: '8px',
                background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
              }}>
                <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: days <= 2 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Calendar size={13} color={days <= 2 ? '#ef4444' : '#10b981'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '700', fontSize: '0.82rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vesselName}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.policyTypeName}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: days <= 2 ? 'var(--danger)' : '#10b981' }}>{days === 0 ? 'Today' : `${days}d`}</div>
                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{fmtDate(r.endDate)}</div>
                </div>
              </div>
            )
          })}
          {activity.weekRenewals.length > 10 && (
            <div style={{ textAlign: 'center', padding: '8px', fontSize: '0.78rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              +{activity.weekRenewals.length - 10} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Renewal Calendar Widget ──────────────────────────────────────────────

function RenewalCalendarWidget({ cardStyle, data }: { cardStyle: React.CSSProperties; data: WidgetData }) {
  const { onNavigate } = data
  const [monthCounts, setMonthCounts] = useState<{ label: string; count: number; year: number; month: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const now = new Date()
    const months: { label: string; year: number; month: number }[] = []
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push({
        label: d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        year: d.getFullYear(),
        month: d.getMonth() + 1
      })
    }
    Promise.all(months.map(m =>
      window.api.getPolicyRenewalsByMonth(m.year, m.month)
        .then(rows => ({ ...m, count: Array.isArray(rows) ? rows.length : 0 }))
        .catch(() => ({ ...m, count: 0 }))
    )).then(results => {
      setMonthCounts(results)
      setLoading(false)
    })
  }, [])

  const maxCount = Math.max(...monthCounts.map(m => m.count), 1)

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #06b6d4, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Calendar size={13} color="#fff" />
        </div>
        Renewal Calendar
      </h3>
      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div className="skeleton" style={{ width: '100%', height: '120px', borderRadius: '8px' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', height: '140px' }}>
          {monthCounts.map((m, idx) => {
            const barHeight = m.count > 0 ? Math.max((m.count / maxCount) * 100, 12) : 4
            const color = idx === 0 ? '#ef4444' : idx === 1 ? '#f59e0b' : '#10b981'
            return (
              <div
                key={m.label}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                  cursor: onNavigate ? 'pointer' : 'default'
                }}
                onClick={() => onNavigate?.('renewals')}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: '700', color }}>{m.count}</span>
                <div style={{
                  width: '100%', maxWidth: '40px', height: `${barHeight}px`,
                  background: `${color}22`, border: `2px solid ${color}`,
                  borderRadius: '4px 4px 0 0',
                  transition: 'height 0.3s ease'
                }} />
                <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{m.label}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Quotation Pipeline Widget ────────────────────────────────────────────

function QuotationPipelineWidget({ cardStyle, data }: { cardStyle: React.CSSProperties; data: WidgetData }) {
  const { isLight, onNavigate } = data
  const [stepCounts, setStepCounts] = useState<{ name: string; color: string; count: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      window.api.workflowGetSteps(),
      window.api.getQuotations()
    ]).then(([steps, quotations]) => {
      const stepsArr = Array.isArray(steps) ? steps as WorkflowStep[] : []
      const quots = Array.isArray(quotations) ? quotations : []
      const counts = stepsArr
        .sort((a, b) => a.order - b.order)
        .map(step => ({
          name: step.name,
          color: step.color || '#888',
          count: quots.filter((q: any) => q.workflowStepId === step.id).length
        }))
      setStepCounts(counts)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const maxCount = Math.max(...stepCounts.map(s => s.count), 1)

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GitBranch size={13} color="#fff" />
        </div>
        Quotation Pipeline
      </h3>
      {loading ? (
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '8px' }} />
        </div>
      ) : stepCounts.length === 0 ? (
        <EmptyActivity label="No workflow steps configured" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {stepCounts.map(step => (
            <div
              key={step.name}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: onNavigate ? 'pointer' : 'default' }}
              onClick={() => onNavigate?.('quotations')}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: '600', width: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.name}</span>
              <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: isLight ? '#f0f0f0' : 'rgba(255,255,255,0.06)' }}>
                <div style={{
                  height: '100%', borderRadius: '4px',
                  width: `${Math.max((step.count / maxCount) * 100, 2)}%`,
                  background: step.color, transition: 'width 0.3s ease'
                }} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: '800', minWidth: '24px', textAlign: 'right', color: step.color }}>{step.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Quick Actions Widget ─────────────────────────────────────────────────

function QuickActionsWidget({ cardStyle, data }: { cardStyle: React.CSSProperties; data: WidgetData }) {
  const { onNavigate } = data

  const actions = [
    { label: 'New Vessel', icon: Ship, tab: 'vessels', color: '#0ea5e9' },
    { label: 'New Quotation', icon: FileText, tab: 'quotations', color: '#8b5cf6' },
    { label: 'New Entity', icon: Building2, tab: 'directory', color: '#10b981' },
    { label: 'Search', icon: () => <span style={{ fontSize: '0.7rem', fontWeight: '700' }}>Ctrl+K</span>, tab: 'search', color: '#f59e0b' }
  ]

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Zap size={13} color="#fff" />
        </div>
        Quick Actions
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {actions.map(a => {
          const Icon = a.icon
          return (
            <button
              key={a.label}
              onClick={() => onNavigate?.(a.tab)}
              className="btn-secondary"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px', fontSize: '0.82rem', fontWeight: '600',
                width: '100%', textAlign: 'left', justifyContent: 'flex-start'
              }}
            >
              <div style={{
                width: '28px', height: '28px', borderRadius: '7px',
                background: `${a.color}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Icon size={14} color={a.color} />
              </div>
              {a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Fleet Overview Widget ────────────────────────────────────────────────

function FleetOverviewWidget({ cardStyle, data }: { cardStyle: React.CSSProperties; data: WidgetData }) {
  const { activeVessels, allAlerts, docTypes, isLight } = data
  const [fleets, setFleets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.getFleets().then(f => {
      setFleets(Array.isArray(f) ? f : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const fleetRows = useMemo(() => {
    if (!fleets.length || !activeVessels.length) return []
    return fleets.map(fleet => {
      const fleetVessels = activeVessels.filter(v => (v as any).fleetId === fleet.id)
      const vesselCount = fleetVessels.length
      if (vesselCount === 0) return null
      const fleetAlerts = allAlerts.filter(a =>
        fleetVessels.some(v => v.id === a.vesselId) && (a.type === 'missing' || a.type === 'expired')
      )
      const total = vesselCount * docTypes.length
      const compliance = total > 0 ? Math.round(((total - fleetAlerts.length) / total) * 100) : 100
      return { name: fleet.name, vesselCount, compliance }
    }).filter(Boolean) as { name: string; vesselCount: number; compliance: number }[]
  }, [fleets, activeVessels, allAlerts, docTypes])

  const unassigned = activeVessels.filter(v => !(v as any).fleetId).length

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 16px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #06b6d4, #0284c7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Layers size={13} color="#fff" />
        </div>
        Fleet Overview
      </h3>
      {loading ? (
        <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '8px' }} />
      ) : fleetRows.length === 0 ? (
        <EmptyActivity label="No fleets with active vessels" />
      ) : (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {['Fleet', 'Vessels', 'Compliance'].map(h => (
                  <th key={h} style={{ padding: '5px 10px', textAlign: 'left', fontSize: '0.66rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--table-border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {fleetRows.map((row, idx) => {
                const compColor = row.compliance === 100 ? '#10b981' : row.compliance > 80 ? '#f59e0b' : 'var(--danger)'
                return (
                  <tr key={row.name} style={{ background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.018)' : 'rgba(255,255,255,0.012)') }}>
                    <td style={{ padding: '7px 10px', fontWeight: '600' }}>{row.name}</td>
                    <td style={{ padding: '7px 10px' }}>{row.vesselCount}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ fontWeight: '700', color: compColor }}>{row.compliance}%</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {unassigned > 0 && (
            <div style={{ marginTop: '10px', fontSize: '0.74rem', color: '#f59e0b', fontWeight: '600' }}>
              {unassigned} unassigned vessel{unassigned !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Deadline Calendar Widget ─────────────────────────────────────────────

interface CalendarEvent {
  date: string
  type: 'policy' | 'document' | 'survey' | 'warranty'
  label: string
  vesselName: string
}

function DeadlineCalendarWidget({ cardStyle, data }: { cardStyle: React.CSSProperties; data: WidgetData }) {
  const { isLight } = data
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() // 0-indexed

  useEffect(() => {
    setLoading(true)
    setSelectedDay(null)
    window.api.dashboardGetCalendarEvents(year, month + 1).then(result => {
      if (!result || typeof result !== 'object') { setEvents([]); setLoading(false); return }
      const evts: CalendarEvent[] = []
      if (Array.isArray(result.policies)) {
        for (const p of result.policies) {
          if (p.endDate) evts.push({ date: p.endDate, type: 'policy', label: p.policyTypeName, vesselName: p.vesselName })
        }
      }
      if (Array.isArray(result.documents)) {
        for (const d of result.documents) {
          if (d.expiryDate) evts.push({ date: d.expiryDate, type: 'document', label: d.documentName, vesselName: d.vesselName })
        }
      }
      if (Array.isArray(result.surveys)) {
        for (const s of result.surveys) {
          if (s.surveyDate) evts.push({ date: s.surveyDate, type: 'survey', label: s.surveyType || 'Survey', vesselName: s.vesselName })
        }
      }
      if (Array.isArray(result.warranties)) {
        for (const w of result.warranties) {
          if (w.deadlineDate) evts.push({ date: w.deadlineDate, type: 'warranty', label: w.description || 'Warranty', vesselName: w.vesselName })
        }
      }
      setEvents(evts)
      setLoading(false)
    }).catch(() => { setEvents([]); setLoading(false) })
  }, [year, month])

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToday = () => setCurrentDate(new Date())

  const monthLabel = currentDate.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const firstDayOfMonth = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1 // Monday start

  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month
  const todayDay = today.getDate()

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return events.filter(e => e.date.startsWith(dateStr))
  }

  const dayHasType = (dayEvents: CalendarEvent[], type: string) => dayEvents.some(e => e.type === type)

  const DOT_COLORS = {
    policy: '#ef4444',
    document: '#f59e0b',
    survey: '#3b82f6',
    warranty: '#8b5cf6'
  }

  const selectedDayEvents = selectedDay ? getEventsForDay(selectedDay) : []

  return (
    <div style={{ ...cardStyle, maxHeight: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Calendar size={13} color="#fff" />
          </div>
          Deadline Calendar
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button onClick={prevMonth} className="btn-secondary" style={{ padding: '4px 8px' }} aria-label="Previous month">
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontWeight: '700', fontSize: '0.88rem', minWidth: '140px', textAlign: 'center' }}>{monthLabel}</span>
          <button onClick={nextMonth} className="btn-secondary" style={{ padding: '4px 8px' }} aria-label="Next month">
            <ChevronRight size={14} />
          </button>
          <button onClick={goToday} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.72rem', marginLeft: '4px' }}>Today</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
        {Object.entries(DOT_COLORS).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <div className="skeleton" style={{ width: '100%', height: '200px', borderRadius: '8px' }} />
        </div>
      ) : (
        <>
          {/* Calendar Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {/* Day of week headers */}
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '0.68rem', fontWeight: '700', color: 'var(--text-secondary)', padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {d}
              </div>
            ))}
            {/* Empty cells before first day */}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {/* Day cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dayEvents = getEventsForDay(day)
              const isToday = isCurrentMonth && day === todayDay
              const isSelected = selectedDay === day
              const hasEvents = dayEvents.length > 0

              return (
                <div
                  key={day}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '2px',
                    background: isSelected
                      ? 'rgba(0,170,200,0.18)'
                      : isToday
                        ? 'rgba(0,170,200,0.08)'
                        : 'transparent',
                    borderRadius: '6px',
                    cursor: hasEvents ? 'pointer' : 'default',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    transition: 'all 0.1s ease'
                  }}
                >
                  <span style={{
                    fontSize: '0.8rem',
                    fontWeight: isToday ? '800' : hasEvents ? '600' : '400',
                    color: isToday ? 'var(--accent-primary)' : hasEvents ? 'var(--text-primary)' : 'var(--text-secondary)'
                  }}>
                    {day}
                  </span>
                  <div style={{ display: 'flex', gap: '2px', marginTop: '2px', minHeight: '6px' }}>
                    {dayHasType(dayEvents, 'policy') && <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS.policy }} />}
                    {dayHasType(dayEvents, 'document') && <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS.document }} />}
                    {dayHasType(dayEvents, 'survey') && <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS.survey }} />}
                    {dayHasType(dayEvents, 'warranty') && <span style={{ width: 6, height: 6, borderRadius: '50%', background: DOT_COLORS.warranty }} />}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Selected Day Events */}
          {selectedDay !== null && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
              borderRadius: '8px',
              border: '1px solid var(--table-border)'
            }}>
              <div style={{ fontWeight: '700', fontSize: '0.82rem', marginBottom: '8px' }}>
                {new Date(year, month, selectedDay).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                <span style={{ marginLeft: '8px', fontWeight: '400', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                  {selectedDayEvents.length} event{selectedDayEvents.length !== 1 ? 's' : ''}
                </span>
              </div>
              {selectedDayEvents.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No events on this day</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedDayEvents.map((evt, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '6px', background: isLight ? '#fff' : 'rgba(255,255,255,0.03)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: DOT_COLORS[evt.type], flexShrink: 0 }} />
                      <span style={{ fontSize: '0.78rem', fontWeight: '600', textTransform: 'uppercase' }}>{evt.vesselName}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{evt.label}</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: '0.66rem', fontWeight: '700', textTransform: 'uppercase',
                        padding: '1px 6px', borderRadius: '4px',
                        background: `${DOT_COLORS[evt.type]}18`, color: DOT_COLORS[evt.type]
                      }}>
                        {evt.type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────

function DataQualityRow({ label, count, isLight }: { label: string; count: number; isLight: boolean }) {
  const hasIssue = count > 0
  const color = hasIssue ? '#e6a800' : '#00c864'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '7px' }}>
      <span style={{ display: 'flex', flexShrink: 0 }}>
        {hasIssue
          ? <AlertTriangle size={13} color={color} />
          : <CheckCircle size={13} color={color} />
        }
      </span>
      <span style={{ flex: 1, fontSize: '0.78rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>{label}</span>
      <span style={{
        fontWeight: '800',
        fontSize: '0.78rem',
        color,
        padding: '1px 7px',
        borderRadius: '6px',
        background: hasIssue
          ? (isLight ? 'rgba(230,168,0,0.1)' : 'rgba(230,168,0,0.15)')
          : (isLight ? 'rgba(0,200,100,0.1)' : 'rgba(0,200,100,0.15)'),
        minWidth: '24px',
        textAlign: 'center'
      }}>{count}</span>
    </div>
  )
}

function KPICard({
  icon, iconBg, label, value, sub, valueColor
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string | number
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="glass-card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: '800', lineHeight: 1, marginBottom: '4px', color: valueColor || 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: sub ? '2px' : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{sub}</div>}
    </div>
  )
}

function StatusRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px' }}>
      <span style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{
        fontWeight: '800', fontSize: '1rem', color,
        minWidth: '28px', textAlign: 'right'
      }}>{value}</span>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, opacity: value > 0 ? 1 : 0.3 }} />
    </div>
  )
}

function EmptyActivity({ label }: { label: string }) {
  return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
      {label}
    </div>
  )
}
