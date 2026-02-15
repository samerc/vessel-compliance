import { useState, useEffect, useMemo } from 'react'
import { Calendar, Download, ChevronLeft, ChevronRight, Eye } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import * as XLSX from 'xlsx'

interface PolicyRenewalsProps {
    onNavigateToVessel?: (vesselId: string) => void
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function PolicyRenewals({ onNavigateToVessel }: PolicyRenewalsProps) {
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const now = new Date()
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-based
    const [renewals, setRenewals] = useState<any[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        loadRenewals()
    }, [selectedYear, selectedMonth])

    const loadRenewals = async () => {
        setLoading(true)
        try {
            const data = await window.api.getPolicyRenewalsByMonth(selectedYear, selectedMonth)
            setRenewals(data || [])
        } catch {
            setRenewals([])
        }
        setLoading(false)
    }

    const goToPreviousMonth = () => {
        if (selectedMonth === 1) {
            setSelectedMonth(12)
            setSelectedYear(y => y - 1)
        } else {
            setSelectedMonth(m => m - 1)
        }
    }

    const goToNextMonth = () => {
        if (selectedMonth === 12) {
            setSelectedMonth(1)
            setSelectedYear(y => y + 1)
        } else {
            setSelectedMonth(m => m + 1)
        }
    }

    const goToCurrentMonth = () => {
        setSelectedYear(now.getFullYear())
        setSelectedMonth(now.getMonth() + 1)
    }

    // Group by vessel for summary
    const vesselSummary = useMemo(() => {
        const map = new Map<string, { vesselName: string; imoNumber: string; vesselId: string; policies: any[] }>()
        for (const r of renewals) {
            if (!map.has(r.vesselId)) {
                map.set(r.vesselId, { vesselName: r.vesselName, imoNumber: r.imoNumber, vesselId: r.vesselId, policies: [] })
            }
            map.get(r.vesselId)!.policies.push(r)
        }
        return Array.from(map.values())
    }, [renewals])

    const exportToExcel = () => {
        const rows = renewals.map(r => ({
            'Vessel': r.vesselName,
            'IMO': r.imoNumber,
            'Customer': r.customerName || '-',
            'Fleet': r.fleetName || '-',
            'Policy Type': r.policyTypeName,
            'Policy Number': r.policyNumber || '',
            'End Date': r.endDate || ''
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Renewals')
        XLSX.writeFile(wb, `Renewals_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`)
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Policy Renewals</h1>
                <p style={{ color: 'var(--text-secondary)' }}>View policies expiring in a specific month.</p>
            </header>

            {/* Month Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--bg-card)',
                    borderRadius: '10px',
                    padding: '4px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                    <button
                        onClick={goToPreviousMonth}
                        style={{
                            padding: '8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title="Previous month"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 16px',
                        minWidth: '200px',
                        justifyContent: 'center'
                    }}>
                        <Calendar size={18} color="var(--accent-primary)" />
                        <span style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                            {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
                        </span>
                    </div>
                    <button
                        onClick={goToNextMonth}
                        style={{
                            padding: '8px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title="Next month"
                    >
                        <ChevronRight size={20} />
                    </button>
                </div>

                <button
                    onClick={goToCurrentMonth}
                    className="btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                >
                    Today
                </button>

                {renewals.length > 0 && (
                    <button
                        onClick={exportToExcel}
                        className="btn-primary"
                        style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}
                    >
                        <Download size={16} />
                        Export to Excel
                    </button>
                )}
            </div>

            {/* Summary stats */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                <div style={{
                    padding: '16px 24px',
                    background: 'var(--bg-card)',
                    borderRadius: '10px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Policies</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>{renewals.length}</div>
                </div>
                <div style={{
                    padding: '16px 24px',
                    background: 'var(--bg-card)',
                    borderRadius: '10px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Vessels</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>{vesselSummary.length}</div>
                </div>
            </div>

            {/* Results Table */}
            {loading ? (
                <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            ) : renewals.length === 0 ? (
                <div style={{
                    padding: '64px',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                    <Calendar size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>No renewals in {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</div>
                    <p style={{ color: 'var(--text-secondary)' }}>No active policies have an end date in this month.</p>
                </div>
            ) : (
                <div style={{
                    background: 'var(--bg-card)',
                    borderRadius: '12px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <caption className="sr-only">Policy renewals for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Vessel</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>IMO</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Customer</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Fleet</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Policy Type</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>Policy Number</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>End Date</th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {renewals.map((r: any, idx: number) => (
                                <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-primary)' }}>{r.vesselName}</td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{r.imoNumber}</td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{r.customerName || '-'}</td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{r.fleetName || '-'}</td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{r.policyTypeName}</td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{r.policyNumber || '-'}</td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{r.endDate || '-'}</td>
                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                        <button
                                            onClick={() => onNavigateToVessel?.(r.vesselId)}
                                            className="btn-secondary"
                                            style={{ padding: '4px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                        >
                                            <Eye size={14} />
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
