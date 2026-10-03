import * as bcrypt from 'bcryptjs'
import { randomUUID as uuidv4, randomBytes, createHash } from 'crypto'
import { db } from './mysql/adapter'
import { User } from '../shared/types'
import Store from 'electron-store'

const store = new Store()

const hashSessionId = (sessionId: string): string => createHash('sha256').update(sessionId).digest('hex')

interface LoginAttempt {
    count: number
    firstAttempt: number
    lastAttempt: number
    lockedUntil?: number
}

export class AuthService {
    // verified = false for a session restored from the local store until it has been checked
    // against user_sessions and its user (role) re-read from the DB. Unverified sessions are
    // never honoured: the persisted user object is untrusted input.
    private sessions: Map<string, { user: Omit<User, 'passwordHash'>; timestamp: number; verified: boolean }> = new Map()
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
                    timestamp: savedSession.timestamp,
                    verified: false
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
        if (!session || !session.verified) return null

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
        const session = this.sessions.get(sessionId)
        return session && session.verified ? session : null
    }

    isAdmin(sessionId?: string): boolean {
        const user = this.getCurrentUser(sessionId)
        return user?.role === 'admin'
    }

    createSession(user: Omit<User, 'passwordHash'>): string {
        const sessionId = uuidv4()
        this.sessions.set(sessionId, { user, timestamp: Date.now(), verified: true })
        this.saveSessionToDisk(sessionId, user)
        db.createUserSession(hashSessionId(sessionId), user.id).catch(err => console.error('[AuthService] Failed to record session:', err))
        return sessionId
    }

    clearSession(sessionId: string): void {
        this.sessions.delete(sessionId)
        this.clearSessionFromDisk()
        db.deleteUserSession(hashSessionId(sessionId)).catch(() => {})
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

        // Still on the seeded default password: force a change before the app can be used
        if (password === 'admin123') {
            await db.setForcePasswordReset(user.id).catch(() => {})
        }

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

    async createUser(username: string, password: string, role: 'admin' | 'user'): Promise<{ success: boolean; message?: string; userId?: string }> {
        const existing = await db.getUser(username)
        if (existing) {
            return { success: false, message: 'Username already exists' }
        }

        const passwordHash = await bcrypt.hash(password, 10)
        const userId = uuidv4()
        await db.addUser({
            id: userId,
            username,
            passwordHash,
            role
        })
        return { success: true, userId }
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
        if (newPassword === 'admin123') {
            return { success: false, message: 'Please choose a password other than the default one' }
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
        const tempPassword = randomBytes(6).toString('base64url').slice(0, 10)
        const passwordHash = await bcrypt.hash(tempPassword, 10)

        await db.updateUserPassword(user.id, passwordHash)
        // An admin reset ends that user's remembered logins everywhere
        await db.deleteUserSessionsForUser(user.id).catch(() => {})

        return {
            success: true,
            message: 'Password has been reset',
            newPassword: tempPassword
        }
    }


    // Get the first available session (for auto-login)
    getFirstSession(): { sessionId: string; user: Omit<User, 'passwordHash'> } | null {
        for (const [sessionId, session] of this.sessions) {
            if (session.verified) return { sessionId, user: session.user }
        }
        return null
    }

    // Verify sessions restored from the local store; call after the DB connects (startup and
    // auth:getSession). A session is accepted only when user_sessions holds its id for that same
    // user; the user record (role) is then re-read from the DB. Anything else is dropped and the
    // user logs in again. DB not reachable: stays unverified (not honoured) and is retried.
    async validateRestoredSessions(): Promise<void> {
        for (const [sessionId, session] of this.sessions) {
            if (session.verified) continue
            try {
                const ownerId = await db.getUserSessionOwner(hashSessionId(sessionId))
                const fresh = ownerId && ownerId === session.user.id ? await db.getUserById(ownerId) : null
                if (!fresh) {
                    console.warn(`[AuthService] Discarding unverifiable restored session (${session.user?.username || 'unknown'})`)
                    this.sessions.delete(sessionId)
                    this.clearSessionFromDisk()
                    continue
                }
                const { passwordHash: _ph, ...safeUser } = fresh
                session.user = safeUser
                session.verified = true
                this.saveSessionToDisk(sessionId, safeUser)
            } catch {
                // DB not ready yet: leave unverified; retried on the next auth:getSession
            }
        }
    }

    /** Refresh the cached user of every live session for this user (e.g. after a role change). */
    async refreshUser(userId: string): Promise<void> {
        const fresh = await db.getUserById(userId)
        for (const [sessionId, session] of this.sessions) {
            if (session.user.id !== userId) continue
            if (!fresh) { this.sessions.delete(sessionId); continue }
            const { passwordHash: _ph, ...safeUser } = fresh
            session.user = { ...session.user, ...safeUser }
        }
    }
}

export const auth = new AuthService()
