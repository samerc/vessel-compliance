import { useState, useEffect, type ReactElement } from 'react'
import { AlertTriangle } from 'lucide-react'
import ConfirmationModal from './ConfirmationModal'
import { setDialogListener, type DialogRequest } from './DialogHost'

// Renders the in-app confirm / alert / prompt dialogs requested through DialogHost.tsx

export function DialogHost(): ReactElement | null {
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

  if (req.kind === 'alert') {
    return (
      <div
        role="presentation"
        className="modal-overlay"
        style={{ zIndex: 1200 }}
        onClick={() => {
          const r = req
          close()
          r.resolve()
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          className="modal-dialog"
          style={{ width: 500 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h3>
              <AlertTriangle size={18} color="var(--warning)" />
              {req.opts.title || 'Notice'}
            </h3>
          </div>
          <div className="modal-body">
            <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {req.message}
            </p>
          </div>
          <div className="modal-footer">
            <button
              onClick={() => {
                const r = req
                close()
                r.resolve()
              }}
              className="btn-primary"
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
      className="modal-overlay"
      style={{ zIndex: 1200 }}
      onClick={() => {
        const r = req
        close()
        r.resolve(null)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="modal-dialog"
        style={{ width: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{req.message}</h3>
        </div>
        <div className="modal-body">
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
        <div className="modal-footer">
          <button
            onClick={() => {
              const r = req
              close()
              r.resolve(null)
            }}
            className="btn-secondary"
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
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}
