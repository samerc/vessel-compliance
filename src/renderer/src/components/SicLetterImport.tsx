import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  CSSProperties,
  ReactElement
} from 'react'
import {
  X,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  RefreshCw,
  SkipForward,
  ScanText,
  Wand2,
  MousePointerClick
} from 'lucide-react'
import type { SicLetterPage, SicOcrLine } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { Badge, SegmentedControl } from './ui'
import { confirmDialog } from './DialogHost'
import {
  parseLetterHeader,
  parseLetterEntries,
  parseLinesAsEntry,
  LetterKind,
  ParsedEntry
} from '../utils/sicLetterParser'
import {
  transliterateName,
  transliterateCompany,
  transliterateWord,
  spellingPairs,
  SpellingDictionary,
  hasArabic,
  arabicKey,
  arabicTokens,
  cleanArabic,
  toWesternDigits,
  nationalityFromArabic
} from '../utils/arabicNames'

// Import of scanned SIC letters: the page is read by OCR (main process), suggested entries are
// listed on the right, and the user fixes them, picks text off the page, or types entries by hand.

export interface ExistingSicEntry {
  name: string
  aliases: string[]
  source_id: string | null
}

interface RemarkTemplate {
  label: string
  text: string
}

interface Props {
  files: string[]
  existing: ExistingSicEntry[]
  templates: RemarkTemplate[]
  onClose: () => void
  /** After entries were saved (the list reloads) */
  onSaved: () => void
}

type NameField = 'name' | 'father' | 'mother'

interface Row extends ParsedEntry {
  key: string
  page: number
  include: boolean
  /** English typed by the user: no longer follows the Arabic */
  touched: Record<NameField, boolean>
}

const KIND_REMARKS: Record<LetterKind, string> = {
  freeze:
    'Notification of Decision - To kindly freeze the amounts related to life insurance contracts linked to capital accumulation and the related investment units belonging to the persons listed, and to refrain from cancelling the policies related thereto for the purpose of recovering the insurance premiums, where applicable.',
  inquiry:
    'Inquiry on Accounts/Transactions - To inform the SIC, within one week, whether any accounts, policies or transactions exist, directly or indirectly, for the persons listed, and to provide the related statements where applicable.',
  circulate:
    'Notification of Decision - Identity copy circulated to banks, financial institutions, insurance companies and money exchange companies, to take precautions when dealing with the holder.',
  other: ''
}

const KIND_ITEMS: { key: LetterKind; label: string }[] = [
  { key: 'freeze', label: 'Freeze' },
  { key: 'inquiry', label: 'Inquiry' },
  { key: 'circulate', label: 'ID circulated' },
  { key: 'other', label: 'Other' }
]

const FILL_FIELDS: {
  key: 'name' | 'father' | 'mother' | 'nationality' | 'dob' | 'notes'
  label: string
}[] = [
  { key: 'name', label: 'Name' },
  { key: 'father', label: "Father's name" },
  { key: 'mother', label: "Mother's name" },
  { key: 'nationality', label: 'Nationality' },
  { key: 'dob', label: 'Date of birth' },
  { key: 'notes', label: 'Notes' }
]

const normEn = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
let keySeq = 0
const newKey = (): string => `r${++keySeq}`

/** The Arabic name as written, minus the father's name (first name + family name) */
function arabicWithoutFather(row: Pick<Row, 'arName' | 'arFather'>): string[] {
  const tokens = arabicTokens(row.arName)
  return row.arFather && tokens.length >= 3 && tokens[1] === cleanArabic(row.arFather)
    ? [tokens[0], ...tokens.slice(2)]
    : tokens
}

/** English name from the Arabic name (the father's name is a separate field) */
function englishName(
  row: Pick<Row, 'arName' | 'arFather' | 'entityType'>,
  learned: SpellingDictionary
): string {
  if (row.entityType === 'entity') return transliterateCompany(row.arName, learned)
  return arabicWithoutFather(row)
    .map((t) => transliterateWord(t, learned))
    .join(' ')
}

const emptyRow = (page: number): Row => ({
  key: newKey(),
  page,
  include: true,
  lines: [],
  entityType: 'individual',
  arName: '',
  enName: '',
  arFather: '',
  enFather: '',
  arMother: '',
  enMother: '',
  nationality: '',
  dob: '',
  aliases: [],
  notes: '',
  touched: { name: false, father: false, mother: false }
})

export default function SicLetterImport({
  files,
  existing,
  templates,
  onClose,
  onSaved
}: Props): ReactElement {
  const { showError, showSuccess } = useToast()
  const [fileIdx, setFileIdx] = useState(0)
  const filePath = files[fileIdx]
  const fileName = filePath.replace(/^.*[\\/]/, '')

  // Learned spellings; null until loaded (the first page is parsed with them)
  const [learnedState, setLearned] = useState<SpellingDictionary | null>(null)
  const learned = useMemo(() => learnedState || {}, [learnedState])
  const [page, setPage] = useState(0)
  const [rotation, setRotation] = useState<Record<number, number>>({})
  const [attempt, setAttempt] = useState(0)
  // The page shown and the request it answered; loading = the wanted request has no answer yet
  const [result, setResult] = useState<{
    key: string
    data: SicLetterPage | null
    error: string
  } | null>(null)
  const want = `${fileIdx}|${page}|${rotation[page] || 0}|${attempt}`
  const ready = learnedState !== null
  const loading = !ready || result?.key !== want
  const data = result?.data ?? null
  const error = result?.key === want ? result.error : ''
  const [zoom, setZoom] = useState(1)

  const [reference, setReference] = useState('')
  const [letterDate, setLetterDate] = useState('')
  const [kind, setKind] = useState<LetterKind>('other')
  const [remark, setRemark] = useState('')
  const [rows, setRows] = useState<Row[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const parsedPages = useRef(new Set<number>())
  const headerSet = useRef(false)
  const rowsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api
      .sicGetNameSpellings()
      .then((d) => setLearned(d && typeof d === 'object' && !('error' in d) ? d : {}))
      .catch(() => setLearned({}))
  }, [])

  // ---- duplicates against the current SIC list ----
  const existingIndex = useMemo(() => {
    const en = new Set<string>()
    const ar = new Set<string>()
    for (const e of existing) {
      en.add(normEn(e.name))
      for (const a of e.aliases || []) {
        if (hasArabic(a)) ar.add(arabicKey(a))
        else en.add(normEn(a))
      }
    }
    return { en, ar }
  }, [existing])
  const isDuplicate = useCallback(
    (r: Pick<Row, 'enName' | 'arName'>): boolean =>
      (!!r.enName.trim() && existingIndex.en.has(normEn(r.enName))) ||
      (!!r.arName.trim() && existingIndex.ar.has(arabicKey(r.arName))),
    [existingIndex]
  )

  const refBase = reference.split('/G')[0].trim()
  const alreadyImported = useMemo(
    () =>
      refBase ? existing.filter((e) => e.source_id && e.source_id.startsWith(refBase)).length : 0,
    [existing, refBase]
  )

  const toRow = useCallback(
    (e: ParsedEntry, pg: number): Row => {
      const row: Row = {
        ...e,
        key: newKey(),
        page: pg,
        include: true,
        touched: { name: false, father: false, mother: false }
      }
      row.include = !isDuplicate(row)
      return row
    },
    [isDuplicate]
  )

  // ---- reading a page ----
  // Parsing reads the latest spellings / duplicate check without re-reading the page when they change
  const parseRef = useRef({ learned, toRow })
  useEffect(() => {
    parseRef.current = { learned, toRow }
  })

  useEffect(() => {
    if (!ready) return
    let stale = false
    const [, pg, rot] = want.split('|').map(Number)
    window.api
      .sicLetterReadPage(filePath, pg, rot)
      .then((r) => {
        const res = r as SicLetterPage | { error: true; message?: string }
        if ('error' in res) throw new Error(res.message || 'Could not read this page')
        if (stale) return
        setResult({ key: want, data: res, error: '' })
        if (res.page !== pg) setPage(res.page)
        if (!headerSet.current && res.page === 0) {
          headerSet.current = true
          const h = parseLetterHeader(filePath, res.lines)
          setReference(h.reference)
          setLetterDate(h.letterDate)
          setKind(h.kind)
          setRemark(KIND_REMARKS[h.kind])
        }
        if (!parsedPages.current.has(res.page)) {
          parsedPages.current.add(res.page)
          const { learned: dict, toRow: make } = parseRef.current
          const found = parseLetterEntries(res.lines, dict).map((e) => make(e, res.page))
          if (found.length) setRows((prev) => [...prev, ...found])
        }
      })
      .catch((e: unknown) => {
        if (!stale)
          setResult({
            key: want,
            data: null,
            error: e instanceof Error ? e.message : 'Could not read this page'
          })
      })
    return () => {
      stale = true
    }
  }, [want, filePath, ready])

  // ---- row editing ----
  const update = (key: string, patch: Partial<Row>): void => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r
        const next = { ...r, ...patch, touched: { ...r.touched, ...(patch.touched || {}) } }
        // English follows the Arabic until the user types it
        if (
          (patch.arName !== undefined ||
            patch.arFather !== undefined ||
            patch.entityType !== undefined) &&
          !next.touched.name
        ) {
          next.enName = englishName(next, learned)
        }
        if (patch.arFather !== undefined && !next.touched.father)
          next.enFather = transliterateName(next.arFather, learned)
        if (patch.arMother !== undefined && !next.touched.mother)
          next.enMother = transliterateName(next.arMother, learned)
        return next
      })
    )
  }
  const resetEnglish = (key: string, field: NameField): void => {
    const r = rows.find((x) => x.key === key)
    if (!r) return
    const value =
      field === 'name'
        ? englishName(r, learned)
        : transliterateName(field === 'father' ? r.arFather : r.arMother, learned)
    update(key, {
      [field === 'name' ? 'enName' : field === 'father' ? 'enFather' : 'enMother']: value,
      touched: { ...r.touched, [field]: false }
    } as Partial<Row>)
  }
  const addRow = (row: Row): void => {
    setRows((prev) => [...prev, row])
    setSelected(row.key)
    setTimeout(() => rowsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }
  const removeRow = (key: string): void => {
    setRows((prev) => prev.filter((r) => r.key !== key))
    if (selected === key) setSelected(null)
  }

  const reparsePage = (): void => {
    if (!data) return
    const have = new Set(rows.filter((r) => r.page === data.page).map((r) => r.arName || r.enName))
    const found = parseLetterEntries(data.lines, learned)
      .filter((e) => !have.has(e.arName || e.enName))
      .map((e) => toRow(e, data.page))
    if (!found.length) {
      showError('No more entries found on this page. Drag over a name on the letter to add it.')
      return
    }
    setRows((prev) => [...prev, ...found])
  }

  // ---- picking text off the page ----
  const viewRef = useRef<HTMLDivElement>(null)
  const [viewWidth, setViewWidth] = useState(600)
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewWidth(el.clientWidth - 32))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = data && data.width ? (viewWidth * zoom) / data.width : 1

  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [menu, setMenu] = useState<{
    x: number
    y: number
    up: boolean
    lines: number[]
    text: string
  } | null>(null)
  const [hoverLine, setHoverLine] = useState<number | null>(null)

  const toImage = (e: React.MouseEvent): { x: number; y: number } => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale }
  }
  const lineAt = (x: number, y: number): number =>
    data
      ? data.lines.findIndex(
          (l) => x >= l.bbox.x0 && x <= l.bbox.x1 && y >= l.bbox.y0 - 4 && y <= l.bbox.y1 + 4
        )
      : -1

  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0 || !data) return
    const p = toImage(e)
    setMenu(null)
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
  }
  const onMouseMove = (e: React.MouseEvent): void => {
    if (!data) return
    const p = toImage(e)
    if (drag) setDrag({ ...drag, x1: p.x, y1: p.y })
    else setHoverLine(lineAt(p.x, p.y))
  }
  const onMouseUp = (e: React.MouseEvent): void => {
    if (!drag || !data) return
    const box = {
      x0: Math.min(drag.x0, drag.x1),
      y0: Math.min(drag.y0, drag.y1),
      x1: Math.max(drag.x0, drag.x1),
      y1: Math.max(drag.y0, drag.y1)
    }
    setDrag(null)
    const host = (e.currentTarget as HTMLElement).getBoundingClientRect()
    // Open the menu upwards when the click is near the bottom of the visible page
    const view = viewRef.current?.getBoundingClientRect()
    const up = !!view && e.clientY > view.bottom - 300
    const at = { x: e.clientX - host.left + 8, y: e.clientY - host.top + (up ? -8 : 8), up }
    if ((box.x1 - box.x0) * scale < 6 && (box.y1 - box.y0) * scale < 6) {
      const li = lineAt(box.x0, box.y0)
      if (li >= 0) setMenu({ ...at, lines: [li], text: data.lines[li].text })
      return
    }
    // Words whose centre is inside the box, in reading order
    const picked: number[] = []
    const parts: string[] = []
    data.lines.forEach((l: SicOcrLine, i) => {
      const words = l.words.filter((w) => {
        const cx = (w.bbox.x0 + w.bbox.x1) / 2
        const cy = (w.bbox.y0 + w.bbox.y1) / 2
        return cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1
      })
      if (words.length) {
        picked.push(i)
        parts.push(words.length === l.words.length ? l.text : words.map((w) => w.text).join(' '))
      }
    })
    if (picked.length)
      setMenu({ ...at, lines: picked, text: parts.join(' ').replace(/\s+/g, ' ').trim() })
  }

  const selectedRow = rows.find((r) => r.key === selected) || null

  const menuNewEntry = (): void => {
    if (!menu || !data) return
    const parsed =
      menu.lines.length && menu.text === menu.lines.map((i) => data.lines[i].text).join(' ')
        ? parseLinesAsEntry(data.lines, menu.lines, learned)
        : parseLinesAsEntry(
            [{ text: menu.text, bbox: data.lines[menu.lines[0]].bbox, words: [] }],
            [0],
            learned
          )
    addRow({ ...toRow({ ...parsed, lines: menu.lines }, data.page) })
    setMenu(null)
  }
  const menuAppend = (): void => {
    if (!menu || !data || !selectedRow) return
    const lines = [...new Set([...selectedRow.lines, ...menu.lines])]
    const parsed = parseLinesAsEntry(data.lines, lines, learned)
    setRows((prev) =>
      prev.map((r) =>
        r.key === selectedRow.key
          ? { ...r, ...parsed, lines, touched: { name: false, father: false, mother: false } }
          : r
      )
    )
    setMenu(null)
  }
  const menuFill = (field: (typeof FILL_FIELDS)[number]['key']): void => {
    if (!menu || !selectedRow) return
    const text = menu.text.replace(/^[^\u0600-\u06ffA-Za-z0-9]+/, '').trim()
    const ar = hasArabic(text)
    const k = selectedRow.key
    if (field === 'name')
      update(
        k,
        ar
          ? { arName: cleanArabic(text), touched: { ...selectedRow.touched, name: false } }
          : { enName: text, touched: { ...selectedRow.touched, name: true } }
      )
    if (field === 'father')
      update(
        k,
        ar
          ? { arFather: cleanArabic(text) }
          : { enFather: text, touched: { ...selectedRow.touched, father: true } }
      )
    if (field === 'mother')
      update(
        k,
        ar
          ? { arMother: cleanArabic(text) }
          : { enMother: text, touched: { ...selectedRow.touched, mother: true } }
      )
    if (field === 'nationality')
      update(k, { nationality: ar ? nationalityFromArabic(text) || text : text })
    if (field === 'dob') update(k, { dob: toWesternDigits(text) })
    if (field === 'notes')
      update(k, { notes: [selectedRow.notes, toWesternDigits(text)].filter(Boolean).join('; ') })
    update(k, { lines: [...new Set([...selectedRow.lines, ...menu.lines])] })
    setMenu(null)
  }

  // ---- saving ----
  const toSave = rows.filter((r) => r.include && r.page >= 0 && r.enName.trim())
  const missingEnglish = rows.filter((r) => r.include && !r.enName.trim()).length

  const nextLetter = (): void => {
    if (fileIdx >= files.length - 1) {
      onClose()
      return
    }
    // Next letter: start over
    parsedPages.current = new Set()
    headerSet.current = false
    setRows([])
    setSelected(null)
    setMenu(null)
    setPage(0)
    setRotation({})
    setReference('')
    setLetterDate('')
    setKind('other')
    setRemark('')
    setZoom(1)
    setFileIdx(fileIdx + 1)
  }

  const save = async (): Promise<void> => {
    if (!toSave.length) return
    if (letterDate && !/^\d{4}-\d{2}-\d{2}$/.test(letterDate)) {
      showError('Letter date is not a valid date')
      return
    }
    setSaving(true)
    try {
      const payload = toSave.map((r) => ({
        name: r.enName.trim(),
        entityType: r.entityType,
        sourceId: reference.trim() || null,
        // Arabic as written, and without the father's name (how a name is usually searched)
        aliases: [
          ...new Set(
            [
              r.arName.trim(),
              r.entityType === 'individual' ? arabicWithoutFather(r).join(' ') : '',
              ...r.aliases.map((a) => a.trim())
            ].filter(Boolean)
          )
        ],
        dateOfBirth: r.dob.trim() || null,
        nationality: r.nationality.trim() || null,
        remarks: [remark.trim(), r.notes.trim()].filter(Boolean).join('\n') || null,
        listedDate: letterDate || null,
        motherName: r.entityType === 'individual' ? r.enMother.trim() || null : null,
        fatherName: r.entityType === 'individual' ? r.enFather.trim() || null : null
      }))
      const res = await window.api.sicAddEntities(payload)
      // Learn the spellings the user settled on (word by word)
      const pairs: SpellingDictionary = {}
      for (const r of toSave) {
        if (r.entityType !== 'individual') continue
        Object.assign(pairs, spellingPairs(arabicWithoutFather(r).join(' '), r.enName))
        if (r.arFather && r.enFather) Object.assign(pairs, spellingPairs(r.arFather, r.enFather))
        if (r.arMother && r.enMother) Object.assign(pairs, spellingPairs(r.arMother, r.enMother))
      }
      if (Object.keys(pairs).length) {
        await window.api.sicLearnNameSpellings(pairs).catch(() => {})
        setLearned((prev) => ({ ...prev, ...pairs }))
      }
      showSuccess(
        `${res.count} SIC ${res.count === 1 ? 'entry' : 'entries'} added from ${fileName}`
      )
      onSaved()
      nextLetter()
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not save the entries')
    }
    setSaving(false)
  }

  const close = async (): Promise<void> => {
    if (
      rows.some((r) => r.include) &&
      !(await confirmDialog('Close without saving the entries of this letter?', {
        confirmLabel: 'Close',
        isDangerous: true
      }))
    )
      return
    onClose()
  }
  const skip = async (): Promise<void> => {
    if (
      rows.some((r) => r.include) &&
      !(await confirmDialog('Skip this letter without saving its entries?', {
        confirmLabel: 'Skip'
      }))
    )
      return
    nextLetter()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && menu) setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  // ---- rendering ----
  const usedLines = useMemo(() => {
    const m = new Map<number, string>()
    if (data)
      for (const r of rows) if (r.page === data.page) for (const i of r.lines) m.set(i, r.key)
    return m
  }, [rows, data])

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '6px 9px',
    fontSize: '0.82rem',
    borderRadius: '6px',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--input-text)',
    boxSizing: 'border-box'
  }
  const arStyle: CSSProperties = { ...inputStyle, direction: 'rtl', fontSize: '0.9rem' }
  const label: CSSProperties = {
    fontSize: '0.68rem',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.4px'
  }

  const nameRow = (r: Row, field: NameField, title: string): ReactElement => {
    const arKey = field === 'name' ? 'arName' : field === 'father' ? 'arFather' : 'arMother'
    const enKey = field === 'name' ? 'enName' : field === 'father' ? 'enFather' : 'enMother'
    return (
      <>
        <span style={label}>{title}</span>
        <input
          value={r[enKey]}
          placeholder="English"
          onChange={(e) =>
            update(r.key, {
              [enKey]: e.target.value,
              touched: { ...r.touched, [field]: true }
            } as Partial<Row>)
          }
          style={{ ...inputStyle, fontWeight: field === 'name' ? 600 : 400 }}
        />
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            value={r[arKey]}
            placeholder="عربي"
            onChange={(e) => update(r.key, { [arKey]: e.target.value } as Partial<Row>)}
            style={arStyle}
          />
          <button
            className="btn-ghost btn-icon btn-sm"
            title="Spell the English again from the Arabic"
            onClick={() => resetEnglish(r.key, field)}
            disabled={!r[arKey].trim()}
          >
            <Wand2 size={14} />
          </button>
        </div>
      </>
    )
  }

  return (
    <div className="modal-overlay" style={{ padding: '16px' }}>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: 'var(--glass-border)',
          borderRadius: '14px',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 18px',
            borderBottom: '1px solid var(--table-border)'
          }}
        >
          <ScanText size={20} style={{ color: 'var(--accent-primary)' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Import SIC letter</div>
            <div
              style={{
                fontSize: '0.76rem',
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
            >
              {files.length > 1 && (
                <>
                  Letter {fileIdx + 1} of {files.length} ·{' '}
                </>
              )}
              {fileName}
            </div>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {data && data.pageCount > 1 && (
              <>
                <button
                  className="btn-ghost btn-icon btn-sm"
                  title="Previous page"
                  disabled={page === 0 || loading}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span
                  style={{
                    fontSize: '0.8rem',
                    color: 'var(--text-secondary)',
                    minWidth: '70px',
                    textAlign: 'center'
                  }}
                >
                  Page {page + 1} / {data.pageCount}
                </span>
                <button
                  className="btn-ghost btn-icon btn-sm"
                  title="Next page"
                  disabled={page >= data.pageCount - 1 || loading}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            <button
              className="btn-ghost btn-icon btn-sm"
              title="Rotate the page (ID copies are often sideways)"
              disabled={loading}
              onClick={() =>
                setRotation({ ...rotation, [page]: ((rotation[page] || 0) + 90) % 360 })
              }
            >
              <RotateCw size={16} />
            </button>
            <button
              className="btn-ghost btn-icon btn-sm"
              title="Zoom out"
              onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
            >
              <ZoomOut size={16} />
            </button>
            <button
              className="btn-ghost btn-icon btn-sm"
              title="Zoom in"
              onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))}
            >
              <ZoomIn size={16} />
            </button>
            {files.length > 1 && fileIdx < files.length - 1 && (
              <button
                className="btn-secondary btn-sm"
                onClick={skip}
                title="Go to the next letter without saving this one"
              >
                <SkipForward size={14} /> Skip letter
              </button>
            )}
            <button className="btn-ghost btn-icon" title="Close" aria-label="Close" onClick={close}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {/* Page */}
          <div
            ref={viewRef}
            style={{
              flex: 1,
              overflow: 'auto',
              background: 'var(--bg-secondary)',
              padding: '16px',
              position: 'relative'
            }}
          >
            {loading && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  color: 'var(--text-secondary)',
                  zIndex: 2,
                  background: 'rgba(var(--accent-primary-rgb), 0.03)'
                }}
              >
                <Loader2 size={28} className="spin" style={{ color: 'var(--accent-primary)' }} />
                <span style={{ fontSize: '0.85rem' }}>Reading the page…</span>
                <span style={{ fontSize: '0.75rem' }}>The first page takes a few seconds.</span>
              </div>
            )}
            {error && !loading && (
              <div
                style={{ textAlign: 'center', marginTop: '80px', color: 'var(--text-secondary)' }}
              >
                <AlertTriangle size={30} style={{ color: 'var(--warning)' }} />
                <p>{error}</p>
                <button className="btn-secondary btn-sm" onClick={() => setAttempt((a) => a + 1)}>
                  <RefreshCw size={14} /> Try again
                </button>
              </div>
            )}
            {data?.image && (
              <div
                style={{
                  position: 'relative',
                  width: data.width * scale,
                  height: data.height * scale,
                  margin: '0 auto',
                  cursor: 'crosshair',
                  userSelect: 'none',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                  background: '#fff'
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={() => {
                  setHoverLine(null)
                  setDrag(null)
                }}
              >
                <img
                  src={data.image}
                  alt="Letter page"
                  draggable={false}
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
                {data.lines.map((l, i) => {
                  const owner = usedLines.get(i)
                  const mine = owner && owner === selected
                  const hover = hoverLine === i && !drag
                  if (!owner && !hover) return null
                  return (
                    <div
                      key={i}
                      title={owner ? undefined : 'Click to use this line'}
                      style={{
                        position: 'absolute',
                        pointerEvents: 'none',
                        left: l.bbox.x0 * scale - 2,
                        top: l.bbox.y0 * scale - 2,
                        width: (l.bbox.x1 - l.bbox.x0) * scale + 4,
                        height: (l.bbox.y1 - l.bbox.y0) * scale + 4,
                        borderRadius: '3px',
                        background: mine
                          ? 'rgba(var(--accent-primary-rgb), 0.22)'
                          : owner
                            ? 'rgba(46, 160, 67, 0.16)'
                            : 'rgba(var(--accent-primary-rgb), 0.08)',
                        outline: hover || mine ? '2px solid var(--accent-primary)' : 'none'
                      }}
                    />
                  )
                })}
                {drag && (
                  <div
                    style={{
                      position: 'absolute',
                      pointerEvents: 'none',
                      border: '2px dashed var(--accent-primary)',
                      background: 'rgba(var(--accent-primary-rgb), 0.1)',
                      left: Math.min(drag.x0, drag.x1) * scale,
                      top: Math.min(drag.y0, drag.y1) * scale,
                      width: Math.abs(drag.x1 - drag.x0) * scale,
                      height: Math.abs(drag.y1 - drag.y0) * scale
                    }}
                  />
                )}
                {menu && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute',
                      left: Math.min(menu.x, data.width * scale - 280),
                      ...(menu.up ? { bottom: data.height * scale - menu.y } : { top: menu.y }),
                      width: '270px',
                      zIndex: 5,
                      cursor: 'default',
                      background: 'var(--bg-primary)',
                      border: 'var(--glass-border)',
                      borderRadius: '10px',
                      boxShadow: 'var(--shadow-lg)',
                      padding: '8px'
                    }}
                  >
                    <div
                      dir="auto"
                      style={{
                        fontSize: '0.85rem',
                        padding: '4px 6px 8px',
                        borderBottom: '1px solid var(--table-border)',
                        marginBottom: '6px',
                        maxHeight: '80px',
                        overflow: 'auto'
                      }}
                    >
                      {menu.text}
                    </div>
                    <button
                      className="btn-ghost btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start' }}
                      onClick={menuNewEntry}
                    >
                      <Plus size={14} /> New entry from this
                    </button>
                    {selectedRow && (
                      <>
                        <button
                          className="btn-ghost btn-sm"
                          style={{ width: '100%', justifyContent: 'flex-start' }}
                          onClick={menuAppend}
                        >
                          <RefreshCw size={14} /> Add to entry {rows.indexOf(selectedRow) + 1} and
                          read again
                        </button>
                        <div style={{ ...label, padding: '8px 6px 4px' }}>
                          Put into entry {rows.indexOf(selectedRow) + 1} as
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px',
                            padding: '0 4px 4px'
                          }}
                        >
                          {FILL_FIELDS.filter(
                            (f) =>
                              selectedRow.entityType === 'individual' ||
                              (f.key !== 'father' && f.key !== 'mother')
                          ).map((f) => (
                            <button key={f.key} className="chip" onClick={() => menuFill(f.key)}>
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    <button
                      className="btn-ghost btn-sm"
                      style={{
                        width: '100%',
                        justifyContent: 'flex-start',
                        color: 'var(--text-secondary)'
                      }}
                      onClick={() => setMenu(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            {data && !data.image && !loading && (
              <div
                style={{ textAlign: 'center', marginTop: '80px', color: 'var(--text-secondary)' }}
              >
                This page has no scanned image.
              </div>
            )}
          </div>

          {/* Entries */}
          <div
            style={{
              width: '600px',
              flexShrink: 0,
              borderLeft: '1px solid var(--table-border)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid var(--table-border)',
                display: 'grid',
                gridTemplateColumns: '1fr 150px',
                gap: '8px 10px'
              }}
            >
              <div>
                <div style={label}>SIC reference</div>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. 4737/26"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={label}>Letter date</div>
                <input
                  type="date"
                  value={letterDate}
                  onChange={(e) => setLetterDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div
                style={{
                  gridColumn: '1 / -1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap'
                }}
              >
                <span style={label}>Letter</span>
                <SegmentedControl
                  items={KIND_ITEMS}
                  value={kind}
                  onChange={(k) => {
                    if (remark === KIND_REMARKS[kind] || !remark.trim()) setRemark(KIND_REMARKS[k])
                    setKind(k)
                  }}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexWrap: 'wrap',
                    marginBottom: '4px'
                  }}
                >
                  <span style={label}>Remark for every entry</span>
                  {templates.length > 0 && (
                    <select
                      value={templates.find((t) => t.text === remark)?.label ?? ''}
                      onChange={(e) => {
                        const t = templates.find((x) => x.label === e.target.value)
                        if (t) setRemark(t.text)
                      }}
                      style={{
                        ...inputStyle,
                        width: 'auto',
                        marginLeft: 'auto',
                        padding: '3px 6px',
                        fontSize: '0.75rem'
                      }}
                    >
                      <option value="">Use a remark template…</option>
                      {templates.map((t) => (
                        <option key={t.label} value={t.label}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              {alreadyImported > 0 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.8rem',
                    color: 'var(--warning)'
                  }}
                >
                  <AlertTriangle size={15} /> {alreadyImported}{' '}
                  {alreadyImported === 1 ? 'entry' : 'entries'} with reference {refBase}{' '}
                  {alreadyImported === 1 ? 'is' : 'are'} already in the SIC list.
                </div>
              )}
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.76rem',
                  color: 'var(--text-secondary)',
                  marginBottom: '10px'
                }}
              >
                <MousePointerClick size={14} />
                <span>
                  Click a line or drag over text on the letter to add an entry, or to fill the
                  selected one.
                </span>
              </div>
              {rows.length === 0 && !loading && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '30px 10px',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem'
                  }}
                >
                  No entries found on this page yet.
                  <div style={{ marginTop: '6px', fontSize: '0.78rem' }}>
                    Drag over a name on the letter, or add an entry by hand.
                  </div>
                </div>
              )}
              {rows.map((r, idx) => {
                const dup = isDuplicate(r)
                const active = selected === r.key
                return (
                  <div
                    key={r.key}
                    onClick={() => setSelected(r.key)}
                    style={{
                      border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--glass-border-color)'}`,
                      boxShadow: active
                        ? '0 0 0 2px rgba(var(--accent-primary-rgb), 0.15)'
                        : 'none',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      marginBottom: '10px',
                      opacity: r.include ? 1 : 0.6,
                      background: 'var(--bg-card)'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={r.include}
                        title="Save this entry"
                        onChange={(e) => update(r.key, { include: e.target.checked })}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.8rem',
                          color: 'var(--text-secondary)'
                        }}
                      >
                        #{idx + 1}
                      </span>
                      {data && data.pageCount > 1 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          page {r.page + 1}
                        </span>
                      )}
                      <SegmentedControl
                        items={[
                          { key: 'individual', label: 'Person' },
                          { key: 'entity', label: 'Company' }
                        ]}
                        value={r.entityType}
                        onChange={(t) => update(r.key, { entityType: t })}
                      />
                      {dup && (
                        <Badge
                          tone="warning"
                          title="An entry with this name is already in the SIC list"
                        >
                          Already listed
                        </Badge>
                      )}
                      {r.include && !r.enName.trim() && (
                        <Badge tone="danger">English name needed</Badge>
                      )}
                      <button
                        className="btn-ghost btn-icon btn-sm"
                        style={{ marginLeft: 'auto' }}
                        title="Remove this entry"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeRow(r.key)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '78px 1fr 1fr',
                        gap: '6px 8px',
                        alignItems: 'center'
                      }}
                    >
                      {nameRow(r, 'name', 'Name')}
                      {r.entityType === 'individual' && nameRow(r, 'father', 'Father')}
                      {r.entityType === 'individual' && nameRow(r, 'mother', 'Mother')}
                      <span style={label}>
                        {r.entityType === 'individual' ? 'Nationality' : 'Country'}
                      </span>
                      <input
                        value={r.nationality}
                        onChange={(e) => update(r.key, { nationality: e.target.value })}
                        placeholder="e.g. Lebanese"
                        style={inputStyle}
                      />
                      {r.entityType === 'individual' ? (
                        <input
                          value={r.dob}
                          onChange={(e) => update(r.key, { dob: e.target.value })}
                          placeholder="Date of birth: 1967 or 1967-02-17"
                          style={inputStyle}
                        />
                      ) : (
                        <span />
                      )}
                      <span style={label}>Notes</span>
                      <input
                        value={r.notes}
                        onChange={(e) => update(r.key, { notes: e.target.value })}
                        placeholder="Register no., passport, company registration…"
                        style={{ ...inputStyle, gridColumn: '2 / -1' }}
                      />
                      {r.aliases.length > 0 && (
                        <>
                          <span style={label}>Also known as</span>
                          <div
                            style={{
                              gridColumn: '2 / -1',
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: '4px'
                            }}
                          >
                            {r.aliases.map((a, ai) => (
                              <span
                                key={ai}
                                className="chip"
                                dir="auto"
                                style={{
                                  fontSize: '0.72rem',
                                  padding: '2px 8px',
                                  cursor: 'default'
                                }}
                              >
                                {a}
                                <X
                                  size={11}
                                  style={{ cursor: 'pointer', marginLeft: '4px' }}
                                  onClick={() =>
                                    update(r.key, { aliases: r.aliases.filter((_, j) => j !== ai) })
                                  }
                                />
                              </span>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={rowsEndRef} />
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderTop: '1px solid var(--table-border)'
              }}
            >
              <button className="btn-secondary btn-sm" onClick={() => addRow(emptyRow(page))}>
                <Plus size={14} /> Add entry
              </button>
              <button
                className="btn-ghost btn-sm"
                disabled={!data || loading}
                onClick={reparsePage}
                title="Look for entries on this page again"
              >
                <ScanText size={14} /> Find entries
              </button>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '0.78rem',
                  color: missingEnglish ? 'var(--danger)' : 'var(--text-secondary)'
                }}
              >
                {missingEnglish
                  ? `${missingEnglish} without an English name`
                  : `${toSave.length} of ${rows.length} selected`}
              </span>
              <button
                className="btn-primary"
                disabled={!toSave.length || saving || missingEnglish > 0}
                onClick={save}
              >
                {saving ? <Loader2 size={15} className="spin" /> : null}
                Save {toSave.length || ''} {toSave.length === 1 ? 'entry' : 'entries'}
                {files.length > 1 && fileIdx < files.length - 1 ? ' & next letter' : ''}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
