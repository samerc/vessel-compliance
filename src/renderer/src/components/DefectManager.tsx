import { useState, useEffect, useRef, useMemo } from 'react'
import {
  Trash2,
  Plus,
  X,
  CheckCircle,
  AlertCircle,
  Edit,
  Save,
  FileText,
  Download,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Clock,
  Search,
  CheckSquare,
  List,
  ListOrdered,
  Type,
  Paperclip,
  Image as ImageIcon,
  Copy,
  Check
} from 'lucide-react'
import XLSX from 'xlsx-js-style'
import { SurveyDefect, ConditionSurvey, Vessel } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDate } from '../utils/dateUtils'
import ConfirmationModal from './ConfirmationModal'
import { Field, Modal } from './ui'
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

// Open defects first, closed at the bottom, each group sorted by the chosen field
function sortDefects(
  data: SurveyDefect[],
  sortField: 'defectNumber' | 'createdAt',
  sortOrder: 'asc' | 'desc'
): SurveyDefect[] {
  const sorter = (a: SurveyDefect, b: SurveyDefect): number => {
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
  const open = data.filter((d) => d.status === 'OPEN').sort(sorter)
  const closed = data.filter((d) => d.status !== 'OPEN').sort(sorter)
  return [...open, ...closed]
}

export default function DefectManager({
  survey,
  vessel,
  onUpdate,
  refreshKey
}: DefectManagerProps): React.JSX.Element {
  const { user, hasPermission } = useAuth()
  const { showError, showSuccess } = useToast()
  const canManageDefects = hasPermission('surveys:defects')
  const [defects, setDefects] = useState<SurveyDefect[]>([])
  const [sortField, setSortField] = useState<'defectNumber' | 'createdAt'>('defectNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [showAddForm, setShowAddForm] = useState(false)
  const defectNumberRef = useRef<HTMLInputElement>(null)
  const [closeModalDefect, setCloseModalDefect] = useState<SurveyDefect | null>(null)
  const [closureNotes, setClosureNotes] = useState('')
  const [editingDefectId, setEditingDefectId] = useState<string | null>(null)
  const [expandedDefectIds, setExpandedDefectIds] = useState<Set<string>>(new Set())
  const [copiedDefectId, setCopiedDefectId] = useState<string | null>(null)
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
  }>({ show: false, title: '', message: '', onConfirm: () => {} })

  // New defect form
  const [newNumber, setNewNumber] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSeverity, setNewSeverity] = useState<
    'Critical' | 'Major' | 'Minor' | 'Observation' | ''
  >('')
  const [newDueDate, setNewDueDate] = useState('')
  const [newDueEvent, setNewDueEvent] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // Edit defect form
  const [editNumber, setEditNumber] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSeverity, setEditSeverity] = useState<
    'Critical' | 'Major' | 'Minor' | 'Observation' | ''
  >('')
  const [editDueDate, setEditDueDate] = useState('')
  const [editDueEvent, setEditDueEvent] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    if (showAddForm) defectNumberRef.current?.focus()
  }, [showAddForm])

  // Loads when the survey, sort or parent refreshKey changes, and whenever loadDefects() is called
  const [reloadKey, setReloadKey] = useState(0)
  const loadDefects = (): void => setReloadKey((k) => k + 1)
  const surveyId = survey.id
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      const data = await window.api.getSurveyDefects(surveyId)
      if (alive) setDefects(sortDefects(data, sortField, sortOrder))
    }
    void run()
    return () => {
      alive = false
    }
  }, [sortField, sortOrder, surveyId, refreshKey, reloadKey])

  const handleAddDefect = async (e: React.FormEvent): Promise<void> => {
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
      severity: newSeverity
        ? (newSeverity as 'Critical' | 'Major' | 'Minor' | 'Observation')
        : undefined,
      status: 'OPEN',
      dueDate: newDueDate || undefined,
      dueEvent: newDueEvent.trim() || undefined,
      notes: newNotes || undefined
    })

    setNewNumber('')
    setNewDescription('')
    setNewSeverity('')
    setNewDueDate('')
    setNewDueEvent('')
    setNewNotes('')
    setShowAddForm(false)
    loadDefects()
    onUpdate()
  }

  const handleEditDefect = (defect: SurveyDefect): void => {
    setEditingDefectId(defect.id)
    setEditNumber(defect.defectNumber)
    setEditDescription(defect.description)
    setEditSeverity(defect.severity || '')
    setEditDueDate(defect.dueDate || '')
    setEditDueEvent(defect.dueEvent || '')
    setEditNotes(defect.notes || '')
  }

  const handleSaveEdit = async (defectId: string): Promise<void> => {
    if (!editDescription.trim() || !editNumber.trim()) return

    await window.api.updateSurveyDefect(defectId, {
      defectNumber: editNumber,
      description: editDescription,
      severity: editSeverity
        ? (editSeverity as 'Critical' | 'Major' | 'Minor' | 'Observation')
        : undefined,
      dueDate: editDueDate || null,
      dueEvent: editDueEvent.trim() || null,
      notes: editNotes || undefined
    })

    setEditingDefectId(null)
    loadDefects()
    onUpdate()
  }

  const handleCancelEdit = (): void => {
    setEditingDefectId(null)
  }

  const handleCloseDefect = async (): Promise<void> => {
    if (!closeModalDefect) return
    await window.api.closeDefect(
      closeModalDefect.id,
      user?.username || 'Unknown',
      closureNotes || undefined
    )
    setCloseModalDefect(null)
    setClosureNotes('')
    loadDefects()
    onUpdate()
  }

  const [reopenModalDefect, setReopenModalDefect] = useState<SurveyDefect | null>(null)
  const [reopenReason, setReopenReason] = useState('')

  const handleReopenDefect = (defect: SurveyDefect): void => {
    setReopenModalDefect(defect)
    setReopenReason('')
  }

  const handleConfirmReopen = async (): Promise<void> => {
    if (!reopenModalDefect) return
    await window.api.reopenDefect(reopenModalDefect.id, reopenReason || undefined)
    setReopenModalDefect(null)
    setReopenReason('')
    loadDefects()
    onUpdate()
  }

  const handleBulkClose = async (): Promise<void> => {
    setBulkClosing(true)
    try {
      for (const id of selectedIds) {
        const d = defects.find((dd) => dd.id === id)
        if (d && d.status === 'OPEN') {
          await window.api.closeDefect(id, user?.username || 'Unknown')
        }
      }
      setSelectedIds(new Set())
      setSelectMode(false)
      loadDefects()
      onUpdate()
    } finally {
      setBulkClosing(false)
    }
  }

  // Filtered defects (status + search)
  const filteredDefects = useMemo(() => {
    let filtered = defects
    if (statusFilter === 'open') filtered = filtered.filter((d) => d.status === 'OPEN')
    else if (statusFilter === 'closed') filtered = filtered.filter((d) => d.status !== 'OPEN')
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (d) =>
          d.defectNumber.toLowerCase().includes(q) ||
          d.description.toLowerCase().includes(q) ||
          (d.notes || '').toLowerCase().includes(q) ||
          (d.closureNotes || '').toLowerCase().includes(q)
      )
    }
    return filtered
  }, [defects, statusFilter, searchQuery])

  const toggleSelectAll = (): void => {
    const openFiltered = filteredDefects.filter((d) => d.status === 'OPEN')
    if (openFiltered.every((d) => selectedIds.has(d.id))) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(openFiltered.map((d) => d.id)))
    }
  }

  const handleDeleteDefect = (defect: SurveyDefect): void => {
    setConfirmation({
      show: true,
      title: 'Delete Defect',
      message: `Delete defect #${defect.defectNumber}? This cannot be undone.`,
      isDangerous: true,
      onConfirm: async () => {
        setConfirmation((prev) => ({ ...prev, show: false }))
        await window.api.deleteSurveyDefect(defect.id)
        loadDefects()
        onUpdate()
      }
    })
  }

  const toggleExpanded = (defectId: string): void => {
    setExpandedDefectIds((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(defectId)) {
        newSet.delete(defectId)
      } else {
        newSet.add(defectId)
      }
      return newSet
    })
  }

  const handleCopyDefect = async (defect: SurveyDefect): Promise<void> => {
    try {
      await navigator.clipboard.writeText(defect.description || '')
      setCopiedDefectId(defect.id)
      showSuccess(`Defect #${defect.defectNumber} copied`)
      setTimeout(() => setCopiedDefectId((prev) => (prev === defect.id ? null : prev)), 1500)
    } catch {
      showError('Could not copy to clipboard')
    }
  }

  const isOverdue = (defect: SurveyDefect): boolean => {
    if (defect.status !== 'OPEN' || !defect.dueDate) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const due = new Date(defect.dueDate)
    due.setHours(0, 0, 0, 0)
    return due < today
  }

  const [showPdfModal, setShowPdfModal] = useState(false)
  const [pdfNoteIds, setPdfNoteIds] = useState<Set<string>>(new Set())

  const exportToPDF = (): void => {
    const defectsWithNotes = defects.filter((d) => d.notes || d.closureNotes)
    if (defectsWithNotes.length === 0) {
      ReportService.exportSurveyToPDF(vessel, survey, defects)
    } else {
      setPdfNoteIds(new Set(defectsWithNotes.map((d) => d.id)))
      setShowPdfModal(true)
    }
  }

  const handlePdfExport = (): void => {
    setShowPdfModal(false)
    ReportService.exportSurveyToPDF(vessel, survey, defects, pdfNoteIds)
  }

  const togglePdfNoteId = (id: string): void => {
    setPdfNoteIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const exportToExcel = (): void => {
    const rows = defects.map((d) => ({
      '#': d.defectNumber,
      Description: d.description,
      Severity: d.severity || 'Not Set',
      Status: d.status,
      'Due Date': d.dueDate || '',
      'Due Event': d.dueEvent || '',
      'Closed By': d.closedBy || '',
      'Closed At': d.closedAt ? formatDate(d.closedAt) : '',
      Notes: d.notes || ''
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Defects')
    XLSX.writeFile(wb, `Defects_${vessel.name}_${survey.surveyDate}.xlsx`)
  }

  // Computed stats
  const openCount = defects.filter((d) => d.status === 'OPEN').length
  const closedCount = defects.filter((d) => d.status !== 'OPEN').length
  const overdueCount = defects.filter((d) => isOverdue(d)).length

  const formatDueDate = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div
      style={{
        marginTop: '20px',
        padding: '20px',
        background: 'var(--bg-card)',
        borderRadius: '12px',
        border: 'var(--glass-border)'
      }}
    >
      {/* Suggestions for the "due event" inputs (deadlines that are events, not dates) */}
      <datalist id="defect-due-events">
        <option value="Before next sailing" />
        <option value="Prior to departure" />
        <option value="At next dry dock" />
        <option value="At next port" />
        <option value="Upon completion of work" />
        <option value="At next class survey" />
      </datalist>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Defects</h4>
          <select
            value={`${sortField}-${sortOrder}`}
            onChange={(e) => {
              const [field, order] = e.target.value.split('-') as [
                'defectNumber' | 'createdAt',
                'asc' | 'desc'
              ]
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
                  onClick={() => {
                    setSelectMode(!selectMode)
                    setSelectedIds(new Set())
                  }}
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
          <StatBadge
            label="Open"
            value={openCount}
            color={openCount > 0 ? 'var(--danger)' : undefined}
          />
          <StatBadge
            label="Closed"
            value={closedCount}
            color={closedCount > 0 ? 'var(--success)' : undefined}
          />
          <StatBadge
            label="Overdue"
            value={overdueCount}
            color={overdueCount > 0 ? 'var(--warning)' : undefined}
            alert={overdueCount > 0}
          />
        </div>
      )}

      {/* Quick Filter */}
      {defects.length > 0 && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '16px' }}>
          {(['all', 'open', 'closed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{
                padding: '5px 14px',
                borderRadius: '6px',
                border:
                  statusFilter === f
                    ? '1px solid var(--accent-primary)'
                    : '1px solid var(--input-border)',
                background: statusFilter === f ? 'var(--accent-tint)' : 'transparent',
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
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)'
              }}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search defects..."
              style={{
                paddingLeft: '28px',
                width: '180px',
                fontSize: '0.78rem',
                padding: '5px 10px 5px 28px',
                borderRadius: '6px',
                border: '1px solid var(--input-border)',
                background: 'var(--input-bg)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selectMode && selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px',
            padding: '10px 14px',
            borderRadius: '8px',
            background: 'rgba(var(--accent-primary-rgb), 0.06)',
            border: '1px solid rgba(var(--accent-primary-rgb), 0.2)',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={toggleSelectAll}
            className="btn-secondary"
            style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          >
            {filteredDefects.filter((d) => d.status === 'OPEN').every((d) => selectedIds.has(d.id))
              ? 'Deselect All'
              : 'Select All Open'}
          </button>
          <div style={{ flex: 1 }} />
          <button
            onClick={handleBulkClose}
            disabled={bulkClosing}
            className="btn-primary"
            style={{
              padding: '6px 14px',
              fontSize: '0.78rem',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            <CheckCircle size={14} /> Close Selected
          </button>
          <button
            onClick={() => {
              setSelectedIds(new Set())
              setSelectMode(false)
            }}
            className="btn-secondary"
            style={{ padding: '6px 10px', fontSize: '0.78rem' }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Add Defect Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddDefect}
          style={{
            marginBottom: '20px',
            padding: '16px',
            background: 'var(--bg-card)',
            borderRadius: '10px',
            border: 'var(--glass-border)'
          }}
        >
          <div className="form-grid">
            <Field label="Number" hint="Leave empty to number automatically">
              <input
                ref={defectNumberRef}
                type="text"
                placeholder="Number (auto)"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                aria-label="Defect number"
              />
            </Field>
            <Field label="Severity">
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as typeof newSeverity)}
                aria-label="Severity"
              >
                <option value="">Severity: Not Set</option>
                <option value="Critical">Critical</option>
                <option value="Major">Major</option>
                <option value="Minor">Minor</option>
                <option value="Observation">Observation</option>
              </select>
            </Field>
            <Field label="Due date">
              <input
                type="date"
                placeholder="Due Date"
                value={newDueDate}
                onChange={(e) => setNewDueDate(e.target.value)}
                min="1900-01-01"
                max="2100-12-31"
                aria-label="Due date"
              />
            </Field>
            <Field label="Or due event">
              <input
                type="text"
                list="defect-due-events"
                placeholder="e.g. At next dry dock"
                value={newDueEvent}
                onChange={(e) => setNewDueEvent(e.target.value)}
                aria-label="Due event"
                title="A deadline that is an event rather than a date"
              />
            </Field>
            <Field label="Description" required span="all">
              <FormattedTextArea
                placeholder="Description *"
                value={newDescription}
                onChange={setNewDescription}
                required
                rows={4}
                ariaLabel="Defect description"
                isLight={isLight}
                marginBottom="0"
              />
            </Field>
            <Field label="Notes" hint="Optional" span="all">
              <textarea
                placeholder="Notes (optional)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
                style={{ resize: 'vertical' }}
                aria-label="Notes"
              />
            </Field>
          </div>
          <div className="form-actions" style={{ marginTop: '14px' }}>
            <button type="submit" className="btn-primary">
              <Plus size={16} />
              Add Defect
            </button>
          </div>
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
            // All defects are expandable: the panel reveals the full description, any
            // notes/closure info, and the rectification-evidence attachments.
            const hasExpandContent = true

            if (isEditing) {
              return (
                <div
                  key={defect.id}
                  style={{
                    padding: '16px',
                    borderRadius: '10px',
                    border: '1px solid var(--accent-primary)',
                    borderLeft: `4px solid var(--accent-primary)`,
                    background: 'var(--bg-card)'
                  }}
                >
                  <div className="form-grid">
                    <Field label="Number" required>
                      <input
                        type="text"
                        placeholder="Number"
                        value={editNumber}
                        onChange={(e) => setEditNumber(e.target.value)}
                        required
                        aria-label="Defect number"
                      />
                    </Field>
                    <Field label="Severity">
                      <select
                        value={editSeverity}
                        onChange={(e) => setEditSeverity(e.target.value as typeof editSeverity)}
                        aria-label="Severity"
                      >
                        <option value="">Severity: Not Set</option>
                        <option value="Critical">Critical</option>
                        <option value="Major">Major</option>
                        <option value="Minor">Minor</option>
                        <option value="Observation">Observation</option>
                      </select>
                    </Field>
                    <Field label="Due date">
                      <input
                        type="date"
                        placeholder="Due Date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        min="1900-01-01"
                        max="2100-12-31"
                        aria-label="Due date"
                      />
                    </Field>
                    <Field label="Or due event">
                      <input
                        type="text"
                        list="defect-due-events"
                        placeholder="e.g. At next dry dock"
                        value={editDueEvent}
                        onChange={(e) => setEditDueEvent(e.target.value)}
                        aria-label="Due event"
                        title="A deadline that is an event rather than a date"
                      />
                    </Field>
                    <Field label="Description" required span="all">
                      <FormattedTextArea
                        placeholder="Description *"
                        value={editDescription}
                        onChange={setEditDescription}
                        required
                        rows={4}
                        ariaLabel="Defect description"
                        isLight={isLight}
                        marginBottom="0"
                      />
                    </Field>
                    <Field label="Notes" hint="Optional" span="all">
                      <textarea
                        placeholder="Notes (optional)"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        style={{ resize: 'vertical' }}
                        aria-label="Notes"
                      />
                    </Field>
                  </div>
                  <div className="form-actions" style={{ marginTop: '14px' }}>
                    <button onClick={handleCancelEdit} className="btn-secondary">
                      Cancel
                    </button>
                    <button onClick={() => handleSaveEdit(defect.id)} className="btn-primary">
                      <Save size={16} />
                      Save
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
                    background: isExpanded ? 'rgba(var(--accent-primary-rgb), 0.04)' : 'transparent'
                  }}
                >
                  {/* Bulk select checkbox */}
                  {selectMode && defect.status === 'OPEN' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(defect.id)}
                      onChange={() =>
                        setSelectedIds((prev) => {
                          const n = new Set(prev)
                          if (n.has(defect.id)) n.delete(defect.id)
                          else n.add(defect.id)
                          return n
                        })
                      }
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '16px',
                        height: '16px',
                        accentColor: 'var(--accent-primary)',
                        cursor: 'pointer',
                        marginTop: '2px',
                        flexShrink: 0
                      }}
                    />
                  )}

                  {/* Expand indicator */}
                  <div
                    style={{
                      flexShrink: 0,
                      marginTop: '2px',
                      color: 'var(--text-secondary)',
                      opacity: hasExpandContent ? 1 : 0.3,
                      transition: 'transform 0.2s'
                    }}
                  >
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>

                  {/* Number */}
                  <span
                    style={{
                      fontWeight: '700',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      flexShrink: 0,
                      minWidth: '28px'
                    }}
                  >
                    #{defect.defectNumber}
                  </span>

                  {/* Description + Due Date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        color: 'var(--text-primary)',
                        fontSize: '13px',
                        lineHeight: '1.4',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        ...(isExpanded
                          ? {}
                          : {
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical' as const,
                              overflow: 'hidden'
                            })
                      }}
                    >
                      {defect.description}
                    </div>
                    {defect.dueEvent && !defect.dueDate && (
                      <div
                        style={{
                          marginTop: '4px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Clock size={12} style={{ color: 'var(--text-secondary)' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Due: {defect.dueEvent}
                        </span>
                      </div>
                    )}
                    {defect.dueDate && (
                      <div
                        style={{
                          marginTop: '4px',
                          fontSize: '12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Clock size={12} style={{ color: 'var(--text-secondary)' }} />
                        <span
                          style={{
                            color: overdue ? 'var(--danger)' : 'var(--text-secondary)',
                            fontWeight: overdue ? '600' : '400'
                          }}
                        >
                          Due: {formatDueDate(defect.dueDate)}
                        </span>
                        {overdue && (
                          <span
                            style={{
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '700',
                              background: isLight
                                ? 'rgba(255, 152, 0, 0.15)'
                                : 'rgba(255, 167, 38, 0.15)',
                              color: 'var(--warning)',
                              border: '1px solid rgba(255, 167, 38, 0.3)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}
                          >
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
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: sevColor + '18',
                          color: sevColor,
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {defect.severity}
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: '500',
                          color: 'var(--text-secondary)',
                          background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        No Severity
                      </span>
                    )}

                    {/* Status Badge — flat pill, non-interactive */}
                    {defect.status === 'OPEN' ? (
                      <span
                        style={{
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
                        }}
                      >
                        <AlertCircle size={10} />
                        Open
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: '600',
                          background: isLight
                            ? 'rgba(0, 140, 70, 0.08)'
                            : 'rgba(0, 255, 136, 0.08)',
                          color: 'var(--success)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.4px',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        <CheckCircle size={10} />
                        Closed
                      </span>
                    )}
                  </div>

                  {/* Copy defect text — always available (read-only), no selection needed */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleCopyDefect(defect)
                    }}
                    title="Copy defect text"
                    aria-label={`Copy defect ${defect.defectNumber}`}
                    style={{
                      padding: '6px',
                      background: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color:
                        copiedDefectId === defect.id ? 'var(--success)' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      flexShrink: 0,
                      marginLeft: '8px',
                      transition: 'all 0.12s'
                    }}
                    onMouseEnter={(e) => {
                      if (copiedDefectId !== defect.id) {
                        e.currentTarget.style.background = isLight
                          ? 'rgba(0,0,0,0.06)'
                          : 'rgba(255,255,255,0.08)'
                        e.currentTarget.style.color = 'var(--accent-primary)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color =
                        copiedDefectId === defect.id ? 'var(--success)' : 'var(--text-secondary)'
                    }}
                  >
                    {copiedDefectId === defect.id ? <Check size={15} /> : <Copy size={15} />}
                  </button>

                  {/* Action Buttons — icon-only, clearly interactive */}
                  {canManageDefects && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '2px',
                        flexShrink: 0,
                        marginLeft: '12px',
                        borderLeft: '1px solid var(--table-border)',
                        paddingLeft: '10px'
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEditDefect(defect)
                        }}
                        style={{
                          padding: '6px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.12s'
                        }}
                        title="Edit"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = isLight
                            ? 'rgba(0,0,0,0.06)'
                            : 'rgba(255,255,255,0.08)'
                          e.currentTarget.style.color = 'var(--accent-primary)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                      >
                        <Edit size={15} />
                      </button>
                      {defect.status === 'OPEN' ? (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setCloseModalDefect(defect)
                          }}
                          style={{
                            padding: '6px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.12s'
                          }}
                          title="Close defect"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isLight
                              ? 'rgba(0,140,70,0.1)'
                              : 'rgba(0,255,136,0.1)'
                            e.currentTarget.style.color = 'var(--success)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                          }}
                        >
                          <CheckCircle size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReopenDefect(defect)
                          }}
                          style={{
                            padding: '6px',
                            background: 'transparent',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            transition: 'all 0.12s'
                          }}
                          title="Reopen defect"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isLight
                              ? 'rgba(255,152,0,0.1)'
                              : 'rgba(255,204,0,0.1)'
                            e.currentTarget.style.color = 'var(--warning)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent'
                            e.currentTarget.style.color = 'var(--text-secondary)'
                          }}
                        >
                          <RotateCcw size={15} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteDefect(defect)
                        }}
                        aria-label={`Delete defect ${defect.defectNumber}`}
                        style={{
                          padding: '6px',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          transition: 'all 0.12s'
                        }}
                        title="Delete"
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(255,77,77,0.1)'
                          e.currentTarget.style.color = 'var(--danger)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.color = 'var(--text-secondary)'
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div
                    style={{
                      padding: '0 16px 14px 52px',
                      borderTop: '1px solid var(--table-border)',
                      background: 'rgba(var(--accent-primary-rgb), 0.03)'
                    }}
                  >
                    <DefectAttachments
                      defectId={defect.id}
                      canManage={canManageDefects}
                      isLight={isLight}
                      uploadedBy={user?.username || 'Unknown'}
                      showError={showError}
                    />
                    {defect.notes && (
                      <div style={{ marginTop: '12px' }}>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '4px'
                          }}
                        >
                          Notes
                        </div>
                        <div
                          style={{
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap'
                          }}
                        >
                          {defect.notes}
                        </div>
                      </div>
                    )}
                    {(defect.closedAt || defect.closedBy) && (
                      <div
                        style={{
                          marginTop: '12px',
                          display: 'flex',
                          gap: '16px',
                          fontSize: '12px',
                          color: 'var(--text-secondary)'
                        }}
                      >
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
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '4px'
                          }}
                        >
                          Closure Notes
                        </div>
                        <div
                          style={{
                            padding: '8px 10px',
                            background: 'var(--input-bg)',
                            borderRadius: '6px',
                            color: 'var(--text-primary)',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap',
                            borderLeft: `3px solid var(--success)`
                          }}
                        >
                          {defect.closureNotes}
                        </div>
                      </div>
                    )}
                    {defect.reopenReason && (
                      <div style={{ marginTop: '10px' }}>
                        <div
                          style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: 'var(--text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: '4px'
                          }}
                        >
                          Reopen Reason
                        </div>
                        <div
                          style={{
                            padding: '8px 12px',
                            background: isLight ? 'rgba(255,152,0,0.06)' : 'rgba(255,204,0,0.06)',
                            borderRadius: '6px',
                            fontSize: '13px',
                            lineHeight: '1.5',
                            whiteSpace: 'pre-wrap',
                            borderLeft: '3px solid var(--warning)'
                          }}
                        >
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
          onClose={() => {
            setCloseModalDefect(null)
            setClosureNotes('')
          }}
          onConfirm={handleCloseDefect}
        />
      )}

      {/* Reopen modal with optional reason */}
      {reopenModalDefect && (
        <Modal
          title={`Reopen Defect #${reopenModalDefect.defectNumber}`}
          icon={<RotateCcw size={18} />}
          onClose={() => setReopenModalDefect(null)}
          width={420}
          closeOnOverlay={false}
          footer={
            <>
              <button onClick={() => setReopenModalDefect(null)} className="btn-secondary">
                Cancel
              </button>
              <button onClick={handleConfirmReopen} className="btn-primary">
                Reopen
              </button>
            </>
          }
        >
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
            This will clear the closure data and set the defect back to OPEN.
          </p>
          <div className="form-grid">
            <Field label="Reason" hint="Optional" span="all">
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="Why is this defect being reopened?"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* PDF note selection modal */}
      {showPdfModal &&
        (() => {
          const defectsWithNotes = defects.filter((d) => d.notes || d.closureNotes)
          const allSelected = defectsWithNotes.every((d) => pdfNoteIds.has(d.id))
          return (
            <Modal
              title="Export PDF"
              icon={<FileText size={18} />}
              onClose={() => setShowPdfModal(false)}
              width={500}
              closeOnOverlay={false}
              footer={
                <>
                  <button onClick={() => setShowPdfModal(false)} className="btn-secondary">
                    Cancel
                  </button>
                  <button onClick={handlePdfExport} className="btn-primary">
                    <FileText size={15} /> Export PDF
                  </button>
                </>
              }
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px'
                }}
              >
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Select which defect notes to include
                </p>
                <button
                  onClick={() =>
                    setPdfNoteIds(
                      allSelected ? new Set() : new Set(defectsWithNotes.map((d) => d.id))
                    )
                  }
                  className="btn-ghost btn-sm"
                >
                  {allSelected ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {defectsWithNotes.map((d) => (
                  <label
                    key={d.id}
                    style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'flex-start',
                      cursor: 'pointer',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: pdfNoteIds.has(d.id) ? 'var(--row-selected)' : 'var(--bg-card)',
                      border: 'var(--glass-border)'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={pdfNoteIds.has(d.id)}
                      onChange={() => togglePdfNoteId(d.id)}
                      style={{ marginTop: '2px', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: '600',
                          fontSize: '0.88rem',
                          color: 'var(--text-primary)'
                        }}
                      >
                        #{d.defectNumber} — {d.description.substring(0, 60)}
                        {d.description.length > 60 ? '...' : ''}
                      </div>
                      {d.notes && (
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--text-secondary)',
                            marginTop: '3px'
                          }}
                        >
                          {d.notes.substring(0, 80)}
                          {d.notes.length > 80 ? '...' : ''}
                        </div>
                      )}
                      {d.closureNotes && (
                        <div
                          style={{
                            fontSize: '0.8rem',
                            color: 'var(--success)',
                            marginTop: '2px',
                            fontStyle: 'italic'
                          }}
                        >
                          Closure: {d.closureNotes.substring(0, 80)}
                          {d.closureNotes.length > 80 ? '...' : ''}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </Modal>
          )
        })()}

      {/* Confirmation Modal */}
      {confirmation.show && (
        <ConfirmationModal
          title={confirmation.title}
          message={confirmation.message}
          isDangerous={confirmation.isDangerous}
          onConfirm={confirmation.onConfirm}
          onCancel={() => setConfirmation((prev) => ({ ...prev, show: false }))}
        />
      )}
    </div>
  )
}

function StatBadge({
  label,
  value,
  color,
  alert
}: {
  label: string
  value: number
  color?: string
  alert?: boolean
}): React.JSX.Element {
  return (
    <div
      style={{
        padding: '6px 14px',
        borderRadius: '8px',
        background: 'var(--bg-card)',
        border: alert ? '1px solid rgba(255, 167, 38, 0.4)' : 'var(--glass-border)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px'
      }}
    >
      <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>{label}:</span>
      <span
        style={{
          fontWeight: '700',
          color: color || 'var(--text-primary)',
          fontSize: '13px'
        }}
      >
        {value}
      </span>
    </div>
  )
}

// Plain-text textarea with a toggleable formatting toolbar (bullet / numbered lists).
// Storage stays plain text — the list marker characters (•, 1.) are inserted at the
// start of the selected lines, and the display renders with preserved line breaks.
function FormattedTextArea({
  value,
  onChange,
  placeholder,
  rows = 4,
  required,
  ariaLabel,
  isLight,
  marginBottom = '10px'
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
  required?: boolean
  ariaLabel?: string
  isLight: boolean
  marginBottom?: string
}): React.JSX.Element {
  const [showTools, setShowTools] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const bulletRe = /^(\s*)•\s+/
  const numRe = /^(\s*)\d+\.\s+/

  const applyLinePrefix = (mode: 'bullet' | 'number'): void => {
    const ta = ref.current
    if (!ta) return
    const selStart = ta.selectionStart
    const selEnd = ta.selectionEnd
    const lineStart = value.lastIndexOf('\n', selStart - 1) + 1
    let lineEnd = value.indexOf('\n', selEnd)
    if (lineEnd === -1) lineEnd = value.length
    const block = value.slice(lineStart, lineEnd)
    const lines = block.split('\n')
    const nonEmpty = lines.filter((l) => l.trim() !== '')
    const testRe = mode === 'bullet' ? bulletRe : numRe
    const allMarked = nonEmpty.length > 0 && nonEmpty.every((l) => testRe.test(l))
    let counter = 1
    const newLines = lines.map((l) => {
      if (l.trim() === '') return l
      const stripped = l.replace(bulletRe, '$1').replace(numRe, '$1')
      if (allMarked) return stripped // toggle off
      return mode === 'bullet' ? `• ${stripped}` : `${counter++}. ${stripped}`
    })
    const newBlock = newLines.join('\n')
    onChange(value.slice(0, lineStart) + newBlock + value.slice(lineEnd))
    requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(lineStart, lineStart + newBlock.length)
    })
  }

  return (
    <div style={{ marginBottom }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' }}>
        <button
          type="button"
          onClick={() => setShowTools((s) => !s)}
          title="Formatting tools"
          style={{
            padding: '3px 8px',
            fontSize: '0.72rem',
            borderRadius: '6px',
            border: '1px solid var(--input-border)',
            background: showTools
              ? isLight
                ? 'rgba(0,0,0,0.05)'
                : 'rgba(255,255,255,0.06)'
              : 'transparent',
            color: showTools ? 'var(--accent-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <Type size={13} /> Format
        </button>
      </div>
      {showTools && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
          <FormatToolButton
            icon={<List size={13} />}
            label="Bullets"
            onClick={() => applyLinePrefix('bullet')}
          />
          <FormatToolButton
            icon={<ListOrdered size={13} />}
            label="Numbered"
            onClick={() => applyLinePrefix('number')}
          />
        </div>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
        aria-label={ariaLabel}
        style={{ width: '100%', resize: 'vertical' }}
      />
    </div>
  )
}

function FormatToolButton({
  icon,
  label,
  onClick
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '3px 8px',
        fontSize: '0.72rem',
        borderRadius: '6px',
        border: '1px solid var(--input-border)',
        background: 'transparent',
        color: 'var(--text-primary)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '4px'
      }}
    >
      {icon} {label}
    </button>
  )
}

type DefectAttachment = Awaited<ReturnType<typeof window.api.defectGetAttachments>>[number]

// Optional rectification-evidence attachments per defect. Path-based (drag-drop a
// file or pick one), mirroring survey attachments — never required to close a defect.
function DefectAttachments({
  defectId,
  canManage,
  isLight,
  uploadedBy,
  showError
}: {
  defectId: string
  canManage: boolean
  isLight: boolean
  uploadedBy: string
  showError: (m: string) => void
}): React.JSX.Element {
  const [items, setItems] = useState<DefectAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = async (): Promise<void> => {
    try {
      const r = await window.api.defectGetAttachments(defectId)
      setItems(Array.isArray(r) ? r : [])
    } catch {
      setItems([])
    }
  }
  // Initial load when the defect changes (handlers await load() after uploads)
  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const r = await window.api.defectGetAttachments(defectId)
        if (alive) setItems(Array.isArray(r) ? r : [])
      } catch {
        if (alive) setItems([])
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [defectId])

  const addByPath = async (filePath: string, fileName: string): Promise<void> => {
    // The handler also returns canonicalPath (the path to store) for valid files
    const validation: { valid: boolean; reason?: string; canonicalPath?: string } =
      await window.api.fileTypesValidateFile(filePath)
    if (!validation.valid) {
      showError(`File rejected: ${validation.reason}`)
      return
    }
    await window.api.defectAddAttachment({
      defectId,
      filePath: validation.canonicalPath || filePath,
      fileName,
      uploadedBy
    })
  }

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (!canManage) return
    const files = e.dataTransfer.files
    if (!files.length) return
    setBusy(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        const p = window.api.getFilePath(f)
        if (p) await addByPath(p, f.name)
      }
      await load()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const handlePick = async (): Promise<void> => {
    if (!canManage) return
    try {
      const p = await window.api.dialogOpenFileAny()
      if (!p) return
      setBusy(true)
      await addByPath(p, p.split(/[\\/]/).pop() || 'file')
      await load()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: string): Promise<void> => {
    try {
      await window.api.defectDeleteAttachment(id)
      setItems((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Delete failed')
    }
  }

  const isImg = (name: string): boolean => /\.(png|jpe?g|gif|bmp|webp|heic|tiff?)$/i.test(name)

  return (
    <div style={{ marginTop: '12px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          marginBottom: '6px'
        }}
      >
        Rectification Evidence
        {items.length > 0 && (
          <span style={{ color: 'var(--accent-primary)' }}> ({items.length})</span>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        {items.map((a) => (
          <span
            key={a.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 8px',
              borderRadius: '6px',
              border: '1px solid var(--input-border)',
              background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
              fontSize: '0.76rem',
              maxWidth: '220px'
            }}
          >
            {isImg(a.fileName) ? (
              <ImageIcon size={12} style={{ flexShrink: 0 }} />
            ) : (
              <Paperclip size={12} style={{ flexShrink: 0 }} />
            )}
            <span
              onClick={() => window.api.fsOpen(a.filePath)}
              title={a.fileName}
              style={{
                cursor: 'pointer',
                color: 'var(--accent-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {a.fileName}
            </span>
            {canManage && (
              <button
                onClick={() => remove(a.id)}
                title="Remove"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--danger)',
                  padding: 0,
                  display: 'flex',
                  flexShrink: 0
                }}
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
        {canManage && (
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={handlePick}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: `1px dashed ${dragOver ? 'var(--accent-primary)' : 'var(--input-border)'}`,
              background: dragOver ? 'rgba(var(--accent-primary-rgb), 0.06)' : 'transparent',
              fontSize: '0.76rem',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <Paperclip size={12} /> {busy ? 'Uploading…' : 'Drop or attach file'}
          </div>
        )}
      </div>
    </div>
  )
}

function CloseDefectModal({
  defect,
  closureNotes,
  onClosureNotesChange,
  onClose,
  onConfirm
}: {
  defect: SurveyDefect
  closureNotes: string
  onClosureNotesChange: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}): React.JSX.Element {
  return (
    <Modal
      title={`Close Defect #${defect.defectNumber}`}
      icon={<CheckCircle size={18} />}
      onClose={onClose}
      width={500}
      closeOnOverlay={false}
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} className="btn-primary">
            Close Defect
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Closure notes" hint="Optional" span="all">
          <textarea
            autoFocus
            value={closureNotes}
            onChange={(e) => onClosureNotesChange(e.target.value)}
            placeholder="Closure notes (optional)"
            rows={4}
            style={{ resize: 'vertical' }}
            aria-label="Closure notes"
          />
        </Field>
      </div>
    </Modal>
  )
}
