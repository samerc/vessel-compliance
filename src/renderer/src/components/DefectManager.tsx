import { useState, useEffect, useRef, useMemo } from 'react'
import { Trash2, Plus, X, CheckCircle, AlertCircle, Edit, Save, FileText, Download, ChevronDown, ChevronUp, RotateCcw, Clock, Search, CheckSquare } from 'lucide-react'
import XLSX from 'xlsx-js-style'
import { SurveyDefect, ConditionSurvey, Vessel } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDate } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'
import { ReportService } from '../services/ReportService'

interface DefectManagerProps {
  survey: ConditionSurvey
  vessel: Vessel
  onUpdate: () => void
  refreshKey?: number
}

const severityColors: Record<string, string> = {
  Critical: '#ef5350',
  Major: '#ffa726',
  Minor: '#ffd54f',
  Observation: '#90a4ae'
}

export default function DefectManager({ survey, vessel, onUpdate, refreshKey }: DefectManagerProps) {
  const { user, hasPermission } = useAuth()
  const canManageDefects = hasPermission('surveys:defects')
  const [defects, setDefects] = useState<SurveyDefect[]>([])
  const [sortField, setSortField] = useState<'defectNumber' | 'createdAt'>('defectNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [showAddForm, setShowAddForm] = useState(false)
  const [closeModalDefect, setCloseModalDefect] = useState<SurveyDefect | null>(null)
  const [closureNotes, setClosureNotes] = useState('')
  const [editingDefectId, setEditingDefectId] = useState<string | null>(null)
  const [expandedDefectIds, setExpandedDefectIds] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkClosing, setBulkClosing] = useState(false)
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'

  // Confirmation modal state
  const [confirmation, setConfirmation] = useState<{
    show: boolean
    title: string
    message: string
    onConfirm: () => void
    isDangerous?: boolean
  }>({ show: false, title: '', message: '', onConfirm: () => { } })

  // New defect form
  const [newNumber, setNewNumber] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSeverity, setNewSeverity] = useState<'Critical' | 'Major' | 'Minor' | 'Observation' | ''>('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // Edit defect form
  const [editNumber, setEditNumber] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSeverity, setEditSeverity] = useState<'Critical' | 'Major' | 'Minor' | 'Observation' | ''>('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    loadDefects()
  }, [survey.id])

  const sortDefects = (data: SurveyDefect[]): SurveyDefect[] => {
    const sorter = (a: SurveyDefect, b: SurveyDefect) => {
      if (sortField === 'defectNumber') {
        const numA = parseInt(a.defectNumber) || 0
        const numB = parseInt(b.defectNumber) || 0
        return sortOrder === 'asc' ? numA - numB : numB - numA
      } else {
        const dateA = new Date(a.createdAt || 0).getTime()
        const dateB = new Date(b.createdAt || 0).getTime()
        return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
      }
    }
    // Partition: open defects first, closed at bottom, sorted within each group
    const open = data.filter(d => d.status === 'OPEN').sort(sorter)
    const closed = data.filter(d => d.status !== 'OPEN').sort(sorter)
    return [...open, ...closed]
  }

  const loadDefects = async () => {
    const data = await window.api.getSurveyDefects(survey.id)
    setDefects(sortDefects(data))
  }

  useEffect(() => {
    loadDefects()
  }, [sortField, sortOrder, survey.id, refreshKey])

  const handleAddDefect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDescription.trim()) return

    // Auto-generate sequential number if not provided
    let defectNumber = newNumber.trim()
    if (!defectNumber) {
      const maxNumber = defects.reduce((max, d) => {
        const num = parseInt(d.defectNumber)
        return isNaN(num) ? max : Math.max(max, num)
      }, 0)
      defectNumber = String(maxNumber + 1)
    }

    await window.api.addSurveyDefect({
      surveyId: survey.id,
      defectNumber,
      description: newDescription,
      severity: newSeverity ? (newSeverity as 'Critical' | 'Major' | 'Minor' | 'Observation') : undefined,
      status: 'OPEN',
      dueDate: newDueDate || undefined,
      notes: newNotes || undefined
    })

    setNewNumber('')
    setNewDescription('')
    setNewSeverity('')
    setNewDueDate('')
    setNewNotes('')
    setShowAddForm(false)
    loadDefects()
    onUpdate()
  }

  const handleEditDefect = (defect: SurveyDefect) => {
    setEditingDefectId(defect.id)
    setEditNumber(defect.defectNumber)
    setEditDescription(defect.description)
    setEditSeverity(defect.severity || '')
    setEditDueDate(defect.dueDate || '')
    setEditNotes(defect.notes || '')
  }

  const handleSaveEdit = async (defectId: string) => {
    if (!editDescription.trim() || !editNumber.trim()) return

    await window.api.updateSurveyDefect(defectId, {
      defectNumber: editNumber,
      description: editDescription,
      severity: editSeverity ? (editSeverity as 'Critical' | 'Major' | 'Minor' | 'Observation') : undefined,
      dueDate: editDueDate || null,
      notes: editNotes || undefined
    })

    setEditingDefectId(null)
    loadDefects()
    onUpdate()
  }

  const handleCancelEdit = () => {
    setEditingDefectId(null)
  }

  const handleCloseDefect = async () => {
    if (!closeModalDefect) return
    await window.api.closeDefect(closeModalDefect.id, user?.username || 'Unknown', closureNotes || undefined)
    setCloseModalDefect(null)
    setClosureNotes('')
    loadDefects()
    onUpdate()
  }

  const [reopenModalDefect, setReopenModalDefect] = useState<SurveyDefect | null>(null)
  const [reopenReason, setReopenReason] = useState('')

  const handleReopenDefect = (defect: SurveyDefect) => {
    setReopenModalDefect(defect)
    setReopenReason('')
  }

  const handleConfirmReopen = async () => {
    if (!reopenModalDefect) return
    await window.api.reopenDefect(reopenModalDefect.id, reopenReason || undefined)
    setReopenModalDefect(null)
    setReopenReason('')
    loadDefects()
    onUpdate()
  }

  const handleBulkClose = async () => {
    setBulkClosing(true)
    try {
      for (const id of selectedIds) {
        const d = defects.find(dd => dd.id === id)
        if (d && d.status === 'OPEN') {
          await window.api.closeDefect(id, user?.username || 'Unknown')
        }
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      loadDefects()
      onUpdate()
    } finally { setBulkClosing(false) }
  }

  const toggleSelectAll = () => {
    const openFiltered = filteredDefects.filter(d => d.status === 'OPEN')
    if (openFiltered.every(d => selectedIds.has(d.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(openFiltered.map(d => d.id)))
    }
  }

  const handleDeleteDefect = (defect: SurveyDefect) => {
    setConfirmation({
      show: true,
      title: 'Delete Defect',
      message: `Delete defect #${defect.defectNumber}? This cannot be undone.`,
      isDangerous: true,
      onConfirm: async () => {
        setConfirmation(prev => ({ ...prev, show: false }))
        await window.api.deleteSurveyDefect(defect.id)
        loadDefects()
        onUpdate()
      }
    })
  }

  const toggleExpanded = (defectId: string) => {
    setExpandedDefectIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(defectId)) {
        newSet.delete(defectId)
      } else {
        newSet.add(defectId)
      }
      return newSet
    })
  }

  const isOverdue = (defect: SurveyDefect) => {
    if (defect.status !== 'OPEN' || !defect.dueDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(defect.dueDate)
    due.setHours(0, 0, 0, 0)
    return due < today
  }

  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfNoteIds, setPdfNoteIds] = useState<Set<string>>(new Set())

  const exportToPDF = () => {
    const defectsWithNotes = defects.filter(d => d.notes || d.closureNotes)
    if (defectsWithNotes.length === 0) {
      ReportService.exportSurveyToPDF(vessel, survey, defects)
    } else {
      setPdfNoteIds(new Set(defectsWithNotes.map(d => d.id)))
      setShowPdfModal(true)
    }
  }

  const handlePdfExport = () => {
    setShowPdfModal(false)
    ReportService.exportSurveyToPDF(vessel, survey, defects, pdfNoteIds)
  }

  const togglePdfNoteId = (id: string) => {
    setPdfNoteIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exportToExcel = () => {
    const rows = defects.map(d => ({
      '#': d.defectNumber,
      'Description': d.description,
      'Severity': d.severity || 'Not Set',
      'Status': d.status,
      'Due Date': d.dueDate || '',
      'Closed By': d.closedBy || '',
      'Closed At': d.closedAt ? formatDate(d.closedAt) : '',
      'Notes': d.notes || ''
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Defects')
    XLSX.writeFile(wb, `Defects_${vessel.name}_${survey.surveyDate}.xlsx`)
  }

  // Computed stats
  const openCount = defects.filter(d => d.status === 'OPEN').length
  const closedCount = defects.filter(d => d.status !== 'OPEN').length
  const overdueCount = defects.filter(d => isOverdue(d)).length

  // Filtered defects (status + search)
  const filteredDefects = useMemo(() => {
    let filtered = defects
    if (statusFilter === 'open') filtered = filtered.filter(d => d.status === 'OPEN')
    else if (statusFilter === 'closed') filtered = filtered.filter(d => d.status !== 'OPEN')
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(d =>
        d.defectNumber.toLowerCase().includes(q) ||
        d.description.toLowerCase().includes(q) ||
        (d.notes || '').toLowerCase().includes(q) ||
        (d.closureNotes || '').toLowerCase().includes(q)
      )
    }
    return filtered
  }, [defects, statusFilter, searchQuery])

  const formatDueDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: 'var(--glass-border)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Defects</h4>
          <select
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-') as [any, any]
              setSortField(field)
              setSortOrder(order)
            }}
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--input-border)',
              background: 'var(--input-bg)',
              color: 'var(--text-primary)'
            }}
          >
            <option value="defectNumber-asc">Number (Asc)</option>
            <option value="defectNumber-desc">Number (Desc)</option>
            <option value="createdAt-desc">Newest First</option>
            <option value="createdAt-asc">Oldest First</option>
          </select>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {defects.length > 0 && (
            <>
              <button
                onClick={exportToPDF}
                className="btn-secondary"
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Export survey report to PDF"
              >
                <FileText size={16} />
                Export PDF
              </button>
              <button
                onClick={exportToExcel}
                className="btn-secondary"
                style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                title="Export defects to Excel"
              >
                <Download size={16} />
                Export Excel
              </button>
              {canManageDefects && (
                <button
                  onClick={() => { setSelectMode(!selectMode); setSelectedIds(new Set()) }}
                  className={selectMode ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <CheckSquare size={16} /> {selectMode ? 'Cancel' : 'Select'}
                </button>
              )}
            </>
          )}
          {canManageDefects && (
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={showAddForm ? 'btn-secondary' : 'btn-primary'}
              style={{
                padding: '8px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {showAddForm ? <X size={16} /> : <Plus size={16} />}
              {showAddForm ? 'Cancel' : 'Add Defect'}
            </button>
          )}
        </div>
      </div>

      {/* Stats Strip */}
      {defects.length > 0 && (
        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <StatBadge label="Total" value={defects.length} />
          <StatBadge label="Open" value={openCount} color={openCount > 0 ? 'var(--danger)' : undefined} />
          <StatBadge label="Closed" value={closedCount} color={closedCount > 0 ? (isLight ? '#008c46' : '#00ff88') : undefined} />
          <StatBadge
            label="Overdue"
            value={overdueCount}
            color={overdueCount > 0 ? '#ffa726' : undefined}
            alert={overdueCount > 0}
          />
        </div>
      )}

      {/* Quick Filter */}
      {defects.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {(['all', 'open', 'closed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{
                padding: '5px 14px',
                borderRadius: '6px',
                border: statusFilter === f
                  ? '1px solid var(--accent-primary)'
                  : '1px solid var(--input-border)',
                background: statusFilter === f
                  ? (isLight ? 'rgba(26, 115, 232, 0.1)' : 'rgba(0, 210, 255, 0.1)')
                  : 'transparent',
                color: statusFilter === f ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: statusFilter === f ? '600' : '500',
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'all 0.15s'
              }}
            >
              {f}
            </button>
          ))}
          <div style={{ position: 'relative', marginLeft: '8px' }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search defects..."
              style={{ paddingLeft: '28px', width: '180px', fontSize: '0.78rem', padding: '5px 10px 5px 28px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', padding: '10px 14px', borderRadius: '8px', background: isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)', border: '1px solid rgba(0,210,255,0.2)', alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-primary)' }}>{selectedIds.size} selected</span>
          <button onClick={toggleSelectAll} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }}>
            {filteredDefects.filter(d => d.status === 'OPEN').every(d => selectedIds.has(d.id)) ? 'Deselect All' : 'Select All Open'}
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={handleBulkClose} disabled={bulkClosing} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <CheckCircle size={14} /> Close Selected
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setSelectMode(false) }} className="btn-secondary" style={{ padding: '6px 10px', fontSize: '0.78rem' }}>Clear</button>
        </div>
      )}

      {/* Add Defect Form */}
      {showAddForm && (
        <form onSubmit={handleAddDefect} style={{
          marginBottom: '20px',
          padding: '16px',
          background: 'var(--input-bg)',
          borderRadius: '10px',
          border: '1px solid var(--input-border)'
        }}>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Number (auto)"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              aria-label="Defect number"
              style={{ width: '80px', flexShrink: 0 }}
            />
            <select
              value={newSeverity}
              onChange={(e) => setNewSeverity(e.target.value as any)}
              style={{ color: 'var(--text-primary)', minWidth: '130px' }}
              aria-label="Severity"
            >
              <option value="">Severity: Not Set</option>
              <option value="Critical">Critical</option>
              <option value="Major">Major</option>
              <option value="Minor">Minor</option>
              <option value="Observation">Observation</option>
            </select>
            <input
              type="date"
              placeholder="Due Date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              min="1900-01-01"
              max="2100-12-31"
              aria-label="Due date"
              style={{ minWidth: '140px' }}
            />
          </div>
          <textarea
            placeholder="Description *"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            required
            rows={4}
            style={{ width: '100%', resize: 'vertical', marginBottom: '10px' }}
            aria-label="Defect description"
          />
          <textarea
            placeholder="Notes (optional)"
            value={newNotes}
            onChange={(e) => setNewNotes(e.target.value)}
            rows={2}
            style={{ width: '100%', resize: 'vertical', marginBottom: '12px' }}
            aria-label="Notes"
          />
          <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            Add Defect
          </button>
        </form>
      )}

      {/* Defect List */}
      {defects.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No defects recorded</p>
      ) : filteredDefects.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          {searchQuery ? `No defects matching "${searchQuery}"` : `No ${statusFilter} defects`}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filteredDefects.map((defect) => {
            const isEditing = editingDefectId === defect.id
            const isExpanded = expandedDefectIds.has(defect.id)
            const overdue = isOverdue(defect)
            const sevColor = severityColors[defect.severity || ''] || 'var(--table-border)'
            const hasExpandContent = defect.notes || defect.closureNotes || defect.closedBy || defect.closedAt || defect.reopenReason

            if (isEditing) {
              return (
                <div key={defect.id} style={{
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid var(--accent-primary)',
                  borderLeft: `4px solid var(--accent-primary)`,
                  background: 'var(--input-bg)'
                }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Number"
                      value={editNumber}
                      onChange={(e) => setEditNumber(e.target.value)}
                      required
                      aria-label="Defect number"
                      style={{ width: '80px', flexShrink: 0 }}
                    />
                    <select
                      value={editSeverity}
                      onChange={(e) => setEditSeverity(e.target.value as any)}
                      style={{ color: 'var(--text-primary)', minWidth: '130px' }}
                      aria-label="Severity"
                    >
                      <option value="">Severity: Not Set</option>
                      <option value="Critical">Critical</option>
                      <option value="Major">Major</option>
                      <option value="Minor">Minor</option>
                      <option value="Observation">Observation</option>
                    </select>
                    <input
                      type="date"
                      placeholder="Due Date"
                      value={editDueDate}
                      onChange={(e) => setEditDueDate(e.target.value)}
                      min="1900-01-01"
                      max="2100-12-31"
                      aria-label="Due date"
                      style={{ minWidth: '140px' }}
                    />
                  </div>
                  <textarea
                    placeholder="Description *"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    required
                    rows={4}
                    style={{ width: '100%', resize: 'vertical', marginBottom: '10px' }}
                    aria-label="Defect description"
                  />
                  <textarea
                    placeholder="Notes (optional)"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    rows={2}
                    style={{ width: '100%', resize: 'vertical', marginBottom: '12px' }}
                    aria-label="Notes"
                  />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={() => handleSaveEdit(defect.id)}
                      className="btn-primary"
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                    >
                      <Save size={16} />
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="btn-secondary"
                      style={{ padding: '8px 16px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div
                key={defect.id}
                style={{
                  borderRadius: '10px',
                  border: '1px solid var(--table-border)',
                  borderLeft: `4px solid ${sevColor}`,
                  overflow: 'hidden',
                  transition: 'background 0.12s'
                }}
              >
                {/* Collapsed Row */}
                <div
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return
                    if (hasExpandContent) toggleExpanded(defect.id)
                  }}
                  style={{
                    padding: '14px 16px',
                    cursor: hasExpandContent ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    background: isExpanded
                      ? (isLight ? 'rgba(0, 119, 163, 0.04)' : 'rgba(0, 210, 255, 0.04)')
                      : 'transparent'
                  }}
                >
                  {/* Bulk select checkbox */}
                  {selectMode && defect.status === 'OPEN' && (
                    <input type="checkbox" checked={selectedIds.has(defect.id)} onChange={() => setSelectedIds(prev => { const n = new Set(prev); if (n.has(defect.id)) n.delete(defect.id); else n.add(defect.id); return n })} onClick={e => e.stopPropagation()} style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)', cursor: 'pointer', marginTop: '2px', flexShrink: 0 }} />
                  )}

                  {/* Expand indicator */}
                  <div style={{
                    flexShrink: 0,
                    marginTop: '2px',
                    color: 'var(--text-secondary)',
                    opacity: hasExpandContent ? 1 : 0.3,
                    transition: 'transform 0.2s'
                  }}>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {/* Number */}
                  <span style={{
                    fontWeight: '700',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    flexShrink: 0,
                    minWidth: '28px'
                  }}>
                    #{defect.defectNumber}
                  </span>

                  {/* Description + Due Date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: 'var(--text-primary)',
                      fontSize: '13px',
                      lineHeight: '1.4',
                      ...(isExpanded ? {} : {
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical' as const,
                        overflow: 'hidden'
                      })
                    }}>
                      {defect.description}
                    </div>
                    {defect.dueDate && (
                      <div style={{
                        marginTop: '4px',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Clock size={12} style={{ color: 'var(--text-secondary)' }} />
                        <span style={{
                          color: overdue ? 'var(--danger)' : 'var(--text-secondary)',
                          fontWeight: overdue ? '600' : '400'
                        }}>
                          Due: {formatDueDate(defect.dueDate)}
                        </span>
                        {overdue && (
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '700',
                            background: isLight ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 167, 38, 0.15)',
                            color: '#ffa726',
                            border: '1px solid rgba(255, 167, 38, 0.3)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            Overdue
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {/* Severity Badge — flat pill, non-interactive */}
                    {defect.severity ? (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: '600',
                        background: sevColor + '18',
                        color: sevColor,
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        whiteSpace: 'nowrap'
                      }}>
                        {defect.severity}
                      </span>
                    ) : (
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: '500',
                        color: 'var(--text-secondary)',
                        background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                        whiteSpace: 'nowrap'
                      }}>
                        No Severity
                      </span>
                    )}

                    {/* Status Badge — flat pill, non-interactive */}
                    {defect.status === 'OPEN' ? (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: '600',
                        background: isLight ? 'rgba(200, 0, 0, 0.08)' : 'rgba(255, 77, 77, 0.08)',
                        color: 'var(--danger)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        whiteSpace: 'nowrap'
                      }}>
                        <AlertCircle size={10} />
                        Open
                      </span>
                    ) : (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: '600',
                        background: isLight ? 'rgba(0, 140, 70, 0.08)' : 'rgba(0, 255, 136, 0.08)',
                        color: isLight ? '#008c46' : '#00ff88',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        whiteSpace: 'nowrap'
                      }}>
                        <CheckCircle size={10} />
                        Closed
                      </span>
                    )}
                  </div>

                  {/* Action Buttons — icon-only, clearly interactive */}
                  {canManageDefects && (
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0, marginLeft: '12px', borderLeft: '1px solid var(--table-border)', paddingLeft: '10px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditDefect(defect) }}
                        style={{ padding: '6px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                        title="Edit"
                        onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'var(--accent-primary)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        <Edit size={15} />
                      </button>
                      {defect.status === 'OPEN' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setCloseModalDefect(defect) }}
                          style={{ padding: '6px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                          title="Close defect"
                          onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(0,140,70,0.1)' : 'rgba(0,255,136,0.1)'; e.currentTarget.style.color = isLight ? '#008c46' : '#00ff88' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <CheckCircle size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReopenDefect(defect) }}
                          style={{ padding: '6px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                          title="Reopen defect"
                          onMouseEnter={e => { e.currentTarget.style.background = isLight ? 'rgba(255,152,0,0.1)' : 'rgba(255,204,0,0.1)'; e.currentTarget.style.color = isLight ? '#e68a00' : '#ffcc00' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteDefect(defect) }}
                        aria-label={`Delete defect ${defect.defectNumber}`}
                        style={{ padding: '6px', background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', transition: 'all 0.12s' }}
                        title="Delete"
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,77,0.1)'; e.currentTarget.style.color = 'var(--danger)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {isExpanded && hasExpandContent && (
                  <div style={{
                    padding: '0 16px 14px 52px',
                    borderTop: '1px solid var(--table-border)',
                    background: isLight ? 'rgba(0, 119, 163, 0.03)' : 'rgba(0, 210, 255, 0.03)'
                  }}>
                    {defect.notes && (
                      <div style={{ marginTop: '12px' }}>
                        <div style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '4px'
                        }}>
                          Notes
                        </div>
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--input-bg)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap'
                        }}>
                          {defect.notes}
                        </div>
                      </div>
                    )}
                    {(defect.closedAt || defect.closedBy) && (
                      <div style={{
                        marginTop: '12px',
                        display: 'flex',
                        gap: '16px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)'
                      }}>
                        {defect.closedBy && (
                          <span>
                            <strong style={{ color: 'var(--text-primary)' }}>Closed by:</strong>{' '}
                            {defect.closedBy}
                          </span>
                        )}
                        {defect.closedAt && (
                          <span>
                            <strong style={{ color: 'var(--text-primary)' }}>on</strong>{' '}
                            {formatDate(defect.closedAt)}
                          </span>
                        )}
                      </div>
                    )}
                    {defect.closureNotes && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          color: 'var(--text-secondary)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '4px'
                        }}>
                          Closure Notes
                        </div>
                        <div style={{
                          padding: '8px 10px',
                          background: 'var(--input-bg)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          lineHeight: '1.5',
                          whiteSpace: 'pre-wrap',
                          borderLeft: `3px solid ${isLight ? '#008c46' : '#00ff88'}`
                        }}>
                          {defect.closureNotes}
                        </div>
                      </div>
                    )}
                    {defect.reopenReason && (
                      <div style={{ marginTop: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Reopen Reason</div>
                        <div style={{ padding: '8px 12px', background: isLight ? 'rgba(255,152,0,0.06)' : 'rgba(255,204,0,0.06)', borderRadius: '6px', fontSize: '13px', lineHeight: '1.5', whiteSpace: 'pre-wrap', borderLeft: '3px solid #ffa726' }}>
                          {defect.reopenReason}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Close Modal */}
      {closeModalDefect && (
        <CloseDefectModal
          defect={closeModalDefect}
          closureNotes={closureNotes}
          onClosureNotesChange={setClosureNotes}
          onClose={() => { setCloseModalDefect(null); setClosureNotes('') }}
          onConfirm={handleCloseDefect}
        />
      )}

      {/* Reopen modal with optional reason */}
      {reopenModalDefect && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setReopenModalDefect(null)}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '14px', padding: '24px', width: '420px', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px', color: 'var(--text-primary)' }}>Reopen Defect #{reopenModalDefect.defectNumber}</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>This will clear the closure data and set the defect back to OPEN.</p>
            <label style={{ fontSize: '0.82rem', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--text-primary)' }}>Reason (optional)</label>
            <textarea
              value={reopenReason}
              onChange={e => setReopenReason(e.target.value)}
              placeholder="Why is this defect being reopened?"
              rows={3}
              style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setReopenModalDefect(null)} className="btn-secondary" style={{ padding: '8px 16px' }}>Cancel</button>
              <button onClick={handleConfirmReopen} className="btn-primary" style={{ padding: '8px 16px' }}>Reopen</button>
            </div>
          </div>
        </div>
      )}

      {/* PDF note selection modal */}
      {showPdfModal && (() => {
        const defectsWithNotes = defects.filter(d => d.notes || d.closureNotes)
        const allSelected = defectsWithNotes.every(d => pdfNoteIds.has(d.id))
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '16px', padding: '28px', width: '500px', maxWidth: '95vw', border: isLight ? '1px solid rgba(0,0,0,0.1)' : '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Export PDF</h3>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Select which defect notes to include</p>
                </div>
                <button onClick={() => setShowPdfModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}>
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button
                  onClick={() => setPdfNoteIds(allSelected ? new Set() : new Set(defectsWithNotes.map(d => d.id)))}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-primary)', fontSize: '0.82rem', cursor: 'pointer', padding: '2px 0' }}
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {defectsWithNotes.map(d => (
                  <label key={d.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', cursor: 'pointer', padding: '10px 12px', borderRadius: '8px', background: pdfNoteIds.has(d.id) ? 'var(--bg-card-hover)' : 'var(--bg-card)', border: 'var(--glass-border)' }}>
                    <input
                      type="checkbox"
                      checked={pdfNoteIds.has(d.id)}
                      onChange={() => togglePdfNoteId(d.id)}
                      style={{ marginTop: '2px', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.88rem', color: 'var(--text-primary)' }}>#{d.defectNumber} — {d.description.substring(0, 60)}{d.description.length > 60 ? '...' : ''}</div>
                      {d.notes && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '3px' }}>{d.notes.substring(0, 80)}{d.notes.length > 80 ? '...' : ''}</div>}
                      {d.closureNotes && <div style={{ fontSize: '0.8rem', color: '#2d8a4e', marginTop: '2px', fontStyle: 'italic' }}>Closure: {d.closureNotes.substring(0, 80)}{d.closureNotes.length > 80 ? '...' : ''}</div>}
                    </div>
                  </label>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowPdfModal(false)} className="btn-secondary">Cancel</button>
                <button onClick={handlePdfExport} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={15} /> Export PDF
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Confirmation Modal */}
      {confirmation.show && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          isDangerous={confirmation.isDangerous}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation(prev => ({ ...prev, show: false }))}
        />
      )}
    </div>
  )
}

function StatBadge({ label, value, color, alert }: {
  label: string
  value: number
  color?: string
  alert?: boolean
}) {
  return (
    <div style={{
      padding: '6px 14px',
      borderRadius: '8px',
      background: 'var(--bg-card)',
      border: alert ? '1px solid rgba(255, 167, 38, 0.4)' : 'var(--glass-border)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '12px'
    }}>
      <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{label}:</span>
      <span style={{
        fontWeight: '700',
        color: color || 'var(--text-primary)',
        fontSize: '13px'
      }}>
        {value}
      </span>
    </div>
  )
}

function CloseDefectModal({ defect, closureNotes, onClosureNotesChange, onClose, onConfirm }: {
  defect: SurveyDefect
  closureNotes: string
  onClosureNotesChange: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const modal = modalRef.current
    if (!modal) return
    const focusable = modal.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last?.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first?.focus() }
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div role="presentation" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 99999 }} onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="close-defect-title" className="glass-card" style={{ padding: '30px', width: '500px', maxWidth: '90%', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
        <h3 id="close-defect-title" style={{ marginTop: 0, color: 'var(--text-primary)' }}>Close Defect #{defect.defectNumber}</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>Add optional closure notes:</p>
        <textarea
          value={closureNotes}
          onChange={(e) => onClosureNotesChange(e.target.value)}
          placeholder="Closure notes (optional)"
          rows={4}
          style={{ width: '100%', resize: 'vertical', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', padding: '10px', borderRadius: '6px' }}
          aria-label="Closure notes"
        />
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={onConfirm} className="btn-primary">Close Defect</button>
        </div>
      </div>
    </div>
  )
}
