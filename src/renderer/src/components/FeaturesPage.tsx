import { useMemo, useState } from 'react'
import { Compass, Search, ArrowRight, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { FEATURE_AREAS, FeatureArea, NavTarget, searchFeatures, visibleFeatures } from '../features'
import { PageHeader, EmptyState } from './ui'

interface FeaturesPageProps {
  onNavigate: (target: NavTarget) => void
}

/** Everything the app can do, from the feature registry, each with a link to it */
export default function FeaturesPage({ onNavigate }: FeaturesPageProps) {
  const { hasPermission, isAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [area, setArea] = useState<FeatureArea | 'all'>('all')

  const available = useMemo(() => visibleFeatures(hasPermission, !!isAdmin), [hasPermission, isAdmin])
  const shown = useMemo(() => {
    const list = query.trim() ? searchFeatures(available, query) : available
    return area === 'all' ? list : list.filter(f => f.area === area)
  }, [available, query, area])

  const areas = FEATURE_AREAS.filter(a => available.some(f => f.area === a))

  return (
    <div className="fade-in page">
      <PageHeader
        icon={<Compass size={26} />}
        title="Features"
        subtitle={<>Everything the app can do. Click a card to open it, or press <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> anywhere and type what you need.</>}
      />

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '420px' }}>
          <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="What do you want to do?"
            style={{ width: '100%', paddingLeft: '36px' }}
            autoFocus
          />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button className={`chip${area === 'all' ? ' active' : ''}`} onClick={() => setArea('all')}>All</button>
          {areas.map(a => (
            <button key={a} className={`chip${area === a ? ' active' : ''}`} onClick={() => setArea(a)}>{a}</button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<Search size={40} />} title="Nothing matches" text="Try other words, or clear the search to see everything." />
      ) : (
        (area === 'all' && !query.trim() ? areas : [null]).map(group => {
          const items = group ? shown.filter(f => f.area === group) : shown
          if (items.length === 0) return null
          return (
            <section key={group || 'results'} style={{ marginBottom: '28px' }}>
              {group && (
                <h2 style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', margin: '0 0 10px' }}>{group}</h2>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {items.map(f => (
                  <button
                    key={f.id}
                    onClick={() => onNavigate(f.target)}
                    className="glass-card feature-card"
                    style={{ textAlign: 'left', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px', color: 'var(--text-primary)', fontWeight: 400 }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.92rem' }}>
                      {f.kind === 'action' ? <Zap size={15} style={{ color: 'var(--warning)' }} /> : <ArrowRight size={15} style={{ color: 'var(--accent-primary)' }} />}
                      {f.title}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>{f.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}
