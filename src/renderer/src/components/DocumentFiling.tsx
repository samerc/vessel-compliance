import { useEffect, useRef, useState } from 'react'
import { FolderOpen, Inbox, Loader2, Upload } from 'lucide-react'
import type {
  DocFilingCandidate,
  DocFilingResult,
  DocFilingVesselInfo,
  DocumentType,
  Vessel
} from '../../../shared/types'
import { Badge, Modal } from './ui'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'

// Filing several documents at once: dropped files (from Outlook, Downloads, a folder) get a guessed
// vessel and document type; the user reviews the list, then each file is moved into its vessel's
// folder, renamed (VESSEL - CODE - date) and linked. Nothing is filed before "File".

/** Opens the filing window from anywhere (Ctrl+K, the Vessels page) */
export const OPEN_FILING_EVENT = 'vc-open-document-filing'
/** Files dropped where no drop area took them (detail = File[]), sent by App's drop guard */
export const UNHANDLED_DROP_EVENT = 'vc-unhandled-file-drop'
/** Sent after filing, detail = the vessel ids: an open vessel page reloads its documents */
export const DOCUMENTS_FILED_EVENT = 'vc-documents-filed'

/** Paths of dropped / chosen files; a file without one (an Outlook attachment) is saved to temp */
async function filePaths(files: File[]): Promise<string[]> {
  const paths: string[] = []
  for (const f of files) {
    const p = window.api.getFilePath(f)
    paths.push(
      p || (await window.api.docFilingStage(f.name, new Uint8Array(await f.arrayBuffer())))
    )
  }
  return paths
}

type Row = DocFilingCandidate & {
  choice: string
  vesselChoice: string
  expiry: string
  result?: string
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** The review list: vessel (unless fixed), type, expiry per file, the folder of each vessel */
function FilingReview({
  files,
  vesselInfo,
  fixedVessel,
  onClose,
  onFiled
}: {
  files: DocFilingCandidate[]
  vesselInfo: Record<string, DocFilingVesselInfo>
  /** Dropped on this vessel's page: no vessel column */
  fixedVessel?: Vessel
  onClose: () => void
  onFiled: (vesselIds: string[]) => void
}): React.JSX.Element {
  const { showError, showSuccess, showToast } = useToast()
  const [rows, setRows] = useState<Row[]>(() =>
    files.map((f) => ({ ...f, choice: f.typeId || '', vesselChoice: f.vesselId || '', expiry: '' }))
  )
  const [info, setInfo] = useState(vesselInfo)
  const [folders, setFolders] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(Object.entries(vesselInfo).map(([id, v]) => [id, v.folder]))
  )
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [vessels, setVessels] = useState<Vessel[]>(fixedVessel ? [fixedVessel] : [])
  const [filing, setFiling] = useState(false)

  useEffect(() => {
    let alive = true
    void window.api.getDocumentTypes().then((t) => {
      if (alive && Array.isArray(t)) setDocTypes(t)
    })
    if (!fixedVessel)
      void window.api.getVessels().then((v) => {
        if (alive && Array.isArray(v))
          setVessels([...v].sort((a, b) => a.name.localeCompare(b.name)))
      })
    return () => {
      alive = false
    }
  }, [fixedVessel])

  const typesOf = (vesselId: string): { id: string; name: string }[] => [
    ...docTypes.map((t) => ({ id: t.id, name: t.name })),
    ...(info[vesselId]?.customTypes || [])
  ]
  const vesselName = (id: string): string => vessels.find((v) => v.id === id)?.name || ''

  const setRow = (path: string, patch: Partial<Row>): void =>
    setRows((rs) => rs.map((x) => (x.path === path ? { ...x, ...patch } : x)))

  const chooseVessel = async (row: Row, vesselId: string): Promise<void> => {
    setRow(row.path, { vesselChoice: vesselId })
    if (!vesselId || info[vesselId]) return
    try {
      const vi = await window.api.docFilingVesselInfo(vesselId)
      setInfo((m) => ({ ...m, [vesselId]: vi }))
      setFolders((m) => (vesselId in m ? m : { ...m, [vesselId]: vi.folder }))
      // A type of the previous vessel's own list does not exist on this one
      if (
        row.choice &&
        row.choice !== 'skip' &&
        !docTypes.some((t) => t.id === row.choice) &&
        !vi.customTypes.some((t) => t.id === row.choice)
      )
        setRow(row.path, { choice: '' })
    } catch {
      showError('The vessel could not be loaded')
    }
  }

  const open = rows.filter((r) => !r.error && !r.result && r.choice !== 'skip')
  const chosen = open.filter((r) => r.choice && r.vesselChoice)
  const incomplete = open.filter((r) => !r.choice || !r.vesselChoice)
  const groups = [...new Set(chosen.map((r) => r.vesselChoice))]
  const doubled = groups.flatMap((vid) => {
    const seen = new Map<string, number>()
    chosen
      .filter((r) => r.vesselChoice === vid)
      .forEach((r) => seen.set(r.choice, (seen.get(r.choice) || 0) + 1))
    return [...seen.entries()]
      .filter(([, n]) => n > 1)
      .map(([t]) => `${typesOf(vid).find((x) => x.id === t)?.name} (${vesselName(vid)})`)
  })
  const noFolder = groups.filter((vid) => !folders[vid])
  const problem =
    incomplete.length > 0
      ? `Choose the ${fixedVessel ? 'type' : 'vessel and type'} of ${plural(incomplete.length, 'file')} (or Skip).`
      : doubled.length > 0
        ? `Only one file per type: ${doubled.join(', ')}.`
        : noFolder.length > 0
          ? `Choose the folder of ${noFolder.map(vesselName).join(', ')}.`
          : ''
  const canFile = chosen.length > 0 && !problem

  const pickFolder = async (vid: string): Promise<void> => {
    const dir = await window.api.dialogOpenFolder(
      folders[vid] || info[vid]?.suggestedFolder || undefined
    )
    if (dir) setFolders((m) => ({ ...m, [vid]: dir }))
  }

  const file = async (): Promise<void> => {
    setFiling(true)
    try {
      const results: DocFilingResult[] = []
      for (const vid of groups)
        results.push(
          ...(await window.api.docFilingFile(
            vid,
            folders[vid] as string,
            chosen
              .filter((r) => r.vesselChoice === vid)
              .map((r) => ({
                path: r.path,
                documentTypeId: r.choice,
                expiryDate: r.expiry || null
              }))
          ))
        )
      results
        .filter((r) => r.renameError)
        .forEach((r) => showToast(r.renameError as string, 'warning'))
      const done = results.filter((r) => r.ok)
      const failed = results.filter((r) => !r.ok)
      if (done.length > 0) {
        const filedVessels = [
          ...new Set(
            chosen.filter((r) => done.some((d) => d.path === r.path)).map((r) => r.vesselChoice)
          )
        ]
        showSuccess(
          `${plural(done.length, 'document')} filed${
            filedVessels.length === 1
              ? ` for ${vesselName(filedVessels[0])}`
              : ` for ${filedVessels.length} vessels`
          }`
        )
        onFiled(filedVessels)
      }
      if (failed.length === 0) onClose()
      else
        setRows((rs) =>
          rs
            .filter((x) => !done.some((d) => d.path === x.path))
            .map((x) => ({
              ...x,
              result: failed.find((f) => f.path === x.path)?.error || x.result
            }))
        )
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The documents were not filed')
    } finally {
      setFiling(false)
    }
  }

  const badge = (r: Row): React.JSX.Element | null => {
    if (r.error) return <Badge tone="danger">{r.error}</Badge>
    if (r.result) return <Badge tone="danger">{r.result}</Badge>
    if (r.choice === 'skip') return null
    if (r.source && r.choice === r.typeId)
      return (
        <Badge tone="success">
          Type {r.source === 'name' ? 'from the file name' : 'from the content'}: {r.matched}
        </Badge>
      )
    if (!r.choice) return <Badge tone="warning">Type not recognised</Badge>
    return null
  }

  return (
    <Modal
      title={fixedVessel ? `File documents for ${fixedVessel.name}` : 'File documents'}
      icon={<Inbox size={18} />}
      onClose={() => !filing && onClose()}
      closeOnOverlay={false}
      width={fixedVessel ? 980 : 1180}
      footer={
        <>
          <span style={{ marginRight: 'auto', fontSize: '0.82rem', color: 'var(--danger)' }}>
            {problem}
          </span>
          <button type="button" className="btn-secondary" disabled={filing} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!canFile || filing}
            onClick={() => void file()}
          >
            {filing ? <Loader2 size={14} className="spinner" /> : null}
            File {plural(chosen.length, 'document')}
          </button>
        </>
      }
    >
      {groups.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {groups.map((vid) => (
            <div
              key={vid}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}
            >
              <FolderOpen size={16} />
              <strong style={{ fontSize: '0.88rem' }}>
                {fixedVessel ? 'Vessel folder' : `${vesselName(vid)} folder`}
              </strong>
              <span
                style={{
                  fontSize: '0.85rem',
                  color: folders[vid] ? 'inherit' : 'var(--text-secondary)',
                  wordBreak: 'break-all',
                  flex: 1
                }}
              >
                {folders[vid] ||
                  (info[vid]?.suggestedFolder
                    ? `Suggested: ${info[vid]?.suggestedFolder} (where its documents are). Confirm it with Choose.`
                    : 'None yet: choose the folder of this vessel.')}
              </span>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void pickFolder(vid)}
              >
                {folders[vid] ? 'Change...' : 'Choose...'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">File</th>
              {!fixedVessel && <th scope="col">Vessel</th>}
              <th scope="col">Document type</th>
              <th scope="col">Expiry (optional)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const current =
                r.choice && r.choice !== 'skip'
                  ? info[r.vesselChoice]?.current.find((c) => c.documentTypeId === r.choice)
                  : undefined
              return (
                <tr key={r.path}>
                  <td style={{ maxWidth: '300px' }}>
                    <div style={{ wordBreak: 'break-all', fontWeight: 600 }}>{r.name}</div>
                    <div
                      style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}
                    >
                      {badge(r)}
                    </div>
                  </td>
                  {!fixedVessel && (
                    <td style={{ minWidth: '200px' }}>
                      {!r.error && (
                        <>
                          <select
                            value={r.vesselChoice}
                            onChange={(e) => void chooseVessel(r, e.target.value)}
                            aria-label={`Vessel of ${r.name}`}
                            style={{
                              width: '100%',
                              borderColor:
                                !r.vesselChoice && r.choice !== 'skip'
                                  ? 'var(--warning)'
                                  : undefined
                            }}
                          >
                            <option value="">Choose the vessel...</option>
                            {vessels.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                                {v.imoNumber ? ` (${v.imoNumber})` : ''}
                                {v.isActive === false ? ' - inactive' : ''}
                              </option>
                            ))}
                          </select>
                          {r.vesselSource &&
                            r.vesselSource !== 'given' &&
                            r.vesselChoice === r.vesselId && (
                              <div style={{ marginTop: '4px' }}>
                                <Badge tone="success">
                                  {r.vesselSource === 'name' ? 'File name' : 'Content'}:{' '}
                                  {r.vesselMatched}
                                </Badge>
                              </div>
                            )}
                          {!r.vesselChoice && r.choice !== 'skip' && (
                            <div style={{ marginTop: '4px' }}>
                              <Badge tone="warning">Vessel not recognised</Badge>
                            </div>
                          )}
                        </>
                      )}
                    </td>
                  )}
                  <td>
                    {!r.error && (
                      <>
                        <select
                          value={r.choice}
                          onChange={(e) => setRow(r.path, { choice: e.target.value })}
                          aria-label={`Document type of ${r.name}`}
                          style={{
                            width: '100%',
                            borderColor: !r.choice ? 'var(--warning)' : undefined
                          }}
                        >
                          <option value="">Choose the type...</option>
                          <option value="skip">Skip (do not file)</option>
                          {typesOf(r.vesselChoice).map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        {current && (
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: 'var(--text-secondary)',
                              marginTop: '4px'
                            }}
                          >
                            Replaces {current.fileName} (kept in History)
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td>
                    {!r.error && r.choice && r.choice !== 'skip' && (
                      <input
                        type="date"
                        value={r.expiry}
                        onChange={(e) => setRow(r.path, { expiry: e.target.value })}
                        aria-label={`Expiry date of ${r.name}`}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

/** A drop area + "Choose files" button; files go to `onFiles` */
function DropArea({
  busy,
  text,
  onFiles,
  tall = false
}: {
  busy: boolean
  text: string
  onFiles: (files: File[]) => void
  tall?: boolean
}): React.JSX.Element {
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        if (!busy) onFiles([...e.dataTransfer.files])
      }}
      style={{
        border: `2px dashed ${over ? 'var(--accent-primary)' : 'var(--glass-border-color)'}`,
        background: over ? 'var(--accent-tint)' : 'transparent',
        borderRadius: '10px',
        padding: tall ? '40px 20px' : '12px 16px',
        marginBottom: tall ? 0 : '16px',
        display: 'flex',
        flexDirection: tall ? 'column' : 'row',
        alignItems: 'center',
        gap: '12px',
        flexWrap: 'wrap',
        textAlign: tall ? 'center' : 'left',
        color: 'var(--text-secondary)',
        fontSize: '0.88rem'
      }}
    >
      {busy ? (
        <Loader2 size={tall ? 28 : 18} className="spinner" />
      ) : (
        <Inbox size={tall ? 28 : 18} />
      )}
      <span style={{ flex: tall ? undefined : 1, minWidth: '220px' }}>
        {busy ? 'Reading the files...' : text}
      </span>
      <button
        type="button"
        className="btn-secondary btn-sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={14} /> Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const list = [...(e.target.files || [])]
          e.target.value = ''
          if (list.length > 0) onFiles(list)
        }}
      />
    </div>
  )
}

/** The drop bar on a vessel's Documents tab: the vessel is known, only the types are guessed */
export default function DocumentFiling({
  vessel,
  onFiled
}: {
  vessel: Vessel
  onFiled: () => void
}): React.JSX.Element {
  const { showError } = useToast()
  const [reading, setReading] = useState(false)
  const [review, setReview] = useState<{
    files: DocFilingCandidate[]
    vessels: Record<string, DocFilingVesselInfo>
  } | null>(null)

  const start = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setReading(true)
    try {
      setReview(await window.api.docFilingAnalyze(vessel.id, await filePaths(files)))
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The files could not be read')
    } finally {
      setReading(false)
    }
  }

  return (
    <>
      <DropArea
        busy={reading}
        onFiles={(f) => void start(f)}
        text="Drop several files here (from Outlook, Downloads or a folder) to file them at once: the app suggests each type, you check, then they are moved to the vessel folder, renamed and linked."
      />
      {review && (
        <FilingReview
          files={review.files}
          vesselInfo={review.vessels}
          fixedVessel={vessel}
          onClose={() => setReview(null)}
          onFiled={onFiled}
        />
      )}
    </>
  )
}

/**
 * Filing from anywhere: files dropped on a part of the app that does not take files (a drop a
 * component handled is left alone), or the window opened from Ctrl+K / the Vessels page. The vessel
 * of each file is guessed too (IMO, then name, in the file name or its text).
 */
export function GlobalDocumentFiling(): React.JSX.Element | null {
  const { hasPermission } = useAuth()
  const { showError } = useToast()
  const allowed = hasPermission('documents:upload')
  const [hint, setHint] = useState(false)
  const [picker, setPicker] = useState(false)
  const [reading, setReading] = useState(false)
  const [review, setReview] = useState<{
    files: DocFilingCandidate[]
    vessels: Record<string, DocFilingVesselInfo>
  } | null>(null)
  const busyRef = useRef(false)

  const start = async (files: File[]): Promise<void> => {
    if (files.length === 0 || busyRef.current) return
    busyRef.current = true
    setReading(true)
    try {
      const res = await window.api.docFilingAnalyze(null, await filePaths(files))
      setPicker(false)
      setReview(res)
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The files could not be read')
    } finally {
      busyRef.current = false
      setReading(false)
    }
  }
  const startRef = useRef(start)
  useEffect(() => {
    startRef.current = start
  })

  useEffect(() => {
    if (!allowed) return
    let hideTimer: ReturnType<typeof setTimeout> | undefined
    const hasFiles = (e: DragEvent): boolean => !!e.dataTransfer?.types.includes('Files')
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return
      setHint(true)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => setHint(false), 400)
    }
    const onDrop = (): void => setHint(false)
    // Files no drop area took (App's window drop guard sends them)
    const onUnhandled = (e: Event): void => {
      setHint(false)
      void startRef.current((e as CustomEvent<File[]>).detail || [])
    }
    const onOpen = (): void => setPicker(true)
    window.addEventListener('dragover', onOver)
    window.addEventListener('drop', onDrop)
    window.addEventListener(UNHANDLED_DROP_EVENT, onUnhandled)
    window.addEventListener(OPEN_FILING_EVENT, onOpen)
    return () => {
      clearTimeout(hideTimer)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener(UNHANDLED_DROP_EVENT, onUnhandled)
      window.removeEventListener(OPEN_FILING_EVENT, onOpen)
    }
  }, [allowed])

  if (!allowed) return null
  return (
    <>
      {hint && !review && (
        <div
          role="status"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: '24px',
            transform: 'translateX(-50%)',
            zIndex: 2000,
            pointerEvents: 'none',
            background: 'var(--bg-primary)',
            border: '1px solid var(--accent-border)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            borderRadius: '10px',
            padding: '10px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.88rem'
          }}
        >
          <Inbox size={16} color="currentColor" /> Drop to file documents (the vessel and type are
          suggested)
        </div>
      )}
      {picker && !review && (
        <Modal
          title="File documents"
          icon={<Inbox size={18} />}
          onClose={() => !reading && setPicker(false)}
          width={620}
        >
          <DropArea
            tall
            busy={reading}
            onFiles={(f) => void start(f)}
            text="Drop files here (from Outlook, Downloads or a folder). The app suggests the vessel (IMO or name) and the document type of each; you check, then they are moved to the vessel folders, renamed and linked."
          />
        </Modal>
      )}
      {review && (
        <FilingReview
          files={review.files}
          vesselInfo={review.vessels}
          onClose={() => setReview(null)}
          onFiled={(ids) =>
            window.dispatchEvent(new CustomEvent(DOCUMENTS_FILED_EVENT, { detail: ids }))
          }
        />
      )}
    </>
  )
}
