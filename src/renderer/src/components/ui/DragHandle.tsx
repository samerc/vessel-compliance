import type { DragHandleProps } from './useDragSort'

/** The grip a row is dragged by. Focus it and press Up / Down to move the row with the keyboard */
export function DragHandle({
  onPointerDown,
  onPointerUp,
  onKeyDown,
  label,
  disabled
}: DragHandleProps): React.JSX.Element | null {
  if (disabled) return <span className="drag-handle drag-handle-off" aria-hidden="true" />
  return (
    <span
      role="button"
      tabIndex={0}
      className="drag-handle"
      title="Drag to reorder (or Up / Down keys)"
      aria-label={`${label} (Up / Down keys)`}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
    >
      ⠿
    </span>
  )
}
