import { useState, useEffect } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, ShieldAlert, AlertCircle, Ship } from 'lucide-react'
import { Vessel, VesselDocument, DocumentType } from '../../../shared/types'

export default function Dashboard({ onViewAlerts }: { onViewAlerts: () => void }) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docs, setDocs] = useState<VesselDocument[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [fleets, setFleets] = useState<any[]>([])

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const [vData, dData, tData, fData] = await Promise.all([
            window.api.getVessels(),
            window.api.getVesselDocuments(),
            window.api.getDocumentTypes(),
            window.api.getFleets()
        ])
        setVessels(vData)
        setDocs(dData)
        setDocTypes(tData)
        setFleets(fData)
    }

    // Calculate alerts centrally
    const getDashboardAlerts = (targetVessels: Vessel[]) => {
        const today = new Date()
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(today.getDate() + 30)

        const alerts: any[] = []

        targetVessels.forEach(v => {
            docTypes.forEach(t => {
                const doc = docs.find(d => d.vesselId === v.id && d.documentTypeId === t.id)
                const isRequired = doc ? doc.required : t.required
                const hasFile = !!doc?.filePath

                if (isRequired && !hasFile) {
                    alerts.push({ vessel: v.name, document: t.name, msg: 'Missing File', type: 'missing' })
                } else if (hasFile && doc?.expiryDate) {
                    const expiry = new Date(doc.expiryDate)
                    if (expiry < today) {
                        alerts.push({ vessel: v.name, document: t.name, msg: 'Expired', type: 'expired' })
                    } else if (expiry < thirtyDaysFromNow) {
                        alerts.push({ vessel: v.name, document: t.name, msg: 'Expiring Soon', type: 'soon' })
                    }
                }
            })
        })
        return alerts
    }

    const allAlerts = getDashboardAlerts(vessels)
    const missingCount = allAlerts.filter(a => a.type === 'missing').length
    const expiredCount = allAlerts.filter(a => a.type === 'expired').length

    const getComplianceRate = (targetVessels: Vessel[]) => {
        if (targetVessels.length === 0 || docTypes.length === 0) return 100
        const alerts = getDashboardAlerts(targetVessels)
        const criticalCount = alerts.filter(a => a.type === 'missing' || a.type === 'expired').length
        return Math.round((((targetVessels.length * docTypes.length) - criticalCount) / (targetVessels.length * docTypes.length)) * 100)
    }

    const globalCompliance = getComplianceRate(vessels)

    const fleetMetrics = [
        ...fleets.map(f => {
            const fleetVessels = vessels.filter(v => v.fleetId === f.id)
            const alerts = getDashboardAlerts(fleetVessels)
            return {
                id: f.id,
                name: f.name,
                vessels: fleetVessels.length,
                compliance: getComplianceRate(fleetVessels),
                alerts: alerts.length,
                critical: alerts.filter(a => a.type === 'missing' || a.type === 'expired').length
            }
        }),
        {
            id: 'unassigned',
            name: 'Unassigned Vessels',
            vessels: vessels.filter(v => !v.fleetId).length,
            compliance: getComplianceRate(vessels.filter(v => !v.fleetId)),
            alerts: getDashboardAlerts(vessels.filter(v => !v.fleetId)).length,
            critical: getDashboardAlerts(vessels.filter(v => !v.fleetId)).filter(a => a.type === 'missing' || a.type === 'expired').length
        }
    ].filter(m => m.vessels > 0)

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Fleet Overview</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Real-time compliance monitoring across {vessels.length} vessels.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '48px' }}>
                <StatCard icon={<Activity color="#00d2ff" />} label="Overall Compliance" value={`${globalCompliance}%`} trend="Target: 100%" />
                <StatCard icon={<AlertTriangle color="#ff4d4d" />} label="Critical Alerts" value={missingCount + expiredCount} trend="Action Required" />
                <StatCard icon={<Clock color="#ffcc00" />} label="Fleet Size" value={vessels.length} trend="Total Vessels" />
                <StatCard icon={<CheckCircle color="#00ff88" />} label="Fully Compliant" value={`${vessels.length - [...new Set(allAlerts.map(a => a.vessel))].length}`} trend="All Clear" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '48px' }}>
                <div className="glass-card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0 }}>Recent Alerts</h3>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Showing {Math.min(allAlerts.length, 5)} of {allAlerts.length}</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {allAlerts.slice(0, 5).map((alert, i) => (
                            <ActivityItem
                                key={i}
                                vessel={alert.vessel}
                                action={`${alert.msg}: ${alert.document}`}
                                color={alert.type === 'expired' ? '#ff4d4d' : alert.type === 'soon' ? '#ffcc00' : 'var(--danger)'}
                                danger={alert.type !== 'soon'}
                            />
                        ))}
                        {allAlerts.length === 0 && <div style={{ color: 'var(--text-secondary)', padding: '20px', textAlign: 'center' }}>Fleet is fully compliant.</div>}
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '20px' }}>Quick Actions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button
                            onClick={onViewAlerts}
                            className="btn-primary"
                            style={{ textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <ShieldAlert size={18} /> View All Alerts
                        </button>
                        <button className="btn-secondary" style={{ textAlign: 'left', width: '100%' }}>Export Fleet Status</button>
                    </div>
                </div>
            </div>

            <section>
                <h3 style={{ marginBottom: '24px' }}>Compliance by Fleet</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                    {fleetMetrics.map(fleet => (
                        <div key={fleet.id} className="glass-card" style={{ padding: '20px', borderLeft: `4px solid ${fleet.compliance === 100 ? 'var(--success)' : fleet.compliance > 80 ? 'var(--warning)' : 'var(--danger)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                <div style={{ fontWeight: '700', fontSize: '1.1rem' }}>{fleet.name}</div>
                                <div style={{ fontSize: '1.2rem', fontWeight: '800', color: fleet.compliance === 100 ? 'var(--success)' : fleet.compliance > 80 ? 'var(--warning)' : 'var(--danger)' }}>
                                    {fleet.compliance}%
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                <div><Ship size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {fleet.vessels} Vessels</div>
                                <div style={{ color: fleet.alerts > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                    <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {fleet.alerts} Alerts
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    )
}

function StatCard({ icon, label, value, trend }: any) {
    return (
        <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                {icon}
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{trend}</span>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '4px' }}>{value}</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</div>
        </div>
    )
}

function ActivityItem({ vessel, action, danger, color }: any) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--table-header-bg)', borderRadius: '8px' }}>
            <div>
                <div style={{ fontWeight: '600', fontSize: '0.95rem' }}>{vessel}</div>
                <div style={{ fontSize: '0.85rem', color: color || 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {danger ? <AlertCircle size={14} /> : <Clock size={14} />}
                    {action}
                </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>High Priority</div>
        </div>
    )
}
