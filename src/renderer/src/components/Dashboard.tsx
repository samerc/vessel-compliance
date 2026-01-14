import { useState, useEffect } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { Vessel, VesselDocument } from '../../../shared/types'

export default function Dashboard() {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docs, setDocs] = useState<VesselDocument[]>([])

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const vData = await window.api.getVessels()
        const dData = await window.api.getVesselDocuments()
        setVessels(vData)
        setDocs(dData)
    }

    const missingDocsCount = docs.filter(d => d.required && !d.filePath).length
    const complianceRate = vessels.length > 0
        ? Math.round(((vessels.length * 5 - missingDocsCount) / (vessels.length * 5)) * 100)
        : 100

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Fleet Overview</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Real-time compliance monitoring across {vessels.length} vessels.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px', marginBottom: '48px' }}>
                <StatCard icon={<Activity color="#00d2ff" />} label="Avg Compliance" value={`${complianceRate}%`} trend="Target: 100%" />
                <StatCard icon={<AlertTriangle color="#ff4d4d" />} label="Missing (Req)" value={missingDocsCount} trend="Across all vessels" />
                <StatCard icon={<Clock color="#ffcc00" />} label="Vessels Tracked" value={vessels.length} trend="Active fleet" />
                <StatCard icon={<CheckCircle color="#00ff88" />} label="Fully Compliant" value="-" trend="TBD" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '20px' }}>Recent Document Alerts</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {docs.filter(d => d.required && !d.filePath).slice(0, 5).map((d, i) => (
                            <ActivityItem key={i} vessel="System Alert" action={`Missing required document for vessel ID: ${d.vesselId}`} time="Now" danger />
                        ))}
                        {docs.length === 0 && <div style={{ color: 'var(--text-secondary)' }}>No alerts at this time.</div>}
                    </div>
                </div>

                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ marginBottom: '20px' }}>Quick Actions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <button className="btn-secondary" style={{ textAlign: 'left', width: '100%' }}>Export Fleet Status</button>
                        <button className="btn-secondary" style={{ textAlign: 'left', width: '100%' }}>System Health Check</button>
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

function ActivityItem({ vessel, action, time, danger }: any) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
                <div style={{ fontWeight: '600', color: danger ? 'var(--danger)' : 'white' }}>{vessel}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{action}</div>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{time}</div>
        </div>
    )
}
