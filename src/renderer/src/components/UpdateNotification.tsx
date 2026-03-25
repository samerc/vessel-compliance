import { useState, useEffect } from 'react'
import { X, Download, RefreshCw, AlertCircle, FileText, Sparkles } from 'lucide-react'
import ChangelogModal from './ChangelogModal'

interface UpdateInfo {
    version: string
    releaseDate?: string
    releaseName?: string
    releaseNotes?: string
}

interface DownloadProgress {
    percent: number
    bytesPerSecond: number
    transferred: number
    total: number
}

type UpdateState =
    | { type: 'idle' }
    | { type: 'checking' }
    | { type: 'available'; info: UpdateInfo }
    | { type: 'downloading'; progress: DownloadProgress; info: UpdateInfo }
    | { type: 'ready'; info: UpdateInfo }
    | { type: 'error'; message: string }

/** Parse release notes into bullet items for preview */
function parsePreviewItems(notes: string): string[] {
    const items: string[] = []
    for (const raw of notes.split('\n')) {
        const line = raw.trim()
        if (!line) continue
        const bullet = line.match(/^[*-]\s+(?:(?:New|Improved|Fixed):\s+)?(.+)/i)
        if (bullet) items.push(bullet[1].trim())
    }
    return items.slice(0, 5) // Show at most 5 items
}

export function UpdateNotification(): React.ReactElement | null {
    const [updateState, setUpdateState] = useState<UpdateState>({ type: 'idle' })
    const [dismissed, setDismissed] = useState(false)
    const [showNotes, setShowNotes] = useState(false)
    const [showPreview, setShowPreview] = useState(false)

    useEffect(() => {
        // Listen for update events — store cleanup functions
        const unsub1 = window.api.onUpdateChecking(() => {
            setUpdateState({ type: 'checking' })
            setDismissed(false)
        })

        const unsub2 = window.api.onUpdateAvailable((info) => {
            setUpdateState({ type: 'available', info })
            setDismissed(false)
            if (info.releaseNotes) {
                setShowPreview(true)
            }
        })

        const unsub3 = window.api.onUpdateNotAvailable(() => {
            setUpdateState({ type: 'idle' })
        })

        const unsub4 = window.api.onUpdateDownloadProgress((progress) => {
            setUpdateState((prev) => {
                if (prev.type === 'available' || prev.type === 'downloading') {
                    return { type: 'downloading', progress, info: prev.info }
                }
                return prev
            })
        })

        const unsub5 = window.api.onUpdateDownloaded((info) => {
            setUpdateState({ type: 'ready', info })
            setDismissed(false)
        })

        const unsub6 = window.api.onUpdateError((error) => {
            setUpdateState({ type: 'error', message: error.message })
            setDismissed(false)
        })

        return () => {
            unsub1?.()
            unsub2?.()
            unsub3?.()
            unsub4?.()
            unsub5?.()
            unsub6?.()
        }
    }, [])

    const handleInstall = () => {
        window.api.updateQuitAndInstall()
    }

    const handleDismiss = () => {
        setDismissed(true)
        setShowPreview(false)
    }

    const handleCheckForUpdates = () => {
        window.api.updateCheckForUpdates()
    }

    // Don't show notification if dismissed or idle
    if (dismissed || updateState.type === 'idle') {
        return null
    }

    // Format bytes to human readable
    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
    }

    // Format speed
    const formatSpeed = (bytesPerSecond: number): string => {
        return formatBytes(bytesPerSecond) + '/s'
    }

    return (
        <div className="update-notification">
            <div className="update-notification-content">
                {updateState.type === 'checking' && (
                    <>
                        <RefreshCw className="update-icon spinning" size={20} />
                        <div className="update-text">
                            <div className="update-title">Checking for updates...</div>
                        </div>
                    </>
                )}

                {updateState.type === 'available' && (
                    <>
                        <Sparkles className="update-icon" size={20} />
                        <div className="update-text">
                            <div className="update-title">Update Available — v{updateState.info.version}</div>
                            <div className="update-description">
                                Downloading in the background...
                            </div>
                            {updateState.info.releaseNotes && (
                                <button
                                    className="update-notes-link"
                                    onClick={() => setShowPreview(true)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--accent-primary)',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        padding: '4px 0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    <Sparkles size={12} /> What's New in v{updateState.info.version}
                                </button>
                            )}
                        </div>
                        <button className="update-dismiss-btn" onClick={handleDismiss}>
                            <X size={16} />
                        </button>
                    </>
                )}

                {updateState.type === 'downloading' && (
                    <>
                        <Download className="update-icon" size={20} />
                        <div className="update-text">
                            <div className="update-title">Downloading Update</div>
                            <div className="update-description">
                                {Math.round(updateState.progress.percent)}% - {formatBytes(updateState.progress.transferred)} / {formatBytes(updateState.progress.total)} ({formatSpeed(updateState.progress.bytesPerSecond)})
                            </div>
                            <div className="update-progress-bar">
                                <div
                                    className="update-progress-fill"
                                    style={{ width: `${updateState.progress.percent}%` }}
                                />
                            </div>
                        </div>
                        <button className="update-dismiss-btn" onClick={handleDismiss}>
                            <X size={16} />
                        </button>
                    </>
                )}

                {updateState.type === 'ready' && (
                    <>
                        <Download className="update-icon update-ready" size={20} />
                        <div className="update-text">
                            <div className="update-title">Update Ready to Install</div>
                            <div className="update-description">
                                Version {updateState.info.version} has been downloaded
                            </div>
                            {updateState.info.releaseNotes && (
                                <button
                                    className="update-notes-link"
                                    onClick={() => setShowNotes(true)}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--accent-primary)',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        padding: '4px 0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    <FileText size={12} /> View Release Notes
                                </button>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button className="update-install-btn" onClick={handleInstall}>
                                Restart & Update
                            </button>
                            <button className="update-dismiss-btn" onClick={handleDismiss}>
                                <X size={16} />
                            </button>
                        </div>
                    </>
                )}

                {updateState.type === 'error' && (
                    <>
                        <AlertCircle className="update-icon update-error" size={20} />
                        <div className="update-text">
                            <div className="update-title">Update Error</div>
                            <div className="update-description">{updateState.message}</div>
                        </div>
                        <button className="update-retry-btn" onClick={handleCheckForUpdates}>
                            Retry
                        </button>
                        <button className="update-dismiss-btn" onClick={handleDismiss}>
                            <X size={16} />
                        </button>
                    </>
                )}
            </div>
            {showNotes && <ChangelogModal onClose={() => setShowNotes(false)} />}

            {/* What's New Preview Modal */}
            {showPreview && (updateState.type === 'available' || updateState.type === 'downloading' || updateState.type === 'ready') && updateState.info.releaseNotes && (
                <div
                    style={{
                        position: 'fixed', inset: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        zIndex: 1100, padding: '20px'
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowPreview(false) }}
                >
                    <div style={{
                        background: 'var(--bg-primary, #1a1d28)',
                        borderRadius: '16px',
                        padding: '28px',
                        width: '100%',
                        maxWidth: '460px',
                        maxHeight: '70vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
                        position: 'relative'
                    }}>
                        <button
                            onClick={() => setShowPreview(false)}
                            style={{ position: 'absolute', top: '14px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', display: 'flex' }}
                        >
                            <X size={18} />
                        </button>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                            <div style={{
                                width: '44px', height: '44px', borderRadius: '12px',
                                background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                                <Sparkles size={20} color="white" />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>What's New in v{updateState.info.version}</h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                    {updateState.type === 'downloading'
                                        ? `Downloading... ${Math.round(updateState.progress.percent)}%`
                                        : updateState.type === 'ready'
                                            ? 'Ready to install'
                                            : 'Downloading in background'}
                                </p>
                            </div>
                        </div>

                        {/* Download progress bar */}
                        {updateState.type === 'downloading' && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{
                                    height: '6px',
                                    borderRadius: '3px',
                                    background: 'rgba(0,210,255,0.1)',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        height: '100%',
                                        borderRadius: '3px',
                                        background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                                        width: `${updateState.progress.percent}%`,
                                        transition: 'width 0.3s ease'
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                    <span>{formatBytes(updateState.progress.transferred)} / {formatBytes(updateState.progress.total)}</span>
                                    <span>{formatSpeed(updateState.progress.bytesPerSecond)}</span>
                                </div>
                            </div>
                        )}

                        {/* Release notes preview */}
                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '18px' }}>
                            {parsePreviewItems(updateState.info.releaseNotes || '').map((item, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '5px 0' }}>
                                    <span style={{ color: 'var(--accent-primary)', marginTop: '5px', flexShrink: 0, fontSize: '0.5rem' }}>●</span>
                                    <span style={{ fontSize: '0.88rem', lineHeight: 1.5 }}>{item}</span>
                                </div>
                            ))}
                            {parsePreviewItems(updateState.info.releaseNotes || '').length === 0 && (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontStyle: 'italic' }}>
                                    A new version is available with improvements and bug fixes.
                                </p>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowNotes(true)}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--accent-primary)', fontSize: '0.8rem',
                                    padding: 0, textDecoration: 'underline', textUnderlineOffset: '3px',
                                    marginRight: 'auto'
                                }}
                            >
                                Full changelog
                            </button>
                            <button onClick={() => setShowPreview(false)} className="btn-secondary" style={{ padding: '8px 20px' }}>
                                Later
                            </button>
                            {updateState.type === 'ready' && (
                                <button onClick={handleInstall} className="btn-primary" style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Download size={14} /> Update Now
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
