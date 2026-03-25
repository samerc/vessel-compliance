import React, { lazy, Suspense, useState, useEffect, useRef, useCallback } from 'react'
import { LayoutDashboard, Ship, Settings, ShieldAlert, LogOut, UserCog, Sun, Moon, Search, Bell, Calculator, BookOpen, ChevronDown, ChevronRight, ChevronLeft, KeyRound, ClipboardList, FileText, SlidersHorizontal, Calendar, RefreshCw, Layers, FileWarning, BarChart2, Crown, ScrollText, Mail, FileCheck, List, Anchor, Building2 } from 'lucide-react'
import { useTheme } from './contexts/ThemeContext'
import Dashboard from './components/Dashboard'
import VesselManager from './components/VesselManager'
import AdminPanel from './components/AdminPanel'
import FleetManager from './components/FleetManager'
import Directory from './components/Directory'
import ComplianceCenter from './components/ComplianceCenter'
import UserManager from './components/UserManager'
import { SetupScreen } from './components/SetupScreen'
import { LoginScreen } from './components/LoginScreen'
import UserProfileModal from './components/UserProfileModal'
import VesselFilter from './components/VesselFilter'
import { useAuth } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateNotification } from './components/UpdateNotification'
import ChangelogModal from './components/ChangelogModal'
import WhatsNewModal from './components/WhatsNewModal'
import GlobalSearch from './components/GlobalSearch'
import type { RecentItem } from '../../shared/types'

// Heavy components — lazy loaded to reduce initial bundle size
const SanctionsSearch = lazy(() => import('./components/SanctionsSearch'))
const ReminderCenter = lazy(() => import('./components/ReminderCenter'))
const Calculators = lazy(() => import('./components/Calculators'))
const QuotationManager = lazy(() => import('./components/QuotationManager'))
const ConditionSurveyList = lazy(() => import('./components/ConditionSurveyList'))
const SurveyFollowUp = lazy(() => import('./components/SurveyFollowUp'))
const PolicyRenewals = lazy(() => import('./components/PolicyRenewals'))
const Reports = lazy(() => import('./components/Reports'))
const FleetAnalytics = lazy(() => import('./components/FleetAnalytics'))
const ActivityLog = lazy(() => import('./components/ActivityLog'))
const EmailTemplates = lazy(() => import('./components/EmailTemplates'))
const PolicyList = lazy(() => import('./components/PolicyList'))
const PolicyDetail = lazy(() => import('./components/PolicyDetail'))
const PolicySettings = lazy(() => import('./components/PolicySettings'))
const PolicySetupWizard = lazy(() => import('./components/PolicySetupWizard'))
const NotificationsPage = lazy(() => import('./components/NotificationsPage'))

const LoadingFallback = () => (
  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
    Loading...
  </div>
)

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vessels' | 'fleets' | 'admin' | 'directory' | 'compliance' | 'users' | 'sanctions-search' | 'reminders' | 'surveys' | 'survey-followup' | 'calculators' | 'quotations' | 'vessel-filter' | 'renewals' | 'reports' | 'analytics' | 'activity-log' | 'email-templates' | 'policies-list' | 'policy-detail' | 'policy-setup' | 'notifications'>('dashboard')
  const [dbConnected, setDbConnected] = useState<boolean | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [showProfile, setShowProfile] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { isAuthenticated, isAdmin, logout, user, hasPermission } = useAuth()
  const { theme, setThemeTo } = useTheme()
  const [navigateToVesselId, setNavigateToVesselId] = useState<string | null>(null)
  const [navigateToVesselSection, setNavigateToVesselSection] = useState<'documents' | 'assureds' | 'surveys' | 'policies' | 'history' | 'timeline' | undefined>(undefined)
  const [navigateBackTab, setNavigateBackTab] = useState<string | undefined>(undefined)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [initialQuotationId, setInitialQuotationId] = useState<string | null>(null)
  const [initialEntityId, setInitialEntityId] = useState<string | null>(null)
  const [quotationPolicyContext, setQuotationPolicyContext] = useState<{ policyId: string; policyNumber: string } | null>(null)
  const [policyView, setPolicyView] = useState<'list' | 'settings'>('list')
  const [policySetupQuotationId, setPolicySetupQuotationId] = useState<string | null>(null)
  const [breadcrumbVesselName, setBreadcrumbVesselName] = useState<string | null>(null)
  const [breadcrumbQuotationRef, setBreadcrumbQuotationRef] = useState<string | null>(null)
  const [breadcrumbPolicyRef, setBreadcrumbPolicyRef] = useState<string | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set<string>(['recent']))
  const [unreadNotifCount, setUnreadNotifCount] = useState(0)
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [searchOpen, setSearchOpen] = useState(false)

  // Resolve breadcrumb vessel name when navigating
  useEffect(() => {
    if (navigateToVesselId && activeTab === 'vessels') {
      window.api.getVessels().then(vessels => {
        const v = vessels.find((v: any) => v.id === navigateToVesselId)
        if (v) setBreadcrumbVesselName(v.name)
      }).catch(() => {})
    } else if (activeTab !== 'vessels') {
      setBreadcrumbVesselName(null)
    }
  }, [navigateToVesselId, activeTab])

  // Clear breadcrumb context on top-level tab change
  useEffect(() => {
    if (!navigateToVesselId && activeTab === 'vessels') setBreadcrumbVesselName(null)
    if (!initialQuotationId && activeTab === 'quotations') setBreadcrumbQuotationRef(null)
    if (!selectedPolicyId && activeTab !== 'policy-detail') setBreadcrumbPolicyRef(null)
  }, [activeTab, navigateToVesselId, initialQuotationId, selectedPolicyId])

  // Ctrl+K global search shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleSearchNavigate = useCallback((type: string, id: string, _extra?: any) => {
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
    }
  }, [])

  // Restore sidebar state from DB when user session loads
  useEffect(() => {
    if (user) {
      setSidebarCollapsed(!!user.sidebarCollapsed)
      try {
        const groups = user.collapsedGroups ? JSON.parse(user.collapsedGroups) : []
        setCollapsedGroups(new Set(groups))
      } catch { setCollapsedGroups(new Set()) }
    }
  }, [user?.id])

  const saveSidebarState = (collapsed: boolean, groups: Set<string>) => {
    window.api.updateUserSidebarState(collapsed, JSON.stringify([...groups])).catch(() => { })
  }

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => {
      const next = !prev
      saveSidebarState(next, collapsedGroups)
      return next
    })
  }

  const toggleGroup = (id: string) => {
    setCollapsedGroups(prev => {
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
    window.api.onDbStatus((status) => { setDbConnected(status.connected) })
  }, [])

  useEffect(() => {
    if (isAuthenticated && appVersion) {
      window.api.updateUserAppVersion(appVersion).catch(() => { })
    }
  }, [isAuthenticated, appVersion])

  // Show What's New once per version per user (700ms delay so Dashboard is visible first)
  useEffect(() => {
    if (!isAuthenticated || !appVersion || !user) return
    const key = `whatsNew_seen_v${appVersion}_u${user.id}`
    if (!localStorage.getItem(key)) {
      const timer = setTimeout(() => setShowWhatsNew(true), 700)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isAuthenticated, appVersion, user?.id])

  // Poll for unread notification count every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) { setUnreadNotifCount(0); return }
    const fetchCount = () => {
      window.api.notificationsGetUnreadCount().then(c => {
        if (typeof c === 'number') setUnreadNotifCount(c)
      }).catch(() => {})
    }
    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  // Load recent items
  const loadRecentItems = useCallback(() => {
    if (!isAuthenticated) { setRecentItems([]); return }
    window.api.recentItemsGet().then(items => {
      if (Array.isArray(items)) setRecentItems(items)
    }).catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    loadRecentItems()
  }, [loadRecentItems])

  // Listen for recent-item-added custom event from child components
  useEffect(() => {
    const handler = () => loadRecentItems()
    window.addEventListener('recent-item-added', handler)
    return () => window.removeEventListener('recent-item-added', handler)
  }, [loadRecentItems])

  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
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
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  if (dbConnected === null) return <div className="flex h-screen items-center justify-center">Loading...</div>
  if (!dbConnected) return <SetupScreen />
  if (!isAuthenticated) return <LoginScreen />

  const userInitials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??'
  const sc = sidebarCollapsed

  const menuBg = theme === 'light' ? '#ffffff' : '#1e1e28'
  const menuBorder = theme === 'light' ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.15)'
  const menuShadow = theme === 'light' ? '0 10px 25px rgba(0,0,0,0.15)' : '0 10px 25px rgba(0,0,0,0.5)'

  const navItem = (tab: typeof activeTab, icon: React.ReactNode, label: string) => (
    <NavItem
      key={tab}
      icon={icon}
      label={label}
      active={activeTab === tab}
      onClick={() => setActiveTab(tab)}
      sidebarCollapsed={sc}
    />
  )

  // Derive breadcrumbs from current state
  const breadcrumbs: { label: string; onClick?: () => void }[] = []
  const TAB_LABELS: Record<string, string> = {
    dashboard: 'Dashboard', vessels: 'Vessels', fleets: 'Fleets', admin: 'Settings',
    directory: 'Directory', compliance: 'Compliance', users: 'Users',
    'sanctions-search': 'Sanctions Search', reminders: 'Reminders', surveys: 'Surveys',
    'survey-followup': 'Survey Follow-Up', calculators: 'Calculators',
    quotations: 'Quotations', 'vessel-filter': 'Vessel Filter', renewals: 'Renewals',
    reports: 'Reports', analytics: 'Fleet Analytics', 'activity-log': 'Activity Log',
    'email-templates': 'Email Templates', 'policies-list': 'Policies',
    'policy-detail': 'Policies', notifications: 'Notifications', 'policy-setup': 'Policy Setup'
  }

  if (activeTab === 'vessels' && navigateToVesselId && breadcrumbVesselName) {
    if (navigateBackTab) {
      breadcrumbs.push({
        label: TAB_LABELS[navigateBackTab] || navigateBackTab,
        onClick: () => { setActiveTab(navigateBackTab as any); setNavigateBackTab(undefined); setNavigateToVesselId(null); setNavigateToVesselSection(undefined) }
      })
    } else {
      breadcrumbs.push({ label: 'Vessels', onClick: () => { setNavigateToVesselId(null); setNavigateToVesselSection(undefined) } })
    }
    breadcrumbs.push({ label: breadcrumbVesselName })
  } else if (activeTab === 'policy-detail' && selectedPolicyId) {
    breadcrumbs.push({ label: 'Policies', onClick: () => { setSelectedPolicyId(null); setActiveTab('policies-list') } })
    if (breadcrumbPolicyRef) breadcrumbs.push({ label: breadcrumbPolicyRef })
    else breadcrumbs.push({ label: 'Policy Detail' })
  } else if (activeTab === 'quotations' && initialQuotationId) {
    breadcrumbs.push({ label: 'Quotations', onClick: () => { setInitialQuotationId(null) } })
    if (breadcrumbQuotationRef) breadcrumbs.push({ label: breadcrumbQuotationRef })
    else breadcrumbs.push({ label: 'Editor' })
  }

  return (
    <ErrorBoundary>
      <a href="#main-content" className="sr-only">Skip to main content</a>
      <div className="layout-container">
        <aside
          className="sidebar"
          style={{
            width: sc ? '64px' : '240px',
            minWidth: sc ? '64px' : '240px',
            padding: sc ? '16px 8px' : '20px 12px',
            transition: 'width 0.22s ease, min-width 0.22s ease, padding 0.22s ease',
            overflow: showUserMenu ? 'visible' : 'hidden',
          }}
        >
          {/* User header */}
          <div ref={userMenuRef} style={{ position: 'relative', paddingBottom: '16px' }}>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', transition: 'var(--transition)', overflow: 'hidden' }}
              className="hover-effect"
              title={sc ? `${user?.username} (${user?.role})` : 'User Menu'}
            >
              <div style={{
                width: '32px', height: '32px', flexShrink: 0,
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: '700', color: '#fff', letterSpacing: '0.5px',
              }}>
                {userInitials}
              </div>
              {!sc && <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.05rem', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Vessel Compliance</h2>
                  <div style={{ fontSize: '0.73rem', opacity: 0.7, whiteSpace: 'nowrap' }}>{user?.username} ({user?.role})</div>
                </div>
                <ChevronDown size={13} style={{ opacity: 0.5, flexShrink: 0, transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </>}
            </div>

            {/* Search + Notification Bell */}
            <div style={{ display: 'flex', justifyContent: sc ? 'center' : 'flex-end', marginTop: '6px', gap: '2px' }}>
              <button
                onClick={(e) => { e.stopPropagation(); setSearchOpen(true) }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                className="hover-effect"
                title="Search (Ctrl+K)"
              >
                <Search size={16} />
                {!sc && <span style={{ fontSize: '0.78rem' }}>Search</span>}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab('notifications') }}
                style={{
                  position: 'relative',
                  background: activeTab === 'notifications' ? (theme === 'light' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)') : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: activeTab === 'notifications' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  padding: '6px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                className="hover-effect"
                title="Notifications"
              >
                <Bell size={16} />
                {!sc && <span style={{ fontSize: '0.78rem' }}>Notifications</span>}
                {unreadNotifCount > 0 && (
                  <span style={{
                    position: sc ? 'absolute' : 'static',
                    top: sc ? '-2px' : undefined,
                    right: sc ? '-2px' : undefined,
                    background: 'var(--danger)',
                    color: '#fff',
                    borderRadius: '10px',
                    padding: '0 5px',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    minWidth: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}>
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>
            </div>

            {showUserMenu && (
              <div style={{
                position: 'absolute',
                ...(sc
                  ? { top: 0, left: 'calc(100% + 8px)', right: 'auto' }
                  : { top: '100%', left: 0, right: 0, marginTop: '4px' }
                ),
                background: menuBg, border: menuBorder, borderRadius: '8px',
                boxShadow: menuShadow, zIndex: 200, overflow: 'hidden',
                minWidth: '160px',
              }}>
                <button onClick={() => { setShowProfile(true); setShowUserMenu(false) }} style={{ width: '100%', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--glass-border)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.83rem', textAlign: 'left' }} className="hover-effect">
                  <KeyRound size={14} /> Change Password
                </button>
                <div style={{ borderBottom: '1px solid var(--glass-border)', padding: '6px 14px' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Theme</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {([
                      { id: 'dark' as const, icon: <Moon size={13} />, label: 'Dark' },
                      { id: 'light' as const, icon: <Sun size={13} />, label: 'Light' },
                      { id: 'premium' as const, icon: <Crown size={13} />, label: 'Frost' }
                    ] as const).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setThemeTo(t.id); setShowUserMenu(false) }}
                        style={{
                          flex: 1, padding: '5px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                          background: theme === t.id ? (t.id === 'premium' ? 'rgba(124,140,248,0.12)' : 'rgba(0,210,255,0.1)') : 'transparent',
                          border: theme === t.id ? (t.id === 'premium' ? '1px solid rgba(124,140,248,0.3)' : '1px solid var(--accent-primary)') : '1px solid transparent',
                          borderRadius: '6px', cursor: 'pointer',
                          color: theme === t.id ? (t.id === 'premium' ? '#7c8cf8' : 'var(--accent-primary)') : 'var(--text-secondary)',
                          fontSize: '0.72rem', fontWeight: theme === t.id ? 600 : 400
                        }}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => { logout(); setShowUserMenu(false) }} style={{ width: '100%', padding: '9px 14px', display: 'flex', alignItems: 'center', gap: '10px', background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.83rem', textAlign: 'left' }} className="hover-effect">
                  <LogOut size={14} /> Logout
                </button>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, overflowY: 'auto' }}>
            {navItem('dashboard', <LayoutDashboard size={18} />, 'Dashboard')}

            {recentItems.length > 0 && (
              <NavGroup id="recent" label="Recent" icon={<RefreshCw size={14} />}
                groupCollapsed={collapsedGroups.has('recent')} onToggle={toggleGroup} sidebarCollapsed={sc}
              >
                {recentItems.slice(0, 8).map(item => {
                  const iconMap: Record<string, React.ReactNode> = {
                    vessel: <Anchor size={14} />,
                    entity: <Building2 size={14} />,
                    quotation: <FileText size={14} />,
                    policy: <FileCheck size={14} />,
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
                          setActiveTab('directory')
                        } else if (item.itemType === 'quotation') {
                          setInitialQuotationId(item.itemId)
                          setActiveTab('quotations')
                        } else if (item.itemType === 'policy') {
                          setSelectedPolicyId(item.itemId)
                          setActiveTab('policy-detail')
                        }
                      }}
                      title={item.itemSublabel ? `${item.itemLabel} — ${item.itemSublabel}` : item.itemLabel}
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
                        transition: 'background 0.15s',
                      }}
                      className="hover-effect"
                    >
                      <span style={{ flexShrink: 0, opacity: 0.7 }}>{icon}</span>
                      {!sc && (
                        <span style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          flex: 1,
                        }}>
                          {item.itemLabel}
                        </span>
                      )}
                    </button>
                  )
                })}
              </NavGroup>
            )}

            <NavGroup id="fleet" label="Fleet" icon={<Ship size={14} />}
              groupCollapsed={collapsedGroups.has('fleet')} onToggle={toggleGroup} sidebarCollapsed={sc}
            >
              {hasPermission('vessels:view') && navItem('vessels', <Ship size={18} />, 'Vessels')}
              {hasPermission('vessels:view') && navItem('vessel-filter', <SlidersHorizontal size={18} />, 'Vessel Filter')}
              {hasPermission('fleets:view') && navItem('fleets', <LayoutDashboard size={18} />, 'Fleets')}
              {hasPermission('analytics:view') && navItem('analytics', <BarChart2 size={18} />, 'Fleet Analytics')}
            </NavGroup>

            <NavGroup id="compliance" label="Compliance" icon={<ShieldAlert size={14} />}
              groupCollapsed={collapsedGroups.has('compliance')} onToggle={toggleGroup} sidebarCollapsed={sc}
            >
              {hasPermission('compliance:view') && navItem('compliance', <ShieldAlert size={18} />, 'Compliance Center')}
              {hasPermission('policies:view') && navItem('renewals', <Calendar size={18} />, 'Renewals')}
              {hasPermission('sanctions:search') && navItem('sanctions-search', <Search size={18} />, 'Sanctions Search')}
              {hasPermission('reminders:view') && navItem('reminders', <Bell size={18} />, 'Reminders')}
            </NavGroup>

            <NavGroup id="operations" label="Operations" icon={<Layers size={14} />}
              groupCollapsed={collapsedGroups.has('operations')} onToggle={toggleGroup} sidebarCollapsed={sc}
            >
              {hasPermission('entities:view') && navItem('directory', <BookOpen size={18} />, 'Directory')}
              {hasPermission('surveys:view') && navItem('surveys', <ClipboardList size={18} />, 'Surveys')}
              {hasPermission('surveys:view') && navItem('survey-followup', <FileWarning size={18} />, 'Survey Follow-Up')}
              {navItem('calculators', <Calculator size={18} />, 'Calculators')}
              {hasPermission('quotations:view') && navItem('quotations', <FileText size={18} />, 'Quotations')}
              {hasPermission('policies:view') && navItem('policies-list', <FileCheck size={18} />, 'Policies')}
              {hasPermission('email:view') && navItem('email-templates', <Mail size={18} />, 'Email Templates')}
              {hasPermission('reports:view') && navItem('reports', <ClipboardList size={18} />, 'Reports')}
            </NavGroup>

            <>
              <div style={{ height: '1px', background: 'var(--glass-border)', margin: '6px 4px', opacity: 0.5 }} />
              {hasPermission('admin:settings') && navItem('admin', <Settings size={18} />, 'Settings')}
              {hasPermission('admin:users') && navItem('users', <UserCog size={18} />, 'User Management')}
              {hasPermission('admin:activityLog') && navItem('activity-log', <ScrollText size={18} />, 'Activity Log')}
            </>
          </nav>

          {/* Footer: version + collapse toggle */}
          <div style={{ paddingTop: '8px', display: 'flex', alignItems: 'center', justifyContent: sc ? 'center' : 'space-between', gap: '4px' }}>
            {!sc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', color: 'var(--text-secondary)', opacity: 0.5 }}>
                v{appVersion}
                <button onClick={() => setShowChangelog(true)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.63rem', padding: '1px 3px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '2px' }} className="hover-effect" title="View Changelog">
                  <RefreshCw size={9} /> Changelog
                </button>
              </div>
            )}
            <button
              onClick={toggleSidebar}
              title={sc ? 'Expand sidebar' : 'Collapse sidebar'}
              style={{ background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: 0.6 }}
              className="hover-effect"
            >
              {sc ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
            </button>
          </div>
        </aside>

        <main id="main-content" className="main-content">
          {breadcrumbs.length >= 2 && (
            <nav aria-label="Breadcrumb" style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 32px 0', fontSize: '0.82rem',
              color: 'var(--text-secondary)'
            }}>
              {breadcrumbs.map((bc, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {i > 0 && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
                  {bc.onClick ? (
                    <button
                      onClick={bc.onClick}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        color: 'var(--text-secondary)', cursor: 'pointer',
                        fontSize: '0.82rem', textDecoration: 'none'
                      }}
                      className="hover-effect"
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--accent-primary)' }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-secondary)' }}
                    >
                      {bc.label}
                    </button>
                  ) : (
                    <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{bc.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {activeTab === 'dashboard' && <Dashboard onViewAlerts={() => setActiveTab('compliance')} onViewSurveyFollowUp={() => setActiveTab('survey-followup')} onNavigateToVessel={(vesselId, section) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection(section); setNavigateBackTab('dashboard'); setActiveTab('vessels') }} onNavigate={(tab) => setActiveTab(tab as any)} />}
          {activeTab === 'vessels' && <VesselManager
            initialVesselId={navigateToVesselId}
            initialVesselSection={navigateToVesselSection}
            onClearInitialVessel={() => { setNavigateToVesselId(null); setNavigateToVesselSection(undefined) }}
            onNavigateBack={navigateBackTab ? () => { setActiveTab(navigateBackTab as any); setNavigateBackTab(undefined) } : undefined}
            navigateBackLabel={navigateBackTab ? ({
              'dashboard': 'Back to Dashboard',
              'surveys': 'Back to Surveys',
              'compliance': 'Back to Compliance',
              'directory': 'Back to Directory',
              'vessel-filter': 'Back to Vessel Filter',
              'renewals': 'Back to Renewals',
              'admin': 'Back to System Setup',
              'reminders': 'Back to Reminders',
              'survey-followup': 'Back to Survey Follow-Up',
              'policies-list': 'Back to Policies',
            } as Record<string, string>)[navigateBackTab] || 'Back' : undefined}
          />}
          {activeTab === 'vessel-filter' && <VesselFilter onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateBackTab('vessel-filter'); setActiveTab('vessels') }} />}
          {activeTab === 'fleets' && <FleetManager />}
          {activeTab === 'admin' && <AdminPanel isAdmin={isAdmin} onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateBackTab('admin'); setActiveTab('vessels') }} />}
          {activeTab === 'users' && isAdmin && <UserManager />}
          {activeTab === 'directory' && <Directory onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateBackTab('directory'); setActiveTab('vessels') }} initialEntityId={initialEntityId} onInitialEntityConsumed={() => setInitialEntityId(null)} />}
          {activeTab === 'compliance' && (hasPermission('compliance:view') ? <ComplianceCenter onNavigateToVessel={(vesselId, section) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection(section || 'policies'); setNavigateBackTab('compliance'); setActiveTab('vessels') }} /> : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>You do not have permission to view this page.</div>)}
          {activeTab === 'sanctions-search' && (hasPermission('sanctions:search') ? <Suspense fallback={<LoadingFallback />}><SanctionsSearch /></Suspense> : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>You do not have permission to view this page.</div>)}
          {activeTab === 'reminders' && <Suspense fallback={<LoadingFallback />}><ReminderCenter onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection('documents'); setNavigateBackTab('reminders'); setActiveTab('vessels') }} /></Suspense>}
          {activeTab === 'surveys' && (hasPermission('surveys:view') ? <Suspense fallback={<LoadingFallback />}><ConditionSurveyList onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection('surveys'); setNavigateBackTab('surveys'); setActiveTab('vessels') }} /></Suspense> : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>You do not have permission to view this page.</div>)}
          {activeTab === 'survey-followup' && (hasPermission('surveys:view') ? <Suspense fallback={<LoadingFallback />}><SurveyFollowUp onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection('policies'); setNavigateBackTab('survey-followup'); setActiveTab('vessels') }} /></Suspense> : <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>You do not have permission to view this page.</div>)}
          {activeTab === 'calculators' && <Suspense fallback={<LoadingFallback />}><Calculators /></Suspense>}
          {activeTab === 'quotations' && <Suspense fallback={<LoadingFallback />}><QuotationManager
            onNavigateToPolicy={(policyId) => { setSelectedPolicyId(policyId); setActiveTab('policy-detail') }}
            onNavigateToPolicySetup={(quotationId) => { setPolicySetupQuotationId(quotationId); setActiveTab('policy-setup') }}
            initialQuotationId={initialQuotationId}
            onClearInitialQuotation={() => { setInitialQuotationId(null) }}
            policyContext={quotationPolicyContext}
            onClearPolicyContext={() => { setQuotationPolicyContext(null) }}
            onReturnToPolicy={(policyId) => { setSelectedPolicyId(policyId); setQuotationPolicyContext(null); setInitialQuotationId(null); setActiveTab('policy-detail') }}
          /></Suspense>}
          {activeTab === 'renewals' && <Suspense fallback={<LoadingFallback />}><PolicyRenewals onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection('policies'); setNavigateBackTab('renewals'); setActiveTab('vessels') }} /></Suspense>}
          {activeTab === 'reports' && <Suspense fallback={<LoadingFallback />}><Reports /></Suspense>}
          {activeTab === 'analytics' && <Suspense fallback={<LoadingFallback />}><FleetAnalytics /></Suspense>}
          {activeTab === 'email-templates' && <Suspense fallback={<LoadingFallback />}><EmailTemplates /></Suspense>}
          {activeTab === 'policies-list' && <Suspense fallback={<LoadingFallback />}>
            <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <div>
                  <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                    <FileCheck size={28} /> Policies
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Insurance policy documents</p>
                </div>
                {hasPermission('admin:settings') && (
                  <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', borderRadius: '10px', padding: '4px', border: '1px solid var(--glass-border)' }}>
                    <button
                      onClick={() => setPolicyView('list')}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                        fontWeight: policyView === 'list' ? '600' : '400',
                        background: policyView === 'list' ? 'var(--accent-primary)' : 'transparent',
                        color: policyView === 'list' ? '#fff' : 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                      }}
                    >
                      <List size={16} /> Policies
                    </button>
                    <button
                      onClick={() => setPolicyView('settings')}
                      style={{
                        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '0.85rem',
                        fontWeight: policyView === 'settings' ? '600' : '400',
                        background: policyView === 'settings' ? 'var(--accent-primary)' : 'transparent',
                        color: policyView === 'settings' ? '#fff' : 'var(--text-secondary)',
                        display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                      }}
                    >
                      <Settings size={16} /> Settings
                    </button>
                  </div>
                )}
              </div>
              {policyView === 'list' && <PolicyList onSelectPolicy={(id) => { setSelectedPolicyId(id); setActiveTab('policy-detail') }} />}
              {policyView === 'settings' && <PolicySettings />}
            </div>
          </Suspense>}
          {activeTab === 'policy-detail' && selectedPolicyId && <Suspense fallback={<LoadingFallback />}>
            <PolicyDetail
              policyId={selectedPolicyId}
              onBack={() => { setSelectedPolicyId(null); setActiveTab('policies-list') }}
              onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateBackTab('policies-list'); setActiveTab('vessels') }}
              onNavigateToQuotation={(quotationId: string, policyCtx?: { policyId: string; policyNumber: string }) => {
                setInitialQuotationId(quotationId)
                if (policyCtx) setQuotationPolicyContext(policyCtx)
                setActiveTab('quotations')
              }}
              onNavigateToPolicy={(newPolicyId: string) => { setSelectedPolicyId(newPolicyId) }}
            />
          </Suspense>}
          {activeTab === 'activity-log' && <Suspense fallback={<LoadingFallback />}><ActivityLog /></Suspense>}
          {activeTab === 'notifications' && <Suspense fallback={<LoadingFallback />}>
            <NotificationsPage onNavigate={(linkType, linkId) => {
              if (linkType === 'vessel') { setNavigateToVesselId(linkId); setNavigateBackTab('notifications'); setActiveTab('vessels') }
              else if (linkType === 'quotation') { setInitialQuotationId(linkId); setActiveTab('quotations') }
              else if (linkType === 'policy') { setSelectedPolicyId(linkId); setActiveTab('policy-detail') }
              else if (linkType === 'entity') { setNavigateBackTab('notifications'); setActiveTab('directory') }
            }} />
          </Suspense>}
          {activeTab === 'policy-setup' && policySetupQuotationId && <Suspense fallback={<LoadingFallback />}>
            <PolicySetupWizard
              quotationId={policySetupQuotationId}
              onComplete={(policyId) => { setPolicySetupQuotationId(null); setSelectedPolicyId(policyId); setActiveTab('policy-detail') }}
              onCancel={() => { setPolicySetupQuotationId(null); setActiveTab('quotations') }}
            />
          </Suspense>}
        </main>
        <UpdateNotification />
        <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} onNavigate={handleSearchNavigate} />
        {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
        {showWhatsNew && (
          <WhatsNewModal
            onClose={() => {
              if (user && appVersion) localStorage.setItem(`whatsNew_seen_v${appVersion}_u${user.id}`, '1')
              setShowWhatsNew(false)
            }}
            onViewChangelog={() => setShowChangelog(true)}
          />
        )}
      </div>
    </ErrorBoundary>
  )
}

// ── NavGroup ──────────────────────────────────────────────────────────────────

function NavGroup({
  id, label, icon, children, groupCollapsed, onToggle, sidebarCollapsed,
}: {
  id: string
  label: string
  icon: React.ReactNode
  children: React.ReactNode
  groupCollapsed: boolean
  onToggle: (id: string) => void
  sidebarCollapsed: boolean
}) {
  if (sidebarCollapsed) {
    // Collapsed sidebar: thin separator only — items rendered directly in nav
    return (
      <>
        <div style={{ height: '1px', background: 'var(--glass-border)', margin: '4px 4px', opacity: 0.4 }} />
        {children}
      </>
    )
  }

  return (
    <div>
      <button
        onClick={() => onToggle(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          width: '100%', padding: '5px 8px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-secondary)', fontSize: '0.68rem', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          borderRadius: '6px', marginTop: '6px',
        }}
        className="hover-effect"
      >
        {icon}
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        {groupCollapsed
          ? <ChevronRight size={12} style={{ opacity: 0.6 }} />
          : <ChevronDown size={12} style={{ opacity: 0.6 }} />
        }
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
  icon, label, active, onClick, sidebarCollapsed,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  sidebarCollapsed: boolean
}) {
  if (sidebarCollapsed) {
    return (
      <button
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        title={label}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', padding: '8px', border: 'none', borderRadius: '8px',
          background: active ? 'rgba(var(--accent-primary-rgb, 0,210,255), 0.15)' : 'transparent',
          color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
          cursor: 'pointer', transition: 'var(--transition)', fontFamily: 'inherit',
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
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '7px 10px', width: '100%', textAlign: 'left', fontSize: '0.85rem',
        border: 'none',
        borderLeft: active ? '3px solid var(--accent-primary)' : '3px solid transparent',
        borderRadius: active ? '0 8px 8px 0' : '8px',
        background: active ? 'rgba(var(--accent-primary-rgb, 0,210,255), 0.1)' : 'transparent',
        color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
        fontWeight: active ? '600' : '400',
        cursor: 'pointer', transition: 'var(--transition)', fontFamily: 'inherit',
      }}
      className={!active ? 'hover-effect' : ''}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default App
