import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import {
  LayoutDashboard,
  Ship,
  Settings,
  ShieldAlert,
  LogOut,
  UserCog,
  Sun,
  Moon,
  Search,
  Bell,
  Calculator,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  KeyRound,
  ClipboardList,
  FileText,
  SlidersHorizontal,
  Calendar,
  RefreshCw,
  Layers,
  FileWarning,
  BarChart2,
  Crown,
  ScrollText,
  Mail,
  FileCheck,
  List,
  Anchor,
  Building2,
  Sparkles,
  Eye,
  EyeOff,
  Download,
  Receipt,
  FileBarChart2,
  Compass,
  X
} from 'lucide-react'
import { useTheme } from './contexts/ThemeContext'
import Dashboard from './components/Dashboard'
import VesselManager from './components/VesselManager'
import { SetupScreen } from './components/SetupScreen'
import { LoginScreen } from './components/LoginScreen'
import UserProfileModal from './components/UserProfileModal'
import { useAuth } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateNotification } from './components/UpdateNotification'
import ChangelogModal from './components/ChangelogModal'
import WhatsNewModal from './components/WhatsNewModal'
import GlobalSearch from './components/GlobalSearch'
import { PageHeader, SegmentedControl } from './components/ui'
import { useToast } from './contexts/ToastContext'
import { AppTab, AppAction, NavTarget, visibleFeatures, FEATURES } from './features'
import type { RecentItem } from '../../shared/types'

// Heavy components — lazy loaded to reduce initial bundle size
const SanctionsSearch = lazy(() => import('./components/SanctionsSearch'))
const AdminPanel = lazy(() => import('./components/AdminPanel'))
const FleetManager = lazy(() => import('./components/FleetManager'))
const Directory = lazy(() => import('./components/Directory'))
const ComplianceCenter = lazy(() => import('./components/ComplianceCenter'))
const UserManager = lazy(() => import('./components/UserManager'))
const VesselFilter = lazy(() => import('./components/VesselFilter'))
const Calculators = lazy(() => import('./components/Calculators'))
const ReceiptManager = lazy(() => import('./components/ReceiptManager'))
const QuotationManager = lazy(() => import('./components/QuotationManager'))
const ConditionSurveyList = lazy(() => import('./components/ConditionSurveyList'))
const SurveyFollowUp = lazy(() => import('./components/SurveyFollowUp'))
const PolicyRenewals = lazy(() => import('./components/PolicyRenewals'))
const Reports = lazy(() => import('./components/Reports'))
const FleetAnalytics = lazy(() => import('./components/FleetAnalytics'))
const ActivityLog = lazy(() => import('./components/ActivityLog'))
const TemplatesPage = lazy(() => import('./components/TemplatesPage'))
const PolicyList = lazy(() => import('./components/PolicyList'))
const PolicyDetail = lazy(() => import('./components/PolicyDetail'))
const PolicySettings = lazy(() => import('./components/PolicySettings'))
const PolicySetupWizard = lazy(() => import('./components/PolicySetupWizard'))
const NotificationsPage = lazy(() => import('./components/NotificationsPage'))
const FeaturesPage = lazy(() => import('./components/FeaturesPage'))

const LoadingFallback = (): React.JSX.Element => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
    Loading...
  </div>
)

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard')
  const [dbConnected, setDbConnected] = useState<boolean | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [showProfile, setShowProfile] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { isAuthenticated, isAdmin, logout, user, hasPermission } = useAuth()
  const { theme, setThemeTo } = useTheme()
  const [navigateToVesselId, setNavigateToVesselId] = useState<string | null>(null)
  const [navigateToVesselSection, setNavigateToVesselSection] = useState<
    'documents' | 'assureds' | 'surveys' | 'policies' | 'timeline' | undefined
  >(undefined)
  const [navigateBackTab, setNavigateBackTab] = useState<AppTab | undefined>(undefined)
  const [complianceSubTab, setComplianceSubTab] = useState<
    'documents' | 'policies' | 'sanctions' | 'dataQuality'
  >('documents')
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [initialQuotationId, setInitialQuotationId] = useState<string | null>(null)
  const [initialEntityId, setInitialEntityId] = useState<string | null>(null)
  // Set by Dashboard Quick Actions: the target page opens its create form once
  const [createIntent, setCreateIntent] = useState<'vessel' | 'quotation' | 'entity' | null>(null)
  const [quotationPolicyContext, setQuotationPolicyContext] = useState<{
    policyId: string
    policyNumber: string
  } | null>(null)
  const [policyView, setPolicyView] = useState<'list' | 'settings'>('list')
  const [policySetupQuotationId, setPolicySetupQuotationId] = useState<string | null>(null)
  // Sub-tab asked for by the palette / Features page; `n` makes a repeat request re-apply
  const [pageRequest, setPageRequest] = useState<{ tab: AppTab; sub: string; n: number } | null>(
    null
  )
  const { showSuccess, showError } = useToast()
  // Name fetched for the vessel the breadcrumb points at (keyed by id so a stale name never shows)
  const [breadcrumbVessel, setBreadcrumbVessel] = useState<{ id: string; name: string } | null>(
    null
  )
  const breadcrumbVesselName =
    activeTab === 'vessels' && breadcrumbVessel && breadcrumbVessel.id === navigateToVesselId
      ? breadcrumbVessel.name
      : null
  // Nothing sets these yet: the quotation / policy breadcrumbs end at the list label
  const [breadcrumbQuotationRef] = useState<string | null>(null)
  const [breadcrumbPolicyRef] = useState<string | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set<string>(['recent', 'admin'])
  )
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [discoverTipSeen, setDiscoverTipSeen] = useState(true)
  const [density, setDensity] = useState<'compact' | 'normal' | 'spacious'>(() => {
    return (localStorage.getItem('tableDensity') as 'compact' | 'normal' | 'spacious') || 'normal'
  })
  const isLight = theme === 'light' || theme === 'aurora'

  // Hot-update notification
  const [hotUpdateAvailable, setHotUpdateAvailable] = useState(false)
  const [hotBuildNumber, setHotBuildNumber] = useState(0)
  const [checkingUpdate, setCheckingUpdate] = useState(false)

  // Force password reset state
  const [forcePasswordReset, setForcePasswordReset] = useState(false)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState('')
  const [showResetPw, setShowResetPw] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      window.api
        .authIsPasswordResetRequired()
        .then((required) => {
          setForcePasswordReset(!!required)
        })
        .catch(() => {})
    }
  }, [isAuthenticated])

  const handleForceReset = async (): Promise<void> => {
    if (resetPassword.length < 6) {
      setResetError('Password must be at least 6 characters')
      return
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match')
      return
    }
    setResetLoading(true)
    setResetError('')
    try {
      await window.api.authForceResetPassword(resetPassword)
      setForcePasswordReset(false)
      setResetPassword('')
      setResetConfirm('')
    } catch (err) {
      setResetError((err instanceof Error && err.message) || 'Failed to update password')
    } finally {
      setResetLoading(false)
    }
  }

  useEffect(() => {
    document.body.className =
      document.body.className.replace(/density-\w+/g, '').trim() + ` density-${density}`
    localStorage.setItem('tableDensity', density)
  }, [density])

  // Resolve breadcrumb vessel name when navigating
  useEffect(() => {
    if (!navigateToVesselId || activeTab !== 'vessels') return
    let alive = true
    window.api
      .getVessels()
      .then((vessels) => {
        const v = vessels.find((v) => v.id === navigateToVesselId)
        if (v && alive) setBreadcrumbVessel({ id: navigateToVesselId, name: v.name })
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [navigateToVesselId, activeTab])

  // Ctrl+K global search shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSearchNavigate = useCallback((type: string, id: string) => {
    if (type === 'vessel') {
      setNavigateToVesselId(id)
      setNavigateToVesselSection(undefined)
      setNavigateBackTab(undefined)
      setActiveTab('vessels')
    } else if (type === 'entity') {
      setInitialEntityId(id)
      setActiveTab('directory')
    } else if (type === 'quotation') {
      setInitialQuotationId(id)
      setActiveTab('quotations')
    } else if (type === 'policy') {
      setSelectedPolicyId(id)
      setActiveTab('policy-detail')
    } else if (type === 'vessel_policy') {
      setNavigateToVesselId(id)
      setNavigateToVesselSection('policies')
      setNavigateBackTab(undefined)
      setActiveTab('vessels')
    }
  }, [])

  const checkForUpdates = useCallback(
    async (announce = false) => {
      setCheckingUpdate(true)
      try {
        const result = await window.api.hotUpdateCheck()
        if (result.updated) setHotUpdateAvailable(true)
        else if (announce) showSuccess('You are on the latest version')
      } catch {
        if (announce) showError('Could not check for updates')
      }
      setCheckingUpdate(false)
    },
    [showSuccess, showError]
  )

  const startCreate = useCallback((kind: 'vessel' | 'quotation' | 'entity') => {
    setCreateIntent(kind)
    if (kind === 'vessel') {
      setNavigateToVesselId(null)
      setNavigateToVesselSection(undefined)
    }
    setPageRequest(null)
    setActiveTab(kind === 'vessel' ? 'vessels' : kind === 'quotation' ? 'quotations' : 'directory')
  }, [])

  const runAction = useCallback(
    (action: AppAction) => {
      switch (action) {
        case 'new-vessel':
          return startCreate('vessel')
        case 'new-quotation':
          return startCreate('quotation')
        case 'new-entity':
          return startCreate('entity')
        case 'whats-new':
          return setShowWhatsNew(true)
        case 'release-history':
          return setShowChangelog(true)
        case 'profile':
          return setShowProfile(true)
        case 'check-updates':
          return void checkForUpdates(true)
        case 'theme-dark':
          return setThemeTo('dark')
        case 'theme-light':
          return setThemeTo('light')
        case 'theme-premium':
          return setThemeTo('premium')
        case 'theme-aurora':
          return setThemeTo('aurora')
        case 'density-compact':
          return setDensity('compact')
        case 'density-normal':
          return setDensity('normal')
        case 'density-spacious':
          return setDensity('spacious')
      }
    },
    [startCreate, checkForUpdates, setThemeTo]
  )

  /** One way to go anywhere: a page, a sub-tab inside it, or an action */
  const navigateTo = useCallback(
    (t: NavTarget) => {
      if (t.action) {
        runAction(t.action)
        return
      }
      if (!t.tab) return
      if (t.tab === 'policies-list') setPolicyView(t.sub === 'settings' ? 'settings' : 'list')
      if (t.tab === 'compliance' && t.sub) setComplianceSubTab(t.sub as typeof complianceSubTab)
      if (t.tab === 'vessels') {
        setNavigateToVesselId(null)
        setNavigateToVesselSection(undefined)
      }
      setPageRequest(t.sub ? { tab: t.tab, sub: t.sub, n: Date.now() } : null)
      setActiveTab(t.tab)
    },
    [runAction]
  )

  // When the session user changes: restore the sidebar state from the DB and read the
  // one-time Ctrl+K tip flag (adjusting state during render, not in an effect)
  const userId = user?.id
  const [restoredForUserId, setRestoredForUserId] = useState<string | undefined>(undefined)
  if (restoredForUserId !== userId) {
    setRestoredForUserId(userId)
    if (user) {
      setSidebarCollapsed(!!user.sidebarCollapsed)
      try {
        const groups = user.collapsedGroups ? JSON.parse(user.collapsedGroups) : []
        setCollapsedGroups(new Set(groups))
      } catch {
        setCollapsedGroups(new Set())
      }
      try {
        setDiscoverTipSeen(!!localStorage.getItem(`tip_discover_u${user.id}`))
      } catch {
        setDiscoverTipSeen(true)
      }
    }
  }

  const saveSidebarState = (collapsed: boolean, groups: Set<string>): void => {
    window.api.updateUserSidebarState(collapsed, JSON.stringify([...groups])).catch(() => {})
  }

  const toggleSidebar = (): void => {
    setSidebarCollapsed((prev) => {
      const next = !prev
      saveSidebarState(next, collapsedGroups)
      return next
    })
  }

  const toggleGroup = (id: string): void => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveSidebarState(sidebarCollapsed, next)
      return next
    })
  }

  useEffect(() => {
    window.api.setupCheckConnection().then(setDbConnected)
    window.api.updateGetCurrentVersion().then(setAppVersion)
    const offDb = window.api.onDbStatus((status) => {
      setDbConnected(status.connected)
    })
    const offHot = window.api.onHotUpdateAvailable(() => {
      setHotUpdateAvailable(true)
    })
    window.api
      .hotUpdateGetInfo()
      .then((info) => {
        setHotBuildNumber(info.currentBuild)
      })
      .catch(() => {})
    return () => {
      offDb?.()
      offHot?.()
    }
  }, [])

  useEffect(() => {
    if (isAuthenticated && appVersion) {
      // Include hot-update build number if available
      window.api
        .hotUpdateGetInfo()
        .then((info) => {
          const fullVersion =
            info.currentBuild > 0 ? `${appVersion} (build ${info.currentBuild})` : appVersion
          window.api.updateUserAppVersion(fullVersion)
        })
        .catch(() => {
          window.api.updateUserAppVersion(appVersion)
        })
    }
  }, [isAuthenticated, appVersion])

  // Show What's New once per version per user (700ms delay so Dashboard is visible first)
  useEffect(() => {
    if (!isAuthenticated || !appVersion || !userId) return
    const key = `whatsNew_seen_v${appVersion}_u${userId}`
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => setShowWhatsNew(true), 700)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isAuthenticated, appVersion, userId])

  // One-time tip about Ctrl+K and the Features page (per user, per machine); its flag is
  // read when the session user changes (above)
  const dismissDiscoverTip = (): void => {
    setDiscoverTipSeen(true)
    try {
      if (user) localStorage.setItem(`tip_discover_u${user.id}`, '1')
    } catch {
      /* private storage */
    }
  }

  // Signed out: forget the count and the recent items (adjusting state during render)
  if (!isAuthenticated && unreadNotifCount !== 0) setUnreadNotifCount(0)
  if (!isAuthenticated && recentItems.length > 0) setRecentItems([])

  // Poll for unread notification count every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return
    const fetchCount = (): void => {
      window.api
        .notificationsGetUnreadCount()
        .then((c) => {
          if (typeof c === 'number') setUnreadNotifCount(c)
        })
        .catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  // Load recent items
  const loadRecentItems = useCallback(() => {
    if (!isAuthenticated) return
    window.api
      .recentItemsGet()
      .then((items) => {
        if (Array.isArray(items)) setRecentItems(items)
      })
      .catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    loadRecentItems()
  }, [loadRecentItems])

  // Listen for recent-item-added custom event from child components
  useEffect(() => {
    const handler = (): void => loadRecentItems()
    window.addEventListener('recent-item-added', handler)
    return () => window.removeEventListener('recent-item-added', handler)
  }, [loadRecentItems])

  useEffect(() => {
    const preventDefault = (e: DragEvent): void => {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    window.addEventListener('dragover', preventDefault, false)
    window.addEventListener('drop', preventDefault, false)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  if (dbConnected === null)
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  if (!dbConnected) return <SetupScreen />
  if (!isAuthenticated) return <LoginScreen />

  const userInitials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??'
  const sc = sidebarCollapsed

  const menuBg = isLight ? '#ffffff' : '#1e1e28'
  const menuBorder = isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.15)'
  const menuShadow = isLight ? '0 10px 25px rgba(0,0,0,0.15)' : '0 10px 25px rgba(0,0,0,0.5)'

  const navItem = (
    tab: typeof activeTab,
    icon: React.ReactNode,
    label: string
  ): React.JSX.Element => (
    <NavItem
      key={tab}
      icon={icon}
      label={label}
      active={activeTab === tab}
      onClick={() => {
        setPageRequest(null)
        setActiveTab(tab)
      }}
      sidebarCollapsed={sc}
    />
  )

  const sub = (tab: AppTab): { subTab?: string; subTabNonce?: number } =>
    pageRequest?.tab === tab ? { subTab: pageRequest.sub, subTabNonce: pageRequest.n } : {}

  // Derive breadcrumbs from current state
  const breadcrumbs: { label: string; onClick?: () => void }[] = []
  const TAB_LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    features: 'Features',
    vessels: 'Vessels',
    fleets: 'Fleets',
    admin: 'Settings',
    directory: 'Directory',
    compliance: 'Compliance',
    users: 'Users',
    'sanctions-search': 'Sanctions Search',
    surveys: 'Surveys',
    'survey-followup': 'Survey Follow-Up',
    calculators: 'Calculators',
    quotations: 'Quotations',
    'vessel-filter': 'Vessel Filter',
    renewals: 'Renewals',
    reports: 'Reports',
    analytics: 'Fleet Analytics',
    'activity-log': 'Activity Log',
    templates: 'Templates',
    receipts: 'Receipts',
    'policies-list': 'Policies',
    'policy-detail': 'Policies',
    notifications: 'Notifications',
    'policy-setup': 'Policy Setup'
  }

  if (activeTab === 'vessels' && navigateToVesselId && breadcrumbVesselName) {
    if (navigateBackTab) {
      breadcrumbs.push({
        label: TAB_LABELS[navigateBackTab] || navigateBackTab,
        onClick: () => {
          setActiveTab(navigateBackTab)
          setNavigateBackTab(undefined)
          setNavigateToVesselId(null)
          setNavigateToVesselSection(undefined)
        }
      })
    } else {
      breadcrumbs.push({
        label: 'Vessels',
        onClick: () => {
          setNavigateToVesselId(null)
          setNavigateToVesselSection(undefined)
        }
      })
    }
    breadcrumbs.push({ label: breadcrumbVesselName })
  } else if (activeTab === 'policy-detail' && selectedPolicyId) {
    breadcrumbs.push({
      label: 'Policies',
      onClick: () => {
        setSelectedPolicyId(null)
        setActiveTab('policies-list')
      }
    })
    if (breadcrumbPolicyRef) breadcrumbs.push({ label: breadcrumbPolicyRef })
    else breadcrumbs.push({ label: 'Policy Detail' })
  } else if (activeTab === 'quotations' && initialQuotationId) {
    breadcrumbs.push({
      label: 'Quotations',
      onClick: () => {
        setInitialQuotationId(null)
      }
    })
    if (breadcrumbQuotationRef) breadcrumbs.push({ label: breadcrumbQuotationRef })
    else breadcrumbs.push({ label: 'Editor' })
  }

  return (
    <ErrorBoundary>
      <a href="#main-content" className="sr-only">
        Skip to main content
      </a>
      <div className="layout-container">
        <aside
          className="sidebar"
          style={{
            width: sc ? '64px' : '240px',
            minWidth: sc ? '64px' : '240px',
            padding: sc ? '16px 8px' : '20px 12px',
            transition: 'width 0.22s ease, min-width 0.22s ease, padding 0.22s ease',
            overflow: showUserMenu ? 'visible' : 'hidden'
          }}
        >
          {/* User header */}
          <div ref={userMenuRef} style={{ position: 'relative', paddingBottom: '16px' }}>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                transition: 'var(--transition)',
                overflow: 'hidden'
              }}
              className="hover-effect"
              title={sc ? `${user?.username} (${user?.role})` : 'User Menu'}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  flexShrink: 0,
                  background:
                    'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.7rem',
                  fontWeight: '700',
                  color: '#fff',
                  letterSpacing: '0.5px'
                }}
              >
                {userInitials}
              </div>
              {!sc && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2
                      style={{
                        fontSize: '1.05rem',
                        margin: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      Vessel Compliance
                    </h2>
                    <div style={{ fontSize: '0.73rem', opacity: 0.7, whiteSpace: 'nowrap' }}>
                      {user?.username} ({user?.role})
                    </div>
                  </div>
                  <ChevronDown
                    size={13}
                    style={{
                      opacity: 0.5,
                      flexShrink: 0,
                      transform: showUserMenu ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s'
                    }}
                  />
                </>
              )}
            </div>

            {/* Search + Notification Bell */}
            <div
              style={{
                display: 'flex',
                flexDirection: sc ? 'column' : 'row',
                alignItems: 'center',
                marginTop: '8px',
                gap: '6px'
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setSearchOpen(true)
                }}
                style={{
                  flex: sc ? undefined : 1,
                  minWidth: 0,
                  background: sc ? 'transparent' : 'var(--input-bg)',
                  border: sc ? 'none' : '1px solid var(--input-border)',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: sc ? '6px' : '6px 8px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontWeight: 400
                }}
                className="hover-effect"
                title="Search records, pages and actions (Ctrl+K)"
              >
                <Search size={15} style={{ flexShrink: 0 }} />
                {!sc && (
                  <span
                    style={{
                      fontSize: '0.78rem',
                      flex: 1,
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                  >
                    Search or jump to...
                  </span>
                )}
                {!sc && (
                  <kbd className="kbd" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                    Ctrl K
                  </kbd>
                )}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPageRequest(null)
                  setActiveTab('notifications')
                }}
                style={{
                  position: 'relative',
                  background:
                    activeTab === 'notifications'
                      ? isLight
                        ? 'rgba(0,0,0,0.06)'
                        : 'rgba(255,255,255,0.08)'
                      : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color:
                    activeTab === 'notifications'
                      ? 'var(--accent-primary)'
                      : 'var(--text-secondary)',
                  padding: '7px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0
                }}
                className="hover-effect"
                title={
                  unreadNotifCount > 0
                    ? `Notifications (${unreadNotifCount} unread)`
                    : 'Notifications'
                }
                aria-label="Notifications"
              >
                <Bell size={16} />
                {unreadNotifCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-3px',
                      right: '-3px',
                      background: 'var(--danger)',
                      color: '#fff',
                      borderRadius: '10px',
                      padding: '0 4px',
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      minWidth: '15px',
                      height: '15px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1
                    }}
                  >
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>
            </div>

            {showUserMenu && (
              <div
                style={{
                  position: 'absolute',
                  ...(sc
                    ? { top: 0, left: 'calc(100% + 8px)', right: 'auto' }
                    : { top: '100%', left: 0, right: 0, marginTop: '4px' }),
                  background: menuBg,
                  border: menuBorder,
                  borderRadius: '8px',
                  boxShadow: menuShadow,
                  zIndex: 200,
                  overflow: 'hidden',
                  minWidth: '160px'
                }}
              >
                <button
                  onClick={() => {
                    setShowProfile(true)
                    setShowUserMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border-color)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.83rem',
                    textAlign: 'left'
                  }}
                  className="hover-effect"
                >
                  <KeyRound size={14} /> Change Password
                </button>
                <div
                  style={{
                    borderBottom: '1px solid var(--glass-border-color)',
                    padding: '6px 14px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '4px'
                    }}
                  >
                    Table Density
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(['compact', 'normal', 'spacious'] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDensity(d)}
                        style={{
                          flex: 1,
                          padding: '5px 4px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '2px',
                          background:
                            density === d ? 'rgba(var(--accent-primary-rgb), 0.1)' : 'transparent',
                          border:
                            density === d
                              ? '1px solid var(--accent-primary)'
                              : '1px solid transparent',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: density === d ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          fontSize: '0.72rem',
                          fontWeight: density === d ? 600 : 400
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: d === 'compact' ? '1px' : d === 'normal' ? '2px' : '3px'
                          }}
                        >
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              style={{
                                display: 'block',
                                width: '3px',
                                height: d === 'compact' ? '6px' : d === 'normal' ? '8px' : '10px',
                                borderRadius: '1px',
                                background:
                                  density === d ? 'var(--accent-primary)' : 'var(--text-secondary)'
                              }}
                            />
                          ))}
                        </div>
                        {d.charAt(0).toUpperCase() + d.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    borderBottom: '1px solid var(--glass-border-color)',
                    padding: '6px 14px'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                      marginBottom: '4px'
                    }}
                  >
                    Theme
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {(
                      [
                        { id: 'dark' as const, icon: <Moon size={13} />, label: 'Dark' },
                        { id: 'light' as const, icon: <Sun size={13} />, label: 'Light' },
                        { id: 'premium' as const, icon: <Crown size={13} />, label: 'Frost' },
                        { id: 'aurora' as const, icon: <Sparkles size={13} />, label: 'Aurora' }
                      ] as const
                    ).map((t) => {
                      const accentMap: Record<string, string> = {
                        premium: '#7c8cf8',
                        aurora: '#7c6cef'
                      }
                      const accent = accentMap[t.id]
                      return (
                        <button
                          key={t.id}
                          onClick={() => {
                            setThemeTo(t.id)
                            setShowUserMenu(false)
                          }}
                          style={{
                            flex: 1,
                            padding: '5px 4px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '2px',
                            background:
                              theme === t.id
                                ? accent
                                  ? `${accent}18`
                                  : 'rgba(var(--accent-primary-rgb), 0.1)'
                                : 'transparent',
                            border:
                              theme === t.id
                                ? accent
                                  ? `1px solid ${accent}50`
                                  : '1px solid var(--accent-primary)'
                                : '1px solid transparent',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color:
                              theme === t.id
                                ? accent || 'var(--accent-primary)'
                                : 'var(--text-secondary)',
                            fontSize: '0.72rem',
                            fontWeight: theme === t.id ? 600 : 400
                          }}
                        >
                          {t.icon}
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div
                  style={{ borderBottom: '1px solid var(--glass-border-color)', padding: '4px 0' }}
                >
                  {(
                    [
                      {
                        icon: <Compass size={14} />,
                        label: 'Features & shortcuts',
                        run: () => navigateTo({ tab: 'features' })
                      },
                      {
                        icon: <Sparkles size={14} />,
                        label: "What's new",
                        run: () => setShowWhatsNew(true)
                      },
                      {
                        icon: <ScrollText size={14} />,
                        label: 'Release history',
                        run: () => setShowChangelog(true)
                      },
                      {
                        icon: <Download size={14} />,
                        label: checkingUpdate ? 'Checking...' : 'Check for updates',
                        run: () => checkForUpdates(true)
                      }
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.label}
                      onClick={() => {
                        m.run()
                        setShowUserMenu(false)
                      }}
                      disabled={m.label === 'Checking...'}
                      style={{
                        width: '100%',
                        padding: '8px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.83rem',
                        textAlign: 'left',
                        fontWeight: 400
                      }}
                      className="hover-effect"
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    logout()
                    setShowUserMenu(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '9px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontSize: '0.83rem',
                    textAlign: 'left'
                  }}
                  className="hover-effect"
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav
            aria-label="Main navigation"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              flex: 1,
              overflowY: 'auto'
            }}
          >
            {navItem('dashboard', <LayoutDashboard size={18} />, 'Dashboard')}
            {navItem('features', <Compass size={18} />, 'Features')}

            {recentItems.length > 0 && (
              <NavGroup
                id="recent"
                label="Recent"
                icon={<RefreshCw size={14} />}
                groupCollapsed={collapsedGroups.has('recent')}
                onToggle={toggleGroup}
                sidebarCollapsed={sc}
              >
                {recentItems.slice(0, 4).map((item) => {
                  const iconMap: Record<string, React.ReactNode> = {
                    vessel: <Anchor size={14} />,
                    entity: <Building2 size={14} />,
                    quotation: <FileText size={14} />,
                    policy: <FileCheck size={14} />
                  }
                  const icon = iconMap[item.itemType] || <FileText size={14} />
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.itemType === 'vessel') {
                          setNavigateToVesselId(item.itemId)
                          setNavigateToVesselSection(undefined)
                          setNavigateBackTab(undefined)
                          setActiveTab('vessels')
                        } else if (item.itemType === 'entity') {
                          setInitialEntityId(item.itemId)
                          setActiveTab('directory')
                        } else if (item.itemType === 'quotation') {
                          setInitialQuotationId(item.itemId)
                          setActiveTab('quotations')
                        } else if (item.itemType === 'policy') {
                          setSelectedPolicyId(item.itemId)
                          setActiveTab('policy-detail')
                        }
                      }}
                      title={
                        item.itemSublabel
                          ? `${item.itemLabel} — ${item.itemSublabel}`
                          : item.itemLabel
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: sc ? '0' : '8px',
                        width: '100%',
                        padding: sc ? '5px 0' : '4px 10px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        fontSize: '0.82rem',
                        textAlign: 'left',
                        overflow: 'hidden',
                        justifyContent: sc ? 'center' : 'flex-start',
                        transition: 'background 0.15s'
                      }}
                      className="hover-effect"
                    >
                      <span style={{ flexShrink: 0, opacity: 0.7 }}>{icon}</span>
                      {!sc && (
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1
                          }}
                        >
                          {item.itemLabel}
                        </span>
                      )}
                    </button>
                  )
                })}
              </NavGroup>
            )}

            <NavGroup
              id="fleet"
              label="Fleet"
              icon={<Ship size={14} />}
              groupCollapsed={collapsedGroups.has('fleet')}
              onToggle={toggleGroup}
              sidebarCollapsed={sc}
            >
              {hasPermission('vessels:view') && navItem('vessels', <Ship size={18} />, 'Vessels')}
              {hasPermission('vessels:view') &&
                navItem('vessel-filter', <SlidersHorizontal size={18} />, 'Vessel Filter')}
              {hasPermission('fleets:view') && navItem('fleets', <Layers size={18} />, 'Fleets')}
            </NavGroup>

            <NavGroup
              id="compliance"
              label="Compliance"
              icon={<ShieldAlert size={14} />}
              groupCollapsed={collapsedGroups.has('compliance')}
              onToggle={toggleGroup}
              sidebarCollapsed={sc}
            >
              {hasPermission('compliance:view') &&
                navItem('compliance', <ShieldAlert size={18} />, 'Compliance Center')}
              {hasPermission('sanctions:search') &&
                navItem('sanctions-search', <Search size={18} />, 'Sanctions Search')}
            </NavGroup>

            <NavGroup
              id="business"
              label="Business"
              icon={<FileText size={14} />}
              groupCollapsed={collapsedGroups.has('business')}
              onToggle={toggleGroup}
              sidebarCollapsed={sc}
            >
              {hasPermission('policies:view') &&
                navItem('renewals', <Calendar size={18} />, 'Renewals')}
              {hasPermission('quotations:view') &&
                navItem('quotations', <FileText size={18} />, 'Quotations')}
              {hasPermission('policies:view') &&
                navItem('policies-list', <FileCheck size={18} />, 'Policies')}
              {hasPermission('policies:view') &&
                navItem('receipts', <Receipt size={18} />, 'Receipts')}
            </NavGroup>

            <NavGroup
              id="operations"
              label="Operations"
              icon={<Layers size={14} />}
              groupCollapsed={collapsedGroups.has('operations')}
              onToggle={toggleGroup}
              sidebarCollapsed={sc}
            >
              {hasPermission('entities:view') &&
                navItem('directory', <BookOpen size={18} />, 'Directory')}
              {hasPermission('surveys:view') &&
                navItem('surveys', <ClipboardList size={18} />, 'Surveys')}
              {hasPermission('surveys:view') &&
                navItem('survey-followup', <FileWarning size={18} />, 'Survey Follow-Up')}
              {navItem('templates', <Mail size={18} />, 'Templates')}
              {navItem('calculators', <Calculator size={18} />, 'Calculators')}
            </NavGroup>

            <NavGroup
              id="reports"
              label="Reports"
              icon={<BarChart2 size={14} />}
              groupCollapsed={collapsedGroups.has('reports')}
              onToggle={toggleGroup}
              sidebarCollapsed={sc}
            >
              {hasPermission('reports:view') &&
                navItem('reports', <FileBarChart2 size={18} />, 'Reports')}
              {hasPermission('analytics:view') &&
                navItem('analytics', <BarChart2 size={18} />, 'Fleet Analytics')}
              {hasPermission('admin:activityLog') &&
                navItem('activity-log', <ScrollText size={18} />, 'Activity Log')}
            </NavGroup>

            <NavGroup
              id="admin"
              label="Admin"
              icon={<Settings size={14} />}
              groupCollapsed={collapsedGroups.has('admin')}
              onToggle={toggleGroup}
              sidebarCollapsed={sc}
            >
              {(hasPermission('admin:settings') || hasPermission('fileManager:view')) &&
                navItem('admin', <Settings size={18} />, 'Settings')}
              {hasPermission('admin:users') &&
                navItem('users', <UserCog size={18} />, 'User Management')}
            </NavGroup>
          </nav>

          {/* Footer: version + collapse toggle */}
          <div
            style={{
              paddingTop: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: sc ? 'center' : 'space-between',
              gap: '4px'
            }}
          >
            {!sc && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.68rem',
                  color: 'var(--text-secondary)',
                  opacity: 0.5
                }}
              >
                v{appVersion}
                {hotBuildNumber > 0 ? `b${hotBuildNumber}` : ''}
                <button
                  onClick={() => setShowChangelog(true)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    cursor: 'pointer',
                    fontSize: '0.63rem',
                    padding: '1px 3px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                  className="hover-effect"
                  title="View Changelog"
                >
                  <RefreshCw size={9} />
                </button>
                <button
                  onClick={() => checkForUpdates(true)}
                  disabled={checkingUpdate}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--accent-primary)',
                    cursor: checkingUpdate ? 'wait' : 'pointer',
                    fontSize: '0.63rem',
                    padding: '1px 3px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px',
                    opacity: checkingUpdate ? 0.5 : 1
                  }}
                  className="hover-effect"
                  title="Check for updates"
                >
                  <Download size={9} />
                </button>
              </div>
            )}
            <button
              onClick={toggleSidebar}
              title={sc ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{
                background: 'transparent',
                border: '1px solid var(--glass-border-color)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                opacity: 0.6
              }}
              className="hover-effect"
            >
              {sc ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </button>
          </div>
        </aside>

        <main id="main-content" className="main-content">
          {hotUpdateAvailable && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                padding: '8px 20px',
                fontSize: '0.82rem',
                background:
                  'linear-gradient(90deg, rgba(var(--accent-primary-rgb), 0.12), rgba(var(--accent-primary-rgb), 0.06))',
                borderBottom: '1px solid rgba(var(--accent-primary-rgb), 0.2)',
                color: 'var(--text-primary)'
              }}
            >
              <span>A new update is ready.</span>
              <button
                className="btn-primary"
                onClick={() => window.api.hotUpdateRestart()}
                style={{ padding: '3px 14px', fontSize: '0.78rem', borderRadius: '6px' }}
              >
                Restart to apply
              </button>
              <button
                onClick={() => setHotUpdateAvailable(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '2px',
                  fontSize: '1rem',
                  lineHeight: 1
                }}
                title="Dismiss"
              >
                &times;
              </button>
            </div>
          )}
          {breadcrumbs.length >= 2 && (
            <nav
              aria-label="Breadcrumb"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 32px 0',
                fontSize: '0.82rem',
                color: 'var(--text-secondary)'
              }}
            >
              {breadcrumbs.map((bc, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {i > 0 && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
                  {bc.onClick ? (
                    <button
                      onClick={bc.onClick}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.82rem',
                        textDecoration: 'none'
                      }}
                      className="hover-effect"
                      onMouseEnter={(e) => {
                        ;(e.target as HTMLElement).style.color = 'var(--accent-primary)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.target as HTMLElement).style.color = 'var(--text-secondary)'
                      }}
                    >
                      {bc.label}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                      {bc.label}
                    </span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {/* Per-page boundary: a crash on one page stays on that page; switching tab resets it */}
          {activeTab === 'dashboard' && !discoverTipSeen && (
            <div className="page" style={{ marginBottom: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'var(--accent-tint)',
                  border: '1px solid var(--accent-border)'
                }}
              >
                <Compass size={20} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <div style={{ flex: 1, fontSize: '0.88rem' }}>
                  <strong>Find anything fast.</strong> Press <kbd className="kbd">Ctrl</kbd>{' '}
                  <kbd className="kbd">K</kbd> and type a vessel, a quotation number, a page or an
                  action like &quot;new quotation&quot;. The <strong>Features</strong> page lists
                  everything the app can do.
                </div>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    dismissDiscoverTip()
                    navigateTo({ tab: 'features' })
                  }}
                >
                  Show features
                </button>
                <button
                  className="btn-ghost btn-icon"
                  title="Dismiss"
                  aria-label="Dismiss tip"
                  onClick={dismissDiscoverTip}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}
          <ErrorBoundary key={activeTab} variant="page">
            {activeTab === 'dashboard' && (
              <Dashboard
                onViewAlerts={() => setActiveTab('compliance')}
                onViewSurveyFollowUp={() => setActiveTab('survey-followup')}
                onNavigateToVessel={(vesselId, section) => {
                  setNavigateToVesselId(vesselId)
                  setNavigateToVesselSection(section)
                  setNavigateBackTab('dashboard')
                  setActiveTab('vessels')
                }}
                onNavigate={(tab) => {
                  if (tab === 'search') {
                    setSearchOpen(true)
                    return
                  }
                  if (tab === 'new-vessel' || tab === 'new-quotation' || tab === 'new-entity') {
                    startCreate(tab.slice(4) as 'vessel' | 'quotation' | 'entity')
                    return
                  }
                  setPageRequest(null)
                  setActiveTab(tab as AppTab)
                }}
              />
            )}
            {activeTab === 'vessels' && (
              <VesselManager
                initialVesselId={navigateToVesselId}
                initialVesselSection={navigateToVesselSection}
                onClearInitialVessel={() => {
                  setNavigateToVesselId(null)
                  setNavigateToVesselSection(undefined)
                }}
                onNavigateBack={
                  navigateBackTab
                    ? () => {
                        setActiveTab(navigateBackTab)
                        setNavigateBackTab(undefined)
                      }
                    : undefined
                }
                navigateBackLabel={
                  navigateBackTab
                    ? (
                        {
                          dashboard: 'Back to Dashboard',
                          surveys: 'Back to Surveys',
                          compliance: 'Back to Compliance',
                          directory: 'Back to Directory',
                          'vessel-filter': 'Back to Vessel Filter',
                          renewals: 'Back to Renewals',
                          admin: 'Back to System Setup',
                          'survey-followup': 'Back to Survey Follow-Up',
                          'policies-list': 'Back to Policies'
                        } as Record<string, string>
                      )[navigateBackTab] || 'Back'
                    : undefined
                }
                onNavigateToQuotation={(qId) => {
                  setInitialQuotationId(qId)
                  setActiveTab('quotations')
                }}
                openCreate={createIntent === 'vessel'}
                onCreateConsumed={() => setCreateIntent(null)}
              />
            )}
            <Suspense fallback={<LoadingFallback />}>
              {activeTab === 'vessel-filter' && (
                <VesselFilter
                  onNavigateToVessel={(vesselId) => {
                    setNavigateToVesselId(vesselId)
                    setNavigateBackTab('vessel-filter')
                    setActiveTab('vessels')
                  }}
                />
              )}
              {activeTab === 'fleets' && <FleetManager {...sub('fleets')} />}
              {activeTab === 'admin' && (
                <AdminPanel
                  isAdmin={isAdmin}
                  {...sub('admin')}
                  onNavigate={navigateTo}
                  onNavigateToVessel={(vesselId) => {
                    setNavigateToVesselId(vesselId)
                    setNavigateBackTab('admin')
                    setActiveTab('vessels')
                  }}
                />
              )}
              {activeTab === 'users' && hasPermission('admin:users') && <UserManager />}
              {activeTab === 'directory' && (
                <Directory
                  {...sub('directory')}
                  onNavigateToVessel={(vesselId) => {
                    setNavigateToVesselId(vesselId)
                    setNavigateBackTab('directory')
                    setActiveTab('vessels')
                  }}
                  initialEntityId={initialEntityId}
                  onInitialEntityConsumed={() => setInitialEntityId(null)}
                  openCreate={createIntent === 'entity'}
                  onCreateConsumed={() => setCreateIntent(null)}
                />
              )}
              {activeTab === 'compliance' &&
                (hasPermission('compliance:view') ? (
                  <ComplianceCenter
                    {...sub('compliance')}
                    initialTab={complianceSubTab}
                    onTabChange={setComplianceSubTab}
                    onNavigateToVessel={(vesselId, section) => {
                      setNavigateToVesselId(vesselId)
                      setNavigateToVesselSection(section || 'policies')
                      setNavigateBackTab('compliance')
                      setActiveTab('vessels')
                    }}
                  />
                ) : (
                  <div
                    style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}
                  >
                    You do not have permission to view this page.
                  </div>
                ))}
            </Suspense>
            {activeTab === 'sanctions-search' &&
              (hasPermission('sanctions:search') ? (
                <Suspense fallback={<LoadingFallback />}>
                  <SanctionsSearch {...sub('sanctions-search')} />
                </Suspense>
              ) : (
                <div
                  style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}
                >
                  You do not have permission to view this page.
                </div>
              ))}
            {activeTab === 'surveys' &&
              (hasPermission('surveys:view') ? (
                <Suspense fallback={<LoadingFallback />}>
                  <ConditionSurveyList
                    onNavigateToVessel={(vesselId) => {
                      setNavigateToVesselId(vesselId)
                      setNavigateToVesselSection('surveys')
                      setNavigateBackTab('surveys')
                      setActiveTab('vessels')
                    }}
                  />
                </Suspense>
              ) : (
                <div
                  style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}
                >
                  You do not have permission to view this page.
                </div>
              ))}
            {activeTab === 'survey-followup' &&
              (hasPermission('surveys:view') ? (
                <Suspense fallback={<LoadingFallback />}>
                  <SurveyFollowUp
                    {...sub('survey-followup')}
                    onNavigateToVessel={(vesselId) => {
                      setNavigateToVesselId(vesselId)
                      setNavigateToVesselSection('policies')
                      setNavigateBackTab('survey-followup')
                      setActiveTab('vessels')
                    }}
                  />
                </Suspense>
              ) : (
                <div
                  style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}
                >
                  You do not have permission to view this page.
                </div>
              ))}
            {activeTab === 'calculators' && (
              <Suspense fallback={<LoadingFallback />}>
                <Calculators {...sub('calculators')} />
              </Suspense>
            )}
            {activeTab === 'receipts' &&
              (hasPermission('policies:view') ? (
                <Suspense fallback={<LoadingFallback />}>
                  <ReceiptManager />
                </Suspense>
              ) : (
                <div
                  style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}
                >
                  You do not have permission to view this page.
                </div>
              ))}
            {activeTab === 'quotations' && (
              <Suspense fallback={<LoadingFallback />}>
                <QuotationManager
                  {...sub('quotations')}
                  onNavigateToPolicy={(policyId) => {
                    setSelectedPolicyId(policyId)
                    setActiveTab('policy-detail')
                  }}
                  onNavigateToPolicySetup={(quotationId) => {
                    setPolicySetupQuotationId(quotationId)
                    setActiveTab('policy-setup')
                  }}
                  initialQuotationId={initialQuotationId}
                  onClearInitialQuotation={() => {
                    setInitialQuotationId(null)
                  }}
                  policyContext={quotationPolicyContext}
                  onClearPolicyContext={() => {
                    setQuotationPolicyContext(null)
                  }}
                  onReturnToPolicy={(policyId) => {
                    setSelectedPolicyId(policyId)
                    setQuotationPolicyContext(null)
                    setInitialQuotationId(null)
                    setActiveTab('policy-detail')
                  }}
                  openCreate={createIntent === 'quotation'}
                  onCreateConsumed={() => setCreateIntent(null)}
                />
              </Suspense>
            )}
            {activeTab === 'renewals' && (
              <Suspense fallback={<LoadingFallback />}>
                <PolicyRenewals
                  onNavigateToVessel={(vesselId) => {
                    setNavigateToVesselId(vesselId)
                    setNavigateToVesselSection('policies')
                    setNavigateBackTab('renewals')
                    setActiveTab('vessels')
                  }}
                  onCreateRenewalQuotation={(qId) => {
                    setInitialQuotationId(qId)
                    setActiveTab('quotations')
                  }}
                />
              </Suspense>
            )}
            {activeTab === 'reports' && (
              <Suspense fallback={<LoadingFallback />}>
                <Reports {...sub('reports')} />
              </Suspense>
            )}
            {activeTab === 'analytics' && (
              <Suspense fallback={<LoadingFallback />}>
                <FleetAnalytics />
              </Suspense>
            )}
            {activeTab === 'templates' && (
              <Suspense fallback={<LoadingFallback />}>
                <TemplatesPage />
              </Suspense>
            )}
            {activeTab === 'features' && (
              <Suspense fallback={<LoadingFallback />}>
                <FeaturesPage onNavigate={navigateTo} />
              </Suspense>
            )}
            {activeTab === 'policies-list' && (
              <Suspense fallback={<LoadingFallback />}>
                <div className="page">
                  <PageHeader
                    icon={<FileCheck size={26} />}
                    title="Policies"
                    subtitle="Insurance policy documents"
                    actions={
                      hasPermission('admin:settings') && (
                        <SegmentedControl
                          value={policyView}
                          onChange={setPolicyView}
                          items={[
                            { key: 'list', label: 'Policies', icon: <List size={15} /> },
                            { key: 'settings', label: 'Settings', icon: <Settings size={15} /> }
                          ]}
                        />
                      )
                    }
                  />
                  {policyView === 'list' && (
                    <PolicyList
                      onSelectPolicy={(id) => {
                        setSelectedPolicyId(id)
                        setActiveTab('policy-detail')
                      }}
                    />
                  )}
                  {policyView === 'settings' && <PolicySettings />}
                </div>
              </Suspense>
            )}
            {activeTab === 'policy-detail' && selectedPolicyId && (
              <Suspense fallback={<LoadingFallback />}>
                <PolicyDetail
                  policyId={selectedPolicyId}
                  onBack={() => {
                    setSelectedPolicyId(null)
                    setActiveTab('policies-list')
                  }}
                  onNavigateToVessel={(vesselId) => {
                    setNavigateToVesselId(vesselId)
                    setNavigateBackTab('policies-list')
                    setActiveTab('vessels')
                  }}
                  onNavigateToQuotation={(
                    quotationId: string,
                    policyCtx?: { policyId: string; policyNumber: string }
                  ) => {
                    setInitialQuotationId(quotationId)
                    if (policyCtx) setQuotationPolicyContext(policyCtx)
                    setActiveTab('quotations')
                  }}
                  onNavigateToPolicy={(newPolicyId: string) => {
                    setSelectedPolicyId(newPolicyId)
                  }}
                />
              </Suspense>
            )}
            {activeTab === 'activity-log' && (
              <Suspense fallback={<LoadingFallback />}>
                <ActivityLog />
              </Suspense>
            )}
            {activeTab === 'notifications' && (
              <Suspense fallback={<LoadingFallback />}>
                <NotificationsPage
                  onNavigate={(linkType, linkId) => {
                    if (linkType === 'vessel') {
                      setNavigateToVesselId(linkId)
                      setNavigateBackTab('notifications')
                      setActiveTab('vessels')
                    } else if (linkType === 'quotation') {
                      setInitialQuotationId(linkId)
                      setActiveTab('quotations')
                    } else if (linkType === 'policy') {
                      setSelectedPolicyId(linkId)
                      setActiveTab('policy-detail')
                    } else if (linkType === 'entity') {
                      setInitialEntityId(linkId)
                      setNavigateBackTab('notifications')
                      setActiveTab('directory')
                    }
                  }}
                />
              </Suspense>
            )}
            {activeTab === 'policy-setup' && policySetupQuotationId && (
              <Suspense fallback={<LoadingFallback />}>
                <PolicySetupWizard
                  quotationId={policySetupQuotationId}
                  onComplete={(policyId) => {
                    setPolicySetupQuotationId(null)
                    setSelectedPolicyId(policyId)
                    setActiveTab('policy-detail')
                  }}
                  onCancel={() => {
                    setPolicySetupQuotationId(null)
                    setActiveTab('quotations')
                  }}
                />
              </Suspense>
            )}
          </ErrorBoundary>
        </main>
        <UpdateNotification />
        <GlobalSearch
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={handleSearchNavigate}
          features={visibleFeatures(hasPermission, !!isAdmin)}
          onFeature={navigateTo}
        />
        {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
        {showWhatsNew && (
          <WhatsNewModal
            onTry={(featureId) => {
              const f = FEATURES.find((x) => x.id === featureId)
              if (f) navigateTo(f.target)
            }}
            onClose={() => {
              if (user && appVersion)
                localStorage.setItem(`whatsNew_seen_v${appVersion}_u${user.id}`, '1')
              setShowWhatsNew(false)
            }}
            onViewChangelog={() => setShowChangelog(true)}
            appVersion={appVersion}
          />
        )}
        {forcePasswordReset && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(12px)'
            }}
          >
            <div
              style={{
                background: isLight ? '#ffffff' : '#1a1d28',
                borderRadius: '20px',
                padding: '40px 44px',
                width: '460px',
                boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
                border: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'}`
              }}
            >
              <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: 16,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background:
                      'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                    marginBottom: '16px'
                  }}
                >
                  <KeyRound size={32} style={{ color: '#ffffff' }} />
                </div>
                <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
                  Change Your Password
                </h2>
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: '0.9rem',
                    marginTop: '10px',
                    lineHeight: 1.5
                  }}
                >
                  For security purposes, please set a new password to continue using the
                  application.
                </p>
              </div>
              {resetError && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255,77,77,0.08)',
                    border: '1px solid rgba(255,77,77,0.2)',
                    color: 'var(--danger)',
                    fontSize: '0.85rem',
                    marginBottom: '20px',
                    textAlign: 'center'
                  }}
                >
                  {resetError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: 500
                    }}
                  >
                    New Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showResetPw ? 'text' : 'password'}
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      style={{
                        width: '100%',
                        padding: '12px 44px 12px 16px',
                        borderRadius: '10px',
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        color: 'var(--input-text)',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box'
                      }}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPw(!showResetPw)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {showResetPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: '6px',
                      fontWeight: 500
                    }}
                  >
                    Confirm Password
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showResetPw ? 'text' : 'password'}
                      value={resetConfirm}
                      onChange={(e) => setResetConfirm(e.target.value)}
                      placeholder="Re-enter your password"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleForceReset()
                      }}
                      style={{
                        width: '100%',
                        padding: '12px 44px 12px 16px',
                        borderRadius: '10px',
                        border: `1px solid ${resetConfirm && resetPassword && resetConfirm !== resetPassword ? 'var(--danger)' : 'var(--input-border)'}`,
                        background: 'var(--input-bg)',
                        color: 'var(--input-text)',
                        fontSize: '0.95rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPw(!showResetPw)}
                      style={{
                        position: 'absolute',
                        right: 8,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                    >
                      {showResetPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {resetConfirm && resetPassword && resetConfirm !== resetPassword && (
                    <span
                      style={{
                        fontSize: '0.78rem',
                        color: 'var(--danger)',
                        marginTop: '4px',
                        display: 'block'
                      }}
                    >
                      Passwords do not match
                    </span>
                  )}
                </div>
                {resetPassword.length > 0 && resetPassword.length < 6 && (
                  <span style={{ fontSize: '0.78rem', color: 'var(--warning)', marginTop: '-8px' }}>
                    Password must be at least 6 characters
                  </span>
                )}
                <button
                  onClick={handleForceReset}
                  disabled={
                    resetLoading ||
                    !resetPassword ||
                    !resetConfirm ||
                    resetPassword.length < 6 ||
                    resetPassword !== resetConfirm
                  }
                  className="btn-primary"
                  style={{
                    padding: '14px',
                    fontSize: '0.95rem',
                    marginTop: '8px',
                    borderRadius: '10px',
                    fontWeight: 600
                  }}
                >
                  {resetLoading ? 'Updating...' : 'Set New Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  )
}

// ── NavGroup ──────────────────────────────────────────────────────────────────

function NavGroup({
  id,
  label,
  icon,
  children,
  groupCollapsed,
  onToggle,
  sidebarCollapsed
}: {
  id: string
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  groupCollapsed: boolean
  onToggle: (id: string) => void
  sidebarCollapsed: boolean
}): React.JSX.Element {
  if (sidebarCollapsed) {
    // Collapsed sidebar: thin separator only — items rendered directly in nav
    return (
      <>
        <div
          style={{
            height: '1px',
            background: 'var(--glass-border)',
            margin: '4px 4px',
            opacity: 0.4
          }}
        />
        {children}
      </>
    )
  }

  return (
    <div>
      <button
        onClick={() => onToggle(id)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          width: '100%',
          padding: '5px 8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: '0.68rem',
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: '0.8px',
          borderRadius: '6px',
          marginTop: '6px'
        }}
        className="hover-effect"
      >
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        {groupCollapsed ? (
          <ChevronRight size={12} style={{ opacity: 0.6 }} />
        ) : (
          <ChevronDown size={12} style={{ opacity: 0.6 }} />
        )}
      </button>
      {!groupCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', paddingLeft: '4px' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ── NavItem ───────────────────────────────────────────────────────────────────

function NavItem({
  icon,
  label,
  active,
  onClick,
  sidebarCollapsed
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  sidebarCollapsed: boolean
}): React.JSX.Element {
  if (sidebarCollapsed) {
    return (
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        title={label}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          padding: '8px',
          border: 'none',
          borderRadius: '8px',
          background: active ? 'rgba(var(--accent-primary-rgb, 0,210,255), 0.15)' : 'transparent',
          color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
          cursor: 'pointer',
          transition: 'var(--transition)',
          fontFamily: 'inherit'
        }}
        className={!active ? 'hover-effect' : ''}
      >
        {icon}
      </button>
    )
  }

  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '7px 10px',
        width: '100%',
        textAlign: 'left',
        fontSize: '0.85rem',
        border: 'none',
        borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
        borderRadius: active ? '0 8px 8px 0' : '8px',
        background: active ? 'rgba(var(--accent-primary-rgb, 0,210,255), 0.1)' : 'transparent',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontWeight: active ? '600' : '400',
        cursor: 'pointer',
        transition: 'var(--transition)',
        fontFamily: 'inherit'
      }}
      className={!active ? 'hover-effect' : ''}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default App
