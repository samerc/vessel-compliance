import { useState, useEffect, useMemo } from 'react'
import {
  Ship, Globe, Anchor, Calendar, TrendingUp,
  RefreshCw, Loader2, BarChart2, Shield,
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'

const currentYear = new Date().getFullYear()

// ── helpers ───────────────────────────────────────────────────────────────────

function bucket(val: number | undefined | null, ranges: { label: string; min: number; max: number }[]): string {
  if (!val) return 'Unknown'
  const b = ranges.find(r => val >= r.min && val < r.max)
  return b ? b.label : `${ranges[ranges.length - 1].label}+`
}

const AGE_RANGES = [
  { label: '< 5 yr', min: currentYear - 4, max: currentYear + 1 },
  { label: '5–10 yr', min: currentYear - 9, max: currentYear - 4 },
  { label: '10–20 yr', min: currentYear - 19, max: currentYear - 9 },
  { label: '20–30 yr', min: currentYear - 29, max: currentYear - 19 },
  { label: '30+ yr', min: 0, max: currentYear - 29 },
]

const GT_RANGES = [
  { label: '< 1k', min: 0, max: 1000 },
  { label: '1k–5k', min: 1000, max: 5000 },
  { label: '5k–15k', min: 5000, max: 15000 },
  { label: '15k–50k', min: 15000, max: 50000 },
  { label: '50k+', min: 50000, max: Infinity },
]

function ageBucket(builtYear?: number | null): string {
  if (!builtYear) return 'Unknown'
  const age = currentYear - builtYear
  if (age < 5) return '< 5 yr'
  if (age < 10) return '5–10 yr'
  if (age < 20) return '10–20 yr'
  if (age < 30) return '20–30 yr'
  return '30+ yr'
}

function gtBucket(gt?: number | null): string {
  if (!gt) return 'Unknown'
  return bucket(gt, GT_RANGES)
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return map
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ icon, gradient, label, value, sub }: {
  icon: React.ReactNode
  gradient: string
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '14px',
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px' }}>
          {label}
        </div>
        <div style={{ fontSize: '1.75rem', fontWeight: '800', lineHeight: 1, letterSpacing: '-0.03em' }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bar row ───────────────────────────────────────────────────────────────────

function BarRow({ label, count, total, max, color, prefix }: {
  label: string
  count: number
  total: number
  max: number
  color: string
  prefix?: React.ReactNode
}) {
  const widthPct = max > 0 ? (count / max) * 100 : 0
  const pctOfTotal = total > 0 ? Math.round((count / total) * 100) : 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
      {prefix && (
        <div style={{ width: '22px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {prefix}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '5px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexShrink: 0, marginLeft: '10px' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {pctOfTotal}%
            </span>
            <span style={{ fontSize: '0.84rem', fontWeight: '700', color, fontVariantNumeric: 'tabular-nums', minWidth: '20px', textAlign: 'right' }}>
              {count}
            </span>
          </div>
        </div>
        <div style={{ height: '8px', background: 'var(--table-border)', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${widthPct}%`,
            background: color,
            borderRadius: '4px',
            transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)',
          }} />
        </div>
      </div>
    </div>
  )
}

// ── Histogram (vertical column bars for ordinal data) ─────────────────────────

function Histogram({ data, color, total }: {
  data: { label: string; count: number }[]
  color: string
  total: number
}) {
  const known = data.filter(d => d.label !== 'Unknown')
  const unknownCount = data.find(d => d.label === 'Unknown')?.count ?? 0
  const maxCount = Math.max(...known.map(d => d.count), 1)
  const CHART_H = 80

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end', height: `${CHART_H + 38}px` }}>
        {known.map(({ label, count }) => {
          const barH = count > 0 ? Math.max(Math.round((count / maxCount) * CHART_H), 6) : 0
          const pct = total > 0 ? Math.round((count / total) * 100) : 0
          return (
            <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
              <div style={{ height: '38px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: '5px' }}>
                {count > 0 && (
                  <>
                    <span style={{ fontSize: '0.78rem', fontWeight: '700', color, lineHeight: 1 }}>{count}</span>
                    <span style={{ fontSize: '0.63rem', color: 'var(--text-secondary)', lineHeight: 1, marginTop: '2px' }}>{pct}%</span>
                  </>
                )}
              </div>
              <div style={{
                width: '100%',
                height: barH > 0 ? `${barH}px` : '2px',
                background: barH > 0 ? color : 'var(--table-border)',
                borderRadius: '4px 4px 0 0',
                opacity: count === 0 ? 0.3 : 1,
                transition: 'height 0.7s cubic-bezier(0.4,0,0.2,1)',
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '6px', borderTop: '2px solid var(--table-border)', paddingTop: '7px' }}>
        {known.map(({ label }) => (
          <div key={label} style={{ flex: 1, textAlign: 'center', fontSize: '0.67rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
            {label}
          </div>
        ))}
      </div>
      {unknownCount > 0 && (
        <div style={{ marginTop: '10px', fontSize: '0.73rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          + {unknownCount} vessel{unknownCount !== 1 ? 's' : ''} with no data
        </div>
      )}
    </div>
  )
}

// ── Chart section card ────────────────────────────────────────────────────────

function ChartCard({ title, icon, accentColor, count, children }: {
  title: string
  icon: React.ReactNode
  accentColor: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div className="glass-card" style={{ padding: '20px 22px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--table-border)',
      }}>
        <h3 style={{
          margin: 0, fontSize: '0.8rem', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '7px',
        }}>
          <span style={{ color: accentColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
          {title}
        </h3>
        {count !== undefined && (
          <span style={{
            fontSize: '0.74rem', fontWeight: '700',
            color: 'var(--text-secondary)',
            background: 'var(--table-header-bg)',
            padding: '2px 9px', borderRadius: '10px',
            border: '1px solid var(--table-border)',
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── OFAC status row ───────────────────────────────────────────────────────────

const OFAC_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  'CLEARED':         { bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.35)', text: '#10b981' },
  'POTENTIAL MATCH': { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b' },
  'MATCH':           { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',  text: '#ef4444' },
  'SANCTIONED':      { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',  text: '#ef4444' },
  'ERROR':           { bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',  text: '#ef4444' },
  'PENDING':         { bg: 'rgba(128,128,128,0.1)',  border: 'rgba(128,128,128,0.2)', text: '#888888' },
}

function OfacRow({ label, count, total, barColor }: {
  label: string
  count: number
  total: number
  barColor: string
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  const s = OFAC_STYLE[label] ?? OFAC_STYLE['PENDING']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
      <span style={{
        padding: '3px 10px', borderRadius: '20px', fontSize: '0.7rem', fontWeight: '700',
        background: s.bg, border: `1px solid ${s.border}`, color: s.text,
        whiteSpace: 'nowrap', flexShrink: 0, minWidth: '128px', textAlign: 'center',
        letterSpacing: '0.02em',
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: '8px', background: 'var(--table-border)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: '4px', transition: 'width 0.7s cubic-bezier(0.4,0,0.2,1)' }} />
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'baseline', flexShrink: 0, minWidth: '52px', justifyContent: 'flex-end' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
        <span style={{ fontSize: '0.84rem', fontWeight: '700', color: s.text, fontVariantNumeric: 'tabular-nums', minWidth: '18px', textAlign: 'right' }}>{count}</span>
      </div>
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FleetAnalytics() {
  useTheme()

  const [vessels, setVessels] = useState<any[]>([])
  const [flagStates, setFlagStates] = useState<any[]>([])
  const [fleets, setFleets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [activeOnly, setActiveOnly] = useState(true)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [v, fs, fl] = await Promise.all([
        window.api.getVessels(),
        window.api.getFlagStates(),
        window.api.getFleets(),
      ])
      setVessels(Array.isArray(v) ? v : [])
      setFlagStates(Array.isArray(fs) ? fs : [])
      setFleets(Array.isArray(fl) ? fl : [])
      setLastRefreshed(new Date())
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── derived data ─────────────────────────────────────────────────────────────
  const pool = useMemo(() => activeOnly ? vessels.filter(v => v.isActive) : vessels, [vessels, activeOnly])

  const flagMap = useMemo(() => new Map(flagStates.map(f => [f.id, f])), [flagStates])
  const fleetMap = useMemo(() => new Map(fleets.map(f => [f.id, f.name])), [fleets])

  const kpis = useMemo(() => {
    const withAge = pool.filter(v => v.builtYear)
    const avgAge = withAge.length > 0
      ? Math.round(withAge.reduce((s, v) => s + (currentYear - v.builtYear), 0) / withAge.length)
      : null
    const withTonnage = pool.filter(v => v.grossTonnage)
    const avgTonnage = withTonnage.length > 0
      ? Math.round(withTonnage.reduce((s, v) => s + Number(v.grossTonnage), 0) / withTonnage.length)
      : null
    const flags = new Set(pool.filter(v => v.flagStateId).map(v => v.flagStateId)).size
    const types = new Set(pool.filter(v => v.vesselType).map(v => v.vesselType)).size
    return { total: pool.length, flags, types, avgAge, avgTonnage }
  }, [pool])

  const byFlag = useMemo(() => {
    const grouped = groupBy(pool, v => {
      const fs = flagMap.get(v.flagStateId)
      return fs?.name ?? '(Unassigned)'
    })
    return Array.from(grouped.entries())
      .map(([name, items]) => {
        const fs = flagStates.find(f => f.name === name)
        return { name, count: items.length, iso3: fs?.iso3Code ?? '' }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 12)
  }, [pool, flagMap, flagStates])

  const byType = useMemo(() => {
    const grouped = groupBy(pool, v => v.vesselType || '(Unknown)')
    return Array.from(grouped.entries())
      .map(([name, items]) => ({ name, count: items.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [pool])

  const byClass = useMemo(() => {
    const grouped = groupBy(pool, v => v.classificationSociety || '(None)')
    return Array.from(grouped.entries())
      .map(([name, items]) => ({ name, count: items.length }))
      .sort((a, b) => b.count - a.count)
  }, [pool])

  const byFleet = useMemo(() => {
    const grouped = groupBy(pool, v => fleetMap.get(v.fleetId) ?? '(Unassigned)')
    return Array.from(grouped.entries())
      .map(([name, items]) => ({ name, count: items.length }))
      .sort((a, b) => b.count - a.count)
  }, [pool, fleetMap])

  const byAge = useMemo(() => {
    const order = AGE_RANGES.map(r => r.label)
    const grouped = groupBy(pool, v => ageBucket(v.builtYear))
    return order
      .map(label => ({ label, count: grouped.get(label)?.length ?? 0 }))
      .concat(grouped.has('Unknown') ? [{ label: 'Unknown', count: grouped.get('Unknown')!.length }] : [])
  }, [pool])

  const byTonnage = useMemo(() => {
    const order = GT_RANGES.map(r => r.label)
    const grouped = groupBy(pool, v => gtBucket(v.grossTonnage))
    return order
      .map(label => ({ label, count: grouped.get(label)?.length ?? 0 }))
      .concat(grouped.has('Unknown') ? [{ label: 'Unknown', count: grouped.get('Unknown')!.length }] : [])
  }, [pool])

  const byCustomerType = useMemo(() => {
    const broker = pool.filter(v => v.customerType === 'broker').length
    const direct = pool.filter(v => v.customerType === 'direct').length
    const unassigned = pool.filter(v => !v.customerType).length
    return [
      { label: 'Broker', count: broker },
      { label: 'Direct', count: direct },
      { label: 'Unassigned', count: unassigned },
    ].filter(x => x.count > 0)
  }, [pool])

  const byOfac = useMemo(() => {
    const groups = groupBy(pool, v => v.ofacStatus || 'PENDING')
    const order = ['CLEARED', 'POTENTIAL_MATCH', 'MATCH', 'SANCTIONED', 'ERROR', 'PENDING']
    return order.map(status => ({
      label: status.replace(/_/g, ' '),
      count: groups.get(status)?.length ?? 0,
      color: status === 'CLEARED' ? '#10b981'
        : status === 'PENDING' ? '#888888'
        : status === 'POTENTIAL_MATCH' ? '#f59e0b'
        : '#ef4444',
    })).filter(x => x.count > 0)
  }, [pool])

  // ── color palette ─────────────────────────────────────────────────────────────
  const BLUE    = '#0ea5e9'
  const PURPLE  = '#8b5cf6'
  const GREEN   = '#10b981'
  const AMBER   = '#f59e0b'
  const PINK    = '#ec4899'
  const TEAL    = '#14b8a6'
  const INDIGO  = '#6366f1'

  const G = {
    blue:   'linear-gradient(135deg, #0ea5e9, #2563eb)',
    purple: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    green:  'linear-gradient(135deg, #10b981, #059669)',
    amber:  'linear-gradient(135deg, #f59e0b, #d97706)',
    pink:   'linear-gradient(135deg, #ec4899, #be185d)',
  }

  const maxFlag     = byFlag[0]?.count ?? 1
  const maxType     = byType[0]?.count ?? 1
  const maxClass    = byClass[0]?.count ?? 1
  const maxFleet    = byFleet[0]?.count ?? 1
  const maxCustomer = Math.max(...byCustomerType.map(b => b.count), 1)

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>Fleet Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
            Statistical breakdown of your vessel portfolio.
            {lastRefreshed && (
              <span style={{ marginLeft: '8px', opacity: 0.6 }}>
                Updated {lastRefreshed.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setActiveOnly(v => !v)}
            className={activeOnly ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '8px 16px', fontSize: '0.84rem' }}
          >
            {activeOnly ? 'Active Vessels Only' : 'All Vessels'}
          </button>
          <button
            onClick={loadData}
            className="btn-secondary"
            style={{ padding: '8px 10px' }}
            title="Refresh data"
            disabled={loading}
          >
            {loading ? <Loader2 size={16} className="spinner" /> : <RefreshCw size={16} />}
          </button>
        </div>
      </header>

      {loading && vessels.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)' }}>
          <Loader2 size={28} className="spinner" />
        </div>
      ) : (
        <>
          {/* ── KPI Row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '20px' }}>
            <KPI
              icon={<Ship size={20} color="#fff" />}
              gradient={G.blue}
              label="Vessels"
              value={kpis.total}
              sub={activeOnly ? 'active only' : 'total in fleet'}
            />
            <KPI
              icon={<Globe size={20} color="#fff" />}
              gradient={G.purple}
              label="Flags in Use"
              value={kpis.flags}
              sub={`${Math.round((kpis.flags / Math.max(flagStates.length, 1)) * 100)}% of registry`}
            />
            <KPI
              icon={<Anchor size={20} color="#fff" />}
              gradient={G.green}
              label="Vessel Types"
              value={kpis.types}
              sub={kpis.types > 0 ? `${kpis.types} distinct type${kpis.types !== 1 ? 's' : ''}` : undefined}
            />
            <KPI
              icon={<Calendar size={20} color="#fff" />}
              gradient={G.amber}
              label="Avg Fleet Age"
              value={kpis.avgAge != null ? `${kpis.avgAge} yr` : '—'}
              sub={kpis.avgAge != null ? `Built ~${currentYear - kpis.avgAge}` : 'No age data'}
            />
            <KPI
              icon={<TrendingUp size={20} color="#fff" />}
              gradient={G.pink}
              label="Avg Tonnage"
              value={kpis.avgTonnage != null ? `${kpis.avgTonnage.toLocaleString()} GT` : '—'}
              sub={kpis.avgTonnage != null ? 'gross tonnage' : 'No tonnage data'}
            />
          </div>

          {/* ── Row 1: Flag (wider) + Type ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '14px', marginBottom: '14px' }}>
            <ChartCard
              title="By Flag State"
              icon={<Globe size={13} />}
              accentColor={BLUE}
              count={byFlag.length}
            >
              {byFlag.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No flag data</p>
                : byFlag.map(({ name, count, iso3 }) => {
                  const flagCls = iso3 ? getFlagClass(iso3) : ''
                  return (
                    <BarRow
                      key={name}
                      label={name}
                      count={count}
                      total={pool.length}
                      max={maxFlag}
                      color={BLUE}
                      prefix={
                        flagCls
                          ? <span className={`fi ${flagCls}`} style={{ width: '20px', height: '14px', borderRadius: '2px', display: 'block', flexShrink: 0 }} />
                          : <span style={{ display: 'block', width: '20px', height: '14px', borderRadius: '2px', background: 'var(--table-border)', flexShrink: 0 }} />
                      }
                    />
                  )
                })
              }
            </ChartCard>

            <ChartCard
              title="By Vessel Type"
              icon={<Ship size={13} />}
              accentColor={PURPLE}
              count={byType.length}
            >
              {byType.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No type data</p>
                : byType.map(({ name, count }) => (
                  <BarRow key={name} label={name} count={count} total={pool.length} max={maxType} color={PURPLE} />
                ))
              }
            </ChartCard>
          </div>

          {/* ── Row 2: Classification + Fleet ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <ChartCard
              title="By Classification Society"
              icon={<BarChart2 size={13} />}
              accentColor={GREEN}
              count={byClass.length}
            >
              {byClass.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No classification data</p>
                : byClass.map(({ name, count }) => (
                  <BarRow key={name} label={name} count={count} total={pool.length} max={maxClass} color={GREEN} />
                ))
              }
            </ChartCard>

            <ChartCard
              title="By Fleet"
              icon={<BarChart2 size={13} />}
              accentColor={AMBER}
              count={byFleet.length}
            >
              {byFleet.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No fleet data</p>
                : byFleet.map(({ name, count }) => (
                  <BarRow key={name} label={name} count={count} total={pool.length} max={maxFleet} color={AMBER} />
                ))
              }
            </ChartCard>
          </div>

          {/* ── Row 3: Age + Tonnage (histogram) ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <ChartCard
              title="Age Distribution"
              icon={<Calendar size={13} />}
              accentColor={PINK}
              count={pool.filter(v => v.builtYear).length > 0 ? pool.filter(v => v.builtYear).length : undefined}
            >
              {pool.filter(v => v.builtYear).length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No age data</p>
                : <Histogram data={byAge} color={PINK} total={pool.filter(v => v.builtYear).length} />
              }
            </ChartCard>

            <ChartCard
              title="Tonnage Distribution"
              icon={<TrendingUp size={13} />}
              accentColor={TEAL}
              count={pool.filter(v => v.grossTonnage).length > 0 ? pool.filter(v => v.grossTonnage).length : undefined}
            >
              {pool.filter(v => v.grossTonnage).length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tonnage data</p>
                : <Histogram data={byTonnage} color={TEAL} total={pool.filter(v => v.grossTonnage).length} />
              }
            </ChartCard>
          </div>

          {/* ── Row 4: Customer Type + OFAC ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <ChartCard
              title="By Customer Type"
              icon={<Anchor size={13} />}
              accentColor={INDIGO}
              count={byCustomerType.reduce((s, x) => s + x.count, 0) || undefined}
            >
              {byCustomerType.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No customer data</p>
                : byCustomerType.map(({ label, count }) => (
                  <BarRow key={label} label={label} count={count} total={pool.length} max={maxCustomer} color={INDIGO} />
                ))
              }
            </ChartCard>

            <ChartCard
              title="OFAC / Sanctions Status"
              icon={<Shield size={13} />}
              accentColor="#ef4444"
              count={pool.length || undefined}
            >
              {byOfac.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No OFAC data</p>
                : byOfac.map(({ label, count, color }) => (
                  <OfacRow key={label} label={label} count={count} total={pool.length} barColor={color} />
                ))
              }
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
