import * as bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { db } from './mysql/adapter'
import { User } from '../shared/types'
import Store from 'electron-store'

const store = new Store()

interface LoginAttempt {
    count: number
    firstAttempt: number
    lastAttempt: number
    lockedUntil?: number
}

export class AuthService {
    private sessions: Map<string, { user: Omit<User, 'passwordHash'>; timestamp: number }> = new Map()
    private loginAttempts: Map<string, LoginAttempt> = new Map()
    private readonly SESSION_TIMEOUT = 30 * 24 * 60 * 60 * 1000 // 30 days for persistent login
    private readonly MAX_LOGIN_ATTEMPTS = 5
    private readonly LOCKOUT_DURATION = 15 * 60 * 1000 // 15 minutes
    private readonly ATTEMPT_WINDOW = 15 * 60 * 1000 // 15 minutes window to track attempts

    constructor() {
        // Restore session on startup
        this.restoreSession()
    }

    private saveSessionToDisk(sessionId: string, user: Omit<User, 'passwordHash'>): void {
        store.set('persistentSession', {
            sessionId,
            user,
            timestamp: Date.now()
        })
    }

    private clearSessionFromDisk(): void {
        store.delete('persistentSession')
    }

    private restoreSession(): void {
        const savedSession = store.get('persistentSession') as { sessionId: string; user: Omit<User, 'passwordHash'>; timestamp: number } | undefined

        if (savedSession) {
            // Check if session is still valid (not expired)
            if (Date.now() - savedSession.timestamp < this.SESSION_TIMEOUT) {
                this.sessions.set(savedSession.sessionId, {
                    user: savedSession.user,
                    timestamp: savedSession.timestamp
                })
                console.log(`[AuthService] Restored session for user: ${savedSession.user.username} (ID: ${savedSession.sessionId})`)
            } else {
                console.log('[AuthService] Persistent session found but expired')
                // Session expired, clear it
                this.clearSessionFromDisk()
            }
        } else {
            console.log('[AuthService] No persistent session found on disk')
        }
    }

    getCurrentUser(sessionId?: string): Omit<User, 'passwordHash'> | null {
        if (!sessionId) return null

        const session = this.sessions.get(sessionId)
        if (!session) return null

        // Check if session is expired
        if (Date.now() - session.timestamp > this.SESSION_TIMEOUT) {
            this.sessions.delete(sessionId)
            this.clearSessionFromDisk()
            return null
        }

        // Update timestamp on activity
        session.timestamp = Date.now()
        this.saveSessionToDisk(sessionId, session.user)
        return session.user
    }

    getSessionData(sessionId?: string): { user: Omit<User, 'passwordHash'>; timestamp: number } | null {
        if (!sessionId) return null
        return this.sessions.get(sessionId) || null
    }

    isAdmin(sessionId?: string): boolean {
        const user = this.getCurrentUser(sessionId)
        return user?.role === 'admin'
    }

    createSession(user: Omit<User, 'passwordHash'>): string {
        const sessionId = uuidv4()
        this.sessions.set(sessionId, { user, timestamp: Date.now() })
        this.saveSessionToDisk(sessionId, user)
        return sessionId
    }

    clearSession(sessionId: string): void {
        this.sessions.delete(sessionId)
        this.clearSessionFromDisk()
    }

    async createInitialAdmin(): Promise<boolean> {
        const count = await db.getUserCount()
        if (count === 0) {
            const passwordHash = await bcrypt.hash('admin123', 10)
            const admin: User = {
                id: uuidv4(),
                username: 'admin',
                passwordHash,
                role: 'admin'
            }
            await db.addUser(admin)
            return true
        }
        return false
    }

    async login(username: string, password: string): Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; sessionId?: string; message?: string }> {
        const now = Date.now()

        // Security: Check if account is locked
        const attempt = this.loginAttempts.get(username)
        if (attempt?.lockedUntil && attempt.lockedUntil > now) {
            const remainingMinutes = Math.ceil((attempt.lockedUntil - now) / 60000)
            return {
                success: false,
                message: `Account temporarily locked. Try again in ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`
            }
        }

        const user = await db.getUser(username)

        if (!user) {
            // Security: Record failed attempt even for non-existent users (prevent enumeration)
            this.recordFailedAttempt(username)
            return { success: false, message: 'Invalid username or password' }
        }

        const match = await bcrypt.compare(password, user.passwordHash)
        if (!match) {
            // Security: Record failed attempt
            this.recordFailedAttempt(username)
            const currentAttempt = this.loginAttempts.get(username)
            const remaining = this.MAX_LOGIN_ATTEMPTS - (currentAttempt?.count || 0)

            if (remaining <= 0) {
                return {
                    success: false,
                    message: 'Account locked due to too many failed attempts. Please try again in 15 minutes.'
                }
            } else if (remaining <= 2) {
                return {
                    success: false,
                    message: `Invalid password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining before account lockout.`
                }
            }

            return { success: false, message: 'Invalid username or password' }
        }

        // Security: Clear failed attempts on successful login
        this.loginAttempts.delete(username)

        // Record last login timestamp (fire and forget)
        db.updateUserLastLogin(user.id).catch(() => {})

        // Return user without hash and create session
        const { passwordHash, ...safeUser } = user
        const sessionId = this.createSession(safeUser)
        return { success: true, user: safeUser, sessionId }
    }

    private recordFailedAttempt(username: string): void {
        const now = Date.now()
        const attempt = this.loginAttempts.get(username)

        if (!attempt || now - attempt.firstAttempt > this.ATTEMPT_WINDOW) {
            // Start new attempt window
            this.loginAttempts.set(username, {
                count: 1,
                firstAttempt: now,
                lastAttempt: now
            })
        } else {
            // Increment existing attempts
            attempt.count++
            attempt.lastAttempt = now

            // Lock account if max attempts reached
            if (attempt.count >= this.MAX_LOGIN_ATTEMPTS) {
                attempt.lockedUntil = now + this.LOCKOUT_DURATION
                console.warn(`Account locked for username: ${username} due to ${attempt.count} failed login attempts`)
            }

            this.loginAttempts.set(username, attempt)
        }
    }

    logout(sessionId: string): void {
        this.clearSession(sessionId)
    }

    async createUser(username: string, password: string, role: 'admin' | 'user'): Promise<{ success: boolean; message?: string }> {
        const existing = await db.getUser(username)
        if (existing) {
            return { success: false, message: 'Username already exists' }
        }

        const passwordHash = await bcrypt.hash(password, 10)
        await db.addUser({
            id: uuidv4(),
            username,
            passwordHash,
            role
        })
        return { success: true }
    }

    async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<{ success: boolean; message?: string }> {
        // Get user by ID
        const user = await db.getUserById(userId)
        if (!user) {
            return { success: false, message: 'User not found' }
        }

        // Verify current password
        const match = await bcrypt.compare(currentPassword, user.passwordHash)
        if (!match) {
            return { success: false, message: 'Current password is incorrect' }
        }

        // Validate new password
        if (newPassword.length < 6) {
            return { success: false, message: 'New password must be at least 6 characters long' }
        }

        // Hash and update password
        const newPasswordHash = await bcrypt.hash(newPassword, 10)
        await db.updateUserPassword(userId, newPasswordHash)

        return { success: true, message: 'Password changed successfully' }
    }

    async resetPassword(username: string): Promise<{ success: boolean; message?: string; newPassword?: string }> {
        const user = await db.getUser(username)
        if (!user) {
            return { success: false, message: 'User not found' }
        }

        // Generate a simple temporary password (as requested)
        const tempPassword = Math.random().toString(36).slice(-8)
        const passwordHash = await bcrypt.hash(tempPassword, 10)

        await db.updateUserPassword(user.id, passwordHash)

        return {
            success: true,
            message: 'Password has been reset',
            newPassword: tempPassword
        }
    }


    // Get the first available session (for auto-login)
    getFirstSession(): { sessionId: string; user: Omit<User, 'passwordHash'> } | null {
        const firstEntry = this.sessions.entries().next()
        if (firstEntry.done) return null

        const [sessionId, session] = firstEntry.value
        return { sessionId, user: session.user }
    }

    // Validate that restored sessions still have a live DB user — call after DB connects
    async validateRestoredSessions(): Promise<void> {
        for (const [sessionId, session] of this.sessions) {
            try {
                const user = await db.getUserById(session.user.id)
                if (!user) {
                    console.warn(`[AuthService] Clearing stale session for deleted user: ${session.user.username}`)
                    this.sessions.delete(sessionId)
                    this.clearSessionFromDisk()
                }
            } catch {
                // DB not ready yet — leave session intact, it will be validated on next use
            }
        }
    }
}

export const auth = new AuthService()
