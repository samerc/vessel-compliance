import React, { useState, useEffect } from 'react'

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
  const [currentConfigPath, setCurrentConfigPath] = useState<string | null>(null)
  const [selectedConfigFile, setSelectedConfigFile] = useState<string | null>(null)

  useEffect(() => {
    window.api.setupGetConfigPath().then(setCurrentConfigPath)
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSelectDir = async () => {
    const path = await window.api.setupSelectDirectory()
    if (path) setDirectory(path)
  }

  const handleBrowseConfigFile = async () => {
    const filePath = await window.api.setupSelectConfigFile()
    if (filePath) {
      setSelectedConfigFile(filePath)
      setError('')
    }
  }

  const handleLoadConfigFile = async () => {
    if (!selectedConfigFile) return

    setLoading(true)
    setError('')
    try {
      const result = await window.api.setupLoadConfigFromFile(selectedConfigFile)
      if (result.success) {
        window.location.reload()
      } else {
        setError(result.message || 'Failed to load configuration')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
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

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '6px',
    color: 'var(--text-secondary)'
  }
  const pathBox: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    background: 'var(--input-bg)',
    border: '1px solid var(--input-border)',
    color: 'var(--text-primary)'
  }

  return (
    <div
      style={{
        display: 'flex',
        height: '100vh',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-dark)',
        padding: '20px',
        overflowY: 'auto'
      }}
    >
      <div
        className="glass-card"
        style={{
          width: '100%',
          maxWidth: '460px',
          padding: '32px',
          border: 'var(--glass-border)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
          color: 'var(--text-primary)'
        }}
      >
        <h2
          style={{
            margin: '0 0 8px',
            textAlign: 'center',
            fontSize: '1.75rem',
            fontWeight: 700,
            color: 'var(--text-primary)'
          }}
        >
          System Setup
        </h2>
        <p
          style={{
            margin: '0 0 28px',
            textAlign: 'center',
            fontSize: '0.875rem',
            color: 'var(--text-secondary)'
          }}
        >
          Browse for an existing config file or create a new database connection.
        </p>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            style={{
              marginBottom: '20px',
              borderRadius: '8px',
              padding: '12px',
              fontSize: '0.875rem',
              background: 'rgba(255, 77, 77, 0.1)',
              color: 'var(--danger)',
              border: '1px solid rgba(255, 77, 77, 0.2)'
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={labelStyle}>Current Configuration File</div>
          <div style={pathBox}>{currentConfigPath || 'Not set'}</div>
        </div>

        <div
          style={{
            marginBottom: '28px',
            padding: '16px',
            borderRadius: '10px',
            border: '1px solid rgba(var(--accent-primary-rgb), 0.3)',
            background: 'rgba(var(--accent-primary-rgb), 0.06)'
          }}
        >
          <h3
            style={{
              margin: '0 0 12px',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: 'var(--text-primary)'
            }}
          >
            Load Existing Configuration
          </h3>
          <button
            type="button"
            onClick={handleBrowseConfigFile}
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%' }}
          >
            Browse for db-config.json
          </button>

          {selectedConfigFile && (
            <div style={{ marginTop: '12px' }}>
              <div
                style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}
              >
                Selected file:
              </div>
              <div style={{ ...pathBox, marginBottom: '12px' }}>{selectedConfigFile}</div>
              <button
                type="button"
                onClick={handleLoadConfigFile}
                disabled={loading}
                className="btn-primary"
                style={{ width: '100%', background: 'var(--success)' }}
              >
                {loading ? 'Loading...' : 'Load Configuration'}
              </button>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '24px',
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)'
          }}
        >
          <div style={{ flex: 1, borderTop: '1px solid var(--glass-border-color)' }} />
          Or configure manually
          <div style={{ flex: 1, borderTop: '1px solid var(--glass-border-color)' }} />
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}
        >
          <div>
            <label htmlFor="setup-directory" style={labelStyle}>
              Config Storage Directory
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="setup-directory"
                type="text"
                readOnly
                value={directory}
                placeholder="Select a folder..."
                style={{ flex: 1, minWidth: 0 }}
                required
              />
              <button
                type="button"
                onClick={handleSelectDir}
                aria-label="Browse for configuration directory"
                className="btn-secondary"
              >
                Browse
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '14px' }}>
            <div>
              <label htmlFor="setup-host" style={labelStyle}>
                Host
              </label>
              <input
                id="setup-host"
                type="text"
                name="host"
                value={formData.host}
                onChange={handleChange}
                style={{ width: '100%' }}
                required
              />
            </div>
            <div>
              <label htmlFor="setup-port" style={labelStyle}>
                Port
              </label>
              <input
                id="setup-port"
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                style={{ width: '100%' }}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="setup-database" style={labelStyle}>
              Database Name
            </label>
            <input
              id="setup-database"
              type="text"
              name="database"
              value={formData.database}
              onChange={handleChange}
              style={{ width: '100%' }}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label htmlFor="setup-user" style={labelStyle}>
                User
              </label>
              <input
                id="setup-user"
                type="text"
                name="user"
                value={formData.user}
                onChange={handleChange}
                style={{ width: '100%' }}
                required
              />
            </div>
            <div>
              <label htmlFor="setup-password" style={labelStyle}>
                Password
              </label>
              <input
                id="setup-password"
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
            style={{ width: '100%', marginTop: '8px', padding: '12px' }}
          >
            {loading ? 'Testing Connection...' : 'Save & Initialize System'}
          </button>
        </form>
      </div>
    </div>
  )
}
