import { useState } from 'react'
import { QuotationPIAlternative } from '../../../../shared/types'
import { ALT_COLORS, fmtMoney, parseMoney } from './sharedUtils'
import { Badge, Combobox } from '../ui'
import { isHiddenItem } from '../../utils/settingsItems'

/** Number input that shows commas when not focused, raw number while editing */
export function MoneyInput({
  value,
  placeholder,
  onChange,
  onBlur,
  style,
  className,
  showZero,
  disabled,
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
      title={title}
      aria-label={ariaLabel}
      inputMode="decimal"
      onFocus={() => {
        setEditing(true)
        setRaw(value != null && value !== 0 ? String(value) : zeroStr)
      }}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.,-]/g, '')
        setRaw(v)
        onChange(parseMoney(v))
      }}
      onBlur={() => {
        setEditing(false)
        const parsed = parseMoney(raw)
        onBlur?.(parsed)
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

/** Muted marker on a selected settings item that is hidden in settings (no longer offered) */
export function HiddenInSettingsBadge({
  item
}: {
  item: Parameters<typeof isHiddenItem>[0]
}): React.JSX.Element | null {
  if (!isHiddenItem(item)) return null
  return (
    <Badge
      tone="neutral"
      title="No longer offered for new quotations; kept here"
      style={{ fontSize: '0.66rem', opacity: 0.8, flexShrink: 0 }}
    >
      Hidden in settings
    </Badge>
  )
}

export function AlternativeScopeChips({
  alternatives,
  currentAltId,
  onChangeAltId
}: {
  alternatives: QuotationPIAlternative[]
  currentAltId: string | null
  onChangeAltId: (altId: string | null) => void
}): React.JSX.Element | null {
  if (alternatives.length < 2) return null
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
      <button
        onClick={() => onChangeAltId(null)}
        style={{
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '0.68rem',
          fontWeight: 600,
          border: !currentAltId
            ? '1.5px solid var(--accent-primary)'
            : '1px solid var(--input-border)',
          background: !currentAltId ? 'rgba(var(--accent-primary-rgb), 0.12)' : 'transparent',
          color: !currentAltId ? 'var(--accent-primary)' : 'var(--text-secondary)',
          cursor: 'pointer'
        }}
      >
        All
      </button>
      {alternatives.map((alt, idx) => {
        const color = ALT_COLORS[idx % ALT_COLORS.length]
        const active = currentAltId === alt.id
        return (
          <button
            key={alt.id}
            onClick={() => onChangeAltId(alt.id)}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.68rem',
              fontWeight: 600,
              border: active ? `1.5px solid ${color}` : '1px solid var(--input-border)',
              background: active ? `${color}18` : 'transparent',
              color: active ? color : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            {alt.label || `Alt ${idx + 1}`}
          </button>
        )
      })}
    </div>
  )
}

// Multi-select alternative scope: an item can apply to ALL alternatives (selectedAltIds === null) or to
// any SUBSET (e.g. Alt 2 + Alt 3). Clicking a specific alternative while "All" is active starts a fresh
// subset with just that one; deselecting down to none — or selecting every alternative — reverts to All.
export function AlternativeMultiScopeChips({
  alternatives,
  selectedAltIds,
  onChange
}: {
  alternatives: QuotationPIAlternative[]
  selectedAltIds: string[] | null
  onChange: (altIds: string[] | null) => void
}): React.JSX.Element | null {
  if (alternatives.length < 2) return null
  const allIds = alternatives.map((a) => a.id)
  const isAll = selectedAltIds === null
  const set = new Set(selectedAltIds || [])
  const toggleAlt = (altId: string): void => {
    if (isAll) {
      onChange([altId])
      return
    } // start a fresh subset from "All"
    const next = new Set(set)
    if (next.has(altId)) next.delete(altId)
    else next.add(altId)
    if (next.size === 0 || next.size === allIds.length) {
      onChange(null)
      return
    }
    onChange(allIds.filter((id) => next.has(id))) // preserve alternative order
  }
  const chip = (
    active: boolean,
    color: string,
    label: string,
    onClick: () => void,
    key?: string
  ): React.JSX.Element => (
    <button
      key={key}
      onClick={onClick}
      style={{
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.68rem',
        fontWeight: 600,
        border: active ? `1.5px solid ${color}` : '1px solid var(--input-border)',
        background: active
          ? color.startsWith('var(')
            ? 'var(--accent-tint)'
            : `${color}18`
          : 'transparent',
        color: active ? color : 'var(--text-secondary)',
        cursor: 'pointer'
      }}
    >
      {label}
    </button>
  )
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
      {chip(isAll, 'var(--accent-primary)', 'All', () => onChange(null))}
      {alternatives.map((alt, idx) =>
        chip(
          !isAll && set.has(alt.id),
          ALT_COLORS[idx % ALT_COLORS.length],
          alt.label || `Alt ${idx + 1}`,
          () => toggleAlt(alt.id),
          alt.id
        )
      )}
    </div>
  )
}

/** "Add from settings..." pick-list: type to search, Down / Up / Enter, then the field clears */
export function PickerDropdown({
  placeholder,
  options,
  onSelect,
  fontSize = '0.85rem'
}: {
  placeholder: string
  options: { value: string; label: string }[]
  onSelect: (value: string) => void
  fontSize?: string
}): React.JSX.Element {
  return (
    <Combobox
      aria-label={placeholder}
      placeholder={placeholder}
      options={options}
      getKey={(o) => o.value}
      getLabel={(o) => o.label}
      onSelect={(o) => onSelect(o.value)}
      clearOnSelect
      emptyText={options.length ? 'No matches' : 'Nothing left to add'}
      listMinWidth={260}
      style={{ display: 'inline-block', minWidth: '200px' }}
      inputStyle={{ fontSize }}
    />
  )
}
