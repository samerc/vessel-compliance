import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import CheckList, { type CheckListProps } from './CheckList'

/**
 * A button that opens a CheckList: choose several options (filters, vessel class). The button
 * shows the ticked labels and their count. Keyboard: Enter / Space / Down opens, then as in
 * CheckList; Escape closes and returns to the button, Tab closes.
 *
 *   <MultiSelect options={flags} getKey={(f) => f.id} getLabel={(f) => f.name}
 *     selected={flagIds} onChange={setFlagIds} placeholder="Any flag state" />
 */
export default function MultiSelect<T>({
  placeholder = 'Any',
  summary,
  disabled,
  style,
  buttonStyle,
  listMinWidth = 220,
  ...list
}: Omit<CheckListProps<T>, 'autoFocus' | 'onExit'> & {
  placeholder?: string
  /** Button text when something is ticked (default: the ticked labels, comma separated) */
  summary?: (ticked: T[]) => ReactNode
  disabled?: boolean
  style?: React.CSSProperties
  buttonStyle?: React.CSSProperties
  listMinWidth?: number
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{
    left: number
    top: number
    bottom: number
    width: number
    up: boolean
  } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const sel = new Set(list.selected)
  const ticked = list.options.filter((o) => sel.has(list.getKey(o)))
  const text = ticked.length
    ? (summary?.(ticked) ?? ticked.map(list.getLabel).join(', '))
    : placeholder

  const place = (): void => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    setPos({
      left: r.left,
      top: r.top,
      bottom: r.bottom,
      width: r.width,
      up: below < 300 && r.top > below
    })
  }
  useLayoutEffect(() => {
    if (!open) return
    place()
    const h = (): void => place()
    window.addEventListener('resize', h)
    window.addEventListener('scroll', h, true)
    return () => {
      window.removeEventListener('resize', h)
      window.removeEventListener('scroll', h, true)
    }
  }, [open])

  // Click outside closes
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent): void => {
      const t = e.target as Node
      if (!popRef.current?.contains(t) && !btnRef.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  return (
    <div style={{ position: 'relative', ...style }}>
      <button
        ref={btnRef}
        type="button"
        className={'multi-select-btn' + (ticked.length ? ' has-value' : '')}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={list['aria-label']}
        disabled={disabled}
        style={buttonStyle}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          } else if (open && e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
          }
        }}
      >
        <span className="multi-select-text">{text}</span>
        {ticked.length > 0 && <span className="multi-select-count">{ticked.length}</span>}
        <ChevronDown
          size={13}
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            className="multi-select-pop"
            style={{
              left: pos.left,
              width: Math.max(pos.width, listMinWidth),
              ...(pos.up ? { bottom: window.innerHeight - pos.top + 4 } : { top: pos.bottom + 4 })
            }}
          >
            <CheckList
              {...list}
              autoFocus
              onExit={(key) => {
                setOpen(false)
                if (key === 'Escape') btnRef.current?.focus()
              }}
            />
          </div>,
          document.body
        )}
    </div>
  )
}
