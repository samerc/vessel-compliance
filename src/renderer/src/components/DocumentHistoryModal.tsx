import { useState } from 'react'
import { History, Eye, FolderOpen, RotateCcw } from 'lucide-react'
import type { DocumentHistoryEntry } from '../../../shared/types'
import { Modal } from './ui'
import { confirmDialog } from './DialogHost'
import { useToast } from '../contexts/ToastContext'
import { formatDate } from '../utils/dateUtils'

interface Props {
  /** Document name shown in the title, e.g. "COR" */
  documentName: string
  /** Earlier files of this document, newest first */
  entries: DocumentHistoryEntry[]
  /** Restore needs the same permission as replacing the file */
  canRestore: boolean
  onClose: () => void
  /** Called after an earlier file was made current again */
  onRestored: () => void
}

const fileName = (p: string): string => p.split(/[\\/]/).pop() || p

/**
 * Earlier files of a vessel / entity document. The app keeps links only: a file that was
 * deleted or saved over on disk cannot be opened any more.
 */
export default function DocumentHistoryModal({
  documentName,
  entries,
  canRestore,
  onClose,
  onRestored
}: Props): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const [busyId, setBusyId] = useState<string | null>(null)

  const open = async (p: string): Promise<void> => {
    const res: unknown = await window.api.fsOpen(p)
    if (res && typeof res === 'object' && 'error' in res && res.error)
      showError(
        ('message' in res && typeof res.message === 'string' && res.message) || `Cannot open: ${p}`
      )
    else if (typeof res === 'string' && res) showError(`Cannot open: ${res}`)
  }

  const restore = async (e: DocumentHistoryEntry): Promise<void> => {
    if (
      !(await confirmDialog(
        `Make "${fileName(e.filePath)}" the current ${documentName} again? The current file stays in the history.`,
        { isDangerous: false }
      ))
    )
      return
    setBusyId(e.id)
    try {
      await window.api.docHistoryRestore(e.id)
      showSuccess(`${documentName}: earlier file restored`)
      onRestored()
      onClose()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to restore the file')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal
      title={`${documentName}: earlier files`}
      icon={<History size={18} />}
      onClose={onClose}
      width={640}
      footer={
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      {entries.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No earlier files.</div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Received</th>
                <th>Expiry</th>
                <th>Replaced</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ maxWidth: 220, wordBreak: 'break-all' }} title={e.filePath}>
                    {fileName(e.filePath)}
                    {e.uploadedBy && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        linked by {e.uploadedBy}
                      </div>
                    )}
                  </td>
                  <td>{e.receivedDate ? formatDate(e.receivedDate) : '-'}</td>
                  <td>{e.expiryDate ? formatDate(e.expiryDate) : '-'}</td>
                  <td>
                    {formatDate(e.replacedAt)}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {e.action === 'removed' ? 'unlinked' : 'replaced'}
                      {e.replacedBy ? ` by ${e.replacedBy}` : ''}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button
                      className="btn-secondary"
                      style={{ padding: '3px 7px' }}
                      title="Open file"
                      onClick={() => open(e.filePath)}
                    >
                      <Eye size={13} />
                    </button>{' '}
                    <button
                      className="btn-secondary"
                      style={{ padding: '3px 7px' }}
                      title="Open file location"
                      onClick={() => window.api.shellShowItemInFolder(e.filePath)}
                    >
                      <FolderOpen size={13} />
                    </button>{' '}
                    {canRestore && (
                      <button
                        className="btn-secondary"
                        style={{ padding: '3px 7px' }}
                        title="Make this the current file again"
                        disabled={busyId !== null}
                        onClick={() => restore(e)}
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        Earlier files are kept as links. A file that was deleted or saved over in its folder cannot
        be opened any more.
      </div>
    </Modal>
  )
}
