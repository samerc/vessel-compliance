import React, { useState, useEffect, useRef } from 'react'
import { LayoutDashboard, Ship, Settings, ShieldAlert, LogOut, UserCog, Sun, Moon, Search, Bell, Calculator, BookOpen, ChevronDown, KeyRound, ClipboardList, FileText, SlidersHorizontal, Calendar, RefreshCw } from 'lucide-react'
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
import SanctionsSearch from './components/SanctionsSearch'
import ReminderCenter from './components/ReminderCenter'
import Calculators from './components/Calculators'
import QuotationManager from './components/QuotationManager'
import ConditionSurveyList from './components/ConditionSurveyList'
import VesselFilter from './components/VesselFilter'
import PolicyRenewals from './components/PolicyRenewals'
import { useAuth } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdateNotification } from './components/UpdateNotification'
import ChangelogModal from './components/ChangelogModal'

function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vessels' | 'fleets' | 'admin' | 'directory' | 'compliance' | 'users' | 'sanctions-search' | 'reminders' | 'surveys' | 'calculators' | 'quotations' | 'vessel-filter' | 'renewals'>('dashboard')
  const [dbConnected, setDbConnected] = useState<boolean | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [showProfile, setShowProfile] = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const { isAuthenticated, isAdmin, logout, user } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [navigateToVesselId, setNavigateToVesselId] = useState<string | null>(null)
  const [navigateToVesselSection, setNavigateToVesselSection] = useState<'documents' | 'surveys' | 'policies' | undefined>(undefined)
  const userMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Check initial connection
    window.api.setupCheckConnection().then(setDbConnected)

    // Fetch version
    window.api.updateGetCurrentVersion().then(setAppVersion)

    // Listen for status updates
    window.api.onDbStatus((status) => {
      setDbConnected(status.connected)
    })
  }, [])

  // Store app version for the logged-in user
  useEffect(() => {
    if (isAuthenticated && appVersion) {
      window.api.updateUserAppVersion(appVersion).catch(() => { })
    }
  }, [isAuthenticated, appVersion])

  // Window drag prevention
  useEffect(() => {
    const preventDefault = (e: DragEvent) => {
      e.preventDefault()
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
    }
    window.addEventListener('dragover', preventDefault, false)
    window.addEventListener('drop', preventDefault, false)
    return () => {
      window.removeEventListener('dragover', preventDefault)
      window.removeEventListener('drop', preventDefault)
    }
  }, [])

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showUserMenu])

  if (dbConnected === null) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  if (!dbConnected) {
    return <SetupScreen />
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  // Get user initials for the avatar
  const userInitials = user?.username ? user.username.slice(0, 2).toUpperCase() : '??'

  return (
    <ErrorBoundary>
      <a href="#main-content" className="sr-only">Skip to main content</a>
      <div className="layout-container">
        <aside className="sidebar">
          {/* User menu dropdown */}
          <div ref={userMenuRef} style={{ position: 'relative', paddingBottom: '32px' }}>
            <div
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                transition: 'var(--transition)'
              }}
              className="hover-effect"
              title="User Menu"
            >
              <div style={{
                width: '32px',
                height: '32px',
                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: '700',
                color: '#fff',
                letterSpacing: '0.5px'
              }}>
                {userInitials}
              </div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Vessel Compliance</h2>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{user?.username} ({user?.role})</div>
              </div>
              <ChevronDown size={14} style={{ opacity: 0.5, transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </div>

            {showUserMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: theme === 'light' ? '#ffffff' : '#1e1e28',
                border: theme === 'light' ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                boxShadow: theme === 'light' ? '0 10px 25px rgba(0,0,0,0.15)' : '0 10px 25px rgba(0,0,0,0.5)',
                zIndex: 200,
                overflow: 'hidden',
                marginTop: '4px'
              }}>
                <button
                  onClick={() => { setShowProfile(true); setShowUserMenu(false) }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    textAlign: 'left'
                  }}
                  className="hover-effect"
                >
                  <KeyRound size={16} /> Change Password
                </button>
                <button
                  onClick={() => { toggleTheme(); setShowUserMenu(false) }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--glass-border)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    textAlign: 'left'
                  }}
                  className="hover-effect"
                >
                  {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
                  {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                </button>
                <button
                  onClick={() => { logout(); setShowUserMenu(false) }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--danger)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    textAlign: 'left'
                  }}
                  className="hover-effect"
                >
                  <LogOut size={16} /> Logout
                </button>
              </div>
            )}
          </div>

          <nav aria-label="Main navigation" style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
            <NavItem
              icon={<LayoutDashboard size={20} />}
              label="Dashboard"
              active={activeTab === 'dashboard'}
              onClick={() => setActiveTab('dashboard')}
            />
            <NavItem
              icon={<Ship size={20} />}
              label="Vessels"
              active={activeTab === 'vessels'}
              onClick={() => setActiveTab('vessels')}
            />
            <NavItem
              icon={<SlidersHorizontal size={20} />}
              label="Vessel Filter"
              active={activeTab === 'vessel-filter'}
              onClick={() => setActiveTab('vessel-filter')}
            />
            <NavItem
              icon={<LayoutDashboard size={20} />}
              label="Fleets"
              active={activeTab === 'fleets'}
              onClick={() => setActiveTab('fleets')}
            />
            <NavItem
              icon={<ShieldAlert size={20} />}
              label="Compliance Center"
              active={activeTab === 'compliance'}
              onClick={() => setActiveTab('compliance')}
            />
            <NavItem
              icon={<Calendar size={20} />}
              label="Renewals"
              active={activeTab === 'renewals'}
              onClick={() => setActiveTab('renewals')}
            />
            <NavItem
              icon={<Search size={20} />}
              label="Sanctions Search"
              active={activeTab === 'sanctions-search'}
              onClick={() => setActiveTab('sanctions-search')}
            />
            <NavItem
              icon={<BookOpen size={20} />}
              label="Directory"
              active={activeTab === 'directory'}
              onClick={() => setActiveTab('directory')}
            />
            <NavItem
              icon={<Bell size={20} />}
              label="Reminders"
              active={activeTab === 'reminders'}
              onClick={() => setActiveTab('reminders')}
            />
            <NavItem
              icon={<ClipboardList size={20} />}
              label="Surveys"
              active={activeTab === 'surveys'}
              onClick={() => setActiveTab('surveys')}
            />
            <NavItem
              icon={<Calculator size={20} />}
              label="Calculators"
              active={activeTab === 'calculators'}
              onClick={() => setActiveTab('calculators')}
            />
            <NavItem
              icon={<FileText size={20} />}
              label="Quotations"
              active={activeTab === 'quotations'}
              onClick={() => setActiveTab('quotations')}
            />

            {isAdmin && (
              <>
                <div className="my-2 border-t border-gray-700 opacity-50"></div>
                <NavItem
                  icon={<UserCog size={20} />}
                  label="User Management"
                  active={activeTab === 'users'}
                  onClick={() => setActiveTab('users')}
                />
                <NavItem
                  icon={<Settings size={20} />}
                  label="System Setup"
                  active={activeTab === 'admin'}
                  onClick={() => setActiveTab('admin')}
                />
              </>
            )}
          </nav>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '0.7rem',
            color: 'var(--text-secondary)',
            opacity: 0.5,
            paddingTop: '8px'
          }}>
            v{appVersion}
            <button
              onClick={() => setShowChangelog(true)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--accent-primary)',
                cursor: 'pointer',
                fontSize: '0.65rem',
                padding: '2px 4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '2px'
              }}
              className="hover-effect"
              title="View Changelog"
            >
              <RefreshCw size={10} />
              Changelog
            </button>
          </div>
        </aside>

        <main id="main-content" className="main-content">
          {activeTab === 'dashboard' && <Dashboard onViewAlerts={() => setActiveTab('compliance')} />}
          {activeTab === 'vessels' && <VesselManager initialVesselId={navigateToVesselId} initialVesselSection={navigateToVesselSection} onClearInitialVessel={() => { setNavigateToVesselId(null); setNavigateToVesselSection(undefined) }} />}
          {activeTab === 'vessel-filter' && <VesselFilter onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setActiveTab('vessels') }} />}
          {activeTab === 'fleets' && <FleetManager />}
          {activeTab === 'admin' && isAdmin && <AdminPanel onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setActiveTab('vessels') }} />}
          {activeTab === 'users' && isAdmin && <UserManager />}
          {activeTab === 'directory' && <Directory onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setActiveTab('vessels') }} />}
          {activeTab === 'compliance' && <ComplianceCenter onNavigateToVessel={(vesselId, section) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection(section || 'policies'); setActiveTab('vessels') }} />}
          {activeTab === 'sanctions-search' && <SanctionsSearch />}
          {activeTab === 'reminders' && <ReminderCenter />}
          {activeTab === 'surveys' && <ConditionSurveyList onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection('surveys'); setActiveTab('vessels') }} />}
          {activeTab === 'calculators' && <Calculators />}
          {activeTab === 'quotations' && <QuotationManager />}
          {activeTab === 'renewals' && <PolicyRenewals onNavigateToVessel={(vesselId) => { setNavigateToVesselId(vesselId); setNavigateToVesselSection('policies'); setActiveTab('vessels') }} />}
        </main>
        <UpdateNotification />
        {showProfile && <UserProfileModal onClose={() => setShowProfile(false)} />}
        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
      </div>
    </ErrorBoundary>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '12px',
        cursor: 'pointer',
        background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'var(--transition)',
        border: 'none',
        width: '100%',
        textAlign: 'left',
        fontSize: 'inherit',
        fontFamily: 'inherit'
      }}
      className={!active ? 'hover-effect' : ''}
    >
      {icon}
      <span style={{ fontWeight: active ? '600' : '400' }}>{label}</span>
    </button>
  )
}

export default App
