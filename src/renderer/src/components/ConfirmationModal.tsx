import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'

interface ConfirmationModalProps {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  isDangerous?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmationModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDangerous = false,
  onConfirm,
  onCancel
}: ConfirmationModalProps): React.JSX.Element {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return

    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    // Auto-focus the cancel button for safety if dangerous, otherwise confirm
    if (isDangerous) {
      ;(focusable[1] || first)?.focus() // Try to focus cancel button usually second
    } else {
      first?.focus()
    }

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Only this dialog closes, not a Modal underneath
        e.stopPropagation()
        onCancel()
        return
      }
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last?.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, isDangerous])

  return (
    <div role="presentation" className="modal-overlay" style={{ zIndex: 1200 }} onClick={onCancel}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-modal-title"
        className="modal-dialog"
        style={{ width: 500 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id="confirmation-modal-title">
            <AlertTriangle size={18} color={isDangerous ? 'var(--danger)' : 'var(--warning)'} />
            {title}
          </h3>
        </div>

        <div className="modal-body">
          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary)',
              lineHeight: 1.5,
              whiteSpace: 'pre-line'
            }}
          >
            {message}
          </p>
        </div>

        <div className="modal-footer">
          <button onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className={isDangerous ? 'btn-danger' : 'btn-primary'}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
