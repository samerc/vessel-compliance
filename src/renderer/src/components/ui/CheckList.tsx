import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { defaultComboFilter } from './comboFilter'

/**
 * A list of options to tick, with a search field when the list is long. Used inline (fleet "Add
 * vessels") and inside MultiSelect. Keyboard: type to filter, Down / Up move, Enter (or Space when
 * the search field is empty) ticks the highlighted row, Ctrl+A ticks every shown row.
 *
 *   <CheckList options={vessels} getKey={(v) => v.id} getLabel={(v) => v.name}
 *     selected={ids} onChange={setIds} />
 */
export interface CheckListProps<T> {
  options: T[]
  getKey: (o: T) => string
  getLabel: (o: T) => string
  /** Grey text after the label (searched too) */
  getDetail?: (o: T) => string | null | undefined
  /** Custom row content after the tick box (default: label + detail) */
  renderOption?: (o: T, checked: boolean) => ReactNode
  /** Keys of the ticked options */
  selected: string[]
  onChange: (keys: string[]) => void
  /** Replaces the plain tick / untick (e.g. ask first); onChange is then not called for a row */
  onToggle?: (o: T, tick: boolean) => void
  /** Search field shown from this many options (default 7; 0 = always, Infinity = never) */
  searchFrom?: number
  searchPlaceholder?: string
  /** "All" / "None" buttons above the list */
  allNone?: boolean
  emptyText?: ReactNode
  maxHeight?: number | string
  /** A last row that is not an option, e.g. "+ Add new" */
  footer?: ReactNode
  autoFocus?: boolean
  /** Escape / Tab in the list (MultiSelect closes its popup) */
  onExit?: (key: 'Escape' | 'Tab') => void
  'aria-label'?: string
}

export default function CheckList<T>(props: CheckListProps<T>): React.JSX.Element {
  const {
    options,
    getKey,
    getLabel,
    getDetail,
    renderOption,
    selected,
    onChange,
    onToggle,
    searchFrom = 7,
    searchPlaceholder = 'Search...',
    allNone,
    emptyText,
    maxHeight = 240,
    footer,
    autoFocus,
    onExit
  } = props
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)
  const listId = useId()
  const showSearch = options.length >= searchFrom
  const sel = useMemo(() => new Set(selected), [selected])

  const shown = useMemo(
    () => defaultComboFilter(options, query, getLabel, getDetail),
    [options, query, getLabel, getDetail]
  )
  const activeIdx = Math.min(active, Math.max(shown.length - 1, 0))

  useEffect(() => {
    if (!autoFocus) return
    const t = setTimeout(() => (searchRef.current ?? listRef.current)?.focus(), 30)
    return () => clearTimeout(t)
  }, [autoFocus])

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-check-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const toggle = (o: T): void => {
    const key = getKey(o)
    const tick = !sel.has(key)
    if (onToggle) onToggle(o, tick)
    else onChange(tick ? [...selected, key] : selected.filter((k) => k !== key))
  }
  const optionId = (i: number): string => `${listId}-opt-${i}`

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>, fromSearch: boolean): void => {
    const last = shown.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(activeIdx + 1, last))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(activeIdx - 1, 0))
    } else if (e.key === 'PageDown') {
      e.preventDefault()
      setActive(Math.min(activeIdx + 8, last))
    } else if (e.key === 'PageUp') {
      e.preventDefault()
      setActive(Math.max(activeIdx - 8, 0))
    } else if (e.key === 'Enter' || (e.key === ' ' && (!fromSearch || query === ''))) {
      if (shown[activeIdx]) {
        e.preventDefault()
        toggle(shown[activeIdx])
      }
    } else if (e.key === 'a' && (e.ctrlKey || e.metaKey) && !onToggle && (!fromSearch || query)) {
      // Ctrl+A in an empty search field keeps selecting its text
      e.preventDefault()
      onChange([...new Set([...selected, ...shown.map(getKey)])])
    } else if ((e.key === 'Escape' || e.key === 'Tab') && onExit) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
      }
      onExit(e.key)
    }
  }

  const listbox = (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-multiselectable
      aria-label={props['aria-label']}
      aria-activedescendant={shown.length ? optionId(activeIdx) : undefined}
      tabIndex={showSearch ? -1 : 0}
      className="check-list-items"
      style={{ maxHeight }}
      onKeyDown={(e) => onKeyDown(e, false)}
    >
      {shown.length === 0 && (
        <div className="combo-empty">
          {query ? 'No matches' : (emptyText ?? 'Nothing to choose from')}
        </div>
      )}
      {shown.map((o, i) => {
        const key = getKey(o)
        const checked = sel.has(key)
        const detail = getDetail?.(o)
        return (
          <div
            key={key}
            id={optionId(i)}
            data-check-idx={i}
            role="option"
            aria-selected={checked}
            className={
              'check-option' + (i === activeIdx ? ' active' : '') + (checked ? ' checked' : '')
            }
            // keeps the focus in the search field / list
            onMouseDown={(e) => e.preventDefault()}
            onMouseMove={(e) => {
              const prev = lastMouse.current
              lastMouse.current = { x: e.clientX, y: e.clientY }
              if (!prev || (prev.x === e.clientX && prev.y === e.clientY)) return
              if (i !== activeIdx) setActive(i)
            }}
            onClick={() => {
              setActive(i)
              toggle(o)
            }}
          >
            <span className="check-box" aria-hidden>
              {checked && <Check size={11} strokeWidth={3} />}
            </span>
            <span className="check-option-text">
              {renderOption ? (
                renderOption(o, checked)
              ) : (
                <>
                  {getLabel(o)}
                  {detail ? <span className="combo-detail">{detail}</span> : null}
                </>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )

  return (
    <div className="check-list">
      {(allNone || showSearch) && (
        <div className="check-list-head">
          {showSearch && (
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={shown.length ? optionId(activeIdx) : undefined}
              aria-label={`Search ${props['aria-label'] || 'options'}`}
              placeholder={searchPlaceholder}
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => onKeyDown(e, true)}
            />
          )}
          {allNone && (
            <span className="check-list-allnone">
              <button
                type="button"
                className="btn-ghost btn-sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange([...new Set([...selected, ...shown.map(getKey)])])}
                title={query ? 'Tick every match' : 'Tick all'}
              >
                All
              </button>
              <button
                type="button"
                className="btn-ghost btn-sm"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  const drop = new Set(shown.map(getKey))
                  onChange(query ? selected.filter((k) => !drop.has(k)) : [])
                }}
                title={query ? 'Untick every match' : 'Untick all'}
              >
                None
              </button>
            </span>
          )}
        </div>
      )}
      {listbox}
      {footer && <div className="combo-footer">{footer}</div>}
    </div>
  )
}
