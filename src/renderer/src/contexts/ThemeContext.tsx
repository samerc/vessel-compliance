import React, { createContext, useContext, useState, useEffect } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextType {
    theme: Theme
    toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>('dark')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const loadTheme = async () => {
            try {
                const savedTheme = await window.api.themeGet()
                setTheme(savedTheme)
                applyTheme(savedTheme)
            } catch (err) {
                console.error('Failed to load theme:', err)
            } finally {
                setLoading(false)
            }
        }
        loadTheme()
    }, [])

    const applyTheme = (t: Theme) => {
        if (t === 'light') {
            document.body.classList.add('light')
        } else {
            document.body.classList.remove('light')
        }
    }

    const toggleTheme = async () => {
        const newTheme = theme === 'light' ? 'dark' : 'light'
        setTheme(newTheme)
        applyTheme(newTheme)
        await window.api.themeSet(newTheme)
    }

    if (loading) return null

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
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
