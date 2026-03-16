import React, { createContext, useContext, useState, useEffect } from 'react'
import { useAuth } from './AuthContext'

type Theme = 'light' | 'dark' | 'premium'

const THEME_CYCLE: Theme[] = ['dark', 'light', 'premium']

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
    setThemeTo: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>('dark')
    const [loading, setLoading] = useState(true)
    const { user, isAuthenticated } = useAuth()

    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await window.api.themeGet()
                setTheme(savedTheme as Theme)
                applyTheme(savedTheme as Theme)
            } catch (err) {
                console.error('Failed to load theme:', err)
            } finally {
                setLoading(false)
            }
        }
        loadTheme()
    }, [])

    // Reload theme when user changes (login/logout)
    useEffect(() => {
        if (!isAuthenticated) {
            // Reset to dark theme on logout
            setTheme('dark')
            applyTheme('dark')
            return
        }

        // Reload theme when user logs in or changes
        const reloadTheme = async () => {
            try {
                const savedTheme = await window.api.themeGet()
                setTheme(savedTheme as Theme)
                applyTheme(savedTheme as Theme)
            } catch (err) {
                console.error('Failed to reload theme:', err)
            }
        }
        reloadTheme()
    }, [user?.id, isAuthenticated])

    const applyTheme = (t: Theme) => {
        document.body.classList.remove('light', 'premium')
        if (t === 'light') document.body.classList.add('light')
        else if (t === 'premium') document.body.classList.add('premium')
    }

    const toggleTheme = async () => {
        const idx = THEME_CYCLE.indexOf(theme)
        const newTheme = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]
        setTheme(newTheme)
        applyTheme(newTheme)
        await window.api.themeSet(newTheme as any)
    }

    const setThemeTo = async (t: Theme) => {
        setTheme(t)
        applyTheme(t)
        await window.api.themeSet(t as any)
    }

    if (loading) return null

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setThemeTo }}>
            {children}
        </ThemeContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeContext)
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider')
    }
    return context
}
