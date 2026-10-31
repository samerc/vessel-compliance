import { useRef, useState } from 'react'
import { FolderOpen, Inbox, Loader2, Upload } from 'lucide-react'
import type {
  DocFilingCandidate,
  DocumentType,
  Vessel,
  VesselCustomDocType,
  VesselDocument
} from '../../../shared/types'
import { Badge, Modal } from './ui'
import { useToast } from '../contexts/ToastContext'

/**
 * Filing several documents at once: files dropped here (from Outlook, Downloads, a folder) get a
 * guessed document type; the user reviews the list, then each file is moved into the vessel's
 * folder, renamed (VESSEL - CODE - date) and linked. Nothing is filed before "File".
 */
export default function DocumentFiling({
  vessel,
  docTypes,
  customDocTypes,
  vesselDocs,
  onFiled
}: {
  vessel: Vessel
  docTypes: DocumentType[]
  customDocTypes: VesselCustomDocType[]
  vesselDocs: VesselDocument[]
  onFiled: () => void
}): React.JSX.Element {
  const { showError, showSuccess, showToast } = useToast()
  const [over, setOver] = useState(false)
  const [reading, setReading] = useState(false)
  const [review, setReview] = useState<{
    folder: string | null
    suggestedFolder: string | null
    rows: (DocFilingCandidate & { choice: string; expiry: string; result?: string })[]
  } | null>(null)
  const [filing, setFiling] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const types = [
    ...docTypes.map((t) => ({ id: t.id, name: t.name })),
    ...customDocTypes.map((t) => ({ id: t.id, name: t.name }))
  ]
  const typeName = (id: string): string => types.find((t) => t.id === id)?.name || ''

  const start = async (files: File[]): Promise<void> => {
    if (files.length === 0) return
    setReading(true)
    try {
      const paths: string[] = []
      for (const f of files) {
        // A file from Outlook has no path on disk: its content is saved to a temp folder first
        const p = window.api.getFilePath(f)
        paths.push(
          p || (await window.api.docFilingStage(f.name, new Uint8Array(await f.arrayBuffer())))
        )
      }
      const res = await window.api.docFilingAnalyze(vessel.id, paths)
      setReview({
        folder: res.folder,
        suggestedFolder: res.suggestedFolder,
        rows: res.files.map((f) => ({ ...f, choice: f.typeId || '', expiry: '' }))
      })
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The files could not be read')
    } finally {
      setReading(false)
    }
  }

  const rows = review?.rows || []
  const chosen = rows.filter((r) => !r.error && r.choice && r.choice !== 'skip' && !r.result)
  const counts = new Map<string, number>()
  chosen.forEach((r) => counts.set(r.choice, (counts.get(r.choice) || 0) + 1))
  const missing = rows.filter((r) => !r.error && !r.choice && !r.result)
  const doubled = [...counts.entries()].filter(([, n]) => n > 1).map(([id]) => typeName(id))
  const canFile =
    !!review?.folder && chosen.length > 0 && missing.length === 0 && doubled.length === 0

  const setRow = (path: string, patch: Partial<(typeof rows)[number]>): void =>
    setReview((r) =>
      r ? { ...r, rows: r.rows.map((x) => (x.path === path ? { ...x, ...patch } : x)) } : r
    )

  const pickFolder = async (): Promise<void> => {
    const dir = await window.api.dialogOpenFolder(
      review?.folder || review?.suggestedFolder || undefined
    )
    if (dir) setReview((r) => (r ? { ...r, folder: dir } : r))
  }

  const file = async (): Promise<void> => {
    if (!review?.folder) return
    setFiling(true)
    try {
      const results = await window.api.docFilingFile(
        vessel.id,
        review.folder,
        chosen.map((r) => ({
          path: r.path,
          documentTypeId: r.choice,
          expiryDate: r.expiry || null
        }))
      )
      const done = results.filter((r) => r.ok)
      results
        .filter((r) => r.renameError)
        .forEach((r) => showToast(r.renameError as string, 'warning'))
      const failed = results.filter((r) => !r.ok)
      if (done.length > 0) {
        showSuccess(
          `${done.length} document${done.length === 1 ? '' : 's'} filed for ${vessel.name}`
        )
        onFiled()
      }
      if (failed.length === 0) setReview(null)
      else
        setReview((r) =>
          r
            ? {
                ...r,
                rows: r.rows
                  .filter((x) => !done.some((d) => d.path === x.path))
                  .map((x) => ({
                    ...x,
                    result: failed.find((f) => f.path === x.path)?.error || x.result
                  }))
              }
            : r
        )
    } catch (e) {
      showError((e instanceof Error && e.message) || 'The documents were not filed')
    } finally {
      setFiling(false)
    }
  }

  return (
    <>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void start([...e.dataTransfer.files])
        }}
        style={{
          border: `2px dashed ${over ? 'var(--accent-primary)' : 'var(--glass-border-color)'}`,
          background: over ? 'var(--accent-tint)' : 'transparent',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          color: 'var(--text-secondary)',
          fontSize: '0.88rem'
        }}
      >
        {reading ? <Loader2 size={18} className="spinner" /> : <Inbox size={18} />}
        <span style={{ flex: 1, minWidth: '220px' }}>
          {reading
            ? 'Reading the files...'
            : 'Drop several files here (from Outlook, Downloads or a folder) to file them at once: the app suggests each type, you check, then they are moved to the vessel folder, renamed and linked.'}
        </span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={reading}
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
            void start(list)
          }}
        />
      </div>

      {review && (
        <Modal
          title={`File documents for ${vessel.name}`}
          icon={<Inbox size={18} />}
          onClose={() => !filing && setReview(null)}
          closeOnOverlay={false}
          width={980}
          footer={
            <>
              <span style={{ marginRight: 'auto', fontSize: '0.82rem', color: 'var(--danger)' }}>
                {!review.folder
                  ? 'Choose the vessel folder.'
                  : missing.length > 0
                    ? `Choose the type of ${missing.length} file${missing.length === 1 ? '' : 's'} (or Skip).`
                    : doubled.length > 0
                      ? `Only one file per type: ${doubled.join(', ')}.`
                      : ''}
              </span>
              <button
                type="button"
                className="btn-secondary"
                disabled={filing}
                onClick={() => setReview(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={!canFile || filing}
                onClick={() => void file()}
              >
                {filing ? <Loader2 size={14} className="spinner" /> : null}
                File {chosen.length} document{chosen.length === 1 ? '' : 's'}
              </button>
            </>
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginBottom: '14px',
              flexWrap: 'wrap'
            }}
          >
            <FolderOpen size={16} />
            <strong style={{ fontSize: '0.88rem' }}>Vessel folder</strong>
            <span
              style={{
                fontSize: '0.85rem',
                color: review.folder ? 'inherit' : 'var(--text-secondary)',
                wordBreak: 'break-all',
                flex: 1
              }}
            >
              {review.folder ||
                (review.suggestedFolder
                  ? `Suggested: ${review.suggestedFolder} (where its documents are). Confirm it with Choose.`
                  : 'None yet: choose the folder of this vessel.')}
            </span>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => void pickFolder()}
            >
              {review.folder ? 'Change...' : 'Choose...'}
            </button>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">File</th>
                  <th scope="col">Document type</th>
                  <th scope="col">Expiry (optional)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const current = vesselDocs.find(
                    (d) => d.documentTypeId === r.choice && d.filePath
                  )
                  return (
                    <tr key={r.path}>
                      <td style={{ maxWidth: '320px' }}>
                        <div style={{ wordBreak: 'break-all', fontWeight: 600 }}>{r.name}</div>
                        <div
                          style={{
                            marginTop: '4px',
                            display: 'flex',
                            gap: '6px',
                            flexWrap: 'wrap'
                          }}
                        >
                          {r.error ? (
                            <Badge tone="danger">{r.error}</Badge>
                          ) : r.result ? (
                            <Badge tone="danger">{r.result}</Badge>
                          ) : r.source && r.choice === r.typeId ? (
                            <Badge tone="success">
                              {r.source === 'name' ? 'From the file name' : 'From the content'}:{' '}
                              {r.matched}
                            </Badge>
                          ) : !r.choice ? (
                            <Badge tone="warning">Not recognised: choose the type</Badge>
                          ) : null}
                        </div>
                      </td>
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
                              {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            {current && r.choice !== 'skip' && (
                              <div
                                style={{
                                  fontSize: '0.75rem',
                                  color: 'var(--text-secondary)',
                                  marginTop: '4px'
                                }}
                              >
                                Replaces {current.filePath?.split(/[\\/]/).pop()} (kept in History)
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
      )}
    </>
  )
}
