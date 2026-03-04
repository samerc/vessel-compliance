import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Activity, AlertTriangle, CheckCircle, Clock, AlertCircle,
  Ship, FileText, Users, Shield, Wrench, Calendar, FileWarning,
  RefreshCw, Building2, User, TrendingUp, ChevronRight
} from 'lucide-react'
import { Vessel, VesselDocument, DocumentType, Entity, SurveyWarranty } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'

interface DashboardActivity {
  recentVessels: Array<{ id: string; name: string; imoNumber: string; fleetName?: string; createdAt: string; isActive: boolean }>
  recentEntities: Array<{ id: string; name: string; type: string; createdAt: string }>
  recentAuditEntries: Array<{ vesselId: string; vesselName: string; fieldName: string; newValue?: string; changedAt: string }>
  weekRenewals: Array<{ vesselName: string; imoNumber: string; policyTypeName: string; policyNumber?: string; endDate: string }>
}

interface ExpirationItem {
  vesselName: string
  vesselId: string
  label: string
  expiryDate?: string
  kind: 'doc' | 'policy'
  severity: 'expired' | 'missing' | 'soon' | 'upcoming'
}

function relativeTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

function formatDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function formatFieldName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function daysUntil(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}

export default function Dashboard({
  onViewAlerts,
  onViewSurveyFollowUp
}: {
  onViewAlerts: () => void
  onViewSurveyFollowUp?: () => void
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showError } = useToast()

  const [vessels, setVessels] = useState<Vessel[]>([])
  const [docs, setDocs] = useState<VesselDocument[]>([])
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [openDefects, setOpenDefects] = useState<any[]>([])
  const [pendingSanctions, setPendingSanctions] = useState<any[]>([])
  const [activeWarranties, setActiveWarranties] = useState<SurveyWarranty[]>([])
  const [endorsementsDue, setEndorsementsDue] = useState<number>(0)
  const [activity, setActivity] = useState<DashboardActivity>({ recentVessels: [], recentEntities: [], recentAuditEntries: [], weekRenewals: [] })
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [vData, dData, tData, eData] = await Promise.all([
        window.api.getVessels(),
        window.api.getVesselDocuments(),
        window.api.getDocumentTypes(),
        window.api.getEntities()
      ])
      setVessels(Array.isArray(vData) ? vData : [])
      setDocs(Array.isArray(dData) ? dData : [])
      setDocTypes(Array.isArray(tData) ? tData : [])
      setEntities(Array.isArray(eData) ? eData : [])
    } catch {
      showError('Failed to load core dashboard data')
    }

    const secondaryResults = await Promise.allSettled([
      window.api.getOpenDefectsByVessel().then(d => setOpenDefects(d || [])),
      window.api.complianceGetPendingResults().then(d => setPendingSanctions(d || [])),
      window.api.surveyWarrantyGetAll().then(d => setActiveWarranties(Array.isArray(d) ? d : [])),
      window.api.surveyWarrantyGetEndorsementsDue().then(d => setEndorsementsDue(Array.isArray(d) ? d.length : 0)),
      window.api.dashboardGetActivity().then(d => setActivity(d || { recentVessels: [], recentEntities: [], recentAuditEntries: [], weekRenewals: [] }))
    ])
    const failCount = secondaryResults.filter(r => r.status === 'rejected').length
    if (failCount > 0) showError(`${failCount} dashboard section${failCount > 1 ? 's' : ''} failed to load`)
    setLastRefreshed(new Date())
    setIsLoading(false)
  }, [showError])

  useEffect(() => { loadData() }, [loadData])

  const activeVessels = useMemo(() => vessels.filter(v => v.isActive), [vessels])
  const activeVesselIds = useMemo(() => new Set(activeVessels.map(v => v.id)), [activeVessels])

  const docMap = useMemo(() => {
    const map = new Map<string, VesselDocument>()
    for (const d of docs) {
      if (activeVesselIds.has(d.vesselId)) map.set(`${d.vesselId}:${d.documentTypeId}`, d)
    }
    return map
  }, [docs, activeVesselIds])

  const allAlerts = useMemo(() => {
    const today = new Date()
    const thirtyDays = new Date(); thirtyDays.setDate(today.getDate() + 30)
    const ninetyDays = new Date(); ninetyDays.setDate(today.getDate() + 90)
    const alerts: { vessel: string; vesselId: string; document: string; msg: string; type: string; expiryDate?: string }[] = []

    for (const v of activeVessels) {
      for (const t of docTypes) {
        const doc = docMap.get(`${v.id}:${t.id}`)
        const isRequired = doc ? doc.required : t.required
        const hasFile = !!doc?.filePath
        const effectiveExpiry = (t.annualRenewal && v.policyExpiryDate) ? v.policyExpiryDate : doc?.expiryDate

        if (isRequired && !hasFile) {
          alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Missing File', type: 'missing' })
        } else if (hasFile && effectiveExpiry) {
          const expiry = new Date(effectiveExpiry)
          if (expiry < today) {
            alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Expired', type: 'expired', expiryDate: effectiveExpiry })
          } else if (expiry < thirtyDays) {
            const isShortCycle = t.annualRenewal && doc?.receivedDate &&
              (new Date(effectiveExpiry).getTime() - new Date(doc.receivedDate).getTime()) / 86400000 < 60
            if (!isShortCycle) {
              alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Expiring Soon', type: 'soon', expiryDate: effectiveExpiry })
            }
          } else if (expiry < ninetyDays) {
            alerts.push({ vessel: v.name, vesselId: v.id, document: t.name, msg: 'Expiring in 90 days', type: 'upcoming', expiryDate: effectiveExpiry })
          }
        }
      }
    }
    return alerts
  }, [activeVessels, docTypes, docMap])

  const missingCount = useMemo(() => allAlerts.filter(a => a.type === 'missing').length, [allAlerts])
  const expiredCount = useMemo(() => allAlerts.filter(a => a.type === 'expired').length, [allAlerts])
  const soonCount = useMemo(() => allAlerts.filter(a => a.type === 'soon').length, [allAlerts])

  const globalCompliance = useMemo(() => {
    if (activeVessels.length === 0 || docTypes.length === 0) return 100
    const criticalCount = allAlerts.filter(a => a.type === 'missing' || a.type === 'expired').length
    const total = activeVessels.length * docTypes.length
    return Math.round(((total - criticalCount) / total) * 100)
  }, [activeVessels, docTypes, allAlerts])

  const policyStats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const thirtyDays = new Date(today); thirtyDays.setDate(today.getDate() + 30)
    const expiringVessels: { name: string; date: string; vesselId: string }[] = []

    for (const v of activeVessels) {
      if (!v.policyExpiryDate) continue
      const exp = new Date(v.policyExpiryDate)
      if (exp < thirtyDays) {
        expiringVessels.push({ name: v.name, date: v.policyExpiryDate, vesselId: v.id })
      }
    }
    expiringVessels.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    return { expiringVessels }
  }, [activeVessels])

  const overdueWarranties = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return activeWarranties.filter(w => {
      if (w.deadlineType !== 'days' || !w.deadlineDays || !w.inceptionDate) return false
      const dl = new Date(w.inceptionDate)
      dl.setDate(dl.getDate() + w.deadlineDays)
      return dl < today
    }).length
  }, [activeWarranties])

  // Merged upcoming expirations — doc alerts + policy expirations, sorted by urgency then date
  const upcomingItems = useMemo((): ExpirationItem[] => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const items: ExpirationItem[] = []

    for (const a of allAlerts) {
      if (a.type === 'upcoming') continue // only expired/missing/soon
      items.push({
        vesselName: a.vessel,
        vesselId: a.vesselId,
        label: a.document,
        expiryDate: a.expiryDate,
        kind: 'doc',
        severity: a.type === 'expired' ? 'expired' : a.type === 'missing' ? 'missing' : 'soon'
      })
    }

    for (const p of policyStats.expiringVessels) {
      items.push({
        vesselName: p.name,
        vesselId: p.vesselId,
        label: 'Policy Expiry',
        expiryDate: p.date,
        kind: 'policy',
        severity: new Date(p.date) < today ? 'expired' : 'soon'
      })
    }

    const ORDER = { expired: 0, missing: 1, soon: 2, upcoming: 3 }
    items.sort((a, b) => {
      const so = ORDER[a.severity] - ORDER[b.severity]
      if (so !== 0) return so
      if (!a.expiryDate) return -1
      if (!b.expiryDate) return 1
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    })
    return items.slice(0, 12)
  }, [allAlerts, policyStats])

  const sanctionsPending = pendingSanctions.length

  // ── Styles ────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: isLight ? '#fff' : 'rgba(255,255,255,0.04)',
    border: `1px solid ${isLight ? '#e4e7ef' : 'rgba(255,255,255,0.08)'}`,
    borderRadius: '14px',
    padding: '20px'
  }

  const today = new Date()
  const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="fade-in" style={{ padding: '0 2px' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: '800', letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
            {dateStr} · {activeVessels.length} active vessel{activeVessels.length !== 1 ? 's' : ''} · {entities.length} entit{entities.length !== 1 ? 'ies' : 'y'}
            {lastRefreshed && (
              <span style={{ marginLeft: '10px', opacity: 0.6 }}>· Updated {relativeTime(lastRefreshed.toISOString())}</span>
            )}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={isLoading}
          className="btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          Refresh
        </button>
      </div>

      {/* ── KPI Row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '14px', marginBottom: '24px' }}>
        <KPICard
          icon={<Ship size={18} color="#fff" />}
          iconBg="linear-gradient(135deg, #0ea5e9, #2563eb)"
          label="Active Vessels"
          value={activeVessels.length}
          sub={`${vessels.length - activeVessels.length} inactive`}
        />
        <KPICard
          icon={<Users size={18} color="#fff" />}
          iconBg="linear-gradient(135deg, #8b5cf6, #6d28d9)"
          label="Entities"
          value={entities.length}
          sub={`${entities.filter(e => e.type === 'company').length} co · ${entities.filter(e => e.type === 'person').length} persons`}
        />
        <KPICard
          icon={<TrendingUp size={18} color="#fff" />}
          iconBg={globalCompliance === 100 ? 'linear-gradient(135deg, #10b981, #059669)' : globalCompliance > 80 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #ef4444, #dc2626)'}
          label="Doc Compliance"
          value={`${globalCompliance}%`}
          sub={`${activeVessels.length} active vessels`}
          valueColor={globalCompliance === 100 ? '#10b981' : globalCompliance > 80 ? '#f59e0b' : 'var(--danger)'}
        />
        <KPICard
          icon={<AlertTriangle size={18} color="#fff" />}
          iconBg={missingCount + expiredCount > 0 ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)'}
          label="Critical Issues"
          value={missingCount + expiredCount}
          sub={`${missingCount} missing · ${expiredCount} expired`}
          valueColor={missingCount + expiredCount > 0 ? 'var(--danger)' : '#10b981'}
        />
        <KPICard
          icon={<Shield size={18} color="#fff" />}
          iconBg={sanctionsPending > 0 ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #10b981, #059669)'}
          label="Sanctions Pending"
          value={sanctionsPending}
          sub="Awaiting review"
          valueColor={sanctionsPending > 0 ? '#f59e0b' : '#10b981'}
        />
      </div>

      {/* ── Main Row: Upcoming Expirations + Operational Status ─────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', marginBottom: '16px' }}>

        {/* Upcoming Expirations */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, var(--accent-primary), #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Calendar size={14} color="#fff" />
              </div>
              Upcoming Expirations
              {upcomingItems.length > 0 && (
                <span style={{ padding: '1px 8px', borderRadius: '8px', fontSize: '0.68rem', fontWeight: '700', background: 'rgba(255,77,77,0.12)', color: 'var(--danger)' }}>
                  {upcomingItems.length}
                </span>
              )}
            </h3>
            <button
              onClick={onViewAlerts}
              style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: '600' }}
            >
              View All <ChevronRight size={13} />
            </button>
          </div>

          {upcomingItems.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '10px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={22} color="#10b981" />
              </div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>All documents and policies are current</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['Status', 'Vessel', 'Document / Policy', 'Days', 'Expires'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '0.68rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--table-border)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcomingItems.map((item, idx) => {
                  const isExp = item.severity === 'expired'
                  const isMiss = item.severity === 'missing'
                  const isSoon = item.severity === 'soon'
                  const color = (isExp || isMiss) ? 'var(--danger)' : isSoon ? '#f59e0b' : '#10b981'
                  const bgLabel = (isExp || isMiss) ? 'rgba(255,77,77,0.1)' : isSoon ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)'
                  const statusLabel = isExp ? 'EXPIRED' : isMiss ? 'MISSING' : 'EXPIRING'
                  const days = item.expiryDate ? daysUntil(item.expiryDate) : null
                  const rowBg = idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.018)' : 'rgba(255,255,255,0.012)')

                  return (
                    <tr key={idx} style={{ background: rowBg }}>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: '800', background: bgLabel, color, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}>
                          {isMiss ? <AlertCircle size={9} /> : isExp ? <AlertTriangle size={9} /> : <Clock size={9} />}
                          {statusLabel}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.vesselName}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.kind === 'policy' ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Shield size={11} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                            {item.label}
                          </span>
                        ) : item.label}
                      </td>
                      <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                        {days !== null ? (
                          <span style={{ fontWeight: '700', color, fontSize: '0.8rem' }}>
                            {days < 0 ? `${Math.abs(days)}d over` : days === 0 ? 'today' : `${days}d`}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '7px 10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                        {item.expiryDate ? formatDate(item.expiryDate) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Operational Status */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 16px', fontSize: '0.95rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '7px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={14} color="#fff" />
            </div>
            Operational Status
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <StatusRow icon={<FileText size={14} />} label="Critical Documents" value={missingCount + expiredCount} color={(missingCount + expiredCount) > 0 ? 'var(--danger)' : '#10b981'} />
            <StatusRow icon={<Clock size={14} />} label="Expiring in 30 days" value={soonCount} color={soonCount > 0 ? '#f59e0b' : '#10b981'} />
            <StatusRow icon={<Wrench size={14} />} label="Open Defects" value={openDefects.length} color={openDefects.length > 0 ? '#f97316' : '#10b981'} />
            <StatusRow icon={<FileWarning size={14} />} label="Active Warranties" value={activeWarranties.length} color={activeWarranties.length > 0 ? '#f59e0b' : '#10b981'} />
            {overdueWarranties > 0 && (
              <StatusRow icon={<AlertTriangle size={14} />} label="Overdue Warranties" value={overdueWarranties} color="var(--danger)" />
            )}
            <StatusRow icon={<Calendar size={14} />} label="Endorsements Due" value={endorsementsDue} color={endorsementsDue > 0 ? '#f59e0b' : '#10b981'} />
          </div>

          {onViewSurveyFollowUp && (activeWarranties.length > 0 || endorsementsDue > 0) && (
            <button
              onClick={onViewSurveyFollowUp}
              className="btn-secondary"
              style={{ width: '100%', marginTop: '16px', fontSize: '0.78rem', padding: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
            >
              <FileWarning size={13} /> View Survey Follow-Up
            </button>
          )}
        </div>
      </div>

      {/* ── Activity Row ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>

        {/* Recently Added Vessels */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #0ea5e9, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ship size={13} color="#fff" />
            </div>
            Recently Added Vessels
          </h3>
          {activity.recentVessels.length === 0 ? (
            <EmptyActivity label="No vessels yet" />
          ) : (
            <div>
              {activity.recentVessels.map((v, idx) => (
                <div key={v.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                  borderRadius: '8px',
                  background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
                }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: v.isActive ? 'rgba(14,165,233,0.12)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ship size={14} color={v.isActive ? '#0ea5e9' : 'var(--text-secondary)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', gap: '6px', marginTop: '1px' }}>
                      <span>IMO {v.imoNumber}</span>
                      {v.fleetName && <span>· {v.fleetName}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {relativeTime(v.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recently Added Entities */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={13} color="#fff" />
            </div>
            Recently Added Entities
          </h3>
          {activity.recentEntities.length === 0 ? (
            <EmptyActivity label="No entities yet" />
          ) : (
            <div>
              {activity.recentEntities.map((e, idx) => {
                const isCompany = e.type === 'company'
                return (
                  <div key={e.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                    borderRadius: '8px',
                    background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
                  }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: isCompany ? 'rgba(139,92,246,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isCompany ? <Building2 size={14} color="#8b5cf6" /> : <User size={14} color="#10b981" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                      <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '5px', background: isCompany ? 'rgba(139,92,246,0.1)' : 'rgba(16,185,129,0.1)', color: isCompany ? '#8b5cf6' : '#10b981', textTransform: 'uppercase', fontWeight: '700', letterSpacing: '0.04em' }}>
                        {e.type}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {relativeTime(e.createdAt)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Renewals This Week */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #10b981, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={13} color="#fff" />
            </div>
            Renewals This Week
          </h3>
          {activity.weekRenewals.length === 0 ? (
            <EmptyActivity label="No renewals this week" />
          ) : (
            <div>
              {activity.weekRenewals.map((r, idx) => {
                const days = daysUntil(r.endDate)
                return (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                    borderRadius: '8px',
                    background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
                  }}>
                    <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: days <= 2 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Calendar size={13} color={days <= 2 ? '#ef4444' : '#10b981'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '700', fontSize: '0.82rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vesselName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.policyTypeName}</div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: '700', color: days <= 2 ? 'var(--danger)' : '#10b981' }}>{days === 0 ? 'Today' : `${days}d`}</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>{formatDate(r.endDate)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent Changes */}
        <div style={cardStyle}>
          <h3 style={{ margin: '0 0 14px', fontSize: '0.92rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '26px', height: '26px', borderRadius: '6px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Activity size={13} color="#fff" />
            </div>
            Recent Changes
          </h3>
          {activity.recentAuditEntries.length === 0 ? (
            <EmptyActivity label="No recent changes" />
          ) : (
            <div>
              {activity.recentAuditEntries.map((entry, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 10px',
                  borderRadius: '8px',
                  background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
                }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '7px', background: 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                    <Ship size={13} color="#f59e0b" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '700', fontSize: '0.82rem', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.vesselName}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ color: 'var(--text-primary)', fontWeight: '500' }}>{formatFieldName(entry.fieldName)}</span>
                      {entry.newValue && (
                        <>
                          <span>→</span>
                          <span style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.newValue}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {relativeTime(entry.changedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KPICard({
  icon, iconBg, label, value, sub, valueColor
}: {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string | number
  sub?: string
  valueColor?: string
}) {
  return (
    <div className="glass-card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ width: '38px', height: '38px', borderRadius: '9px', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <div style={{ fontSize: '1.75rem', fontWeight: '800', lineHeight: 1, marginBottom: '4px', color: valueColor || 'var(--text-primary)', letterSpacing: '-0.02em' }}>{value}</div>
      <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: sub ? '2px' : 0 }}>{label}</div>
      {sub && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', opacity: 0.7 }}>{sub}</div>}
    </div>
  )
}

function StatusRow({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 10px', borderRadius: '8px' }}>
      <span style={{ color: 'var(--text-secondary)', display: 'flex', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</span>
      <span style={{
        fontWeight: '800', fontSize: '1rem', color,
        minWidth: '28px', textAlign: 'right'
      }}>{value}</span>
      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0, opacity: value > 0 ? 1 : 0.3 }} />
    </div>
  )
}

function EmptyActivity({ label }: { label: string }) {
  return (
    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
      {label}
    </div>
  )
}
