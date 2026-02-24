import { useState, useEffect, useMemo } from 'react'
import { Activity, AlertTriangle, CheckCircle, Clock, AlertCircle, Ship, FileText, Users, Shield, Wrench, Calendar } from 'lucide-react'
import { Vessel, VesselDocument, DocumentType, Entity } from '../../../shared/types'

export default function Dashboard({ onViewAlerts }: { onViewAlerts: () => void }) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docs, setDocs] = useState<VesselDocument[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [fleets, setFleets] = useState<any[]>([])
    const [entities, setEntities] = useState<Entity[]>([])
    const [openDefects, setOpenDefects] = useState<any[]>([])
    const [pendingSanctions, setPendingSanctions] = useState<any[]>([])

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const [vData, dData, tData, fData, eData] = await Promise.all([
            window.api.getVessels(),
            window.api.getVesselDocuments(),
            window.api.getDocumentTypes(),
            window.api.getFleets(),
            window.api.getEntities()
        ])
        setVessels(vData)
        setDocs(dData)
        setDocTypes(tData)
        setFleets(fData)
        setEntities(eData)

        // Load additional data separately so failures don't break core
        try {
            const defects = await window.api.getOpenDefectsByVessel()
            setOpenDefects(defects || [])
        } catch { /* ignore */ }
        try {
            const pending = await window.api.complianceGetPendingResults()
            setPendingSanctions(pending || [])
        } catch { /* ignore */ }
    }

    const activeVessels = useMemo(() => vessels.filter(v => v.isActive), [vessels])

    // O(1) doc lookup map keyed by "vesselId:docTypeId"
    const docMap = useMemo(() => {
        const map = new Map<string, VesselDocument>()
        for (const d of docs) {
            map.set(`${d.vesselId}:${d.documentTypeId}`, d)
        }
        return map
    }, [docs])

    // Compute all alerts once with O(1) lookups
    const allAlerts = useMemo(() => {
        const today = new Date()
        const thirtyDaysFromNow = new Date()
        thirtyDaysFromNow.setDate(today.getDate() + 30)
        const ninetyDaysFromNow = new Date()
        ninetyDaysFromNow.setDate(today.getDate() + 90)
        const alerts: { vessel: string; vesselId: string; fleetId: string | undefined; document: string; msg: string; type: string; expiryDate?: string }[] = []

        for (const v of vessels) {
            for (const t of docTypes) {
                const doc = docMap.get(`${v.id}:${t.id}`)
                const isRequired = doc ? doc.required : t.required
                const hasFile = !!doc?.filePath

                // For annual docs, use policy expiry
                const effectiveExpiry = (t.annualRenewal && v.policyExpiryDate) ? v.policyExpiryDate : doc?.expiryDate

                if (isRequired && !hasFile) {
                    alerts.push({ vessel: v.name, vesselId: v.id, fleetId: v.fleetId, document: t.name, msg: 'Missing File', type: 'missing' })
                } else if (hasFile && effectiveExpiry) {
                    const expiry = new Date(effectiveExpiry)
                    if (expiry < today) {
                        alerts.push({ vessel: v.name, vesselId: v.id, fleetId: v.fleetId, document: t.name, msg: 'Expired', type: 'expired', expiryDate: effectiveExpiry })
                    } else if (expiry < thirtyDaysFromNow) {
                        alerts.push({ vessel: v.name, vesselId: v.id, fleetId: v.fleetId, document: t.name, msg: 'Expiring Soon', type: 'soon', expiryDate: effectiveExpiry })
                    } else if (expiry < ninetyDaysFromNow) {
                        alerts.push({ vessel: v.name, vesselId: v.id, fleetId: v.fleetId, document: t.name, msg: 'Expiring in 90 days', type: 'upcoming', expiryDate: effectiveExpiry })
                    }
                }
            }
        }
        return alerts
    }, [vessels, docTypes, docMap])

    const missingCount = useMemo(() => allAlerts.filter(a => a.type === 'missing').length, [allAlerts])
    const expiredCount = useMemo(() => allAlerts.filter(a => a.type === 'expired').length, [allAlerts])
    const soonCount = useMemo(() => allAlerts.filter(a => a.type === 'soon').length, [allAlerts])

    const globalCompliance = useMemo(() => {
        if (vessels.length === 0 || docTypes.length === 0) return 100
        const criticalCount = allAlerts.filter(a => a.type === 'missing' || a.type === 'expired').length
        const total = vessels.length * docTypes.length
        return Math.round(((total - criticalCount) / total) * 100)
    }, [vessels, docTypes, allAlerts])

    // Policy expiry stats
    const policyStats = useMemo(() => {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const thirtyDays = new Date(today)
        thirtyDays.setDate(today.getDate() + 30)
        const ninetyDays = new Date(today)
        ninetyDays.setDate(today.getDate() + 90)

        let expired = 0, expiringSoon = 0, within90 = 0, noExpiry = 0
        const expiringVessels: { name: string; date: string }[] = []

        for (const v of activeVessels) {
            if (!v.policyExpiryDate) {
                noExpiry++
                continue
            }
            const exp = new Date(v.policyExpiryDate)
            if (exp < today) {
                expired++
                expiringVessels.push({ name: v.name, date: v.policyExpiryDate })
            } else if (exp < thirtyDays) {
                expiringSoon++
                expiringVessels.push({ name: v.name, date: v.policyExpiryDate })
            } else if (exp < ninetyDays) {
                within90++
                expiringVessels.push({ name: v.name, date: v.policyExpiryDate })
            }
        }

        expiringVessels.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        return { expired, expiringSoon, within90, noExpiry, expiringVessels: expiringVessels.slice(0, 5) }
    }, [activeVessels])

    // Entity compliance stats
    const entityStats = useMemo(() => {
        let totalRequired = 0, totalCompliant = 0
        const companies = entities.filter(e => e.type === 'company')
        const persons = entities.filter(e => e.type === 'person')

        companies.forEach(e => {
            totalRequired += 3
            if (e.certificateOfIncorporationPath) totalCompliant++
            if (e.articlesOfAssociationPath) totalCompliant++
            if (e.kycFilePath) totalCompliant++
        })
        persons.forEach(e => {
            totalRequired++
            if (e.passportFilePath) totalCompliant++
        })

        return {
            total: entities.length,
            companies: companies.length,
            persons: persons.length,
            compliance: totalRequired > 0 ? Math.round((totalCompliant / totalRequired) * 100) : 100,
            missing: totalRequired - totalCompliant
        }
    }, [entities])

    // Sanctions stats
    const sanctionsStats = useMemo(() => {
        const potentialMatch = [...entities, ...vessels].filter(
            (item: any) => item.ofacStatus === 'POTENTIAL_MATCH' || item.ofacStatus === 'MATCH' || item.ofacStatus === 'SANCTIONED'
        ).length
        return {
            pending: pendingSanctions.length,
            flagged: potentialMatch
        }
    }, [entities, vessels, pendingSanctions])

    const fleetMetrics = useMemo(() => {
        const getMetrics = (id: string, name: string, vesselCount: number, fleetAlerts: typeof allAlerts) => {
            const critical = fleetAlerts.filter(a => a.type === 'missing' || a.type === 'expired').length
            const total = vesselCount * docTypes.length
            return {
                id,
                name,
                vessels: vesselCount,
                compliance: total === 0 ? 100 : Math.round(((total - critical) / total) * 100),
                alerts: fleetAlerts.length,
                critical
            }
        }

        const results = fleets.map(f => {
            const fleetVesselIds = new Set(vessels.filter(v => v.fleetId === f.id).map(v => v.id))
            const fleetAlerts = allAlerts.filter(a => fleetVesselIds.has(a.vesselId))
            return getMetrics(f.id, f.name, fleetVesselIds.size, fleetAlerts)
        })

        const unassignedVessels = vessels.filter(v => !v.fleetId)
        if (unassignedVessels.length > 0) {
            const unassignedIds = new Set(unassignedVessels.map(v => v.id))
            const unassignedAlerts = allAlerts.filter(a => unassignedIds.has(a.vesselId))
            results.push(getMetrics('unassigned', 'Unassigned Vessels', unassignedVessels.length, unassignedAlerts))
        }

        return results.filter(m => m.vessels > 0)
    }, [fleets, vessels, docTypes, allAlerts])

    const fullyCompliantCount = useMemo(() => {
        const vesselsWithAlerts = new Set(allAlerts.filter(a => a.type === 'missing' || a.type === 'expired').map(a => a.vesselId))
        return activeVessels.length - vesselsWithAlerts.size
    }, [activeVessels, allAlerts])

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '32px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Real-time compliance monitoring across {activeVessels.length} active vessel{activeVessels.length !== 1 ? 's' : ''} and {entities.length} entit{entities.length !== 1 ? 'ies' : 'y'}.
                </p>
            </header>

            {/* Top Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px', marginBottom: '32px' }}>
                <StatCard icon={<Activity color="#00d2ff" />} label="Document Compliance" value={`${globalCompliance}%`} sub="Target: 100%" color={globalCompliance === 100 ? '#00ff88' : globalCompliance > 80 ? '#ffcc00' : '#ff4d4d'} />
                <StatCard icon={<Ship color="#00d2ff" />} label="Active Vessels" value={activeVessels.length} sub={`${fleets.length} fleet${fleets.length !== 1 ? 's' : ''}`} />
                <StatCard icon={<AlertTriangle color="#ff4d4d" />} label="Critical Issues" value={missingCount + expiredCount} sub={`${missingCount} missing, ${expiredCount} expired`} color={missingCount + expiredCount > 0 ? '#ff4d4d' : '#00ff88'} />
                <StatCard icon={<Clock color="#ffcc00" />} label="Expiring Soon" value={soonCount} sub="Within 30 days" color={soonCount > 0 ? '#ffcc00' : '#00ff88'} />
                <StatCard icon={<CheckCircle color="#00ff88" />} label="Fully Compliant" value={fullyCompliantCount} sub={`of ${activeVessels.length} vessels`} />
            </div>

            {/* Main Content Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                {/* Document Alerts */}
                <div className="glass-card" style={{ padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <FileText size={18} color="var(--accent-primary)" /> Document Alerts
                        </h3>
                        <button
                            onClick={onViewAlerts}
                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
                        >
                            View All
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {allAlerts.filter(a => a.type !== 'upcoming').slice(0, 6).map((alert, i) => (
                            <AlertRow key={i} alert={alert} />
                        ))}
                        {allAlerts.filter(a => a.type !== 'upcoming').length === 0 && (
                            <div style={{ color: 'var(--text-secondary)', padding: '20px', textAlign: 'center', fontSize: '0.9rem' }}>
                                <CheckCircle size={24} style={{ opacity: 0.3, marginBottom: '8px', display: 'block', margin: '0 auto 8px' }} />
                                All documents are compliant
                            </div>
                        )}
                    </div>
                </div>

                {/* Policy Expiry */}
                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Calendar size={18} color="var(--accent-primary)" /> Policy Expiry
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                        <MiniStat label="Expired" value={policyStats.expired} color="#ff4d4d" />
                        <MiniStat label="Within 30 Days" value={policyStats.expiringSoon} color="#ffcc00" />
                        <MiniStat label="Within 90 Days" value={policyStats.within90} color="#ff9f43" />
                        <MiniStat label="No Expiry Set" value={policyStats.noExpiry} color="var(--text-secondary)" />
                    </div>
                    {policyStats.expiringVessels.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--table-border)', paddingTop: '12px' }}>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: '600' }}>Upcoming Expirations</div>
                            {policyStats.expiringVessels.map((v, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.85rem', borderBottom: i < policyStats.expiringVessels.length - 1 ? '1px solid var(--table-border)' : 'none' }}>
                                    <span style={{ fontWeight: '600' }}>{v.name}</span>
                                    <span style={{ color: new Date(v.date) < new Date() ? '#ff4d4d' : '#ffcc00', fontSize: '0.8rem' }}>
                                        {new Date(v.date).toLocaleDateString()}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Second Row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                {/* Entity Compliance */}
                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={18} color="var(--accent-primary)" /> Entities
                    </h3>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: '700',
                            color: entityStats.compliance === 100 ? '#00ff88' : entityStats.compliance > 80 ? '#ffcc00' : '#ff4d4d'
                        }}>
                            {entityStats.compliance}%
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Document Compliance</div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid var(--table-border)', paddingTop: '12px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>{entityStats.total}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>{entityStats.companies}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Companies</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.2rem', fontWeight: '700' }}>{entityStats.persons}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Persons</div>
                        </div>
                    </div>
                    {entityStats.missing > 0 && (
                        <div style={{ marginTop: '12px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(255, 77, 77, 0.08)', fontSize: '0.8rem', color: 'var(--danger)', textAlign: 'center' }}>
                            {entityStats.missing} missing document{entityStats.missing !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>

                {/* Sanctions */}
                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={18} color="var(--accent-primary)" /> Sanctions
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{
                            padding: '16px',
                            borderRadius: '8px',
                            background: sanctionsStats.pending > 0 ? 'rgba(255, 200, 0, 0.08)' : 'rgba(0, 255, 136, 0.05)',
                            border: `1px solid ${sanctionsStats.pending > 0 ? 'rgba(255, 200, 0, 0.2)' : 'rgba(0, 255, 136, 0.15)'}`,
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '1.8rem', fontWeight: '700', color: sanctionsStats.pending > 0 ? '#ffcc00' : '#00ff88' }}>
                                {sanctionsStats.pending}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pending Reviews</div>
                        </div>
                        <div style={{
                            padding: '12px',
                            borderRadius: '8px',
                            background: sanctionsStats.flagged > 0 ? 'rgba(255, 77, 77, 0.08)' : 'rgba(0, 255, 136, 0.05)',
                            border: `1px solid ${sanctionsStats.flagged > 0 ? 'rgba(255, 77, 77, 0.2)' : 'rgba(0, 255, 136, 0.15)'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.85rem' }}>Flagged Entities/Vessels</span>
                            <span style={{ fontWeight: '700', color: sanctionsStats.flagged > 0 ? '#ff4d4d' : '#00ff88' }}>{sanctionsStats.flagged}</span>
                        </div>
                    </div>
                </div>

                {/* Open Defects */}
                <div className="glass-card" style={{ padding: '24px' }}>
                    <h3 style={{ margin: '0 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wrench size={18} color="var(--accent-primary)" /> Open Defects
                    </h3>
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <div style={{
                            fontSize: '2rem',
                            fontWeight: '700',
                            color: openDefects.length > 0 ? '#ff9f43' : '#00ff88'
                        }}>
                            {openDefects.length}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Across all vessels</div>
                    </div>
                    {openDefects.length > 0 ? (
                        <div style={{ borderTop: '1px solid var(--table-border)', paddingTop: '12px' }}>
                            {openDefects.slice(0, 4).map((d, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '0.8rem', borderBottom: i < Math.min(openDefects.length, 4) - 1 ? '1px solid var(--table-border)' : 'none' }}>
                                    <span style={{ fontWeight: '600' }}>{d.vesselName}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>
                                        {d.severity || 'N/A'}
                                    </span>
                                </div>
                            ))}
                            {openDefects.length > 4 && (
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '8px', textAlign: 'center' }}>
                                    +{openDefects.length - 4} more
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center' }}>
                            No open defects
                        </div>
                    )}
                </div>
            </div>

            {/* Fleet Compliance */}
            {fleetMetrics.length > 0 && (
                <section>
                    <h3 style={{ marginBottom: '20px' }}>Compliance by Fleet</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                        {fleetMetrics.map(fleet => (
                            <div key={fleet.id} className="glass-card" style={{
                                padding: '20px',
                                borderLeft: `4px solid ${fleet.compliance === 100 ? 'var(--success)' : fleet.compliance > 80 ? 'var(--warning)' : 'var(--danger)'}`
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                    <div style={{ fontWeight: '700', fontSize: '1.05rem' }}>{fleet.name}</div>
                                    <div style={{
                                        fontSize: '1.2rem',
                                        fontWeight: '800',
                                        color: fleet.compliance === 100 ? 'var(--success)' : fleet.compliance > 80 ? 'var(--warning)' : 'var(--danger)'
                                    }}>
                                        {fleet.compliance}%
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <div><Ship size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {fleet.vessels}</div>
                                    <div style={{ color: fleet.alerts > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                                        <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> {fleet.alerts} alert{fleet.alerts !== 1 ? 's' : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function StatCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color?: string }) {
    return (
        <div className="glass-card" style={{ padding: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div aria-hidden="true">{icon}</div>
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: '700', marginBottom: '4px', color: color || 'var(--text-primary)' }}>{value}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</div>
            {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{sub}</div>}
        </div>
    )
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div style={{
            padding: '10px 12px',
            borderRadius: '8px',
            background: 'var(--table-header-bg)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{label}</span>
            <span style={{ fontWeight: '700', color, fontSize: '1.1rem' }}>{value}</span>
        </div>
    )
}

function AlertRow({ alert }: { alert: { vessel: string; document: string; msg: string; type: string } }) {
    const getColor = () => {
        switch (alert.type) {
            case 'expired': return '#ff4d4d'
            case 'soon': return '#ffcc00'
            case 'missing': return '#ff4d4d'
            default: return 'var(--text-secondary)'
        }
    }

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            background: 'var(--table-header-bg)',
            borderRadius: '8px',
            borderLeft: `3px solid ${getColor()}`
        }}>
            <div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{alert.vessel}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{alert.document}</div>
            </div>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: '600',
                color: getColor(),
                textTransform: 'uppercase'
            }}>
                {alert.type === 'missing' ? <AlertCircle size={12} /> : alert.type === 'expired' ? <AlertTriangle size={12} /> : <Clock size={12} />}
                {alert.msg}
            </div>
        </div>
    )
}
