import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Library,
  Plus,
  Search,
  X,
  Upload,
  Trash2,
  RotateCcw,
  MessageSquare,
  HelpCircle
} from 'lucide-react'
import type {
  WikiSearchHit,
  WikiSettings,
  WikiTopic,
  WikiTopicSummary
} from '../../../../shared/types'
import { searchWords } from '../../../../shared/wikiSearch'
import { FEATURES, type NavTarget } from '../../features'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { leaveThen } from '../../utils/useUnsavedGuard'
import type { SubTabProps } from '../../utils/useRequestedSubTab'
import { formatDate } from '../../utils/dateUtils'
import { EmptyState, PageHeader, Spinner } from '../ui'
import { confirmDialog } from '../DialogHost'
import WikiTopicView from './WikiTopicView'
import WikiTopicEditor from './WikiTopicEditor'
import WikiImportModal from './WikiImportModal'
import Highlighted from './Highlighted'
import './Wiki.css'

/** Categories offered before any topic uses them */
const WIKI_DEFAULT_CATEGORIES = ['Procedures', 'Insurance terms', 'Using the app']
const NO_CATEGORY = 'Other'

type Mode = { kind: 'view' } | { kind: 'edit' } | { kind: 'new'; featureId?: string | null }

/** Topics about a page of the app: its features (page + views), the name shown, the default link */
interface PageFilter {
  ids: string[]
  label: string
  primary: string | null
}

// Pages without features of their own count as the page they belong to
const PAGE_ALIASES: Record<string, string> = {
  'policy-detail': 'policies-list',
  'policy-setup': 'policies-list',
  users: 'admin'
}

function filterForPage(tab: string): PageFilter {
  const t = PAGE_ALIASES[tab] || tab
  const list = FEATURES.filter((f) => f.target.tab === t)
  const main =
    list.find((f) => f.kind === 'page' && !f.target.sub) ||
    list.find((f) => f.kind === 'page') ||
    list[0]
  return {
    ids: list.map((f) => f.id),
    label: main?.title || 'this page',
    primary: main?.id ?? null
  }
}

function filterForFeature(id: string): PageFilter {
  return { ids: [id], label: FEATURES.find((f) => f.id === id)?.title || 'this page', primary: id }
}

/**
 * Wiki: topics anyone can write (procedures, insurance terms, how the app works), searchable
 * in English and Arabic. Requests: `topic:{id}` opens a topic, `feature:{id}` shows the topics
 * about a page of the app (its ? button / F1), `new` starts a topic.
 */
export default function WikiPage({
  subTab,
  subTabNonce,
  onNavigate
}: SubTabProps & { onNavigate: (target: NavTarget) => void }): React.JSX.Element {
  const { hasPermission } = useAuth()
  const { showError, showSuccess } = useToast()
  const isAdmin = hasPermission('admin:settings')

  const [topics, setTopics] = useState<WikiTopicSummary[] | null>(null)
  // Bumped to load the list again (after a save, delete, import); topicsLoads counts the answers
  const [topicsKey, setTopicsKey] = useState(0)
  const [topicsLoads, setTopicsLoads] = useState(0)
  const [deleted, setDeleted] = useState<WikiTopicSummary[] | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ q: string; hits: WikiSearchHit[] } | null>(null)
  // Bumped after a save or delete so the shown search results are fetched again
  const [searchKey, setSearchKey] = useState(0)
  const [category, setCategory] = useState<string | null>(null)
  const [featureFilter, setFeatureFilter] = useState<PageFilter | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<{ id: string; topic: WikiTopic | null } | null>(null)
  const [topicKey, setTopicKey] = useState(0)
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [settings, setSettings] = useState<WikiSettings>({ commentsEnabled: false })
  const [importOpen, setImportOpen] = useState(false)
  // A page's ? button opens its topic when there is exactly one (once the list is fresh)
  const [autoOpen, setAutoOpen] = useState<{ filter: PageFilter; after: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const reloadTopics = (): void => setTopicsKey((k) => k + 1)

  useEffect(() => {
    let live = true
    window.api
      .wikiList()
      .then((list) => {
        if (!live) return
        setTopics(Array.isArray(list) ? list : [])
        setTopicsLoads((n) => n + 1)
      })
      .catch(() => {
        if (!live) return
        setTopics([])
        setTopicsLoads((n) => n + 1)
      })
    return () => {
      live = false
    }
  }, [topicsKey])

  useEffect(() => {
    window.api
      .wikiGetSettings()
      .then((s) => s && !('error' in s) && setSettings(s))
      .catch(() => {})
  }, [])

  // Deleted topics, loaded when that list is shown
  useEffect(() => {
    if (!showDeleted) return
    let live = true
    window.api
      .wikiListDeleted()
      .then((rows) => live && setDeleted(Array.isArray(rows) ? rows : []))
      .catch(() => live && setDeleted([]))
    return () => {
      live = false
    }
  }, [showDeleted])

  // Search (debounced); the last results stay on screen until the new ones arrive
  const q = query.trim()
  useEffect(() => {
    if (!q) return
    let live = true
    const timer = setTimeout(() => {
      window.api
        .wikiSearch(q)
        .then((rows) => live && setSearch({ q, hits: Array.isArray(rows) ? rows : [] }))
        .catch(() => live && setSearch({ q, hits: [] }))
    }, 200)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [q, searchKey])
  const hits = q ? (search?.hits ?? null) : null
  const searching = !!q && search?.q !== q

  // The open topic
  useEffect(() => {
    if (!selectedId) return
    let live = true
    window.api
      .wikiGet(selectedId)
      .then((t) => {
        if (!live) return
        const found = t && !('error' in t) ? t : null
        setLoaded({ id: selectedId, topic: found })
        if (found && !found.deletedAt)
          window.api
            .recentItemsAdd('wiki', found.id, found.title, found.category || 'Wiki')
            .catch(() => {})
      })
      .catch(() => live && setLoaded({ id: selectedId, topic: null }))
    return () => {
      live = false
    }
  }, [selectedId, topicKey])
  const topic = loaded && loaded.id === selectedId ? loaded.topic : null
  const loadingTopic = !!selectedId && loaded?.id !== selectedId

  // Always fetched again: someone else may have changed it since
  const openTopic = useCallback((id: string | null): void => {
    leaveThen(() => {
      setSelectedId(id)
      setTopicKey((k) => k + 1)
      setMode({ kind: 'view' })
    })
  }, [])

  const startNew = useCallback((featureId?: string | null): void => {
    leaveThen(() => {
      setSelectedId(null)
      setMode({ kind: 'new', featureId: featureId ?? null })
    })
  }, [])

  // Requests from outside (Ctrl+K, notifications, Recent, a page's ? button), applied while
  // rendering; App already asked about unsaved changes before coming here
  const reqKey = subTab ? `${subTab}#${subTabNonce ?? ''}` : null
  const [handledReq, setHandledReq] = useState<string | null>(null)
  if (reqKey !== handledReq) {
    setHandledReq(reqKey)
    if (subTab?.startsWith('topic:')) {
      setShowDeleted(false)
      setSelectedId(subTab.slice(6))
      setMode({ kind: 'view' })
    } else if (subTab?.startsWith('feature:') || subTab?.startsWith('page:')) {
      const filter = subTab.startsWith('page:')
        ? filterForPage(subTab.slice(5))
        : filterForFeature(subTab.slice(8))
      setShowDeleted(false)
      setQuery('')
      setCategory(null)
      setFeatureFilter(filter)
      setSelectedId(null)
      setMode({ kind: 'view' })
      setAutoOpen({ filter, after: topicsLoads })
      setTopicsKey((k) => k + 1)
    } else if (subTab === 'new') {
      setSelectedId(null)
      setMode({ kind: 'new', featureId: null })
    }
  }
  if (autoOpen && topics && topicsLoads > autoOpen.after) {
    setAutoOpen(null)
    const about = topics.filter((t) => !!t.featureId && autoOpen.filter.ids.includes(t.featureId))
    if (about.length === 1) setSelectedId(about[0].id)
  }

  // "/" focuses the search box (when not typing somewhere)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement
      if (e.key !== '/' || el.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const categories = useMemo(() => {
    const set = new Set(WIKI_DEFAULT_CATEGORIES)
    for (const t of topics || []) if (t.category) set.add(t.category)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [topics])

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of topics || []) {
      const c = t.category || NO_CATEGORY
      m.set(c, (m.get(c) || 0) + 1)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [topics])

  const words = useMemo(() => searchWords(query), [query])
  // Name of the app page a topic explains (none for the Wiki itself: it is already open)
  const featureTitle = (id: string | null | undefined): string => {
    const f = id ? FEATURES.find((x) => x.id === id) : undefined
    return f && f.target.tab !== 'wiki' ? f.title : ''
  }

  // What the list shows: search hits, or topics grouped by category
  const listed: (WikiTopicSummary & { snippet?: string })[] = useMemo(() => {
    let rows: (WikiTopicSummary & { snippet?: string })[] = showDeleted
      ? deleted || []
      : hits !== null
        ? hits
        : topics || []
    if (category) rows = rows.filter((t) => (t.category || NO_CATEGORY) === category)
    if (featureFilter && !showDeleted)
      rows = rows.filter((t) => !!t.featureId && featureFilter.ids.includes(t.featureId))
    return rows
  }, [showDeleted, deleted, hits, topics, category, featureFilter])

  const groups = useMemo(() => {
    if (hits !== null || showDeleted) return null
    const m = new Map<string, WikiTopicSummary[]>()
    for (const t of listed) {
      const c = t.category || NO_CATEGORY
      if (!m.has(c)) m.set(c, [])
      m.get(c)!.push(t)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [listed, hits, showDeleted])

  const afterSave = (saved: WikiTopic): void => {
    reloadTopics()
    setSearchKey((k) => k + 1)
    setLoaded({ id: saved.id, topic: saved })
    setSelectedId(saved.id)
    setMode({ kind: 'view' })
  }

  const removeTopic = async (t: WikiTopic): Promise<void> => {
    if (
      !(await confirmDialog(`Delete "${t.title}"? It can be restored from the Deleted list.`, {
        title: 'Delete topic',
        confirmLabel: 'Delete'
      }))
    )
      return
    try {
      await window.api.wikiDeleteTopic(t.id)
      showSuccess('Topic deleted')
      setSelectedId(null)
      setDeleted(null)
      reloadTopics()
      setSearchKey((k) => k + 1)
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to delete the topic')
    }
  }

  const restoreTopic = async (id: string): Promise<void> => {
    try {
      await window.api.wikiRestoreTopic(id)
      showSuccess('Topic restored')
      setDeleted((d) => (d ? d.filter((x) => x.id !== id) : d))
      reloadTopics()
      setShowDeleted(false)
      setSelectedId(id)
      setTopicKey((k) => k + 1)
      setMode({ kind: 'view' })
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to restore the topic')
    }
  }

  const toggleComments = async (): Promise<void> => {
    try {
      const next = await window.api.wikiSetSettings({ commentsEnabled: !settings.commentsEnabled })
      setSettings(next)
      showSuccess(next.commentsEnabled ? 'Comments switched on' : 'Comments switched off')
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to change the setting')
    }
  }

  const renderItem = (t: WikiTopicSummary & { snippet?: string }): React.JSX.Element => (
    <button
      key={t.id}
      className={`wiki-item${selectedId === t.id && mode.kind !== 'new' ? ' selected' : ''}`}
      onClick={() => openTopic(t.id)}
    >
      <span className="wiki-item-title" dir="auto">
        <Highlighted text={t.title} words={words} />
      </span>
      {t.snippet && (
        <span className="wiki-snippet" dir="auto">
          <Highlighted text={t.snippet} words={words} />
        </span>
      )}
      {(hits !== null || showDeleted) && (
        <span className="wiki-snippet">
          {showDeleted
            ? `Deleted ${formatDate(t.deletedAt)}${t.deletedByUsername ? ` by ${t.deletedByUsername}` : ''}`
            : t.category || NO_CATEGORY}
        </span>
      )}
    </button>
  )

  const total = topics?.length ?? 0

  return (
    <div className="page">
      <PageHeader
        icon={<Library size={26} />}
        title="Wiki"
        subtitle="Procedures, insurance terms and how the app works. Anyone can write."
        actions={
          <>
            {isAdmin && (
              <button
                className="btn-ghost btn-sm"
                onClick={() => void toggleComments()}
                title="Comments under topics, for everyone (admins switch this)"
              >
                <MessageSquare size={14} /> Comments: {settings.commentsEnabled ? 'On' : 'Off'}
              </button>
            )}
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              <Upload size={15} /> Import
            </button>
            <button className="btn-primary" onClick={() => startNew(featureFilter?.primary)}>
              <Plus size={15} /> New topic
            </button>
          </>
        }
      />

      <div className="wiki-layout">
        <aside className="wiki-side" aria-label="Topics">
          <div className="wiki-side-head">
            <div style={{ position: 'relative' }}>
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
                ref={searchRef}
                type="search"
                dir="auto"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  if (showDeleted) setShowDeleted(false)
                }}
                placeholder="Search the wiki... ( / )"
                aria-label="Search the wiki"
                style={{ width: '100%', paddingLeft: '30px' }}
              />
            </div>
            {featureFilter && !showDeleted && (
              <div
                className="muted"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
              >
                <HelpCircle size={13} />
                <span style={{ flex: 1 }}>
                  About <strong>{featureFilter.label}</strong>
                </span>
                <button
                  className="btn-ghost btn-icon btn-sm"
                  title="Show all topics"
                  aria-label="Show all topics"
                  onClick={() => setFeatureFilter(null)}
                >
                  <X size={13} />
                </button>
              </div>
            )}
            {!showDeleted && categoryCounts.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <button
                  className={`chip${category === null ? ' active' : ''}`}
                  onClick={() => setCategory(null)}
                >
                  All <span className="chip-count">{total}</span>
                </button>
                {categoryCounts.map(([c, n]) => (
                  <button
                    key={c}
                    className={`chip${category === c ? ' active' : ''}`}
                    onClick={() => setCategory(category === c ? null : c)}
                  >
                    {c} <span className="chip-count">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="wiki-list">
            {topics === null || (showDeleted && deleted === null) ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <Spinner size={16} />
              </div>
            ) : searching && hits === null ? (
              <div style={{ padding: '20px', textAlign: 'center' }}>
                <Spinner size={16} label="Searching..." />
              </div>
            ) : listed.length === 0 ? (
              <div className="muted" style={{ padding: '16px 10px', fontSize: '0.84rem' }}>
                {showDeleted
                  ? 'No deleted topics.'
                  : query.trim()
                    ? `Nothing found for "${query.trim()}".`
                    : featureFilter
                      ? 'No topic about this page yet.'
                      : 'No topics yet.'}
              </div>
            ) : groups ? (
              groups.map(([c, rows]) => (
                <div key={c}>
                  {(groups.length > 1 || !category) && (
                    <div className="wiki-group-title">
                      <span>{c}</span>
                      <span>{rows.length}</span>
                    </div>
                  )}
                  {rows.map(renderItem)}
                </div>
              ))
            ) : (
              <>
                {hits !== null && !showDeleted && (
                  <div className="wiki-group-title">
                    <span>
                      {listed.length} result{listed.length === 1 ? '' : 's'}
                    </span>
                  </div>
                )}
                {listed.map(renderItem)}
              </>
            )}
          </div>
          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid var(--glass-border-color)',
              fontSize: '0.78rem'
            }}
          >
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                setShowDeleted(!showDeleted)
                setCategory(null)
              }}
            >
              {showDeleted ? (
                <>
                  <Library size={13} /> Back to topics
                </>
              ) : (
                <>
                  <Trash2 size={13} /> Deleted topics
                </>
              )}
            </button>
          </div>
        </aside>

        <main className="wiki-main" aria-label="Topic">
          {mode.kind === 'new' ? (
            <WikiTopicEditor
              key="new"
              initial={null}
              defaultCategory={category && category !== NO_CATEGORY ? category : ''}
              defaultFeatureId={mode.featureId ?? null}
              categories={categories}
              topics={topics || []}
              onSaved={afterSave}
              onCancel={() => setMode({ kind: 'view' })}
            />
          ) : mode.kind === 'edit' && topic ? (
            <WikiTopicEditor
              key={topic.id}
              initial={topic}
              categories={categories}
              topics={topics || []}
              onSaved={afterSave}
              onCancel={() => setMode({ kind: 'view' })}
            />
          ) : loadingTopic && !topic ? (
            <div style={{ padding: '40px', textAlign: 'center' }}>
              <Spinner size={18} />
            </div>
          ) : topic && selectedId === topic.id ? (
            topic.deletedAt ? (
              <div>
                <div
                  className="muted"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '14px',
                    fontSize: '0.85rem'
                  }}
                >
                  <Trash2 size={15} />
                  <span style={{ flex: 1 }}>
                    Deleted {formatDate(topic.deletedAt)}
                    {topic.deletedByUsername ? ` by ${topic.deletedByUsername}` : ''}
                  </span>
                  <button
                    className="btn-primary btn-sm"
                    onClick={() => void restoreTopic(topic.id)}
                  >
                    <RotateCcw size={13} /> Restore
                  </button>
                </div>
                <WikiTopicView
                  topic={topic}
                  readOnly
                  commentsEnabled={false}
                  words={words}
                  featureTitle={featureTitle(topic.featureId)}
                  onOpenTopic={openTopic}
                  onOpenFeature={() => {}}
                  onEdit={() => {}}
                  onDelete={() => {}}
                  onRestored={afterSave}
                />
              </div>
            ) : (
              <WikiTopicView
                topic={topic}
                commentsEnabled={settings.commentsEnabled}
                words={words}
                featureTitle={featureTitle(topic.featureId)}
                onOpenTopic={openTopic}
                onOpenFeature={() => {
                  const f = FEATURES.find((x) => x.id === topic.featureId)
                  if (f) onNavigate(f.target)
                }}
                onEdit={() => setMode({ kind: 'edit' })}
                onDelete={() => void removeTopic(topic)}
                onRestored={afterSave}
              />
            )
          ) : selectedId && !loadingTopic ? (
            <EmptyState
              icon={<Library size={28} />}
              title="Topic not found"
              text="It may have been deleted."
            />
          ) : featureFilter && listed.length === 0 ? (
            <EmptyState
              icon={<HelpCircle size={28} />}
              title={`No topic about ${featureFilter.label} yet`}
              text="Explain how it works for the next person: what it is for, the steps, what to watch out for."
              action={
                <button className="btn-primary" onClick={() => startNew(featureFilter.primary)}>
                  <Plus size={15} /> Write the first topic
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<Library size={28} />}
              title={total ? 'Pick a topic' : 'The wiki is empty'}
              text={
                total
                  ? `${total} topic${total === 1 ? '' : 's'}. Search on the left (titles, tags and text, in English or Arabic) or press Ctrl+K anywhere in the app.`
                  : 'Write the first topic, or import Word files.'
              }
              action={
                <button className="btn-primary" onClick={() => startNew()}>
                  <Plus size={15} /> New topic
                </button>
              }
            />
          )}
        </main>
      </div>

      {importOpen && (
        <WikiImportModal
          categories={categories}
          onClose={() => setImportOpen(false)}
          onImported={(n) => {
            setImportOpen(false)
            showSuccess(`${n} topic${n === 1 ? '' : 's'} imported`)
            reloadTopics()
          }}
        />
      )}
    </div>
  )
}
