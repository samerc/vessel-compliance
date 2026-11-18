import { useEffect, useState } from 'react'
import { FileText, X, AlertCircle, Settings, Plus, Trash2, Save, Scissors } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Modal, Field, useDragSort, DragHandle, moveInArray, FileDrop, Combobox } from './ui'
import type { Entity, EntityAddress } from '../../../shared/types'
import { asArray } from '../utils/ipc'
import {
  parseStatementWorkbook,
  defaultVisibleColumns,
  defaultTotalColumn,
  currencyColumn,
  columnTotals,
  formatMoney,
  nextNoteMarker,
  suggestNoteSplit,
  type ParsedStatement
} from '../utils/statementParser'
import {
  loadStatementSettings,
  saveStatementSettings,
  DEFAULT_STATEMENT_SETTINGS,
  STATEMENT_PLACEHOLDERS,
  type StatementSettings,
  type StatementTitleOption
} from '../services/statementSettings'
import type { StatementExportInput } from '../services/StatementExportService'

// Statement of Account / invoice letter: upload the accounting Excel, pick a title, reference,
// date and columns, export on the company letterhead (Word or PDF).

const COLS_PREF_KEY = 'statement_columns'
const ORIENTATION_KEY = 'statement_orientation'
const BANK_PREF_KEY = 'statement_bank'
/** A text cell longer than this offers to move part of it to a note */
const LONG_CELL = 22

type BankRow = { id: string; name: string; details: string; order: number }

/** An address as printed under the customer's name */
const addressText = (a: EntityAddress): string =>
  [a.addressLine1, a.addressLine2, [a.postalCode, a.city].filter(Boolean).join(' '), a.country]
    .map((x) => (x || '').trim())
    .filter(Boolean)
    .join('\n')

/** A field label with an Include tick box: unticked, the text is left out of the letter */
function IncludeLabel({
  text,
  checked,
  onChange
}: {
  text: string
  checked: boolean
  onChange: (v: boolean) => void
}): React.JSX.Element {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
      {text}
      <span
        role="checkbox"
        aria-checked={checked}
        tabIndex={0}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontWeight: 400,
          cursor: 'pointer'
        }}
        onClick={(e) => {
          e.preventDefault()
          onChange(!checked)
        }}
        onKeyDown={(e) => {
          if (e.key === ' ' || e.key === 'Enter') {
            e.preventDefault()
            onChange(!checked)
          }
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          readOnly
          tabIndex={-1}
          style={{ accentColor: 'var(--accent-primary)', width: 'auto' }}
        />
        Include
      </span>
    </span>
  )
}

const todayISO = (): string => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Remembered column choice (order + visibility), applied when the file has those columns */
function loadColumnPrefs(): string[] | null {
  try {
    const raw = localStorage.getItem(COLS_PREF_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(v) ? (v as string[]) : null
  } catch {
    return null
  }
}

function saveColumnPrefs(visible: string[]): void {
  try {
    localStorage.setItem(COLS_PREF_KEY, JSON.stringify(visible))
  } catch {
    /* per-viewer convenience only */
  }
}

function PlaceholderHint(): React.JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        flexWrap: 'wrap',
        fontSize: '0.72rem',
        color: 'var(--text-secondary)',
        marginTop: '6px'
      }}
    >
      <span>Placeholders:</span>
      {STATEMENT_PLACEHOLDERS.map((p) => (
        <code
          key={p.key}
          title={p.label}
          style={{
            padding: '1px 6px',
            borderRadius: '4px',
            border: '1px solid var(--table-border)',
            color: 'var(--text-primary)'
          }}
        >
          {p.key}
        </code>
      ))}
    </div>
  )
}

interface SettingsModalProps {
  initial: StatementSettings
  onClose: () => void
  onSaved: (s: StatementSettings) => void
}

function StatementSettingsModal({
  initial,
  onClose,
  onSaved
}: SettingsModalProps): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const [s, setS] = useState<StatementSettings>(initial)
  const [saving, setSaving] = useState(false)

  const setTitle = (i: number, patch: Partial<StatementSettings['titles'][number]>): void =>
    setS((p) => ({ ...p, titles: p.titles.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))
  // Drag a title by its handle (or Up / Down on it)
  const titleSort = useDragSort(s.titles.length, (from, to) =>
    setS((p) => ({ ...p, titles: moveInArray(p.titles, from, to) }))
  )

  const save = async (): Promise<void> => {
    const titles = s.titles.filter((t) => t.title.trim())
    if (titles.length === 0) {
      showError('Add at least one title.')
      return
    }
    setSaving(true)
    try {
      const next = { ...s, titles }
      await saveStatementSettings(next)
      showSuccess('Statement settings saved')
      onSaved(next)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Saving failed')
    } finally {
      setSaving(false)
    }
  }

  const labels = Object.entries(s.columnLabels)

  return (
    <Modal
      title="Statement settings"
      icon={<Settings size={18} />}
      onClose={onClose}
      width={720}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div>
        <div className="form-section">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <h4 className="form-section-title" style={{ margin: 0 }}>
              Titles
            </h4>
            <button
              className="btn-secondary btn-sm"
              onClick={() =>
                setS((p) => ({
                  ...p,
                  titles: [...p.titles, { title: '', intro: '', closing: '' }]
                }))
              }
            >
              <Plus size={14} /> Add title
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
            One per report (e.g. Statement of Account, Letter Invoice). Each has its default text
            below the table and its own columns, matched to the Excel columns on the statement page
            (&quot;Save columns&quot;). The first one is the default.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {s.titles.map((t, i) => (
              <div
                key={i}
                {...titleSort.rowProps(i)}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--table-border)'
                }}
              >
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <DragHandle {...titleSort.handleProps(i, `Move ${t.title || 'title'}`)} />
                  <input
                    value={t.title}
                    placeholder="Title, e.g. Statement of Account"
                    onChange={(e) => setTitle(i, { title: e.target.value })}
                    style={{ flex: 1, fontWeight: 600 }}
                  />
                  <button
                    className="btn-ghost btn-icon"
                    title="Delete title"
                    aria-label="Delete title"
                    onClick={() =>
                      setS((p) => ({ ...p, titles: p.titles.filter((_, j) => j !== i) }))
                    }
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-grid" style={{ marginTop: '10px' }}>
                  <Field label="Text below the table (default)">
                    <textarea
                      rows={3}
                      value={t.closing}
                      onChange={(e) => setTitle(i, { closing: e.target.value })}
                      style={{ resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </Field>
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginTop: '8px',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {t.columns && t.columns.length > 0 ? (
                    <>
                      <span>
                        Columns: {t.columns.map((c) => `${c.label} (${c.key})`).join(', ')}
                      </span>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setTitle(i, { columns: [] })}
                      >
                        Reset
                      </button>
                    </>
                  ) : (
                    <span>Columns not matched yet (set them on the statement page)</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <PlaceholderHint />
        </div>

        <div className="form-section">
          <div className="form-grid cols-2">
            <Field label="Reference starts with">
              <input
                value={s.referencePrefix}
                placeholder="e.g. SOA/26/"
                onChange={(e) => setS((p) => ({ ...p, referencePrefix: e.target.value }))}
              />
            </Field>
            <Field label="Table font size (pt)">
              <input
                type="number"
                min={6}
                max={12}
                step={0.5}
                value={s.fontSize}
                onChange={(e) =>
                  setS((p) => ({
                    ...p,
                    fontSize: Math.min(12, Math.max(6, Number(e.target.value) || 9))
                  }))
                }
              />
            </Field>
          </div>
        </div>

        <div className="form-section">
          <h4 className="form-section-title">Column names</h4>
          {labels.length === 0 ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
              None yet. Rename columns on the statement page and use &quot;Save column names&quot;.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {labels.map(([from, to]) => (
                <div key={from} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span
                    style={{ width: '40%', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
                  >
                    {from}
                  </span>
                  <input
                    value={to}
                    onChange={(e) =>
                      setS((p) => ({
                        ...p,
                        columnLabels: { ...p.columnLabels, [from]: e.target.value }
                      }))
                    }
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn-ghost btn-icon"
                    title="Remove"
                    aria-label="Remove column name"
                    onClick={() =>
                      setS((p) => {
                        const next = { ...p.columnLabels }
                        delete next[from]
                        return { ...p, columnLabels: next }
                      })
                    }
                    style={{ color: 'var(--danger)' }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

export default function StatementReport(): React.JSX.Element {
  const { hasPermission } = useAuth()
  const { showError, showSuccess } = useToast()
  const canConfigure = hasPermission('admin:settings')

  const [settings, setSettings] = useState<StatementSettings>(DEFAULT_STATEMENT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  const [data, setData] = useState<ParsedStatement | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [exporting, setExporting] = useState<'' | 'docx' | 'pdf'>('')

  // The report type (its columns and default text) and the title printed, which can be edited
  const [titleIdx, setTitleIdx] = useState(0)
  const [title, setTitle] = useState('')
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayISO)
  const [to, setTo] = useState('')
  const [entities, setEntities] = useState<Entity[]>([])
  const [addresses, setAddresses] = useState<EntityAddress[]>([])
  const [address, setAddress] = useState('')
  const [banks, setBanks] = useState<BankRow[]>([])
  const [bankId, setBankId] = useState('')
  const [intro, setIntro] = useState('')
  const [closing, setClosing] = useState('')
  const [includeIntro, setIncludeIntro] = useState(true)
  const [includeClosing, setIncludeClosing] = useState(true)
  const [visible, setVisible] = useState<string[]>([])
  const [labels, setLabels] = useState<Record<string, string>>({})
  const [totalKey, setTotalKey] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<StatementExportInput['orientation']>(() => {
    try {
      const v = localStorage.getItem(ORIENTATION_KEY)
      return v === 'landscape' || v === 'auto' ? v : 'portrait'
    } catch {
      return 'portrait'
    }
  })
  const [showGroups, setShowGroups] = useState(true)
  // Notes under the table ("*C/V of ..."), from the Excel or made from a long cell
  const [notes, setNotes] = useState<string[]>([])
  const [split, setSplit] = useState<{
    row: number
    key: string
    keep: string
    note: string
    marker: string
  } | null>(null)

  const openSplit = (row: number, key: string): void => {
    const text = data?.rows[row]?.cells[key] || ''
    setSplit({ row, key, ...suggestNoteSplit(text), marker: nextNoteMarker(notes) })
  }

  /** The cell keeps its first part + the mark; the rest goes under the table */
  const applySplit = (): void => {
    if (!data || !split || !split.note.trim()) return
    const rows = data.rows.map((r, i) =>
      i === split.row
        ? { ...r, cells: { ...r.cells, [split.key]: `${split.keep.trim()}${split.marker}` } }
        : r
    )
    setData({ ...data, rows })
    setNotes((n) => [...n, `${split.marker}${split.note.trim()}`])
    setSplit(null)
  }

  /** A note deleted: its mark leaves the cells that carry it */
  const removeNote = (i: number): void => {
    const marker = notes[i]?.match(/^\*+/)?.[0]
    setNotes((n) => n.filter((_, j) => j !== i))
    if (!marker || !data) return
    const strip = (t: string): string =>
      t.endsWith(marker) && !t.endsWith(`*${marker}`) ? t.slice(0, -marker.length) : t
    setData({
      ...data,
      rows: data.rows.map((r) => ({
        ...r,
        cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [k, strip(v)]))
      }))
    })
  }

  useEffect(() => {
    let alive = true
    void loadStatementSettings().then((s) => {
      if (!alive) return
      setSettings(s)
      setReference((r) => r || s.referencePrefix)
      setTitle(s.titles[0]?.title || 'Statement of Account')
      setClosing(s.titles[0]?.closing || '')
    })
    void Promise.all([window.api.getEntities(), window.api.bankGetAll()]).then(([e, b]) => {
      if (!alive) return
      setEntities(asArray<Entity>(e))
      const list = asArray<BankRow>(b)
      setBanks(list)
      // The bank used last time, else the first one
      let last = ''
      try {
        last = localStorage.getItem(BANK_PREF_KEY) || ''
      } catch {
        /* per-viewer convenience only */
      }
      setBankId(list.some((x) => x.id === last) ? last : list[0]?.id || '')
    })
    return () => {
      alive = false
    }
  }, [])

  /** The report type's columns: the Excel columns it uses, in its order, with its names */
  const applyColumns = (parsed: ParsedStatement, t: StatementTitleOption | undefined): void => {
    const keys = parsed.columns.map((c) => c.key)
    const mapped = (t?.columns || []).filter((c) => keys.includes(c.key))
    if (mapped.length > 0) {
      setVisible(mapped.map((c) => c.key))
      setLabels(
        Object.fromEntries(
          keys.map((k) => [
            k,
            mapped.find((c) => c.key === k)?.label || settings.columnLabels[k] || k
          ])
        )
      )
      return
    }
    const pref = loadColumnPrefs()?.filter((k) => keys.includes(k))
    setVisible(pref && pref.length > 0 ? pref : defaultVisibleColumns(parsed.columns))
    setLabels(Object.fromEntries(keys.map((k) => [k, settings.columnLabels[k] || k])))
  }

  const pickTitle = (i: number): void => {
    const t = settings.titles[i]
    setTitleIdx(i)
    setTitle(t?.title || '')
    setClosing(t?.closing || '')
    if (data) applyColumns(data, t)
  }

  /** A customer from the Directory: its address goes under its name */
  const pickCustomer = async (e: Entity): Promise<void> => {
    setTo(e.name)
    try {
      const list = asArray<EntityAddress>(await window.api.getEntityAddresses(e.id))
      setAddresses(list)
      setAddress(list[0] ? addressText(list[0]) : '')
    } catch {
      setAddresses([])
    }
  }

  const handleFile = (file: File): void => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setError('Please select an Excel file (.xlsx or .xls).')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = (e): void => {
      try {
        const parsed = parseStatementWorkbook(e.target?.result as ArrayBuffer)
        if (!parsed) {
          setError('No table found in the file. The sheet needs a header row (Date, Num, ...).')
          setData(null)
          return
        }
        setFileName(file.name)
        setData(parsed)
        applyColumns(parsed, settings.titles[titleIdx])
        setTotalKey(defaultTotalColumn(parsed.columns))
        const single = parsed.groups.length === 1 ? parsed.groups[0] : ''
        setTo(single)
        setAddresses([])
        setAddress('')
        // The file's one customer, when it is in the Directory, brings its address
        const known = single
          ? entities.find((x) => x.name.trim().toLowerCase() === single.trim().toLowerCase())
          : undefined
        if (known) void pickCustomer(known)
        setShowGroups(parsed.groups.length > 1)
        setNotes(parsed.notes)
      } catch {
        setError('Failed to read the file.')
        setData(null)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const clearData = (): void => {
    setData(null)
    setFileName('')
    setError(null)
  }

  const toggleColumn = (key: string): void => {
    if (!data) return
    setVisible((prev) => {
      const next = prev.includes(key)
        ? prev.filter((k) => k !== key)
        : // keep the file's column order when a column is switched back on
          data.columns.map((c) => c.key).filter((k) => prev.includes(k) || k === key)
      saveColumnPrefs(next)
      return next
    })
  }
  // Moves column fromKey to where toKey is
  const moveColumn = (fromKey: string, toKey: string): void =>
    setVisible((prev) => {
      const i = prev.indexOf(fromKey)
      const j = prev.indexOf(toKey)
      if (i < 0 || j < 0 || i === j) return prev
      const next = moveInArray(prev, i, j)
      saveColumnPrefs(next)
      return next
    })

  /** The shown columns, their order and names become the report type's columns */
  const saveColumnNames = async (): Promise<void> => {
    if (!data) return
    const type = settings.titles[titleIdx]
    if (!type) return
    const columns = visible
      .filter((k) => data.columns.some((c) => c.key === k))
      .map((k) => ({ key: k, label: (labels[k] || '').trim() || k }))
    try {
      const next = {
        ...settings,
        titles: settings.titles.map((t, i) => (i === titleIdx ? { ...t, columns } : t))
      }
      await saveStatementSettings(next)
      setSettings(next)
      showSuccess(`Columns saved for ${type.title}`)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Saving failed')
    }
  }

  const currencyKey = data ? currencyColumn(data.columns) : null
  const ordered = data ? visible.filter((k) => data.columns.some((c) => c.key === k)) : []
  // Drag a column by its handle (or Up / Down on it)
  const columnSort = useDragSort(ordered.length, (from, to) =>
    moveColumn(ordered[from], ordered[to])
  )
  const hidden = data ? data.columns.filter((c) => !visible.includes(c.key)) : []
  const totals =
    data && totalKey && ordered.includes(totalKey)
      ? columnTotals(data.rows, totalKey, currencyKey)
      : []
  const typeName = settings.titles[titleIdx]?.title || ''
  const bank = banks.find((b) => b.id === bankId)

  const runExport = async (kind: 'docx' | 'pdf'): Promise<void> => {
    if (!data || ordered.length === 0) return
    setExporting(kind)
    const input: StatementExportInput = {
      title: title.trim() || typeName || 'Statement of Account',
      reference: reference.trim(),
      date,
      to: to.trim(),
      address: to.trim() ? address : '',
      intro: includeIntro ? intro : '',
      closing: includeClosing ? closing : '',
      bankDetails: bank?.details || '',
      notes,
      columns: data.columns,
      visible: ordered,
      labels,
      rows: data.rows,
      showGroups: showGroups && data.groups.length > 0,
      totalKey,
      currencyKey,
      orientation,
      fontSize: settings.fontSize || 9
    }
    try {
      const { exportStatementDocx, exportStatementPdf } =
        await import('../services/StatementExportService')
      if (kind === 'docx') await exportStatementDocx(input)
      else await exportStatementPdf(input)
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setExporting('')
    }
  }

  const isRight = (key: string): boolean => {
    const k = data?.columns.find((c) => c.key === key)?.kind
    return k === 'money' || k === 'number'
  }

  const settingsButton = canConfigure && (
    <button className="btn-secondary" onClick={() => setShowSettings(true)}>
      <Settings size={15} /> Settings
    </button>
  )

  return (
    <div>
      {showSettings && (
        <StatementSettingsModal
          initial={settings}
          onClose={() => setShowSettings(false)}
          onSaved={(s) => {
            setSettings(s)
            setShowSettings(false)
            if (titleIdx >= s.titles.length) pickTitle(0)
          }}
        />
      )}

      {!data ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {settingsButton && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{settingsButton}</div>
          )}
          <FileDrop
            accept=".xlsx,.xls"
            title="Drop the statement Excel here"
            hint="or click to browse - an accounting export (e.g. QuickBooks open invoices) with a header row; it is formatted on the company letterhead"
            onFiles={([f]) => handleFile(f)}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* File bar */}
          <div
            className="glass-card"
            style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 18px' }}
          >
            <FileText size={20} color="var(--accent-primary)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{fileName}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {data.rows.length} line{data.rows.length === 1 ? '' : 's'}
                {data.groups.length > 0 && ` · ${data.groups.join(', ')}`}
                {totals.length > 0 &&
                  ` · Total ${totals.map((t) => `${t.currency} ${formatMoney(t.total)}`.trim()).join(' + ')}`}
              </div>
            </div>
            {settingsButton}
            <button className="btn-secondary" onClick={clearData}>
              <X size={15} /> Change file
            </button>
            <button
              className="btn-secondary"
              disabled={!!exporting || ordered.length === 0}
              onClick={() => runExport('docx')}
            >
              {exporting === 'docx' ? 'Exporting…' : 'Export Word'}
            </button>
            <button
              className="btn-primary"
              disabled={!!exporting || ordered.length === 0}
              onClick={() => runExport('pdf')}
            >
              {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Letter details */}
            <div className="glass-card" style={{ padding: '18px' }}>
              <h4 className="form-section-title">Letter</h4>
              <div className="form-grid cols-2">
                <Field
                  label="Title"
                  hint={typeName ? `Report: ${typeName} (its columns and text)` : undefined}
                >
                  <Combobox
                    aria-label="Title"
                    options={settings.titles.map((t, i) => ({ i, title: t.title }))}
                    getKey={(o) => String(o.i)}
                    getLabel={(o) => o.title}
                    value={title}
                    onInputChange={setTitle}
                    onSelect={(o) => pickTitle(o.i)}
                    filter={(list) => list}
                    autoHighlight={false}
                    placeholder="Pick a report, then edit the title if needed"
                  />
                </Field>
                <Field label="To">
                  <Combobox
                    aria-label="To"
                    options={entities}
                    getKey={(o) => o.id}
                    getLabel={(o) => o.name}
                    value={to}
                    onInputChange={(t) => {
                      setTo(t)
                      setAddresses([])
                    }}
                    onSelect={(o) => void pickCustomer(o)}
                    autoHighlight={false}
                    hideWhenEmpty
                    placeholder="Customer / broker (Directory or typed)"
                  />
                </Field>
                <Field
                  label="Address"
                  span="all"
                  hint={
                    addresses.length > 1 ? (
                      <select
                        aria-label="Choose the address"
                        onChange={(e) => {
                          const a = addresses.find((x) => x.id === e.target.value)
                          if (a) setAddress(addressText(a))
                        }}
                        style={{ marginTop: '4px' }}
                      >
                        {addresses.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label || a.addressLine1}
                          </option>
                        ))}
                      </select>
                    ) : undefined
                  }
                >
                  <textarea
                    rows={3}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Printed under the customer's name"
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </Field>
                <Field label="Reference no.">
                  <input value={reference} onChange={(e) => setReference(e.target.value)} />
                </Field>
                <Field label="Date">
                  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field
                  label={
                    <IncludeLabel
                      text="Text above the table"
                      checked={includeIntro}
                      onChange={setIncludeIntro}
                    />
                  }
                  span="all"
                >
                  <textarea
                    rows={2}
                    value={intro}
                    disabled={!includeIntro}
                    onChange={(e) => setIntro(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </Field>
                <Field
                  label={
                    <IncludeLabel
                      text="Text below the table"
                      checked={includeClosing}
                      onChange={setIncludeClosing}
                    />
                  }
                  span="all"
                >
                  <textarea
                    rows={2}
                    value={closing}
                    disabled={!includeClosing}
                    onChange={(e) => setClosing(e.target.value)}
                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </Field>
                <Field label="Bank" span="all" hint="Its details print after the text">
                  <select
                    value={bankId}
                    onChange={(e) => {
                      setBankId(e.target.value)
                      try {
                        localStorage.setItem(BANK_PREF_KEY, e.target.value)
                      } catch {
                        /* per-viewer convenience only */
                      }
                    }}
                  >
                    <option value="">No bank</option>
                    {banks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <PlaceholderHint />
            </div>

            {/* Columns */}
            <div className="glass-card" style={{ padding: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}
              >
                <h4 className="form-section-title" style={{ margin: 0 }}>
                  Columns
                </h4>
                {canConfigure && typeName && (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={saveColumnNames}
                    title={`The shown columns, their order and names become those of ${typeName}`}
                  >
                    <Save size={14} /> Save columns for {typeName}
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ordered.map((key, i) => (
                  <div
                    key={key}
                    {...columnSort.rowProps(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <DragHandle
                      {...columnSort.handleProps(i, `Move column ${labels[key] ?? key}`)}
                    />
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleColumn(key)}
                      title="Hide column"
                      style={{ accentColor: 'var(--accent-primary)', width: 'auto' }}
                    />
                    <input
                      value={labels[key] ?? key}
                      onChange={(e) => setLabels((p) => ({ ...p, [key]: e.target.value }))}
                      title={`Excel column: ${key}`}
                      style={{ flex: 1, padding: '6px 8px', fontSize: '0.82rem' }}
                    />
                  </div>
                ))}
              </div>
              {hidden.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Hidden:
                  </span>
                  {hidden.map((c) => (
                    <button
                      key={c.key}
                      className="chip"
                      onClick={() => toggleColumn(c.key)}
                      title="Show column"
                    >
                      <Plus size={12} /> {labels[c.key] || c.key}
                    </button>
                  ))}
                </div>
              )}
              <div className="form-grid cols-2" style={{ marginTop: '14px' }}>
                <Field label="Total of">
                  <select
                    value={totalKey || ''}
                    onChange={(e) => setTotalKey(e.target.value || null)}
                  >
                    <option value="">No total</option>
                    {data.columns
                      .filter((c) => c.kind === 'money')
                      .map((c) => (
                        <option key={c.key} value={c.key}>
                          {labels[c.key] || c.key}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="Page">
                  <select
                    value={orientation}
                    onChange={(e) => {
                      const v = e.target.value as StatementExportInput['orientation']
                      setOrientation(v)
                      try {
                        localStorage.setItem(ORIENTATION_KEY, v)
                      } catch {
                        /* per-viewer convenience only */
                      }
                    }}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                    <option value="auto">Automatic (portrait if it fits)</option>
                  </select>
                </Field>
              </div>
              {data.groups.length > 0 && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginTop: '10px',
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showGroups}
                    onChange={(e) => setShowGroups(e.target.checked)}
                    style={{ accentColor: 'var(--accent-primary)', width: 'auto' }}
                  />
                  Show customer headings in the table
                </label>
              )}
            </div>
          </div>

          {/* Preview */}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {ordered.map((k) => (
                    <th key={k} className={isRight(k) ? 'num' : undefined}>
                      {labels[k] || k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => {
                  const head =
                    showGroups && r.group && (i === 0 || data.rows[i - 1].group !== r.group)
                  return [
                    head ? (
                      <tr key={`g${i}`}>
                        <td colSpan={ordered.length} style={{ fontWeight: 700 }}>
                          {r.group}
                        </td>
                      </tr>
                    ) : null,
                    <tr key={i}>
                      {ordered.map((k) => (
                        <td key={k} className={isRight(k) ? 'num' : undefined}>
                          {r.cells[k]}
                          {!isRight(k) && (r.cells[k] || '').length > LONG_CELL && (
                            <button
                              type="button"
                              className="btn-ghost btn-icon"
                              title="Move part of this text to a note under the table"
                              aria-label="Move part of this text to a note"
                              onClick={() => openSplit(i, k)}
                              style={{ marginLeft: '4px', padding: '2px', verticalAlign: 'middle' }}
                            >
                              <Scissors size={13} />
                            </button>
                          )}
                        </td>
                      ))}
                    </tr>
                  ]
                })}
                {totals.map((t) => (
                  <tr
                    key={`t${t.currency}`}
                    style={{ fontWeight: 600, background: 'var(--table-header-bg)' }}
                  >
                    {ordered.map((k, i) => (
                      <td key={k} className={isRight(k) ? 'num' : undefined}>
                        {k === totalKey
                          ? formatMoney(t.total)
                          : k === currencyKey
                            ? t.currency
                            : i === 0
                              ? 'Total'
                              : ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Notes under the table */}
          <div className="glass-card" style={{ padding: '18px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px'
              }}
            >
              <h4 className="form-section-title" style={{ margin: 0 }}>
                Notes under the table
              </h4>
              <button
                className="btn-secondary btn-sm"
                onClick={() => setNotes((n) => [...n, `${nextNoteMarker(n)}`])}
              >
                <Plus size={14} /> Add note
              </button>
            </div>
            {notes.length === 0 ? (
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                None. A long cell has a <Scissors size={11} /> button: part of its text moves here
                with a * mark in the cell.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {notes.map((n, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input
                      value={n}
                      onChange={(e) =>
                        setNotes((list) => list.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      aria-label={`Note ${i + 1}`}
                      style={{ flex: 1, fontWeight: 600 }}
                    />
                    <button
                      className="btn-ghost btn-icon"
                      title="Delete the note (its mark leaves the cell too)"
                      aria-label="Delete note"
                      onClick={() => removeNote(i)}
                      style={{ color: 'var(--danger)' }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {split && data && (
        <Modal
          title="Move to a note"
          icon={<Scissors size={18} />}
          onClose={() => setSplit(null)}
          closeOnOverlay={false}
          width={620}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setSplit(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={applySplit} disabled={!split.note.trim()}>
                Move to note {split.marker}
              </button>
            </>
          }
        >
          <div className="form-grid">
            <Field label="Text in the Excel">
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {data.rows[split.row]?.cells[split.key]}
              </div>
            </Field>
            <Field label="Kept in the cell" hint={`Printed: ${split.keep.trim()}${split.marker}`}>
              <input
                value={split.keep}
                onChange={(e) => setSplit({ ...split, keep: e.target.value })}
              />
            </Field>
            <Field
              label="Note under the table"
              hint={`Printed: ${split.marker}${split.note.trim()}`}
            >
              <input
                autoFocus
                value={split.note}
                onChange={(e) => setSplit({ ...split, note: e.target.value })}
              />
            </Field>
          </div>
        </Modal>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '12px',
            color: 'var(--danger)',
            fontSize: '0.85rem'
          }}
        >
          <AlertCircle size={16} /> {error}
        </div>
      )}
    </div>
  )
}
