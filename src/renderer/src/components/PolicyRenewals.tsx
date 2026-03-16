import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Calendar, Download, ChevronLeft, ChevronRight, Eye, ChevronUp, ChevronDown as ChevronDownIcon, Plus, Trash2, Edit3, X, Check, MessageSquare, Search } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../utils/dateUtils'
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

type SortField = 'vesselName' | 'imoNumber' | 'customerName' | 'fleetName' | 'policyTypeName' | 'policyNumber' | 'endDate' | 'premium' | 'renewalStatusName' | 'quotationSentDate'
type SortDir = 'asc' | 'desc'

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']
// Default column widths: Vessel, IMO, Customer, Fleet, PolicyType, PolicyNo, EndDate, Premium, Status, QuotSent, Actions
const DEFAULT_COL_WIDTHS = [160, 100, 140, 120, 150, 130, 110, 110, 150, 120, 120]

function formatPremium(value: number | null, currency: string | null): string {
    if (value == null) return '-'
    const sym = currency === 'EUR' ? '\u20AC' : currency === 'GBP' ? '\u00A3' : '$'
    return `${sym}${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

export default function PolicyRenewals({ onNavigateToVessel }: PolicyRenewalsProps) {
    const { theme } = useTheme()
    const { user } = useAuth()
    const isLight = theme === 'light'
    const now = new Date()
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-based
    const [renewals, setRenewals] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [sortField, setSortField] = useState<SortField>('endDate')
    const [sortDir, setSortDir] = useState<SortDir>('asc')
    const [groupByFleet, setGroupByFleet] = useState(false)
    const [multiMonthView, setMultiMonthView] = useState(false)
    const [search, setSearch] = useState('')

    // Renewal status management
    const [statusTypes, setStatusTypes] = useState<RenewalStatusType[]>([])
    const [showStatusManager, setShowStatusManager] = useState(false)
    const [newStatusName, setNewStatusName] = useState('')
    const [newStatusColor, setNewStatusColor] = useState(DEFAULT_COLORS[0])
    const [editingStatusId, setEditingStatusId] = useState<string | null>(null)
    const [editStatusName, setEditStatusName] = useState('')
    const [editStatusColor, setEditStatusColor] = useState('')

    // Renewal notes modal
    const [notesModal, setNotesModal] = useState<{ id: string; vesselName: string; policyType: string; policyNumber: string } | null>(null)
    const [renewalNotes, setRenewalNotes] = useState<any[]>([])
    const [notesLoading, setNotesLoading] = useState(false)
    const [newNoteText, setNewNoteText] = useState('')
    const [notesSaving, setNotesSaving] = useState(false)

    // Column resizing
    const [colWidths, setColWidths] = useState<number[]>(DEFAULT_COL_WIDTHS)
    const resizeRef = useRef<{ colIdx: number; startX: number; startWidth: number } | null>(null)
    const colWidthsRef = useRef(colWidths)
    const dragListenersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null)

    // Clean up any dangling drag listeners on unmount
    useEffect(() => {
        return () => {
            if (dragListenersRef.current) {
                document.removeEventListener('mousemove', dragListenersRef.current.move)
                document.removeEventListener('mouseup', dragListenersRef.current.up)
                dragListenersRef.current = null
            }
        }
    }, [])

    // Quotation sent date editing
    const [editingQuotDate, setEditingQuotDate] = useState<Record<string, string>>({})

    // Load saved column widths from localStorage on mount
    useEffect(() => {
        if (user?.id) {
            const saved = localStorage.getItem(`renewal_col_widths_${user.id}`)
            if (saved) {
                try {
                    const parsed = JSON.parse(saved)
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        // Pad with defaults if columns were added, or truncate if removed
                        const merged = DEFAULT_COL_WIDTHS.map((def, i) => (i < parsed.length ? parsed[i] : def))
                        setColWidths(merged)
                    }
                } catch { /* ignore */ }
            }
        }
    }, [user?.id])

    // Keep ref in sync with state (used to read latest value in event handlers)
    useEffect(() => { colWidthsRef.current = colWidths }, [colWidths])

    useEffect(() => {
        loadRenewals()
        loadStatusTypes()
    }, [selectedYear, selectedMonth, multiMonthView])

    const loadRenewals = async () => {
        setLoading(true)
        try {
            if (multiMonthView) {
                // Build list of 3 consecutive months starting from selectedYear/selectedMonth
                const months: { year: number; month: number }[] = []
                let y = selectedYear, m = selectedMonth
                for (let i = 0; i < 3; i++) {
                    months.push({ year: y, month: m })
                    m++
                    if (m > 12) { m = 1; y++ }
                }
                const results = await Promise.all(months.map(({ year, month }) =>
                    window.api.getPolicyRenewalsByMonth(year, month)
                ))
                // Tag each record with its month label so grouping works
                const combined = results.flatMap((data, i) =>
                    (Array.isArray(data) ? data : []).map((r: any) => ({
                        ...r,
                        _monthLabel: `${MONTH_NAMES[months[i].month - 1]} ${months[i].year}`
                    }))
                )
                setRenewals(combined)
            } else {
                const data = await window.api.getPolicyRenewalsByMonth(selectedYear, selectedMonth)
                setRenewals(Array.isArray(data) ? data : [])
            }
        } catch {
            setRenewals([])
        }
        setLoading(false)
    }

    const loadStatusTypes = async () => {
        try {
            const data = await window.api.getRenewalStatusTypes()
            setStatusTypes(Array.isArray(data) ? data : [])
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

    const handleOpenNotes = async (r: any) => {
        setNotesModal({ id: r.id, vesselName: r.vesselName, policyType: r.policyTypeName, policyNumber: r.policyNumber || '' })
        setRenewalNotes([])
        setNewNoteText('')
        setNotesLoading(true)
        try {
            const data = await window.api.getPolicyRenewalNotes(r.id, r.policyNumber || '')
            setRenewalNotes(Array.isArray(data) ? data : [])
        } finally {
            setNotesLoading(false)
        }
    }

    const handleAddNote = async () => {
        if (!notesModal || !newNoteText.trim()) return
        setNotesSaving(true)
        try {
            const note = await window.api.addPolicyRenewalNote(notesModal.id, notesModal.policyNumber, newNoteText.trim())
            setRenewalNotes(prev => [...prev, note])
            setNewNoteText('')
            // Update note count badge in the table
            setRenewals(prev => prev.map(r => r.id === notesModal.id ? { ...r, noteCount: (r.noteCount || 0) + 1 } : r))
        } finally {
            setNotesSaving(false)
        }
    }

    const handleDeleteNote = async (noteId: string) => {
        if (!notesModal) return
        await window.api.deletePolicyRenewalNote(noteId)
        setRenewalNotes(prev => prev.filter(n => n.id !== noteId))
        setRenewals(prev => prev.map(r => r.id === notesModal.id ? { ...r, noteCount: Math.max(0, (r.noteCount || 1) - 1) } : r))
    }

    const handleSetQuotationDate = async (policyId: string, date: string) => {
        const val = date || null
        await window.api.setQuotationSentDate(policyId, val)
        setRenewals(prev => prev.map(r => r.id === policyId ? { ...r, quotationSentDate: val } : r))
    }

    const handleSetStatus = async (policyId: string, statusId: string | null) => {
        await window.api.setRenewalStatusForPolicy(policyId, statusId)
        setRenewals(prev => prev.map(r => {
            if (r.id !== policyId) return r
            const st = statusId ? statusTypes.find(s => s.id === statusId) : null
            return { ...r, renewalStatusId: statusId, renewalStatusName: st?.name || null, renewalStatusColor: st?.color || null }
        }))
    }

    const handleResizeStart = (colIdx: number, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        resizeRef.current = { colIdx, startX: e.clientX, startWidth: colWidths[colIdx] }

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!resizeRef.current) return
            const { colIdx: ci, startX, startWidth } = resizeRef.current
            const delta = moveEvent.clientX - startX
            setColWidths(prev => {
                const next = [...prev]
                next[ci] = Math.max(60, startWidth + delta)
                return next
            })
        }

        const onMouseUp = () => {
            resizeRef.current = null
            dragListenersRef.current = null
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
            if (user?.id) {
                localStorage.setItem(`renewal_col_widths_${user.id}`, JSON.stringify(colWidthsRef.current))
            }
        }

        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        dragListenersRef.current = { move: onMouseMove, up: onMouseUp }
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
        let filtered = renewals
        if (search.trim()) {
            const q = search.toLowerCase()
            filtered = renewals.filter(r =>
                (r.vesselName || '').toLowerCase().includes(q) ||
                (r.imoNumber || '').toLowerCase().includes(q) ||
                (r.customerName || '').toLowerCase().includes(q) ||
                (r.fleetName || '').toLowerCase().includes(q) ||
                (r.policyTypeName || '').toLowerCase().includes(q) ||
                (r.policyNumber || '').toLowerCase().includes(q) ||
                (r.renewalStatusName || '').toLowerCase().includes(q)
            )
        }
        const sorted = [...filtered]
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
    }, [renewals, sortField, sortDir, search])

    const groupedRenewals = useMemo(() => {
        if (!groupByFleet) return null
        const groups = new Map<string, any[]>()
        for (const r of sortedRenewals) {
            const key = r.fleetName || '— Unassigned —'
            if (!groups.has(key)) groups.set(key, [])
            groups.get(key)!.push(r)
        }
        return Array.from(groups.entries()).sort((a, b) => {
            if (a[0] === '— Unassigned —') return 1
            if (b[0] === '— Unassigned —') return -1
            return a[0].localeCompare(b[0])
        })
    }, [sortedRenewals, groupByFleet])

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
            'Renewal Status': r.renewalStatusName || '',
            'Quotation Sent': r.quotationSentDate || ''
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

    // Solid header background for sticky to work (CSS vars are semi-transparent)
    const stickyHeaderBg = isLight ? '#eef0f3' : '#181b24'

    const thBase: React.CSSProperties = {
        padding: '14px 16px',
        fontWeight: '600',
        color: 'var(--text-secondary)',
        fontSize: '0.8rem',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        position: 'sticky',
        top: 0,
        zIndex: 2,
        background: stickyHeaderBg,
        borderBottom: '1px solid var(--table-border)',
        overflow: 'hidden',
    }

    const ResizeHandle = ({ colIdx }: { colIdx: number }) => (
        <div
            onMouseDown={e => handleResizeStart(colIdx, e)}
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '5px',
                cursor: 'col-resize',
                zIndex: 3,
            }}
        />
    )

    const renderRenewalRow = (r: any, idx: number) => (
        <tr key={r.id || idx} style={{ borderBottom: '1px solid var(--table-border)' }}>
            <td style={{ padding: '12px 16px', fontWeight: '600', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vesselName}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.imoNumber}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customerName || '-'}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.fleetName || '-'}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.policyTypeName}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.policyNumber || '-'}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.endDate || '-'}</td>
            <td style={{ padding: '12px 16px', color: 'var(--text-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatPremium(r.premium, r.currency)}</td>
            <td style={{ padding: '12px 16px' }}>
                <select
                    value={r.renewalStatusId || ''}
                    onChange={e => handleSetStatus(r.id, e.target.value || null)}
                    style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        border: r.renewalStatusColor ? `2px solid ${r.renewalStatusColor}` : '1px solid var(--input-border)',
                        background: r.renewalStatusColor ? `${r.renewalStatusColor}22` : 'var(--input-bg)',
                        color: r.renewalStatusId ? (isLight ? '#111111' : '#ffffff') : 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        fontWeight: r.renewalStatusId ? '700' : '400',
                        cursor: 'pointer',
                        minWidth: '100px',
                        maxWidth: '100%'
                    }}
                >
                    <option value="">— No status —</option>
                    {statusTypes.map(st => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                </select>
            </td>
            <td style={{ padding: '8px 16px' }}>
                <input
                    type="date"
                    value={editingQuotDate[r.id] !== undefined ? editingQuotDate[r.id] : (r.quotationSentDate || '')}
                    onFocus={() => setEditingQuotDate(prev => ({ ...prev, [r.id]: r.quotationSentDate || '' }))}
                    onChange={e => setEditingQuotDate(prev => ({ ...prev, [r.id]: e.target.value }))}
                    onBlur={async e => {
                        const val = e.target.value
                        setEditingQuotDate(prev => { const n = { ...prev }; delete n[r.id]; return n })
                        await handleSetQuotationDate(r.id, val)
                    }}
                    style={{
                        padding: '4px 6px', borderRadius: '6px', fontSize: '0.8rem', width: '100%',
                        background: 'var(--input-bg)', color: 'var(--text-primary)',
                        border: '1px solid var(--input-border)',
                        colorScheme: isLight ? 'light' : 'dark'
                    }}
                />
            </td>
            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                    <button
                        onClick={() => handleOpenNotes(r)}
                        className="btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'inline-flex', alignItems: 'center', gap: '4px', position: 'relative' }}
                        title={r.noteCount > 0 ? `${r.noteCount} note${r.noteCount > 1 ? 's' : ''}` : 'Add notes'}
                    >
                        <MessageSquare size={14} />
                        {r.noteCount > 0 && (
                            <span style={{ position: 'absolute', top: '-5px', right: '-6px', minWidth: '16px', height: '16px', borderRadius: '8px', background: 'var(--accent-primary)', color: '#fff', fontSize: '0.65rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                                {r.noteCount}
                            </span>
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
    )

    const totalWidth = colWidths.reduce((a, b) => a + b, 0)

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

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', opacity: 0.5, pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search renewals..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '8px 28px 8px 36px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '200px' }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                <button
                    onClick={() => setMultiMonthView(v => !v)}
                    className={multiMonthView ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={multiMonthView ? 'Switch to single month view' : 'Show 3 months from selected month'}
                >
                    3-Month View
                </button>

                <button
                    onClick={() => setGroupByFleet(v => !v)}
                    className={groupByFleet ? 'btn-primary' : 'btn-secondary'}
                    style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    title={groupByFleet ? 'Switch to flat list' : 'Group rows by fleet'}
                >
                    Group by Fleet
                </button>

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
                                        <input type="color" value={editStatusColor} onChange={e => setEditStatusColor(e.target.value)} style={{ width: '36px', height: '32px', padding: '2px', borderRadius: '4px', border: '1px solid var(--input-border)', cursor: 'pointer' }} />
                                        <input type="text" value={editStatusName} onChange={e => setEditStatusName(e.target.value)} style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
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
                        <input type="color" value={newStatusColor} onChange={e => setNewStatusColor(e.target.value)} style={{ width: '36px', height: '32px', padding: '2px', borderRadius: '4px', border: '1px solid var(--input-border)', cursor: 'pointer', flexShrink: 0 }} />
                        <input type="text" value={newStatusName} onChange={e => setNewStatusName(e.target.value)} placeholder="Status name (e.g. Quote Sent)" style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
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
                <div style={{
                    background: 'var(--bg-card)', borderRadius: '12px',
                    border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
                    overflow: 'auto',
                    maxHeight: 'calc(100vh - 320px)'
                }}>
                    <table style={{ width: `${totalWidth}px`, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                        <caption className="sr-only">Policy renewals for {MONTH_NAMES[selectedMonth - 1]} {selectedYear}</caption>
                        <thead>
                            <tr style={{ textAlign: 'left' }}>
                                <th scope="col" style={{ ...thBase, width: colWidths[0], cursor: 'pointer' }} onClick={() => handleSort('vesselName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Vessel <SortIcon field="vesselName" /></span>
                                    <ResizeHandle colIdx={0} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[1], cursor: 'pointer' }} onClick={() => handleSort('imoNumber')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>IMO <SortIcon field="imoNumber" /></span>
                                    <ResizeHandle colIdx={1} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[2], cursor: 'pointer' }} onClick={() => handleSort('customerName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Customer <SortIcon field="customerName" /></span>
                                    <ResizeHandle colIdx={2} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[3], cursor: 'pointer' }} onClick={() => handleSort('fleetName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Fleet <SortIcon field="fleetName" /></span>
                                    <ResizeHandle colIdx={3} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[4], cursor: 'pointer' }} onClick={() => handleSort('policyTypeName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Policy Type <SortIcon field="policyTypeName" /></span>
                                    <ResizeHandle colIdx={4} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[5], cursor: 'pointer' }} onClick={() => handleSort('policyNumber')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Policy No. <SortIcon field="policyNumber" /></span>
                                    <ResizeHandle colIdx={5} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[6], cursor: 'pointer' }} onClick={() => handleSort('endDate')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>End Date <SortIcon field="endDate" /></span>
                                    <ResizeHandle colIdx={6} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[7], cursor: 'pointer' }} onClick={() => handleSort('premium')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Premium <SortIcon field="premium" /></span>
                                    <ResizeHandle colIdx={7} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[8], cursor: 'pointer' }} onClick={() => handleSort('renewalStatusName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Status <SortIcon field="renewalStatusName" /></span>
                                    <ResizeHandle colIdx={8} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[9], cursor: 'pointer' }} onClick={() => handleSort('quotationSentDate')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Quot. Sent <SortIcon field="quotationSentDate" /></span>
                                    <ResizeHandle colIdx={9} />
                                </th>
                                <th scope="col" style={{ ...thBase, width: colWidths[10], cursor: 'default', textAlign: 'center' }}>
                                    Actions
                                    <ResizeHandle colIdx={10} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRenewals.length === 0 ? (
                                <tr>
                                    <td colSpan={11} style={{ padding: '52px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                        <Calendar size={28} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.25 }} />
                                        {multiMonthView
                                            ? `No policies expiring in the selected 3-month range`
                                            : `No policies expiring in ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                                    </td>
                                </tr>
                            ) : multiMonthView ? (
                                // Group by month label, then optionally by fleet within each month
                                (() => {
                                    const monthOrder: string[] = []
                                    const byMonth = new Map<string, any[]>()
                                    for (const r of sortedRenewals) {
                                        const lbl = r._monthLabel || ''
                                        if (!byMonth.has(lbl)) { byMonth.set(lbl, []); monthOrder.push(lbl) }
                                        byMonth.get(lbl)!.push(r)
                                    }
                                    return monthOrder.map(lbl => {
                                        const monthRows = byMonth.get(lbl)!
                                        const fleetGroups = groupByFleet
                                            ? (() => {
                                                const map = new Map<string, any[]>()
                                                for (const r of monthRows) {
                                                    const k = r.fleetName || '— Unassigned —'
                                                    if (!map.has(k)) map.set(k, [])
                                                    map.get(k)!.push(r)
                                                }
                                                return Array.from(map.entries()).sort((a, b) => {
                                                    if (a[0] === '— Unassigned —') return 1
                                                    if (b[0] === '— Unassigned —') return -1
                                                    return a[0].localeCompare(b[0])
                                                })
                                            })()
                                            : null
                                        return (
                                            <React.Fragment key={lbl}>
                                                <tr>
                                                    <td colSpan={11} style={{
                                                        padding: '10px 16px',
                                                        borderBottom: '1px solid var(--table-border)',
                                                        borderTop: '2px solid var(--accent-primary)',
                                                        fontWeight: '800',
                                                        fontSize: '0.85rem',
                                                        color: 'var(--text-primary)',
                                                        position: 'sticky' as const,
                                                        top: '49px',
                                                        zIndex: 1,
                                                        background: isLight ? '#eef0f3' : '#181b24',
                                                        letterSpacing: '0.02em'
                                                    }}>
                                                        {lbl}
                                                        <span style={{ marginLeft: '10px', fontWeight: 400, color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                                                            {monthRows.length} {monthRows.length === 1 ? 'policy' : 'policies'}
                                                        </span>
                                                    </td>
                                                </tr>
                                                {fleetGroups ? fleetGroups.map(([fleetName, rows]) => (
                                                    <React.Fragment key={fleetName}>
                                                        <tr>
                                                            <td colSpan={11} style={{
                                                                padding: '6px 16px 6px 28px',
                                                                borderBottom: '1px solid var(--table-border)',
                                                                fontWeight: '700', fontSize: '0.75rem',
                                                                color: 'var(--accent-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.5px',
                                                                background: isLight ? '#f4f6fa' : '#1a1d28'
                                                            }}>
                                                                {fleetName} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0 }}>({rows.length})</span>
                                                            </td>
                                                        </tr>
                                                        {rows.map((r: any, idx: number) => renderRenewalRow(r, idx))}
                                                    </React.Fragment>
                                                )) : monthRows.map((r: any, idx: number) => renderRenewalRow(r, idx))}
                                            </React.Fragment>
                                        )
                                    })
                                })()
                            ) : groupedRenewals ? (
                                groupedRenewals.map(([fleetName, rows]) => (
                                    <React.Fragment key={fleetName}>
                                        <tr>
                                            <td colSpan={11} style={{
                                                padding: '8px 16px',
                                                borderBottom: '1px solid var(--table-border)',
                                                borderTop: '2px solid var(--table-border)',
                                                fontWeight: '700',
                                                fontSize: '0.8rem',
                                                color: 'var(--accent-primary)',
                                                textTransform: 'uppercase' as const,
                                                letterSpacing: '0.5px',
                                                position: 'sticky' as const,
                                                top: '49px',
                                                zIndex: 1,
                                                background: isLight ? '#eef0f3' : '#181b24'
                                            }}>
                                                {fleetName} <span style={{ fontWeight: 400, color: 'var(--text-secondary)', textTransform: 'none', letterSpacing: 0 }}>({rows.length} {rows.length === 1 ? 'policy' : 'policies'})</span>
                                            </td>
                                        </tr>
                                        {rows.map((r: any, idx: number) => renderRenewalRow(r, idx))}
                                    </React.Fragment>
                                ))
                            ) : (
                                sortedRenewals.map((r: any, idx: number) => renderRenewalRow(r, idx))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Renewal Notes modal */}
            {notesModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{
                        background: isLight ? '#ffffff' : '#1a1d28',
                        borderRadius: '16px', padding: '28px', width: '520px', maxWidth: '95vw', maxHeight: '80vh',
                        display: 'flex', flexDirection: 'column',
                        border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexShrink: 0 }}>
                            <div>
                                <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <MessageSquare size={16} color="var(--accent-primary)" /> Renewal Notes
                                </h3>
                                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                                    {notesModal.vesselName} — {notesModal.policyType}
                                    {notesModal.policyNumber && <span style={{ fontFamily: 'monospace', marginLeft: '6px', opacity: 0.7 }}>#{notesModal.policyNumber}</span>}
                                </p>
                                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', opacity: 0.7 }}>
                                    Notes are linked to this policy number and will not carry over on renewal.
                                </p>
                            </div>
                            <button onClick={() => setNotesModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                                <X size={18} />
                            </button>
                        </div>

                        {/* New note input */}
                        <div style={{ flexShrink: 0, marginBottom: '16px' }}>
                            <textarea
                                value={newNoteText}
                                onChange={e => setNewNoteText(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAddNote() }}
                                rows={3}
                                placeholder="Add a note about this renewal... (Ctrl+Enter to submit)"
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', resize: 'none', fontFamily: 'inherit', fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--input-text)', border: '1px solid var(--input-border)', boxSizing: 'border-box' }}
                            />
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                <button onClick={handleAddNote} disabled={notesSaving || !newNoteText.trim()} className="btn-primary" style={{ padding: '6px 16px', fontSize: '0.85rem' }}>
                                    {notesSaving ? 'Saving...' : 'Add Note'}
                                </button>
                            </div>
                        </div>

                        {/* Notes thread */}
                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {notesLoading ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '16px' }}>Loading...</p>
                            ) : renewalNotes.length === 0 ? (
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', textAlign: 'center', padding: '16px', fontStyle: 'italic' }}>No notes yet for this policy number.</p>
                            ) : renewalNotes.map(n => (
                                <div key={n.id} style={{ background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)', borderRadius: '10px', padding: '12px 14px', borderLeft: '3px solid var(--accent-primary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '700', color: '#fff', flexShrink: 0 }}>
                                            {(n.createdByUsername || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <span style={{ fontWeight: '600', fontSize: '0.85rem', color: 'var(--text-primary)' }}>{n.createdByUsername || 'Unknown'}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                                            {formatDateTime(n.createdAt)}
                                        </span>
                                        {n.createdByUserId === user?.id && (
                                            <button
                                                onClick={() => handleDeleteNote(n.id)}
                                                title="Delete note"
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: '2px', borderRadius: '4px', flexShrink: 0 }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        )}
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{n.note}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
