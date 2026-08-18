import { useState, useEffect, useMemo, useCallback } from 'react'
import { Receipt, Vessel, VesselAssured } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { confirmDialog } from './DialogHost'
import {
  exportReceiptDocx, buildBeingText, amountInWords, formatReceiptAmount
} from '../services/ReceiptExportService'
import {
  Receipt as ReceiptIcon, Plus, FileDown, Trash2, Pencil, Search, X, Settings, Ship
} from 'lucide-react'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'CHF', 'JPY', 'LBP']

interface PolicyLite {
  id: string
  policyNumber: string
  vesselId: string
  quotationTypeName?: string
  status?: string
}

interface ReceiptManagerProps {
  vesselId?: string
  vesselName?: string
  embedded?: boolean
}

interface FormPolicy { policyDocId: string | null; policyNumber: string }

export default function ReceiptManager({ vesselId, vesselName, embedded = false }: ReceiptManagerProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const { showError, showSuccess } = useToast()

  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [editing, setEditing] = useState<Receipt | null>(null)

  const modalBg = isLight ? '#ffffff' : '#1a1d28'

  const loadReceipts = useCallback(async () => {
    setLoading(true)
    try {
      const data = vesselId ? await window.api.receiptListByVessel(vesselId) : await window.api.receiptList()
      setReceipts(Array.isArray(data) ? data : [])
    } catch (e: any) {
      showError(e?.message || 'Failed to load receipts')
    } finally {
      setLoading(false)
    }
  }, [vesselId, showError])

  useEffect(() => { loadReceipts() }, [loadReceipts])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return receipts
    return receipts.filter(r =>
      r.receiptNumber.toLowerCase().includes(q) ||
      (r.vesselName || '').toLowerCase().includes(q) ||
      (r.payerName || '').toLowerCase().includes(q) ||
      (r.coversText || '').toLowerCase().includes(q)
    )
  }, [receipts, search])

  const handleDelete = async (r: Receipt) => {
    const ok = await confirmDialog(`Delete receipt ${r.receiptNumber}? This cannot be undone.`)
    if (!ok) return
    try {
      await window.api.receiptDelete(r.id)
      showSuccess('Receipt deleted')
      loadReceipts()
    } catch (e: any) {
      showError(e?.message || 'Failed to delete receipt')
    }
  }

  const handleExport = async (r: Receipt) => {
    try {
      const full = await window.api.receiptGet(r.id)
      await exportReceiptDocx(full || r)
    } catch (e: any) {
      showError(e?.message || 'Failed to export receipt')
    }
  }

  const openCreate = () => { setEditing(null); setShowModal(true) }
  const openEdit = async (r: Receipt) => {
    try {
      const full = await window.api.receiptGet(r.id)
      setEditing(full || r)
      setShowModal(true)
    } catch (e: any) {
      showError(e?.message || 'Failed to load receipt')
    }
  }

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', borderBottom: '1px solid var(--glass-border)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: '0.85rem', borderBottom: '1px solid var(--glass-border)' }

  return (
    <div style={{ padding: embedded ? 0 : '32px', maxWidth: embedded ? undefined : '1400px', margin: embedded ? undefined : '0 auto' }}>
      {!embedded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
              <ReceiptIcon size={28} /> Receipts
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>Payment receipts issued against vessel policies</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-secondary" onClick={() => setShowSettings(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Settings size={16} /> Settings
            </button>
            <button className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> New Receipt
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{receipts.length} receipt{receipts.length === 1 ? '' : 's'}</div>
          <button className="btn-primary" onClick={openCreate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} /> New Receipt
          </button>
        </div>
      )}

      <div style={{ position: 'relative', maxWidth: '360px', marginBottom: '16px' }}>
        <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search number, vessel, payer..."
          style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
        />
      </div>

      <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>Number</th>
                <th style={th}>Date</th>
                {!vesselId && <th style={th}>Vessel</th>}
                <th style={th}>Received From</th>
                <th style={th}>Covers</th>
                <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                <th style={{ ...th, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td style={td} colSpan={vesselId ? 6 : 7}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td style={{ ...td, textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }} colSpan={vesselId ? 6 : 7}>
                  No receipts yet. Click “New Receipt” to create one.
                </td></tr>
              ) : filtered.map(r => (
                <tr key={r.id}>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600 }}>{r.receiptNumber}</td>
                  <td style={td}>{r.receiptDate}</td>
                  {!vesselId && <td style={td}>{r.vesselName || '—'}</td>}
                  <td style={td}>{r.payerName}</td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                    {(r.policies && r.policies.length > 0 ? r.policies.map(p => p.policyNumber).join(' & ') : (r.coversText || '—'))}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{formatReceiptAmount(r.amount, r.currency)}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button title="Export DOCX" onClick={() => handleExport(r)} style={iconBtn}><FileDown size={16} /></button>
                    <button title="Edit" onClick={() => openEdit(r)} style={iconBtn}><Pencil size={16} /></button>
                    <button title="Delete" onClick={() => handleDelete(r)} style={{ ...iconBtn, color: 'var(--danger)' }}><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ReceiptModal
          isLight={isLight}
          modalBg={modalBg}
          editing={editing}
          lockedVesselId={vesselId}
          lockedVesselName={vesselName}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); loadReceipts() }}
        />
      )}

      {showSettings && (
        <SettingsModal modalBg={modalBg} onClose={() => setShowSettings(false)} />
      )}
    </div>
  )
}

const iconBtn: React.CSSProperties = { background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px 6px', verticalAlign: 'middle' }

// ── Create / Edit modal ──────────────────────────────────────────────────
function ReceiptModal({ isLight, modalBg, editing, lockedVesselId, lockedVesselName, onClose, onSaved }: {
  isLight: boolean
  modalBg: string
  editing: Receipt | null
  lockedVesselId?: string
  lockedVesselName?: string
  onClose: () => void
  onSaved: () => void
}) {
  const { showError, showSuccess } = useToast()
  const [vessels, setVessels] = useState<Vessel[]>([])
  const [assureds, setAssureds] = useState<VesselAssured[]>([])
  const [entityMap, setEntityMap] = useState<Record<string, string>>({})
  const [policies, setPolicies] = useState<PolicyLite[]>([])
  const [saving, setSaving] = useState(false)
  const [vesselSearch, setVesselSearch] = useState('')
  const [vesselDropOpen, setVesselDropOpen] = useState(false)

  const today = new Date().toISOString().slice(0, 10)

  // form state
  const [vId, setVId] = useState<string | null>(editing?.vesselId ?? lockedVesselId ?? null)
  const [vName, setVName] = useState<string>(editing?.vesselName ?? lockedVesselName ?? '')
  const [payerName, setPayerName] = useState(editing?.payerName ?? '')
  const [payerEntityId, setPayerEntityId] = useState<string | null>(editing?.payerEntityId ?? null)
  const [amount, setAmount] = useState<string>(editing?.amount != null ? String(editing.amount) : '')
  const [currency, setCurrency] = useState(editing?.currency ?? 'USD')
  const [instalmentNumber, setInstalmentNumber] = useState<string>(editing?.instalmentNumber != null ? String(editing.instalmentNumber) : '1')
  const [selectedPolicies, setSelectedPolicies] = useState<FormPolicy[]>(editing?.policies?.map(p => ({ policyDocId: p.policyDocId ?? null, policyNumber: p.policyNumber })) ?? [])
  const [freeCovers, setFreeCovers] = useState('')
  const [receiptDate, setReceiptDate] = useState(editing?.receiptDate || today)
  const [numberPreview, setNumberPreview] = useState(editing?.receiptNumber || '')
  const [numberOverride, setNumberOverride] = useState(!!editing)
  const [beingOverride, setBeingOverride] = useState<string | null>(editing?.beingText ?? null)
  const [wordsOverride, setWordsOverride] = useState<string | null>(editing?.amountWords ?? null)
  const [city, setCity] = useState(editing?.city || 'BEIRUT')

  // Load vessels + next number + settings once
  useEffect(() => {
    (async () => {
      try {
        const vs = await window.api.getVessels()
        setVessels(Array.isArray(vs) ? vs : [])
      } catch { /* ignore */ }
      try {
        const ents = await window.api.getEntities()
        const map: Record<string, string> = {}
        for (const e of (Array.isArray(ents) ? ents : [])) map[e.id] = e.name
        setEntityMap(map)
      } catch { /* ignore */ }
      if (!editing) {
        try {
          const y = new Date(receiptDate).getFullYear()
          const nn = await window.api.receiptNextNumber(y)
          setNumberPreview(nn.number)
        } catch { /* ignore */ }
        try {
          const st = await window.api.receiptGetSettings()
          if (st?.city) setCity(st.city)
        } catch { /* ignore */ }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh number preview when the year changes (auto-number only)
  useEffect(() => {
    if (editing || numberOverride) return
    (async () => {
      try {
        const y = new Date(receiptDate).getFullYear()
        const nn = await window.api.receiptNextNumber(y)
        setNumberPreview(nn.number)
      } catch { /* ignore */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptDate])

  // Load assureds + policies when the vessel changes
  useEffect(() => {
    if (!vId) { setAssureds([]); setPolicies([]); return }
    (async () => {
      try {
        const as = await window.api.getVesselAssureds(vId)
        setAssureds(Array.isArray(as) ? as : [])
      } catch { setAssureds([]) }
      try {
        const all = await window.api.getPoliciesList()
        const mine = (Array.isArray(all) ? all : []).filter((p: any) => p.vesselId === vId)
          .map((p: any) => ({ id: p.id, policyNumber: p.policyNumber, vesselId: p.vesselId, quotationTypeName: p.quotationTypeName || p.policyTypeName, status: p.status }))
        setPolicies(mine)
      } catch { setPolicies([]) }
    })()
  }, [vId])

  const selectVessel = (v: Vessel) => {
    setVId(v.id)
    setVName(v.name)
    setVesselDropOpen(false)
    setVesselSearch('')
    setSelectedPolicies([])
  }

  const togglePolicy = async (p: PolicyLite) => {
    const exists = selectedPolicies.some(sp => sp.policyDocId === p.id)
    let next: FormPolicy[]
    if (exists) {
      next = selectedPolicies.filter(sp => sp.policyDocId !== p.id)
    } else {
      next = [...selectedPolicies, { policyDocId: p.id, policyNumber: p.policyNumber }]
    }
    setSelectedPolicies(next)
    // Auto-suggest amount from a single converted policy's instalment schedule
    if (!exists && next.length === 1 && !amount) {
      try {
        const inst = await window.api.policyGetInstalments(p.id)
        const num = parseInt(instalmentNumber, 10) || 1
        const row = (Array.isArray(inst) ? inst : []).find((i: any) => Number(i.instalmentNumber) === num) || (Array.isArray(inst) ? inst[num - 1] : null)
        if (row && row.premiumAmount != null) setAmount(String(Number(row.premiumAmount)))
      } catch { /* no schedule */ }
    }
  }

  const amountNum = parseFloat(amount) || 0
  const instNum = instalmentNumber ? (parseInt(instalmentNumber, 10) || null) : null

  // Merge selected policies + any free-typed covers into the working receipt for auto-text
  const workingPolicies = useMemo(() => {
    const list = [...selectedPolicies]
    freeCovers.split(/[,&]/).map(s => s.trim()).filter(Boolean).forEach(pn => {
      if (!list.some(p => p.policyNumber === pn)) list.push({ policyDocId: null, policyNumber: pn })
    })
    return list
  }, [selectedPolicies, freeCovers])

  const autoBeing = useMemo(() => buildBeingText({
    policies: workingPolicies.map(p => ({ policyNumber: p.policyNumber, policyDocId: p.policyDocId })),
    instalmentNumber: instNum, vesselName: vName, coversText: null
  } as any), [workingPolicies, instNum, vName])

  const autoWords = useMemo(() => amountInWords(amountNum, currency), [amountNum, currency])

  const beingValue = beingOverride != null ? beingOverride : autoBeing
  const wordsValue = wordsOverride != null ? wordsOverride : autoWords

  const filteredVessels = useMemo(() => {
    const q = vesselSearch.trim().toLowerCase()
    const sorted = [...vessels].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted.slice(0, 100)
    return sorted.filter(v => v.name.toLowerCase().includes(q) || (v.imoNumber || '').toLowerCase().includes(q)).slice(0, 100)
  }, [vessels, vesselSearch])

  const handleSave = async () => {
    if (!vName.trim()) { showError('Please select or enter a vessel'); return }
    if (!payerName.trim()) { showError('Please enter who the payment is received from'); return }
    if (amountNum <= 0) { showError('Please enter an amount'); return }
    setSaving(true)
    const payload = {
      vesselId: vId,
      vesselName: vName,
      payerName: payerName.trim(),
      payerEntityId,
      amount: amountNum,
      currency,
      instalmentNumber: instNum,
      coversText: workingPolicies.map(p => p.policyNumber).join(' & ') || null,
      beingText: beingValue,
      amountWords: wordsValue,
      city,
      receiptDate,
      receiptNumber: numberOverride ? numberPreview : (editing ? editing.receiptNumber : undefined),
      policies: workingPolicies.map((p, i) => ({ policyDocId: p.policyDocId, policyNumber: p.policyNumber, orderIndex: i }))
    }
    try {
      if (editing) {
        await window.api.receiptUpdate(editing.id, payload as any)
        showSuccess('Receipt updated')
      } else {
        await window.api.receiptCreate(payload as any)
        showSuccess('Receipt created')
      }
      onSaved()
    } catch (e: any) {
      showError(e?.message || 'Failed to save receipt')
    } finally {
      setSaving(false)
    }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }
  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' }

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={{ ...modalWrap, background: modalBg }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ReceiptIcon size={22} /> {editing ? 'Edit Receipt' : 'New Receipt'}
          </h2>
          <button onClick={onClose} style={iconBtn}><X size={20} /></button>
        </div>

        <div style={{ display: 'grid', gap: '16px' }}>
          {/* Number + Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={label}>Receipt Number</label>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input style={{ ...input, fontFamily: 'monospace', opacity: numberOverride ? 1 : 0.7 }} value={numberPreview} disabled={!numberOverride} onChange={e => setNumberPreview(e.target.value)} />
                {!editing && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={numberOverride} onChange={e => setNumberOverride(e.target.checked)} /> edit
                  </label>
                )}
              </div>
            </div>
            <div>
              <label style={label}>Date</label>
              <input type="date" style={input} value={receiptDate} onChange={e => setReceiptDate(e.target.value)} />
            </div>
          </div>

          {/* Vessel */}
          <div style={{ position: 'relative' }}>
            <label style={label}>Vessel (active &amp; inactive)</label>
            {lockedVesselId ? (
              <input style={{ ...input, opacity: 0.8 }} value={vName} disabled />
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <Ship size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  <input
                    style={{ ...input, paddingLeft: '32px' }}
                    placeholder="Search vessel by name or IMO…"
                    value={vesselDropOpen ? vesselSearch : vName}
                    onFocus={() => { setVesselDropOpen(true); setVesselSearch('') }}
                    onChange={e => { setVesselSearch(e.target.value); setVesselDropOpen(true) }}
                    onBlur={() => setTimeout(() => setVesselDropOpen(false), 150)}
                  />
                </div>
                {vesselDropOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: '4px', maxHeight: '240px', overflowY: 'auto', borderRadius: '8px', border: '1px solid var(--input-border)', background: modalBg, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                    {filteredVessels.length === 0 ? (
                      <div style={{ padding: '10px 14px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No vessels found</div>
                    ) : filteredVessels.map(v => (
                      <div key={v.id} onMouseDown={() => selectVessel(v)}
                        style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', gap: '8px', borderBottom: '1px solid var(--glass-border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span>{v.name}{!v.isActive && <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}> (inactive)</span>}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontFamily: 'monospace' }}>{v.imoNumber || ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Amount + currency + instalment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr 1fr', gap: '14px' }}>
            <div>
              <label style={label}>Amount</label>
              <input style={input} type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={label}>Currency</label>
              <select style={input} value={currency} onChange={e => setCurrency(e.target.value)}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Instalment #</label>
              <input style={input} type="number" min={1} value={instalmentNumber} onChange={e => setInstalmentNumber(e.target.value)} placeholder="1" />
            </div>
          </div>

          {/* Policies */}
          <div>
            <label style={label}>Policies covered</label>
            {vId && policies.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                {policies.map(p => {
                  const on = selectedPolicies.some(sp => sp.policyDocId === p.id)
                  return (
                    <button key={p.id} onClick={() => togglePolicy(p)} style={{
                      padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'monospace',
                      border: on ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                      background: on ? 'rgba(0,170,200,0.12)' : 'transparent',
                      color: on ? 'var(--accent-primary)' : 'var(--text-secondary)'
                    }}>
                      {p.policyNumber}{p.quotationTypeName ? ` · ${p.quotationTypeName}` : ''}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                {vId ? 'No issued policies for this vessel — type policy numbers below.' : 'Select a vessel to list its policies.'}
              </div>
            )}
            <input style={{ ...input, fontFamily: 'monospace' }} value={freeCovers} onChange={e => setFreeCovers(e.target.value)} placeholder="Or type policy numbers, separated by & or comma (e.g. H26209901 & P26209902)" />
          </div>

          {/* Payer */}
          <div>
            <label style={label}>Received From</label>
            {assureds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                {assureds.map(a => {
                  const name = entityMap[a.entityId] || ''
                  return (
                    <button key={a.id} onClick={() => { setPayerName(name.toUpperCase()); setPayerEntityId(a.entityId || null) }} style={{
                      padding: '5px 10px', borderRadius: '6px', fontSize: '0.76rem', cursor: 'pointer',
                      border: payerEntityId === a.entityId ? '1.5px solid var(--accent-primary)' : '1px solid var(--input-border)',
                      background: payerEntityId === a.entityId ? 'rgba(0,170,200,0.12)' : 'transparent',
                      color: payerEntityId === a.entityId ? 'var(--accent-primary)' : 'var(--text-secondary)'
                    }}>{name || a.entityId}{a.role ? ` · ${a.role}` : ''}</button>
                  )
                })}
              </div>
            )}
            <input style={input} value={payerName} onChange={e => { setPayerName(e.target.value); setPayerEntityId(null) }} placeholder="Payer name" />
          </div>

          {/* Auto text: The Sum Of / Being */}
          <div>
            <label style={label}>The Sum Of (amount in words)</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <input style={input} value={wordsValue} onChange={e => setWordsOverride(e.target.value)} />
              {wordsOverride != null && <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => setWordsOverride(null)}>Auto</button>}
            </div>
          </div>
          <div>
            <label style={label}>Being</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <textarea style={{ ...input, minHeight: '58px', resize: 'vertical' }} value={beingValue} onChange={e => setBeingOverride(e.target.value)} />
              {beingOverride != null && <button className="btn-secondary" style={{ fontSize: '0.72rem', padding: '6px 10px', whiteSpace: 'nowrap' }} onClick={() => setBeingOverride(null)}>Auto</button>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : (editing ? 'Save Changes' : 'Create Receipt')}</button>
        </div>
      </div>
    </div>
  )
}

// ── Settings modal ───────────────────────────────────────────────────────
function SettingsModal({ modalBg, onClose }: { modalBg: string; onClose: () => void }) {
  const { showError, showSuccess } = useToast()
  const [nextSerial, setNextSerial] = useState('')
  const [city, setCity] = useState('BEIRUT')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const st = await window.api.receiptGetSettings()
        setNextSerial(String(st?.nextSerial ?? 1))
        setCity(st?.city || 'BEIRUT')
      } catch { /* ignore */ }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      await window.api.receiptSetSettings({ nextSerial: parseInt(nextSerial, 10) || 1, city: city || 'BEIRUT' })
      showSuccess('Receipt settings saved')
      onClose()
    } catch (e: any) {
      showError(e?.message || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600 }
  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem' }

  return (
    <div style={overlay} onMouseDown={onClose}>
      <div style={{ ...modalWrap, background: modalBg, maxWidth: '420px' }} onMouseDown={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <h2 style={{ fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '10px' }}><Settings size={20} /> Receipt Settings</h2>
          <button onClick={onClose} style={iconBtn}><X size={20} /></button>
        </div>
        <div style={{ display: 'grid', gap: '16px' }}>
          <div>
            <label style={label}>Next Receipt Number</label>
            <input style={input} type="number" min={1} value={nextSerial} onChange={e => setNextSerial(e.target.value)} />
            <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '6px' }}>The running serial used for the next auto-numbered receipt (H&lt;n&gt;/year). It never resets by year.</p>
          </div>
          <div>
            <label style={label}>City (on receipt date line)</label>
            <input style={input} value={city} onChange={e => setCity(e.target.value)} placeholder="BEIRUT" />
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '22px' }}>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 20px', overflowY: 'auto' }
const modalWrap: React.CSSProperties = { borderRadius: '14px', padding: '24px', width: '100%', maxWidth: '640px', border: '1px solid var(--glass-border)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }
