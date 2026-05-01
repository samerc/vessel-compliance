import { useState, useEffect, useCallback } from 'react'
import {
  Plus, Edit3, Trash2, Download, X, ChevronDown, ChevronRight, ArrowUp, ArrowDown,
  Loader2, PenTool, FileText, Check, DollarSign
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateShort } from '../utils/dateUtils'
import RichTextEditor from './RichTextEditor'
import ConfirmationModal from './ConfirmationModal'
import type {
  PolicyEndorsement, EndorsementInstalment,
  EndorsementTemplate
} from '../../../shared/types'
import { ENDORSEMENT_PRESET_SECTIONS } from '../../../shared/types'
import { countDays, calcProRataPremium, distributeInstalments as distributeInstalmentsFn } from '../utils/premiumCalc'

interface EndorsementManagerProps {
  policyDocId: string
  policyNumber: string
  premiumCurrency?: string
  initialAddMode?: boolean
  initialContent?: string
}

interface EditState {
  id: string | null
  effectiveDate: string
  affectsDebitAdvice: boolean
  isProRata: boolean
  annualPremium: string
  premiumAmount: string
  premiumCurrency: string
  commissionPercent: string
  sections: Array<{
    id?: string
    sectionKey: string
    sectionTitle: string
    content: string
    isEnabled: boolean
    isFullWidth: boolean
    orderIndex: number
  }>
  instalments: Array<{
    instalmentNumber: number
    dueDate: string
    premiumAmount: string
    commissionAmount: string
  }>
}

const EMPTY_EDIT: EditState = {
  id: null,
  effectiveDate: new Date().toISOString().slice(0, 10),
  affectsDebitAdvice: false,
  isProRata: false,
  annualPremium: '',
  premiumAmount: '',
  premiumCurrency: 'USD',
  commissionPercent: '',
  sections: ENDORSEMENT_PRESET_SECTIONS.map((s, i) => ({
    sectionKey: s.key,
    sectionTitle: s.title,
    content: '',
    isEnabled: false,
    isFullWidth: false,
    orderIndex: i
  })),
  instalments: []
}

/** Calculate pro-rata premium using shared DST-safe day counting */
function calcProRata(annual: number, effectiveDate: string, inceptionDate: string, expiryDate: string): number {
  const totalPeriod = countDays(inceptionDate, expiryDate)
  const remainPeriod = countDays(effectiveDate, expiryDate)
  if (totalPeriod.days <= 0) return annual
  const result = calcProRataPremium(remainPeriod.days, annual, totalPeriod.days, 1, 0)
  return result.proRataPremium
}

export default function EndorsementManager({
  policyDocId, premiumCurrency, initialAddMode, initialContent
}: EndorsementManagerProps) {
  const { showSuccess, showError } = useToast()
  const { hasPermission } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const canManage = hasPermission('policies:manage')
  const canSign = hasPermission('policies:sign')

  const [endorsements, setEndorsements] = useState<PolicyEndorsement[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [policyData, setPolicyData] = useState<{ inceptionDate: string; expiryDate: string; commissionPercent: number } | null>(null)
  const [policyInstalments, setPolicyInstalments] = useState<Array<{ instalmentNumber: number; dueDate: string }>>([])

  const [editState, setEditState] = useState<EditState>(EMPTY_EDIT)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [templates, setTemplates] = useState<EndorsementTemplate[]>([])
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [showInstalments, setShowInstalments] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; id: string; number: number }>({ show: false, id: '', number: 0 })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [list, tmpls, policy, polInst] = await Promise.all([
        window.api.endorsementList(policyDocId),
        window.api.endorsementGetTemplates(),
        window.api.policyGetById(policyDocId),
        window.api.policyGetInstalments(policyDocId)
      ])
      setEndorsements(Array.isArray(list) ? list : [])
      setTemplates(Array.isArray(tmpls) ? tmpls : [])
      if (policy) {
        setPolicyData({
          inceptionDate: policy.inceptionDate || '',
          expiryDate: policy.expiryDate || '',
          commissionPercent: Number(policy.commissionPercent) || 0
        })
      }
      setPolicyInstalments(Array.isArray(polInst) ? polInst.map((pi: any) => ({
        instalmentNumber: pi.instalmentNumber,
        dueDate: pi.dueDate || ''
      })) : [])
    } catch (err: any) {
      showError('Failed to load endorsements')
    }
    setLoading(false)
  }, [policyDocId])

  useEffect(() => { loadData() }, [loadData])

  // Handle initialAddMode
  useEffect(() => {
    if (initialAddMode && !loading && canManage) {
      handleAdd()
    }
  }, [initialAddMode, loading])

  const handleAdd = async () => {
    try {
      await window.api.endorsementNextNumber(policyDocId)
      const newEdit = {
        ...EMPTY_EDIT,
        premiumCurrency: premiumCurrency || 'USD',
        sections: ENDORSEMENT_PRESET_SECTIONS.map((s, i) => ({
          sectionKey: s.key,
          sectionTitle: s.title,
          content: initialContent || '',
          isEnabled: s.key === 'interest' && !!initialContent,
          isFullWidth: false,
          orderIndex: i
        }))
      }
      setEditState(newEdit)
      setIsEditing(true)
      setExpandedSections(initialContent ? new Set(['interest']) : new Set())
      setShowInstalments(false)
    } catch {
      showError('Failed to get endorsement number')
    }
  }

  const handleEdit = async (endorsement: PolicyEndorsement) => {
    if (endorsement.status === 'exported') {
      showError('Cannot edit an exported endorsement')
      return
    }
    try {
      const [sections, instalments] = await Promise.all([
        window.api.endorsementGetSections(endorsement.id),
        window.api.endorsementGetInstalments(endorsement.id)
      ])
      const sectionArr = Array.isArray(sections) ? sections : []
      // Merge preset sections with saved ones
      const merged = ENDORSEMENT_PRESET_SECTIONS.map((ps, i) => {
        const saved = sectionArr.find(s => s.sectionKey === ps.key)
        return saved ? {
          id: saved.id,
          sectionKey: saved.sectionKey,
          sectionTitle: saved.sectionTitle,
          content: saved.content,
          isEnabled: !!saved.isEnabled,
          isFullWidth: !!saved.isFullWidth,
          orderIndex: saved.orderIndex
        } : {
          sectionKey: ps.key,
          sectionTitle: ps.title,
          content: '',
          isEnabled: false,
          isFullWidth: false,
          orderIndex: i
        }
      })
      // Add custom sections
      const customSections = sectionArr.filter(s => s.sectionKey.startsWith('custom__'))
      for (const cs of customSections) {
        merged.push({
          id: cs.id,
          sectionKey: cs.sectionKey,
          sectionTitle: cs.sectionTitle,
          content: cs.content,
          isEnabled: !!cs.isEnabled,
          isFullWidth: !!cs.isFullWidth,
          orderIndex: cs.orderIndex
        })
      }
      merged.sort((a, b) => a.orderIndex - b.orderIndex)

      const instArr = (Array.isArray(instalments) ? instalments : []) as EndorsementInstalment[]
      setEditState({
        id: endorsement.id,
        effectiveDate: endorsement.effectiveDate?.slice(0, 10) || '',
        affectsDebitAdvice: !!endorsement.affectsDebitAdvice,
        isProRata: !!endorsement.isProRata,
        annualPremium: endorsement.annualPremium != null ? String(endorsement.annualPremium) : '',
        premiumAmount: endorsement.premiumAmount != null ? String(endorsement.premiumAmount) : '',
        premiumCurrency: endorsement.premiumCurrency || premiumCurrency || 'USD',
        commissionPercent: endorsement.commissionPercent != null ? String(endorsement.commissionPercent) : '',
        sections: merged,
        instalments: instArr.map(inst => ({
          instalmentNumber: inst.instalmentNumber,
          dueDate: inst.dueDate?.slice(0, 10) || '',
          premiumAmount: String(inst.premiumAmount),
          commissionAmount: String(inst.commissionAmount)
        }))
      })
      setIsEditing(true)
      setShowInstalments(instArr.length > 0)
      setExpandedSections(new Set(merged.filter(s => s.isEnabled).map(s => s.sectionKey)))
    } catch {
      showError('Failed to load endorsement data')
    }
  }

  const handleSave = async () => {
    if (!editState.effectiveDate) {
      showError('Effective date is required')
      return
    }
    const enabledSections = editState.sections.filter(s => s.isEnabled)
    if (enabledSections.length === 0) {
      showError('At least one section must be enabled')
      return
    }
    setSaving(true)
    try {
      let endorsementId = editState.id
      if (!endorsementId) {
        // Create new
        const nextNum = await window.api.endorsementNextNumber(policyDocId)
        endorsementId = await window.api.endorsementCreate({
          policyDocId,
          endorsementNumber: nextNum,
          effectiveDate: editState.effectiveDate,
          affectsDebitAdvice: editState.affectsDebitAdvice,
          isProRata: editState.isProRata,
          annualPremium: editState.annualPremium ? parseFloat(editState.annualPremium) : null,
          premiumAmount: editState.premiumAmount ? parseFloat(editState.premiumAmount) : null,
          premiumCurrency: editState.premiumCurrency || null,
          commissionPercent: editState.commissionPercent ? parseFloat(editState.commissionPercent) : null
        })
      } else {
        // Update existing
        await window.api.endorsementUpdate(endorsementId, {
          effectiveDate: editState.effectiveDate,
          affectsDebitAdvice: editState.affectsDebitAdvice,
          isProRata: editState.isProRata,
          annualPremium: editState.annualPremium ? parseFloat(editState.annualPremium) : null,
          premiumAmount: editState.premiumAmount ? parseFloat(editState.premiumAmount) : null,
          premiumCurrency: editState.premiumCurrency || null,
          commissionPercent: editState.commissionPercent ? parseFloat(editState.commissionPercent) : null
        })
      }
      // Save sections
      await window.api.endorsementSetSections(endorsementId, editState.sections.map((s, i) => ({
        id: s.id,
        sectionKey: s.sectionKey,
        sectionTitle: s.sectionTitle,
        content: s.content,
        isEnabled: s.isEnabled,
        isFullWidth: s.isFullWidth,
        orderIndex: i
      })))
      // Save instalments
      if (showInstalments && editState.instalments.length > 0) {
        await window.api.endorsementSetInstalments(endorsementId, editState.instalments.map((inst, i) => ({
          instalmentNumber: i + 1,
          dueDate: inst.dueDate,
          premiumAmount: parseFloat(inst.premiumAmount) || 0,
          commissionAmount: parseFloat(inst.commissionAmount) || 0
        })))
      } else {
        await window.api.endorsementSetInstalments(endorsementId, [])
      }
      showSuccess(editState.id ? 'Endorsement updated' : 'Endorsement created')
      setIsEditing(false)
      setEditState(EMPTY_EDIT)
      await loadData()
    } catch (err: any) {
      showError(err?.message || 'Failed to save endorsement')
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      await window.api.endorsementDelete(id)
      showSuccess('Endorsement deleted')
      await loadData()
    } catch {
      showError('Failed to delete endorsement')
    }
  }

  const handleExport = async (endorsement: PolicyEndorsement) => {
    setExporting(endorsement.id)
    try {
      const { exportEndorsementDocx } = await import('../services/PolicyExportService')
      await exportEndorsementDocx(policyDocId, endorsement.id)
      // Mark as exported
      await window.api.endorsementUpdate(endorsement.id, {
        status: 'exported',
        exportedAt: new Date().toISOString()
      })
      showSuccess('Endorsement exported')
      await loadData()
    } catch (err: any) {
      showError(err?.message || 'Export failed')
    }
    setExporting(null)
  }

  const handleExportDA = async (endorsement: PolicyEndorsement) => {
    setExporting(endorsement.id + '_da')
    try {
      const { exportEndorsementDADocx } = await import('../services/PolicyExportService')
      await exportEndorsementDADocx(policyDocId, endorsement.id)
      showSuccess('Debit Advice exported')
    } catch (err: any) {
      showError(err?.message || 'DA export failed')
    }
    setExporting(null)
  }

  const handleExportCA = async (endorsement: PolicyEndorsement) => {
    setExporting(endorsement.id + '_ca')
    try {
      const { exportEndorsementCADocx } = await import('../services/PolicyExportService')
      await exportEndorsementCADocx(policyDocId, endorsement.id)
      showSuccess('Credit Advice exported')
    } catch (err: any) {
      showError(err?.message || 'CA export failed')
    }
    setExporting(null)
  }

  const handleSign = async (endorsement: PolicyEndorsement) => {
    try {
      await window.api.endorsementSign(endorsement.id)
      showSuccess('Endorsement signed')
      await loadData()
    } catch {
      showError('Failed to sign endorsement')
    }
  }

  const toggleSection = (key: string) => {
    setEditState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.sectionKey === key ? { ...s, isEnabled: !s.isEnabled } : s)
    }))
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleFullWidth = (key: string) => {
    setEditState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.sectionKey === key ? { ...s, isFullWidth: !s.isFullWidth } : s)
    }))
  }

  const addCustomSection = () => {
    const id = crypto.randomUUID?.() || Date.now().toString()
    const key = `custom__${id}`
    setEditState(prev => ({
      ...prev,
      sections: [...prev.sections, {
        sectionKey: key,
        sectionTitle: 'Custom Section',
        content: '',
        isEnabled: true,
        isFullWidth: false,
        orderIndex: prev.sections.length
      }]
    }))
    setExpandedSections(prev => new Set([...prev, key]))
  }

  const removeSection = (key: string) => {
    if (!key.startsWith('custom__')) return
    setEditState(prev => ({
      ...prev,
      sections: prev.sections.filter(s => s.sectionKey !== key)
    }))
  }

  const moveSection = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= editState.sections.length) return
    setEditState(prev => {
      const arr = [...prev.sections]
      ;[arr[idx], arr[target]] = [arr[target], arr[idx]]
      return { ...prev, sections: arr.map((s, i) => ({ ...s, orderIndex: i })) }
    })
  }

  const updateSectionContent = (key: string, content: string) => {
    setEditState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.sectionKey === key ? { ...s, content } : s)
    }))
  }

  const updateSectionTitle = (key: string, title: string) => {
    setEditState(prev => ({
      ...prev,
      sections: prev.sections.map(s => s.sectionKey === key ? { ...s, sectionTitle: title } : s)
    }))
  }

  const applyTemplate = (sectionKey: string, template: EndorsementTemplate) => {
    updateSectionContent(sectionKey, template.content)
  }

  const addInstalment = () => {
    setEditState(prev => ({
      ...prev,
      instalments: [...prev.instalments, {
        instalmentNumber: prev.instalments.length + 1,
        dueDate: '',
        premiumAmount: '',
        commissionAmount: ''
      }]
    }))
  }

  const prefillInstalments = () => {
    if (policyInstalments.length === 0) {
      showError('No policy instalments found')
      return
    }
    setEditState(prev => {
      const premAmt = parseFloat(prev.premiumAmount) || 0
      const commPct = parseFloat(prev.commissionPercent) || policyData?.commissionPercent || 0

      if (prev.isProRata && premAmt > 0 && parseFloat(prev.annualPremium) > 0) {
        // Pro-rata: distribute using bottom-fill algorithm
        const distributed = distributeInstalmentsFn(premAmt, parseFloat(prev.annualPremium), policyInstalments, commPct)
        return { ...prev, instalments: distributed.map(d => ({ ...d, premiumAmount: String(d.premiumAmount), commissionAmount: String(d.commissionAmount) })) }
      } else if (premAmt > 0) {
        // Non pro-rata: divide premium equally across all policy instalments
        const perInst = Math.round(premAmt / policyInstalments.length * 100) / 100
        const firstAdj = Math.round((premAmt - perInst * (policyInstalments.length - 1)) * 100) / 100
        return {
          ...prev,
          instalments: policyInstalments.map((pi, i) => {
            const prem = i === 0 ? firstAdj : perInst
            const comm = Math.round(prem * commPct / 100 * 100) / 100
            return {
              instalmentNumber: i + 1,
              dueDate: pi.dueDate?.slice(0, 10) || '',
              premiumAmount: String(prem),
              commissionAmount: String(comm)
            }
          })
        }
      } else {
        // No premium — just bring dates
        return {
          ...prev,
          instalments: policyInstalments.map((pi, i) => ({
            instalmentNumber: i + 1,
            dueDate: pi.dueDate?.slice(0, 10) || '',
            premiumAmount: '',
            commissionAmount: ''
          }))
        }
      }
    })
    setShowInstalments(true)
  }

  const removeInstalment = (idx: number) => {
    setEditState(prev => ({
      ...prev,
      instalments: prev.instalments.filter((_, i) => i !== idx).map((inst, i) => ({ ...inst, instalmentNumber: i + 1 }))
    }))
  }

  // --- Styles ---
  const chipStyle = (active: boolean) => ({
    padding: '4px 12px',
    borderRadius: '14px',
    fontSize: '0.75rem',
    fontWeight: 600 as const,
    cursor: 'pointer' as const,
    border: active ? '1.5px solid var(--accent-primary)' : '1.5px solid var(--glass-border)',
    background: active ? 'rgba(0,170,200,0.1)' : 'transparent',
    color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
    transition: 'all 0.15s'
  })

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    fontSize: '0.85rem',
    borderRadius: '6px',
    border: '1px solid var(--input-border)',
    background: 'transparent',
    color: 'var(--text-primary)',
    fontFamily: 'inherit'
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.3px',
    marginBottom: '3px',
    display: 'block'
  }

  const statusBadge = (status: string, signed: boolean) => {
    const s = signed ? 'signed' : status
    const colors: Record<string, { bg: string; color: string }> = {
      draft: { bg: 'rgba(150,150,150,0.15)', color: 'var(--text-secondary)' },
      exported: { bg: 'rgba(0,170,200,0.15)', color: '#00aac8' },
      signed: { bg: 'rgba(76,175,80,0.15)', color: '#4caf50' }
    }
    const c = colors[s] || colors.draft
    return (
      <span style={{
        padding: '2px 8px', borderRadius: '10px', fontSize: '0.68rem', fontWeight: 700,
        background: c.bg, color: c.color, textTransform: 'uppercase'
      }}>{s}</span>
    )
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
        <Loader2 size={20} className="spin" style={{ marginRight: '8px' }} /> Loading endorsements...
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
            {endorsements.length} Endorsement{endorsements.length !== 1 ? 's' : ''}
          </span>
        </div>
        {canManage && !isEditing && (
          <button onClick={handleAdd} style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
            background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer'
          }}>
            <Plus size={14} /> Add Endorsement
          </button>
        )}
      </div>

      {/* Editor */}
      {isEditing && (
        <div style={{
          background: isLight ? '#f8f9fc' : '#161829',
          border: '1px solid var(--glass-border)',
          borderRadius: '10px',
          padding: '20px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
              {editState.id ? 'Edit Endorsement' : 'New Endorsement'}
            </h4>
            <button onClick={() => { setIsEditing(false); setEditState(EMPTY_EDIT) }}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
              <X size={16} />
            </button>
          </div>

          {/* Top fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Effective Date</label>
              <input type="date" value={editState.effectiveDate}
                onChange={e => {
                  const newDate = e.target.value
                  setEditState(prev => {
                    const updated = { ...prev, effectiveDate: newDate }
                    // Recalculate pro-rata if enabled
                    if (prev.isProRata && prev.annualPremium && policyData) {
                      const proRata = calcProRata(parseFloat(prev.annualPremium), newDate, policyData.inceptionDate, policyData.expiryDate)
                      updated.premiumAmount = String(proRata)
                    }
                    return updated
                  })
                }}
                style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>
                {editState.isProRata ? 'Annual Premium (p.a.)' : 'Premium Amount'}
              </label>
              {editState.isProRata ? (
                <input type="number" value={editState.annualPremium} placeholder="0.00"
                  onChange={e => {
                    const annual = e.target.value
                    setEditState(prev => {
                      const updated = { ...prev, annualPremium: annual }
                      if (annual && policyData) {
                        const proRata = calcProRata(parseFloat(annual), prev.effectiveDate, policyData.inceptionDate, policyData.expiryDate)
                        updated.premiumAmount = String(proRata)
                      }
                      return updated
                    })
                  }}
                  style={inputStyle} />
              ) : (
                <input type="number" value={editState.premiumAmount} placeholder="0.00"
                  onChange={e => setEditState(prev => ({ ...prev, premiumAmount: e.target.value }))}
                  style={inputStyle} />
              )}
            </div>
            <div>
              <label style={labelStyle}>Currency</label>
              <input value={editState.premiumCurrency}
                onChange={e => setEditState(prev => ({ ...prev, premiumCurrency: e.target.value }))}
                style={inputStyle} />
            </div>
          </div>

          {editState.isProRata && editState.premiumAmount && (
            <div style={{ marginBottom: '12px', fontSize: '0.82rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Pro-rata premium: {editState.premiumCurrency} {parseFloat(editState.premiumAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div>
              <label style={labelStyle}>Commission %</label>
              <input type="number" value={editState.commissionPercent} placeholder="0"
                onChange={e => setEditState(prev => ({ ...prev, commissionPercent: e.target.value }))}
                style={inputStyle} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', paddingBottom: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={editState.isProRata}
                  onChange={e => {
                    const checked = e.target.checked
                    setEditState(prev => {
                      const updated = { ...prev, isProRata: checked }
                      if (checked && prev.premiumAmount && !prev.annualPremium) {
                        // If switching to pro-rata with an existing premium, treat it as annual
                        updated.annualPremium = prev.premiumAmount
                        if (policyData) {
                          const proRata = calcProRata(parseFloat(prev.premiumAmount), prev.effectiveDate, policyData.inceptionDate, policyData.expiryDate)
                          updated.premiumAmount = String(proRata)
                        }
                      } else if (!checked) {
                        updated.annualPremium = ''
                      }
                      return updated
                    })
                  }} />
                Pro-rata
              </label>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', paddingBottom: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={editState.affectsDebitAdvice}
                  onChange={e => setEditState(prev => ({ ...prev, affectsDebitAdvice: e.target.checked }))} />
                Affects Debit Advice
              </label>
            </div>
          </div>

          {/* Section toggles */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Sections</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              {editState.sections.map(s => (
                <span key={s.sectionKey} onClick={() => toggleSection(s.sectionKey)} style={chipStyle(s.isEnabled)}>
                  {s.sectionTitle}
                </span>
              ))}
              <span onClick={addCustomSection} style={{
                ...chipStyle(false),
                borderStyle: 'dashed'
              }}>
                <Plus size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />Custom
              </span>
            </div>
          </div>

          {/* Section editors */}
          {editState.sections.filter(s => s.isEnabled).map((s) => {
            const isCustom = s.sectionKey.startsWith('custom__')
            const expanded = expandedSections.has(s.sectionKey)
            const sectionTemplates = templates.filter(t => t.sectionKey === s.sectionKey || t.sectionKey === 'general')
            return (
              <div key={s.sectionKey} style={{
                border: '1px solid var(--glass-border)',
                borderRadius: '8px',
                marginBottom: '8px',
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 12px',
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                  cursor: 'pointer'
                }} onClick={() => setExpandedSections(prev => {
                  const next = new Set(prev)
                  if (next.has(s.sectionKey)) next.delete(s.sectionKey)
                  else next.add(s.sectionKey)
                  return next
                })}>
                  {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {isCustom ? (
                    <input value={s.sectionTitle}
                      onChange={e => updateSectionTitle(s.sectionKey, e.target.value)}
                      onClick={e => e.stopPropagation()}
                      style={{ ...inputStyle, width: '200px', padding: '2px 8px', fontSize: '0.82rem', fontWeight: 600 }}
                      placeholder="Section title" />
                  ) : (
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{s.sectionTitle}</span>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <button onClick={e => { e.stopPropagation(); toggleFullWidth(s.sectionKey) }}
                      title={s.isFullWidth ? 'Two columns (title + content)' : 'Full width (no title column)'}
                      style={{
                        background: 'transparent', border: `1px solid ${s.isFullWidth ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                        borderRadius: '4px', cursor: 'pointer', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 600,
                        color: s.isFullWidth ? 'var(--accent-primary)' : 'var(--text-secondary)'
                      }}>
                      {s.isFullWidth ? 'FULL' : '2-COL'}
                    </button>
                    <button onClick={e => { e.stopPropagation(); moveSection(editState.sections.indexOf(s), -1) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}>
                      <ArrowUp size={13} />
                    </button>
                    <button onClick={e => { e.stopPropagation(); moveSection(editState.sections.indexOf(s), 1) }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}>
                      <ArrowDown size={13} />
                    </button>
                    {isCustom && (
                      <button onClick={e => { e.stopPropagation(); removeSection(s.sectionKey) }}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <div style={{ padding: '12px' }}>
                    {sectionTemplates.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <select style={{ ...inputStyle, width: 'auto', fontSize: '0.75rem' }}
                          value=""
                          onChange={e => {
                            const tmpl = templates.find(t => t.id === e.target.value)
                            if (tmpl) applyTemplate(s.sectionKey, tmpl)
                          }}>
                          <option value="">Apply template...</option>
                          {sectionTemplates.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <RichTextEditor
                      value={s.content}
                      onChange={val => updateSectionContent(s.sectionKey, val)}
                      minHeight={100}
                    />
                  </div>
                )}
              </div>
            )
          })}

          {/* Instalments */}
          <div style={{ marginTop: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <label style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}
                onClick={() => setShowInstalments(!showInstalments)}>
                {showInstalments ? <ChevronDown size={12} style={{ verticalAlign: 'middle' }} /> : <ChevronRight size={12} style={{ verticalAlign: 'middle' }} />}
                {' '}Instalments
              </label>
              {!showInstalments && (
                <button onClick={prefillInstalments} style={{
                  fontSize: '0.7rem', padding: '2px 8px', borderRadius: '6px',
                  border: '1px solid var(--glass-border)', background: 'transparent',
                  color: 'var(--text-secondary)', cursor: 'pointer'
                }}>Pre-fill from policy</button>
              )}
            </div>
            {showInstalments && (
              <div>
                {editState.instalments.map((inst, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 30px', gap: '8px', marginBottom: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textAlign: 'center' }}>#{i + 1}</span>
                    <input type="date" value={inst.dueDate}
                      onChange={e => setEditState(prev => ({
                        ...prev,
                        instalments: prev.instalments.map((x, j) => j === i ? { ...x, dueDate: e.target.value } : x)
                      }))} style={{ ...inputStyle, fontSize: '0.78rem' }} />
                    <input type="number" value={inst.premiumAmount} placeholder="Premium"
                      onChange={e => setEditState(prev => ({
                        ...prev,
                        instalments: prev.instalments.map((x, j) => j === i ? { ...x, premiumAmount: e.target.value } : x)
                      }))} style={{ ...inputStyle, fontSize: '0.78rem' }} />
                    <input type="number" value={inst.commissionAmount} placeholder="Commission"
                      onChange={e => setEditState(prev => ({
                        ...prev,
                        instalments: prev.instalments.map((x, j) => j === i ? { ...x, commissionAmount: e.target.value } : x)
                      }))} style={{ ...inputStyle, fontSize: '0.78rem' }} />
                    <button onClick={() => removeInstalment(i)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={addInstalment} style={{
                    fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px',
                    border: '1px solid var(--glass-border)', background: 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer'
                  }}>
                    <Plus size={12} style={{ verticalAlign: 'middle' }} /> Add
                  </button>
                  <button onClick={prefillInstalments} style={{
                    fontSize: '0.75rem', padding: '4px 10px', borderRadius: '6px',
                    border: '1px solid var(--glass-border)', background: 'transparent',
                    color: 'var(--text-secondary)', cursor: 'pointer'
                  }}>Pre-fill from policy</button>
                </div>
              </div>
            )}
          </div>

          {/* Save / Cancel */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
            <button onClick={() => { setIsEditing(false); setEditState(EMPTY_EDIT) }}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '0.82rem',
                border: '1px solid var(--glass-border)', background: 'transparent',
                color: 'var(--text-primary)', cursor: 'pointer'
              }}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600,
                background: 'var(--accent-primary)', color: '#fff', border: 'none', cursor: 'pointer',
                opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px'
              }}>
              {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
              {editState.id ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Endorsement list */}
      {endorsements.length === 0 && !isEditing ? (
        <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          No endorsements yet
        </div>
      ) : (
        <div>
          {endorsements.map(end => (
            <div key={end.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px',
              borderBottom: '1px solid var(--glass-border)',
              fontSize: '0.85rem'
            }}>
              <span style={{ fontWeight: 700, minWidth: '50px', color: 'var(--text-primary)' }}>
                No. {end.endorsementNumber}
              </span>
              {end.isCancellation && (
                <span style={{
                  fontSize: '0.65rem', padding: '1px 6px', borderRadius: '8px', fontWeight: 700,
                  background: 'rgba(255,77,77,0.15)', color: 'var(--danger)', textTransform: 'uppercase'
                }}>Cancellation</span>
              )}
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                {end.effectiveDate ? formatDateShort(end.effectiveDate) : '—'}
              </span>
              {end.premiumAmount != null && Number(end.premiumAmount) !== 0 && (
                <span style={{
                  fontSize: '0.75rem', padding: '2px 8px', borderRadius: '8px',
                  background: Number(end.premiumAmount) > 0 ? 'rgba(0,170,200,0.1)' : 'rgba(255,77,77,0.1)',
                  color: Number(end.premiumAmount) > 0 ? '#00aac8' : 'var(--danger)'
                }}>
                  {end.premiumCurrency || 'USD'} {Number(end.premiumAmount).toLocaleString()}
                </span>
              )}
              {statusBadge(end.status, !!end.signedBy)}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                {canManage && end.status === 'draft' && !end.isCancellation && (
                  <button onClick={() => handleEdit(end)} title="Edit"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                    <Edit3 size={14} />
                  </button>
                )}
                <button onClick={() => handleExport(end)} title="Export DOCX" disabled={exporting === end.id}
                  style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }}>
                  {exporting === end.id ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
                </button>
                {end.premiumAmount != null && Number(end.premiumAmount) !== 0 && (
                  <>
                    <button onClick={() => handleExportDA(end)} title="Export DA" disabled={exporting === end.id + '_da'}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ffb020', padding: '4px' }}>
                      {exporting === end.id + '_da' ? <Loader2 size={14} className="spin" /> : <DollarSign size={14} />}
                    </button>
                    {end.commissionPercent != null && Number(end.commissionPercent) > 0 && (
                      <button onClick={() => handleExportCA(end)} title="Export CA" disabled={exporting === end.id + '_ca'}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6464ff', padding: '4px' }}>
                        {exporting === end.id + '_ca' ? <Loader2 size={14} className="spin" /> : <FileText size={14} />}
                      </button>
                    )}
                  </>
                )}
                {canSign && !end.signedBy && (
                  <button onClick={() => handleSign(end)} title="Sign"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#4caf50', padding: '4px' }}>
                    <PenTool size={14} />
                  </button>
                )}
                {canManage && end.status === 'draft' && !end.isCancellation && (
                  <button onClick={() => setDeleteConfirm({ show: true, id: end.id, number: end.endorsementNumber })} title="Delete"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteConfirm.show && (
        <ConfirmationModal
          title="Delete Endorsement"
          message={`Delete Endorsement No. ${deleteConfirm.number}? This cannot be undone.`}
          confirmLabel="Delete"
          isDangerous
          onConfirm={() => { handleDelete(deleteConfirm.id); setDeleteConfirm({ show: false, id: '', number: 0 }) }}
          onCancel={() => setDeleteConfirm({ show: false, id: '', number: 0 })}
        />
      )}
    </div>
  )
}
