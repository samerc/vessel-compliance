import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { Shield } from 'lucide-react'

export const LoginScreen: React.FC = () => {
    const { login, resetPassword } = useAuth()
    const [view, setView] = useState<'login' | 'forgot'>('login')
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    })
    const [resetUsername, setResetUsername] = useState('')
    const [newPassword, setNewPassword] = useState<string | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const result = await login(formData)
            if (!result.success) {
                setError(result.message || 'Login failed')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)
        setNewPassword(null)

        try {
            const result = await resetPassword(resetUsername)
            if (result.success && result.newPassword) {
                setNewPassword(result.newPassword)
            } else {
                setError(result.message || 'Reset failed')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{
            height: '100vh',
            width: '100vw',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
        }}>
            <div className="glass-card fade-in" style={{ width: '100%', maxWidth: '400px', padding: '2rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '16px',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '1rem',
                        boxShadow: '0 4px 15px rgba(0, 210, 255, 0.3)'
                    }}>
                        <Shield style={{ width: '32px', height: '32px', color: 'white' }} />
                    </div>
                    <h1 style={{ fontSize: '1.875rem', fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Vessel Compliance</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {view === 'login' ? 'Sign in to continue' : 'Reset your password'}
                    </p>
                </div>

                {error && (
                    <div role="alert" aria-live="polite" style={{
                        marginBottom: '1.5rem',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        backgroundColor: 'rgba(255, 77, 77, 0.1)',
                        border: '1px solid rgba(255, 77, 77, 0.2)',
                        color: 'var(--danger)',
                        fontSize: '0.875rem',
                        textAlign: 'center'
                    }}>
                        {error}
                    </div>
                )}

                {view === 'login' ? (
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div>
                            <label htmlFor="login-username" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Username</label>
                            <input
                                id="login-username"
                                type="text"
                                name="username"
                                value={formData.username}
                                onChange={handleChange}
                                style={{ width: '100%' }}
                                placeholder="Enter your username"
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <label htmlFor="login-password" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Password</label>
                            <input
                                id="login-password"
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                style={{ width: '100%' }}
                                placeholder="••••••••"
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setView('forgot')}
                                style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '0.5rem' }}
                            >
                                Forgot password?
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn-primary"
                            style={{ padding: '0.75rem', fontSize: '1rem', marginTop: '0.5rem' }}
                        >
                            {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                    </form>
                ) : (
                    <div className="fade-in">
                        {newPassword ? (
                            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '8px', marginBottom: '1.5rem' }}>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Your new temporary password is:</p>
                                <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#86efac', letterSpacing: '0.1em', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '4px', margin: '0.5rem 0' }}>
                                    {newPassword}
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>Please copy this password and sign in.</p>
                                <button
                                    onClick={() => { setView('login'); setNewPassword(null); setResetUsername(''); }}
                                    className="btn-primary"
                                    style={{ width: '100%', marginTop: '1rem' }}
                                >
                                    Back to Login
                                </button>
                            </div>
                        ) : (
                            <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                <div>
                                    <label htmlFor="reset-username" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Username</label>
                                    <input
                                        id="reset-username"
                                        type="text"
                                        value={resetUsername}
                                        onChange={e => setResetUsername(e.target.value)}
                                        style={{ width: '100%' }}
                                        placeholder="Enter your username to reset"
                                        required
                                        autoFocus
                                    />
                                </div>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setView('login')}
                                        className="btn-secondary"
                                        style={{ flex: 1 }}
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="btn-primary"
                                        style={{ flex: 1.5 }}
                                    >
                                        {loading ? 'Resetting...' : 'Reset Password'}
                                    </button>
                                </div>
                                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center', fontStyle: 'italic' }}>
                                    Note: Your new password will be displayed on screen.
                                </p>
                            </form>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
