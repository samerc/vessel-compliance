import * as bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { db } from './mysql/adapter'
import { User } from '../shared/types'

export class AuthService {
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

    async login(username: string, password: string): Promise<{ success: boolean; user?: Omit<User, 'passwordHash'>; message?: string }> {
        const user = await db.getUser(username)

        if (!user) {
            return { success: false, message: 'User not found' }
        }

        const match = await bcrypt.compare(password, user.passwordHash)
        if (!match) {
            return { success: false, message: 'Invalid password' }
        }

        // Return user without hash
        const { passwordHash, ...safeUser } = user
        return { success: true, user: safeUser }
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
}

export const auth = new AuthService()
