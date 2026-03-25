import { useState, useEffect } from 'react'
import { User, UserGroup, PERMISSION_CATEGORIES } from '../../../shared/types'
import { Trash2, Shield, KeyRound, ArrowLeftRight, Users, X, Plus, Search, ChevronDown, ChevronRight, Key, Monitor } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateTime } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'

export default function UserManager() {
    const { resetPassword, user: currentUser, hasPermission } = useAuth()
    const canManageUsers = hasPermission('admin:users')
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const [users, setUsers] = useState<User[]>([])
    const [resettingUser, setResettingUser] = useState<string | null>(null)
    const [tempPassword, setTempPassword] = useState<string | null>(null)
    const [showCreateForm, setShowCreateForm] = useState(false)
    const [userGroupMap, setUserGroupMap] = useState<Record<string, string[]>>({})
    const [userPermCounts, setUserPermCounts] = useState<Record<string, number>>({})
    const [groupNameMap, setGroupNameMap] = useState<Record<string, string>>({})

    // Column preferences
    const USER_COLUMNS: ColumnDef[] = [
        { id: 'user', label: 'User', defaultVisible: true },
        { id: 'groups', label: 'Groups', defaultVisible: true },
        { id: 'permissions', label: 'Permissions', defaultVisible: true },
        { id: 'version', label: 'Version', defaultVisible: true },
        { id: 'lastLogin', label: 'Last Login', defaultVisible: true },
        { id: 'actions', label: 'Actions', defaultVisible: true },
    ]
    const { visibleColumns: userVisibleCols, setVisibleColumns: setUserVisibleCols } = useColumnPrefs('users', USER_COLUMNS)
    const userVisibleSet = new Set(userVisibleCols)

    // Confirmation modal state
    const [confirmation, setConfirmation] = useState<{
        show: boolean
        title: string
        message: string
        onConfirm: () => void
        isDangerous?: boolean
    }>({ show: false, title: '', message: '', onConfirm: () => { } })

    // Groups & Permissions modal state
    const [groupsModalUserId, setGroupsModalUserId] = useState<string | null>(null)
    const [allGroups, setAllGroups] = useState<UserGroup[]>([])
    const [userGroupIds, setUserGroupIds] = useState<string[]>([])
    const [userOverrides, setUserOverrides] = useState<{ permissionKey: string; granted: boolean }[]>([])
    const [resolvedPerms, setResolvedPerms] = useState<string[]>([])
    const [overrideSearch, setOverrideSearch] = useState('')
    const [showOverrideDropdown, setShowOverrideDropdown] = useState(false)
    const [collapsedOverrideCats, setCollapsedOverrideCats] = useState<Set<string>>(new Set())

    const handleResetPassword = async (username: string) => {
        setConfirmation({
            show: true,
            title: 'Reset Password?',
            message: `Are you sure you want to reset the password for ${username}?`,
            onConfirm: async () => {
                setResettingUser(username)
                setTempPassword(null)
                try {
                    const result = await resetPassword(username)
                    if (result.success && result.newPassword) {
                        setTempPassword(result.newPassword)
                    } else {
                        setError(result.message || 'Failed to reset password')
                    }
                } catch (err: any) {
                    setError(err.message)
                }
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    // ... (rest of component)
    const [loading, setLoading] = useState(true)
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        role: 'user' as 'admin' | 'user'
    })
    const [error, setError] = useState('')

    useEffect(() => {
        loadUsers()
    }, [])

    const loadUsers = async () => {
        try {
            const data = await window.api.getUsers()
            setUsers(data)

            // Load groups for name mapping
            try {
                const groups = await window.api.rbacGetGroups()
                if (Array.isArray(groups)) {
                    const nameMap: Record<string, string> = {}
                    for (const g of groups) {
                        nameMap[g.id] = g.name
                    }
                    setGroupNameMap(nameMap)
                }
            } catch { /* ignore */ }

            // Load group IDs and permission counts per user
            const gMap: Record<string, string[]> = {}
            const pMap: Record<string, number> = {}
            await Promise.all(data.map(async (u: User) => {
                try {
                    const [gIds, resolved] = await Promise.all([
                        window.api.rbacGetUserGroupIds(u.id),
                        window.api.rbacResolveUserPermissions(u.id),
                    ])
                    gMap[u.id] = Array.isArray(gIds) ? gIds : []
                    pMap[u.id] = Array.isArray(resolved) ? resolved.length : 0
                } catch {
                    gMap[u.id] = []
                    pMap[u.id] = 0
                }
            }))
            setUserGroupMap(gMap)
            setUserPermCounts(pMap)
        } catch (err) {
            console.error('Failed to load users', err)
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id: string) => {
        setConfirmation({
            show: true,
            title: 'Delete User?',
            message: 'Are you sure you want to delete this user? This action cannot be undone.',
            isDangerous: true,
            onConfirm: async () => {
                await window.api.deleteUser(id)
                loadUsers()
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    const handleToggleRole = async (u: User) => {
        if (u.id === currentUser?.id) {
            showError('You cannot change your own role')
            return
        }
        const newRole = u.role === 'admin' ? 'user' : 'admin'
        setConfirmation({
            show: true,
            title: 'Change User Role?',
            message: `Change ${u.username} from ${u.role.toUpperCase()} to ${newRole.toUpperCase()}?`,
            onConfirm: async () => {
                try {
                    await window.api.updateUserRole(u.id, newRole)
                    showSuccess(`${u.username} is now ${newRole.toUpperCase()}`)
                    loadUsers()
                } catch (err: any) {
                    showError(err.message || 'Failed to update role')
                }
                setConfirmation(prev => ({ ...prev, show: false }))
            }
        })
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!formData.username || !formData.password) {
            setError('Username and password are required')
            return
        }

        try {
            const result = await window.api.authCreateUser(formData)
            if (result.success) {
                setFormData({ username: '', password: '', role: 'user' })
                setShowCreateForm(false)
                await loadUsers()
                if (result.userId) {
                    openGroupsModal(result.userId)
                }
            } else {
                setError(result.message || 'Failed to create user')
            }
        } catch (err: any) {
            setError(err.message)
        }
    }

    // ── Groups & Permissions Modal ──────────────────────────────────────────────
    const openGroupsModal = async (userId: string) => {
        setGroupsModalUserId(userId)
        setOverrideSearch('')
        setShowOverrideDropdown(false)
        try {
            const [groups, gIds, overrides, resolved] = await Promise.all([
                window.api.rbacGetGroups(),
                window.api.rbacGetUserGroupIds(userId),
                window.api.rbacGetUserPermissionOverrides(userId),
                window.api.rbacResolveUserPermissions(userId),
            ])
            setAllGroups(Array.isArray(groups) ? groups : [])
            setUserGroupIds(Array.isArray(gIds) ? gIds : [])
            setUserOverrides(Array.isArray(overrides) ? overrides : [])
            setResolvedPerms(Array.isArray(resolved) ? resolved : [])
        } catch (err: any) {
            showError(err.message || 'Failed to load group data')
            setGroupsModalUserId(null)
        }
    }

    const closeGroupsModal = () => {
        setGroupsModalUserId(null)
        setAllGroups([])
        setUserGroupIds([])
        setUserOverrides([])
        setResolvedPerms([])
    }

    const handleToggleUserGroup = async (groupId: string) => {
        if (!groupsModalUserId) return
        const next = userGroupIds.includes(groupId)
            ? userGroupIds.filter(id => id !== groupId)
            : [...userGroupIds, groupId]
        setUserGroupIds(next)
        try {
            await window.api.rbacSetUserGroups(groupsModalUserId, next)
            // Refresh resolved permissions
            const resolved = await window.api.rbacResolveUserPermissions(groupsModalUserId)
            setResolvedPerms(Array.isArray(resolved) ? resolved : [])
        } catch (err: any) {
            showError(err.message || 'Failed to update groups')
            const gIds = await window.api.rbacGetUserGroupIds(groupsModalUserId)
            setUserGroupIds(Array.isArray(gIds) ? gIds : [])
        }
    }

    const handleAddOverride = async (permKey: string, granted: boolean) => {
        if (!groupsModalUserId) return
        // Don't add if already overridden
        if (userOverrides.some(o => o.permissionKey === permKey)) return
        const next = [...userOverrides, { permissionKey: permKey, granted }]
        setUserOverrides(next)
        setShowOverrideDropdown(false)
        setOverrideSearch('')
        try {
            await window.api.rbacSetUserPermissionOverrides(groupsModalUserId, next)
            const resolved = await window.api.rbacResolveUserPermissions(groupsModalUserId)
            setResolvedPerms(Array.isArray(resolved) ? resolved : [])
        } catch (err: any) {
            showError(err.message || 'Failed to save override')
            const overrides = await window.api.rbacGetUserPermissionOverrides(groupsModalUserId)
            setUserOverrides(Array.isArray(overrides) ? overrides : [])
        }
    }

    const handleToggleOverrideGranted = async (permKey: string) => {
        if (!groupsModalUserId) return
        const next = userOverrides.map(o =>
            o.permissionKey === permKey ? { ...o, granted: !o.granted } : o
        )
        setUserOverrides(next)
        try {
            await window.api.rbacSetUserPermissionOverrides(groupsModalUserId, next)
            const resolved = await window.api.rbacResolveUserPermissions(groupsModalUserId)
            setResolvedPerms(Array.isArray(resolved) ? resolved : [])
        } catch (err: any) {
            showError(err.message || 'Failed to save override')
        }
    }

    const handleRemoveOverride = async (permKey: string) => {
        if (!groupsModalUserId) return
        const next = userOverrides.filter(o => o.permissionKey !== permKey)
        setUserOverrides(next)
        try {
            await window.api.rbacSetUserPermissionOverrides(groupsModalUserId, next)
            const resolved = await window.api.rbacResolveUserPermissions(groupsModalUserId)
            setResolvedPerms(Array.isArray(resolved) ? resolved : [])
        } catch (err: any) {
            showError(err.message || 'Failed to remove override')
        }
    }

    const getPermLabel = (key: string): string => {
        for (const cat of PERMISSION_CATEGORIES) {
            for (const p of cat.permissions) {
                if (p.key === key) return p.label
            }
        }
        return key
    }

    const getCatLabel = (key: string): string => {
        for (const cat of PERMISSION_CATEGORIES) {
            for (const p of cat.permissions) {
                if (p.key === key) return cat.label
            }
        }
        return ''
    }

    // All permission keys not yet overridden, filtered by search
    const availableOverrideKeys = PERMISSION_CATEGORIES.flatMap(cat =>
        cat.permissions.map(p => p.key)
    ).filter(k => !userOverrides.some(o => o.permissionKey === k))
     .filter(k => {
         if (!overrideSearch.trim()) return true
         const lc = overrideSearch.toLowerCase()
         return getPermLabel(k).toLowerCase().includes(lc) || k.toLowerCase().includes(lc)
     })

    const modalUser = groupsModalUserId ? users.find(u => u.id === groupsModalUserId) : null

    const currentVersion = users.reduce((max, u) => {
        if (!u.lastAppVersion) return max
        return u.lastAppVersion > max ? u.lastAppVersion : max
    }, '0.0.0')
    const isOldVersion = (v?: string) => !!v && v < currentVersion
    const adminCount = users.filter(u => u.role === 'admin').length
    const regularCount = users.filter(u => u.role === 'user').length
    const onLatestCount = users.filter(u => u.lastAppVersion === currentVersion).length

    // Theme-aware colors
    const adminColor = isLight ? '#7c3aed' : '#d8b4fe'
    const adminBg = isLight ? 'rgba(124,58,237,0.1)' : 'rgba(147,51,234,0.1)'
    const adminBorder = isLight ? 'rgba(124,58,237,0.25)' : 'rgba(147,51,234,0.2)'
    const userColor = isLight ? '#16a34a' : '#86efac'
    const userBg = isLight ? 'rgba(22,163,74,0.1)' : 'rgba(34,197,94,0.1)'
    const userBorder = isLight ? 'rgba(22,163,74,0.25)' : 'rgba(34,197,94,0.2)'
    const grantColor = isLight ? '#16a34a' : '#86efac'
    const grantBg = isLight ? 'rgba(22,163,74,0.1)' : 'rgba(34,197,94,0.1)'
    const grantBorder = isLight ? 'rgba(22,163,74,0.25)' : 'rgba(34,197,94,0.2)'
    const groupColor = isLight ? '#4f46e5' : '#a5b4fc'
    const groupBg = isLight ? 'rgba(79,70,229,0.1)' : 'rgba(99,102,241,0.1)'

    const getVersionColor = (v?: string) => {
        if (!v) return { color: 'var(--text-secondary)', bg: 'transparent', border: '1px solid var(--table-border)' }
        if (v === currentVersion) return { color: isLight ? '#16a34a' : '#86efac', bg: isLight ? 'rgba(22,163,74,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${isLight ? 'rgba(22,163,74,0.25)' : 'rgba(34,197,94,0.2)'}` }
        if (isOldVersion(v)) return { color: isLight ? '#d97706' : '#fbbf24', bg: isLight ? 'rgba(217,119,6,0.1)' : 'rgba(251,191,36,0.1)', border: `1px solid ${isLight ? 'rgba(217,119,6,0.25)' : 'rgba(251,191,36,0.2)'}` }
        return { color: 'var(--text-secondary)', bg: 'transparent', border: '1px solid var(--table-border)' }
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>System Access</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage user accounts, roles, and administrative permissions.</p>
            </header>

            {/* Stats Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                {[
                    { icon: <Users size={22} />, label: 'Total Users', value: users.length, gradient: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' },
                    { icon: <Shield size={22} />, label: 'Admins', value: adminCount, gradient: 'linear-gradient(135deg, #9333ea, #7c3aed)' },
                    { icon: <Key size={22} />, label: 'Regular Users', value: regularCount, gradient: 'linear-gradient(135deg, #22c55e, #16a34a)' },
                    { icon: <Monitor size={22} />, label: 'On Latest Version', value: onLatestCount, gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' },
                ].map((stat, i) => (
                    <div key={i} className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: stat.gradient, color: '#fff', flexShrink: 0
                        }}>
                            {stat.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{stat.label}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '700', lineHeight: 1.2 }}>{stat.value}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Create User — Collapsible Card */}
            {canManageUsers && <div className="glass-card" style={{ padding: '0', marginBottom: '24px', overflow: 'hidden' }}>
                <button
                    onClick={() => setShowCreateForm(!showCreateForm)}
                    style={{
                        width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                        padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '8px',
                        color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: '600'
                    }}
                >
                    {showCreateForm ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <Shield size={18} color="var(--accent-primary)" />
                    User Registration
                    <Plus size={16} color="var(--accent-primary)" style={{ marginLeft: 'auto' }} />
                </button>
                {showCreateForm && (
                    <div style={{ padding: '0 20px 20px' }}>
                        {error && (
                            <div role="alert" aria-live="polite" style={{ marginBottom: '12px', borderRadius: '8px', background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.2)', padding: '10px 12px', fontSize: '0.85rem', color: 'var(--danger)' }}>
                                {error}
                            </div>
                        )}
                        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                style={{ flex: 2, minWidth: '180px' }}
                                placeholder="Username"
                                aria-label="Username"
                            />
                            <input
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                style={{ flex: 2, minWidth: '180px' }}
                                placeholder="Password"
                                aria-label="Password"
                            />
                            <select
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                                style={{ flex: 1, minWidth: '110px', color: 'var(--text-primary)' }}
                                aria-label="User role"
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                            <button type="submit" className="btn-primary">Create User</button>
                        </form>
                    </div>
                )}
            </div>}

            {/* Temp password banner */}
            {tempPassword && (
                <div className="glass-card" style={{ padding: '16px', marginBottom: '24px', background: 'rgba(34, 197, 94, 0.08)', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                        New password for <strong>{resettingUser}</strong>:
                    </p>
                    <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: isLight ? '#16a34a' : '#86efac', margin: '8px 0' }}>
                        {tempPassword}
                    </div>
                    <button
                        onClick={() => { setTempPassword(null); setResettingUser(null) }}
                        style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {loading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading users...</div>
            ) : (
                <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
                        <caption className="sr-only">User accounts</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                {userVisibleSet.has('user') && <th scope="col" style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.82rem' }}>User</th>}
                                {userVisibleSet.has('groups') && <th scope="col" style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.82rem' }}>Groups</th>}
                                {userVisibleSet.has('permissions') && <th scope="col" style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.82rem' }}>Permissions</th>}
                                {userVisibleSet.has('version') && <th scope="col" style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.82rem' }}>Version</th>}
                                {userVisibleSet.has('lastLogin') && <th scope="col" style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.82rem' }}>Last Login</th>}
                                {userVisibleSet.has('actions') ? (
                                    <th scope="col" style={{ padding: '14px 16px', fontWeight: 600, fontSize: '0.82rem', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                                            Actions
                                            <ColumnSelector pageKey="users" allColumns={USER_COLUMNS} visibleColumns={userVisibleCols} onChange={setUserVisibleCols} />
                                        </div>
                                    </th>
                                ) : (
                                    <th scope="col" style={{ padding: '14px 16px', textAlign: 'right' }}>
                                        <ColumnSelector pageKey="users" allColumns={USER_COLUMNS} visibleColumns={userVisibleCols} onChange={setUserVisibleCols} />
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => {
                                const vColor = getVersionColor(user.lastAppVersion)
                                const groupIds = userGroupMap[user.id] || []
                                const permCount = userPermCounts[user.id] || 0
                                const uIsAdmin = user.role === 'admin'

                                return (
                                    <tr key={user.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                        {userVisibleSet.has('user') && (
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    background: uIsAdmin
                                                        ? 'linear-gradient(135deg, #9333ea, #7c3aed)'
                                                        : 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                                    color: '#fff', fontSize: '0.9rem', fontWeight: '700', flexShrink: 0,
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {user.username.charAt(0)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{user.username}</div>
                                                    <span style={{
                                                        display: 'inline-block', marginTop: '2px',
                                                        padding: '1px 8px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: '600',
                                                        background: uIsAdmin ? adminBg : userBg,
                                                        color: uIsAdmin ? adminColor : userColor,
                                                        border: `1px solid ${uIsAdmin ? adminBorder : userBorder}`
                                                    }}>
                                                        {user.role.toUpperCase()}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        )}
                                        {userVisibleSet.has('groups') && (
                                        <td style={{ padding: '12px 16px' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                                {groupIds.length === 0 ? (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>—</span>
                                                ) : (
                                                    groupIds.map(gId => (
                                                        <span key={gId} style={{
                                                            padding: '1px 8px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: '600',
                                                            background: groupBg, color: groupColor,
                                                            border: '1px solid rgba(99,102,241,0.2)'
                                                        }}>
                                                            {groupNameMap[gId] || gId}
                                                        </span>
                                                    ))
                                                )}
                                            </div>
                                        </td>
                                        )}
                                        {userVisibleSet.has('permissions') && (
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                padding: '2px 10px', borderRadius: '8px', fontSize: '0.72rem', fontWeight: '600',
                                                background: 'rgba(var(--accent-primary-rgb,0,210,255),0.08)',
                                                color: 'var(--accent-primary)',
                                                border: '1px solid rgba(var(--accent-primary-rgb,0,210,255),0.15)',
                                            }}>
                                                {permCount}
                                            </span>
                                        </td>
                                        )}
                                        {userVisibleSet.has('version') && (
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: '600',
                                                background: vColor.bg, color: vColor.color, border: vColor.border
                                            }}>
                                                {user.lastAppVersion || '—'}
                                            </span>
                                        </td>
                                        )}
                                        {userVisibleSet.has('lastLogin') && (
                                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                            {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : <span style={{ opacity: 0.5 }}>Never</span>}
                                        </td>
                                        )}
                                        {userVisibleSet.has('actions') && (
                                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                                                {canManageUsers && (
                                                    <button
                                                        onClick={() => openGroupsModal(user.id)}
                                                        style={{ background: 'transparent', color: 'var(--accent-primary)', padding: '7px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                                                        className="hover-effect"
                                                        title="Groups & Permissions"
                                                    >
                                                        <Users size={16} />
                                                    </button>
                                                )}
                                                {canManageUsers && (
                                                    <button
                                                        onClick={() => handleToggleRole(user)}
                                                        style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '7px', border: 'none', cursor: 'pointer', borderRadius: '6px', opacity: user.id === currentUser?.id ? 0.3 : 1 }}
                                                        className="hover-effect"
                                                        title={user.id === currentUser?.id ? 'Cannot change own role' : `Change to ${user.role === 'admin' ? 'User' : 'Admin'}`}
                                                        disabled={user.id === currentUser?.id}
                                                    >
                                                        <ArrowLeftRight size={16} />
                                                    </button>
                                                )}
                                                {canManageUsers && (
                                                    <button
                                                        onClick={() => handleResetPassword(user.username)}
                                                        style={{ background: 'transparent', color: 'var(--accent-primary)', padding: '7px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                                                        className="hover-effect"
                                                        title="Reset Password"
                                                    >
                                                        <KeyRound size={16} />
                                                    </button>
                                                )}
                                                {canManageUsers && (
                                                    <button
                                                        onClick={() => handleDelete(user.id)}
                                                        style={{ background: 'transparent', color: 'var(--danger)', padding: '7px', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
                                                        className="hover-effect"
                                                        title="Delete User"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        )}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Groups & Permissions Modal */}
            {groupsModalUserId && modalUser && (
                <div
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                    onClick={closeGroupsModal}
                >
                    <div
                        style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '28px', width: '600px', maxWidth: '90vw', maxHeight: '80vh', overflow: 'auto', border: '1px solid var(--glass-border)' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={20} color="var(--accent-primary)" />
                                    Groups & Permissions
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    {modalUser.username}
                                    <span style={{
                                        marginLeft: '8px', padding: '2px 8px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: '600',
                                        background: modalUser.role === 'admin' ? adminBg : userBg,
                                        color: modalUser.role === 'admin' ? adminColor : userColor
                                    }}>
                                        {modalUser.role.toUpperCase()}
                                    </span>
                                </p>
                            </div>
                            <button onClick={closeGroupsModal} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                                <X size={20} />
                            </button>
                        </div>

                        {/* Section 1: Group Membership */}
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                                Group Membership
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {allGroups.map(group => (
                                    <label key={group.id} style={{
                                        display: 'flex', alignItems: 'center', gap: '12px',
                                        padding: '10px 14px', borderRadius: '8px',
                                        border: userGroupIds.includes(group.id) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)',
                                        background: userGroupIds.includes(group.id) ? 'rgba(var(--accent-primary-rgb,0,210,255),0.06)' : 'transparent',
                                        cursor: 'pointer'
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={userGroupIds.includes(group.id)}
                                            onChange={() => handleToggleUserGroup(group.id)}
                                            style={{ accentColor: 'var(--accent-primary)', width: '15px', height: '15px', flexShrink: 0 }}
                                        />
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>{group.name}</span>
                                            {group.description && <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '8px' }}>{group.description}</span>}
                                        </div>
                                        {group.isSystem && (
                                            <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700', background: adminBg, color: adminColor, border: `1px solid ${adminBorder}` }}>
                                                SYSTEM
                                            </span>
                                        )}
                                    </label>
                                ))}
                                {allGroups.length === 0 && (
                                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        No groups available. Create groups in the Admin Panel.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Divider */}
                        <div style={{ height: '1px', background: 'var(--glass-border)', margin: '0 0 24px' }} />

                        {/* Section 2: Permission Overrides */}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                                    Permission Overrides
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <button
                                        onClick={() => setShowOverrideDropdown(!showOverrideDropdown)}
                                        className="btn-secondary"
                                        style={{ padding: '4px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                        <Plus size={14} /> Add Override
                                    </button>
                                    {showOverrideDropdown && (
                                        <div style={{
                                            position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                                            width: '340px', maxHeight: '300px', overflowY: 'auto',
                                            background: isLight ? '#ffffff' : '#1a1d28',
                                            border: '1px solid var(--glass-border)', borderRadius: '10px',
                                            boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 10
                                        }}>
                                            <div style={{ padding: '8px', borderBottom: '1px solid var(--table-border)', position: 'sticky', top: 0, background: isLight ? '#ffffff' : '#1a1d28' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--input-border)' }}>
                                                    <Search size={14} color="var(--text-secondary)" />
                                                    <input
                                                        type="text"
                                                        value={overrideSearch}
                                                        onChange={e => setOverrideSearch(e.target.value)}
                                                        placeholder="Search permissions..."
                                                        autoFocus
                                                        style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)', padding: '2px 0' }}
                                                    />
                                                </div>
                                            </div>
                                            <div style={{ padding: '4px' }}>
                                                {availableOverrideKeys.length === 0 && (
                                                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                                        {overrideSearch ? 'No matching permissions' : 'All permissions already overridden'}
                                                    </div>
                                                )}
                                                {PERMISSION_CATEGORIES.map(cat => {
                                                    const catPerms = cat.permissions.filter(p => availableOverrideKeys.includes(p.key))
                                                    if (catPerms.length === 0) return null
                                                    const collapsed = collapsedOverrideCats.has(cat.key)
                                                    return (
                                                        <div key={cat.key}>
                                                            <div
                                                                onClick={() => {
                                                                    setCollapsedOverrideCats(prev => {
                                                                        const next = new Set(prev)
                                                                        if (next.has(cat.key)) next.delete(cat.key)
                                                                        else next.add(cat.key)
                                                                        return next
                                                                    })
                                                                }}
                                                                style={{ padding: '6px 8px', fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                                                {cat.label}
                                                            </div>
                                                            {!collapsed && catPerms.map(perm => (
                                                                <div key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px 2px 20px' }}>
                                                                    <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{perm.label}</span>
                                                                    <button
                                                                        onClick={() => handleAddOverride(perm.key, true)}
                                                                        style={{ background: grantBg, border: `1px solid ${grantBorder}`, borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: '600', color: grantColor, cursor: 'pointer' }}
                                                                        title="Grant this permission"
                                                                    >
                                                                        Grant
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleAddOverride(perm.key, false)}
                                                                        style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.2)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.7rem', fontWeight: '600', color: 'var(--danger)', cursor: 'pointer' }}
                                                                        title="Revoke this permission"
                                                                    >
                                                                        Revoke
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px', fontStyle: 'italic' }}>
                                Overrides take precedence over group permissions. Grant adds a permission; Revoke removes it.
                            </p>

                            {userOverrides.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', borderRadius: '8px', border: '1px dashed var(--table-border)' }}>
                                    No overrides configured. This user inherits all permissions from their groups.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {userOverrides.map(override => (
                                        <div key={override.permissionKey} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px',
                                            padding: '8px 12px', borderRadius: '8px',
                                            border: override.granted ? `1px solid ${grantBorder}` : '1px solid rgba(255,77,77,0.2)',
                                            background: override.granted ? grantBg : 'rgba(255,77,77,0.04)'
                                        }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.5px',
                                                background: override.granted ? grantBg : 'rgba(255,77,77,0.15)',
                                                color: override.granted ? grantColor : 'var(--danger)'
                                            }}>
                                                {override.granted ? 'GRANT' : 'REVOKE'}
                                            </span>
                                            <div style={{ flex: 1 }}>
                                                <span style={{
                                                    fontSize: '0.88rem',
                                                    color: 'var(--text-primary)',
                                                    textDecoration: !override.granted ? 'line-through' : 'none',
                                                    opacity: !override.granted ? 0.7 : 1
                                                }}>
                                                    {getPermLabel(override.permissionKey)}
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                                    {getCatLabel(override.permissionKey)}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleToggleOverrideGranted(override.permissionKey)}
                                                style={{
                                                    background: 'transparent', border: '1px solid var(--table-border)', borderRadius: '4px',
                                                    padding: '2px 8px', fontSize: '0.7rem', cursor: 'pointer', color: 'var(--text-secondary)'
                                                }}
                                                title={override.granted ? 'Switch to Revoke' : 'Switch to Grant'}
                                            >
                                                {override.granted ? 'Revoke' : 'Grant'}
                                            </button>
                                            <button
                                                onClick={() => handleRemoveOverride(override.permissionKey)}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                                title="Remove override"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Resolved Permissions Summary */}
                            <div style={{ marginTop: '20px', padding: '12px', borderRadius: '8px', background: 'rgba(var(--accent-primary-rgb,0,210,255),0.04)', border: '1px solid var(--table-border)' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                    Effective Permissions ({resolvedPerms.length})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {resolvedPerms.length === 0 && (
                                        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>None</span>
                                    )}
                                    {resolvedPerms.map(key => (
                                        <span key={key} style={{
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem',
                                            background: 'rgba(var(--accent-primary-rgb,0,210,255),0.1)',
                                            color: 'var(--accent-primary)', border: '1px solid rgba(var(--accent-primary-rgb,0,210,255),0.2)'
                                        }}>
                                            {getPermLabel(key)}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {confirmation.show && (
                <ConfirmationModal
                    title={confirmation.title}
                    message={confirmation.message}
                    isDangerous={confirmation.isDangerous}
                    onConfirm={confirmation.onConfirm}
                    onCancel={() => setConfirmation(prev => ({ ...prev, show: false }))}
                />
            )}
        </div>
    )
}
