import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
  title: ReactNode
  icon?: ReactNode
  onClose: () => void
  children: ReactNode
  /** Buttons for the footer row (right-aligned) */
  footer?: ReactNode
  width?: number | string
  /** Set false for forms where a stray click must not lose input */
  closeOnOverlay?: boolean
}

/** Standard modal: solid themed surface, header with close button, optional footer */
export default function Modal({ title, icon, onClose, children, footer, width = 520, closeOnOverlay = true }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={e => { if (closeOnOverlay && e.target === e.currentTarget) onClose() }}>
      <div className="modal-dialog" role="dialog" aria-modal="true" style={{ width }}>
        <div className="modal-header">
          <h3>{icon}{title}</h3>
          <button className="btn-ghost btn-icon" title="Close" aria-label="Close" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
