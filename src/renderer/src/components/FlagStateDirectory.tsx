import React, { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, Ship, Flag } from 'lucide-react'
import { FlagState } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { getFlagClass, countryNameToIso3 } from '../utils/countryCodeMap'
import ConfirmationModal from './ConfirmationModal'
import 'flag-icons/css/flag-icons.min.css'

interface FlagStateDirectoryProps {
    onNavigateToVessel?: (vesselId: string) => void
}

export default function FlagStateDirectory({ onNavigateToVessel }: FlagStateDirectoryProps) {
    const [flagStates, setFlagStates] = useState<FlagState[]>([])
    const [newName, setNewName] = useState('')
    const [newIso3, setNewIso3] = useState('')
    const [newAddress, setNewAddress] = useState('')
    const [newEmail, setNewEmail] = useState('')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [expandedVessels, setExpandedVessels] = useState<{ id: string; name: string; imoNumber: string }[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editIso3, setEditIso3] = useState('')
    const [editAddress, setEditAddress] = useState('')
    const [editEmail, setEditEmail] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const { showSuccess, showError } = useToast()

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const data = await window.api.getFlagStates()
        setFlagStates(data)
    }

    const handleNameChange = (value: string, setName: (v: string) => void, setIso3: (v: string) => void) => {
        setName(value)
        const match = countryNameToIso3.find(c => c.name.toLowerCase() === value.toLowerCase())
        if (match) setIso3(match.iso3)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim() || !newIso3.trim()) return
        if (newIso3.trim().length !== 3) {
            showError('ISO code must be exactly 3 characters')
            return
        }
        try {
            await window.api.addFlagState({ name: newName, iso3Code: newIso3.toUpperCase(), address: newAddress || undefined, email: newEmail || undefined })
            setNewName('')
            setNewIso3('')
            setNewAddress('')
            setNewEmail('')
            showSuccess('Flag state added')
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to add flag state')
        }
    }

    const handleDelete = async (id: string) => {
        await window.api.deleteFlagState(id)
        setExpandedId(null)
        setExpandedVessels([])
        setEditingId(null)
        setEditName('')
        setEditIso3('')
        setEditAddress('')
        setEditEmail('')
        setDeleteConfirmId(null)
        showSuccess('Flag state deleted')
        loadData()
    }

    const handleExpand = async (flagState: FlagState) => {
        if (expandedId === flagState.id) {
            setExpandedId(null)
            setExpandedVessels([])
            return
        }
        const vessels = await window.api.getVesselsByFlagState(flagState.id)
        setExpandedId(flagState.id)
        setExpandedVessels(vessels)
    }

    const startEditing = (fs: FlagState) => {
        setEditingId(fs.id)
        setEditName(fs.name)
        setEditIso3(fs.iso3Code)
        setEditAddress(fs.address || '')
        setEditEmail(fs.email || '')
    }

    const saveEdit = async (id: string) => {
        if (!editName.trim() || !editIso3.trim()) return
        if (editIso3.trim().length !== 3) {
            showError('ISO code must be exactly 3 characters')
            return
        }
        try {
            await window.api.updateFlagState(id, { name: editName, iso3Code: editIso3.toUpperCase(), address: editAddress || undefined, email: editEmail || undefined })
            setEditingId(null)
            showSuccess('Flag state updated')
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to update flag state')
        }
    }

    return (
        <div className="fade-in">
            <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Flag States</h1>
                <p style={{ color: 'var(--text-secondary)' }}>Manage vessel flag state registries.</p>
            </header>

            {/* Add Form */}
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Flag size={20} color="var(--accent-primary)" /> Add Flag State
                </h3>
                <form onSubmit={handleAdd}>
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => handleNameChange(e.target.value, setNewName, setNewIso3)}
                            placeholder="Country name (e.g. Panama)"
                            style={{ flex: 2 }}
                            list="country-names-add"
                            aria-label="Flag state name"
                        />
                        <datalist id="country-names-add">
                            {countryNameToIso3.map(c => (
                                <option key={c.iso3} value={c.name} />
                            ))}
                        </datalist>
                        <input
                            type="text"
                            value={newIso3}
                            onChange={e => setNewIso3(e.target.value.toUpperCase().slice(0, 3))}
                            placeholder="ISO3 (e.g. PAN)"
                            style={{ width: '100px', textTransform: 'uppercase' }}
                            maxLength={3}
                            aria-label="ISO 3-letter code"
                        />
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <textarea
                            value={newAddress}
                            onChange={e => setNewAddress(e.target.value)}
                            placeholder="Address (optional)"
                            rows={2}
                            style={{ flex: 1, resize: 'vertical' }}
                            aria-label="Flag state address"
                        />
                        <textarea
                            value={newEmail}
                            onChange={e => setNewEmail(e.target.value)}
                            placeholder="Email addresses (comma-separated, optional)"
                            rows={2}
                            style={{ flex: 1, resize: 'vertical' }}
                            aria-label="Flag state emails"
                        />
                    </div>
                </form>
            </section>

            {/* Flag States Table */}
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <caption className="sr-only">Flag states</caption>
                    <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                            <th scope="col" style={{ padding: '16px', width: '40px' }}></th>
                            <th scope="col" style={{ padding: '16px' }}>Flag State</th>
                            <th scope="col" style={{ padding: '16px', width: '80px' }}>Code</th>
                            <th scope="col" style={{ padding: '16px', width: '120px' }}>Vessels</th>
                            <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {flagStates.length === 0 ? (
                            <tr>
                                <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                    No flag states added yet.
                                </td>
                            </tr>
                        ) : flagStates.map(fs => {
                            const flagCls = getFlagClass(fs.iso3Code)
                            const isExpanded = expandedId === fs.id
                            const isEditingRow = editingId === fs.id
                            return (
                                <React.Fragment key={fs.id}>
                                    <tr
                                        style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--table-border)', cursor: 'pointer' }}
                                        className="hover-effect"
                                        onClick={() => !isEditingRow && handleExpand(fs)}
                                    >
                                        <td style={{ padding: '16px', width: '40px' }}>
                                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {isEditingRow ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="text"
                                                        value={editName}
                                                        onChange={e => handleNameChange(e.target.value, setEditName, setEditIso3)}
                                                        style={{ flex: 1, minWidth: '150px' }}
                                                        list="country-names-edit"
                                                        autoFocus
                                                    />
                                                    <datalist id="country-names-edit">
                                                        {countryNameToIso3.map(c => (
                                                            <option key={c.iso3} value={c.name} />
                                                        ))}
                                                    </datalist>
                                                    <input
                                                        type="text"
                                                        value={editIso3}
                                                        onChange={e => setEditIso3(e.target.value.toUpperCase().slice(0, 3))}
                                                        style={{ width: '80px', textTransform: 'uppercase' }}
                                                        maxLength={3}
                                                    />
                                                    <textarea
                                                        value={editAddress}
                                                        onChange={e => setEditAddress(e.target.value)}
                                                        placeholder="Address"
                                                        rows={2}
                                                        style={{ width: '100%', resize: 'vertical' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={editEmail}
                                                        onChange={e => setEditEmail(e.target.value)}
                                                        placeholder="Email addresses (comma-separated)"
                                                        style={{ width: '100%' }}
                                                    />
                                                    <div style={{ display: 'flex', gap: '6px' }}>
                                                        <button onClick={(e) => { e.stopPropagation(); saveEdit(fs.id) }} className="btn-primary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Save</button>
                                                        <button onClick={(e) => { e.stopPropagation(); setEditingId(null) }} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    {flagCls && <span className={flagCls} style={{ fontSize: '1.2rem' }}></span>}
                                                    <span style={{ fontWeight: '600' }}>{fs.name}</span>
                                                    {fs.address && (
                                                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '4px' }}>
                                                            — {fs.address.split('\n')[0]}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px', width: '80px' }}>
                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{fs.iso3Code}</span>
                                        </td>
                                        <td style={{ padding: '16px', width: '120px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                                <Ship size={14} /> {fs.vesselCount || 0}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); startEditing(fs) }}
                                                    style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                    title="Edit"
                                                    aria-label="Edit flag state"
                                                >
                                                    <Pencil size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(fs.id) }}
                                                    style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer', padding: '4px' }}
                                                    title="Delete"
                                                    aria-label="Delete flag state"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    {isExpanded && (
                                        <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                                            <td colSpan={5} style={{ padding: '0 16px 16px 56px', borderTop: '1px solid var(--table-border)' }}>
                                                {(fs.address || fs.email) && (
                                                    <div style={{ marginBottom: '12px', marginTop: '12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                                        {fs.address && <div style={{ whiteSpace: 'pre-line', marginBottom: fs.email ? '8px' : '0' }}>{fs.address}</div>}
                                                        {fs.email && (
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: '600', fontSize: '0.8rem' }}>Email:</span>
                                                                {fs.email.split(',').map((e, i) => (
                                                                    <span key={i} style={{
                                                                        padding: '2px 8px',
                                                                        borderRadius: '4px',
                                                                        background: 'rgba(0, 210, 255, 0.08)',
                                                                        border: '1px solid rgba(0, 210, 255, 0.15)',
                                                                        fontSize: '0.8rem'
                                                                    }}>{e.trim()}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {expandedVessels.length === 0 ? (
                                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', marginTop: '12px' }}>
                                                        No vessels registered under this flag.
                                                    </div>
                                                ) : (
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '12px' }}>
                                                        <caption className="sr-only">Vessels under {fs.name}</caption>
                                                        <thead>
                                                            <tr style={{ background: 'var(--table-header-bg)' }}>
                                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Vessel</th>
                                                                <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>IMO</th>
                                                                <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {expandedVessels.map(v => (
                                                                <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                                                    <td style={{ padding: '8px 12px', fontWeight: '600' }}>{v.name}</td>
                                                                    <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{v.imoNumber}</td>
                                                                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                                                        {onNavigateToVessel && (
                                                                            <button
                                                                                onClick={() => onNavigateToVessel(v.id)}
                                                                                className="btn-primary"
                                                                                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                                                                            >
                                                                                Open
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {deleteConfirmId && (
                <ConfirmationModal
                    title="Delete Flag State"
                    message="Delete this flag state? Vessels will have their flag unset."
                    confirmLabel="Delete"
                    isDangerous
                    onConfirm={() => handleDelete(deleteConfirmId)}
                    onCancel={() => setDeleteConfirmId(null)}
                />
            )}
        </div>
    )
}
