import { useState, type DragEvent, type KeyboardEvent, type PointerEvent } from 'react'

/**
 * Drag-to-sort for any list: rows move by their handle (drag it, or focus it and press Up / Down).
 * A row is draggable only while its handle is pressed, so text in the row's inputs can still be
 * selected. While dragging, the row it will land on shows a line on the side it moves to.
 *
 *   const sort = useDragSort(items.length, (from, to) => void moveItem(from, to))
 *   <div key={item.id} {...sort.rowProps(i)}>
 *     <DragHandle {...sort.handleProps(i, `Move ${item.name}`)} />
 *
 * onMove(from, to): take the item at `from` out and put it back at `to` (the target row's index).
 */
export interface DragSort {
  rowProps: (index: number) => {
    draggable: boolean
    onDragStart: () => void
    onDragOver: (e: DragEvent) => void
    onDrop: (e: DragEvent) => void
    onDragEnd: () => void
    className: string
  }
  handleProps: (index: number, label: string) => DragHandleProps
  dragging: boolean
}

export interface DragHandleProps {
  onPointerDown: (e: PointerEvent) => void
  onPointerUp: () => void
  onKeyDown: (e: KeyboardEvent) => void
  label: string
  disabled?: boolean
}

export function useDragSort(
  count: number,
  onMove: (from: number, to: number) => void,
  opts: { disabled?: boolean | ((index: number) => boolean) } = {}
): DragSort {
  const [armed, setArmed] = useState<number | null>(null)
  const [from, setFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const isDisabled = (i: number): boolean =>
    typeof opts.disabled === 'function' ? opts.disabled(i) : !!opts.disabled
  const end = (): void => {
    setArmed(null)
    setFrom(null)
    setOver(null)
  }
  const move = (a: number, b: number): void => {
    if (a === b || a < 0 || b < 0 || a >= count || b >= count) return
    onMove(a, b)
  }
  return {
    dragging: from !== null,
    rowProps: (i) => ({
      draggable: armed === i,
      onDragStart: () => {
        if (armed !== i) return
        // No effectAllowed / dropEffect = 'move': with them the drop never arrives (Chromium on
        // Windows, tested 2026-11-03)
        setFrom(i)
      },
      onDragOver: (e) => {
        if (from === null || isDisabled(i)) return
        e.preventDefault()
        if (over !== i) setOver(i)
      },
      onDrop: (e) => {
        if (from === null) return
        e.preventDefault()
        const a = from
        end()
        move(a, i)
      },
      onDragEnd: end,
      className: [
        'drag-row',
        from === i && over !== null ? 'drag-row-moving' : '',
        over === i && from !== null && from !== i
          ? from < i
            ? 'drag-row-drop-after'
            : 'drag-row-drop-before'
          : ''
      ]
        .filter(Boolean)
        .join(' ')
    }),
    handleProps: (i, label) => ({
      label,
      disabled: isDisabled(i),
      onPointerDown: () => {
        if (!isDisabled(i)) setArmed(i)
      },
      onPointerUp: () => {
        if (from === null) setArmed(null)
      },
      onKeyDown: (e) => {
        if (isDisabled(i)) return
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault()
          move(i, i + (e.key === 'ArrowUp' ? -1 : 1))
        }
      }
    })
  }
}

/** Moves one item of an array (a copy), for onMove handlers */
export function moveInArray<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr]
  const [m] = out.splice(from, 1)
  out.splice(to, 0, m)
  return out
}
