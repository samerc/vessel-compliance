import { ReactNode } from 'react'

export interface TabItem<K extends string> {
  key: K
  label: ReactNode
  icon?: ReactNode
  count?: number
  hidden?: boolean
}

interface TabsProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** Extra content at the right end of the tab row */
  trailing?: ReactNode
  style?: React.CSSProperties
}

/** Underline tabs for switching views within a page */
export function Tabs<K extends string>({
  items,
  value,
  onChange,
  trailing,
  style
}: TabsProps<K>): React.JSX.Element {
  return (
    <div className="tabs" role="tablist" style={style}>
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <button
            key={i.key}
            role="tab"
            aria-selected={value === i.key}
            className={`tab${value === i.key ? ' active' : ''}`}
            onClick={() => onChange(i.key)}
          >
            {i.icon}
            {i.label}
            {i.count !== undefined && <span className="tab-count">{i.count}</span>}
          </button>
        ))}
      {trailing && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {trailing}
        </div>
      )}
    </div>
  )
}

interface SegmentedProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
}

/** Compact pill switcher (e.g. List / Settings in a page header) */
export function SegmentedControl<K extends string>({
  items,
  value,
  onChange
}: SegmentedProps<K>): React.JSX.Element {
  return (
    <div className="segmented" role="tablist">
      {items
        .filter((i) => !i.hidden)
        .map((i) => (
          <button
            key={i.key}
            role="tab"
            aria-selected={value === i.key}
            className={value === i.key ? 'active' : ''}
            onClick={() => onChange(i.key)}
          >
            {i.icon}
            {i.label}
          </button>
        ))}
    </div>
  )
}
