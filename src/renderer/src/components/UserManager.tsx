import { useState, useEffect } from 'react'
import { User } from '../../../shared/types'
import { Trash2, Shield } from 'lucide-react'

export default function UserManager() {
    const [users, setUsers] = useState<User[]>([])
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
        if (!confirm('Are you sure you want to delete this user?')) return
        await window.api.deleteUser(id)
        loadUsers()
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
                    <div style={{ marginBottom: '16px', borderRadius: '8px', background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.2)', padding: '12px', fontSize: '0.9rem', color: 'var(--danger)' }}>
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
                    />
                    <input
                        type="password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        style={{ flex: 2, minWidth: '200px' }}
                        placeholder="Password"
                    />
                    <select
                        value={formData.role}
                        onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                        style={{ flex: 1, minWidth: '120px' }}
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
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th style={{ padding: '16px' }}>Username</th>
                                <th style={{ padding: '16px' }}>Role</th>
                                <th style={{ padding: '16px' }}>Created At</th>
                                <th style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
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
                                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                                    </td>
                                    <td style={{ padding: '16px', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleDelete(user.id)}
                                            style={{ background: 'transparent', color: 'var(--danger)', padding: '8px' }}
                                            className="hover-effect"
                                            title="Delete User"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
