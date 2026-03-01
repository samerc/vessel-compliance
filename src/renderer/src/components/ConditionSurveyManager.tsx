import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2, Upload, FileText, X, Download, FileUp, Edit, Save } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { Vessel, ConditionSurvey, SurveyAttachment, Surveyor, ConditionSurveyType } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import DefectManager from './DefectManager'
import ConfirmationModal from './ConfirmationModal'
import * as XLSX from 'xlsx'

interface ConditionSurveyManagerProps {
  vessel: Vessel
}

export default function ConditionSurveyManager({ vessel }: ConditionSurveyManagerProps) {
  const { user } = useAuth()
  const { showError, showSuccess } = useToast()
  const [surveys, setSurveys] = useState<ConditionSurvey[]>([])
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [surveyTypes, setSurveyTypes] = useState<ConditionSurveyType[]>([])
  const [attachments, setAttachments] = useState<SurveyAttachment[]>([])
  const [expandedSurveyId, setExpandedSurveyId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [dragOverSurveyId, setDragOverSurveyId] = useState<string | null>(null)
  const [editingSurveyId, setEditingSurveyId] = useState<string | null>(null)
  const [showNewSurveyorForm, setShowNewSurveyorForm] = useState(false)
  const [closingSurveyId, setClosingSurveyId] = useState<string | null>(null)
  const [endorsementSurveyId, setEndorsementSurveyId] = useState<string | null>(null)
  const { theme } = useTheme()
  const isLight = theme === 'light'

  // Confirmation modal state
  const [confirmation, setConfirmation] = useState<{
    show: boolean
    title: string
    message: string
    onConfirm: () => void
    isDangerous?: boolean
  }>({ show: false, title: '', message: '', onConfirm: () => { } })

  // Defect counts per survey
  const [defectCounts, setDefectCounts] = useState<Record<string, { open: number; closed: number }>>({})
  // Bump this to force DefectManager to reload its data (e.g. after importing defects)
  const [defectRefreshKey, setDefectRefreshKey] = useState(0)

  // New survey form
  const [newDate, setNewDate] = useState('')
  const [newSurveyorId, setNewSurveyorId] = useState('')
  const [newType, setNewType] = useState('')
  const [newReference, setNewReference] = useState('')
  const [newLocation, setNewLocation] = useState('')
  const [newNotes, setNewNotes] = useState('')

  // New surveyor inline form
  const [newSurveyorCompany, setNewSurveyorCompany] = useState('')
  const [newSurveyorCountry, setNewSurveyorCountry] = useState('')
  const [newSurveyorContactPerson, setNewSurveyorContactPerson] = useState('')

  // Edit survey form
  const [editDate, setEditDate] = useState('')
  const [editSurveyorId, setEditSurveyorId] = useState('')
  const [editType, setEditType] = useState('')
  const [editReference, setEditReference] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    loadData()
  }, [vessel.id])

  const loadData = async () => {
    const surveyData = await window.api.getConditionSurveys(vessel.id)
    setSurveys(surveyData)

    const surveyorData = await window.api.getSurveyors()
    setSurveyors(surveyorData)

    const typeData = await window.api.getConditionSurveyTypes()
    setSurveyTypes(typeData)

    const attachmentData = await window.api.getSurveyAttachments()
    setAttachments(attachmentData)

    // Load defect counts
    const counts: Record<string, { open: number; closed: number }> = {}
    for (const survey of surveyData) {
      const defects = await window.api.getSurveyDefects(survey.id)
      counts[survey.id] = {
        open: defects.filter(d => d.status === 'OPEN').length,
        closed: defects.filter(d => d.status === 'CLOSED').length
      }
    }
    setDefectCounts(counts)
  }

  // Lightweight refresh: only reload defect counts without reloading all surveys
  const refreshDefectCounts = async () => {
    const counts: Record<string, { open: number; closed: number }> = {}
    for (const survey of surveys) {
      const defects = await window.api.getSurveyDefects(survey.id)
      counts[survey.id] = {
        open: defects.filter(d => d.status === 'OPEN').length,
        closed: defects.filter(d => d.status === 'CLOSED').length
      }
    }
    setDefectCounts(counts)
  }

  const handleAddSurvey = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newDate || !newSurveyorId || !newType) return

    let surveyorId = newSurveyorId

    // If "new" surveyor selected, create it first
    if (newSurveyorId === 'new') {
      if (!newSurveyorCompany.trim() || !newSurveyorCountry.trim()) {
        showError('Please enter company name and country for new surveyor')
        return
      }
      const newSurveyor = await window.api.addSurveyor({
        companyName: newSurveyorCompany,
        country: newSurveyorCountry,
        contactPerson: newSurveyorContactPerson || undefined
      })
      surveyorId = newSurveyor.id
    }

    const newSurvey = await window.api.addConditionSurvey({
      vesselId: vessel.id,
      surveyDate: newDate,
      surveyorId,
      surveyType: newType,
      reference: newReference || undefined,
      location: newLocation || undefined,
      notes: newNotes || undefined,
      createdBy: user?.username || 'Unknown'
    })

    setEndorsementSurveyId(newSurvey.id)
    setNewDate('')
    setNewSurveyorId('')
    setNewType('')
    setNewReference('')
    setNewLocation('')
    setNewNotes('')
    setNewSurveyorCompany('')
    setNewSurveyorCountry('')
    setNewSurveyorContactPerson('')
    setShowNewSurveyorForm(false)
    setShowAddForm(false)
    loadData()
  }

  const handleEditSurvey = (survey: ConditionSurvey) => {
    setEditingSurveyId(survey.id)
    setEditDate(survey.surveyDate)
    setEditSurveyorId(survey.surveyorId)
    setEditType(survey.surveyType)
    setEditReference(survey.reference || '')
    setEditLocation(survey.location || '')
    setEditNotes(survey.notes || '')
    setExpandedSurveyId(survey.id)
  }

  const handleSaveEdit = async (surveyId: string) => {
    await window.api.updateConditionSurvey(surveyId, {
      surveyDate: editDate,
      surveyorId: editSurveyorId,
      surveyType: editType,
      reference: editReference || undefined,
      location: editLocation || undefined,
      notes: editNotes || undefined
    })
    setEditingSurveyId(null)
    loadData()
  }

  const handleCancelEdit = () => {
    setEditingSurveyId(null)
  }

  const handleDeleteSurvey = async (survey: ConditionSurvey) => {
    const defects = await window.api.getSurveyDefects(survey.id)
    const attachs = attachments.filter(a => a.surveyId === survey.id)
    const msg = defects.length > 0 || attachs.length > 0
      ? `Delete survey? This will also delete ${defects.length} defect(s) and ${attachs.length} attachment(s).`
      : 'Delete this survey?'

    setConfirmation({
      show: true,
      title: 'Delete Survey',
      message: msg,
      isDangerous: true,
      onConfirm: async () => {
        setConfirmation(prev => ({ ...prev, show: false }))
        await window.api.deleteConditionSurvey(survey.id)
        loadData()
      }
    })
  }

  const handleCloseSurvey = async (surveyId: string) => {
    if (!user) return
    await window.api.closeSurvey(surveyId, user.id)
    setClosingSurveyId(null)
    await loadData()
  }

  const handleEndorsementAnswer = async (surveyId: string, issued: boolean) => {
    await window.api.updateConditionSurveyEndorsement(surveyId, issued)
    setEndorsementSurveyId(null)
    await loadData()
  }

  const getSurveyorName = (surveyorId: string): string => {
    const surveyor = surveyors.find(s => s.id === surveyorId)
    return surveyor ? `${surveyor.companyName} (${surveyor.country})` : 'Unknown Surveyor'
  }

  const handleDragOver = (e: React.DragEvent, surveyId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy'
    }
    setDragOverSurveyId(surveyId)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSurveyId(null)
  }

  const handleDrop = async (e: React.DragEvent, surveyId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverSurveyId(null)

    const files = e.dataTransfer.files
    if (files.length === 0) return

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const filePath = window.api.getFilePath(file)

      if (!filePath) {
        console.error('Could not retrieve file path')
        continue
      }

      // Validate file type
      const validation = await window.api.fileTypesValidateFile(filePath)
      if (!validation.valid) {
        showError(`File rejected: ${validation.reason}`)
        continue
      }

      await window.api.addSurveyAttachment({
        surveyId,
        filePath,
        fileName: file.name,
        fileType: 'other',
        uploadedBy: user?.username || 'Unknown'
      })
    }

    loadData()
  }

  const handleDeleteAttachment = (attachmentId: string) => {
    setConfirmation({
      show: true,
      title: 'Delete Attachment',
      message: 'Delete this attachment?',
      isDangerous: true,
      onConfirm: async () => {
        setConfirmation(prev => ({ ...prev, show: false }))
        await window.api.deleteSurveyAttachment(attachmentId)
        loadData()
      }
    })
  }

  const handleOpenFile = async (filePath: string) => {
    const exists = await window.api.fsExists(filePath)
    if (!exists) {
      showError('File not found on disk')
      return
    }
    await window.api.fsOpen(filePath)
  }

  const handleImportDefectsFromWord = async (surveyId: string) => {
    const filePath = await window.api.dialogOpenFileWord()
    if (!filePath) return

    try {
      const result = await window.api.importDefectsFromWord(surveyId, filePath)
      if (result.success) {
        showSuccess(`Imported ${result.count} defects successfully!`)
        setDefectRefreshKey(k => k + 1)
        refreshDefectCounts()
      } else {
        showError(`Import failed: ${result.message}`)
      }
    } catch (error: any) {
      showError(`Import error: ${error.message}`)
    }
  }

  const exportSurveyHistory = async () => {
    const data = await window.api.getSurveyHistory(vessel.id)
    const rows = data.map(s => ({
      'Survey Date': s.surveyDate,
      'Surveyor': s.surveyorName,
      'Company': s.surveyorCompany || '',
      'Type': s.surveyType,
      'Location': s.location || '',
      'Total Defects': s.totalDefects,
      'Open': s.openDefects,
      'Closed': s.closedDefects
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Survey History')
    XLSX.writeFile(wb, `${vessel.name}_Survey_History.xlsx`)
  }

  const getSurveyAttachments = (surveyId: string) => {
    return attachments.filter(a => a.surveyId === surveyId)
  }

  return (
    <>
      <section className="fade-in" style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={24} />
            Condition Surveys
          </h3>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={exportSurveyHistory}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
            >
              <Download size={16} />
              Export History
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={showAddForm ? 'btn-secondary' : 'btn-primary'}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
            >
              {showAddForm ? <X size={16} /> : <Plus size={16} />}
              {showAddForm ? 'Cancel' : 'Add Survey'}
            </button>
          </div>
        </div>

        {showAddForm && (
          <form onSubmit={handleAddSurvey} style={{ marginBottom: '20px', padding: '20px', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Survey Date *</label>
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  required
                  min="1900-01-01"
                  max="2100-12-31"
                  aria-label="Survey date"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Survey Type *</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                  aria-label="Survey type"
                >
                  <option value="">-- Select Type --</option>
                  {surveyTypes.map(t => (
                    <option key={t.id} value={t.name}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Reference</label>
                <input
                  type="text"
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  placeholder="e.g. REF-2024-001"
                  aria-label="Survey reference"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Location</label>
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g. Singapore, Rotterdam"
                  aria-label="Survey location"
                />
              </div>
            </div>
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Surveyor *</label>
              <select
                value={newSurveyorId}
                onChange={(e) => {
                  setNewSurveyorId(e.target.value)
                  setShowNewSurveyorForm(e.target.value === 'new')
                }}
                required
                style={{ color: 'var(--text-primary)' }}
                aria-label="Surveyor"
              >
                <option value="">-- Select Surveyor --</option>
                {surveyors.map(s => (
                  <option key={s.id} value={s.id}>{s.companyName} ({s.country})</option>
                ))}
                <option value="new">+ Add New Surveyor</option>
              </select>
            </div>
            {showNewSurveyorForm && (
              <div style={{ padding: '15px', background: 'var(--bg-card)', borderRadius: '8px', marginBottom: '15px', border: '1px solid var(--input-border)' }}>
                <h4 style={{ marginTop: 0, marginBottom: '10px', color: 'var(--text-primary)' }}>New Surveyor Details</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Company Name *</label>
                    <input
                      type="text"
                      value={newSurveyorCompany}
                      onChange={(e) => setNewSurveyorCompany(e.target.value)}
                      required={newSurveyorId === 'new'}
                      style={{ width: '100%' }}
                      aria-label="Surveyor company name"
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Country *</label>
                    <input
                      type="text"
                      value={newSurveyorCountry}
                      onChange={(e) => setNewSurveyorCountry(e.target.value)}
                      required={newSurveyorId === 'new'}
                      style={{ width: '100%' }}
                      aria-label="Surveyor country"
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>Contact Person</label>
                  <input
                    type="text"
                    value={newSurveyorContactPerson}
                    onChange={(e) => setNewSurveyorContactPerson(e.target.value)}
                    placeholder="e.g., John Smith"
                    style={{ width: '100%' }}
                    aria-label="Surveyor contact person"
                  />
                </div>
              </div>
            )}
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Notes</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={3}
                style={{ resize: 'vertical', width: '100%' }}
                aria-label="Survey notes"
              />
            </div>
            <button type="submit" className="btn-primary">
              Add Survey
            </button>
          </form>
        )}

        {surveys.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No condition surveys recorded</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {surveys.map((survey) => {
              const isExpanded = expandedSurveyId === survey.id
              const isEditing = editingSurveyId === survey.id
              const counts = defectCounts[survey.id] || { open: 0, closed: 0 }
              const totalDefects = counts.open + counts.closed
              const surveyAttachments = getSurveyAttachments(survey.id)
              const isDragOver = dragOverSurveyId === survey.id
              const allClosed = counts.open === 0 && totalDefects > 0

              return (
                <div
                  key={survey.id}
                  style={{
                    borderRadius: '12px',
                    border: isDragOver ? '2px dashed var(--accent-primary)' : isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease',
                    background: 'var(--bg-card)'
                  }}
                >
                  {/* Survey Header */}
                  <div
                    style={{
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      cursor: isEditing ? 'default' : 'pointer',
                      background: isExpanded
                        ? isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'
                        : 'transparent',
                      transition: 'background 0.2s ease'
                    }}
                    onClick={() => !isEditing && setExpandedSurveyId(isExpanded ? null : survey.id)}
                  >
                    <div style={{ flex: 1 }}>
                      {/* Top row: Type + Date + Status badge */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{
                          fontWeight: '700',
                          fontSize: '1rem',
                          color: 'var(--text-primary)'
                        }}>
                          {survey.surveyType}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {survey.surveyDate}
                        </span>
                        {survey.reference && (
                          <span style={{
                            color: 'var(--text-secondary)',
                            padding: '2px 8px',
                            background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)',
                            borderRadius: '4px',
                            fontSize: '0.8rem',
                            fontFamily: 'monospace'
                          }}>
                            {survey.reference}
                          </span>
                        )}
                        {allClosed && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: isLight ? 'rgba(0, 140, 70, 0.1)' : 'rgba(0, 255, 136, 0.08)',
                            border: isLight ? '1px solid rgba(0, 140, 70, 0.3)' : '1px solid rgba(0, 255, 136, 0.2)',
                            color: isLight ? '#008c46' : '#00ff88',
                            fontSize: '0.7rem',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                          }}>
                            ALL CLOSED
                          </span>
                        )}
                      </div>
                      {/* Bottom row: Surveyor, Location, Counts */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        <span>{getSurveyorName(survey.surveyorId)}</span>
                        {survey.location && (
                          <>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>{survey.location}</span>
                          </>
                        )}
                        <span style={{ opacity: 0.3 }}>|</span>
                        <span style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {counts.open > 0 && (
                            <span style={{ color: isLight ? '#c00000' : '#ff6b6b', fontWeight: '600' }}>
                              {counts.open} open
                            </span>
                          )}
                          {counts.closed > 0 && (
                            <span style={{ color: isLight ? '#008c46' : '#00ff88', fontWeight: '500' }}>
                              {counts.closed} closed
                            </span>
                          )}
                          {totalDefects === 0 && <span>No defects</span>}
                        </span>
                        {surveyAttachments.length > 0 && (
                          <>
                            <span style={{ opacity: 0.3 }}>|</span>
                            <span>{surveyAttachments.length} file{surveyAttachments.length !== 1 ? 's' : ''}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: '12px' }}>
                      {isEditing ? (
                        <>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSaveEdit(survey.id) }}
                            className="btn-primary"
                            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                          >
                            <Save size={14} />
                            Save
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleCancelEdit() }}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {survey.completedAt && (
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: 'rgba(0,148,74,0.15)',
                              color: 'var(--success, #00944a)',
                              fontSize: 11,
                              fontWeight: 600,
                            }}>CLOSED</span>
                          )}
                          {!survey.completedAt && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setClosingSurveyId(survey.id) }}
                              style={{
                                padding: '5px 10px',
                                borderRadius: 6,
                                border: '1px solid var(--input-border)',
                                background: 'var(--input-bg)',
                                color: 'var(--text-primary)',
                                cursor: 'pointer',
                                fontSize: 12,
                              }}
                            >
                              Close Survey
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEditSurvey(survey) }}
                            className="btn-secondary"
                            style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteSurvey(survey) }}
                            style={{ padding: '6px 12px', background: 'transparent', color: 'var(--danger)', border: '1px solid var(--danger)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            title="Delete survey"
                          >
                            <Trash2 size={14} />
                          </button>
                          {isExpanded ? <ChevronUp size={18} color="var(--text-secondary)" /> : <ChevronDown size={18} color="var(--text-secondary)" />}
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: '20px', borderTop: isLight ? '1px solid rgba(0,0,0,0.06)' : '1px solid rgba(255,255,255,0.06)' }}>
                      {isEditing ? (
                        <div style={{ marginBottom: '20px', padding: '20px', background: 'var(--input-bg)', borderRadius: '12px', border: '1px solid var(--input-border)' }}>
                          <h4 style={{ color: 'var(--text-primary)', marginBottom: '15px', marginTop: 0 }}>Edit Survey Details</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr 1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                            <div>
                              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Survey Date *</label>
                              <input
                                type="date"
                                value={editDate}
                                onChange={(e) => setEditDate(e.target.value)}
                                required
                                min="1900-01-01"
                                max="2100-12-31"
                                aria-label="Edit survey date"
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Survey Type *</label>
                              <select
                                value={editType}
                                onChange={(e) => setEditType(e.target.value)}
                                required
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}
                                aria-label="Edit survey type"
                              >
                                <option value="">-- Select Type --</option>
                                {surveyTypes.map(t => (
                                  <option key={t.id} value={t.name}>{t.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Reference</label>
                              <input
                                type="text"
                                value={editReference}
                                onChange={(e) => setEditReference(e.target.value)}
                                aria-label="Edit survey reference"
                              />
                            </div>
                            <div>
                              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Location</label>
                              <input
                                type="text"
                                value={editLocation}
                                onChange={(e) => setEditLocation(e.target.value)}
                                aria-label="Edit survey location"
                              />
                            </div>
                          </div>
                          <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Surveyor *</label>
                            <select
                              value={editSurveyorId}
                              onChange={(e) => setEditSurveyorId(e.target.value)}
                              required
                              style={{ color: 'var(--text-primary)' }}
                              aria-label="Edit surveyor"
                            >
                              <option value="">-- Select Surveyor --</option>
                              {surveyors.map(s => (
                                <option key={s.id} value={s.id}>{s.companyName} ({s.country})</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px', fontWeight: '500' }}>Notes</label>
                            <textarea
                              value={editNotes}
                              onChange={(e) => setEditNotes(e.target.value)}
                              rows={3}
                              style={{ resize: 'vertical', width: '100%' }}
                              aria-label="Edit survey notes"
                            />
                          </div>
                        </div>
                      ) : (
                        survey.notes && (
                          <div style={{ marginBottom: '20px', padding: '12px 16px', background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)', borderRadius: '8px', borderLeft: '3px solid var(--accent-primary)' }}>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Notes</div>
                            <p style={{ color: 'var(--text-primary)', margin: 0, lineHeight: '1.6', fontSize: '0.9rem' }}>{survey.notes}</p>
                          </div>
                        )
                      )}

                      {/* File Attachments - Hidden when editing */}
                      {!isEditing && (
                        <SurveyAttachments
                          attachments={surveyAttachments}
                          isDragOver={isDragOver}
                          onDragOver={(e) => handleDragOver(e, survey.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, survey.id)}
                          onDelete={handleDeleteAttachment}
                          onOpenFile={handleOpenFile}
                          onImportWord={() => handleImportDefectsFromWord(survey.id)}
                        />
                      )}

                      {/* Defects Manager - Hidden when editing */}
                      {!isEditing && <DefectManager survey={survey} vessel={vessel} onUpdate={refreshDefectCounts} refreshKey={defectRefreshKey} />}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

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

      {/* Close Survey confirmation modal */}
      {closingSurveyId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: 12, padding: 28, maxWidth: 400, width: '90%' }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 16 }}>Close Survey</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 20px' }}>
              This will close the survey and all remaining open defects. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setClosingSurveyId(null)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleCloseSurvey(closingSurveyId)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent, #00aac8)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Close Survey</button>
            </div>
          </div>
        </div>
      )}

      {/* Endorsement question modal */}
      {endorsementSurveyId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: 12, padding: 28, maxWidth: 420, width: '90%' }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--text-primary)', fontSize: 16 }}>Reservations Endorsement</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '0 0 24px' }}>
              Did you issue a reservations endorsement for this survey?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setEndorsementSurveyId(null)} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Skip</button>
              <button onClick={() => handleEndorsementAnswer(endorsementSurveyId, false)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid rgba(255,77,77,0.35)', background: 'rgba(255,77,77,0.12)', color: 'var(--danger)', cursor: 'pointer', fontWeight: 600 }}>No — remind me in 2 days</button>
              <button onClick={() => handleEndorsementAnswer(endorsementSurveyId, true)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--accent, #00aac8)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>Yes</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function SurveyAttachments({
  attachments,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDelete,
  onOpenFile,
  onImportWord
}: {
  attachments: SurveyAttachment[]
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDelete: (id: string) => void
  onOpenFile: (path: string) => void
  onImportWord: () => void
}) {
  const [showUpload, setShowUpload] = useState(false)

  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h4 style={{ color: 'var(--text-primary)', margin: 0 }}>Attachments</h4>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--accent-primary)',
              color: 'white',
              border: 'none'
            }}
          >
            <Upload size={16} />
            {showUpload ? 'Hide Upload' : 'Upload Documents'}
          </button>
          <button
            onClick={onImportWord}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              fontSize: '14px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--accent-secondary)',
              color: 'var(--accent-secondary)'
            }}
          >
            <FileUp size={16} />
            Import Defects
          </button>
        </div>
      </div>

      {showUpload && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            border: '2px dashed var(--input-border)',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            background: isDragOver ? 'var(--bg-card-hover)' : 'var(--input-bg)',
            marginBottom: '15px',
            transition: 'all 0.2s ease'
          }}
        >
          <Upload size={32} color="var(--text-secondary)" style={{ margin: '0 auto 10px' }} />
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Drag and drop files here (multiple files supported)</p>
        </div>
      )}

      {attachments.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No attachments</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="glass-card"
              style={{
                padding: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <span
                onClick={() => onOpenFile(attachment.filePath)}
                style={{ color: 'var(--accent-primary)', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: '500' }}
                title={attachment.fileName}
              >
                {attachment.fileName}
              </span>
              <button
                onClick={() => onDelete(attachment.id)}
                style={{ padding: '6px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', marginLeft: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Delete attachment"
                aria-label="Delete attachment"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
