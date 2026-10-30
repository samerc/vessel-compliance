import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftRight, CheckCircle, Copy, RotateCcw } from 'lucide-react'
import { Field } from './ui'
import { formatDate } from '../utils/dateUtils'
import {
  findSeaRoute,
  loadSeaRoutes,
  PASSAGE_LABELS,
  searchPorts,
  type Passage,
  type SeaPort
} from '../utils/seaRoute'

const DEFAULT_SPEED_KN = 10

type Graph = Awaited<ReturnType<typeof loadSeaRoutes>>

const portLabel = (p: SeaPort): string => `${p.name}, ${p.country} (${p.code})`

function PortPicker({
  label,
  ports,
  value,
  onChange
}: {
  label: string
  ports: SeaPort[]
  value: SeaPort | null
  onChange: (p: SeaPort | null) => void
}): React.JSX.Element {
  // What is being typed; once a port is picked the input shows the port instead
  const [typed, setTyped] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)
  const text = value ? portLabel(value) : typed

  useEffect(() => {
    if (open) listRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open])

  const matches = useMemo(() => (value ? [] : searchPorts(ports, typed)), [ports, typed, value])

  const pick = (p: SeaPort): void => {
    onChange(p)
    setTyped('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        value={text}
        onChange={(e) => {
          setTyped(e.target.value)
          if (value) onChange(null)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={(e) => {
          e.target.select()
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setHighlight((h) => Math.min(h + 1, matches.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setHighlight((h) => Math.max(h - 1, 0))
          } else if (e.key === 'Enter' && open && matches[highlight]) {
            e.preventDefault()
            pick(matches[highlight])
          } else if (e.key === 'Escape' && open) {
            e.stopPropagation()
            setOpen(false)
          }
        }}
        placeholder="Port name, country or UN/LOCODE"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={open}
        disabled={ports.length === 0}
        style={{ width: '100%' }}
      />
      {open && text.trim() && !value && (
        <div
          ref={listRef}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: '2px',
            maxHeight: '240px',
            overflowY: 'auto',
            background: 'var(--bg-primary)',
            border: '1px solid var(--input-border)',
            borderRadius: '8px',
            zIndex: 100,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}
        >
          {matches.length === 0 && (
            <div
              style={{ padding: '8px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}
            >
              No port matches. Try another spelling, the country or the 5-letter UN/LOCODE.
            </div>
          )}
          {matches.map((p, i) => (
            <div
              key={p.code}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={() => pick(p)}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                borderBottom: '1px solid var(--table-border)',
                background:
                  i === highlight ? 'rgba(var(--accent-primary-rgb), 0.08)' : 'transparent'
              }}
            >
              {p.name}
              <span
                style={{ color: 'var(--text-secondary)', marginLeft: '6px', fontSize: '0.8rem' }}
              >
                {p.country} · {p.code}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SeaTransitCalculator(): React.JSX.Element {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [from, setFrom] = useState<SeaPort | null>(null)
  const [to, setTo] = useState<SeaPort | null>(null)
  const [speed, setSpeed] = useState(String(DEFAULT_SPEED_KN))
  const [departure, setDeparture] = useState('')
  const [avoid, setAvoid] = useState<Passage[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    loadSeaRoutes()
      .then(setGraph)
      .catch(() => setLoadError(true))
  }, [])

  const speedKn = parseFloat(speed) > 0 ? parseFloat(speed) : DEFAULT_SPEED_KN

  const route = useMemo(() => {
    if (!graph || !from || !to || from.code === to.code) return undefined
    // The Northwest Passage is never a normal trading route
    return findSeaRoute(graph, from, to, ['northwest', ...avoid])
  }, [graph, from, to, avoid])

  const transit = useMemo(() => {
    if (!route) return null
    const hours = route.distanceNm / speedKn
    const days = hours / 24
    let eta: Date | null = null
    if (departure) {
      const [y, m, d] = departure.split('-').map(Number)
      eta = new Date(y, m - 1, d)
      eta.setTime(eta.getTime() + hours * 3600_000)
    }
    return { hours, days, eta }
  }, [route, speedKn, departure])

  const fmtDays = (hours: number): string => {
    const whole = Math.floor(hours / 24)
    const rest = Math.round(hours - whole * 24)
    return rest === 24 ? `${whole + 1} days 0 hours` : `${whole} days ${rest} hours`
  }

  const toggleAvoid = (p: Passage[], on: boolean): void =>
    setAvoid((cur) => (on ? [...new Set([...cur, ...p])] : cur.filter((x) => !p.includes(x))))

  const viaText = (r: { passages: Passage[] }): string =>
    r.passages.length ? r.passages.map((p) => PASSAGE_LABELS[p]).join(', ') : 'Direct'

  const copyResult = (): void => {
    if (!from || !to || !route || !transit) return
    const text = [
      `From: ${portLabel(from)}`,
      `To: ${portLabel(to)}`,
      `Via: ${viaText(route)}`,
      `Distance: ${route.distanceNm.toLocaleString('en-US')} nm`,
      `Speed: ${speedKn} knots`,
      `Days at sea: ${transit.days.toFixed(1)} (${fmtDays(transit.hours)})`,
      ...(transit.eta
        ? [`Departure ${formatDate(departure)}, estimated arrival ${formatDate(transit.eta)}`]
        : [])
    ].join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  const reset = (): void => {
    setFrom(null)
    setTo(null)
    setSpeed(String(DEFAULT_SPEED_KN))
    setDeparture('')
    setAvoid([])
  }

  const cardStyle = {
    padding: '16px 20px',
    borderRadius: '12px',
    background: 'var(--accent-tint)',
    border: '1px solid var(--accent-border)'
  }
  const cardLabel = { fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }

  const avoidOptions: { label: string; passages: Passage[] }[] = [
    { label: 'Avoid Suez Canal', passages: ['suez'] },
    { label: 'Avoid Red Sea (Bab-el-Mandeb)', passages: ['babalmandab'] },
    { label: 'Avoid Panama Canal', passages: ['panama'] }
  ]

  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      <div
        style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}
      >
        <button
          className="btn-secondary"
          onClick={reset}
          disabled={
            !from && !to && !departure && !avoid.length && speed === String(DEFAULT_SPEED_KN)
          }
        >
          <RotateCcw size={14} /> Reset
        </button>
        <button className="btn-primary" onClick={copyResult} disabled={!transit}>
          {copied ? <CheckCircle size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      {loadError && (
        <p style={{ color: 'var(--danger)', marginTop: 0 }}>
          The port list could not be loaded. Restart the app and try again.
        </p>
      )}

      <div className="form-grid" style={{ marginBottom: '28px' }}>
        <Field label="From port">
          <PortPicker
            label="From port"
            ports={graph?.ports ?? []}
            value={from}
            onChange={setFrom}
          />
        </Field>
        <Field label="To port">
          <div style={{ display: 'flex', gap: '6px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <PortPicker label="To port" ports={graph?.ports ?? []} value={to} onChange={setTo} />
            </div>
            <button
              type="button"
              className="btn-secondary"
              title="Swap the ports"
              aria-label="Swap the ports"
              disabled={!from && !to}
              onClick={() => {
                setFrom(to)
                setTo(from)
              }}
            >
              <ArrowLeftRight size={14} />
            </button>
          </div>
        </Field>
        <Field label="Speed (knots)" hint={`Left empty, ${DEFAULT_SPEED_KN} knots is used`}>
          <input
            type="number"
            min="1"
            step="0.5"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            placeholder={String(DEFAULT_SPEED_KN)}
            aria-label="Speed in knots"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Departure date" hint="Optional: gives the estimated arrival date">
          <input
            type="date"
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
            aria-label="Departure date"
            style={{ width: '100%' }}
          />
        </Field>
        <Field label="Route" span={2}>
          <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
            {avoidOptions.map((o) => (
              <label key={o.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="checkbox"
                  checked={o.passages.every((p) => avoid.includes(p))}
                  onChange={(e) => toggleAvoid(o.passages, e.target.checked)}
                />
                {o.label}
              </label>
            ))}
          </div>
        </Field>
      </div>

      {from && to && from.code === to.code && (
        <p style={{ color: 'var(--text-secondary)' }}>Pick two different ports.</p>
      )}
      {route === null && (
        <p style={{ color: 'var(--danger)' }}>
          No sea route between these ports avoids the passages ticked. Untick one to see a route.
        </p>
      )}

      {route && transit && (
        <div className="fade-in">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '16px'
            }}
          >
            <div style={cardStyle}>
              <div style={cardLabel}>Days at sea</div>
              <div
                style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--accent-primary)' }}
              >
                {transit.days.toFixed(1)}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {fmtDays(transit.hours)} at {speedKn} knots
              </div>
            </div>
            <div style={cardStyle}>
              <div style={cardLabel}>Distance</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>
                {route.distanceNm.toLocaleString('en-US')} nm
              </div>
            </div>
            {transit.eta && (
              <div style={cardStyle}>
                <div style={cardLabel}>Estimated arrival</div>
                <div
                  style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}
                >
                  {formatDate(transit.eta)}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Leaving {formatDate(departure)}
                </div>
              </div>
            )}
          </div>
          <p style={{ margin: '0 0 8px' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Via: </span>
            {viaText(route)}
          </p>
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            An estimate: the distance follows standard sea lanes and is usually within about 5% of
            the published port distance tables. Time in port, canal waiting and weather are not
            included.
          </p>
        </div>
      )}
    </div>
  )
}
