import { useState, useEffect } from 'react'
import { X, Download, RefreshCw, AlertCircle } from 'lucide-react'

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

export function UpdateNotification(): React.ReactElement | null {
    const [updateState, setUpdateState] = useState<UpdateState>({ type: 'idle' })
    const [dismissed, setDismissed] = useState(false)

    useEffect(() => {
        // Listen for update events
        window.api.onUpdateChecking(() => {
            setUpdateState({ type: 'checking' })
            setDismissed(false)
        })

        window.api.onUpdateAvailable((info) => {
            setUpdateState({ type: 'available', info })
            setDismissed(false)
        })

        window.api.onUpdateNotAvailable(() => {
            setUpdateState({ type: 'idle' })
        })

        window.api.onUpdateDownloadProgress((progress) => {
            setUpdateState((prev) => {
                if (prev.type === 'available' || prev.type === 'downloading') {
                    return { type: 'downloading', progress, info: prev.info }
                }
                return prev
            })
        })

        window.api.onUpdateDownloaded((info) => {
            setUpdateState({ type: 'ready', info })
            setDismissed(false)
        })

        window.api.onUpdateError((error) => {
            setUpdateState({ type: 'error', message: error.message })
            setDismissed(false)
        })
    }, [])

    const handleInstall = () => {
        window.api.updateQuitAndInstall()
    }

    const handleDismiss = () => {
        setDismissed(true)
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
                        <Download className="update-icon" size={20} />
                        <div className="update-text">
                            <div className="update-title">Update Available</div>
                            <div className="update-description">
                                Version {updateState.info.version} is available. Downloading...
                            </div>
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
                        </div>
                        <button className="update-install-btn" onClick={handleInstall}>
                            Restart & Update
                        </button>
                        <button className="update-dismiss-btn" onClick={handleDismiss}>
                            <X size={16} />
                        </button>
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
        </div>
    )
}
