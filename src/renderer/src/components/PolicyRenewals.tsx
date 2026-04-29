import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Calendar, Download, ChevronLeft, ChevronRight, Eye, ChevronUp, ChevronDown as ChevronDownIcon, Plus, Trash2, Edit3, X, Check, MessageSquare, Search, DollarSign, TrendingUp, Percent, Filter, RefreshCw } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { formatDateTime } from '../utils/dateUtils'
import XLSX from 'xlsx-js-style'
import ColumnSelector, { useColumnPrefs, ColumnDef } from './ColumnSelector'

interface PolicyRenewalsProps {
    onNavigateToVessel?: (vesselId: string) => void
    onCreateRenewalQuotation?: (quotationId: string) => void
}

interface RenewalStatusType {
    id: string
    name: string
    color: string
    order: number
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type SortField = 'vesselName' | 'customerName' | 'policyTypeName' | 'policyNumber' | 'endDate' | 'premium' | 'renewalStatusName' | 'quotationSentDate' | 'daysUntil'
type SortDir = 'asc' | 'desc'

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6']

function daysUntil(dateStr: string): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000)
}


interface PolicyTypeOption {
    id: string
    name: string
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPI({ icon, gradient, label, value, sub }: {
    icon: React.ReactNode
    gradient: string
    label: string
    value: string | number
    sub?: string
}) {
    return (
        <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
                width: '48px', height: '48px', borderRadius: '14px',
                background: gradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
            }}>
                {icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600',
                    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px',
                }}>
                    {label}
                </div>
                <div style={{
                    fontSize: String(value).length > 12 ? '1rem' : String(value).length > 8 ? '1.25rem' : '1.75rem',
                    fontWeight: '800',
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    width: '100%',
                }}>
                    {value}
                </div>
                {sub && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        {sub}
                    </div>
                )}
            </div>
        </div>
    )
}
// Default column widths: Vessel, Customer, PolicyType, PolicyNo, EndDate, Premium, Days, Status, QuotSent, Actions
const DEFAULT_COL_WIDTHS = [200, 170, 120, 130, 110, 95, 90, 130, 140, 110]

function formatPremium(value: number | null, currency: string | null): string {
    if (value == null) return '-'
    const cur = currency || 'USD'
    return `${cur} ${Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function PolicyRenewals({ onNavigateToVessel, onCreateRenewalQuotation }: PolicyRenewalsProps) {
    const { theme } = useTheme()
    const { user, hasPermission } = useAuth()
    const { showSuccess, showError } = useToast()
    const canManage = hasPermission('renewals:manage')
    const canNotes = hasPermission('renewals:notes') || canManage
    const isLight = theme === 'light' || theme === 'aurora'
    const now = new Date()
    const [selectedYear, setSelectedYear] = useState(now.getFullYear())
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1) // 1-based
    const [renewals, setRenewals] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [sortField, setSortFieldRaw] = useState<SortField>(() => (localStorage.getItem('renewals_sortField') as SortField) || 'endDate')
    const [sortDir, setSortDirRaw] = useState<SortDir>(() => (localStorage.getItem('renewals_sortDir') as SortDir) || 'asc')
    const setSortField = (f: SortField) => { setSortFieldRaw(f); localStorage.setItem('renewals_sortField', f) }
    const setSortDir = (d: SortDir | ((prev: SortDir) => SortDir)) => { setSortDirRaw(prev => { const val = typeof d === 'function' ? d(prev) : d; localStorage.setItem('renewals_sortDir', val); return val }) }
    const [groupByFleet, setGroupByFleet] = useState(false)
    const [multiMonthView, setMultiMonthView] = useState(false)
    const [search, setSearch] = useState('')
    const [policyTypes, setPolicyTypes] = useState<PolicyTypeOption[]>([])
    const [policyTypeFilter, setPolicyTypeFilter] = useState<string>('all')

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

    // Renew dropdown
    const [renewMenuId, setRenewMenuId] = useState<string | null>(null)
    const renewBtnRefs = useRef<Record<string, HTMLButtonElement>>({})
    const [renewMenuPos, setRenewMenuPos] = useState<{ top: number; right: number } | null>(null)
    const [renewLoading, setRenewLoading] = useState<string | null>(null)

    // Close renew dropdown on outside click (use timeout to avoid closing on the same click that opened)
    useEffect(() => {
        if (!renewMenuId) return
        const handler = () => setRenewMenuId(null)
        const timer = setTimeout(() => document.addEventListener('mousedown', handler), 10)
        return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler) }
    }, [renewMenuId])

    // Column preferences
    const RENEWAL_COLUMNS: ColumnDef[] = useMemo(() => [
        { id: 'vessel', label: 'Vessel', defaultVisible: true },
        { id: 'customer', label: 'Customer', defaultVisible: true },
        { id: 'policyType', label: 'Policy Type', defaultVisible: false },
        { id: 'policyNo', label: 'Policy No.', defaultVisible: false },
        { id: 'endDate', label: 'End Date', defaultVisible: true },
        { id: 'premium', label: 'Premium', defaultVisible: true },
        { id: 'days', label: 'Days', defaultVisible: true },
        { id: 'status', label: 'Status', defaultVisible: true },
        { id: 'quotSent', label: 'Quot. Sent', defaultVisible: true },
        { id: 'actions', label: 'Actions', defaultVisible: true }
    ], [])
    const { visibleColumns: rnVisibleCols, setVisibleColumns: setRnVisibleCols } = useColumnPrefs('renewals', RENEWAL_COLUMNS)
    const rnVisSet = new Set(rnVisibleCols)

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

    // Load policy types on mount
    useEffect(() => {
        window.api.getPolicyTypes().then((types: any[]) => {
            if (Array.isArray(types)) {
                setPolicyTypes(types.map((t: any) => ({ id: t.id, name: t.name })))
            }
        }).catch(() => {})
    }, [])

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

    const handleRenew = async (row: any, includeFleet: boolean) => {
        setRenewMenuId(null)
        setRenewMenuPos(null)
        setRenewLoading(row.id)
        try {
            // Determine quotation type from policy type name
            const quotationTypes = await window.api.getQuotationTypes()
            const policyTypeName = (row.policyTypeName || '').toLowerCase()
            let qtCode = 'P' // default P&I
            if (policyTypeName.includes('hull') || policyTypeName.includes('h&m')) qtCode = 'H'
            else if (policyTypeName.includes('war')) qtCode = 'W'
            else if (policyTypeName.includes('fdd')) qtCode = 'F'
            else if (policyTypeName.includes('loss of hire') || policyTypeName.includes('loh')) qtCode = 'L'
            const quotationType = quotationTypes.find((qt: any) => qt.code === qtCode) || quotationTypes[0]
            if (!quotationType) throw new Error('No quotation types configured')

            // Fleet renewal: merge policy data from all fleet vessels into one quotation
            if (includeFleet) {
                const allVessels = await window.api.getVessels()
                const primaryVessel = allVessels.find((v: any) => v.id === row.vesselId)
                const primaryFleetId = primaryVessel?.fleetId
                if (primaryFleetId) {
                    const fleetVessels = allVessels.filter((v: any) => v.isActive && v.fleetId === primaryFleetId)
                    const fleetVesselIds = fleetVessels.map((v: any) => v.id)
                    const result = await window.api.policyRenewFleet(fleetVesselIds, qtCode)
                    if (result && !(result as any).error && result.quotationId) {
                        showSuccess(`Fleet renewal quotation created with ${fleetVessels.length} vessels`)
                        onCreateRenewalQuotation?.(result.quotationId)
                        return
                    }
                }
            }

            // Try to find an active policy document for this vessel → use policyRenew (clones everything)
            if (!includeFleet) {
                const policyDocId = await window.api.policyFindActiveForVessel(row.vesselId, qtCode)
                if (policyDocId) {
                    const result = await window.api.policyRenew(policyDocId)
                    if (result && !(result as any).error && result.quotationId) {
                        showSuccess(`Renewal quotation created from existing policy`)
                        onCreateRenewalQuotation?.(result.quotationId)
                        return
                    }
                }
            }

            // Calculate new period
            const endDate = row.endDate
            const newInception = endDate // new inception = old expiry
            const inceptionDate = new Date(newInception + 'T00:00:00')
            const periodText = `12 months from ${inceptionDate.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}`

            // Create quotation
            const q = await window.api.addQuotation({
                quotationTypeId: quotationType.id,
                policyTypeId: row.policyTypeId,
                isRenewal: true,
                periodText,
                quotationDate: new Date().toISOString().split('T')[0],
                createdBy: user?.username
            } as any)
            if (!q || (q as any).error) throw new Error('Failed to create quotation')

            // Get vessels and flag states for populating vessel data
            const allVessels = await window.api.getVessels()
            const flagStates = await window.api.getFlagStates()
            const primaryVessel = allVessels.find((v: any) => v.id === row.vesselId)
            const primaryFleetId = primaryVessel?.fleetId

            // Determine which vessels to add
            let vesselsToAdd: any[] = []
            if (includeFleet && primaryFleetId) {
                vesselsToAdd = allVessels.filter((v: any) => v.isActive && v.fleetId === primaryFleetId)
            } else {
                vesselsToAdd = primaryVessel ? [primaryVessel] : []
            }

            // Add vessel(s) to quotation
            for (let i = 0; i < vesselsToAdd.length; i++) {
                const v = vesselsToAdd[i]
                const flagName = v.flagStateId
                    ? (flagStates.find((f: any) => f.id === v.flagStateId)?.name || '')
                    : ''
                await window.api.addQuotationVessel({
                    quotationId: q.id,
                    vesselId: v.id,
                    vesselLabel: `V${i + 1}`,
                    order: i,
                    name: v.name,
                    imoNumber: v.imoNumber,
                    builtYear: v.builtYear,
                    grossTonnage: v.grossTonnage,
                    flag: flagName,
                    vesselType: v.vesselType,
                    classification: v.classificationSociety,
                    callSign: v.callSign
                })
            }

            // Auto-load vessel assureds for each vessel
            const allEntities = await window.api.getEntities()
            const assuredRoles = await window.api.getAssuredRoles()
            const roleOrder = new Map((Array.isArray(assuredRoles) ? assuredRoles : []).map((r: any, idx: number) => [r.name?.toLowerCase(), r.order ?? idx]))
            const existingEntityIds = new Set<string>()
            let assuredOrder = 0
            for (let i = 0; i < vesselsToAdd.length; i++) {
                const v = vesselsToAdd[i]
                const vLabel = `V${i + 1}`
                try {
                    const vassureds = await window.api.getVesselAssureds(v.id)
                    const toAdd = (Array.isArray(vassureds) ? vassureds : [])
                        .filter((va: any) => !existingEntityIds.has(va.entityId))
                        .sort((a: any, b: any) => (roleOrder.get(a.role?.toLowerCase()) ?? 999) - (roleOrder.get(b.role?.toLowerCase()) ?? 999))
                    for (const va of toAdd) {
                        const entity = allEntities.find((e: any) => e.id === va.entityId)
                        if (!entity) continue
                        // c/o role → set as broker
                        if (va.role && va.role.toLowerCase().replace(/[^a-z]/g, '') === 'co') {
                            if (!q.coName) await window.api.updateQuotation(q.id, { coName: entity.name } as any)
                            continue
                        }
                        await window.api.addQuotationAssured({
                            quotationId: q.id,
                            entityId: va.entityId,
                            name: entity.name,
                            role: va.role || undefined,
                            vesselLabel: vesselsToAdd.length > 1 ? vLabel : undefined,
                            order: assuredOrder++
                        })
                        existingEntityIds.add(va.entityId)
                    }
                } catch {}
            }

            showSuccess(`Renewal quotation ${q.referenceNumber || 'draft'} created`)
            onCreateRenewalQuotation?.(q.id)
        } catch (err: any) {
            showError(err.message || 'Failed to create renewal quotation')
        } finally {
            setRenewLoading(null)
        }
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
        if (policyTypeFilter !== 'all') {
            const filterPt = policyTypes.find(pt => pt.id === policyTypeFilter)
            filtered = filtered.filter(r =>
                r.policyTypeId === policyTypeFilter ||
                (filterPt && r.policyTypeName === filterPt.name)
            )
        }
        if (search.trim()) {
            const q = search.toLowerCase()
            filtered = filtered.filter(r =>
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
            if (sortField === 'premium') {
                const diff = (Number(a.premium) || 0) - (Number(b.premium) || 0)
                return sortDir === 'asc' ? diff : -diff
            }
            if (sortField === 'daysUntil') {
                const diff = daysUntil(a.endDate) - daysUntil(b.endDate)
                return sortDir === 'asc' ? diff : -diff
            }
            const aVal = a[sortField] ?? ''
            const bVal = b[sortField] ?? ''
            const cmp = String(aVal).localeCompare(String(bVal))
            return sortDir === 'asc' ? cmp : -cmp
        })
        return sorted
    }, [renewals, sortField, sortDir, search, policyTypeFilter])

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


    const G = {
        blue: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
        green: 'linear-gradient(135deg, #10b981, #059669)',
        amber: 'linear-gradient(135deg, #f59e0b, #d97706)',
        teal: 'linear-gradient(135deg, #14b8a6, #0d9488)',
    }

    const kpis = useMemo(() => {
        const filterPt = policyTypeFilter !== 'all' ? policyTypes.find(pt => pt.id === policyTypeFilter) : null
        const data = policyTypeFilter !== 'all'
            ? renewals.filter(r => r.policyTypeId === policyTypeFilter || (filterPt && r.policyTypeName === filterPt.name))
            : renewals
        const total = data.length
        const totalPremium = data.reduce((sum: number, r: any) => sum + (Number(r.premium) || 0), 0)
        const avgPremium = total > 0 ? totalPremium / total : 0
        const withStatus = data.filter((r: any) => r.renewalStatusName)
        const renewalRate = total > 0 ? Math.round((withStatus.length / total) * 100) : 0
        return { total, totalPremium, avgPremium, renewalRate }
    }, [renewals, policyTypeFilter])

    const exportToExcel = async () => {
        // Load notes for all renewals
        const notesByKey = new Map<string, string>()
        try {
            const notePromises = sortedRenewals.map(async r => {
                if (!r.id) return
                const notes = await window.api.getPolicyRenewalNotes(r.id, r.policyNumber || '')
                if (Array.isArray(notes) && notes.length > 0) {
                    const formatted = notes.map((n: any) =>
                        `[${n.createdByUsername || 'unknown'} ${formatDateTime(n.createdAt)}] ${n.note}`
                    ).join('\n')
                    notesByKey.set(`${r.id}::${r.policyNumber || ''}`, formatted)
                }
            })
            await Promise.all(notePromises)
        } catch { /* proceed without notes */ }

        const rows = sortedRenewals.map(r => ({
            'Vessel': r.vesselName,
            'IMO': r.imoNumber,
            'Customer': r.customerName || '-',
            'Fleet': r.fleetName || '-',
            'Policy Type': r.policyTypeName,
            'Policy Number': r.policyNumber || '',
            'End Date': r.endDate || '',
            'Premium': r.premium != null ? Number(r.premium) : '',
            'Currency': r.currency || 'USD',
            'Days Until Expiry': r.endDate ? daysUntil(r.endDate) : '',
            'Renewal Status': r.renewalStatusName || '',
            'Quotation Sent': r.quotationSentDate || '',
            'Notes': notesByKey.get(`${r.id}::${r.policyNumber || ''}`) || ''
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        // Set wider column width for Notes
        const colWidths = Object.keys(rows[0] || {}).map((k, i) => ({ wch: k === 'Notes' ? 60 : i === 0 ? 20 : 15 }))
        ws['!cols'] = colWidths
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
        padding: '10px 12px',
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
            {rnVisSet.has('vessel') && (
            <td style={{ padding: '8px 12px', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.vesselName}</span>
                    {r.policyTypeName && (
                        <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 600, background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {r.policyTypeName}
                        </span>
                    )}
                </div>
                {r.imoNumber && <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '1px' }}>IMO: {r.imoNumber}</div>}
            </td>
            )}
            {rnVisSet.has('customer') && (
            <td style={{ padding: '8px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.customerName || '\u2014'}</div>
                {r.fleetName && <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: '2px' }}>{r.fleetName}</div>}
            </td>
            )}
            {rnVisSet.has('policyType') && <td style={{ padding: '8px 12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{r.policyTypeName}</td>}
            {rnVisSet.has('policyNo') && <td style={{ padding: '8px 12px', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.policyNumber || '-'}</td>}
            {rnVisSet.has('endDate') && <td style={{ padding: '8px 12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{r.endDate || '-'}</td>}
            {rnVisSet.has('premium') && <td style={{ padding: '8px 12px', color: 'var(--text-primary)', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', fontSize: '0.82rem' }}>{formatPremium(r.premium, r.currency)}</td>}
            {rnVisSet.has('days') && (
            <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                {r.endDate ? (() => {
                    const d = daysUntil(r.endDate)
                    const color = d < 0 ? 'var(--danger)' : d <= 30 ? '#e68a00' : d <= 60 ? '#ffa726' : 'var(--success)'
                    const bg = d < 0 ? 'rgba(255,77,77,0.1)' : d <= 30 ? 'rgba(230,138,0,0.1)' : d <= 60 ? 'rgba(255,167,38,0.1)' : 'rgba(0,200,100,0.1)'
                    const label = d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'Today' : `${d}d`
                    return (
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', fontWeight: 600, background: bg, color, whiteSpace: 'nowrap' }}>
                            {label}
                        </span>
                    )
                })() : <span style={{ color: 'var(--text-secondary)' }}>-</span>}
            </td>
            )}
            {rnVisSet.has('status') && (
            <td style={{ padding: '8px 12px' }}>
                <select
                    value={r.renewalStatusId || ''}
                    onChange={e => handleSetStatus(r.id, e.target.value || null)}
                    disabled={!canManage}
                    style={{
                        padding: '3px 6px',
                        borderRadius: '10px',
                        border: r.renewalStatusColor ? `2px solid ${r.renewalStatusColor}` : '1px solid var(--input-border)',
                        background: r.renewalStatusColor ? `${r.renewalStatusColor}22` : 'var(--input-bg)',
                        color: r.renewalStatusId ? (isLight ? '#111111' : '#ffffff') : 'var(--text-secondary)',
                        fontSize: '0.78rem',
                        fontWeight: r.renewalStatusId ? '600' : '400',
                        cursor: 'pointer',
                        minWidth: '90px',
                        maxWidth: '100%'
                    }}
                >
                    <option value="">— None —</option>
                    {statusTypes.map(st => (
                        <option key={st.id} value={st.id}>{st.name}</option>
                    ))}
                </select>
            </td>
            )}
            {rnVisSet.has('quotSent') && (
            <td style={{ padding: '8px 12px' }}>
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
                        padding: '5px 8px', borderRadius: '6px', fontSize: '0.82rem', width: '100%', minWidth: '130px',
                        background: 'var(--input-bg)', color: 'var(--text-primary)',
                        border: '1px solid var(--input-border)',
                        colorScheme: isLight ? 'light' : 'dark'
                    }}
                />
            </td>
            )}
            {rnVisSet.has('actions') && (
            <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                <div style={{
                    display: 'inline-flex', gap: 0, alignItems: 'center',
                    borderRadius: '8px',
                    border: `1px solid ${isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`
                }}>
                    {/* Notes */}
                    <button
                        onClick={() => handleOpenNotes(r)}
                        style={{
                            padding: '6px 9px', background: 'transparent',
                            border: 'none', borderRight: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                            cursor: 'pointer', color: r.noteCount > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.12s'
                        }}
                        title={r.noteCount > 0 ? `${r.noteCount} note${r.noteCount > 1 ? 's' : ''}` : 'Add notes'}
                        onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                        <MessageSquare size={14} />
                        {r.noteCount > 0 && (
                            <span style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'var(--accent-primary)', color: '#fff', fontSize: '0.6rem', fontWeight: 700, minWidth: '14px', height: '14px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{r.noteCount}</span>
                        )}
                    </button>
                    {/* Renew */}
                    {hasPermission('quotations:create') && (
                        <button
                            ref={el => { if (r.id && el) renewBtnRefs.current[r.id] = el }}
                            onClick={(e) => {
                                e.stopPropagation()
                                if (!r.fleetName) {
                                    handleRenew(r, false)
                                } else {
                                    if (renewMenuId === r.id) {
                                        setRenewMenuId(null)
                                        setRenewMenuPos(null)
                                    } else {
                                        const btn = renewBtnRefs.current[r.id]
                                        if (btn) {
                                            const rect = btn.getBoundingClientRect()
                                            setRenewMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                                        }
                                        setRenewMenuId(r.id)
                                    }
                                }
                            }}
                            disabled={renewLoading === r.id}
                            style={{
                                padding: '6px 9px', background: 'transparent',
                                border: 'none', borderRight: `1px solid ${isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
                                cursor: 'pointer', color: 'var(--accent-primary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1px',
                                transition: 'background 0.12s'
                            }}
                            title="Create renewal quotation"
                            onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,210,255,0.08)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                        >
                            <RefreshCw size={14} style={renewLoading === r.id ? { animation: 'spin 1s linear infinite' } : undefined} />
                            {r.fleetName && <ChevronDownIcon size={10} />}
                        </button>
                    )}
                    {/* View */}
                    <button
                        onClick={() => onNavigateToVessel?.(r.vesselId)}
                        style={{
                            padding: '6px 9px', background: 'transparent',
                            border: 'none', cursor: 'pointer', color: 'var(--text-secondary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.12s'
                        }}
                        title="View vessel"
                        onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                        <Eye size={14} />
                    </button>
                </div>
            </td>
            )}
        </tr>
    )

    const totalWidth = colWidths.reduce((a, b) => a + b, 0)

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Policy Renewals</h1>
                <p style={{ color: 'var(--text-secondary)' }}>View policies expiring in a specific month.</p>
            </header>

            {/* ── KPI Row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '24px' }}>
                <KPI
                    icon={<Calendar size={20} color="#fff" />}
                    gradient={G.blue}
                    label="Total Renewals"
                    value={kpis.total}
                    sub={multiMonthView ? '3-month period' : `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`}
                />
                <KPI
                    icon={<DollarSign size={20} color="#fff" />}
                    gradient={G.green}
                    label="Total Premium"
                    value={kpis.totalPremium > 0 ? `$${Math.round(kpis.totalPremium).toLocaleString()}` : '--'}
                    sub="combined value"
                />
                <KPI
                    icon={<TrendingUp size={20} color="#fff" />}
                    gradient={G.amber}
                    label="Avg Premium"
                    value={kpis.avgPremium > 0 ? `$${Math.round(kpis.avgPremium).toLocaleString()}` : '--'}
                    sub="per policy"
                />
                <KPI
                    icon={<Percent size={20} color="#fff" />}
                    gradient={G.teal}
                    label="Renewal Rate"
                    value={`${kpis.renewalRate}%`}
                    sub="with status assigned"
                />
            </div>

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

                {/* Year selector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Year:</label>
                    <select
                        value={selectedYear}
                        onChange={e => setSelectedYear(Number(e.target.value))}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--input-border)',
                            background: 'var(--input-bg)',
                            color: 'var(--text-primary)',
                            fontSize: '0.85rem',
                        }}
                    >
                        {Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i).map(y => (
                            <option key={y} value={y}>{y}</option>
                        ))}
                    </select>
                </div>

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', color: 'var(--text-secondary)', opacity: 0.5, pointerEvents: 'none' }} />
                    <input
                        type="text"
                        placeholder="Search renewals..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '8px 28px 8px 36px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', width: '200px' }}
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

                {canManage && (
                    <button
                        onClick={() => setShowStatusManager(v => !v)}
                        className={showStatusManager ? 'btn-primary' : 'btn-secondary'}
                        style={{ padding: '8px 16px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Edit3 size={14} /> Manage Statuses
                    </button>
                )}

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

            {/* Policy Type Filter Chips */}
            {policyTypes.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <Filter size={14} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <button
                        onClick={() => setPolicyTypeFilter('all')}
                        style={{
                            padding: '5px 14px',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: policyTypeFilter === 'all' ? 600 : 400,
                            cursor: 'pointer',
                            border: policyTypeFilter === 'all' ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                            background: policyTypeFilter === 'all' ? 'rgba(0, 210, 255, 0.08)' : 'transparent',
                            color: policyTypeFilter === 'all' ? 'var(--accent-primary)' : 'var(--text-secondary)',
                            transition: 'all 0.15s',
                        }}
                    >
                        All
                    </button>
                    {policyTypes.map(pt => (
                        <button
                            key={pt.id}
                            onClick={() => setPolicyTypeFilter(pt.id)}
                            style={{
                                padding: '5px 14px',
                                borderRadius: '8px',
                                fontSize: '0.8rem',
                                fontWeight: policyTypeFilter === pt.id ? 600 : 400,
                                cursor: 'pointer',
                                border: policyTypeFilter === pt.id ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                                background: policyTypeFilter === pt.id ? 'rgba(0, 210, 255, 0.08)' : 'transparent',
                                color: policyTypeFilter === pt.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                transition: 'all 0.15s',
                            }}
                        >
                            {pt.name}
                        </button>
                    ))}
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                        {sortedRenewals.length} of {renewals.length} renewals | {new Set(sortedRenewals.map((r: any) => r.vesselId)).size} vessels
                    </span>
                </div>
            )}

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
                                {rnVisSet.has('vessel') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[0], cursor: 'pointer' }} onClick={() => handleSort('vesselName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Vessel <SortIcon field="vesselName" /></span>
                                    <ResizeHandle colIdx={0} />
                                </th>
                                )}
                                {rnVisSet.has('customer') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[1], cursor: 'pointer' }} onClick={() => handleSort('customerName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Customer <SortIcon field="customerName" /></span>
                                    <ResizeHandle colIdx={1} />
                                </th>
                                )}
                                {rnVisSet.has('policyType') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[2], cursor: 'pointer' }} onClick={() => handleSort('policyTypeName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Policy Type <SortIcon field="policyTypeName" /></span>
                                    <ResizeHandle colIdx={2} />
                                </th>
                                )}
                                {rnVisSet.has('policyNo') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[3], cursor: 'pointer' }} onClick={() => handleSort('policyNumber')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Policy No. <SortIcon field="policyNumber" /></span>
                                    <ResizeHandle colIdx={3} />
                                </th>
                                )}
                                {rnVisSet.has('endDate') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[4], cursor: 'pointer' }} onClick={() => handleSort('endDate')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>End Date <SortIcon field="endDate" /></span>
                                    <ResizeHandle colIdx={4} />
                                </th>
                                )}
                                {rnVisSet.has('premium') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[5], cursor: 'pointer' }} onClick={() => handleSort('premium')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Premium <SortIcon field="premium" /></span>
                                    <ResizeHandle colIdx={5} />
                                </th>
                                )}
                                {rnVisSet.has('days') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[6], cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('daysUntil')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>Days <SortIcon field="daysUntil" /></span>
                                    <ResizeHandle colIdx={6} />
                                </th>
                                )}
                                {rnVisSet.has('status') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[7], cursor: 'pointer' }} onClick={() => handleSort('renewalStatusName')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Status <SortIcon field="renewalStatusName" /></span>
                                    <ResizeHandle colIdx={7} />
                                </th>
                                )}
                                {rnVisSet.has('quotSent') && (
                                <th scope="col" style={{ ...thBase, width: colWidths[8], cursor: 'pointer' }} onClick={() => handleSort('quotationSentDate')}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Quot. Sent <SortIcon field="quotationSentDate" /></span>
                                    <ResizeHandle colIdx={8} />
                                </th>
                                )}
                                <th scope="col" style={{ ...thBase, width: colWidths[9], cursor: 'default', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                        {rnVisSet.has('actions') && 'Actions'}
                                        <ColumnSelector
                                            pageKey="renewals"
                                            allColumns={RENEWAL_COLUMNS}
                                            visibleColumns={rnVisibleCols}
                                            onChange={setRnVisibleCols}
                                        />
                                    </div>
                                    <ResizeHandle colIdx={9} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRenewals.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ padding: '52px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
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
                                                    <td colSpan={10} style={{
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
                                                            <td colSpan={10} style={{
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
                                            <td colSpan={10} style={{
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

                    {/* Footer summary */}
                    {sortedRenewals.length > 0 && (
                        <div style={{
                            padding: '12px 16px',
                            borderTop: '1px solid var(--table-border)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                        }}>
                            <span>
                                Showing {sortedRenewals.length} of {renewals.length} renewal{renewals.length !== 1 ? 's' : ''}
                            </span>
                            <span>
                                Total Premium: <strong style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                    ${Math.round(sortedRenewals.reduce((s: number, r: any) => s + (Number(r.premium) || 0), 0)).toLocaleString()}
                                </strong>
                            </span>
                        </div>
                    )}
                </div>
            )}

            {/* Renew dropdown (fixed position, rendered outside table to avoid clipping) */}
            {renewMenuId && renewMenuPos && (() => {
                const row = renewals.find(r => r.id === renewMenuId)
                if (!row) return null
                return (
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{
                            position: 'fixed', top: renewMenuPos.top, right: renewMenuPos.right,
                            background: isLight ? '#ffffff' : '#1a1d28',
                            border: '1px solid var(--glass-border)',
                            borderRadius: '8px', padding: '4px', minWidth: '200px', zIndex: 9999,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                        }}
                    >
                        <div
                            onClick={() => handleRenew(row, false)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            Renew Vessel Only
                        </div>
                        <div
                            onClick={() => handleRenew(row, true)}
                            style={{ padding: '10px 14px', cursor: 'pointer', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            Renew Fleet ({row.fleetName})
                        </div>
                    </div>
                )
            })()}

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
                        {canNotes && (
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
                        )}

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
