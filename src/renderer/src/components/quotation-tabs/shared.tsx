import { QuotationPIAlternative } from '../../../../shared/types'
import { ALT_COLORS } from './sharedUtils'
import { Badge, Combobox } from '../ui'
import { isHiddenItem } from '../../utils/settingsItems'

export { MoneyInput, StrMoneyInput } from '../ui'

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
