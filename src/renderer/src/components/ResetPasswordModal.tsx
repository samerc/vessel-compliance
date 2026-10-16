import React, { useState } from 'react'
import { KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react'
import { Modal, Field } from './ui'

interface ResetPasswordModalProps {
  username: string
  onClose: () => void
  /** Called after a successful reset; generatedPassword is set only when the app made one up */
  onDone: (generatedPassword: string | null) => void
}

// Admin reset of another user's password: type one, or let the app generate it.
export default function ResetPasswordModal({
  username,
  onClose,
  onDone
}: ResetPasswordModalProps): React.JSX.Element {
  const [mode, setMode] = useState<'type' | 'generate'>('type')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [mustChange, setMustChange] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const typedProblem =
    mode !== 'type'
      ? ''
      : password.length > 0 && password.length < 6
        ? 'At least 6 characters'
        : password === 'admin123'
          ? 'Choose a password other than the default one'
          : confirm && confirm !== password
            ? 'The two passwords do not match'
            : ''
  const canSave =
    !saving &&
    (mode === 'generate' || (password.length >= 6 && confirm === password && !typedProblem))

  const handleSave = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const result = await window.api.authResetPassword(username, {
        password: mode === 'type' ? password : undefined,
        mustChange
      })
      if (result.success) onDone(result.newPassword ?? null)
      else setError(result.message || 'Failed to reset the password')
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Failed to reset the password')
    } finally {
      setSaving(false)
    }
  }

  const modeButton = (m: 'type' | 'generate', label: string): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      style={{
        flex: 1,
        padding: '8px 10px',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '0.83rem',
        fontWeight: mode === m ? 600 : 400,
        border: `1px solid ${mode === m ? 'var(--accent-primary)' : 'var(--glass-border-color)'}`,
        background: mode === m ? 'rgba(var(--accent-primary-rgb), 0.1)' : 'transparent',
        color: mode === m ? 'var(--accent-primary)' : 'var(--text-secondary)'
      }}
    >
      {label}
    </button>
  )

  return (
    <Modal
      title="Reset password"
      icon={<KeyRound size={18} />}
      onClose={onClose}
      width={420}
      closeOnOverlay={false}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="reset-pw-form" className="btn-primary" disabled={!canSave}>
            {saving && <Loader2 size={14} className="spin" />} Reset password
          </button>
        </>
      }
    >
      <form
        id="reset-pw-form"
        onSubmit={handleSave}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          New password for <strong style={{ color: 'var(--text-primary)' }}>{username}</strong>.
          Their remembered logins end, so they sign in again with it.
        </p>

        <div style={{ display: 'flex', gap: '8px' }}>
          {modeButton('type', 'Type a password')}
          {modeButton('generate', 'Generate one')}
        </div>

        {mode === 'type' ? (
          <>
            <Field label="New password" htmlFor="reset-pw">
              <div style={{ position: 'relative' }}>
                <input
                  id="reset-pw"
                  type={show ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                  style={{ width: '100%', paddingRight: '36px' }}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  title={show ? 'Hide password' : 'Show password'}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex'
                  }}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label="Confirm password" htmlFor="reset-pw-confirm">
              <input
                id="reset-pw-confirm"
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </Field>
            {typedProblem && (
              <div style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>{typedProblem}</div>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            The app makes up a 10-character password and shows it to you once, to pass on to the
            user.
          </p>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          <input
            type="checkbox"
            checked={mustChange}
            onChange={(e) => setMustChange(e.target.checked)}
            style={{ width: '15px', height: '15px', accentColor: 'var(--accent-primary)' }}
          />
          Ask the user to choose their own password at next login
        </label>

        {error && <div style={{ fontSize: '0.83rem', color: 'var(--danger)' }}>{error}</div>}
      </form>
    </Modal>
  )
}
