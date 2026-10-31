import { useState } from 'react'

/**
 * A document type's short code (COR, CLASS, KYC...), saved when the field is left. Linked files
 * are renamed with it: `BARON - COR - 2026-10-31.pdf`; empty = the type's name is used.
 */
export function DocTypeCodeInput({
  code,
  typeName,
  onSave
}: {
  code?: string | null
  typeName: string
  onSave: (code: string | null) => Promise<void>
}): React.JSX.Element {
  const [value, setValue] = useState(code || '')
  const [prevCode, setPrevCode] = useState(code)
  if (code !== prevCode) {
    setPrevCode(code)
    setValue(code || '')
  }
  const save = (): void => {
    const next = value.trim() || null
    if (next === (code || null)) return
    void onSave(next)
  }
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
      maxLength={20}
      placeholder="Name used"
      title={`Used in linked file names, e.g. BARON - ${value.trim() || typeName} - date`}
      aria-label={`File code for ${typeName}`}
      onClick={(e) => e.stopPropagation()}
      draggable={false}
      onDragStart={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
      style={{ width: '110px', fontFamily: 'monospace' }}
    />
  )
}
