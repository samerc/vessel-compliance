import { createContext, useContext } from 'react'
import type { User } from '../../../shared/types'

// The provider lives in AuthProvider.tsx (fast refresh needs component-only files)

export interface AuthContextType {
  user: Omit<User, 'passwordHash'> | null
  login: (credentials: {
    username: string
    password: string
  }) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  changePassword: (
    currentPassword: string,
    newPassword: string
  ) => Promise<{ success: boolean; message?: string }>
  resetPassword: (
    username: string
  ) => Promise<{ success: boolean; message?: string; newPassword?: string }>
  isAuthenticated: boolean
  isAdmin: boolean
  permissions: Set<string>
  hasPermission: (key: string) => boolean
  refreshPermissions: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
