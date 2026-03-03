import React, { useState } from 'react'
import { X, Key, User as UserIcon, Shield, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useEscapeKey } from '../hooks/useEscapeKey'

interface UserProfileModalProps {
    onClose: () => void
}

export default function UserProfileModal({ onClose }: UserProfileModalProps) {
    const { user, changePassword } = useAuth()
    const { showSuccess, showError } = useToast()

    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [changingPassword, setChangingPassword] = useState(false)

    useEscapeKey(onClose)

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            showError('New passwords do not match')
            return
        }
        if (newPassword.length < 6) {
            showError('New password must be at least 6 characters long')
            return
        }

        setChangingPassword(true)
        try {
            const result = await changePassword(currentPassword, newPassword)
            if (result.success) {
                showSuccess('Password changed successfully')
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                onClose()
            } else {
                showError(result.message || 'Failed to change password')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to change password')
        } finally {
            setChangingPassword(false)
        }
    }

    return (
        <div className="modal-overlay" style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
            backdropFilter: 'blur(4px)'
        }}>
            <div className="glass-card fade-in" style={{
                width: '100%',
                maxWidth: '450px',
                padding: '32px',
                position: 'relative',
                border: '1px solid var(--accent-primary)'
            }}>
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer'
                    }}
                    aria-label="Close modal"
                >
                    <X size={24} />
                </button>

                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px',
                        boxShadow: '0 8px 20px rgba(0, 210, 255, 0.3)'
                    }}>
                        <UserIcon size={32} color="white" />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>My Profile</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Manage your account settings</p>
                </div>

                <div style={{ marginBottom: '24px', padding: '16px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '12px', border: '1px solid var(--table-border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Username</span>
                        <span style={{ fontWeight: '600' }}>{user?.username}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Account Role</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Shield size={14} color="var(--accent-primary)" />
                            <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>{user?.role}</span>
                        </div>
                    </div>
                </div>

                <div style={{ borderTop: '1px solid var(--table-border)', paddingTop: '24px', marginTop: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Key size={18} color="var(--accent-primary)" /> Change Password
                    </h3>
                    <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Current Password</label>
                            <input
                                type="password"
                                value={currentPassword}
                                onChange={e => setCurrentPassword(e.target.value)}
                                style={{ width: '100%' }}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>New Password</label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                style={{ width: '100%' }}
                                minLength={6}
                                required
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Confirm New Password</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                style={{ width: '100%' }}
                                minLength={6}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                            <button
                                type="button"
                                onClick={onClose}
                                className="btn-secondary"
                                style={{ flex: 1 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={changingPassword}
                                style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            >
                                {changingPassword ? <Loader2 size={18} className="spinner" /> : <Key size={18} />}
                                {changingPassword ? 'Updating...' : 'Update Password'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}
