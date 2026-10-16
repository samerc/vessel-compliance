import { useState, useEffect, useMemo } from 'react'
import {
  FolderOpen,
  CheckCircle,
  AlertCircle,
  FolderSearch,
  RefreshCcw,
  ArrowRight
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { Modal, Field } from './ui'

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
  includeEntityIds?: string[] // Also include these entity file paths (for vessel + associated entities)
  onClose: () => void
}

function detectCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return ''
  const sep = paths[0].includes('\\') ? '\\' : '/'
  const parts = paths[0].split(sep)
  let commonParts: string[] = []
  for (let i = 0; i < parts.length; i++) {
    const segment = parts.slice(0, i + 1).join(sep)
    if (paths.every((p) => p.toLowerCase().startsWith(segment.toLowerCase()))) {
      commonParts = parts.slice(0, i + 1)
    } else {
      break
    }
  }
  return commonParts.join(sep)
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

export default function RemapFilePathsModal({
  vesselId,
  vesselName,
  entityId,
  entityName,
  includeEntityIds,
  onClose
}: RemapFilePathsModalProps): React.JSX.Element {
  const { showSuccess, showError } = useToast()
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
    const load = async (): Promise<void> => {
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
        const detected = detectCommonPrefix(
          allEntries.filter((e) => e.filePath).map((d) => d.filePath)
        )
        setOldPrefix(detected)
      }
      setLoading(false)
    }
    load()
  }, [targetId, isEntity, vesselId, entityId, includeEntityIds])

  async function handlePreview(): Promise<void> {
    if (!oldPrefix || !newPrefix) return
    setChecking(true)
    const mapped: MappedRow[] = []
    for (const entry of entries) {
      const candidate = applyPrefix(entry.filePath, oldPrefix, newPrefix)
      const newExists = await window.api.fsExists(candidate)
      console.log('[Remap]', {
        original: entry.filePath,
        oldPrefix,
        newPrefix,
        candidate,
        newExists
      })
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

  async function handleLocate(index: number): Promise<void> {
    const path = await window.api.dialogLocateFile()
    if (!path) return
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, customPath: path, status: 'matched' } : r))
    )
  }

  async function handleApply(): Promise<void> {
    const toUpdate = rows.filter((r) => r.status === 'matched')
    if (toUpdate.length === 0) {
      onClose()
      return
    }
    setSaving(true)
    try {
      const remaps = toUpdate.map((r) => ({
        source: r.entry.source,
        id: r.entry.id,
        newPath: r.customPath ?? r.candidatePath
      }))
      // Split remaps by source type: vessel docs vs entity docs
      const vesselRemaps = remaps.filter(
        (r) => r.source === 'document' || r.source === 'attachment'
      )
      const entityRemaps = remaps.filter(
        (r) => r.source !== 'document' && r.source !== 'attachment'
      )
      if (vesselRemaps.length > 0) {
        await window.api.vesselRemapFilePaths(vesselRemaps)
      }
      if (entityRemaps.length > 0) {
        await window.api.entityRemapFilePaths(entityRemaps)
      }
      showSuccess(
        `Updated ${toUpdate.length} file path${toUpdate.length !== 1 ? 's' : ''} for ${targetName}`
      )
      onClose()
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Failed to remap file paths')
    } finally {
      setSaving(false)
    }
  }

  const matchedCount = useMemo(() => rows.filter((r) => r.status === 'matched').length, [rows])
  const accessibleCount = useMemo(
    () => rows.filter((r) => r.status === 'accessible').length,
    [rows]
  )
  const lostCount = useMemo(() => rows.filter((r) => r.status === 'lost').length, [rows])

  const ready = !loading && entries.length > 0

  return (
    <Modal
      title={`Remap file paths — ${targetName}`}
      icon={<FolderSearch size={18} />}
      onClose={onClose}
      width={960}
      closeOnOverlay={false}
      footer={
        !ready ? undefined : step === 'pick' ? (
          <>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handlePreview}
              disabled={!oldPrefix || !newPrefix || checking}
              className="btn-primary"
            >
              {checking ? (
                <RefreshCcw size={15} style={{ animation: 'spin 1s linear infinite' }} />
              ) : (
                <ArrowRight size={15} />
              )}
              {checking ? 'Checking…' : 'Preview changes'}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setStep('pick')}
              className="btn-secondary"
              style={{ marginRight: 'auto' }}
            >
              Back
            </button>
            <button onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={saving || matchedCount === 0}
              className="btn-primary"
            >
              {saving && <RefreshCcw size={15} style={{ animation: 'spin 1s linear infinite' }} />}
              Apply {matchedCount} Update{matchedCount !== 1 ? 's' : ''}
            </button>
          </>
        )
      }
    >
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
        {vesselName} — {entries.length} file{entries.length !== 1 ? 's' : ''} with paths
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <p
            style={{
              margin: 0,
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
              lineHeight: 1.6
            }}
          >
            Enter the <strong>old folder prefix</strong> (auto-detected below) and the{' '}
            <strong>new folder prefix</strong>
            where the vessel files were moved. Paths that start with the old prefix will have it
            replaced with the new one.
          </p>

          <div className="form-grid">
            <Field label="Old folder prefix" span="all">
              <input
                value={oldPrefix}
                onChange={(e) => setOldPrefix(e.target.value)}
                placeholder="e.g. C:\Files\BrokerA\VesselX"
                style={{ fontFamily: 'monospace' }}
              />
            </Field>
            <Field label="New folder prefix" span="all">
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={newPrefix}
                  onChange={(e) => setNewPrefix(e.target.value)}
                  placeholder="e.g. D:\Files\BrokerB\VesselX"
                  style={{ flex: 1, fontFamily: 'monospace' }}
                />
                <button
                  className="btn-secondary"
                  onClick={async () => {
                    const folder = await window.api.dialogOpenFolder()
                    if (folder) setNewPrefix(folder)
                  }}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <FolderOpen size={15} /> Browse
                </button>
              </div>
            </Field>
          </div>

          {/* Sample of current paths */}
          <div
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--table-border)',
              borderRadius: 8,
              padding: '12px'
            }}
          >
            <div
              style={{
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                marginBottom: 8
              }}
            >
              Sample current paths
            </div>
            {entries.slice(0, 4).map((e) => (
              <div
                key={e.id}
                style={{
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  color: 'var(--text-secondary)',
                  padding: '2px 0',
                  wordBreak: 'break-all'
                }}
              >
                {e.filePath}
              </div>
            ))}
            {entries.length > 4 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                …and {entries.length - 4} more
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Step 2 — Preview table */
        <>
          {/* Summary strip */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            {[
              {
                label: 'Will update',
                count: matchedCount,
                color: 'var(--success)',
                bg: 'rgba(34,197,94,0.1)'
              },
              {
                label: 'Keep (still accessible)',
                count: accessibleCount,
                color: 'var(--warning)',
                bg: 'rgba(245,158,11,0.1)'
              },
              {
                label: 'Not found',
                count: lostCount,
                color: 'var(--danger)',
                bg: 'rgba(255,77,77,0.1)'
              }
            ].map((s) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  padding: '10px 14px',
                  borderRadius: 8,
                  background: s.bg,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '1.1rem', color: s.color }}>
                  {s.count}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {['File', 'Old Path', '', 'New Path / Status'].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const resolvedPath = row.customPath ?? row.candidatePath
                  return (
                    <tr key={row.entry.id}>
                      <td style={{ maxWidth: 160 }}>
                        <div style={{ fontWeight: 500 }}>{row.entry.label}</div>
                        <div
                          style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-secondary)',
                            marginTop: 2
                          }}
                        >
                          {row.entry.source}
                        </div>
                      </td>
                      <td style={{ maxWidth: 320 }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.75rem',
                            color: 'var(--text-secondary)',
                            wordBreak: 'break-all'
                          }}
                        >
                          {row.entry.filePath}
                        </span>
                      </td>
                      <td style={{ padding: '10px 8px', width: 20 }}>
                        <ArrowRight size={14} color="var(--text-secondary)" />
                      </td>
                      <td>
                        {row.status === 'matched' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle size={14} color="var(--success)" />
                            <span
                              style={{
                                fontFamily: 'monospace',
                                fontSize: '0.75rem',
                                wordBreak: 'break-all'
                              }}
                            >
                              {resolvedPath}
                            </span>
                          </div>
                        ) : row.status === 'accessible' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <CheckCircle size={14} color="var(--warning)" />
                            <span style={{ fontSize: '0.8rem', color: 'var(--warning)' }}>
                              Keeping original (file still exists)
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <AlertCircle size={14} color="var(--danger)" />
                            <span style={{ fontSize: '0.8rem', color: 'var(--danger)' }}>
                              File not found
                            </span>
                            <button
                              onClick={() => handleLocate(i)}
                              style={{
                                padding: '3px 8px',
                                borderRadius: 6,
                                fontSize: '0.72rem',
                                border: '1px solid rgba(255,77,77,0.35)',
                                background: 'rgba(255,77,77,0.08)',
                                color: 'var(--danger)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
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
        </>
      )}
    </Modal>
  )
}
