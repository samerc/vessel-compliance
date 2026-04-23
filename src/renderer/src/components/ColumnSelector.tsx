import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Settings } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

export interface ColumnDef {
  id: string
  label: string
  defaultVisible: boolean
}

interface ColumnSelectorProps {
  pageKey: string
  allColumns: ColumnDef[]
  visibleColumns: string[]
  onChange: (columns: string[]) => void
}

export function useColumnPrefs(pageKey: string, allColumns: ColumnDef[]): {
  visibleColumns: string[]
  setVisibleColumns: (cols: string[]) => void
  loaded: boolean
} {
  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(() =>
    allColumns.filter(c => c.defaultVisible).map(c => c.id)
  )
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.api.columnPrefsGet(pageKey).then(saved => {
      if (saved && Array.isArray(saved)) {
        // Filter to only valid column IDs
        const validIds = new Set(allColumns.map(c => c.id))
        const filtered = saved.filter(id => validIds.has(id))
        if (filtered.length > 0) {
          setVisibleColumnsState(filtered)
        }
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [pageKey])

  const setVisibleColumns = (cols: string[]) => {
    setVisibleColumnsState(cols)
    window.api.columnPrefsSet(pageKey, cols).catch(() => {})
  }

  return { visibleColumns, setVisibleColumns, loaded }
}

export default function ColumnSelector({ allColumns, visibleColumns, onChange }: ColumnSelectorProps) {
  const [open, setOpen] = useState(false)
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)
  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current && !ref.current.contains(target) && (!dropdownRef.current || !dropdownRef.current.contains(target))) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const visibleSet = new Set(visibleColumns)

  const toggle = (colId: string) => {
    const newSet = new Set(visibleColumns)
    if (newSet.has(colId)) {
      // Don't allow hiding all columns
      if (newSet.size <= 1) return
      newSet.delete(colId)
    } else {
      newSet.add(colId)
    }
    // Preserve order from allColumns
    const ordered = allColumns.filter(c => newSet.has(c.id)).map(c => c.id)
    onChange(ordered)
  }

  const resetDefaults = () => {
    const defaults = allColumns.filter(c => c.defaultVisible).map(c => c.id)
    onChange(defaults)
  }

  const hiddenCount = allColumns.length - visibleColumns.length

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className="btn-secondary"
        style={{
          padding: '6px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.8rem',
          color: hiddenCount > 0 ? 'var(--accent-primary)' : undefined,
          borderColor: hiddenCount > 0 ? 'var(--accent-primary)' : undefined
        }}
        title={hiddenCount > 0 ? `${hiddenCount} column${hiddenCount > 1 ? 's' : ''} hidden` : 'Configure visible columns'}
        aria-label="Column settings"
      >
        <Settings size={14} />
        {hiddenCount > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            width: '16px', height: '16px', borderRadius: '50%',
            background: 'var(--accent-primary)', color: '#fff',
            fontSize: '0.6rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1
          }}>
            {hiddenCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <div ref={dropdownRef} style={{
          position: 'fixed',
          top: (() => { const r = btnRef.current?.getBoundingClientRect(); return r ? r.bottom + 4 : 0 })(),
          left: (() => { const r = btnRef.current?.getBoundingClientRect(); return r ? Math.max(8, r.right - 200) : 0 })(),
          padding: '10px',
          minWidth: '200px',
          maxHeight: '320px',
          overflowY: 'auto',
          background: isLight ? '#ffffff' : '#1e222a',
          border: '1px solid var(--glass-border)',
          borderRadius: '10px',
          boxShadow: '0 12px 40px rgba(0,0,0,0.3)',
          zIndex: 9999
        }}>
          <div style={{
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--text-secondary)',
            fontWeight: 600,
            marginBottom: '8px',
            padding: '0 4px'
          }}>
            Visible Columns
          </div>

          {allColumns.map(col => (
            <label
              key={col.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 4px',
                cursor: 'pointer',
                borderRadius: '6px',
                fontSize: '0.85rem',
                transition: 'background 0.1s'
              }}
              className="hover-effect"
            >
              <input
                type="checkbox"
                checked={visibleSet.has(col.id)}
                onChange={() => toggle(col.id)}
                style={{ accentColor: 'var(--accent-primary)', width: '15px', height: '15px' }}
              />
              <span>{col.label}</span>
            </label>
          ))}

          <div style={{
            borderTop: '1px solid var(--table-border)',
            marginTop: '8px',
            paddingTop: '8px'
          }}>
            <button
              onClick={resetDefaults}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--accent-primary)',
                fontSize: '0.78rem',
                padding: '4px'
              }}
            >
              Reset to defaults
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
