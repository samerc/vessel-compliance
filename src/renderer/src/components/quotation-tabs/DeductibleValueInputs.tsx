import { useState } from 'react'
import { MoneyInput } from './shared'
import {
  deductiblePlaceholders,
  placeholderKind,
  placeholderLabel,
  type DeductibleValues
} from '../../../../shared/deductibleValues'

type Values = Record<string, string | number | null>

/**
 * One input per placeholder of a text deductible's wording ({percent}, {minimum}, {maximum} or
 * any {name}). {currency} has no input: it is the quotation's currency. Saves on leaving a field.
 * Renders nothing for a plain wording.
 */
export default function DeductibleValueInputs({
  text,
  values,
  onCommit,
  disabled
}: {
  text: string
  values: DeductibleValues | null | undefined
  onCommit: (values: Values) => void
  disabled?: boolean
}): React.JSX.Element | null {
  const [local, setLocal] = useState<Values>(() => ({ ...((values as Values) || {}) }))
  const names = deductiblePlaceholders(text).filter((n) => placeholderKind(n) !== 'currency')
  if (names.length === 0) return null

  const commit = (next: Values): void => {
    setLocal(next)
    onCommit(next)
  }
  const inputStyle: React.CSSProperties = { fontSize: '0.8rem', padding: '3px 6px' }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px 14px',
        marginTop: '6px'
      }}
    >
      {names.map((name) => {
        const kind = placeholderKind(name)
        const v = local[name]
        return (
          <label
            key={name}
            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.78rem' }}
          >
            <span style={{ color: 'var(--text-secondary)' }}>{placeholderLabel(name)}</span>
            {kind === 'amount' ? (
              <MoneyInput
                value={typeof v === 'number' ? v : v ? Number(v) : null}
                onChange={(n) => setLocal((p) => ({ ...p, [name]: n ?? null }))}
                onBlur={(n) => commit({ ...local, [name]: n ?? null })}
                disabled={disabled}
                aria-label={placeholderLabel(name)}
                style={{ ...inputStyle, width: '110px', textAlign: 'right' }}
              />
            ) : (
              <>
                <input
                  type="text"
                  value={v == null ? '' : String(v)}
                  inputMode={kind === 'percent' ? 'decimal' : undefined}
                  disabled={disabled}
                  aria-label={placeholderLabel(name)}
                  onChange={(e) => {
                    const raw =
                      kind === 'percent'
                        ? e.target.value.replace(/[^0-9.]/g, '')
                        : e.target.value.toUpperCase()
                    setLocal((p) => ({ ...p, [name]: raw }))
                  }}
                  onBlur={(e) => {
                    const raw = e.target.value.trim()
                    commit({
                      ...local,
                      [name]: raw === '' ? null : kind === 'percent' ? Number(raw) : raw
                    })
                  }}
                  style={{
                    ...inputStyle,
                    width: kind === 'percent' ? '55px' : '60px',
                    textAlign: 'center'
                  }}
                />
                {kind === 'percent' && <span>%</span>}
              </>
            )}
          </label>
        )
      })}
    </div>
  )
}
