import { useState, useCallback } from 'react'
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
  className
}: Props): React.JSX.Element {
  const [display, setDisplay] = useState('')
  const [focused, setFocused] = useState(false)

  // While not focused the input shows the formatted prop value; while focused it shows what
  // the user is typing.
  const formatValue = (): string => {
    if (value == null || value === '') return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''
    return decimals !== undefined
      ? num.toLocaleString('en-US', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })
      : num.toLocaleString('en-US')
  }
  const shown = focused ? display : formatValue()

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
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
    },
    [onChange, min, max]
  )

  const handleFocus = (): void => {
    setDisplay(formatValue())
    setFocused(true)
  }

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
      const formatted =
        decimals !== undefined
          ? num.toLocaleString('en-US', {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals
            })
          : num.toLocaleString('en-US')
      setDisplay(formatted)
      onChange(num)
    }
  }, [display, onChange, decimals])

  return (
    <input
      type="text"
      inputMode="decimal"
      value={shown}
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
