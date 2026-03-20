import { useState, useEffect, useMemo } from 'react'
import { ArrowLeft, FileCheck, Ship, DollarSign, Shield, FileText, Clock, ExternalLink } from 'lucide-react'
import { VesselDynamicPolicy, VesselPolicyValue, Vessel, Entity } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateShort, formatDate } from '../utils/dateUtils'

interface PolicyDetailProps {
    policyId: string
    onBack: () => void
    onNavigateToVessel?: (vesselId: string) => void
}

const statusColors: Record<string, { bg: string; text: string }> = {
    active: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    expired: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    cancelled: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    inactive: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' }
}

function getValueByNamePattern(values: VesselPolicyValue[], pattern: string): VesselPolicyValue | undefined {
    return values.find(v => v.characteristicName && v.characteristicName.toLowerCase().includes(pattern.toLowerCase()))
}

function formatPolicyDate(val?: VesselPolicyValue): string {
    if (!val?.valueDate) return '-'
    return formatDateShort(val.valueDate)
}

function formatAmount(amount?: number, currency?: string): string {
    if (amount == null) return '-'
    return `${currency || 'USD'} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PolicyDetail({ policyId, onBack, onNavigateToVessel }: PolicyDetailProps) {
    const [policy, setPolicy] = useState<VesselDynamicPolicy | null>(null)
    const [vessel, setVessel] = useState<Vessel | null>(null)
    const [customer, setCustomer] = useState<Entity | null>(null)
    const [loading, setLoading] = useState(true)
    const { showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [policyId])

    const loadData = async () => {
        setLoading(true)
        try {
            // Load all policies to find the one we want (with values)
            const allPolicies = await window.api.getAllVesselDynamicPolicies()
            const found = Array.isArray(allPolicies)
                ? allPolicies.find((p: VesselDynamicPolicy) => p.id === policyId)
                : null

            if (!found) {
                showError('Policy not found')
                onBack()
                return
            }

            setPolicy(found)

            // Load vessel
            const vessels = await window.api.getVessels()
            const v = Array.isArray(vessels) ? vessels.find((vs: Vessel) => vs.id === found.vesselId) : null
            setVessel(v || null)

            // Load customer
            if (v?.customerId) {
                const entities = await window.api.getEntities()
                const cust = Array.isArray(entities) ? entities.find((e: Entity) => e.id === v.customerId) : null
                setCustomer(cust || null)
            }
        } catch (err: any) {
            showError(err.message || 'Failed to load policy')
        } finally {
            setLoading(false)
        }
    }

    // Extract key dates and amounts from policy values
    const policyData = useMemo(() => {
        if (!policy?.values) return {}
        const values = policy.values
        const inception = getValueByNamePattern(values, 'inception') || getValueByNamePattern(values, 'start')
        const expiry = getValueByNamePattern(values, 'end') || getValueByNamePattern(values, 'expiry')
        const premium = values.find(v => v.fieldType === 'amount' && v.characteristicName?.toLowerCase().includes('premium'))
        const deductible = values.find(v => v.fieldType === 'amount' && v.characteristicName?.toLowerCase().includes('deductible'))
        const limit = values.find(v => v.fieldType === 'amount' && v.characteristicName?.toLowerCase().includes('limit'))

        return { inception, expiry, premium, deductible, limit }
    }, [policy])

    // Group values by field type for display
    const groupedValues = useMemo(() => {
        if (!policy?.values) return { dates: [], amounts: [], texts: [], booleans: [] }
        const dates: VesselPolicyValue[] = []
        const amounts: VesselPolicyValue[] = []
        const texts: VesselPolicyValue[] = []
        const booleans: VesselPolicyValue[] = []

        for (const v of policy.values) {
            if (v.fieldType === 'date') dates.push(v)
            else if (v.fieldType === 'amount') amounts.push(v)
            else if (v.fieldType === 'boolean') booleans.push(v)
            else texts.push(v)
        }

        return { dates, amounts, texts, booleans }
    }, [policy])

    const cardStyle: React.CSSProperties = {
        background: isLight ? '#ffffff' : 'var(--bg-card)',
        border: '1px solid var(--glass-border)',
        borderRadius: '12px',
        padding: '20px',
        marginBottom: '16px'
    }

    const cardHeaderStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '1px solid var(--glass-border)'
    }

    const cardTitleStyle: React.CSSProperties = {
        fontSize: '0.95rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--text-primary)'
    }

    const labelStyle: React.CSSProperties = {
        fontSize: '0.72rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color: 'var(--text-secondary)',
        marginBottom: '4px'
    }

    const valueStyle: React.CSSProperties = {
        fontSize: '0.88rem',
        color: 'var(--text-primary)',
        fontWeight: 500
    }

    if (loading) {
        return (
            <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Loading policy...
            </div>
        )
    }

    if (!policy) return null

    const sc = statusColors[policy.status] || statusColors.inactive

    return (
        <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
                <button
                    onClick={onBack}
                    className="btn-secondary"
                    style={{ padding: '8px', display: 'flex', alignItems: 'center' }}
                    title="Back to Policies"
                >
                    <ArrowLeft size={18} />
                </button>
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h1 style={{ fontSize: '1.6rem', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FileCheck size={26} />
                            {policy.policyNumber || 'Untitled Policy'}
                        </h1>
                        <span style={{
                            padding: '4px 12px', borderRadius: '8px',
                            fontSize: '0.75rem', fontWeight: 700,
                            background: 'rgba(0, 170, 200, 0.12)',
                            color: isLight ? '#007a91' : '#00aac8'
                        }}>
                            {policy.policyTypeName}
                        </span>
                        <span style={{
                            padding: '4px 12px', borderRadius: '10px',
                            fontSize: '0.72rem', fontWeight: 600,
                            textTransform: 'uppercase',
                            background: sc.bg, color: sc.text
                        }}>
                            {policy.status}
                        </span>
                    </div>
                    {policy.conditionName && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                            Condition: {policy.conditionName}
                        </div>
                    )}
                </div>
            </div>

            {/* Two-column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Section 1: Overview */}
                <div style={cardStyle}>
                    <div style={cardHeaderStyle}>
                        <Ship size={18} style={{ color: 'var(--accent-primary)' }} />
                        <span style={cardTitleStyle}>Overview</span>
                    </div>

                    {/* Vessel */}
                    <div style={{ marginBottom: '16px' }}>
                        <div style={labelStyle}>Vessel</div>
                        {vessel ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={valueStyle}>{vessel.name}</span>
                                {vessel.imoNumber && (
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        IMO {vessel.imoNumber}
                                    </span>
                                )}
                                {onNavigateToVessel && (
                                    <button
                                        onClick={() => onNavigateToVessel(vessel.id)}
                                        className="btn-secondary"
                                        style={{ padding: '3px 6px', fontSize: '0.72rem', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                        title="View vessel"
                                    >
                                        <ExternalLink size={12} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <span style={{ ...valueStyle, color: 'var(--text-secondary)', fontStyle: 'italic' }}>-</span>
                        )}
                    </div>

                    {/* Vessel details */}
                    {vessel && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                            {vessel.vesselType && (
                                <div>
                                    <div style={labelStyle}>Type</div>
                                    <div style={valueStyle}>{vessel.vesselType}</div>
                                </div>
                            )}
                            {vessel.builtYear && (
                                <div>
                                    <div style={labelStyle}>Built</div>
                                    <div style={valueStyle}>{vessel.builtYear}</div>
                                </div>
                            )}
                            {vessel.grossTonnage && (
                                <div>
                                    <div style={labelStyle}>Gross Tonnage</div>
                                    <div style={valueStyle}>{Number(vessel.grossTonnage).toLocaleString()}</div>
                                </div>
                            )}
                            {vessel.callSign && (
                                <div>
                                    <div style={labelStyle}>Call Sign</div>
                                    <div style={valueStyle}>{vessel.callSign}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Customer */}
                    <div style={{ marginBottom: '12px' }}>
                        <div style={labelStyle}>Customer</div>
                        <div style={valueStyle}>
                            {customer?.name || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>-</span>}
                        </div>
                    </div>

                    {/* Broker */}
                    {policy.brokerName && (
                        <div style={{ marginBottom: '12px' }}>
                            <div style={labelStyle}>Broker</div>
                            <div style={valueStyle}>{policy.brokerName}</div>
                        </div>
                    )}

                    {/* Period */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <div style={labelStyle}>Inception</div>
                            <div style={valueStyle}>{formatPolicyDate(policyData.inception)}</div>
                        </div>
                        <div>
                            <div style={labelStyle}>Expiry</div>
                            <div style={valueStyle}>{formatPolicyDate(policyData.expiry)}</div>
                        </div>
                    </div>

                    {/* Currency */}
                    <div style={{ marginTop: '12px' }}>
                        <div style={labelStyle}>Currency</div>
                        <div style={valueStyle}>{policy.currency || 'USD'}</div>
                    </div>
                </div>

                {/* Section 2: Financial */}
                <div style={cardStyle}>
                    <div style={cardHeaderStyle}>
                        <DollarSign size={18} style={{ color: '#00c864' }} />
                        <span style={cardTitleStyle}>Financial Details</span>
                    </div>

                    {/* Amounts */}
                    {groupedValues.amounts.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            {groupedValues.amounts.map(v => (
                                <div key={v.id}>
                                    <div style={labelStyle}>{v.characteristicName}</div>
                                    <div style={{ ...valueStyle, fontWeight: 600 }}>
                                        {formatAmount(v.valueAmount, policy.currency)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                            No financial data recorded
                        </div>
                    )}
                </div>
            </div>

            {/* Section 3: All Policy Values */}
            <div style={cardStyle}>
                <div style={cardHeaderStyle}>
                    <Shield size={18} style={{ color: '#6464ff' }} />
                    <span style={cardTitleStyle}>Policy Values</span>
                    <span style={{
                        marginLeft: 'auto',
                        padding: '2px 10px', borderRadius: '10px',
                        fontSize: '0.72rem', fontWeight: 600,
                        background: 'rgba(100, 100, 255, 0.12)',
                        color: isLight ? '#4a4adf' : '#6464ff'
                    }}>
                        {policy.values?.length || 0} fields
                    </span>
                </div>

                {policy.values && policy.values.length > 0 ? (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Field
                                </th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Type
                                </th>
                                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.73rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    Value
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {policy.values.map((v, idx) => (
                                <tr key={v.id} style={{
                                    borderBottom: '1px solid var(--table-border)',
                                    background: idx % 2 === 0 ? 'transparent' : (isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)')
                                }}>
                                    <td style={{ padding: '10px 14px', fontSize: '0.85rem', fontWeight: 500 }}>
                                        {v.characteristicName}
                                    </td>
                                    <td style={{ padding: '10px 14px' }}>
                                        <span style={{
                                            padding: '2px 8px', borderRadius: '4px',
                                            fontSize: '0.68rem', fontWeight: 600,
                                            textTransform: 'uppercase',
                                            background: 'rgba(0, 170, 200, 0.08)',
                                            color: 'var(--text-secondary)'
                                        }}>
                                            {v.fieldType}
                                        </span>
                                    </td>
                                    <td style={{ padding: '10px 14px', fontSize: '0.85rem' }}>
                                        {v.fieldType === 'date' && v.valueDate
                                            ? formatDateShort(v.valueDate)
                                            : v.fieldType === 'amount' && v.valueAmount != null
                                                ? formatAmount(v.valueAmount, policy.currency)
                                                : v.fieldType === 'boolean'
                                                    ? (v.valueBoolean ? 'Yes' : 'No')
                                                    : v.valueText || '-'
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        No policy values recorded
                    </div>
                )}
            </div>

            {/* Section 4: Notes */}
            {policy.notes && (
                <div style={cardStyle}>
                    <div style={cardHeaderStyle}>
                        <FileText size={18} style={{ color: '#ffb020' }} />
                        <span style={cardTitleStyle}>Notes</span>
                    </div>
                    <div style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {policy.notes}
                    </div>
                </div>
            )}

            {/* Section 5: Documents History (placeholder) */}
            <div style={cardStyle}>
                <div style={cardHeaderStyle}>
                    <FileText size={18} style={{ color: 'var(--text-secondary)' }} />
                    <span style={cardTitleStyle}>Documents History</span>
                </div>
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    Document generation and history will be available in a future update.
                </div>
            </div>

            {/* Section 6: Revision History (placeholder) */}
            <div style={cardStyle}>
                <div style={cardHeaderStyle}>
                    <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
                    <span style={cardTitleStyle}>Revision History</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                    <div>
                        <div style={labelStyle}>Created</div>
                        <div style={valueStyle}>{policy.createdAt ? formatDate(policy.createdAt) : '-'}</div>
                    </div>
                    <div>
                        <div style={labelStyle}>Last Updated</div>
                        <div style={valueStyle}>{policy.updatedAt ? formatDate(policy.updatedAt) : '-'}</div>
                    </div>
                </div>
            </div>
        </div>
    )
}
