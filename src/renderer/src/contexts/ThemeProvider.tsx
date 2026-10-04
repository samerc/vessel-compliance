import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { ThemeContext, type Theme } from './ThemeContext'

const THEME_CYCLE: Theme[] = ['dark', 'light', 'premium', 'aurora']

function applyTheme(t: Theme): void {
  document.body.classList.remove('light', 'premium', 'aurora')
  if (t === 'light') document.body.classList.add('light')
  else if (t === 'premium') document.body.classList.add('premium')
  else if (t === 'aurora') document.body.classList.add('aurora')
}

export function ThemeProvider({ children }: { children: ReactNode }): ReactElement | null {
  const [theme, setTheme] = useState<Theme>('dark')
  const [loading, setLoading] = useState(true)
  const { user, isAuthenticated } = useAuth()

  useEffect(() => {
    let alive = true
    const loadTheme = async (): Promise<void> => {
      try {
        const savedTheme = await window.api.themeGet()
        if (!alive) return
        setTheme(savedTheme)
        applyTheme(savedTheme)
      } catch (err) {
        console.error('Failed to load theme:', err)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void loadTheme()
    return () => {
      alive = false
    }
  }, [])

  // Reload theme when user changes (login/logout)
  useEffect(() => {
    let alive = true
    const reloadTheme = async (): Promise<void> => {
      if (!isAuthenticated) {
        // Reset to dark theme on logout
        setTheme('dark')
        applyTheme('dark')
        return
      }
      try {
        const savedTheme = await window.api.themeGet()
        if (!alive) return
        setTheme(savedTheme)
        applyTheme(savedTheme)
      } catch (err) {
        console.error('Failed to reload theme:', err)
      }
    }
    void reloadTheme()
    return () => {
      alive = false
    }
  }, [user?.id, isAuthenticated])

  const setThemeTo = async (t: Theme): Promise<void> => {
    setTheme(t)
    applyTheme(t)
    await window.api.themeSet(t)
  }

  const toggleTheme = async (): Promise<void> => {
    const idx = THEME_CYCLE.indexOf(theme)
    await setThemeTo(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length])
  }

  if (loading) return null

  return (
    <ThemeContext.Provider
      value={{ theme, isLight: theme === 'light' || theme === 'aurora', toggleTheme, setThemeTo }}
    >
      {children}
    </ThemeContext.Provider>
  )
}
