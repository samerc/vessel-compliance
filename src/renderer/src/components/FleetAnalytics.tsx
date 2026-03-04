import { useState, useEffect, useMemo } from 'react'
import { BarChart2, Ship, Globe, Anchor, Calendar, TrendingUp, RefreshCw, Loader2, Activity } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'

const currentYear = new Date().getFullYear()

// ── helpers ──────────────────────────────────────────────────────────────────

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
  { label: '< 1k GT', min: 0, max: 1000 },
  { label: '1k–5k GT', min: 1000, max: 5000 },
  { label: '5k–15k GT', min: 5000, max: 15000 },
  { label: '15k–50k GT', min: 15000, max: 50000 },
  { label: '50k+ GT', min: 50000, max: Infinity },
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

// ── sub-components ────────────────────────────────────────────────────────────

function KPI({ icon, iconBg, label, value, sub }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string | number; sub?: string
}) {
  return (
    <div className="glass-card" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: '1.8rem', fontWeight: '800', lineHeight: 1, letterSpacing: '-0.03em' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{sub}</div>}
      </div>
      <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
    </div>
  )
}

function BarRow({ label, count, max, color, prefix }: {
  label: string; count: number; max: number; color: string; prefix?: React.ReactNode
}) {
  const pct = max > 0 ? (count / max) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0' }}>
      {prefix && <div style={{ width: '24px', flexShrink: 0 }}>{prefix}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ fontSize: '0.78rem', fontWeight: '700', color, flexShrink: 0, marginLeft: '8px' }}>{count}</span>
        </div>
        <div style={{ height: '6px', background: 'var(--table-border)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            background: color,
            borderRadius: '3px',
            transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)'
          }} />
        </div>
      </div>
    </div>
  )
}

function ChartCard({ title, icon, iconBg, children }: {
  title: string; icon: React.ReactNode; iconBg: string; children: React.ReactNode
}) {
  return (
    <div className="glass-card" style={{ padding: '20px 22px' }}>
      <h3 style={{ margin: '0 0 16px', fontSize: '0.88rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-secondary)' }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {icon}
        </div>
        {title}
      </h3>
      {children}
    </div>
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function FleetAnalytics() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

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
        window.api.getFleets()
      ])
      setVessels(Array.isArray(v) ? v : [])
      setFlagStates(Array.isArray(fs) ? fs : [])
      setFleets(Array.isArray(fl) ? fl : [])
      setLastRefreshed(new Date())
    } catch { /* ignore */ }
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // ── derived data ────────────────────────────────────────────────────────────
  const pool = useMemo(() => activeOnly ? vessels.filter(v => v.isActive) : vessels, [vessels, activeOnly])

  const flagMap = useMemo(() => new Map(flagStates.map(f => [f.id, f])), [flagStates])
  const fleetMap = useMemo(() => new Map(fleets.map(f => [f.id, f.name])), [fleets])

  const kpis = useMemo(() => {
    const withAge = pool.filter(v => v.builtYear)
    const avgAge = withAge.length > 0 ? Math.round(withAge.reduce((s, v) => s + (currentYear - v.builtYear), 0) / withAge.length) : null
    const withTonnage = pool.filter(v => v.grossTonnage)
    const avgTonnage = withTonnage.length > 0 ? Math.round(withTonnage.reduce((s, v) => s + Number(v.grossTonnage), 0) / withTonnage.length) : null
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
      { label: 'Unassigned', count: unassigned }
    ].filter(x => x.count > 0)
  }, [pool])

  const byOfac = useMemo(() => {
    const groups = groupBy(pool, v => v.ofacStatus || 'PENDING')
    const order = ['CLEARED', 'POTENTIAL_MATCH', 'MATCH', 'SANCTIONED', 'ERROR', 'PENDING']
    return order.map(status => ({
      label: status.replace(/_/g, ' '),
      count: groups.get(status)?.length ?? 0,
      color: status === 'CLEARED' ? '#10b981'
        : status === 'PENDING' ? 'var(--text-secondary)'
        : status === 'POTENTIAL_MATCH' ? '#f59e0b'
        : 'var(--danger)'
    })).filter(x => x.count > 0)
  }, [pool])

  // ── colors ──────────────────────────────────────────────────────────────────
  const c = {
    blue: 'linear-gradient(90deg, #0ea5e9, #2563eb)',
    purple: 'linear-gradient(90deg, #8b5cf6, #6d28d9)',
    green: 'linear-gradient(90deg, #10b981, #059669)',
    amber: 'linear-gradient(90deg, #f59e0b, #d97706)',
    pink: 'linear-gradient(90deg, #ec4899, #be185d)',
  }

  const maxFlag = byFlag[0]?.count ?? 1
  const maxType = byType[0]?.count ?? 1
  const maxClass = byClass[0]?.count ?? 1
  const maxFleet = byFleet[0]?.count ?? 1
  const maxAge = Math.max(...byAge.map(b => b.count), 1)
  const maxGT = Math.max(...byTonnage.map(b => b.count), 1)
  const maxCustomer = Math.max(...byCustomerType.map(b => b.count), 1)

  return (
    <div className="fade-in">
      {/* ── Header ── */}
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '4px' }}>Fleet Analytics</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Statistical breakdown of your vessel portfolio.
            {lastRefreshed && <span style={{ marginLeft: '8px', opacity: 0.6 }}>Updated {lastRefreshed.toLocaleTimeString()}</span>}
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
            <KPI icon={<Ship size={16} color="#fff" />} iconBg={c.blue} label="Vessels" value={kpis.total}
              sub={activeOnly ? 'active' : 'total in fleet'} />
            <KPI icon={<Globe size={16} color="#fff" />} iconBg={c.purple} label="Flags in Use" value={kpis.flags}
              sub={`${Math.round((kpis.flags / Math.max(flagStates.length, 1)) * 100)}% of registry`} />
            <KPI icon={<Anchor size={16} color="#fff" />} iconBg={c.green} label="Vessel Types" value={kpis.types} />
            <KPI icon={<Calendar size={16} color="#fff" />} iconBg={c.amber} label="Avg Age"
              value={kpis.avgAge != null ? `${kpis.avgAge} yr` : '—'}
              sub={kpis.avgAge != null ? `Built ~${currentYear - kpis.avgAge}` : 'No age data'} />
            <KPI icon={<TrendingUp size={16} color="#fff" />} iconBg={c.pink} label="Avg Tonnage"
              value={kpis.avgTonnage != null ? `${kpis.avgTonnage.toLocaleString()} GT` : '—'}
              sub={kpis.avgTonnage != null ? '' : 'No tonnage data'} />
          </div>

          {/* ── Row 1: Flag + Type ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <ChartCard title="By Flag State" icon={<Globe size={13} color="#fff" />} iconBg="linear-gradient(135deg, #0ea5e9, #2563eb)">
              {byFlag.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No flag data</p>
                : byFlag.map(({ name, count, iso3 }) => {
                  const flagCls = iso3 ? getFlagClass(iso3) : ''
                  return (
                    <BarRow
                      key={name}
                      label={name}
                      count={count}
                      max={maxFlag}
                      color="#0ea5e9"
                      prefix={flagCls ? <span className={`fi ${flagCls}`} style={{ width: '20px', height: '15px', borderRadius: '2px', display: 'block' }} /> : <span style={{ display: 'block', width: '20px', height: '15px', borderRadius: '2px', background: 'var(--table-border)' }} />}
                    />
                  )
                })
              }
            </ChartCard>

            <ChartCard title="By Vessel Type" icon={<Ship size={13} color="#fff" />} iconBg="linear-gradient(135deg, #8b5cf6, #6d28d9)">
              {byType.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No type data</p>
                : byType.map(({ name, count }) => (
                  <BarRow key={name} label={name} count={count} max={maxType} color="#8b5cf6" />
                ))
              }
            </ChartCard>
          </div>

          {/* ── Row 2: Class + Fleet ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <ChartCard title="By Classification Society" icon={<Activity size={13} color="#fff" />} iconBg="linear-gradient(135deg, #10b981, #059669)">
              {byClass.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No classification data</p>
                : byClass.map(({ name, count }) => (
                  <BarRow key={name} label={name} count={count} max={maxClass} color="#10b981" />
                ))
              }
            </ChartCard>

            <ChartCard title="By Fleet" icon={<BarChart2 size={13} color="#fff" />} iconBg="linear-gradient(135deg, #f59e0b, #d97706)">
              {byFleet.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No fleet data</p>
                : byFleet.map(({ name, count }) => (
                  <BarRow key={name} label={name} count={count} max={maxFleet} color="#f59e0b" />
                ))
              }
            </ChartCard>
          </div>

          {/* ── Row 3: Age + Tonnage ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
            <ChartCard title="By Age" icon={<Calendar size={13} color="#fff" />} iconBg="linear-gradient(135deg, #ec4899, #be185d)">
              {pool.filter(v => v.builtYear).length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No age data</p>
                : byAge.map(({ label, count }) => (
                  <BarRow key={label} label={label} count={count} max={maxAge} color="#ec4899" />
                ))
              }
            </ChartCard>

            <ChartCard title="By Gross Tonnage" icon={<TrendingUp size={13} color="#fff" />} iconBg="linear-gradient(135deg, #14b8a6, #0d9488)">
              {pool.filter(v => v.grossTonnage).length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No tonnage data</p>
                : byTonnage.map(({ label, count }) => (
                  <BarRow key={label} label={label} count={count} max={maxGT} color="#14b8a6" />
                ))
              }
            </ChartCard>
          </div>

          {/* ── Row 4: Customer Type + OFAC ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <ChartCard title="By Customer Type" icon={<Anchor size={13} color="#fff" />} iconBg="linear-gradient(135deg, #6366f1, #4338ca)">
              {byCustomerType.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No customer data</p>
                : byCustomerType.map(({ label, count }) => (
                  <BarRow key={label} label={label} count={count} max={maxCustomer} color="#6366f1" />
                ))
              }
            </ChartCard>

            <ChartCard title="OFAC / Sanctions Status" icon={<Activity size={13} color="#fff" />} iconBg={isLight ? 'linear-gradient(135deg, #c00000, #991b1b)' : 'linear-gradient(135deg, #ff4d4d, #991b1b)'}>
              {byOfac.length === 0
                ? <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No OFAC data</p>
                : byOfac.map(({ label, count, color }) => (
                  <BarRow key={label} label={label} count={count} max={pool.length} color={color} />
                ))
              }
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
