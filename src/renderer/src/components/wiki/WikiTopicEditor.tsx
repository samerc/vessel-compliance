import { useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Library, Save, X, AlertTriangle } from 'lucide-react'
import type { WikiTopic, WikiTopicSummary } from '../../../../shared/types'
import { foldSearch } from '../../../../shared/wikiSearch'
import { FEATURES, FEATURE_AREAS } from '../../features'
import { useToast } from '../../contexts/ToastContext'
import { useUnsavedGuard } from '../../utils/useUnsavedGuard'
import { formatDateTime } from '../../utils/dateUtils'
import { confirmDialog } from '../DialogHost'
import { Field } from '../ui'
import RichTextEditor from '../RichTextEditor'
import WikiTopicPicker from './WikiTopicPicker'

interface Props {
  /** null = a new topic */
  initial: WikiTopic | null
  defaultCategory?: string
  /** A new topic about this page of the app (from its ? button) */
  defaultFeatureId?: string | null
  categories: string[]
  /** All topics: duplicate title check, links to other topics */
  topics: WikiTopicSummary[]
  onSaved: (topic: WikiTopic) => void
  onCancel: () => void
}

interface Draft {
  title: string
  category: string
  tags: string[]
  featureId: string
  bodyHtml: string
}

// Pages and views of the app a topic can explain (actions such as "New vessel" are left out)
const PAGE_OPTIONS = FEATURE_AREAS.map((area) => ({
  area,
  items: FEATURES.filter((f) => f.area === area && f.kind !== 'action').sort((a, b) =>
    a.title.localeCompare(b.title)
  )
})).filter((g) => g.items.length > 0)

export default function WikiTopicEditor({
  initial,
  defaultCategory,
  defaultFeatureId,
  categories,
  topics,
  onSaved,
  onCancel
}: Props): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const start: Draft = useMemo(
    () => ({
      title: initial?.title || '',
      category: initial ? initial.category : defaultCategory || '',
      tags: initial?.tags || [],
      featureId: (initial ? initial.featureId : defaultFeatureId) || '',
      bodyHtml: initial?.bodyHtml || ''
    }),
    // The editor is remounted for another topic (key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const [draft, setDraft] = useState<Draft>(start)
  const [tagInput, setTagInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const editorRef = useRef<Editor | null>(null)

  const dirty =
    draft.title !== start.title ||
    draft.category !== start.category ||
    draft.featureId !== start.featureId ||
    draft.tags.join('\u0001') !== start.tags.join('\u0001') ||
    draft.bodyHtml !== start.bodyHtml ||
    tagInput.trim() !== ''
  useUnsavedGuard(dirty, 'Leave without saving? Your changes to this topic will be lost.')

  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void =>
    setDraft((d) => ({ ...d, [k]: v }))

  const sameTitle = useMemo(() => {
    const f = foldSearch(draft.title)
    if (!f) return null
    return topics.find((t) => t.id !== initial?.id && foldSearch(t.title) === f) || null
  }, [draft.title, topics, initial?.id])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const t of topics) for (const g of t.tags) s.add(g)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [topics])

  const addTags = (raw: string): void => {
    const add = raw
      .split(/[,،;]/)
      .map((x) => x.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
    if (add.length === 0) return
    setDraft((d) => ({
      ...d,
      tags: [
        ...d.tags,
        ...add.filter((x) => !d.tags.some((y) => y.toLocaleLowerCase() === x.toLocaleLowerCase()))
      ]
    }))
    setTagInput('')
  }

  const save = async (force = false): Promise<void> => {
    if (!draft.title.trim()) {
      showError('Give the topic a title')
      return
    }
    const tags = tagInput.trim()
      ? [...draft.tags, ...tagInput.split(/[,،;]/).map((x) => x.trim())].filter(Boolean)
      : draft.tags
    setSaving(true)
    try {
      const res = await window.api.wikiSaveTopic({
        id: initial?.id,
        title: draft.title,
        category: draft.category,
        tags,
        bodyHtml: draft.bodyHtml,
        featureId: draft.featureId || null,
        baseRevision: initial?.revision,
        force
      })
      if (res.conflict) {
        setSaving(false)
        const ok = await confirmDialog(
          `${res.updatedByUsername || 'Someone'} saved this topic at ${formatDateTime(res.updatedAt)} while you were editing it. Save your text over theirs? Their version stays in the History.`,
          { title: 'Changed by someone else', confirmLabel: 'Save mine' }
        )
        if (ok) await save(true)
        return
      }
      showSuccess(initial ? 'Topic saved' : 'Topic created')
      onSaved(res.topic)
    } catch (err) {
      showError((err instanceof Error ? err.message : '') || 'Failed to save the topic')
    } finally {
      setSaving(false)
    }
  }

  const cancel = async (): Promise<void> => {
    if (
      dirty &&
      !(await confirmDialog('Discard your changes to this topic?', {
        title: 'Unsaved changes',
        confirmLabel: 'Discard'
      }))
    )
      return
    onCancel()
  }

  // Link to another topic: the selected text, or the topic's title when nothing is selected
  const insertTopicLink = (t: WikiTopicSummary): void => {
    const editor = editorRef.current
    setPickerOpen(false)
    if (!editor) return
    const href = `#wiki/${t.id}`
    if (editor.state.selection.empty) {
      editor
        .chain()
        .focus()
        .insertContent([
          { type: 'text', text: t.title, marks: [{ type: 'link', attrs: { href } }] },
          { type: 'text', text: ' ' }
        ])
        .run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
  }

  return (
    <div
      className="wiki-editor"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault()
          if (!saving) void save()
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
        <h2 style={{ margin: 0, fontSize: '1.05rem', flex: 1 }}>
          {initial ? 'Edit topic' : 'New topic'}
        </h2>
        <button className="btn-secondary btn-sm" onClick={() => void cancel()} disabled={saving}>
          <X size={13} /> Cancel
        </button>
        <button
          className="btn-primary btn-sm"
          onClick={() => void save()}
          disabled={saving}
          title="Save (Ctrl+S)"
        >
          <Save size={13} /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="form-grid">
        <Field
          label="Title"
          required
          span="all"
          htmlFor="wiki-title"
          error={
            sameTitle ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <AlertTriangle size={12} /> A topic with this title already exists
              </span>
            ) : undefined
          }
        >
          <input
            id="wiki-title"
            dir="auto"
            autoFocus={!initial}
            value={draft.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Issuing a blue card, What is UPCC, ما هو التأمين"
            maxLength={255}
          />
        </Field>
        <Field label="Category" htmlFor="wiki-category">
          <input
            id="wiki-category"
            dir="auto"
            list="wiki-categories"
            value={draft.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="Pick or type a category"
            maxLength={100}
          />
          <datalist id="wiki-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Explains a page of the app"
          htmlFor="wiki-feature"
          hint="The topic then opens from that page's ? button"
        >
          <select
            id="wiki-feature"
            value={draft.featureId}
            onChange={(e) => set('featureId', e.target.value)}
          >
            <option value="">None</option>
            {PAGE_OPTIONS.map((g) => (
              <optgroup key={g.area} label={g.area}>
                {g.items.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field
          label="Tags"
          span="all"
          htmlFor="wiki-tags"
          hint="Other words people may search for (Enter or comma to add)"
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '4px',
              alignItems: 'center',
              border: '1px solid var(--input-border)',
              borderRadius: '6px',
              padding: '4px 6px',
              background: 'var(--bg-input, transparent)'
            }}
          >
            {draft.tags.map((t) => (
              <span key={t} className="wiki-tag" dir="auto" style={{ display: 'inline-flex' }}>
                {t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() =>
                    set(
                      'tags',
                      draft.tags.filter((x) => x !== t)
                    )
                  }
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0 0 0 4px',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              id="wiki-tags"
              dir="auto"
              list="wiki-tag-list"
              value={tagInput}
              onChange={(e) => {
                const v = e.target.value
                if (/[,،;]$/.test(v)) addTags(v)
                else setTagInput(v)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addTags(tagInput)
                } else if (e.key === 'Backspace' && !tagInput && draft.tags.length) {
                  set('tags', draft.tags.slice(0, -1))
                }
              }}
              onBlur={() => addTags(tagInput)}
              placeholder={draft.tags.length ? '' : 'e.g. bunker, BBC, شهادة'}
              style={{ flex: 1, minWidth: '140px', border: 'none', background: 'transparent' }}
            />
            <datalist id="wiki-tag-list">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </Field>
      </div>

      <div style={{ marginTop: '14px' }}>
        <div className="field-label" style={{ marginBottom: '6px' }}>
          Explanation
        </div>
        <RichTextEditor
          value={draft.bodyHtml}
          onChange={(html) => set('bodyHtml', html)}
          placeholder="Explain the topic. Arabic is fine: a paragraph that starts in Arabic runs right to left."
          minHeight={320}
          showHeadings
          showTables
          keepPasteFormatting
          autoDirection
          toolbarExtra={(editor) => (
            <button
              type="button"
              className="rte-btn"
              title="Link to another topic (select text first to link that text)"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                editorRef.current = editor
                setPickerOpen(true)
              }}
            >
              <Library size={14} strokeWidth={2.2} />
            </button>
          )}
        />
      </div>

      {pickerOpen && (
        <WikiTopicPicker
          topics={topics.filter((t) => t.id !== initial?.id)}
          onPick={insertTopicLink}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
