import { createContext, useContext } from 'react'

// The provider lives in ThemeProvider.tsx (fast refresh needs component-only files)

export type Theme = 'light' | 'dark' | 'premium' | 'aurora'

export interface ThemeContextType {
  theme: Theme
  isLight: boolean
  toggleTheme: () => void
  setThemeTo: (t: Theme) => void
}

export const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
