import { useState, useEffect, useCallback } from 'react'
import { formatNumberWithCommas, parseFormattedNumber } from '../utils/numberFormat'

interface Props {
  value: number | string | null | undefined
  onChange: (value: number | null) => void
  placeholder?: string
  style?: React.CSSProperties
  disabled?: boolean
  min?: number
  max?: number
  decimals?: number
  className?: string
}

/**
 * Number input with automatic thousand separator formatting.
 * Displays formatted value while editing, stores raw number.
 */
export default function NumberInput({
  value,
  onChange,
  placeholder,
  style,
  disabled,
  min,
  max,
  decimals,
  className,
}: Props) {
  const [display, setDisplay] = useState('')
  const [focused, setFocused] = useState(false)

  // Sync display from prop when not focused
  useEffect(() => {
    if (!focused) {
      if (value == null || value === '') {
        setDisplay('')
      } else {
        const num = typeof value === 'string' ? parseFloat(value) : value
        if (!isNaN(num)) {
          const formatted = decimals !== undefined
            ? num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
            : num.toLocaleString('en-US')
          setDisplay(formatted)
        } else {
          setDisplay('')
        }
      }
    }
  }, [value, focused, decimals])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    const { display: formatted, raw: cleanRaw } = formatNumberWithCommas(raw)
    setDisplay(formatted)

    if (cleanRaw === '' || cleanRaw === '-') {
      onChange(null)
    } else {
      const num = parseFloat(cleanRaw)
      if (!isNaN(num)) {
        if (min !== undefined && num < min) return
        if (max !== undefined && num > max) return
        onChange(num)
      }
    }
  }, [onChange, min, max])

  const handleFocus = useCallback(() => setFocused(true), [])

  const handleBlur = useCallback(() => {
    setFocused(false)
    // Reformat on blur
    const clean = parseFormattedNumber(display)
    if (clean === '' || clean === '-') {
      setDisplay('')
      onChange(null)
      return
    }
    const num = parseFloat(clean)
    if (!isNaN(num)) {
      const formatted = decimals !== undefined
        ? num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : num.toLocaleString('en-US')
      setDisplay(formatted)
      onChange(num)
    }
  }, [display, onChange, decimals])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      style={style}
    />
  )
}
