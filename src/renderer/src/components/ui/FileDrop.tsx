import { useRef, useState, type ReactNode } from 'react'
import { Inbox, Loader2, Paperclip, Upload } from 'lucide-react'

/**
 * The place to drop or choose files, used everywhere a file is added. Click it (or focus it and
 * press Enter / Space) to browse; drop files on it. Files of another type than `accept` are turned
 * away with a short note. The disk path of a File is `window.api.getFilePath(file)`.
 *
 *   <FileDrop accept=".xlsx,.xls" title="Drop your Excel file here" onFiles={([f]) => read(f)} />
 *
 * Variants: 'large' = the whole empty page (import screens), 'bar' = a strip above a list,
 * 'chip' = a small inline "attach" button.
 */
export default function FileDrop({
  onFiles,
  accept,
  multiple = false,
  variant = 'large',
  title,
  hint,
  icon,
  busy = false,
  busyText = 'Reading...',
  disabled = false,
  style
}: {
  onFiles: (files: File[]) => void
  /** Like the file input's accept: ".xlsx,.xls" (extensions only) */
  accept?: string
  multiple?: boolean
  variant?: 'large' | 'bar' | 'chip'
  title?: ReactNode
  hint?: ReactNode
  icon?: ReactNode
  busy?: boolean
  busyText?: string
  disabled?: boolean
  style?: React.CSSProperties
}): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  // dragenter / dragleave also fire for the text inside the zone: count them
  const depth = useRef(0)
  const [over, setOver] = useState(false)
  const [note, setNote] = useState('')
  const off = busy || disabled

  const exts = (accept || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.startsWith('.'))
  const take = (list: File[]): void => {
    let files = exts.length
      ? list.filter((f) => exts.some((x) => f.name.toLowerCase().endsWith(x)))
      : list
    if (files.length < list.length) {
      setNote(`Only ${exts.join(' / ')} files${files.length ? '; the others were left out' : ''}`)
      setTimeout(() => setNote(''), 5000)
    } else setNote('')
    if (!multiple) files = files.slice(0, 1)
    if (files.length) onFiles(files)
  }
  const browse = (): void => {
    if (!off) inputRef.current?.click()
  }

  const defaultTitle = multiple ? 'Drop files here' : 'Drop a file here'
  const iconSize = variant === 'large' ? 48 : variant === 'bar' ? 18 : 12
  const shownIcon = busy ? (
    <Loader2 size={iconSize} className="spinner" />
  ) : (
    (icon ??
    (variant === 'chip' ? (
      <Paperclip size={iconSize} />
    ) : variant === 'bar' ? (
      <Inbox size={iconSize} />
    ) : (
      <Upload size={iconSize} />
    )))
  )

  return (
    <div
      role="button"
      tabIndex={off ? -1 : 0}
      aria-disabled={off || undefined}
      aria-label={typeof title === 'string' ? title : defaultTitle}
      className={`file-drop file-drop-${variant}${over ? ' over' : ''}${off ? ' off' : ''}`}
      style={style}
      onClick={browse}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          browse()
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault()
        depth.current++
        if (!off) setOver(true)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1)
        if (depth.current === 0) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        e.stopPropagation()
        depth.current = 0
        setOver(false)
        if (!off) take([...e.dataTransfer.files])
      }}
    >
      <span className="file-drop-icon">{shownIcon}</span>
      <span className="file-drop-text">
        <span className="file-drop-title">{busy ? busyText : (title ?? defaultTitle)}</span>
        {variant !== 'chip' && !busy && (
          <span className="file-drop-hint">
            {note ? (
              <span style={{ color: 'var(--danger)' }}>{note}</span>
            ) : (
              (hint ?? 'or click to browse')
            )}
          </span>
        )}
      </span>
      {variant === 'bar' && !busy && (
        // looks like a button; the whole strip is the button
        <span className="btn-secondary btn-sm file-drop-btn" aria-hidden>
          <Upload size={14} /> {multiple ? 'Choose files' : 'Choose file'}
        </span>
      )}
      {variant === 'chip' && note && (
        <span style={{ color: 'var(--danger)', fontSize: '0.72rem' }}>{note}</span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const list = [...(e.target.files || [])]
          e.target.value = ''
          if (list.length) take(list)
        }}
      />
    </div>
  )
}
