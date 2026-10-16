import React from 'react'
import { useToast } from '../contexts/ToastContext'

// Where a missing document file was expected: the file name in full (to search for it) and the
// folder below it, both wrapping instead of being cut off. Click either part to copy it.
export default function MissingFilePath({
  filePath,
  style
}: {
  filePath: string
  style?: React.CSSProperties
}): React.JSX.Element {
  const { showSuccess } = useToast()
  const cut = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'))
  const name = cut >= 0 ? filePath.slice(cut + 1) : filePath
  const folder = cut >= 0 ? filePath.slice(0, cut) : ''
  const copy = (e: React.MouseEvent, text: string, what: string): void => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    showSuccess(`${what} copied`)
  }
  const part: React.CSSProperties = {
    display: 'block',
    cursor: 'copy',
    whiteSpace: 'normal',
    wordBreak: 'break-all'
  }
  return (
    <span
      style={{ display: 'block', marginTop: '3px', color: 'var(--danger)', ...style }}
      onClick={(e) => e.stopPropagation()}
    >
      <span
        title="Click to copy the file name"
        onClick={(e) => copy(e, name, 'File name')}
        style={{ ...part, fontSize: '0.74rem', fontWeight: 600 }}
      >
        {name}
      </span>
      {folder && (
        <span
          title="Click to copy the folder"
          onClick={(e) => copy(e, folder, 'Folder')}
          style={{ ...part, fontSize: '0.68rem', fontFamily: 'monospace', opacity: 0.8 }}
        >
          {folder}
        </span>
      )}
    </span>
  )
}
