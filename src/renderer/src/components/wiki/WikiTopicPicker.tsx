import { useMemo, useState } from 'react'
import { Library, Search } from 'lucide-react'
import type { WikiTopicSummary } from '../../../../shared/types'
import { foldSearch, searchWords } from '../../../../shared/wikiSearch'
import { Modal } from '../ui'

/** Pick a topic to link to (searched on titles, categories and tags) */
export default function WikiTopicPicker({
  topics,
  onPick,
  onClose
}: {
  topics: WikiTopicSummary[]
  onPick: (topic: WikiTopicSummary) => void
  onClose: () => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => {
    const words = searchWords(query)
    return topics
      .filter((t) => {
        if (!words.length) return true
        const hay = foldSearch(`${t.title} ${t.category} ${t.tags.join(' ')}`)
        return words.every((w) => hay.includes(w))
      })
      .slice(0, 80)
  }, [topics, query])

  return (
    <Modal title="Link to a topic" icon={<Library size={18} />} onClose={onClose} width={520}>
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <Search
          size={14}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)'
          }}
        />
        <input
          autoFocus
          dir="auto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && shown[0]) onPick(shown[0])
          }}
          placeholder="Search topics..."
          style={{ width: '100%', paddingLeft: '30px' }}
        />
      </div>
      <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
        {shown.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.84rem' }}>
            No topic found.
          </p>
        ) : (
          shown.map((t) => (
            <button key={t.id} className="wiki-item" onClick={() => onPick(t)}>
              <span className="wiki-item-title" dir="auto">
                {t.title}
              </span>
              <span className="wiki-snippet">{t.category || 'Other'}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
