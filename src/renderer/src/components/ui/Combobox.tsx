import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
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
  /** false = nothing is highlighted until Down / Up, so Enter keeps the typed text (free-text
   *  fields where a new name may partly match an existing one). Default true */
  autoHighlight?: boolean
  /** No list (not even "no matches") until this many characters are typed. Default 0 */
  minChars?: number
  /** No "no matches" box: the list hides when nothing matches */
  hideWhenEmpty?: boolean
  /** A last row that is not an option, e.g. "+ Add new vessel" */
  footer?: (query: string, close: () => void) => ReactNode
  onBlur?: (text: string) => void
  onFocus?: () => void
  id?: string
  'aria-label'?: string
  /** Keys the list did not use (e.g. Enter to save while the list is closed) */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
  /** 'auto' for fields that may hold Arabic */
  dir?: 'auto' | 'ltr' | 'rtl'
  maxLength?: number
  required?: boolean
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
    autoHighlight = true,
    minChars = 0,
    hideWhenEmpty,
    footer,
    onBlur,
    onFocus,
    id,
    dir,
    maxLength,
    required,
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
  const start = autoHighlight ? 0 : -1
  const [active, setActive] = useState(start)
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(
    null
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const lastMouse = useRef<{ x: number; y: number } | null>(null)
  // Down / Up pressed since the list opened: an empty field picks on Enter only then
  const moved = useRef(false)
  const listId = useId()

  const shown = useMemo(() => {
    const all = filter
      ? filter(options, text)
      : defaultComboFilter(options, text, getLabel, getDetail)
    return all.slice(0, maxResults)
  }, [options, text, filter, getLabel, getDetail, maxResults])
  const activeIdx = active < 0 ? -1 : Math.min(active, Math.max(shown.length - 1, 0))
  const listShown =
    open && text.trim().length >= minChars && !(hideWhenEmpty && !shown.length && !footer)

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
    setActive(start)
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
        aria-expanded={listShown}
        aria-controls={listId}
        aria-activedescendant={listShown && activeIdx >= 0 ? optionId(activeIdx) : undefined}
        autoComplete="off"
        value={text}
        disabled={disabled}
        dir={dir}
        maxLength={maxLength}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        style={{ width: '100%', ...inputStyle }}
        onChange={(e) => {
          moved.current = false
          setText(e.target.value)
          setOpen(true)
          setActive(start)
        }}
        onFocus={() => {
          moved.current = false
          setOpen(true)
          setActive(start)
          onFocus?.()
        }}
        onClick={() => setOpen(true)}
        onBlur={() => {
          setOpen(false)
          onBlur?.(text)
        }}
        onKeyDown={(e) => {
          const last = shown.length - 1
          if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp'].includes(e.key)) moved.current = true
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!open) setOpen(true)
            else setActive(Math.min(activeIdx + 1, last))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive(Math.max(activeIdx - 1, start))
          } else if (e.key === 'PageDown') {
            e.preventDefault()
            setActive(Math.min(activeIdx + 8, last))
          } else if (e.key === 'PageUp') {
            e.preventDefault()
            setActive(Math.max(activeIdx - 8, start))
          } else if (e.key === 'Enter') {
            const chosen = moved.current || text.trim() !== ''
            if (listShown && chosen && activeIdx >= 0 && shown[activeIdx]) {
              e.preventDefault()
              e.stopPropagation()
              pick(shown[activeIdx])
            }
          } else if (e.key === 'Escape') {
            if (listShown) {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
            }
          } else if (e.key === 'Tab') {
            setOpen(false)
          }
          if (!e.defaultPrevented) props.onKeyDown?.(e)
        }}
      />
      {listShown &&
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
