import { useState, useEffect, useMemo } from 'react'
import { Calendar, Download, ChevronLeft, ChevronRight, Eye, ChevronUp, ChevronDown as ChevronDownIcon, Plus, Trash2, Edit3, X, Check, MessageSquare } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import * as XLSX from 'xlsx'

interface PolicyRenewalsProps {
    onNavigateToVessel?: (vesselId: string) => void
}

interface RenewalStatusType {
    id: string
    name: string
    color: string
    order: number
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type SortField = 'vesselName' | 'imoNumber' | 'customerName' | 'fleetName' | 'policyTypeName' | 'policyNumber' | 'endDate' | 'premium' | 'renewalStatusName'
type SortDir = 'asc' | 'desc'

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

function formatPremium(value: number | null, currency: string | null): string {
    if (value == null) return '-'
    const sym = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$'
    return `${sym}${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function PolicyRenewals({ onNavigateToVessel }: PolicyRenewalsProps) {
    const { theme } = useTheme()
    const isLight = theme === 'light'
    const now = new Date()
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-based
    const [renewals, setRenewals] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [sortField, setSortField] = useState<SortField>('endDate')
    const [sortDir, setSortDir] = useState<SortDir>('asc')

    // Renewal status management
    const [statusTypes, setStatusTypes] = useState<RenewalStatusType[]>([])
    const [showStatusManager, setShowStatusManager] = useState(false)
    const [newStatusName, setNewStatusName] = useState('')
    const [newStatusColor, setNewStatusColor] = useState(DEFAULT_COLORS[0])
    const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
    const [editStatusName, setEditStatusName] = useState('')
    const [editStatusColor, setEditStatusColor] = useState('')

    // Notes modal
    const [notesModal, setNotesModal] = useState<{ id: string; vesselName: string; policyType: string; text: string } | null>(null)
    const [notesSaving, setNotesSaving] = useState(false)

    useEffect(() => {
        loadRenewals()
        loadStatusTypes()
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

    const loadStatusTypes = async () => {
        try {
            const data = await window.api.getRenewalStatusTypes()
            setStatusTypes(data || [])
        } catch {
            setStatusTypes([])
        }
    }

    const handleAddStatus = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newStatusName.trim()) return
        await window.api.addRenewalStatusType(newStatusName.trim(), newStatusColor)
        setNewStatusName('')
        setNewStatusColor(DEFAULT_COLORS[0])
        loadStatusTypes()
    }

    const handleDeleteStatus = async (id: string) => {
        if (!confirm('Delete this status? Policies using it will have their status cleared.')) return
        await window.api.deleteRenewalStatusType(id)
        loadStatusTypes()
        loadRenewals()
    }

    const handleSaveEditStatus = async (id: string) => {
        if (!editStatusName.trim()) return
        await window.api.updateRenewalStatusType(id, editStatusName.trim(), editStatusColor)
        setEditingStatusId(null)
        loadStatusTypes()
        loadRenewals()
    }

    const handleSaveNotes = async () => {
        if (!notesModal) return
        setNotesSaving(true)
        try {
            await window.api.updateVesselDynamicPolicy(notesModal.id, { notes: notesModal.text || undefined })
            setRenewals(prev => prev.map(r => r.id === notesModal.id ? { ...r, notes: notesModal.text || null } : r))
            setNotesModal(null)
        } finally {
            setNotesSaving(false)
        }
    }

    const handleSetStatus = async (policyId: string, statusId: string | null) => {
        await window.api.setRenewalStatusForPolicy(policyId, statusId)
        setRenewals(prev => prev.map(r => {
            if (r.id !== policyId) return r
            const st = statusId ? statusTypes.find(s => s.id === statusId) : null
            return { ...r, renewalStatusId: statusId, renewalStatusName: st?.name || null, renewalStatusColor: st?.color || null }
        }))
    }

    const goToPreviousMonth = () => {
        if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear(y => y - 1) }
        else { setSelectedMonth(m => m - 1) }
    }

    const goToNextMonth = () => {
        if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear(y => y + 1) }
        else { setSelectedMonth(m => m + 1) }
    }

    const goToCurrentMonth = () => {
        setSelectedYear(now.getFullYear())
        setSelectedMonth(now.getMonth() + 1)
    }

    const handleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        else { setSortField(field); setSortDir('asc') }
    }

    const sortedRenewals = useMemo(() => {
        const sorted = [...renewals]
        sorted.sort((a, b) => {
            const aVal = a[sortField] ?? ''
            const bVal = b[sortField] ?? ''
            if (sortField === 'premium') {
                return sortDir === 'asc' ? (Number(aVal) - Number(bVal)) : (Number(bVal) - Number(aVal))
            }
            const cmp = String(aVal).localeCompare(String(bVal))
            return sortDir === 'asc' ? cmp : -cmp
        })
        return sorted
    }, [renewals, sortField, sortDir])

    const vesselSummary = useMemo(() => {
        const map = new Map<string, { vesselName: string; imoNumber: string; vesselId: string; policies: any[] }>()
        for (const r of renewals) {
            if (!map.has(r.vesselId)) map.set(r.vesselId, { vesselName: r.vesselName, imoNumber: r.imoNumber, vesselId: r.vesselId, policies: [] })
            map.get(r.vesselId)!.policies.push(r)
        }
        return Array.from(map.values())
    }, [renewals])

    const exportToExcel = () => {
        const rows = sortedRenewals.map(r => ({
            'Vessel': r.vesselName,
            'IMO': r.imoNumber,
            'Customer': r.customerName || '-',
            'Fleet': r.fleetName || '-',
            'Policy Type': r.policyTypeName,
            'Policy Number': r.policyNumber || '',
            'End Date': r.endDate || '',
            'Premium': r.premium != null ? Number(r.premium) : '',
            'Renewal Status': r.renewalStatusName || ''
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Renewals')
        XLSX.writeFile(wb, `Renewals_${MONTH_NAMES[selectedMonth - 1]}_${selectedYear}.xlsx`)
    }

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return <span style={{ opacity: 0.3, fontSize: '0.7rem' }}>↕</span>
        return sortDir === 'asc' ? <ChevronUp size={14} /> : <ChevronDownIcon size={14} />
    }

    const thStyle: React.CSSProperties = {
        padding: '14px 16px',
        fontWeight: '600',
        color: 'var(--text-secondary)',
        fontSize: '0.8rem',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap'
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Policy Renewals</h1>
                <p style={{ color: 'var(--text-secondary)' }}>View policies expiring in a specific month.</p>
            </header>

            {/* Month Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'var(--bg-card)', borderRadius: '10px', padding: '4px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                    <button onClick={goToPreviousMonth} style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }} title="Previous month">
                        <ChevronLeft size={20} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', minWidth: '200px', justifyContent: 'center' }}>
                        <Calendar size={18} color="var(--accent-primary)" />
                        <span style={{ fontWeight: '700', fontSize: '1.1rem', color: 'var(--text-primary)' }}>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</span>
                    </div>
                    <button onClick={goToNextMonth} style={{ padding: '8px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }} title="Next month">
                        <ChevronRight size={20} />
                    </button>
                </div>

                <button onClick={goToCurrentMonth} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>Today</button>

                <button
                    onClick={() => setShowStatusManager(v => !v)}
                    className={showStatusManager ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <Edit3 size={14} /> Manage Statuses
                </button>

                {renewals.length > 0 && (
                    <button onClick={exportToExcel} className="btn-primary" style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <Download size={16} /> Export to Excel
                    </button>
                )}
            </div>

            {/* Status Manager */}
            {showStatusManager && (
                <div style={{
                    background: 'var(--bg-card)', borderRadius: '12px', padding: '20px', marginBottom: '24px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
                }}>
                    <h3 style={{ marginBottom: '16px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Edit3 size={16} color="var(--accent-primary)" /> Renewal Statuses
                    </h3>

                    {/* Existing statuses */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                        {statusTypes.length === 0 && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>No statuses created yet.</p>}
                        {statusTypes.map(st => (
                            <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {editingStatusId === st.id ? (
                                    <>
                                        <input type="color" value={editStatusColor} onChange={e => setEditStatusColor(e.target.value)} style={{ width: '36px', height: '32px', padding: '2px', borderRadius: '4px', border: '1px solid var(--glass-border)', cursor: 'pointer' }} />
                                        <input type="text" value={editStatusName} onChange={e => setEditStatusName(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                                        <button onClick={() => handleSaveEditStatus(st.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', display: 'flex' }}><Check size={16} /></button>
                                        <button onClick={() => setEditingStatusId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><X size={16} /></button>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: st.color, flexShrink: 0, border: '2px solid rgba(255,255,255,0.15)' }} />
                                        <span style={{ flex: 1, fontSize: '0.9rem' }}>{st.name}</span>
                                        <button onClick={() => { setEditingStatusId(st.id); setEditStatusName(st.name); setEditStatusColor(st.color) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex' }}><Edit3 size={14} /></button>
                                        <button onClick={() => handleDeleteStatus(st.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}><Trash2 size={14} /></button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Add new status */}
                    <form onSubmit={handleAddStatus} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="color" value={newStatusColor} onChange={e => setNewStatusColor(e.target.value)} style={{ width: '36px', height: '32px', padding: '2px', borderRadius: '4px', border: '1px solid var(--glass-border)', cursor: 'pointer', flexShrink: 0 }} />
                        <input type="text" value={newStatusName} onChange={e => setNewStatusName(e.target.value)} placeholder="Status name (e.g. Quote Sent)" style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                        <button type="submit" className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={14} /> Add</button>
                    </form>
                </div>
            )}

            {/* Summary stats */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                <div style={{ padding: '16px 24px', background: 'var(--bg-card)', borderRadius: '10px', border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Policies</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>{renewals.length}</div>
                </div>
                <div style={{ padding: '16px 24px', background: 'var(--bg-card)', borderRadius: '10px', border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Vessels</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: 'var(--text-primary)' }}>{vesselSummary.length}</div>
                </div>
            </div>

            {/* Results Table */}
            {loading ? (
                <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>
            ) : renewals.length === 0 ? (
                <div style={{ padding: '64px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)' }}>
                    <Calendar size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.3 }} />
                    <div style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>No renewals in {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</div>
                    <p style={{ color: 'var(--text-secondary)' }}>No active policies have an end date in this month.</p>
                </div>
            ) : (
                <div style={{ background: 'var(--bg-card)', borderRadius: '12px', border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '1100px', borderCollapse: 'collapse' }}>
                        <caption className="sr-only">Policy renewals for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th scope="col" style={thStyle} onClick={() => handleSort('vesselName')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Vessel <SortIcon field="vesselName" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('imoNumber')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>IMO <SortIcon field="imoNumber" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('customerName')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Customer <SortIcon field="customerName" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('fleetName')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Fleet <SortIcon field="fleetName" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('policyTypeName')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Policy Type <SortIcon field="policyTypeName" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('policyNumber')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Policy No. <SortIcon field="policyNumber" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('endDate')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>End Date <SortIcon field="endDate" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('premium')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Premium <SortIcon field="premium" /></span></th>
                                <th scope="col" style={thStyle} onClick={() => handleSort('renewalStatusName')}><span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Status <SortIcon field="renewalStatusName" /></span></th>
                                <th scope="col" style={{ padding: '14px 16px', fontWeight: '600', color: 'var(--text-secondary)', fontSize: '0.8rem', textAlign: 'center' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRenewals.map((r: any, idx: number) => (
                                <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                    <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-primary)' }}>{r.vesselName}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{r.imoNumber}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{r.customerName || '-'}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{r.fleetName || '-'}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{r.policyTypeName}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.policyNumber || '-'}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)' }}>{r.endDate || '-'}</td>
                                    <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: '500' }}>{formatPremium(r.premium, r.currency)}</td>
                                    <td style={{ padding: '12px 16px' }}>
                                        <select
                                            value={r.renewalStatusId || ''}
                                            onChange={e => handleSetStatus(r.id, e.target.value || null)}
                                            style={{
                                                padding: '4px 8px',
                                                borderRadius: '12px',
                                                border: r.renewalStatusColor ? `2px solid ${r.renewalStatusColor}` : '1px solid var(--glass-border)',
                                                background: r.renewalStatusColor ? `${r.renewalStatusColor}22` : 'var(--input-bg)',
                                                color: r.renewalStatusColor || 'var(--text-secondary)',
                                                fontSize: '0.8rem',
                                                fontWeight: r.renewalStatusId ? '600' : '400',
                                                cursor: 'pointer',
                                                minWidth: '120px'
                                            }}
                                        >
                                            <option value="">— No status —</option>
                                            {statusTypes.map(st => (
                                                <option key={st.id} value={st.id}>{st.name}</option>
                                            ))}
                                        </select>
                                    </td>
                                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                            <button
                                                onClick={() => setNotesModal({ id: r.id, vesselName: r.vesselName, policyType: r.policyTypeName, text: r.notes || '' })}
                                                className="btn-secondary"
                                                style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', position: 'relative' }}
                                                title={r.notes ? 'View/edit notes' : 'Add notes'}
                                            >
                                                <MessageSquare size={14} />
                                                {r.notes && (
                                                    <span style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }} />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => onNavigateToVessel?.(r.vesselId)}
                                                className="btn-secondary"
                                                style={{ padding: '4px 12px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <Eye size={14} /> View
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Notes modal */}
            {notesModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: 'var(--bg-sidebar)', borderRadius: '16px', padding: '28px', width: '480px', maxWidth: '95vw', border: 'var(--glass-border)', boxShadow: 'var(--shadow-lg)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem' }}>Renewal Notes</h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    {notesModal.vesselName} — {notesModal.policyType}
                                </p>
                            </div>
                            <button onClick={() => setNotesModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <textarea
                            value={notesModal.text}
                            onChange={e => setNotesModal(prev => prev ? { ...prev, text: e.target.value } : null)}
                            rows={6}
                            placeholder="Enter notes about this renewal..."
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
                        />
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button onClick={() => setNotesModal(null)} className="btn-secondary">Cancel</button>
                            <button onClick={handleSaveNotes} disabled={notesSaving} className="btn-primary">
                                {notesSaving ? 'Saving...' : 'Save Notes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
