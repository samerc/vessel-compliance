import { useState, useEffect } from 'react'
import {
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react'
import { Surveyor, SurveyorQueryParams } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

function useDebounceValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

export default function SurveyorDirectory() {
  const [surveyors, setSurveyors] = useState<Surveyor[]>([])
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [filterCountry, setFilterCountry] = useState('all')
  const [sortBy, setSortBy] = useState<'name' | 'country'>('name')
  const [searchTerm, setSearchTerm] = useState('')
  const { showError, showSuccess } = useToast()

  // Pagination state
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [isLoading, setIsLoading] = useState(false)

  // All countries for dropdown
  const [allCountries, setAllCountries] = useState<string[]>([])

  const debouncedSearch = useDebounceValue(searchTerm, 500)

  // Form state
  const [formCompanyName, setFormCompanyName] = useState('')
  const [formCountry, setFormCountry] = useState('')
  const [formContactPerson, setFormContactPerson] = useState('')
  const [formContactDetails, setFormContactDetails] = useState('')
  const [formNotes, setFormNotes] = useState('')

  // Load all countries on mount
  useEffect(() => {
    window.api.getSurveyors().then((all) => {
      setAllCountries([...new Set(all.map((s) => s.country).filter(Boolean))].sort())
    })
  }, [])

  // Load surveyors when pagination/filter params change
  useEffect(() => {
    loadSurveyors()
  }, [page, limit, debouncedSearch, filterCountry, sortBy])

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, filterCountry, sortBy, limit])

  const loadSurveyors = async () => {
    setIsLoading(true)
    try {
      const params: SurveyorQueryParams = {
        page,
        limit,
        search: debouncedSearch || undefined,
        country: filterCountry !== 'all' ? filterCountry : undefined,
        sortField: sortBy === 'name' ? 'companyName' : 'country',
        sortOrder: 'asc'
      }
      const result = await window.api.getSurveyorsPaginated(params)
      setSurveyors(result.data)
      setTotal(result.total)
      setTotalPages(result.totalPages)
    } catch (error: any) {
      showError(error.message || 'Failed to load surveyors')
    } finally {
      setIsLoading(false)
    }
  }

  const reloadCountries = () => {
    window.api.getSurveyors().then((all) => {
      setAllCountries([...new Set(all.map((s) => s.country).filter(Boolean))].sort())
    })
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
      reloadCountries()
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
      reloadCountries()
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
        reloadCountries()
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
              aria-label="Search surveyors"
            />
          </div>

          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            style={{ color: 'var(--text-primary)' }}
            aria-label="Filter by country"
          >
            <option value="all">All Countries</option>
            {allCountries.map(country => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            style={{ color: 'var(--text-primary)' }}
            aria-label="Sort surveyors by"
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
                aria-label="Company name"
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
                aria-label="Country"
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
              aria-label="Contact person"
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
              aria-label="Contact details"
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
              aria-label="Notes"
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
          Surveyors ({total})
        </h3>

        {surveyors.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            No surveyors found. Add one to get started.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: '15px' }}>
            {surveyors.map((surveyor) => {
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
                          aria-label="Company name"
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
                          aria-label="Country"
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
                        aria-label="Contact person"
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
                        aria-label="Contact details"
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
                        aria-label="Notes"
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

        {/* Pagination Controls */}
        {!isLoading && totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--table-border)' }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
              Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total} surveyors
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(1)} style={{ padding: '6px' }} aria-label="First page"><ChevronsLeft size={16} /></button>
              <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} style={{ padding: '6px' }} aria-label="Previous page"><ChevronLeft size={16} /></button>
              <span style={{ margin: '0 8px', fontSize: '0.9rem' }}>Page {page} of {totalPages}</span>
              <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} style={{ padding: '6px' }} aria-label="Next page"><ChevronRight size={16} /></button>
              <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(totalPages)} style={{ padding: '6px' }} aria-label="Last page"><ChevronsRight size={16} /></button>
              <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} style={{ marginLeft: '16px', padding: '4px', borderRadius: '4px', fontSize: '0.9rem' }} aria-label="Surveyors per page">
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
                <option value="100">100 / page</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
