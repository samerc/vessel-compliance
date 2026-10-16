import React, { useState } from 'react'
import { Key, User as UserIcon, Shield, Loader2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Modal, Field } from './ui'

interface UserProfileModalProps {
  onClose: () => void
}

export default function UserProfileModal({ onClose }: UserProfileModalProps): React.JSX.Element {
  const { user, changePassword } = useAuth()
  const { showSuccess, showError } = useToast()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent): Promise<void> => {
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
    } catch (error) {
      showError((error instanceof Error && error.message) || 'Failed to change password')
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <Modal
      title="My profile"
      icon={<UserIcon size={18} />}
      onClose={onClose}
      width={450}
      closeOnOverlay={false}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            form="profile-password-form"
            className="btn-primary"
            disabled={changingPassword}
          >
            {changingPassword ? <Loader2 size={16} className="spinner" /> : <Key size={16} />}
            {changingPassword ? 'Updating...' : 'Update password'}
          </button>
        </>
      }
    >
      <div
        style={{
          marginBottom: '20px',
          padding: '14px 16px',
          background: 'var(--bg-card)',
          borderRadius: '12px',
          border: '1px solid var(--table-border)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Username</span>
          <span style={{ fontWeight: '600' }}>{user?.username}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Account role</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Shield size={14} color="var(--accent-primary)" />
            <span style={{ fontWeight: '600', textTransform: 'capitalize' }}>{user?.role}</span>
          </div>
        </div>
      </div>

      <div className="form-section">
        <h4 className="form-section-title">Change password</h4>
        <form id="profile-password-form" onSubmit={handlePasswordChange} className="form-grid">
          <Field label="Current password" span="all">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </Field>
          <Field label="New password" span="all">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </Field>
          <Field label="Confirm new password" span="all">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          </Field>
        </form>
      </div>
    </Modal>
  )
}
