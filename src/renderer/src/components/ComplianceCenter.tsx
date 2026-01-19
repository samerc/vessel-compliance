import { useState, useEffect } from 'react'
import { AlertCircle, Clock, CheckCircle, ShieldAlert } from 'lucide-react'
import { Vessel, VesselDocument, DocumentType } from '../../../shared/types'

export default function ComplianceCenter() {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docs, setDocs] = useState<VesselDocument[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [filter, setFilter] = useState<'all' | 'missing' | 'expired' | 'soon'>('all')

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

    const getAllAlerts = () => {
        const today = new Date()
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(today.getDate() + 30)

        const alerts: any[] = []

        vessels.forEach(v => {
            docTypes.forEach(t => {
                const doc = docs.find(d => d.vesselId === v.id && d.documentTypeId === t.id)
                const isRequired = doc ? doc.required : t.required
                const hasFile = !!doc?.filePath

                // 1. Missing Required File
                if (isRequired && !hasFile) {
                    alerts.push({
                        id: `${v.id}-${t.id}-missing`,
                        vessel: v.name,
                        document: t.name,
                        type: 'missing',
                        severity: 'high',
                        message: 'Required file missing',
                        date: '-'
                    })
                }

                // 2. Expiry Checks
                if (hasFile && doc?.expiryDate) {
                    const expiry = new Date(doc.expiryDate)
                    if (expiry < today) {
                        alerts.push({
                            id: `${v.id}-${t.id}-expired`,
                            vessel: v.name,
                            document: t.name,
                            type: 'expired',
                            severity: 'critical',
                            message: 'Document expired',
                            date: doc.expiryDate
                        })
                    } else if (expiry < thirtyDaysFromNow) {
                        alerts.push({
                            id: `${v.id}-${t.id}-soon`,
                            vessel: v.name,
                            document: t.name,
                            type: 'soon',
                            severity: 'medium',
                            message: 'Expiring soon',
                            date: doc.expiryDate
                        })
                    }
                }
            })
        })

        return alerts.filter(a => filter === 'all' || a.type === filter)
    }

    const alerts = getAllAlerts()

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Compliance Center</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>Centralized monitoring for all vessel document alerts and expiries.</p>
                </div>

                <div style={{ display: 'flex', gap: '8px', background: 'var(--table-header-bg)', padding: '4px', borderRadius: '8px' }}>
                    <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={getAllAlerts().length} />
                    <FilterButton active={filter === 'missing'} onClick={() => setFilter('missing')} label="Missing" color="var(--danger)" />
                    <FilterButton active={filter === 'expired'} onClick={() => setFilter('expired')} label="Expired" color="#ff4d4d" />
                    <FilterButton active={filter === 'soon'} onClick={() => setFilter('soon')} label="Expiring Soon" color="#ffcc00" />
                </div>
            </header>

            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                            <th style={{ padding: '16px' }}>Vessel</th>
                            <th style={{ padding: '16px' }}>Document Type</th>
                            <th style={{ padding: '16px' }}>Alert Type</th>
                            <th style={{ padding: '16px' }}>Details / Date</th>
                            <th style={{ padding: '16px', textAlign: 'right' }}>Severity</th>
                        </tr>
                    </thead>
                    <tbody>
                        {alerts.map(alert => (
                            <tr key={alert.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                <td style={{ padding: '16px', fontWeight: '600' }}>{alert.vessel}</td>
                                <td style={{ padding: '16px' }}>{alert.document}</td>
                                <td style={{ padding: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {alert.type === 'missing' && <ShieldAlert size={16} color="var(--danger)" />}
                                        {alert.type === 'expired' && <AlertCircle size={16} color="#ff4d4d" />}
                                        {alert.type === 'soon' && <Clock size={16} color="#ffcc00" />}
                                        <span style={{ textTransform: 'capitalize' }}>{alert.type.replace('-', ' ')}</span>
                                    </div>
                                </td>
                                <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    {alert.message} {alert.date !== '-' && `(${alert.date})`}
                                </td>
                                <td style={{ padding: '16px', textAlign: 'right' }}>
                                    <span style={{
                                        padding: '4px 10px',
                                        borderRadius: '20px',
                                        fontSize: '0.7rem',
                                        fontWeight: '700',
                                        textTransform: 'uppercase',
                                        background: alert.severity === 'critical' ? 'rgba(255, 77, 77, 0.2)' :
                                            alert.severity === 'high' ? 'rgba(255, 120, 77, 0.2)' : 'rgba(255, 204, 0, 0.15)',
                                        color: alert.severity === 'critical' ? '#ff4d4d' :
                                            alert.severity === 'high' ? '#ff784d' : '#ffcc00',
                                        border: `1px solid ${alert.severity === 'critical' ? 'rgba(255, 77, 77, 0.3)' : 'rgba(255, 120, 77, 0.3)'}`
                                    }}>
                                        {alert.severity}
                                    </span>
                                </td>
                            </tr>
                        ))}
                        {alerts.length === 0 && (
                            <tr>
                                <td colSpan={5} style={{ padding: '64px', textAlign: 'center' }}>
                                    <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '16px', opacity: 0.5 }} />
                                    <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>Fleet is fully compliant</div>
                                    <p style={{ color: 'var(--text-secondary)' }}>No alerts found for the selected filter.</p>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function FilterButton({ active, onClick, label, color, count }: any) {
    return (
        <button
            onClick={onClick}
            style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                background: active ? 'var(--bg-card-hover)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.85rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'var(--transition)'
            }}
        >
            {color && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></div>}
            {label}
            {count !== undefined && <span style={{ opacity: 0.5 }}>({count})</span>}
        </button>
    )
}
