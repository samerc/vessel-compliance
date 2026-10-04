import { useEffect, useRef, useState } from 'react'
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  Settings,
  ChevronUp,
  ChevronDown,
  Plus,
  Trash2,
  Save
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { Modal } from './ui'
import {
  parseStatementWorkbook,
  defaultVisibleColumns,
  defaultTotalColumn,
  currencyColumn,
  columnTotals,
  formatMoney,
  type ParsedStatement
} from '../utils/statementParser'
import {
  loadStatementSettings,
  saveStatementSettings,
  exportStatementDocx,
  exportStatementPdf,
  DEFAULT_STATEMENT_SETTINGS,
  STATEMENT_PLACEHOLDERS,
  type StatementSettings,
  type StatementExportInput
} from '../services/StatementExportService'

// Statement of Account / invoice letter: upload the accounting Excel, pick a title, reference,
// date and columns, export on the company letterhead (Word or PDF).

const COLS_PREF_KEY = 'statement_columns'
const ORIENTATION_KEY = 'statement_orientation'

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
  fontWeight: 500
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
  const move = (i: number, dir: -1 | 1): void =>
    setS((p) => {
      const j = i + dir
      if (j < 0 || j >= p.titles.length) return p
      const arr = [...p.titles]
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
      return { ...p, titles: arr }
    })

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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Titles</h4>
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
            Each title can carry a text above and below the table. The first title is the default.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {s.titles.map((t, i) => (
              <div
                key={i}
                style={{
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--table-border)'
                }}
              >
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input
                    value={t.title}
                    placeholder="Title, e.g. Statement of Account"
                    onChange={(e) => setTitle(i, { title: e.target.value })}
                    style={{ flex: 1, fontWeight: 600 }}
                  />
                  <button
                    className="btn-ghost btn-icon"
                    title="Move up"
                    aria-label="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="btn-ghost btn-icon"
                    title="Move down"
                    aria-label="Move down"
                    disabled={i === s.titles.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ChevronDown size={16} />
                  </button>
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
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    marginTop: '10px'
                  }}
                >
                  <div>
                    <label style={labelStyle}>Text above the table</label>
                    <textarea
                      rows={3}
                      value={t.intro}
                      onChange={(e) => setTitle(i, { intro: e.target.value })}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Text below the table</label>
                    <textarea
                      rows={3}
                      value={t.closing}
                      onChange={(e) => setTitle(i, { closing: e.target.value })}
                      style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <PlaceholderHint />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Reference starts with</label>
            <input
              value={s.referencePrefix}
              placeholder="e.g. SOA/26/"
              onChange={(e) => setS((p) => ({ ...p, referencePrefix: e.target.value }))}
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={labelStyle}>Table font size (pt)</label>
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
              style={{ width: '100%' }}
            />
          </div>
        </div>

        <div>
          <h4 style={{ margin: '0 0 6px', fontSize: '0.9rem' }}>Column names</h4>
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState<StatementSettings>(DEFAULT_STATEMENT_SETTINGS)
  const [showSettings, setShowSettings] = useState(false)

  const [data, setData] = useState<ParsedStatement | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState<'' | 'docx' | 'pdf'>('')

  const [titleIdx, setTitleIdx] = useState(0)
  const [reference, setReference] = useState('')
  const [date, setDate] = useState(todayISO)
  const [to, setTo] = useState('')
  const [intro, setIntro] = useState('')
  const [closing, setClosing] = useState('')
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

  useEffect(() => {
    let alive = true
    void loadStatementSettings().then((s) => {
      if (!alive) return
      setSettings(s)
      setReference((r) => r || s.referencePrefix)
      setIntro(s.titles[0]?.intro || '')
      setClosing(s.titles[0]?.closing || '')
    })
    return () => {
      alive = false
    }
  }, [])

  const pickTitle = (i: number): void => {
    setTitleIdx(i)
    setIntro(settings.titles[i]?.intro || '')
    setClosing(settings.titles[i]?.closing || '')
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
        const keys = parsed.columns.map((c) => c.key)
        const pref = loadColumnPrefs()?.filter((k) => keys.includes(k))
        setVisible(pref && pref.length > 0 ? pref : defaultVisibleColumns(parsed.columns))
        setLabels(Object.fromEntries(keys.map((k) => [k, settings.columnLabels[k] || k])))
        setTotalKey(defaultTotalColumn(parsed.columns))
        setTo(parsed.groups.length === 1 ? parsed.groups[0] : '')
        setShowGroups(parsed.groups.length > 1)
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
  const moveColumn = (key: string, dir: -1 | 1): void =>
    setVisible((prev) => {
      const i = prev.indexOf(key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      saveColumnPrefs(next)
      return next
    })

  const saveColumnNames = async (): Promise<void> => {
    if (!data) return
    const columnLabels = { ...settings.columnLabels }
    for (const c of data.columns) {
      const l = (labels[c.key] || '').trim()
      if (l && l !== c.key) columnLabels[c.key] = l
      else delete columnLabels[c.key]
    }
    try {
      const next = { ...settings, columnLabels }
      await saveStatementSettings(next)
      setSettings(next)
      showSuccess('Column names saved as default')
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Saving failed')
    }
  }

  const currencyKey = data ? currencyColumn(data.columns) : null
  const ordered = data ? visible.filter((k) => data.columns.some((c) => c.key === k)) : []
  const hidden = data ? data.columns.filter((c) => !visible.includes(c.key)) : []
  const totals =
    data && totalKey && ordered.includes(totalKey)
      ? columnTotals(data.rows, totalKey, currencyKey)
      : []
  const title = settings.titles[titleIdx]?.title || 'Statement of Account'

  const runExport = async (kind: 'docx' | 'pdf'): Promise<void> => {
    if (!data || ordered.length === 0) return
    setExporting(kind)
    const input: StatementExportInput = {
      title,
      reference: reference.trim(),
      date,
      to: to.trim(),
      intro,
      closing,
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
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--accent-primary)' : 'var(--input-border)'}`,
              borderRadius: '16px',
              padding: '64px 32px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragging ? 'var(--accent-tint)' : 'var(--bg-card)'
            }}
          >
            <Upload
              size={48}
              color="var(--accent-primary)"
              style={{ marginBottom: '16px', opacity: 0.7 }}
            />
            <p style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 8px' }}>
              Drop the statement Excel here
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
              or click to browse
            </p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
              An accounting export (e.g. QuickBooks open invoices) with a header row. It is
              formatted on the company letterhead.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
                e.target.value = ''
              }}
            />
          </div>
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
              <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>Letter</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Title</label>
                  <select
                    value={titleIdx}
                    onChange={(e) => pickTitle(Number(e.target.value))}
                    style={{ width: '100%' }}
                  >
                    {settings.titles.map((t, i) => (
                      <option key={i} value={i}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>To</label>
                  <input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Customer / broker"
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Reference no.</label>
                  <input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div style={{ marginTop: '12px' }}>
                <label style={labelStyle}>Text above the table</label>
                <textarea
                  rows={2}
                  value={intro}
                  onChange={(e) => setIntro(e.target.value)}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div style={{ marginTop: '10px' }}>
                <label style={labelStyle}>Text below the table</label>
                <textarea
                  rows={2}
                  value={closing}
                  onChange={(e) => setClosing(e.target.value)}
                  style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                />
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
                <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Columns</h4>
                {canConfigure && (
                  <button className="btn-ghost btn-sm" onClick={saveColumnNames}>
                    <Save size={14} /> Save column names
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ordered.map((key, i) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
                    <button
                      className="btn-ghost btn-icon"
                      title="Move left"
                      aria-label="Move column left"
                      disabled={i === 0}
                      onClick={() => moveColumn(key, -1)}
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      className="btn-ghost btn-icon"
                      title="Move right"
                      aria-label="Move column right"
                      disabled={i === ordered.length - 1}
                      onClick={() => moveColumn(key, 1)}
                    >
                      <ChevronDown size={15} />
                    </button>
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
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginTop: '14px'
                }}
              >
                <div>
                  <label style={labelStyle}>Total of</label>
                  <select
                    value={totalKey || ''}
                    onChange={(e) => setTotalKey(e.target.value || null)}
                    style={{ width: '100%' }}
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
                </div>
                <div>
                  <label style={labelStyle}>Page</label>
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
                    style={{ width: '100%' }}
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                    <option value="auto">Automatic (portrait if it fits)</option>
                  </select>
                </div>
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
                        </td>
                      ))}
                    </tr>
                  ]
                })}
                {totals.map((t) => (
                  <tr key={`t${t.currency}`} style={{ fontWeight: 700 }}>
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
        </div>
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
