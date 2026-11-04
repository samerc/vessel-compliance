import { useState } from 'react'
import { fmtMoney, parseMoney } from './money'

/**
 * The amount field used everywhere: shows "1,250,000" when not focused and the plain number while
 * editing. Accepts pasted amounts with commas or a currency code, and "250k" / "2.5m".
 *
 *   <MoneyInput value={premium} onChange={setPremium} onBlur={save} aria-label="Premium" />
 */
export function MoneyInput({
  value,
  placeholder,
  onChange,
  onBlur,
  style,
  className,
  showZero,
  disabled,
  readOnly,
  title,
  'aria-label': ariaLabel
}: {
  value: number | undefined | null
  placeholder?: string
  onChange: (val: number | undefined) => void
  onBlur?: (val: number | undefined) => void
  style?: React.CSSProperties
  className?: string
  /** Render a stored 0 as a visible "0" instead of blank — lets a pinned zero be told apart
   *  from an empty field (which falls back to a default amount). */
  showZero?: boolean
  disabled?: boolean
  readOnly?: boolean
  title?: string
  'aria-label'?: string
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [raw, setRaw] = useState('')
  const zeroStr = showZero && value === 0 ? '0' : ''
  const displayVal = editing ? raw : fmtMoney(value) || zeroStr
  return (
    <input
      type="text"
      className={className}
      value={displayVal}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      title={title}
      aria-label={ariaLabel}
      inputMode="decimal"
      autoComplete="off"
      onFocus={() => {
        if (readOnly) return
        setEditing(true)
        setRaw(value != null && value !== 0 ? String(value) : zeroStr)
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.,\-kKmM\s]/g, '')
        setRaw(v)
        onChange(parseMoney(v))
      }}
      onBlur={() => {
        if (!editing) return
        setEditing(false)
        onBlur?.(parseMoney(raw))
      }}
      style={style}
    />
  )
}

/** MoneyInput for fields kept as strings in state (calculators, draft forms) */
export function StrMoneyInput({
  value,
  onChange,
  ...rest
}: Omit<React.ComponentProps<typeof MoneyInput>, 'value' | 'onChange' | 'onBlur' | 'showZero'> & {
  value: string | number | undefined | null
  onChange: (val: string) => void
}): React.JSX.Element {
  const n = value === '' || value == null ? undefined : parseMoney(String(value))
  return (
    <MoneyInput
      {...rest}
      value={n}
      showZero
      onChange={(v) => onChange(v != null ? String(v) : '')}
    />
  )
}
