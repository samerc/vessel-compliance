import React, { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, Pencil, Ship, Flag, X, Anchor, Building2, CheckCircle2 } from 'lucide-react'
import { FlagState, FlagStatePort } from '../../../shared/types'
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
    const [editRatifiedBunker, setEditRatifiedBunker] = useState(false)
    const [editRatifiedWreck, setEditRatifiedWreck] = useState(false)
    const [editAuthorityName, setEditAuthorityName] = useState('')
    const [editAuthorityAddress, setEditAuthorityAddress] = useState('')
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const { showSuccess, showError } = useToast()

    // Ports state
    const [expandedPorts, setExpandedPorts] = useState<FlagStatePort[]>([])
    const [newPortName, setNewPortName] = useState('')
    const [newPortDefault, setNewPortDefault] = useState(false)
    const [editingPortId, setEditingPortId] = useState<string | null>(null)
    const [editPortName, setEditPortName] = useState('')
    const [editPortDefault, setEditPortDefault] = useState(false)

    useEffect(() => {
        loadData()
    }, [])

    const loadData = async () => {
        const data = await window.api.getFlagStates()
        setFlagStates(Array.isArray(data) ? data : [])
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
        setExpandedPorts([])
        setEditingId(null)
        setEditName('')
        setEditIso3('')
        setEditAddress('')
        setEditEmail('')
        setEditRatifiedBunker(false)
        setEditRatifiedWreck(false)
        setEditAuthorityName('')
        setEditAuthorityAddress('')
        setDeleteConfirmId(null)
        showSuccess('Flag state deleted')
        loadData()
    }

    const handleExpand = async (flagState: FlagState) => {
        if (expandedId === flagState.id) {
            setExpandedId(null)
            setExpandedVessels([])
            setExpandedPorts([])
            return
        }
        const [vessels, ports] = await Promise.all([
            window.api.getVesselsByFlagState(flagState.id),
            window.api.flagStateGetPorts(flagState.id)
        ])
        setExpandedId(flagState.id)
        setExpandedVessels(vessels)
        setExpandedPorts(Array.isArray(ports) ? ports : [])
    }

    const startEditing = (fs: FlagState) => {
        setEditingId(fs.id)
        setEditName(fs.name)
        setEditIso3(fs.iso3Code)
        setEditAddress(fs.address || '')
        setEditEmail(fs.email || '')
        setEditRatifiedBunker(Boolean(fs.ratifiedBunker))
        setEditRatifiedWreck(Boolean(fs.ratifiedWreck))
        setEditAuthorityName(fs.authorityName || '')
        setEditAuthorityAddress(fs.authorityAddress || '')
    }

    const saveEdit = async (id: string) => {
        if (!editName.trim() || !editIso3.trim()) return
        if (editIso3.trim().length !== 3) {
            showError('ISO code must be exactly 3 characters')
            return
        }
        try {
            await window.api.updateFlagState(id, {
                name: editName,
                iso3Code: editIso3.toUpperCase(),
                address: editAddress || undefined,
                email: editEmail || undefined,
                ratifiedBunker: editRatifiedBunker,
                ratifiedWreck: editRatifiedWreck,
                authorityName: editAuthorityName || undefined,
                authorityAddress: editAuthorityAddress || undefined
            })
            setEditingId(null)
            showSuccess('Flag state updated')
            loadData()
        } catch (err: any) {
            showError(err.message || 'Failed to update flag state')
        }
    }

    // Port handlers
    const handleAddPort = async (flagStateId: string) => {
        if (!newPortName.trim()) return
        try {
            const port = await window.api.flagStateAddPort(flagStateId, newPortName.trim(), newPortDefault) as any
            if (port && !port.error) {
                // If new port is default, unset others locally
                const updated = newPortDefault
                    ? expandedPorts.map(p => ({ ...p, isDefault: false }))
                    : [...expandedPorts]
                updated.push(port)
                setExpandedPorts(updated)
                setNewPortName('')
                setNewPortDefault(false)
                showSuccess('Port added')
            }
        } catch (err: any) {
            showError(err.message || 'Failed to add port')
        }
    }

    const handleUpdatePort = async () => {
        if (!editingPortId || !editPortName.trim()) return
        try {
            await window.api.flagStateUpdatePort(editingPortId, editPortName.trim(), editPortDefault)
            // Update local state
            setExpandedPorts(prev => prev.map(p => {
                if (p.id === editingPortId) return { ...p, name: editPortName.trim(), isDefault: editPortDefault }
                if (editPortDefault) return { ...p, isDefault: false }
                return p
            }))
            setEditingPortId(null)
            showSuccess('Port updated')
        } catch (err: any) {
            showError(err.message || 'Failed to update port')
        }
    }

    const handleDeletePort = async (portId: string) => {
        try {
            await window.api.flagStateDeletePort(portId)
            setExpandedPorts(prev => prev.filter(p => p.id !== portId))
            showSuccess('Port deleted')
        } catch (err: any) {
            showError(err.message || 'Failed to delete port')
        }
    }

    const sectionHeaderStyle: React.CSSProperties = {
        fontSize: '0.75rem',
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-secondary)',
        marginTop: '12px',
        marginBottom: '6px'
    }

    const badgeStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: '500'
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
                            <th scope="col" style={{ padding: '16px', width: '160px' }}>Conventions</th>
                            <th scope="col" style={{ padding: '16px', width: '120px' }}>Vessels</th>
                            <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {flagStates.length === 0 ? (
                            <tr>
                                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)' }}>
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

                                                    {/* Conventions */}
                                                    <div style={{ width: '100%' }}>
                                                        <div style={sectionHeaderStyle}>Conventions</div>
                                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editRatifiedBunker}
                                                                    onChange={e => setEditRatifiedBunker(e.target.checked)}
                                                                />
                                                                Bunker Convention (2001)
                                                            </label>
                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={editRatifiedWreck}
                                                                    onChange={e => setEditRatifiedWreck(e.target.checked)}
                                                                />
                                                                Wreck Removal Convention (2007)
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* Maritime Authority */}
                                                    <div style={{ width: '100%' }}>
                                                        <div style={sectionHeaderStyle}>Maritime Authority</div>
                                                        <div style={{ display: 'flex', gap: '12px' }}>
                                                            <input
                                                                type="text"
                                                                value={editAuthorityName}
                                                                onChange={e => setEditAuthorityName(e.target.value)}
                                                                placeholder="Authority name (e.g. Panama Maritime Authority)"
                                                                style={{ flex: 1 }}
                                                            />
                                                        </div>
                                                        <textarea
                                                            value={editAuthorityAddress}
                                                            onChange={e => setEditAuthorityAddress(e.target.value)}
                                                            placeholder="Authority address"
                                                            rows={2}
                                                            style={{ width: '100%', resize: 'vertical', marginTop: '8px' }}
                                                        />
                                                    </div>

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
                                        <td style={{ padding: '16px', width: '160px' }}>
                                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                {fs.ratifiedBunker && (
                                                    <span style={{ ...badgeStyle, background: 'rgba(0, 200, 120, 0.1)', border: '1px solid rgba(0, 200, 120, 0.25)', color: 'rgb(0, 180, 100)' }}>
                                                        <CheckCircle2 size={10} /> Bunker
                                                    </span>
                                                )}
                                                {fs.ratifiedWreck && (
                                                    <span style={{ ...badgeStyle, background: 'rgba(0, 170, 200, 0.1)', border: '1px solid rgba(0, 170, 200, 0.25)', color: 'rgb(0, 150, 180)' }}>
                                                        <CheckCircle2 size={10} /> Wreck
                                                    </span>
                                                )}
                                            </div>
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
                                            <td colSpan={6} style={{ padding: '0 16px 16px 56px', borderTop: '1px solid var(--table-border)' }}>
                                                {/* Address & Email */}
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

                                                {/* Maritime Authority */}
                                                {(fs.authorityName || fs.authorityAddress) && (
                                                    <div style={{ marginBottom: '12px', marginTop: fs.address || fs.email ? '0' : '12px' }}>
                                                        <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Building2 size={12} /> Maritime Authority
                                                        </div>
                                                        {fs.authorityName && (
                                                            <div style={{ fontWeight: '600', fontSize: '0.85rem', marginBottom: '4px' }}>{fs.authorityName}</div>
                                                        )}
                                                        {fs.authorityAddress && (
                                                            <div style={{ whiteSpace: 'pre-line', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{fs.authorityAddress}</div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Ports of Registry */}
                                                <div style={{ marginBottom: '12px', marginTop: '12px' }}>
                                                    <div style={{ ...sectionHeaderStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Anchor size={12} /> Ports of Registry
                                                    </div>
                                                    {expandedPorts.length > 0 && (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                                            {expandedPorts.map(port => (
                                                                <div key={port.id} style={{
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    background: port.isDefault ? 'rgba(0, 170, 200, 0.1)' : 'rgba(255,255,255,0.04)',
                                                                    border: port.isDefault ? '1px solid rgba(0, 170, 200, 0.3)' : '1px solid var(--glass-border)',
                                                                    fontSize: '0.85rem'
                                                                }}>
                                                                    {editingPortId === port.id ? (
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                            <input
                                                                                type="text"
                                                                                value={editPortName}
                                                                                onChange={e => setEditPortName(e.target.value)}
                                                                                style={{ width: '120px', padding: '2px 6px', fontSize: '0.85rem' }}
                                                                                autoFocus
                                                                                onKeyDown={e => { if (e.key === 'Enter') handleUpdatePort(); if (e.key === 'Escape') setEditingPortId(null) }}
                                                                            />
                                                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', cursor: 'pointer' }}>
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={editPortDefault}
                                                                                    onChange={e => setEditPortDefault(e.target.checked)}
                                                                                />
                                                                                Default
                                                                            </label>
                                                                            <button
                                                                                onClick={() => handleUpdatePort()}
                                                                                className="btn-primary"
                                                                                style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                                                            >Save</button>
                                                                            <button
                                                                                onClick={() => setEditingPortId(null)}
                                                                                className="btn-secondary"
                                                                                style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                                                                            >Cancel</button>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                            <span style={{ fontWeight: port.isDefault ? '600' : '400' }}>{port.name}</span>
                                                                            {port.isDefault && (
                                                                                <span style={{
                                                                                    fontSize: '0.65rem',
                                                                                    padding: '1px 5px',
                                                                                    borderRadius: '3px',
                                                                                    background: 'rgba(0, 170, 200, 0.2)',
                                                                                    color: 'var(--accent-primary)',
                                                                                    fontWeight: '600',
                                                                                    textTransform: 'uppercase'
                                                                                }}>Default</span>
                                                                            )}
                                                                            <button
                                                                                onClick={() => {
                                                                                    setEditingPortId(port.id)
                                                                                    setEditPortName(port.name)
                                                                                    setEditPortDefault(port.isDefault)
                                                                                }}
                                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--accent-primary)' }}
                                                                                title="Edit port"
                                                                            >
                                                                                <Pencil size={12} />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeletePort(port.id)}
                                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--danger)' }}
                                                                                title="Delete port"
                                                                            >
                                                                                <X size={12} />
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {expandedPorts.length === 0 && (
                                                        <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '8px' }}>
                                                            No ports of registry added.
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <input
                                                            type="text"
                                                            value={newPortName}
                                                            onChange={e => setNewPortName(e.target.value)}
                                                            placeholder="Port name"
                                                            style={{ width: '180px', padding: '4px 8px', fontSize: '0.85rem' }}
                                                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPort(fs.id) } }}
                                                        />
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={newPortDefault}
                                                                onChange={e => setNewPortDefault(e.target.checked)}
                                                            />
                                                            Default
                                                        </label>
                                                        <button
                                                            onClick={() => handleAddPort(fs.id)}
                                                            className="btn-primary"
                                                            style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            <Plus size={14} /> Add Port
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Vessels */}
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
