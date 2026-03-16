import { useState, useEffect } from 'react'
import { User } from '../../../shared/types'
import { Trash2, Shield, RefreshCcw, ArrowLeftRight } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'

export default function UserManager() {
    const { resetPassword, user: currentUser } = useAuth()
    const { showSuccess, showError } = useToast()
    const [users, setUsers] = useState<User[]>([])
    // ... (rest of states)
    const [resettingUser, setResettingUser] = useState<string | null>(null)
    const [tempPassword, setTempPassword] = useState<string | null>(null)

    // Confirmation modal state
    const [confirmation, setConfirmation] = useState<{
        show: boolean
        title: string
        message: string
        onConfirm: () => void
        isDangerous?: boolean
    }>({ show: false, title: '', message: '', onConfirm: () => { } })

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
                loadUsers()
            } else {
                setError(result.message || 'Failed to create user')
            }
        } catch (err: any) {
            setError(err.message)
        }
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>System Access</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage user accounts, roles, and administrative permissions.</p>
            </header>

            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} color="var(--accent-primary)" /> User Registration
                </h3>
                {error && (
                    <div role="alert" aria-live="polite" style={{ marginBottom: '16px', borderRadius: '8px', background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.2)', padding: '12px', fontSize: '0.9rem', color: 'var(--danger)' }}>
                        {error}
                    </div>
                )}
                <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <input
                        type="text"
                        value={formData.username}
                        onChange={e => setFormData({ ...formData, username: e.target.value })}
                        style={{ flex: 2, minWidth: '200px' }}
                        placeholder="Username"
                        aria-label="Username"
                    />
                    <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        style={{ flex: 2, minWidth: '200px' }}
                        placeholder="Password"
                        aria-label="Password"
                    />
                    <select
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                        style={{ flex: 1, minWidth: '120px', color: 'var(--text-primary)' }}
                        aria-label="User role"
                    >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                    </select>
                    <button type="submit" className="btn-primary">Create User</button>
                </form>
            </section>

            {loading ? (
                <div style={{ color: 'var(--text-secondary)' }}>Loading users...</div>
            ) : (
                <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
                    {tempPassword && (
                        <div style={{ padding: '16px', background: 'rgba(34, 197, 94, 0.1)', borderBottom: '1px solid var(--table-border)', textAlign: 'center' }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                New password for <strong>{resettingUser}</strong>:
                            </p>
                            <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#86efac', margin: '8px 0' }}>
                                {tempPassword}
                            </div>
                            <button
                                onClick={() => { setTempPassword(null); setResettingUser(null); }}
                                style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                            >
                                Dismiss
                            </button>
                        </div>
                    )}
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <caption className="sr-only">User accounts</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th scope="col" style={{ padding: '16px' }}>Username</th>
                                <th scope="col" style={{ padding: '16px' }}>Role</th>
                                <th scope="col" style={{ padding: '16px' }}>Last Login</th>
                                <th scope="col" style={{ padding: '16px' }}>App Version</th>
                                <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <tr key={user.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                    <td style={{ padding: '16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ background: 'var(--bg-card)', padding: '8px', borderRadius: '8px' }}>
                                                <Shield size={20} color="var(--accent-primary)" />
                                            </div>
                                            <span style={{ fontWeight: '600' }}>{user.username}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '16px' }}>
                                        <span style={{
                                            padding: '4px 12px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: '600',
                                            background: user.role === 'admin' ? 'rgba(147, 51, 234, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                            color: user.role === 'admin' ? '#d8b4fe' : '#86efac',
                                            border: `1px solid ${user.role === 'admin' ? 'rgba(147, 51, 234, 0.2)' : 'rgba(34, 197, 94, 0.2)'}`
                                        }}>
                                            {user.role.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>
                                        {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Never'}
                                    </td>
                                    <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                        {user.lastAppVersion || '-'}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button
                                                onClick={() => handleToggleRole(user)}
                                                style={{ background: 'transparent', color: 'var(--text-secondary)', padding: '8px' }}
                                                className="hover-effect"
                                                title={user.id === currentUser?.id ? 'Cannot change own role' : `Change to ${user.role === 'admin' ? 'User' : 'Admin'}`}
                                                aria-label="Toggle role"
                                                disabled={user.id === currentUser?.id}
                                            >
                                                <ArrowLeftRight size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleResetPassword(user.username)}
                                                style={{ background: 'transparent', color: 'var(--accent-primary)', padding: '8px' }}
                                                className="hover-effect"
                                                title="Reset Password"
                                                aria-label="Reset password"
                                            >
                                                <RefreshCcw size={18} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user.id)}
                                                style={{ background: 'transparent', color: 'var(--danger)', padding: '8px' }}
                                                className="hover-effect"
                                                title="Delete User"
                                                aria-label="Delete user"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
