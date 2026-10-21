import { useEffect, useRef, useState } from 'react'
import { Upload, AlertTriangle } from 'lucide-react'
import type { WikiImportFile } from '../../../../shared/types'
import { useToast } from '../../contexts/ToastContext'
import { Field, Modal, Spinner } from '../ui'

type Row = WikiImportFile & { include: boolean }

/**
 * Import Word (.docx) or text files: one topic per file. The title comes from the file's first
 * heading, else its name; both can be changed before importing.
 */
export default function WikiImportModal({
  categories,
  onClose,
  onImported
}: {
  categories: string[]
  onClose: () => void
  onImported: (count: number) => void
}): React.JSX.Element {
  const { showError } = useToast()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [category, setCategory] = useState('')
  const [tags, setTags] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = async (): Promise<void> => {
    setRows(null)
    try {
      const files: unknown = await window.api.wikiReadImportFiles()
      if (!Array.isArray(files)) {
        showError((files as { message?: string })?.message || 'Failed to read the files')
        onClose()
        return
      }
      const list = files as WikiImportFile[]
      if (list.length === 0) {
        onClose()
        return
      }
      setRows(list.map((f) => ({ ...f, include: !f.error })))
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to read the files')
      onClose()
    }
  }

  // The file dialog opens once (StrictMode runs effects twice in development)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void pick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const chosen = (rows || []).filter((r) => r.include && !r.error && r.title.trim())

  const run = async (): Promise<void> => {
    if (chosen.length === 0) return
    setBusy(true)
    try {
      const tagList = tags
        .split(/[,،;]/)
        .map((x) => x.trim())
        .filter(Boolean)
      const res = await window.api.wikiImportTopics(
        chosen.map((r) => ({
          title: r.title.trim(),
          category: category.trim(),
          tags: tagList,
          bodyHtml: r.bodyHtml
        }))
      )
      onImported(res.created)
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to import the files')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Import into the wiki"
      icon={<Upload size={18} />}
      onClose={onClose}
      width={680}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={busy || chosen.length === 0}
            onClick={() => void run()}
          >
            {busy
              ? 'Importing...'
              : `Import ${chosen.length} topic${chosen.length === 1 ? '' : 's'}`}
          </button>
        </>
      }
    >
      {rows === null ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Spinner size={18} label="Reading the files..." />
        </div>
      ) : (
        <>
          <p className="muted" style={{ fontSize: '0.82rem', margin: '0 0 12px' }}>
            Each file becomes a topic with its text, headings, lists and tables (pictures are left
            out). Check the titles before importing.
          </p>
          <div className="form-grid" style={{ marginBottom: '12px' }}>
            <Field label="Category" htmlFor="wiki-import-category">
              <input
                id="wiki-import-category"
                dir="auto"
                list="wiki-import-categories"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="For all imported topics"
              />
              <datalist id="wiki-import-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Tags" htmlFor="wiki-import-tags" hint="Comma between tags">
              <input
                id="wiki-import-tags"
                dir="auto"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </Field>
          </div>
          <div className="table-wrap" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '36px' }} />
                  <th>Title</th>
                  <th style={{ width: '200px' }}>File</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={!!r.error}
                        aria-label={`Import ${r.fileName}`}
                        onChange={(e) =>
                          setRows((list) =>
                            (list || []).map((x, j) =>
                              j === i ? { ...x, include: e.target.checked } : x
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      {r.error ? (
                        <span
                          style={{
                            color: 'var(--danger)',
                            display: 'inline-flex',
                            gap: '6px',
                            alignItems: 'center'
                          }}
                        >
                          <AlertTriangle size={13} /> {r.error}
                        </span>
                      ) : (
                        <input
                          dir="auto"
                          value={r.title}
                          onChange={(e) =>
                            setRows((list) =>
                              (list || []).map((x, j) =>
                                j === i ? { ...x, title: e.target.value } : x
                              )
                            )
                          }
                          style={{ width: '100%' }}
                        />
                      )}
                    </td>
                    <td className="muted" style={{ fontSize: '0.78rem', wordBreak: 'break-all' }}>
                      {r.fileName}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  )
}
