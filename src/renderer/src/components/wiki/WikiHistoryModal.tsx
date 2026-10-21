import { useEffect, useMemo, useState } from 'react'
import { History, RotateCcw } from 'lucide-react'
import type { WikiTopic, WikiVersion } from '../../../../shared/types'
import { sanitizeHtml } from '../../utils/sanitize'
import { withAutoDir } from './autoDir'
import { formatDateTime } from '../../utils/dateUtils'
import { useToast } from '../../contexts/ToastContext'
import { confirmDialog } from '../DialogHost'
import { Badge, Modal, Spinner } from '../ui'

/** Saved versions of a topic (newest first); an earlier one can be made current again */
export default function WikiHistoryModal({
  topic,
  onClose,
  onRestored
}: {
  topic: WikiTopic
  onClose: () => void
  onRestored: (topic: WikiTopic) => void
}): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const [versions, setVersions] = useState<WikiVersion[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    window.api
      .wikiVersions(topic.id)
      .then((rows) => {
        if (!live) return
        const list = Array.isArray(rows) ? rows : []
        setVersions(list)
        setPicked(list[0]?.id ?? null)
      })
      .catch(() => live && setVersions([]))
    return () => {
      live = false
    }
  }, [topic.id])

  const version = versions?.find((v) => v.id === picked) || null
  const isCurrent = !!versions && versions[0]?.id === picked
  const html = useMemo(() => withAutoDir(sanitizeHtml(version?.bodyHtml || '')), [version])

  const restore = async (): Promise<void> => {
    if (!version) return
    if (
      !(await confirmDialog(
        `Make the version of ${formatDateTime(version.savedAt)} the current text? The current text stays in the history.`,
        { title: 'Restore version', confirmLabel: 'Restore' }
      ))
    )
      return
    setBusy(true)
    try {
      const t = await window.api.wikiRestoreVersion(version.id)
      showSuccess('Earlier version restored')
      onRestored(t)
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to restore the version')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`History of "${topic.title}"`}
      icon={<History size={18} />}
      onClose={onClose}
      width={900}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn-primary"
            disabled={!version || isCurrent || busy}
            onClick={() => void restore()}
          >
            <RotateCcw size={14} /> Make this the current text
          </button>
        </>
      }
    >
      {versions === null ? (
        <div style={{ padding: '24px', textAlign: 'center' }}>
          <Spinner size={18} />
        </div>
      ) : versions.length === 0 ? (
        <p className="muted">No saved versions.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: '14px' }}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {versions.map((v, i) => (
              <button
                key={v.id}
                className={`wiki-item${picked === v.id ? ' selected' : ''}`}
                onClick={() => setPicked(v.id)}
              >
                <span className="wiki-item-title">
                  {formatDateTime(v.savedAt)}{' '}
                  {i === 0 && (
                    <Badge tone="success" style={{ marginLeft: '4px' }}>
                      Current
                    </Badge>
                  )}
                </span>
                <span className="wiki-snippet">{v.savedByUsername || 'Unknown'}</span>
              </button>
            ))}
          </div>
          <div
            style={{
              maxHeight: '60vh',
              overflowY: 'auto',
              borderLeft: '1px solid var(--glass-border-color)',
              paddingLeft: '14px'
            }}
          >
            {version && (
              <>
                <h3 className="wiki-title" dir="auto" style={{ fontSize: '1.15rem' }}>
                  {version.title}
                </h3>
                <div className="wiki-meta" style={{ marginBottom: '12px' }}>
                  {version.category && <Badge tone="accent">{version.category}</Badge>}
                  {version.tags.map((t) => (
                    <span key={t} className="wiki-tag" dir="auto">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="wiki-body" dangerouslySetInnerHTML={{ __html: html }} />
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}
