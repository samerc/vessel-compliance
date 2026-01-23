import React, { useState, useEffect } from 'react'
import { LayoutDashboard, Ship, Settings, Users, ShieldAlert, LogOut, UserCog, Sun, Moon } from 'lucide-react'
import { useTheme } from './contexts/ThemeContext'
import Dashboard from './components/Dashboard'
import VesselManager from './components/VesselManager'
import AdminPanel from './components/AdminPanel'
import FleetManager from './components/FleetManager'
import EntityDirectory from './components/EntityDirectory'
import ComplianceCenter from './components/ComplianceCenter'
import UserManager from './components/UserManager'
import { SetupScreen } from './components/SetupScreen'
import { LoginScreen } from './components/LoginScreen'
import { AuthProvider, useAuth } from './contexts/AuthContext'

function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

function AppContent(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'vessels' | 'fleets' | 'admin' | 'entities' | 'compliance' | 'users'>('dashboard')
  const [dbConnected, setDbConnected] = useState<boolean | null>(null)
  const [configPath, setConfigPath] = useState<string | null>(null)
  const { isAuthenticated, isAdmin, logout, user } = useAuth()
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    // Check initial connection
    window.api.setupCheckConnection().then(setDbConnected)
    window.api.setupGetConfigPath().then(setConfigPath)

    // Listen for status updates
    window.api.onDbStatus((status) => {
      setDbConnected(status.connected)
      if (status.connected) {
        window.api.setupGetConfigPath().then(setConfigPath)
      }
    })
  }, [])

  const handleConfigChange = async () => {
    const dir = await window.api.setupSelectDirectory()
    if (dir) {
      const result = await window.api.setupLoadConfigFromDir(dir)
      if (result.success) {
        window.location.reload()
      } else {
        alert(result.message || 'Failed to load configuration')
      }
    }
  }

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

  if (dbConnected === null) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>
  }

  if (!dbConnected) {
    return <SetupScreen />
  }

  if (!isAuthenticated) {
    return <LoginScreen />
  }

  return (
    <div className="layout-container">
      <aside className="sidebar">
        <div style={{ paddingBottom: '32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', borderRadius: '8px' }}></div>
          <div>
            <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Vessel Compliance</h2>
            <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{user?.username} ({user?.role})</div>
          </div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
          <NavItem
            icon={<LayoutDashboard size={20} />}
            label="Dashboard"
            active={activeTab === 'dashboard'}
            onClick={() => setActiveTab('dashboard')}
          />
          <NavItem
            icon={<ShieldAlert size={20} />}
            label="Compliance Center"
            active={activeTab === 'compliance'}
            onClick={() => setActiveTab('compliance')}
          />
          <NavItem
            icon={<Ship size={20} />}
            label="Vessels"
            active={activeTab === 'vessels'}
            onClick={() => setActiveTab('vessels')}
          />
          <NavItem
            icon={<LayoutDashboard size={20} />} // Reusing icon for fleets
            label="Fleets"
            active={activeTab === 'fleets'}
            onClick={() => setActiveTab('fleets')}
          />
          <NavItem
            icon={<Users size={20} />}
            label="Entity Directory"
            active={activeTab === 'entities'}
            onClick={() => setActiveTab('entities')}
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

        <div className="mt-8 pt-4 border-t border-gray-700 opacity-50 flex flex-col gap-2">
          <NavItem
            icon={theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            label={theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            active={false}
            onClick={toggleTheme}
          />
          <NavItem
            icon={<LogOut size={20} />}
            label="Logout"
            active={false}
            onClick={logout}
          />
        </div>

        {isAdmin && (
          <div className="mt-auto pt-4 px-2 pb-2 border-t border-gray-700/30">
            <div className="flex items-center justify-between mb-1 px-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">DB Configuration</span>
              <button onClick={handleConfigChange} className="hover:text-blue-400 text-[10px] uppercase font-bold tracking-wider text-gray-400 transition-colors">Change</button>
            </div>
            <div className="px-2 py-1.5 bg-black/20 rounded text-[10px] text-gray-400 break-all font-mono leading-tight border border-white/5">
              {configPath || 'Portable / Default'}
            </div>
          </div>
        )}
      </aside>

      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard onViewAlerts={() => setActiveTab('compliance')} />}
        {activeTab === 'vessels' && <VesselManager />}
        {activeTab === 'fleets' && <FleetManager />}
        {activeTab === 'admin' && isAdmin && <AdminPanel />}
        {activeTab === 'users' && isAdmin && <UserManager />}
        {activeTab === 'entities' && <EntityDirectory />}
        {activeTab === 'compliance' && <ComplianceCenter />}
      </main>
    </div>
  )
}

function NavItem({ icon, label, active, onClick }: { icon: any, label: string, active: boolean, onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '12px',
        cursor: 'pointer',
        background: active ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        transition: 'var(--transition)'
      }}
      className={!active ? 'hover-effect' : ''}
    >
      {icon}
      <span style={{ fontWeight: active ? '600' : '400' }}>{label}</span>
    </div>
  )
}

export default App
