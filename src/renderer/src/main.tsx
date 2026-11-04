// App font (bundled: works offline). Latin + Latin Extended, plus Arabic below
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-ext-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-ext-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-ext-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-sans/latin-ext-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
// Arabic (wiki, SIC names): its own font, used only for Arabic letters (unicode-range)
import '@fontsource/ibm-plex-sans-arabic/arabic-400.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-600.css'
import '@fontsource/ibm-plex-sans-arabic/arabic-700.css'
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

import { AuthProvider } from './contexts/AuthProvider'
import { ThemeProvider } from './contexts/ThemeProvider'
import { ToastProvider } from './contexts/ToastProvider'
import { DialogHost } from './components/DialogRoot'

// Up / Down and the mouse wheel never change a number field (amounts, rates, days): too easy to
// do by accident. Capture phase, so a component that stops the key event cannot skip this
const isNumberField = (t: EventTarget | null): boolean =>
  t instanceof HTMLInputElement && t.type === 'number'
document.addEventListener(
  'keydown',
  (e) => {
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && isNumberField(e.target))
      e.preventDefault()
  },
  true
)
document.addEventListener(
  'wheel',
  (e) => {
    if (isNumberField(e.target) && e.target === document.activeElement) e.preventDefault()
  },
  { capture: true, passive: false }
)

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
