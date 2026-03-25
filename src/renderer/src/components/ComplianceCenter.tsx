import { useState, useEffect } from 'react'
import { AlertCircle, Clock, CheckCircle, ShieldAlert, Shield, Eye, History, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileWarning, Database, RefreshCw, ChevronDown as ChevronDownIcon, Settings } from 'lucide-react'
import { Vessel, VesselDocument, DocumentType, ComplianceCheckLog, ComplianceCheckResult } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDate, formatDateTime } from '../utils/dateUtils'

interface ComplianceCenterProps {
    onNavigateToVessel?: (vesselId: string, section?: 'policies') => void
}

export default function ComplianceCenter({ onNavigateToVessel }: ComplianceCenterProps) {
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [docs, setDocs] = useState<VesselDocument[]>([])
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [filter, setFilter] = useState<'all' | 'missing' | 'expired' | 'soon'>('all')
    const [activeTab, setActiveTab] = useState<'documents' | 'policies' | 'sanctions' | 'dataQuality'>('documents')
    const { showSuccess } = useToast()
    const { theme } = useTheme()
    const { hasPermission } = useAuth()
    const isLight = theme === 'light'
    const canReview = hasPermission('compliance:review')

    // Sanctions compliance state
    const [pendingResults, setPendingResults] = useState<ComplianceCheckResult[]>([])
    const [checkLogs, setCheckLogs] = useState<ComplianceCheckLog[]>([])
    const [policyAlerts, setPolicyAlerts] = useState<any[]>([])
    const [expandedResult, setExpandedResult] = useState<string | null>(null)
    const [resultsPage, setResultsPage] = useState(1)
    const [resultsLimit, setResultsLimit] = useState(10)
    const [resultsTotal, setResultsTotal] = useState(0)
    const [resultsTotalPages, setResultsTotalPages] = useState(0)

    // Data Quality state
    const [validationRules, setValidationRules] = useState<{
        id: string; name: string; description: string; category: string
        count: number; items: { id: string; name: string; type: string }[]
    }[]>([])
    const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set())
    const [validationLoading, setValidationLoading] = useState(false)
    const [showRuleSettings, setShowRuleSettings] = useState(false)
    const [ruleToggles, setRuleToggles] = useState<Record<string, boolean>>({})

    useEffect(() => {
        loadData()
        loadSanctionsData()
        loadPolicyAlerts()
        window.api.getSetting('data_validation_rules').then(raw => {
            if (raw) {
                try { setRuleToggles(JSON.parse(raw)) } catch { /* ignore */ }
            }
        })
    }, [])

    useEffect(() => { loadSanctionsData() }, [resultsPage, resultsLimit])

    const loadData = async () => {
        try {
            const [vData, dData, tData] = await Promise.all([
                window.api.getVessels(),
                window.api.getVesselDocuments(),
                window.api.getDocumentTypes()
            ])
            setVessels(Array.isArray(vData) ? vData.filter((v: any) => v.isActive !== false) : [])
            setDocs(Array.isArray(dData) ? dData : [])
            setDocTypes(Array.isArray(tData) ? tData : [])
        } catch (error) {
            console.error('ComplianceCenter: Failed to load data:', error)
            setVessels([])
            setDocs([])
            setDocTypes([])
        }
    }

    const loadSanctionsData = async () => {
        try {
            const [result, logs] = await Promise.all([
                window.api.complianceGetCheckResultsPaginated({
                    page: resultsPage,
                    limit: resultsLimit,
                    status: 'pending_review'
                }),
                window.api.complianceGetCheckLogs()
            ])
            setPendingResults(Array.isArray(result?.data) ? result.data : [])
            setResultsTotal(result?.total ?? 0)
            setResultsTotalPages(result?.totalPages ?? 0)
            setCheckLogs(Array.isArray(logs) ? logs : [])
        } catch (error) {
            console.error('ComplianceCenter: Failed to load sanctions data:', error)
            // Set empty arrays to prevent blank screen
            setPendingResults([])
            setResultsTotal(0)
            setResultsTotalPages(0)
            setCheckLogs([])
        }
    }

    const loadPolicyAlerts = async () => {
        try {
            const alerts = await window.api.getExpiredActivePolicies()
            setPolicyAlerts(Array.isArray(alerts) ? alerts : [])
        } catch {
            setPolicyAlerts([])
        }
    }

    const loadDataValidation = async () => {
        setValidationLoading(true)
        try {
            const result = await window.api.complianceGetDataValidation()
            if (result && Array.isArray(result.rules)) {
                setValidationRules(result.rules)
            } else {
                setValidationRules([])
            }
        } catch {
            setValidationRules([])
        } finally {
            setValidationLoading(false)
        }
    }

    const toggleRule = (ruleId: string) => {
        setExpandedRules(prev => {
            const next = new Set(prev)
            if (next.has(ruleId)) next.delete(ruleId)
            else next.add(ruleId)
            return next
        })
    }

    const toggleRuleEnabled = (ruleId: string) => {
        const next = { ...ruleToggles, [ruleId]: !(ruleToggles[ruleId] !== false) }
        setRuleToggles(next)
        window.api.setSetting('data_validation_rules', JSON.stringify(next))
    }

    const handleDecideMatch = async (resultId: string, decision: 'sanctioned' | 'cleared') => {
        try {
            await window.api.complianceDecideResult(resultId, decision)
            showSuccess(`Match marked as ${decision}`)
            loadSanctionsData()
        } catch (error: any) {
            console.error('Failed to decide match:', error)
        }
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
            <header style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                    <div>
                        <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Compliance Center</h1>
                        <p style={{ color: 'var(--text-secondary)' }}>Centralized monitoring for document alerts and sanctions screening.</p>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div role="tablist" aria-label="Compliance sections" style={{ display: 'flex', gap: '4px', background: 'var(--table-header-bg)', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
                    <button
                        id="tab-documents"
                        role="tab"
                        aria-selected={activeTab === 'documents'}
                        aria-controls="panel-documents"
                        onClick={() => setActiveTab('documents')}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'documents' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'documents' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'documents' ? '600' : '400',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <AlertCircle size={16} />
                        Document Alerts
                        {alerts.length > 0 && (
                            <span style={{ background: 'rgba(255, 77, 77, 0.2)', color: 'var(--danger)', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
                                {alerts.length}
                            </span>
                        )}
                    </button>
                    <button
                        id="tab-policies"
                        role="tab"
                        aria-selected={activeTab === 'policies'}
                        aria-controls="panel-policies"
                        onClick={() => setActiveTab('policies')}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'policies' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'policies' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'policies' ? '600' : '400',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <FileWarning size={16} />
                        Policy Alerts
                        {policyAlerts.length > 0 && (
                            <span style={{ background: 'rgba(255, 165, 0, 0.2)', color: '#ffa500', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
                                {policyAlerts.length}
                            </span>
                        )}
                    </button>
                    <button
                        id="tab-sanctions"
                        role="tab"
                        aria-selected={activeTab === 'sanctions'}
                        aria-controls="panel-sanctions"
                        onClick={() => setActiveTab('sanctions')}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'sanctions' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'sanctions' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'sanctions' ? '600' : '400',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <Shield size={16} />
                        Sanctions Screening
                        {resultsTotal > 0 && (
                            <span style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#ffc107', padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem' }}>
                                {resultsTotal}
                            </span>
                        )}
                    </button>
                    <button
                        id="tab-dataQuality"
                        role="tab"
                        aria-selected={activeTab === 'dataQuality'}
                        aria-controls="panel-dataQuality"
                        onClick={() => { setActiveTab('dataQuality'); if (validationRules.length === 0) loadDataValidation() }}
                        style={{
                            padding: '10px 24px',
                            borderRadius: '8px',
                            border: 'none',
                            background: activeTab === 'dataQuality' ? 'var(--bg-card)' : 'transparent',
                            color: activeTab === 'dataQuality' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'dataQuality' ? '600' : '400',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <Database size={16} />
                        Data Quality
                    </button>
                </div>
            </header>

            {activeTab === 'documents' && (
                <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents">
                    <div style={{ display: 'flex', gap: '8px', background: 'var(--table-header-bg)', padding: '4px', borderRadius: '8px', marginBottom: '20px', width: 'fit-content' }}>
                        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={getAllAlerts().length} />
                        <FilterButton active={filter === 'missing'} onClick={() => setFilter('missing')} label="Missing" color="var(--danger)" />
                        <FilterButton active={filter === 'expired'} onClick={() => setFilter('expired')} label="Expired" color="#ff4d4d" />
                        <FilterButton active={filter === 'soon'} onClick={() => setFilter('soon')} label="Expiring Soon" color="#ffcc00" />
                    </div>

                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Document compliance alerts</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Vessel</th>
                                    <th scope="col" style={{ padding: '16px' }}>Document Type</th>
                                    <th scope="col" style={{ padding: '16px' }}>Alert Type</th>
                                    <th scope="col" style={{ padding: '16px' }}>Details / Date</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Severity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {alerts.map(alert => {
                                    const rowBorder = alert.type === 'expired' ? 'var(--danger)' : alert.type === 'missing' ? 'var(--danger)' : alert.type === 'soon' ? '#e6a800' : 'transparent'
                                    return (
                                    <tr key={alert.id} style={{ borderBottom: '1px solid var(--table-border)', borderLeft: `4px solid ${rowBorder}` }}>
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
                                    )
                                })}
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
            )}

            {activeTab === 'policies' && (
                <div role="tabpanel" id="panel-policies" aria-labelledby="tab-policies">
                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Policy expiry alerts</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Vessel</th>
                                    <th scope="col" style={{ padding: '16px' }}>IMO</th>
                                    <th scope="col" style={{ padding: '16px' }}>Policy Type</th>
                                    <th scope="col" style={{ padding: '16px' }}>Policy Number</th>
                                    <th scope="col" style={{ padding: '16px' }}>End Date</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Days Overdue</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'center' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {policyAlerts.map((alert: any, idx: number) => {
                                    const endDate = alert.endDate ? new Date(alert.endDate) : null
                                    const today = new Date()
                                    const daysOverdue = endDate ? Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24)) : 0
                                    return (
                                        <tr key={alert.id || idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                            <td style={{ padding: '16px', fontWeight: '600' }}>{alert.vesselName}</td>
                                            <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{alert.imoNumber}</td>
                                            <td style={{ padding: '16px' }}>{alert.policyTypeName}</td>
                                            <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{alert.policyNumber || '-'}</td>
                                            <td style={{ padding: '16px', color: '#ff784d' }}>{alert.endDate || '-'}</td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <span style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: '700',
                                                    background: daysOverdue > 30 ? 'rgba(255, 77, 77, 0.2)' : 'rgba(255, 165, 0, 0.2)',
                                                    color: daysOverdue > 30 ? '#ff4d4d' : '#ffa500'
                                                }}>
                                                    {daysOverdue > 0 ? `${daysOverdue} days` : 'Today'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => onNavigateToVessel?.(alert.vesselId, 'policies')}
                                                    className="btn-secondary"
                                                    style={{ padding: '4px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                >
                                                    <Eye size={14} />
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                                {policyAlerts.length === 0 && (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '64px', textAlign: 'center' }}>
                                            <CheckCircle size={48} color="var(--success)" style={{ marginBottom: '16px', opacity: 0.5 }} />
                                            <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>No policy alerts</div>
                                            <p style={{ color: 'var(--text-secondary)' }}>All active policies have valid end dates.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'dataQuality' && (
                <div role="tabpanel" id="panel-dataQuality" aria-labelledby="tab-dataQuality">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Database size={20} color="var(--accent-primary)" />
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Data Quality</h3>
                            {validationRules.length > 0 && (() => {
                                const totalIssues = validationRules.filter(r => ruleToggles[r.id] !== false).reduce((sum, r) => sum + r.count, 0)
                                return (
                                    <span style={{
                                        padding: '2px 10px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: '700',
                                        background: totalIssues > 0 ? 'rgba(255, 77, 77, 0.15)' : 'rgba(0, 255, 136, 0.15)',
                                        color: totalIssues > 0 ? 'var(--danger)' : 'var(--success)'
                                    }}>
                                        {totalIssues} issue{totalIssues !== 1 ? 's' : ''}
                                    </span>
                                )
                            })()}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => setShowRuleSettings(!showRuleSettings)}
                                title="Validation Rules Settings"
                                style={{
                                    background: showRuleSettings ? 'rgba(0,210,255,0.1)' : 'transparent',
                                    border: showRuleSettings ? '1px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                                    borderRadius: '6px', cursor: 'pointer', padding: '7px 10px',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    color: showRuleSettings ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                    fontSize: '0.82rem'
                                }}
                                className="hover-effect"
                            >
                                <Settings size={14} />
                            </button>
                            <button
                                onClick={loadDataValidation}
                                disabled={validationLoading}
                                className="btn-secondary"
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
                            >
                                <RefreshCw size={14} style={{ animation: validationLoading ? 'spin 1s linear infinite' : 'none' }} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {showRuleSettings && validationRules.length > 0 && (
                        <div style={{
                            marginBottom: '16px', padding: '16px 20px', borderRadius: '10px',
                            background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                            border: '1px solid var(--glass-border)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                <Settings size={16} color="var(--accent-primary)" />
                                <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>Validation Rules Settings</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {validationRules.map(rule => {
                                    const enabled = ruleToggles[rule.id] !== false
                                    return (
                                        <div
                                            key={rule.id}
                                            style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '8px 12px', borderRadius: '8px',
                                                background: isLight ? '#fff' : 'rgba(255,255,255,0.02)',
                                                border: '1px solid var(--glass-border)',
                                                opacity: enabled ? 1 : 0.5
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: '600', fontSize: '0.84rem' }}>{rule.name}</div>
                                                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '1px' }}>{rule.description}</div>
                                            </div>
                                            <button
                                                onClick={() => toggleRuleEnabled(rule.id)}
                                                style={{
                                                    width: '40px', height: '22px', borderRadius: '11px', border: 'none',
                                                    background: enabled ? 'var(--accent-primary)' : (isLight ? '#ccc' : 'rgba(255,255,255,0.15)'),
                                                    cursor: 'pointer', position: 'relative', flexShrink: 0,
                                                    transition: 'background 0.2s'
                                                }}
                                                title={enabled ? 'Disable rule' : 'Enable rule'}
                                            >
                                                <span style={{
                                                    position: 'absolute', top: '2px',
                                                    left: enabled ? '20px' : '2px',
                                                    width: '18px', height: '18px', borderRadius: '50%',
                                                    background: '#fff', transition: 'left 0.2s',
                                                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                                }} />
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {validationLoading && validationRules.length === 0 ? (
                        <div className="glass-card" style={{ padding: '64px', textAlign: 'center' }}>
                            <RefreshCw size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.3, display: 'block', margin: '0 auto 14px' }} />
                            <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>Running validation checks...</div>
                        </div>
                    ) : (
                        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Data quality validation rules</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '16px', width: '32px' }}></th>
                                        <th scope="col" style={{ padding: '16px' }}>Rule</th>
                                        <th scope="col" style={{ padding: '16px' }}>Category</th>
                                        <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Violations</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {validationRules.filter(r => ruleToggles[r.id] !== false).map(rule => {
                                        const isExpanded = expandedRules.has(rule.id)
                                        const hasIssues = rule.count > 0
                                        return (
                                            <>{/* Fragment wrapper for rule + expanded rows */}
                                                <tr
                                                    key={rule.id}
                                                    onClick={() => hasIssues && toggleRule(rule.id)}
                                                    style={{
                                                        borderBottom: isExpanded ? 'none' : '1px solid var(--table-border)',
                                                        cursor: hasIssues ? 'pointer' : 'default',
                                                        borderLeft: `4px solid ${hasIssues ? 'var(--danger)' : 'var(--success)'}`
                                                    }}
                                                >
                                                    <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                                                        {hasIssues ? (
                                                            <ChevronDownIcon size={16} color="var(--text-secondary)" style={{ transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                                                        ) : (
                                                            <CheckCircle size={16} color="var(--success)" />
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <div style={{ fontWeight: '600', fontSize: '0.88rem' }}>{rule.name}</div>
                                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{rule.description}</div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600',
                                                            background: 'rgba(0, 210, 255, 0.1)', color: 'var(--accent-primary)', textTransform: 'uppercase'
                                                        }}>
                                                            {rule.category}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <span style={{
                                                            padding: '4px 12px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: '800',
                                                            background: hasIssues ? 'rgba(255, 77, 77, 0.15)' : 'rgba(0, 255, 136, 0.15)',
                                                            color: hasIssues ? 'var(--danger)' : 'var(--success)'
                                                        }}>
                                                            {rule.count}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {isExpanded && rule.items.length > 0 && (
                                                    <tr key={`${rule.id}-items`}>
                                                        <td colSpan={4} style={{ padding: '0 16px 16px 48px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.1)', borderBottom: '1px solid var(--table-border)' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '240px', overflowY: 'auto' }}>
                                                                {rule.items.map((item, idx) => (
                                                                    <div
                                                                        key={item.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            if (item.type === 'vessel' && onNavigateToVessel) onNavigateToVessel(item.id)
                                                                        }}
                                                                        style={{
                                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                                            padding: '6px 10px', borderRadius: '6px',
                                                                            background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'),
                                                                            cursor: (item.type === 'vessel' && onNavigateToVessel) ? 'pointer' : 'default',
                                                                            fontSize: '0.82rem'
                                                                        }}
                                                                    >
                                                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                                                                        <span style={{ fontWeight: '500' }}>{item.name}</span>
                                                                        <span style={{
                                                                            marginLeft: 'auto', fontSize: '0.68rem', fontWeight: '600',
                                                                            padding: '1px 6px', borderRadius: '4px',
                                                                            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                                                                            color: 'var(--text-secondary)', textTransform: 'uppercase'
                                                                        }}>
                                                                            {item.type}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        )
                                    })}
                                    {validationRules.length === 0 && !validationLoading && (
                                        <tr>
                                            <td colSpan={4} style={{ padding: '64px', textAlign: 'center' }}>
                                                <Database size={48} style={{ opacity: 0.15, marginBottom: '16px' }} />
                                                <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>No validation data</div>
                                                <p style={{ color: 'var(--text-secondary)' }}>Click Refresh to run data quality checks.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'sanctions' && (() => {
                return (
                    <div role="tabpanel" id="panel-sanctions" aria-labelledby="tab-sanctions" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
                        {/* Pending Reviews */}
                        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <ShieldAlert size={20} color="#ffc107" />
                                <h3 style={{ margin: 0 }}>Pending Review</h3>
                                {resultsTotal > 0 && (
                                    <span style={{ background: 'rgba(255, 193, 7, 0.2)', color: '#ffc107', padding: '2px 10px', borderRadius: '10px', fontSize: '0.8rem', marginLeft: 'auto' }}>
                                        {resultsTotal} pending
                                    </span>
                                )}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Pending sanctions reviews</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '12px 16px' }}>Name</th>
                                        <th scope="col" style={{ padding: '12px 16px' }}>Type</th>
                                        <th scope="col" style={{ padding: '12px 16px' }}>Match Score</th>
                                        <th scope="col" style={{ padding: '12px 16px' }}>Date</th>
                                        <th scope="col" style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pendingResults.map(result => (
                                        <>
                                            <tr key={result.id} style={{ borderBottom: expandedResult === result.id ? 'none' : '1px solid var(--table-border)' }}>
                                                <td style={{ padding: '14px 16px', fontWeight: '600' }}>{result.entityName}</td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        background: result.entityType === 'vessel' ? 'rgba(0, 210, 255, 0.1)' : 'rgba(180, 140, 255, 0.1)',
                                                        color: result.entityType === 'vessel' ? '#00d2ff' : '#b48cff',
                                                        textTransform: 'capitalize'
                                                    }}>
                                                        {result.entityType}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px' }}>
                                                    <span style={{
                                                        fontWeight: '600',
                                                        color: Number(result.matchScore) >= 90 ? '#ff4d4d' : Number(result.matchScore) >= 80 ? '#ffc107' : 'var(--text-secondary)'
                                                    }}>
                                                        {Number(result.matchScore || 0).toFixed(0)}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                    {result.createdAt ? formatDate(result.createdAt) : '-'}
                                                </td>
                                                <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                        <button
                                                            onClick={() => setExpandedResult(expandedResult === result.id ? null : result.id)}
                                                            aria-expanded={expandedResult === result.id}
                                                            style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}
                                                        >
                                                            <Eye size={14} />
                                                            {expandedResult === result.id ? 'Hide' : 'View'}
                                                        </button>
                                                        {canReview && (
                                                            <button
                                                                onClick={() => handleDecideMatch(result.id, 'cleared')}
                                                                title="False positive - this entity is not sanctioned"
                                                                style={{ background: 'rgba(0, 255, 136, 0.1)', border: '1px solid rgba(0, 255, 136, 0.3)', color: '#00ff88', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                                                            >
                                                                <CheckCircle size={14} />
                                                                Cleared
                                                            </button>
                                                        )}
                                                        {canReview && (
                                                            <button
                                                                onClick={() => handleDecideMatch(result.id, 'sanctioned')}
                                                                title="True positive - this entity is sanctioned"
                                                                style={{ background: 'rgba(255, 77, 77, 0.1)', border: '1px solid rgba(255, 77, 77, 0.3)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem' }}
                                                            >
                                                                <ShieldAlert size={14} />
                                                                Sanctioned
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedResult === result.id && (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '0 16px 16px 16px', background: isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(0, 0, 0, 0.1)' }}>
                                                        <div style={{ padding: '12px', background: 'var(--bg-card)', borderRadius: '8px', fontSize: '0.85rem' }}>
                                                            <div style={{ fontWeight: '600', marginBottom: '8px' }}>Match Details:</div>
                                                            {(() => {
                                                                try {
                                                                    const matches = JSON.parse(result.matchDetails || '[]')
                                                                    return matches.map((m: any, i: number) => (
                                                                        <div key={i} style={{ marginBottom: '8px', padding: '8px', background: isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(0, 0, 0, 0.2)', borderRadius: '4px' }}>
                                                                            <div><strong>Source:</strong> {m.source || 'Unknown'}</div>
                                                                            <div><strong>Names:</strong> {(m.names || []).join(', ')}</div>
                                                                            <div><strong>Score:</strong> {((m.score || 0) * 100).toFixed(0)}%</div>
                                                                        </div>
                                                                    ))
                                                                } catch {
                                                                    return <div>Unable to parse match details</div>
                                                                }
                                                            })()}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    ))}
                                    {pendingResults.length === 0 && (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '48px', textAlign: 'center' }}>
                                                <CheckCircle size={40} color="var(--success)" style={{ marginBottom: '12px', opacity: 0.5 }} />
                                                <div style={{ fontWeight: '600' }}>No pending reviews</div>
                                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>All sanctions matches have been reviewed.</p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                            {resultsTotalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--table-border)' }}>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                                        Showing {((resultsPage - 1) * resultsLimit) + 1} to {Math.min(resultsPage * resultsLimit, resultsTotal)} of {resultsTotal} results
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button className="btn-secondary" disabled={resultsPage === 1} onClick={() => setResultsPage(1)} style={{ padding: '6px' }} aria-label="First page"><ChevronsLeft size={16} /></button>
                                        <button className="btn-secondary" disabled={resultsPage === 1} onClick={() => setResultsPage(p => Math.max(1, p - 1))} style={{ padding: '6px' }} aria-label="Previous page"><ChevronLeft size={16} /></button>
                                        <span style={{ margin: '0 8px', fontSize: '0.9rem' }}>Page {resultsPage} of {resultsTotalPages}</span>
                                        <button className="btn-secondary" disabled={resultsPage === resultsTotalPages} onClick={() => setResultsPage(p => Math.min(resultsTotalPages, p + 1))} style={{ padding: '6px' }} aria-label="Next page"><ChevronRight size={16} /></button>
                                        <button className="btn-secondary" disabled={resultsPage === resultsTotalPages} onClick={() => setResultsPage(resultsTotalPages)} style={{ padding: '6px' }} aria-label="Last page"><ChevronsRight size={16} /></button>
                                        <select value={resultsLimit} onChange={(e) => setResultsLimit(Number(e.target.value))} style={{ marginLeft: '16px', padding: '4px', borderRadius: '4px', fontSize: '0.9rem' }} aria-label="Results per page">
                                            <option value="10">10 / page</option>
                                            <option value="25">25 / page</option>
                                            <option value="50">50 / page</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Recent Check History */}
                        <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--table-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <History size={20} color="var(--accent-primary)" />
                                <h3 style={{ margin: 0 }}>Check History</h3>
                            </div>
                            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                                {checkLogs.map(log => (
                                    <div key={log.id} style={{ padding: '14px 20px', borderBottom: '1px solid var(--table-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                                {log.runAt ? formatDateTime(log.runAt) : '-'}
                                            </span>
                                            <span style={{
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: '600',
                                                background: log.status === 'completed' ? 'rgba(0, 255, 136, 0.1)' :
                                                    log.status === 'failed' ? 'rgba(255, 77, 77, 0.1)' : 'rgba(0, 210, 255, 0.1)',
                                                color: log.status === 'completed' ? '#00ff88' :
                                                    log.status === 'failed' ? '#ff4d4d' : '#00d2ff',
                                                textTransform: 'uppercase'
                                            }}>
                                                {log.status}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.9rem' }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>Checked:</span> {log.totalChecked} |{' '}
                                            <span style={{ color: log.matchesFound > 0 ? '#ffc107' : 'var(--text-secondary)' }}>
                                                Matches: {log.matchesFound}
                                            </span>
                                        </div>
                                        {log.error && (
                                            <div style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: '4px' }}>
                                                Error: {log.error}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {checkLogs.length === 0 && (
                                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        No compliance checks have been run yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )
            })()}
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
