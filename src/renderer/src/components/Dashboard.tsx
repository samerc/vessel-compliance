import { useState, useEffect } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, ShieldAlert, AlertCircle } from 'lucide-react'
import { Vessel, VesselDocument, DocumentType } from '../../../shared/types'

export default function Dashboard({ onViewAlerts }: { onViewAlerts: () => void }) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docs, setDocs] = useState<VesselDocument[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const [vData, dData, tData] = await Promise.all([
            window.api.getVessels(),
            window.api.getVesselDocuments(),
            window.api.getDocumentTypes()
        ])
        setVessels(vData)
        setDocs(dData)
        setDocTypes(tData)
    }

    // Calculate alerts centrally
    const getDashboardAlerts = () => {
        const today = new Date()
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(today.getDate() + 30)

        const alerts: any[] = []

        vessels.forEach(v => {
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

    const allAlerts = getDashboardAlerts()
    const missingCount = allAlerts.filter(a => a.type === 'missing').length
    const expiredCount = allAlerts.filter(a => a.type === 'expired').length

    const complianceRate = vessels.length > 0 && docTypes.length > 0
        ? Math.round((((vessels.length * docTypes.length) - (missingCount + expiredCount)) / (vessels.length * docTypes.length)) * 100)
        : 100

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Fleet Overview</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Real-time compliance monitoring across {vessels.length} vessels.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '48px' }}>
                <StatCard icon={<Activity color="#00d2ff" />} label="Compliance Score" value={`${complianceRate}%`} trend="Target: 100%" />
                <StatCard icon={<AlertTriangle color="#ff4d4d" />} label="Critical Alerts" value={missingCount + expiredCount} trend="Action Required" />
                <StatCard icon={<Clock color="#ffcc00" />} label="Fleet Size" value={vessels.length} trend="Total Vessels" />
                <StatCard icon={<CheckCircle color="#00ff88" />} label="Fully Compliant" value={`${vessels.length - [...new Set(allAlerts.map(a => a.vessel))].length}`} trend="All Clear" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
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
