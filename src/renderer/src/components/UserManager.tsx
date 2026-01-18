import { useState, useEffect } from 'react'
import { User } from '../../../shared/types'
import { Trash2, UserPlus, Shield } from 'lucide-react'

export default function UserManager() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [showAddForm, setShowAddForm] = useState(false)
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
                setShowAddForm(false)
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
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2 text-[var(--text-primary)]">
                    <Shield className="w-6 h-6 text-[var(--accent-primary)]" />
                    User Management
                </h2>
                <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="btn-primary flex items-center gap-2"
                >
                    <UserPlus size={18} />
                    {showAddForm ? 'Cancel' : 'Add User'}
                </button>
            </div>

            {showAddForm && (
                <div className="mb-8 glass-card p-6 fade-in">
                    <h3 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Add New User</h3>
                    {error && (
                        <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-[var(--danger)]">
                            {error}
                        </div>
                    )}
                    <form onSubmit={handleSubmit} className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 w-full">
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Username</label>
                            <input
                                type="text"
                                value={formData.username}
                                onChange={e => setFormData({ ...formData, username: e.target.value })}
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/30 focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors"
                                placeholder="Enter username"
                            />
                        </div>
                        <div className="flex-1 w-full">
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Password</label>
                            <input
                                type="password"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/30 focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors"
                                placeholder="Enter password"
                            />
                        </div>
                        <div className="w-full md:w-48">
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Role</label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'user' })}
                                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-white placeholder-white/30 focus:border-[var(--accent-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)] transition-colors appearance-none"
                                style={{ backgroundColor: 'var(--bg-dark)' }}
                            >
                                <option value="user">User</option>
                                <option value="admin">Admin</option>
                            </select>
                        </div>
                        <button
                            type="submit"
                            className="btn-primary whitespace-nowrap"
                        >
                            Save User
                        </button>
                    </form>
                </div>
            )}

            {loading ? (
                <div className="text-[var(--text-secondary)]">Loading users...</div>
            ) : (
                <div className="glass-card overflow-hidden">
                    <table className="min-w-full divide-y divide-white/10">
                        <thead className="bg-white/5">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Username</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Role</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Created At</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                            {users.map(user => (
                                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap font-medium text-[var(--text-primary)]">{user.username}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'admin'
                                                ? 'bg-purple-500/20 text-purple-200 border border-purple-500/30'
                                                : 'bg-green-500/20 text-green-200 border border-green-500/30'
                                            }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-[var(--text-secondary)]">
                                        {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleDelete(user.id)}
                                            className="text-red-400 hover:text-red-300 transition-colors"
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
