import { useState, useEffect } from 'react'
import { Plus, Search, FileText, Trash2 } from 'lucide-react'
import { Quotation, QuotationType } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import ConfirmationModal from './ConfirmationModal'

const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    sent: { bg: 'rgba(0, 150, 255, 0.15)', text: '#0096ff' },
    approved: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    rejected: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    converted: { bg: 'rgba(180, 100, 255, 0.15)', text: '#b464ff' }
}

interface QuotationListProps {
    onOpenQuotation: (quotation: Quotation) => void
}

export default function QuotationList({ onOpenQuotation }: QuotationListProps) {
    const [quotations, setQuotations] = useState<Quotation[]>([])
    const [quotationTypes, setQuotationTypes] = useState<QuotationType[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [typeFilter, setTypeFilter] = useState<string>('all')
    const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; quotation: Quotation | null }>({ show: false, quotation: null })
    const [showNewMenu, setShowNewMenu] = useState(false)
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        const [q, qt] = await Promise.all([
            window.api.getQuotations(),
            window.api.getQuotationTypes()
        ])
        setQuotations(Array.isArray(q) ? q : [])
        setQuotationTypes(Array.isArray(qt) ? qt : [])
    }

    const handleCreate = async (quotationTypeId: string) => {
        try {
            setShowNewMenu(false)
            const today = new Date().toISOString().split('T')[0]
            const created = await window.api.addQuotation({
                quotationDate: today,
                quotationTypeId,
                status: 'draft'
            })
            showSuccess('Quotation created')
            onOpenQuotation(created)
        } catch (err: any) {
            showError(err.message || 'Failed to create quotation')
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirm.quotation) return
        try {
            await window.api.deleteQuotation(deleteConfirm.quotation.id)
            showSuccess('Quotation deleted')
            setDeleteConfirm({ show: false, quotation: null })
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to delete quotation')
        }
    }

    const filtered = quotations.filter(q => {
        if (statusFilter !== 'all' && q.status !== statusFilter) return false
        if (typeFilter !== 'all' && q.quotationTypeId !== typeFilter) return false
        if (search) {
            const s = search.toLowerCase()
            if (!((q.referenceNumber || '').toLowerCase().includes(s) || (q.vesselName || '').toLowerCase().includes(s) || (q.quotationTypeName || '').toLowerCase().includes(s))) return false
        }
        return true
    })

    return (
        <div>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} size={16} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search by reference, vessel, or type..."
                        style={{ width: '100%', paddingLeft: '36px' }}
                    />
                </div>
                <select
                    value={typeFilter}
                    onChange={e => setTypeFilter(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                >
                    <option value="all">All Types</option>
                    {quotationTypes.map(qt => (
                        <option key={qt.id} value={qt.id}>{qt.name}</option>
                    ))}
                </select>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    style={{ padding: '10px 14px', borderRadius: '8px', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', border: '1px solid var(--glass-border)' }}
                >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="converted">Converted</option>
                </select>
                <div style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowNewMenu(!showNewMenu)}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                    >
                        <Plus size={18} /> New Quotation
                    </button>
                    {showNewMenu && (
                        <>
                            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNewMenu(false)} />
                            <div style={{
                                position: 'absolute',
                                top: '100%',
                                right: 0,
                                marginTop: '4px',
                                background: isLight ? '#ffffff' : '#1a1d28',
                                border: '1px solid var(--glass-border)',
                                borderRadius: '10px',
                                padding: '6px',
                                zIndex: 100,
                                minWidth: '180px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                            }}>
                                {quotationTypes.map(qt => (
                                    <button
                                        key={qt.id}
                                        onClick={() => handleCreate(qt.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            width: '100%',
                                            padding: '10px 14px',
                                            border: 'none',
                                            borderRadius: '6px',
                                            background: 'transparent',
                                            color: 'var(--text-primary)',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            textAlign: 'left'
                                        }}
                                        className="hover-effect"
                                    >
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            background: 'var(--accent-primary)',
                                            color: '#fff',
                                            fontSize: '0.7rem',
                                            fontWeight: 700
                                        }}>{qt.code}</span>
                                        {qt.name}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Reference</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Type</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Date</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Vessel</th>
                            <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Status</th>
                            <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    <FileText size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
                                    <div>No quotations found</div>
                                </td>
                            </tr>
                        ) : filtered.map(q => {
                            const sc = statusColors[q.status] || statusColors.draft
                            return (
                                <tr
                                    key={q.id}
                                    style={{ borderBottom: '1px solid var(--table-border)', cursor: 'pointer' }}
                                    className="hover-effect"
                                    onClick={() => onOpenQuotation(q)}
                                >
                                    <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                                        {q.referenceNumber || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No ref</span>}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {q.quotationTypeName ? (
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '3px 10px',
                                                borderRadius: '6px',
                                                fontSize: '0.8rem',
                                                fontWeight: 600,
                                                background: 'rgba(0, 170, 200, 0.12)',
                                                color: isLight ? '#007a91' : '#00aac8'
                                            }}>
                                                {q.quotationTypeName}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        {q.quotationDate ? new Date(q.quotationDate).toLocaleDateString() : '-'}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {q.vesselName ? (
                                            <>
                                                {q.vesselName}
                                                {(q as any).vesselCount > 1 && (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '6px' }}>+{(q as any).vesselCount - 1}</span>
                                                )}
                                            </>
                                        ) : <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No vessel</span>}
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <span style={{
                                            padding: '4px 10px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 600,
                                            textTransform: 'uppercase',
                                            background: sc.bg,
                                            color: sc.text
                                        }}>
                                            {q.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ show: true, quotation: q }) }}
                                            className="btn-secondary"
                                            style={{ padding: '6px', color: 'var(--danger)' }}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {deleteConfirm.show && deleteConfirm.quotation && (
                <ConfirmationModal
                    title="Delete Quotation?"
                    message={`Delete quotation ${deleteConfirm.quotation.referenceNumber || '(no ref)'}? This cannot be undone.`}
                    confirmLabel="Delete"
                    isDangerous
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteConfirm({ show: false, quotation: null })}
                />
            )}
        </div>
    )
}
