import { useState, useEffect, useMemo } from 'react'
import { FolderOpen, X, CheckCircle, AlertCircle, FolderSearch, RefreshCcw, ArrowRight } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'

interface FileEntry {
    id: string
    source: string
    filePath: string
    label: string
}

type RowStatus = 'matched' | 'accessible' | 'lost'

interface MappedRow {
    entry: FileEntry
    candidatePath: string
    status: RowStatus
    customPath?: string // set when user manually locates
}

interface RemapFilePathsModalProps {
    vesselId?: string
    vesselName?: string
    entityId?: string
    entityName?: string
    includeEntityIds?: string[]  // Also include these entity file paths (for vessel + associated entities)
    onClose: () => void
}

function detectCommonPrefix(paths: string[]): string {
    if (paths.length === 0) return ''
    const sep = paths[0].includes('\\') ? '\\' : '/'
    const parts = paths[0].split(sep)
    let commonParts: string[] = []
    for (let i = 0; i < parts.length; i++) {
        const segment = parts.slice(0, i + 1).join(sep)
        if (paths.every(p => p.toLowerCase().startsWith(segment.toLowerCase()))) {
            commonParts = parts.slice(0, i + 1)
        } else {
            break
        }
    }
    return commonParts.join(sep)
}

function shortenPath(p: string, maxLen = 55): string {
    if (p.length <= maxLen) return p
    const sep = p.includes('\\') ? '\\' : '/'
    const parts = p.split(sep)
    if (parts.length <= 2) return p
    return parts[0] + sep + '...' + sep + parts.slice(-2).join(sep)
}

function applyPrefix(filePath: string, oldPrefix: string, newPrefix: string): string {
    if (!oldPrefix) return filePath
    // Normalize separators for comparison
    const normFile = filePath.replace(/\//g, '\\')
    const normOld = oldPrefix.replace(/\//g, '\\')
    const normNew = newPrefix.replace(/\//g, '\\')
    // Case-insensitive prefix match (Windows paths)
    if (!normFile.toLowerCase().startsWith(normOld.toLowerCase())) return filePath
    return normNew + normFile.slice(normOld.length)
}

export default function RemapFilePathsModal({ vesselId, vesselName, entityId, entityName, includeEntityIds, onClose }: RemapFilePathsModalProps) {
    const { theme } = useTheme()
    const { showSuccess, showError } = useToast()
    const isLight = theme === 'light' || theme === 'aurora'
    const isEntity = !!entityId && !vesselId
    const targetId = entityId || vesselId || ''
    const targetName = entityName || vesselName || ''

    const [step, setStep] = useState<'pick' | 'preview'>('pick')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [entries, setEntries] = useState<FileEntry[]>([])
    const [oldPrefix, setOldPrefix] = useState('')
    const [newPrefix, setNewPrefix] = useState('')
    const [rows, setRows] = useState<MappedRow[]>([])
    const [checking, setChecking] = useState(false)

    useEffect(() => {
        const load = async () => {
            const allEntries: FileEntry[] = []
            // Load vessel files
            if (vesselId) {
                const vData = await window.api.vesselGetFilePaths(vesselId)
                allEntries.push(...(Array.isArray(vData) ? vData : []))
            }
            // Load entity files (single entity mode)
            if (entityId && !vesselId) {
                const eData = await window.api.entityGetFilePaths(entityId)
                allEntries.push(...(Array.isArray(eData) ? eData : []))
            }
            // Load associated entity files (vessel + entities mode)
            if (includeEntityIds && includeEntityIds.length > 0) {
                for (const eid of includeEntityIds) {
                    const eData = await window.api.entityGetFilePaths(eid)
                    if (Array.isArray(eData)) allEntries.push(...eData)
                }
            }
            setEntries(allEntries)
            if (allEntries.length > 0) {
                const detected = detectCommonPrefix(allEntries.filter(e => e.filePath).map(d => d.filePath))
                setOldPrefix(detected)
            }
            setLoading(false)
        }
        load()
    }, [targetId, isEntity, vesselId, entityId, includeEntityIds])

    async function handlePreview() {
        if (!oldPrefix || !newPrefix) return
        setChecking(true)
        const mapped: MappedRow[] = []
        for (const entry of entries) {
            const candidate = applyPrefix(entry.filePath, oldPrefix, newPrefix)
            const newExists = await window.api.fsExists(candidate)
            let status: RowStatus
            if (newExists) {
                status = 'matched'
            } else {
                const oldExists = await window.api.fsExists(entry.filePath)
                status = oldExists ? 'accessible' : 'lost'
            }
            mapped.push({ entry, candidatePath: candidate, status })
        }
        setRows(mapped)
        setChecking(false)
        setStep('preview')
    }

    async function handleLocate(index: number) {
        const path = await window.api.dialogLocateFile()
        if (!path) return
        setRows(prev => prev.map((r, i) => i === index ? { ...r, customPath: path, status: 'matched' } : r))
    }

    async function handleApply() {
        const toUpdate = rows.filter(r => r.status === 'matched')
        if (toUpdate.length === 0) { onClose(); return }
        setSaving(true)
        try {
            const remaps = toUpdate.map(r => ({
                source: r.entry.source,
                id: r.entry.id,
                newPath: r.customPath ?? r.candidatePath
            }))
            // Split remaps by source type: vessel docs vs entity docs
            const vesselRemaps = remaps.filter(r => r.source === 'document' || r.source === 'attachment')
            const entityRemaps = remaps.filter(r => r.source !== 'document' && r.source !== 'attachment')
            if (vesselRemaps.length > 0) {
                await window.api.vesselRemapFilePaths(vesselRemaps)
            }
            if (entityRemaps.length > 0) {
                await window.api.entityRemapFilePaths(entityRemaps)
            }
            showSuccess(`Updated ${toUpdate.length} file path${toUpdate.length !== 1 ? 's' : ''} for ${targetName}`)
            onClose()
        } catch (e: any) {
            showError(e.message || 'Failed to remap file paths')
        } finally {
            setSaving(false)
        }
    }

    const matchedCount = useMemo(() => rows.filter(r => r.status === 'matched').length, [rows])
    const accessibleCount = useMemo(() => rows.filter(r => r.status === 'accessible').length, [rows])
    const lostCount = useMemo(() => rows.filter(r => r.status === 'lost').length, [rows])

    const bg = isLight ? '#ffffff' : '#1a1d28'
    const borderColor = isLight ? '#e0e4ef' : 'rgba(255,255,255,0.08)'
    const headerBg = isLight ? '#f4f6fb' : '#14172a'

    return (
        <div
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
            }}
            onClick={onClose}
        >
            <div
                style={{
                    width: '90%', maxWidth: '760px', background: bg,
                    borderRadius: '16px', border: `1px solid ${borderColor}`,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column', maxHeight: '85vh'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: '20px 24px', borderBottom: `1px solid ${borderColor}`,
                    display: 'flex', alignItems: 'center', gap: '12px', background: headerBg,
                    borderRadius: '16px 16px 0 0'
                }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(0,200,255,0.3), rgba(0,100,200,0.3))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        <FolderSearch size={20} color="var(--accent-primary)" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                            Remap File Paths — {targetName}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {vesselName} — {entries.length} file{entries.length !== 1 ? 's' : ''} with paths
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--text-secondary)', padding: 4
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Loading file paths...
                    </div>
                ) : entries.length === 0 ? (
                    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
                        No files with stored paths found for this vessel.
                    </div>
                ) : step === 'pick' ? (
                    /* Step 1 — Prefix picker */
                    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            Enter the <strong>old folder prefix</strong> (auto-detected below) and the <strong>new folder prefix</strong>
                            where the vessel files were moved. Paths that start with the old prefix will have it replaced with the new one.
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Old folder prefix
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    value={oldPrefix}
                                    onChange={e => setOldPrefix(e.target.value)}
                                    placeholder="e.g. C:\Files\BrokerA\VesselX"
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: 8,
                                        border: `1px solid var(--input-border)`,
                                        background: 'var(--input-bg)', color: 'var(--text-primary)',
                                        fontSize: '0.85rem', fontFamily: 'monospace'
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                New folder prefix
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    value={newPrefix}
                                    onChange={e => setNewPrefix(e.target.value)}
                                    placeholder="e.g. D:\Files\BrokerB\VesselX"
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: 8,
                                        border: `1px solid var(--input-border)`,
                                        background: 'var(--input-bg)', color: 'var(--text-primary)',
                                        fontSize: '0.85rem', fontFamily: 'monospace'
                                    }}
                                />
                                <button
                                    onClick={async () => {
                                        const folder = await window.api.dialogOpenFolder()
                                        if (folder) setNewPrefix(folder)
                                    }}
                                    style={{
                                        padding: '8px 12px', borderRadius: 8,
                                        border: `1px solid var(--glass-border)`,
                                        background: 'var(--bg-card)', color: 'var(--text-secondary)',
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                        fontSize: '0.8rem', whiteSpace: 'nowrap'
                                    }}
                                >
                                    <FolderOpen size={15} /> Browse
                                </button>
                            </div>
                        </div>

                        {/* Sample of current paths */}
                        <div style={{
                            background: isLight ? '#f4f6fb' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${borderColor}`, borderRadius: 8, padding: '12px'
                        }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                SAMPLE CURRENT PATHS
                            </div>
                            {entries.slice(0, 4).map(e => (
                                <div key={e.id} style={{
                                    fontSize: '0.75rem', fontFamily: 'monospace',
                                    color: 'var(--text-secondary)', padding: '2px 0'
                                }}>
                                    {shortenPath(e.filePath)}
                                </div>
                            ))}
                            {entries.length > 4 && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                                    …and {entries.length - 4} more
                                </div>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                            <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px' }}>
                                Cancel
                            </button>
                            <button
                                onClick={handlePreview}
                                disabled={!oldPrefix || !newPrefix || checking}
                                className="btn-primary"
                                style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                                {checking ? <RefreshCcw size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={15} />}
                                {checking ? 'Checking…' : 'Preview Changes'}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* Step 2 — Preview table */
                    <>
                        {/* Summary strip */}
                        <div style={{
                            display: 'flex', gap: 12, padding: '16px 24px',
                            borderBottom: `1px solid ${borderColor}`
                        }}>
                            {[
                                { label: 'Will update', count: matchedCount, color: 'var(--success, #22c55e)', bg: 'rgba(34,197,94,0.1)' },
                                { label: 'Keep (still accessible)', count: accessibleCount, color: 'var(--warning, #f59e0b)', bg: 'rgba(245,158,11,0.1)' },
                                { label: 'Not found', count: lostCount, color: 'var(--danger)', bg: 'rgba(255,77,77,0.1)' }
                            ].map(s => (
                                <div key={s.label} style={{
                                    flex: 1, padding: '10px 14px', borderRadius: 8,
                                    background: s.bg, display: 'flex', alignItems: 'center', gap: 8
                                }}>
                                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: s.color }}>{s.count}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Rows */}
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ background: headerBg, borderBottom: `1px solid ${borderColor}` }}>
                                        {['File', 'Old Path', '', 'New Path / Status'].map(h => (
                                            <th key={h} style={{
                                                padding: '10px 16px', textAlign: 'left',
                                                fontWeight: 600, color: 'var(--text-secondary)',
                                                fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em'
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, i) => {
                                        const isEven = i % 2 === 0
                                        const resolvedPath = row.customPath ?? row.candidatePath
                                        return (
                                            <tr
                                                key={row.entry.id}
                                                style={{
                                                    background: isEven
                                                        ? (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.01)')
                                                        : 'transparent',
                                                    borderBottom: `1px solid ${borderColor}`
                                                }}
                                            >
                                                <td style={{ padding: '10px 16px', maxWidth: 160 }}>
                                                    <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.78rem' }}>
                                                        {row.entry.label}
                                                    </div>
                                                    <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                                                        {row.entry.source}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '10px 16px', maxWidth: 180 }}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                                                        {shortenPath(row.entry.filePath, 45)}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '10px 8px', width: 20 }}>
                                                    <ArrowRight size={14} color="var(--text-secondary)" />
                                                </td>
                                                <td style={{ padding: '10px 16px' }}>
                                                    {row.status === 'matched' ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <CheckCircle size={14} color="var(--success, #22c55e)" />
                                                            <span style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                                                {shortenPath(resolvedPath, 45)}
                                                            </span>
                                                        </div>
                                                    ) : row.status === 'accessible' ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <CheckCircle size={14} color="var(--warning, #f59e0b)" />
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--warning, #f59e0b)' }}>
                                                                Keeping original (file still exists)
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <AlertCircle size={14} color="var(--danger)" />
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--danger)' }}>
                                                                File not found
                                                            </span>
                                                            <button
                                                                onClick={() => handleLocate(i)}
                                                                style={{
                                                                    padding: '3px 8px', borderRadius: 6, fontSize: '0.72rem',
                                                                    border: '1px solid rgba(255,77,77,0.35)',
                                                                    background: 'rgba(255,77,77,0.08)',
                                                                    color: 'var(--danger)', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', gap: 4
                                                                }}
                                                            >
                                                                <FolderOpen size={12} /> Locate
                                                            </button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '16px 24px', borderTop: `1px solid ${borderColor}`,
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: headerBg, borderRadius: '0 0 16px 16px'
                        }}>
                            <button
                                onClick={() => setStep('pick')}
                                className="btn-secondary"
                                style={{ padding: '8px 16px' }}
                            >
                                Back
                            </button>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button onClick={onClose} className="btn-secondary" style={{ padding: '8px 16px' }}>
                                    Cancel
                                </button>
                                <button
                                    onClick={handleApply}
                                    disabled={saving || matchedCount === 0}
                                    className="btn-primary"
                                    style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                    {saving && <RefreshCcw size={15} style={{ animation: 'spin 1s linear infinite' }} />}
                                    Apply {matchedCount} Update{matchedCount !== 1 ? 's' : ''}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
