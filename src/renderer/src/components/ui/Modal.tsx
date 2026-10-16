import { ReactNode, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

const openModals: object[] = []

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
export default function Modal({
  title,
  icon,
  onClose,
  children,
  footer,
  width = 520,
  closeOnOverlay = true
}: ModalProps): React.JSX.Element {
  // Escape closes only the top dialog when one opens another
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])
  useEffect(() => {
    const token = {}
    openModals.push(token)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && openModals[openModals.length - 1] === token) {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      openModals.splice(openModals.indexOf(token), 1)
    }
  }, [])

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (closeOnOverlay && e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal-dialog" role="dialog" aria-modal="true" style={{ width }}>
        <div className="modal-header">
          <h3>
            {icon}
            {title}
          </h3>
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
