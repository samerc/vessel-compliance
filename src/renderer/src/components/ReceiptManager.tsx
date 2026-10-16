import { useState, useEffect, useMemo, useCallback } from 'react'
import { Receipt, Vessel, VesselAssured, ReceiptInput } from '../../../shared/types'
import { isIpcError } from '../utils/ipc'
import { useToast } from '../contexts/ToastContext'
import { confirmDialog } from './DialogHost'
import { PageHeader, EmptyState, Modal, Field } from './ui'
import { exportReceiptDocx, ordinal, formatReceiptAmount } from '../services/ReceiptExportService'
import { numberToWords } from '../utils/numberToWords'
import { useAuth } from '../contexts/AuthContext'
import {
  Receipt as ReceiptIcon,
  Plus,
  FileDown,
  Trash2,
  Pencil,
  Search,
  Settings,
  Ship
} from 'lucide-react'
import { formatDate } from '../utils/dateUtils'
import { StrMoneyInput } from './quotation-tabs/shared'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'AED', 'CHF', 'JPY', 'LBP']

interface PolicyLite {
  id: string
  policyNumber: string
  vesselId: string
  typeName?: string | null
  status?: string
  source: 'issued' | 'dynamic'
}

interface ReceiptManagerProps {
  vesselId?: string
  vesselName?: string
  embedded?: boolean
}

interface FormPolicy {
  policyDocId: string | null
  policyNumber: string
  typeName?: string | null
  instalments: number[]
}

// Parse "1 & 2", "1,2", "1 2" → [1, 2] (unique, sorted, positive)
function parseInstalments(value: string): number[] {
  const nums = (value.match(/\d+/g) || []).map((n) => parseInt(n, 10)).filter((n) => n > 0)
  return Array.from(new Set(nums)).sort((a, b) => a - b)
}

// [1] → "1st installment" · [1,2] → "1st & 2nd installments" · [1,2,3] → "1st, 2nd & 3rd installments"
function instalmentPhrase(nums: number[], ord: (n: number) => string): string {
  const list = nums.length ? nums : [1]
  const ords = list.map(ord)
  const joined =
    ords.length === 1 ? ords[0] : `${ords.slice(0, -1).join(', ')} & ${ords[ords.length - 1]}`
  return `${joined} installment${list.length > 1 ? 's' : ''}`
}

export default function ReceiptManager({
  vesselId,
  vesselName,
  embedded = false
}: ReceiptManagerProps): React.JSX.Element {
  const { showError, showSuccess } = useToast()

  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // Deleting receipts / changing receipt settings needs Manage Policies (same gate as the server)
  const { hasPermission } = useAuth()
  const canManage = hasPermission('policies:manage') || hasPermission('admin:settings')
  const [editing, setEditing] = useState<Receipt | null>(null)

  const [reloadKey, setReloadKey] = useState(0)
  const loadReceipts = useCallback((): void => setReloadKey((k) => k + 1), [])

  // Loads on mount, when the vessel changes, and whenever loadReceipts() is called
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      setLoading(true)
      try {
        const data = vesselId
          ? await window.api.receiptListByVessel(vesselId)
          : await window.api.receiptList()
        if (alive) setReceipts(Array.isArray(data) ? data : [])
      } catch (e) {
        if (alive) showError((e instanceof Error && e.message) || 'Failed to load receipts')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [vesselId, showError, reloadKey])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return receipts
    return receipts.filter(
      (r) =>
        r.receiptNumber.toLowerCase().includes(q) ||
        (r.vesselName || '').toLowerCase().includes(q) ||
        (r.payerName || '').toLowerCase().includes(q) ||
        (r.coversText || '').toLowerCase().includes(q)
    )
  }, [receipts, search])

  const handleDelete = async (r: Receipt): Promise<void> => {
    const ok = await confirmDialog(`Delete receipt ${r.receiptNumber}? This cannot be undone.`)
    if (!ok) return
    try {
      const res = await window.api.receiptDelete(r.id)
      if (isIpcError(res)) throw new Error(res.message)
      showSuccess('Receipt deleted')
      loadReceipts()
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Failed to delete receipt')
    }
  }

  const handleExport = async (r: Receipt): Promise<void> => {
    try {
      const full = await window.api.receiptGet(r.id)
      await exportReceiptDocx(full || r)
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Failed to export receipt')
    }
  }

  const openCreate = (): void => {
    setEditing(null)
    setShowModal(true)
  }
  const openEdit = async (r: Receipt): Promise<void> => {
    try {
      const full = await window.api.receiptGet(r.id)
      setEditing(full || r)
      setShowModal(true)
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Failed to load receipt')
    }
  }

  return (
    <div className={embedded ? undefined : 'fade-in page'}>
      {!embedded && (
        <PageHeader
          icon={<ReceiptIcon size={26} />}
          title="Receipts"
          subtitle="Payment receipts issued against vessel policies"
          actions={
            <>
              {canManage && (
                <button className="btn-secondary" onClick={() => setShowSettings(true)}>
                  <Settings size={16} /> Settings
                </button>
              )}
              <button className="btn-primary" onClick={openCreate}>
                <Plus size={16} /> New Receipt
              </button>
            </>
          }
        />
      )}

      {embedded && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px'
          }}
        >
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            {receipts.length} receipt{receipts.length === 1 ? '' : 's'}
          </div>
          <button
            className="btn-primary"
            onClick={openCreate}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} /> New Receipt
          </button>
        </div>
      )}

      <div style={{ position: 'relative', maxWidth: '360px', marginBottom: '16px' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-secondary)'
          }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search number, vessel, payer..."
          style={{
            width: '100%',
            padding: '9px 12px 9px 34px',
            borderRadius: '8px',
            border: '1px solid var(--input-border)',
            background: 'var(--input-bg)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem'
          }}
        />
      </div>

      <div className="table-wrap">
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Date</th>
                {!vesselId && <th>Vessel</th>}
                <th>Received From</th>
                <th>Covers</th>
                <th className="num">Amount</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={vesselId ? 6 : 7}>Loading…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    className="muted"
                    style={{ textAlign: 'center', padding: '40px' }}
                    colSpan={vesselId ? 6 : 7}
                  >
                    <EmptyState
                      compact
                      icon={<ReceiptIcon size={34} />}
                      title={search ? 'No receipts match your search' : 'No receipts yet'}
                      text={
                        search
                          ? undefined
                          : 'Issue a receipt when a premium payment comes in; it can be exported to Word.'
                      }
                      action={
                        search ? (
                          <button className="btn-secondary btn-sm" onClick={() => setSearch('')}>
                            Clear search
                          </button>
                        ) : (
                          <button className="btn-primary btn-sm" onClick={openCreate}>
                            <Plus size={14} /> New Receipt
                          </button>
                        )
                      }
                    />
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {r.receiptNumber}
                    </td>
                    <td>{formatDate(r.receiptDate) || r.receiptDate}</td>
                    {!vesselId && <td>{r.vesselName || '—'}</td>}
                    <td>{r.payerName}</td>
                    <td className="mono" style={{ fontSize: '0.78rem' }}>
                      {r.policies && r.policies.length > 0
                        ? r.policies.map((p) => p.policyNumber).join(' & ')
                        : r.coversText || '—'}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>
                      {formatReceiptAmount(r.amount, r.currency)}
                    </td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button title="Export DOCX" onClick={() => handleExport(r)} style={iconBtn}>
                        <FileDown size={16} />
                      </button>
                      <button title="Edit" onClick={() => openEdit(r)} style={iconBtn}>
                        <Pencil size={16} />
                      </button>
                      {canManage && (
                        <button
                          title="Delete"
                          onClick={() => handleDelete(r)}
                          style={{ ...iconBtn, color: 'var(--danger)' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <ReceiptModal
          editing={editing}
          lockedVesselId={vesselId}
          lockedVesselName={vesselName}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false)
            loadReceipts()
          }}
        />
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  )
}

const iconBtn: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text-secondary)',
  padding: '4px 6px',
  verticalAlign: 'middle'
}

// ── Create / Edit modal ──────────────────────────────────────────────────
function ReceiptModal({
  editing,
  lockedVesselId,
  lockedVesselName,
  onClose,
  onSaved
}: {
  editing: Receipt | null
  lockedVesselId?: string
  lockedVesselName?: string
  onClose: () => void
  onSaved: () => void
}): React.JSX.Element {
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
  const [amount, setAmount] = useState<string>(
    editing?.amount != null ? String(editing.amount) : ''
  )
  const [currency, setCurrency] = useState(editing?.currency ?? 'USD')
  const [selectedPolicies, setSelectedPolicies] = useState<FormPolicy[]>(
    editing?.policies?.map((p) => ({
      policyDocId: p.policyDocId ?? null,
      policyNumber: p.policyNumber,
      instalments: [editing.instalmentNumber || 1]
    })) ?? []
  )
  const [policySearch, setPolicySearch] = useState('')
  const [freeCovers, setFreeCovers] = useState('')
  const [payerMode, setPayerMode] = useState<'select' | 'other'>(
    editing && !editing.payerEntityId ? 'other' : 'select'
  )
  const [receiptDate, setReceiptDate] = useState(editing?.receiptDate || today)
  const [numberPreview, setNumberPreview] = useState(editing?.receiptNumber || '')
  const [numberOverride, setNumberOverride] = useState(!!editing)
  const [beingOverride, setBeingOverride] = useState<string | null>(editing?.beingText ?? null)
  // Saved words that are just the auto wording of the saved amount are NOT an override —
  // otherwise editing the amount would keep printing the old figure in words.
  const [wordsOverride, setWordsOverride] = useState<string | null>(() => {
    const saved = editing?.amountWords ?? null
    if (saved == null || editing?.amount == null) return saved
    return saved.trim() === numberToWords(Number(editing.amount), editing.currency ?? 'USD').trim()
      ? null
      : saved
  })
  const [city, setCity] = useState(editing?.city || 'BEIRUT')

  // Load vessels + next number + settings once
  useEffect(() => {
    ;(async () => {
      try {
        const vs = await window.api.getVessels()
        setVessels(Array.isArray(vs) ? vs : [])
      } catch {
        /* ignore */
      }
      try {
        const ents = await window.api.getEntities()
        const map: Record<string, string> = {}
        for (const e of Array.isArray(ents) ? ents : []) map[e.id] = e.name
        setEntityMap(map)
      } catch {
        /* ignore */
      }
      if (!editing) {
        try {
          const y = new Date(receiptDate).getFullYear()
          const nn = await window.api.receiptNextNumber(y)
          setNumberPreview(nn.number)
        } catch {
          /* ignore */
        }
        try {
          const st = await window.api.receiptGetSettings()
          if (st?.city) setCity(st.city)
        } catch {
          /* ignore */
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Refresh number preview when the year changes (auto-number only)
  useEffect(() => {
    if (editing || numberOverride) return
    ;(async () => {
      try {
        const y = new Date(receiptDate).getFullYear()
        const nn = await window.api.receiptNextNumber(y)
        setNumberPreview(nn.number)
      } catch {
        /* ignore */
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptDate])

  // Load assureds + policies when the vessel changes
  useEffect(() => {
    ;(async () => {
      if (!vId) {
        setAssureds([])
        setPolicies([])
        return
      }
      try {
        const as = await window.api.getVesselAssureds(vId)
        setAssureds(Array.isArray(as) ? as : [])
      } catch {
        setAssureds([])
      }
      const merged: PolicyLite[] = []
      const seen = new Set<string>()
      try {
        const all = await window.api.getPoliciesList()
        for (const p of (Array.isArray(all) ? all : []).filter((p) => p.vesselId === vId)) {
          if (!p.policyNumber) continue
          merged.push({
            id: p.id,
            policyNumber: p.policyNumber,
            vesselId: p.vesselId,
            typeName: p.quotationTypeName || p.policyTypeName,
            status: p.status,
            source: 'issued'
          })
          seen.add(p.policyNumber)
        }
      } catch {
        /* ignore */
      }
      try {
        const dyn = await window.api.getVesselDynamicPolicies(vId)
        for (const p of Array.isArray(dyn) ? dyn : []) {
          if (!p.policyNumber || seen.has(p.policyNumber)) continue
          merged.push({
            id: p.id,
            policyNumber: p.policyNumber,
            vesselId: p.vesselId || vId,
            typeName: p.policyTypeName,
            status: p.status,
            source: 'dynamic'
          })
          seen.add(p.policyNumber)
        }
      } catch {
        /* ignore */
      }
      setPolicies(merged)
      // Backfill type names on already-selected policies (e.g. when editing an existing receipt)
      setSelectedPolicies((prev) =>
        prev.map((sp) => {
          if (sp.typeName) return sp
          const m = merged.find((mp) => mp.policyNumber === sp.policyNumber)
          return m
            ? {
                ...sp,
                typeName: m.typeName,
                policyDocId: sp.policyDocId ?? (m.source === 'issued' ? m.id : null)
              }
            : sp
        })
      )
    })()
  }, [vId])

  const selectVessel = (v: Vessel): void => {
    setVId(v.id)
    setVName(v.name)
    setVesselDropOpen(false)
    setVesselSearch('')
    setSelectedPolicies([])
  }

  const defaultInst = 1

  const setPolicyInstalments = (policyNumber: string, value: string): void => {
    const nums = parseInstalments(value)
    setSelectedPolicies((prev) =>
      prev.map((sp) => (sp.policyNumber === policyNumber ? { ...sp, instalments: nums } : sp))
    )
  }

  const togglePolicy = async (p: PolicyLite): Promise<void> => {
    const exists = selectedPolicies.some(
      (sp) => sp.policyDocId === p.id || sp.policyNumber === p.policyNumber
    )
    let next: FormPolicy[]
    if (exists) {
      next = selectedPolicies.filter(
        (sp) => sp.policyDocId !== p.id && sp.policyNumber !== p.policyNumber
      )
    } else {
      next = [
        ...selectedPolicies,
        {
          policyDocId: p.source === 'issued' ? p.id : null,
          policyNumber: p.policyNumber,
          typeName: p.typeName,
          instalments: [defaultInst]
        }
      ]
    }
    setSelectedPolicies(next)
    // Auto-suggest amount from a single converted (issued) policy's instalment schedule
    if (!exists && next.length === 1 && !amount && p.source === 'issued') {
      try {
        const inst = await window.api.policyGetInstalments(p.id)
        const num = defaultInst
        const row =
          (Array.isArray(inst) ? inst : []).find((i) => Number(i.instalmentNumber) === num) ||
          (Array.isArray(inst) ? inst[num - 1] : null)
        if (row && row.premiumAmount != null) setAmount(String(Number(row.premiumAmount)))
      } catch {
        /* no schedule */
      }
    }
  }

  const amountNum = parseFloat(amount) || 0
  const instNum = selectedPolicies[0]?.instalments?.[0] ?? null

  // Merge selected policies + any free-typed covers into the working receipt for auto-text
  const workingPolicies = useMemo(() => {
    const list = [...selectedPolicies]
    freeCovers
      .split(/[,&]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((pn) => {
        if (!list.some((p) => p.policyNumber === pn))
          list.push({ policyDocId: null, policyNumber: pn, instalments: [defaultInst] })
      })
    return list
  }, [selectedPolicies, freeCovers, defaultInst])

  // Split description: one clause per policy on its own line, joined with a trailing "and".
  const autoBeing = useMemo(() => {
    const clauses = workingPolicies
      .filter((p) => p.policyNumber)
      .map((p) => {
        const typ = p.typeName ? `${p.typeName} ` : ''
        return `${instalmentPhrase(p.instalments, ordinal)} of ${typ}cover ${p.policyNumber}`
      })
    if (clauses.length === 0) return vName ? `Settlement Re: M/V “${vName}”` : 'Settlement'
    // Each policy on its own line; "and" trails every line except the last.
    const lines = clauses.map(
      (c, i) => `${i === 0 ? 'Settlement ' : ''}${c}${i < clauses.length - 1 ? ' and' : ''}`
    )
    let s = lines.join('\n')
    if (vName) s += ` Re: M/V “${vName}”`
    return s
  }, [workingPolicies, vName])

  const autoWords = useMemo(() => numberToWords(amountNum, currency), [amountNum, currency])

  const beingValue = beingOverride != null ? beingOverride : autoBeing
  const wordsValue = wordsOverride != null ? wordsOverride : autoWords

  const filteredVessels = useMemo(() => {
    const q = vesselSearch.trim().toLowerCase()
    const sorted = [...vessels].sort((a, b) => a.name.localeCompare(b.name))
    if (!q) return sorted.slice(0, 100)
    return sorted
      .filter(
        (v) => v.name.toLowerCase().includes(q) || (v.imoNumber || '').toLowerCase().includes(q)
      )
      .slice(0, 100)
  }, [vessels, vesselSearch])

  const handleSave = async (): Promise<void> => {
    if (!vName.trim()) {
      showError('Please select or enter a vessel')
      return
    }
    if (!payerName.trim()) {
      showError('Please enter who the payment is received from')
      return
    }
    if (amountNum <= 0) {
      showError('Please enter an amount')
      return
    }
    setSaving(true)
    const payload: ReceiptInput = {
      vesselId: vId,
      vesselName: vName,
      payerName: payerName.trim(),
      payerEntityId,
      amount: amountNum,
      currency,
      instalmentNumber: instNum,
      coversText: workingPolicies.map((p) => p.policyNumber).join(' & ') || null,
      beingText: beingValue,
      amountWords: wordsValue,
      city,
      receiptDate,
      receiptNumber: numberOverride ? numberPreview : editing ? editing.receiptNumber : undefined,
      policies: workingPolicies.map((p, i) => ({
        policyDocId: p.policyDocId,
        policyNumber: p.policyNumber,
        orderIndex: i
      }))
    }
    try {
      if (editing) {
        await window.api.receiptUpdate(editing.id, payload)
        showSuccess('Receipt updated')
      } else {
        await window.api.receiptCreate(payload)
        showSuccess('Receipt created')
      }
      onSaved()
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Failed to save receipt')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title={editing ? 'Edit Receipt' : 'New Receipt'}
      icon={<ReceiptIcon size={18} />}
      onClose={onClose}
      width={640}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Receipt'}
          </button>
        </>
      }
    >
      <div className="form-grid cols-2">
        <Field label="Receipt number">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              style={{ flex: 1, fontFamily: 'monospace', opacity: numberOverride ? 1 : 0.7 }}
              value={numberPreview}
              disabled={!numberOverride}
              onChange={(e) => setNumberPreview(e.target.value)}
            />
            {!editing && (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap'
                }}
              >
                <input
                  type="checkbox"
                  checked={numberOverride}
                  onChange={(e) => setNumberOverride(e.target.checked)}
                />{' '}
                edit
              </label>
            )}
          </div>
        </Field>
        <Field label="Date">
          <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} />
        </Field>

        {/* Vessel */}
        <Field label="Vessel (active &amp; inactive)" span="all">
          {lockedVesselId ? (
            <input style={{ opacity: 0.8 }} value={vName} disabled />
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Ship
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '10px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-secondary)'
                  }}
                />
                <input
                  style={{ width: '100%', boxSizing: 'border-box', paddingLeft: '32px' }}
                  placeholder="Search vessel by name or IMO…"
                  value={vesselDropOpen ? vesselSearch : vName}
                  onFocus={() => {
                    setVesselDropOpen(true)
                    setVesselSearch('')
                  }}
                  onChange={(e) => {
                    setVesselSearch(e.target.value)
                    setVesselDropOpen(true)
                  }}
                  onBlur={() => setTimeout(() => setVesselDropOpen(false), 150)}
                />
              </div>
              {vesselDropOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    marginTop: '4px',
                    maxHeight: '240px',
                    overflowY: 'auto',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--bg-primary)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                  }}
                >
                  {filteredVessels.length === 0 ? (
                    <div
                      style={{
                        padding: '10px 14px',
                        fontSize: '0.82rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      No vessels found
                    </div>
                  ) : (
                    filteredVessels.map((v) => (
                      <div
                        key={v.id}
                        onMouseDown={() => selectVessel(v)}
                        style={{
                          padding: '8px 14px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: '8px',
                          borderBottom: '1px solid var(--glass-border-color)'
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = 'var(--row-hover)')
                        }
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>
                          {v.name}
                          {!v.isActive && (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>
                              {' '}
                              (inactive)
                            </span>
                          )}
                        </span>
                        <span
                          className="mono"
                          style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}
                        >
                          {v.imoNumber || ''}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </Field>

        {/* Amount + currency */}
        <Field label="Amount">
          <StrMoneyInput value={amount} onChange={(s) => setAmount(s)} placeholder="0.00" />
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        {/* Policies */}
        <Field label="Policies covered" span="all">
          {vId && policies.length > 0 && (
            <input
              value={policySearch}
              onChange={(e) => setPolicySearch(e.target.value)}
              placeholder="Search policies by number or type…"
            />
          )}
          {vId && policies.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {policies
                .filter((p) => {
                  const q = policySearch.trim().toLowerCase()
                  if (!q) return true
                  return (
                    p.policyNumber.toLowerCase().includes(q) ||
                    (p.typeName || '').toLowerCase().includes(q)
                  )
                })
                .map((p) => {
                  const on = selectedPolicies.some((sp) => sp.policyNumber === p.policyNumber)
                  return (
                    <button
                      key={p.id}
                      onClick={() => togglePolicy(p)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        fontFamily: 'monospace',
                        border: on
                          ? '1.5px solid var(--accent-primary)'
                          : '1px solid var(--input-border)',
                        background: on ? 'rgba(var(--accent-primary-rgb), 0.12)' : 'transparent',
                        color: on ? 'var(--accent-primary)' : 'var(--text-secondary)'
                      }}
                    >
                      {p.policyNumber}
                      {p.typeName ? ` · ${p.typeName}` : ''}
                      {p.source === 'dynamic' ? ' ·' : ''}
                    </button>
                  )
                })}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              {vId
                ? 'No policies on file for this vessel — type policy numbers below.'
                : 'Select a vessel to list its policies.'}
            </div>
          )}
          <input
            style={{ fontFamily: 'monospace' }}
            value={freeCovers}
            onChange={(e) => setFreeCovers(e.target.value)}
            placeholder="Or type policy numbers, separated by & or comma (e.g. H26209901 & P26209902)"
          />

          {/* Per-policy instalment (split descriptions) — accepts multiple, e.g. 1 & 2 */}
          {selectedPolicies.length > 0 && (
            <div style={{ marginTop: '4px', display: 'grid', gap: '6px' }}>
              <div className="field-hint">Instalment(s) per policy — description is split</div>
              {selectedPolicies.map((sp) => (
                <div
                  key={sp.policyNumber}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', flex: 1 }}>
                    {sp.policyNumber}
                    {sp.typeName ? ` · ${sp.typeName}` : ''}
                  </span>
                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                    Instalment(s)
                  </span>
                  <input
                    type="text"
                    defaultValue={sp.instalments.join(' & ')}
                    onChange={(e) => setPolicyInstalments(sp.policyNumber, e.target.value)}
                    placeholder="e.g. 1 & 2"
                    title="One or more instalment numbers, e.g. 1 & 2"
                    style={{ width: '110px', padding: '6px 8px' }}
                  />
                </div>
              ))}
            </div>
          )}
        </Field>

        {/* Payer */}
        <Field label="Received from" span="all">
          <select
            value={payerMode === 'other' ? '__other__' : payerEntityId || ''}
            onChange={(e) => {
              const val = e.target.value
              if (val === '__other__') {
                setPayerMode('other')
                setPayerEntityId(null)
                setPayerName('')
              } else {
                setPayerMode('select')
                const a = assureds.find((x) => x.entityId === val)
                const name = a ? entityMap[a.entityId] || '' : ''
                setPayerEntityId(val || null)
                setPayerName(name)
              }
            }}
          >
            <option value="" disabled>
              {assureds.length > 0 ? 'Select payer…' : 'No assureds — choose Other'}
            </option>
            {assureds.map((a) => {
              const name = entityMap[a.entityId] || a.entityId
              return (
                <option key={a.id} value={a.entityId}>
                  {name}
                  {a.role ? ` (${a.role})` : ''}
                </option>
              )
            })}
            <option value="__other__">Other…</option>
          </select>
          {payerMode === 'other' && (
            <input
              value={payerName}
              onChange={(e) => {
                setPayerName(e.target.value)
                setPayerEntityId(null)
              }}
              placeholder="Type payer name"
              autoFocus
            />
          )}
        </Field>

        {/* Auto text: The Sum Of / Being */}
        <Field label="The sum of (amount in words)" span="all">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input
              style={{ flex: 1 }}
              value={wordsValue}
              onChange={(e) => setWordsOverride(e.target.value)}
            />
            {wordsOverride != null && (
              <button
                className="btn-secondary"
                style={{ fontSize: '0.72rem', padding: '6px 10px', whiteSpace: 'nowrap' }}
                onClick={() => setWordsOverride(null)}
              >
                Auto
              </button>
            )}
          </div>
        </Field>
        <Field label="Being" span="all">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <textarea
              style={{ flex: 1, minHeight: '58px', resize: 'vertical' }}
              value={beingValue}
              onChange={(e) => setBeingOverride(e.target.value)}
            />
            {beingOverride != null && (
              <button
                className="btn-secondary"
                style={{ fontSize: '0.72rem', padding: '6px 10px', whiteSpace: 'nowrap' }}
                onClick={() => setBeingOverride(null)}
              >
                Auto
              </button>
            )}
          </div>
        </Field>
      </div>
    </Modal>
  )
}

// ── Settings modal ───────────────────────────────────────────────────────
function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const [nextSerial, setNextSerial] = useState('')
  const [city, setCity] = useState('BEIRUT')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const st = await window.api.receiptGetSettings()
        setNextSerial(String(st?.nextSerial ?? 1))
        setCity(st?.city || 'BEIRUT')
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.api.receiptSetSettings({
        nextSerial: parseInt(nextSerial, 10) || 1,
        city: city || 'BEIRUT'
      })
      showSuccess('Receipt settings saved')
      onClose()
    } catch (e) {
      showError((e instanceof Error && e.message) || 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Receipt Settings"
      icon={<Settings size={18} />}
      onClose={onClose}
      width={420}
      closeOnOverlay={false}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field
          label="Next receipt number"
          span="all"
          hint="The running serial used for the next auto-numbered receipt (H<n>/year). It never resets by year."
        >
          <input
            type="number"
            min={1}
            value={nextSerial}
            onChange={(e) => setNextSerial(e.target.value)}
          />
        </Field>
        <Field label="City (on receipt date line)" span="all">
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="BEIRUT" />
        </Field>
      </div>
    </Modal>
  )
}
