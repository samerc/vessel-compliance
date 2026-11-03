import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { defaultComboFilter } from './comboFilter'

/**
 * A text field with a searchable list under it, for every "type to find" pick-list.
 * Keyboard: Down / Up move through the list (Down also opens it), Page Down / Page Up jump,
 * Enter picks, Escape closes the list (not the dialog around it), Tab leaves the field.
 * The list floats above everything (dialogs, scroll areas) and opens upward when there is no
 * room below.
 *
 *   <Combobox
 *     value={flag}                       // the text in the field
 *     onInputChange={setFlag}            // typing (leave out = the field only filters)
 *     options={flags}
 *     getKey={(f) => f.id}
 *     getLabel={(f) => f.name}
 *     getDetail={(f) => f.iso3Code}      // grey text after the label, also searched
 *     onSelect={(f) => setFlag(f.name)}
 *   />
 */
export interface ComboboxProps<T> {
  options: T[]
  getKey: (o: T) => string
  getLabel: (o: T) => string
  /** Secondary text after the label (searched too) */
  getDetail?: (o: T) => string | null | undefined
  /** Custom row content (default: label + detail) */
  renderOption?: (o: T, active: boolean) => ReactNode
  onSelect: (o: T) => void
  /** Text in the field. Leave out with onInputChange for a field that only searches */
  value?: string
  onInputChange?: (text: string) => void
  /** Custom search (default: every word of the query in the label or detail) */
  filter?: (options: T[], query: string) => T[]
  /** Clear the field after a pick (search boxes that add an item) */
  clearOnSelect?: boolean
  /** Rows shown at most (default 100) */
  maxResults?: number
  placeholder?: string
  emptyText?: ReactNode
  /** A last row that is not an option, e.g. "+ Add new vessel" */
  footer?: (query: string, close: () => void) => ReactNode
  onBlur?: (text: string) => void
  onFocus?: () => void
  id?: string
  'aria-label'?: string
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  style?: CSSProperties
  inputStyle?: CSSProperties
  /** Width of the list when wider than the field */
  listMinWidth?: number
}

export default function Combobox<T>(props: ComboboxProps<T>): React.JSX.Element {
  const {
    options,
    getKey,
    getLabel,
    getDetail,
    renderOption,
    onSelect,
    value,
    onInputChange,
    filter,
    clearOnSelect,
    maxResults = 100,
    placeholder,
    emptyText = 'No matches',
    footer,
    onBlur,
    onFocus,
    id,
    disabled,
    autoFocus,
    className,
    style,
    inputStyle,
    listMinWidth
  } = props
  const [ownText, setOwnText] = useState('')
  const text = value ?? ownText
  const setText = (t: string): void => {
    if (onInputChange) onInputChange(t)
    if (value === undefined) setOwnText(t)
  }
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(
    null
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)
  const listId = useId()

  const shown = useMemo(() => {
    const all = filter
      ? filter(options, text)
      : defaultComboFilter(options, text, getLabel, getDetail)
    return all.slice(0, maxResults)
  }, [options, text, filter, getLabel, getDetail, maxResults])
  const activeIdx = Math.min(active, Math.max(shown.length - 1, 0))

  // Place the list under the field (or above it when the window has no room below)
  const place = (): void => {
    const r = inputRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < 240 && r.top > below
    setPos({ left: r.left, top: up ? r.top : r.bottom, width: r.width, up })
  }
  useLayoutEffect(() => {
    if (!open) return
    place()
    const onMove = (): void => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  // Keep the highlighted row visible
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-combo-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  const close = (): void => setOpen(false)
  const pick = (o: T): void => {
    onSelect(o)
    if (clearOnSelect) setText('')
    setOpen(false)
    setActive(0)
  }

  const optionId = (i: number): string => `${listId}-opt-${i}`

  return (
    <div className={className} style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-label={props['aria-label']}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && shown.length ? optionId(activeIdx) : undefined}
        autoComplete="off"
        value={text}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        style={{ width: '100%', ...inputStyle }}
        onChange={(e) => {
          setText(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => {
          setOpen(true)
          setActive(0)
          onFocus?.()
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          onBlur?.(text)
        }}
        onKeyDown={(e) => {
          const last = shown.length - 1
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) setOpen(true)
            else setActive(Math.min(activeIdx + 1, last))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(activeIdx - 1, 0))
          } else if (e.key === 'PageDown') {
            e.preventDefault()
            setActive(Math.min(activeIdx + 8, last))
          } else if (e.key === 'PageUp') {
            e.preventDefault()
            setActive(Math.max(activeIdx - 8, 0))
          } else if (e.key === 'Enter') {
            if (open && shown[activeIdx]) {
              e.preventDefault()
              e.stopPropagation()
              pick(shown[activeIdx])
            }
          } else if (e.key === 'Escape') {
            if (open) {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }
          } else if (e.key === 'Tab') {
            setOpen(false)
          }
        }}
      />
      {open &&
        pos &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            className="combo-list"
            // Keeps the focus in the field while clicking the list
            onMouseDown={(e) => e.preventDefault()}
            style={{
              left: pos.left,
              width: Math.max(pos.width, listMinWidth || 0),
              ...(pos.up ? { bottom: window.innerHeight - pos.top + 2 } : { top: pos.top + 2 })
            }}
          >
            {shown.length === 0 && <div className="combo-empty">{emptyText}</div>}
            {shown.map((o, i) => {
              const detail = getDetail?.(o)
              return (
                <div
                  key={getKey(o)}
                  id={optionId(i)}
                  data-combo-idx={i}
                  role="option"
                  aria-selected={i === activeIdx}
                  className={'combo-option' + (i === activeIdx ? ' active' : '')}
                  onMouseMove={(e) => {
                    // Only a real mouse move: the browser also "moves" the mouse when the list
                    // scrolls under a resting pointer, which would undo the keyboard highlight
                    const last = lastMouse.current
                    lastMouse.current = { x: e.clientX, y: e.clientY }
                    // (the first event only records where the pointer rests)
                    if (!last || (last.x === e.clientX && last.y === e.clientY)) return
                    if (i !== activeIdx) setActive(i)
                  }}
                  onClick={() => pick(o)}
                >
                  {renderOption ? (
                    renderOption(o, i === activeIdx)
                  ) : (
                    <>
                      {getLabel(o)}
                      {detail ? <span className="combo-detail">{detail}</span> : null}
                    </>
                  )}
                </div>
              )
            })}
            {footer && <div className="combo-footer">{footer(text, close)}</div>}
          </div>,
          document.body
        )}
    </div>
  )
}
