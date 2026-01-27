import { useState, useEffect } from 'react'
import { Plus, Edit, Trash2, Save, X, Search } from 'lucide-react'
import { Surveyor } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

export default function SurveyorDirectory() {
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [filteredSurveyors, setFilteredSurveyors] = useState<Surveyor[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [filterCountry, setFilterCountry] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'country'>('name')
  const [searchTerm, setSearchTerm] = useState('')
  const { showError, showSuccess } = useToast()

  // Form state
  const [formCompanyName, setFormCompanyName] = useState('')
  const [formCountry, setFormCountry] = useState('')
  const [formContactPerson, setFormContactPerson] = useState('')
  const [formContactDetails, setFormContactDetails] = useState('')
  const [formNotes, setFormNotes] = useState('')

  useEffect(() => {
    loadSurveyors()
  }, [])

  useEffect(() => {
    filterAndSortSurveyors()
  }, [surveyors, filterCountry, sortBy, searchTerm])

  const loadSurveyors = async () => {
    const data = await window.api.getSurveyors()
    setSurveyors(data)
  }

  const filterAndSortSurveyors = () => {
    let filtered = [...surveyors]

    // Filter by country
    if (filterCountry) {
      filtered = filtered.filter(s => s.country === filterCountry)
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(s =>
        s.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.contactDetails?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }

    // Sort
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return a.companyName.localeCompare(b.companyName)
      } else {
        return a.country.localeCompare(b.country) || a.companyName.localeCompare(b.companyName)
      }
    })

    setFilteredSurveyors(filtered)
  }

  const getUniqueCountries = () => {
    const countries = surveyors.map(s => s.country)
    return Array.from(new Set(countries)).sort()
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formCompanyName.trim() || !formCountry.trim()) return

    setIsAdding(true)
    try {
      await window.api.addSurveyor({
        companyName: formCompanyName,
        country: formCountry,
        contactPerson: formContactPerson || undefined,
        contactDetails: formContactDetails || undefined,
        notes: formNotes || undefined
      })

      resetForm()
      setShowAddForm(false)
      showSuccess('Surveyor added successfully')
      loadSurveyors()
    } catch (error: any) {
      showError(error.message || 'Failed to add surveyor. Please try again.')
    } finally {
      setIsAdding(false)
    }
  }

  const handleEdit = (surveyor: Surveyor) => {
    setEditingId(surveyor.id)
    setFormCompanyName(surveyor.companyName)
    setFormCountry(surveyor.country)
    setFormContactPerson(surveyor.contactPerson || '')
    setFormContactDetails(surveyor.contactDetails || '')
    setFormNotes(surveyor.notes || '')
  }

  const handleSaveEdit = async (id: string) => {
    if (!formCompanyName.trim() || !formCountry.trim()) return

    try {
      await window.api.updateSurveyor(id, {
        companyName: formCompanyName,
        country: formCountry,
        contactPerson: formContactPerson || undefined,
        contactDetails: formContactDetails || undefined,
        notes: formNotes || undefined
      })

      resetForm()
      setEditingId(null)
      showSuccess('Surveyor updated successfully')
      loadSurveyors()
    } catch (error: any) {
      showError(error.message || 'Failed to update surveyor. Please try again.')
    }
  }

  const handleDelete = async (surveyor: Surveyor) => {
    if (confirm(`Delete ${surveyor.companyName}? This will fail if they are referenced in any surveys.`)) {
      try {
        await window.api.deleteSurveyor(surveyor.id)
        showSuccess('Surveyor deleted successfully')
        loadSurveyors()
      } catch (error: any) {
        showError(error.message || 'Cannot delete surveyor: They are referenced in existing surveys.')
      }
    }
  }

  const resetForm = () => {
    setFormCompanyName('')
    setFormCountry('')
    setFormContactPerson('')
    setFormContactDetails('')
    setFormNotes('')
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    resetForm()
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ color: 'var(--text-primary)', marginBottom: '10px' }}>Surveyor Directory</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Manage surveying companies and contacts</p>
      </div>

      {/* Filters and Controls */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '15px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search surveyors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ paddingLeft: '40px', width: '100%' }}
            />
          </div>

          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            style={{ color: 'var(--text-primary)' }}
          >
            <option value="">All Countries</option>
            {getUniqueCountries().map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ color: 'var(--text-primary)' }}
          >
            <option value="name">Sort by Name</option>
            <option value="country">Sort by Country</option>
          </select>

          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={showAddForm ? 'btn-secondary' : 'btn-primary'}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
          >
            {showAddForm ? <X size={18} /> : <Plus size={18} />}
            {showAddForm ? 'Cancel' : 'Add Surveyor'}
          </button>
        </div>
      </div>

      {/* Add Form */}
      {showAddForm && (
        <form onSubmit={handleAdd} className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)' }}>Add New Surveyor</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                Company Name *
              </label>
              <input
                type="text"
                value={formCompanyName}
                onChange={(e) => setFormCompanyName(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                Country *
              </label>
              <input
                type="text"
                value={formCountry}
                onChange={(e) => setFormCountry(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Contact Person
            </label>
            <input
              type="text"
              value={formContactPerson}
              onChange={(e) => setFormContactPerson(e.target.value)}
              placeholder="e.g., John Smith"
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Contact Details
            </label>
            <textarea
              value={formContactDetails}
              onChange={(e) => setFormContactDetails(e.target.value)}
              rows={3}
              placeholder="Phone, email, address, etc."
              style={{ resize: 'vertical', width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
              Notes
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              placeholder="Additional notes..."
              style={{ resize: 'vertical', width: '100%' }}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isAdding}>
            {isAdding ? 'Adding...' : 'Add Surveyor'}
          </button>
        </form>
      )}

      {/* Surveyors List */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)' }}>
          Surveyors ({filteredSurveyors.length})
        </h3>

        {filteredSurveyors.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No surveyors found. Add one to get started.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {filteredSurveyors.map((surveyor) => {
              const isEditing = editingId === surveyor.id

              if (isEditing) {
                return (
                  <div key={surveyor.id} className="glass-card" style={{ padding: '20px', background: 'var(--input-bg)' }}>
                    <h4 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)' }}>Edit Surveyor</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                          Company Name *
                        </label>
                        <input
                          type="text"
                          value={formCompanyName}
                          onChange={(e) => setFormCompanyName(e.target.value)}
                          required
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                          Country *
                        </label>
                        <input
                          type="text"
                          value={formCountry}
                          onChange={(e) => setFormCountry(e.target.value)}
                          required
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Contact Person
                      </label>
                      <input
                        type="text"
                        value={formContactPerson}
                        onChange={(e) => setFormContactPerson(e.target.value)}
                        placeholder="e.g., John Smith"
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Contact Details
                      </label>
                      <textarea
                        value={formContactDetails}
                        onChange={(e) => setFormContactDetails(e.target.value)}
                        rows={3}
                        style={{ resize: 'vertical', width: '100%' }}
                      />
                    </div>
                    <div style={{ marginBottom: '15px' }}>
                      <label style={{ display: 'block', marginBottom: '5px', color: 'var(--text-secondary)', fontSize: '14px' }}>
                        Notes
                      </label>
                      <textarea
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        rows={2}
                        style={{ resize: 'vertical', width: '100%' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => handleSaveEdit(surveyor.id)}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Save size={16} />
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="btn-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={surveyor.id} className="glass-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <h4 style={{ marginTop: 0, marginBottom: '8px', color: 'var(--text-primary)' }}>
                        {surveyor.companyName}
                      </h4>
                      <div style={{ display: 'flex', gap: '15px', marginBottom: '10px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                          <strong>Country:</strong> {surveyor.country}
                        </span>
                        {surveyor.contactPerson && (
                          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            <strong>Contact Person:</strong> {surveyor.contactPerson}
                          </span>
                        )}
                      </div>
                      {surveyor.contactDetails && (
                        <div style={{ marginBottom: '10px' }}>
                          <strong style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Contact Details:</strong>
                          <p style={{ margin: '5px 0', color: 'var(--text-primary)', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                            {surveyor.contactDetails}
                          </p>
                        </div>
                      )}
                      {surveyor.notes && (
                        <div>
                          <strong style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Notes:</strong>
                          <p style={{ margin: '5px 0', color: 'var(--text-primary)', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
                            {surveyor.notes}
                          </p>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginLeft: '20px' }}>
                      <button
                        onClick={() => handleEdit(surveyor)}
                        style={{ padding: '8px 16px', background: 'var(--primary-color)', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
                      >
                        <Edit size={16} />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(surveyor)}
                        style={{ padding: '8px 16px', background: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600' }}
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
