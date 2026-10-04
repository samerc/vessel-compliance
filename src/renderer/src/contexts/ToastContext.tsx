import { createContext, useContext } from 'react'

// The provider (and the toast list it renders) lives in ToastProvider.tsx

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

export const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast(): ToastContextType {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}
