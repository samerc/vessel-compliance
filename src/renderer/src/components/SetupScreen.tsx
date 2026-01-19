import React, { useState } from 'react'

export const SetupScreen: React.FC = () => {
    const [formData, setFormData] = useState({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: '',
        database: 'vessel_compliance'
    })
    const [directory, setDirectory] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const handleSelectDir = async () => {
        const path = await window.api.setupSelectDirectory()
        if (path) setDirectory(path)
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')

        if (!directory) {
            setError('Please select a storage directory for the configuration.')
            return
        }

        setLoading(true)

        try {
            const result = await window.api.setupSaveConfig(formData, directory)
            if (!result.success) {
                setError(result.message || 'Failed to save configuration')
            }
        } catch (err: any) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen items-center justify-center" style={{ background: 'var(--bg-dark)' }}>
            <div className="w-full max-w-md glass-card p-8 shadow-2xl border" style={{ borderColor: 'var(--glass-border)', color: 'var(--text-primary)' }}>
                <h2 className="mb-2 text-center text-3xl font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>System Setup</h2>
                <p className="mb-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                    Configure your MySQL database and <br /> choose a storage location for settings.
                </p>

                {error && (
                    <div className="mb-6 rounded-lg p-3 text-sm border" style={{ background: 'rgba(255, 77, 77, 0.1)', color: 'var(--danger)', borderColor: 'rgba(255, 77, 77, 0.2)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Config Storage Directory</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                readOnly
                                value={directory}
                                placeholder="Select a folder..."
                                className="block w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                                required
                            />
                            <button
                                type="button"
                                onClick={handleSelectDir}
                                className="px-4 py-2 bg-white/10 rounded-lg text-sm hover:bg-white/20 transition-all border border-white/10"
                            >
                                Browse
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-3">
                            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Host</label>
                            <input
                                type="text"
                                name="host"
                                value={formData.host}
                                onChange={handleChange}
                                className="block w-full"
                                required
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Port</label>
                            <input
                                type="number"
                                name="port"
                                value={formData.port}
                                onChange={handleChange}
                                className="block w-full"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Database Name</label>
                        <input
                            type="text"
                            name="database"
                            value={formData.database}
                            onChange={handleChange}
                            className="block w-full"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>User</label>
                            <input
                                type="text"
                                name="user"
                                value={formData.user}
                                onChange={handleChange}
                                className="block w-full"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-secondary)' }}>Password</label>
                            <input
                                type="password"
                                name="password"
                                value={formData.password}
                                onChange={handleChange}
                                className="block w-full"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-4 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3 text-sm font-bold text-white shadow-xl hover:shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                    >
                        {loading ? 'Testing Connection...' : 'Save & Initialize System'}
                    </button>
                </form>
            </div>
        </div>
    )
}
