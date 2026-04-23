import { useState, useEffect, useRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { QuotationPIAlternative } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'

export const ALT_COLORS = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']

/** Format a number with thousand separators */
export function fmtMoney(val: number | undefined | null): string {
    if (val == null || val === 0) return ''
    return val.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** Parse a formatted number string back to a number */
export function parseMoney(str: string): number | undefined {
    const cleaned = str.replace(/,/g, '')
    if (!cleaned) return undefined
    const n = parseFloat(cleaned)
    return isNaN(n) ? undefined : n
}

/** Number input that shows commas when not focused, raw number while editing */
export function MoneyInput({ value, placeholder, onChange, onBlur, style, className }: {
    value: number | undefined | null
    placeholder?: string
    onChange: (val: number | undefined) => void
    onBlur?: (val: number | undefined) => void
    style?: React.CSSProperties
    className?: string
}) {
    const [editing, setEditing] = useState(false)
    const [raw, setRaw] = useState('')
    const displayVal = editing ? raw : fmtMoney(value)
    return (
        <input
            type="text"
            className={className}
            value={displayVal}
            placeholder={placeholder}
            onFocus={() => { setEditing(true); setRaw(value != null && value !== 0 ? String(value) : '') }}
            onChange={e => { const v = e.target.value.replace(/[^0-9.,\-]/g, ''); setRaw(v); onChange(parseMoney(v)) }}
            onBlur={() => { setEditing(false); const parsed = parseMoney(raw); onBlur?.(parsed) }}
            style={style}
        />
    )
}

export function AlternativeScopeChips({ alternatives, currentAltId, onChangeAltId }: { alternatives: QuotationPIAlternative[]; currentAltId: string | null; onChangeAltId: (altId: string | null) => void }) {
    if (alternatives.length < 2) return null
    return (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
            <button
                onClick={() => onChangeAltId(null)}
                style={{
                    padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
                    border: !currentAltId ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                    background: !currentAltId ? 'rgba(0,170,200,0.12)' : 'transparent',
                    color: !currentAltId ? '#00aac8' : 'var(--text-secondary)',
                    cursor: 'pointer'
                }}
            >All</button>
            {alternatives.map((alt, idx) => {
                const color = ALT_COLORS[idx % ALT_COLORS.length]
                const active = currentAltId === alt.id
                return (
                    <button
                        key={alt.id}
                        onClick={() => onChangeAltId(alt.id)}
                        style={{
                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600,
                            border: active ? `1.5px solid ${color}` : '1px solid var(--input-border)',
                            background: active ? `${color}18` : 'transparent',
                            color: active ? color : 'var(--text-secondary)',
                            cursor: 'pointer'
                        }}
                    >{alt.label || `Alt ${idx + 1}`}</button>
                )
            })}
        </div>
    )
}

export function PickerDropdown({ placeholder, options, onSelect, fontSize = '0.85rem' }: { placeholder: string; options: { value: string; label: string }[]; onSelect: (value: string) => void; fontSize?: string }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const dropdownBg = isLight ? '#ffffff' : '#1a1d28'
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])
    return (
        <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
            <button
                onClick={() => setOpen(!open)}
                style={{ padding: '8px 12px', borderRadius: '8px', fontSize, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-secondary)', cursor: 'pointer', textAlign: 'left', minWidth: '200px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}
            >
                {placeholder}
                <ChevronDown size={14} style={{ opacity: 0.5, transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
            </button>
            {open && options.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 9999, marginTop: '4px', minWidth: '100%', maxWidth: '420px', maxHeight: '260px', overflowY: 'auto', borderRadius: '8px', border: `1px solid ${isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)'}`, background: dropdownBg, boxShadow: isLight ? '0 8px 24px rgba(0,0,0,0.12)' : '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {options.map(o => (
                        <div
                            key={o.value}
                            onClick={() => { onSelect(o.value); setOpen(false) }}
                            style={{ padding: '8px 14px', fontSize, cursor: 'pointer', color: isLight ? '#1c1e21' : '#e8e8e8', borderBottom: `1px solid ${isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'}`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            {o.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

export function fmtNiceDate(iso: string): string {
    if (!iso) return iso
    const [y, m, d] = iso.split('-').map(Number)
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    return `${months[m - 1]} ${d}, ${y}`
}
