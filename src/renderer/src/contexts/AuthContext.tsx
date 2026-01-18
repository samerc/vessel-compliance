import React, { createContext, useContext, useState, useEffect } from 'react'
import { User } from '../../../shared/types'

interface AuthContextType {
    user: Omit<User, 'passwordHash'> | null
    login: (credentials: { username: string; password: string }) => Promise<{ success: boolean; message?: string }>
    logout: () => void
    isAuthenticated: boolean
    isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Omit<User, 'passwordHash'> | null>(null)

    const login = async (credentials: { username: string; password: string }) => {
        const result = await window.api.authLogin(credentials)
        if (result.success && result.user) {
            setUser(result.user)
        }
        return result
    }

    const logout = () => {
        setUser(null)
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                logout,
                isAuthenticated: !!user,
                isAdmin: user?.role === 'admin'
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
