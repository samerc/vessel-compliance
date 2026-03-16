import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

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
}: ConfirmationModalProps) {
    const { theme } = useTheme()
    const isLight = theme === 'light'
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
            (focusable[1] || first)?.focus() // Try to focus cancel button usually second
        } else {
            first?.focus()
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
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
        <div
            role="presentation"
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(4px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000
            }}
            onClick={onCancel}
        >
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirmation-modal-title"
                className="glass-card"
                style={{
                    width: '90%',
                    maxWidth: '500px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: isLight ? '#ffffff' : 'rgba(30, 30, 40, 0.95)',
                    color: isLight ? '#1a1a1a' : '#ffffff',
                    boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.2)' : '0 10px 40px rgba(0,0,0,0.5)',
                    border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)'
                }}
                onClick={e => e.stopPropagation()}
            >
                <div style={{ padding: '24px 24px 10px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        background: isDangerous ? 'rgba(255, 77, 77, 0.1)' : 'rgba(255, 193, 7, 0.1)',
                        padding: '10px',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <AlertTriangle size={24} color={isDangerous ? 'var(--danger)' : 'var(--warning)'} />
                    </div>
                    <h3 id="confirmation-modal-title" style={{ margin: 0, fontSize: '1.2rem' }}>{title}</h3>
                </div>

                <div style={{ padding: '10px 24px 24px 24px', flex: 1 }}>
                    <p style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        {message}
                    </p>
                </div>

                <div style={{
                    padding: '16px 24px',
                    background: isLight ? '#fafafa' : 'rgba(0,0,0,0.02)',
                    borderTop: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '12px'
                }}>
                    <button
                        onClick={onCancel}
                        className="btn-secondary"
                        style={{ padding: '8px 16px' }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="btn-primary"
                        style={{
                            padding: '8px 16px',
                            background: isDangerous ? 'var(--danger)' : 'var(--accent-primary)',
                            borderColor: isDangerous ? 'var(--danger)' : 'var(--accent-primary)'
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}
