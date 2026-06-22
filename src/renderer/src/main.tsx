import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { DialogHost } from './components/DialogHost'


// Block keyboard up/down arrows on number inputs to prevent accidental value changes
document.addEventListener('keydown', e => {
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.target as HTMLElement)?.tagName === 'INPUT' && (e.target as HTMLInputElement)?.type === 'number') {
    e.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <ToastProvider>
          <App />
          <DialogHost />
        </ToastProvider>
      </ThemeProvider>
    </AuthProvider>
  </StrictMode>
)
