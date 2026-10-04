import { useState, useEffect, type CSSProperties, type ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import ConfirmationModal from './ConfirmationModal'
import { setDialogListener, type DialogRequest } from './DialogHost'

// Renders the in-app confirm / alert / prompt dialogs requested through DialogHost.tsx

export function DialogHost(): ReactElement | null {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const [req, setReq] = useState<DialogRequest | null>(null)
  const [promptVal, setPromptVal] = useState('')

  useEffect(() => {
    setDialogListener((r) => {
      if (r.kind === 'prompt') setPromptVal(r.defaultValue)
      setReq(r)
    })
    return () => {
      setDialogListener(null)
    }
  }, [])

  if (!req) return null

  if (req.kind === 'confirm') {
    return (
      <ConfirmationModal
        title={req.opts.title || 'Please Confirm'}
        message={req.message}
        confirmLabel={req.opts.confirmLabel || 'Confirm'}
        cancelLabel={req.opts.cancelLabel || 'Cancel'}
        isDangerous={req.opts.isDangerous}
        onConfirm={() => {
          const r = req
          setReq(null)
          r.resolve(true)
        }}
        onCancel={() => {
          const r = req
          setReq(null)
          r.resolve(false)
        }}
      />
    )
  }

  const close = (): void => setReq(null)
  const overlay: CSSProperties = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  }
  const card: CSSProperties = {
    width: '90%',
    maxWidth: '500px',
    display: 'flex',
    flexDirection: 'column',
    background: isLight ? '#ffffff' : 'rgba(30,30,40,0.95)',
    color: isLight ? '#1a1a1a' : '#ffffff',
    borderRadius: '14px',
    boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.2)' : '0 10px 40px rgba(0,0,0,0.5)',
    border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)'
  }
  const footer: CSSProperties = {
    padding: '16px 24px',
    background: isLight ? '#fafafa' : 'rgba(0,0,0,0.02)',
    borderTop: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px'
  }

  if (req.kind === 'alert') {
    return (
      <div
        role="presentation"
        style={overlay}
        onClick={() => {
          const r = req
          close()
          r.resolve()
        }}
      >
        <div role="dialog" aria-modal="true" style={card} onClick={(e) => e.stopPropagation()}>
          <div
            style={{
              padding: '24px 24px 10px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <div
              style={{
                background: 'rgba(255,193,7,0.1)',
                padding: '10px',
                borderRadius: '12px',
                display: 'flex'
              }}
            >
              <AlertTriangle size={24} color="var(--warning)" />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{req.opts.title || 'Notice'}</h3>
          </div>
          <div style={{ padding: '10px 24px 24px 24px' }}>
            <p
              style={{
                margin: 0,
                fontSize: '0.95rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5
              }}
            >
              {req.message}
            </p>
          </div>
          <div style={footer}>
            <button
              onClick={() => {
                const r = req
                close()
                r.resolve()
              }}
              className="btn-primary"
              style={{ padding: '8px 16px' }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    )
  }

  // prompt
  return (
    <div
      role="presentation"
      style={overlay}
      onClick={() => {
        const r = req
        close()
        r.resolve(null)
      }}
    >
      <div role="dialog" aria-modal="true" style={card} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '24px 24px 10px 24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{req.message}</h3>
        </div>
        <div style={{ padding: '10px 24px 20px 24px' }}>
          <input
            autoFocus
            type="text"
            value={promptVal}
            onChange={(e) => setPromptVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const r = req
                const v = promptVal
                close()
                r.resolve(v)
              }
            }}
            style={{ width: '100%' }}
          />
        </div>
        <div style={footer}>
          <button
            onClick={() => {
              const r = req
              close()
              r.resolve(null)
            }}
            className="btn-secondary"
            style={{ padding: '8px 16px' }}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const r = req
              const v = promptVal
              close()
              r.resolve(v)
            }}
            className="btn-primary"
            style={{ padding: '8px 16px' }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
