import { useState, useEffect } from 'react'
import { Trash2, Plus, X, CheckCircle, AlertCircle, Edit, Save, ChevronDown, ChevronUp } from 'lucide-react'
import { SurveyDefect, ConditionSurvey } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'

interface DefectManagerProps {
  survey: ConditionSurvey
  onUpdate: () => void
}

export default function DefectManager({ survey, onUpdate }: DefectManagerProps) {
  const { user } = useAuth()
  const [defects, setDefects] = useState<SurveyDefect[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [closeModalDefect, setCloseModalDefect] = useState<SurveyDefect | null>(null)
  const [closureNotes, setClosureNotes] = useState('')
  const [editingDefectId, setEditingDefectId] = useState<string | null>(null)
  const [expandedClosureIds, setExpandedClosureIds] = useState<Set<string>>(new Set())

  // New defect form
  const [newNumber, setNewNumber] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newSeverity, setNewSeverity] = useState<'Critical' | 'Major' | 'Minor' | 'Observation' | ''>('')
  const [newDueDate, setNewDueDate] = useState('')

  // Edit defect form
  const [editNumber, setEditNumber] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editSeverity, setEditSeverity] = useState<'Critical' | 'Major' | 'Minor' | 'Observation' | ''>('')
  const [editDueDate, setEditDueDate] = useState('')

  useEffect(() => {
    loadDefects()
  }, [survey.id])

  const loadDefects = async () => {
    const data = await window.api.getSurveyDefects(survey.id)
    setDefects(data)
  }

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
      dueDate: newDueDate || undefined
    })

    setNewNumber('')
    setNewDescription('')
    setNewSeverity('')
    setNewDueDate('')
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
  }

  const handleSaveEdit = async (defectId: string) => {
    if (!editDescription.trim() || !editNumber.trim()) return

    await window.api.updateSurveyDefect(defectId, {
      defectNumber: editNumber,
      description: editDescription,
      severity: editSeverity ? (editSeverity as 'Critical' | 'Major' | 'Minor' | 'Observation') : undefined,
      dueDate: editDueDate || undefined
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

  const handleReopenDefect = async (defect: SurveyDefect) => {
    if (confirm('Reopen this defect?')) {
      await window.api.reopenDefect(defect.id)
      loadDefects()
      onUpdate()
    }
  }

  const handleDeleteDefect = async (defect: SurveyDefect) => {
    if (confirm(`Delete defect #${defect.defectNumber}?`)) {
      await window.api.deleteSurveyDefect(defect.id)
      loadDefects()
      onUpdate()
    }
  }

  const toggleClosureNotes = (defectId: string) => {
    setExpandedClosureIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(defectId)) {
        newSet.delete(defectId)
      } else {
        newSet.add(defectId)
      }
      return newSet
    })
  }

  const getSeverityStyle = (severity?: string) => {
    switch (severity) {
      case 'Critical': return { bg: '#ff4d4d', color: '#fff' }
      case 'Major': return { bg: '#ff8c00', color: '#fff' }
      case 'Minor': return { bg: '#ffcc00', color: '#000' }
      case 'Observation': return { bg: '#00d2ff', color: '#000' }
      case '':
      case undefined:
      case null:
        return { bg: 'var(--input-bg)', color: 'var(--text-secondary)', border: '1px dashed var(--input-border)' }
      default: return { bg: 'var(--text-secondary)', color: '#fff' }
    }
  }

  const truncate = (text: string, maxLen: number) => {
    return text.length > maxLen ? text.substring(0, maxLen) + '...' : text
  }

  return (
    <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: 'var(--glass-border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h4 style={{ margin: 0, color: 'var(--text-primary)' }}>Defects</h4>
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
      </div>

      {showAddForm && (
        <form onSubmit={handleAddDefect} style={{ marginBottom: '20px', padding: '15px', background: 'var(--input-bg)', borderRadius: '8px', border: '1px solid var(--input-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
            <input
              type="text"
              placeholder="Number (auto)"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
            />
            <textarea
              placeholder="Description *"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              required
              rows={2}
              style={{ resize: 'vertical' }}
            />
            <select
              value={newSeverity}
              onChange={(e) => setNewSeverity(e.target.value as any)}
              style={{ color: 'var(--text-primary)' }}
            >
              <option value="">Not Set</option>
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
            />
          </div>
          <button type="submit" className="btn-primary">
            Add Defect
          </button>
        </form>
      )}

      {defects.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No defects recorded</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Number</th>
                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Description</th>
                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Severity</th>
                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Due Date</th>
                <th style={{ textAlign: 'center', padding: '12px', color: 'var(--text-secondary)', fontWeight: '600' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {defects.map((defect) => {
                const isEditing = editingDefectId === defect.id
                const severityStyle = getSeverityStyle(defect.severity)

                if (isEditing) {
                  return (
                    <tr key={defect.id} style={{ borderBottom: '1px solid var(--table-border)', background: 'var(--input-bg)' }}>
                      <td colSpan={6} style={{ padding: '12px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 3fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                          <input
                            type="text"
                            placeholder="Number"
                            value={editNumber}
                            onChange={(e) => setEditNumber(e.target.value)}
                            required
                          />
                          <textarea
                            placeholder="Description"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            required
                            rows={2}
                            style={{ resize: 'vertical' }}
                          />
                          <select
                            value={editSeverity}
                            onChange={(e) => setEditSeverity(e.target.value as any)}
                            style={{ color: 'var(--text-primary)' }}
                          >
                            <option value="">Not Set</option>
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
                          />
                        </div>
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
                      </td>
                    </tr>
                  )
                }

                return (
                  <>
                    <tr key={defect.id} style={{ borderBottom: defect.status === 'CLOSED' && (defect.closureNotes || defect.closedBy) ? 'none' : '1px solid var(--table-border)' }}>
                      <td style={{ padding: '12px', color: 'var(--text-primary)', fontWeight: 'bold' }}>{defect.defectNumber}</td>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{truncate(defect.description, 80)}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: '6px', background: severityStyle.bg, color: severityStyle.color, fontSize: '12px', fontWeight: 'bold', display: 'inline-block', border: severityStyle.border }}>
                          {defect.severity || 'Not Set'}
                        </span>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: defect.status === 'OPEN' ? 'var(--warning)' : 'var(--success)' }}>
                          {defect.status === 'OPEN' ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                          {defect.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--text-primary)' }}>{defect.dueDate || 'N/A'}</td>
                      <td style={{ padding: '12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            onClick={() => handleEditDefect(defect)}
                            style={{ padding: '6px 12px', background: 'var(--primary-color)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                            title="Edit defect"
                          >
                            <Edit size={14} />
                            Edit
                          </button>
                          {defect.status === 'OPEN' ? (
                            <button
                              onClick={() => setCloseModalDefect(defect)}
                              style={{ padding: '6px 12px', background: 'var(--success)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                              title="Close defect"
                            >
                              Close
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={() => handleReopenDefect(defect)}
                                style={{ padding: '6px 12px', background: 'var(--warning)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                                title="Reopen defect"
                              >
                                Reopen
                              </button>
                              {(defect.closureNotes || defect.closedBy || defect.closedAt) && (
                                <button
                                  onClick={() => toggleClosureNotes(defect.id)}
                                  style={{ padding: '6px 12px', background: 'var(--primary-color)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600' }}
                                  title="View closure details"
                                >
                                  {expandedClosureIds.has(defect.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                  Notes
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteDefect(defect)}
                            style={{ padding: '6px 12px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Delete defect"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {defect.status === 'CLOSED' && expandedClosureIds.has(defect.id) && (defect.closureNotes || defect.closedBy || defect.closedAt) && (
                      <tr key={`${defect.id}-closure`} style={{ borderBottom: '1px solid var(--table-border)', background: 'rgba(0, 255, 136, 0.05)' }}>
                        <td colSpan={6} style={{ padding: '12px', fontSize: '13px' }}>
                          <div style={{ display: 'flex', gap: '20px', color: 'var(--text-secondary)' }}>
                            {defect.closedAt && (
                              <div>
                                <strong style={{ color: 'var(--text-primary)' }}>Closed:</strong> {new Date(defect.closedAt).toLocaleDateString()}
                              </div>
                            )}
                            {defect.closedBy && (
                              <div>
                                <strong style={{ color: 'var(--text-primary)' }}>By:</strong> {defect.closedBy}
                              </div>
                            )}
                          </div>
                          {defect.closureNotes && (
                            <div style={{ marginTop: '8px' }}>
                              <strong style={{ color: 'var(--text-primary)' }}>Closure Notes:</strong>
                              <div style={{ marginTop: '4px', padding: '8px', background: 'var(--input-bg)', borderRadius: '6px', color: 'var(--text-primary)' }}>
                                {defect.closureNotes}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Close Modal */}
      {closeModalDefect && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div className="glass-card" style={{ padding: '30px', width: '500px', maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0, color: 'var(--text-primary)' }}>Close Defect #{closeModalDefect.defectNumber}</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '15px' }}>Add optional closure notes:</p>
            <textarea
              value={closureNotes}
              onChange={(e) => setClosureNotes(e.target.value)}
              placeholder="Closure notes (optional)"
              rows={4}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setCloseModalDefect(null); setClosureNotes('') }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseDefect}
                className="btn-primary"
              >
                Close Defect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
