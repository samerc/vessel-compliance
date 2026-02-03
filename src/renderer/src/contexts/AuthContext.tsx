import React, { createContext, useContext, useState, useEffect } from 'react'
import { User } from '../../../shared/types'

interface AuthContextType {
    user: Omit<User, 'passwordHash'> | null
    login: (credentials: { username: string; password: string }) => Promise<{ success: boolean; message?: string }>
    logout: () => void
    changePassword: (currentPassword: string, newPassword: string) => Promise<{ success: boolean; message?: string }>
    resetPassword: (username: string) => Promise<{ success: boolean; message?: string; newPassword?: string }>
    isAuthenticated: boolean
    isAdmin: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<Omit<User, 'passwordHash'> | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const checkSession = async () => {
            try {
                // Try the new API name first, then fallback
                const session = await (window.api.getSession ? window.api.getSession() : window.api.authGetSession())
                if (session) {
                    setUser(session)
                }
            } catch (err) {
                console.error('Failed to restore session:', err)
            } finally {
                setLoading(false)
            }
        }
        checkSession()
    }, [])

    const login = async (credentials: { username: string; password: string }) => {
        const result = await (window.api.login ? window.api.login(credentials.username, credentials.password) : window.api.authLogin(credentials))
        if (result.success && result.user) {
            setUser(result.user)
        }
        return result
    }

    const logout = async () => {
        await (window.api.logout ? window.api.logout() : window.api.authLogout())
        setUser(null)
    }

    const changePassword = async (currentPassword: string, newPassword: string) => {
        if (!window.api.changePassword) {
            return { success: false, message: 'Password change not supported in this version' }
        }
        return await window.api.changePassword(currentPassword, newPassword)
    }

    const resetPassword = async (username: string) => {
        return await window.api.authResetPassword(username)
    }

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-slate-900 text-white">Loading...</div>
    }

    return (
        <AuthContext.Provider
            value={{
                user,
                login,
                logout,
                changePassword,
                resetPassword,
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
