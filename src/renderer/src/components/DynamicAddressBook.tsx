import { useState, useEffect, useMemo } from 'react'
import { Search, Copy, Mail, Phone, BookOpen, Users, Building2, User, ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { PolicyType, FlagState, DABQueryCriteria } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'

type PolicyFilter = 'all' | 'undefined' | string[]

// Chip used in the filter sidebar
function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: '14px',
        fontSize: '0.78rem',
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: selected ? 'rgba(0, 210, 255, 0.12)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        lineHeight: '1.4',
      }}
    >
      {label}
    </button>
  )
}

// Filter section with a label
function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--table-border)' }}>
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        marginBottom: '10px',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// Collapsible filter section for long lists (flag states, policy types)
function CollapsibleFilter({ label, children, defaultCollapsed = false }: { label: string; children: React.ReactNode; defaultCollapsed?: boolean }) {
  const [open, setOpen] = useState(!defaultCollapsed)
  return (
    <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--table-border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', marginBottom: open ? '10px' : 0,
        }}
      >
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
        }}>
          {label}
        </span>
        {open
          ? <ChevronDown size={13} color="var(--text-secondary)" />
          : <ChevronRight size={13} color="var(--text-secondary)" />}
      </button>
      {open && children}
    </div>
  )
}

export default function DynamicAddressBook() {
  const { showSuccess, showError } = useToast()

  const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
  const [flagStates, setFlagStates] = useState<FlagState[]>([])
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  // Query criteria
  const [logic, setLogic] = useState<'AND' | 'OR'>('AND')
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>([])
  const [selectedFlagStates, setSelectedFlagStates] = useState<string[]>([])
  const [flagUnassigned, setFlagUnassigned] = useState(false)
  const [customerType, setCustomerType] = useState<'broker' | 'direct' | 'both'>('both')
  const [exportType, setExportType] = useState<'email' | 'phone' | 'both' | 'all'>('email')
  const [flagDropdownOpen, setFlagDropdownOpen] = useState(false)
  const [flagSearch, setFlagSearch] = useState('')
  const [vesselStatus, setVesselStatus] = useState<'active' | 'inactive' | 'all'>('active')
  const [contactMode, setContactMode] = useState<'all' | 'customers'>('all')

  useEffect(() => {
    loadFilterData()
  }, [])

  const loadFilterData = async () => {
    const [pt, fs] = await Promise.all([window.api.getPolicyTypes(), window.api.getFlagStates()])
    setPolicyTypes(Array.isArray(pt) ? pt : [])
    setFlagStates(Array.isArray(fs) ? fs : [])
  }

  const selectedPolicyTypeIds = useMemo(() => {
    if (policyFilter === 'all') return policyTypes.map(p => p.id)
    if (policyFilter === 'undefined') return []
    return policyFilter
  }, [policyFilter, policyTypes])

  const hasAnyCriteria =
    policyFilter === 'all' ||
    policyFilter === 'undefined' ||
    (Array.isArray(policyFilter) && policyFilter.length > 0) ||
    selectedFlagStates.length > 0 ||
    flagUnassigned ||
    customerType !== 'both'

  const handleSearch = async () => {
    if (!hasAnyCriteria) {
      showError('Please select at least one filter criteria')
      return
    }
    setLoading(true)
    setHasSearched(true)
    try {
      // "All" selections mean "don't filter" — only send IDs when a subset is selected
      const allFlagsSelected = selectedFlagStates.length === flagStates.length && flagStates.length > 0
      const allPoliciesSelected = policyFilter === 'all'
      const criteria: DABQueryCriteria = {
        logic,
        exportType,
        policyTypeIds: !allPoliciesSelected && selectedPolicyTypeIds.length > 0 ? selectedPolicyTypeIds : undefined,
        flagStateIds: !allFlagsSelected && selectedFlagStates.length > 0 ? selectedFlagStates : undefined,
        flagStateUnassigned: flagUnassigned || undefined,
        customerIds: undefined,
        customerType: customerType !== 'both' ? customerType : undefined,
        vesselStatus,
      }
      const data = await window.api.queryDAB(criteria)
      setResults(data)
    } catch (err: any) {
      showError(err.message || 'Failed to query address book')
    } finally {
      setLoading(false)
    }
  }

  const filteredResults = useMemo(() => {
    return results.filter(r => {
      if (exportType === 'email' && !r.email) return false
      if (exportType === 'phone' && !r.phone) return false
      if (exportType === 'both' && !r.email && !r.phone) return false
      if (contactMode === 'customers' && !r.isCustomer && !r.isBroker) return false
      return true
    })
  }, [results, exportType, contactMode])

  const handleCopyToClipboard = () => {
    const lines = filteredResults
      .map(r => {
        if (exportType === 'email') return r.email
        if (exportType === 'phone') return r.phone
        return [r.email, r.phone].filter(Boolean).join(', ')
      })
      .filter(Boolean)
    if (lines.length === 0) { showError('No contacts to copy'); return }
    navigator.clipboard.writeText(lines.join('\n'))
    showSuccess(`Copied ${lines.length} contacts to clipboard`)
  }

  const handleCopyForOutlook = () => {
    const emails = filteredResults.map(r => r.email).filter(Boolean)
    if (emails.length === 0) { showError('No emails to copy'); return }
    navigator.clipboard.writeText(emails.join('; '))
    showSuccess(`Copied ${emails.length} emails for Outlook`)
  }

  const togglePolicyType = (id: string) => {
    if (policyFilter === 'all' || policyFilter === 'undefined') {
      setPolicyFilter([id])
    } else {
      const cur = policyFilter as string[]
      setPolicyFilter(cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
    }
  }

  const isPolicySelected = (id: string) => {
    if (policyFilter === 'all') return true
    if (policyFilter === 'undefined') return false
    return (policyFilter as string[]).includes(id)
  }

  const toggleFlag = (id: string) =>
    setSelectedFlagStates(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  return (
    <div className="fade-in" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>

      {/* ── Left Sidebar: Filters ─────────────────────────────────── */}
      <aside style={{
        width: '270px',
        flexShrink: 0,
        background: 'var(--bg-card)',
        borderRadius: '14px',
        border: '1px solid var(--table-border)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        position: 'sticky',
        top: '20px',
      }}>
        {/* Sidebar header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '16px', borderBottom: '1px solid var(--table-border)' }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Search size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Filter</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Build your query</div>
          </div>
        </div>

        {/* Logic */}
        <FilterSection label="Match Logic">
          <div style={{ display: 'flex', gap: '6px' }}>
            <Chip label="AND (all)" selected={logic === 'AND'} onClick={() => setLogic('AND')} />
            <Chip label="OR (any)" selected={logic === 'OR'} onClick={() => setLogic('OR')} />
          </div>
        </FilterSection>

        {/* Contact scope */}
        <FilterSection label="Contact Scope">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <Chip label="All Entities" selected={contactMode === 'all'} onClick={() => setContactMode('all')} />
            <Chip label="Customers / Brokers" selected={contactMode === 'customers'} onClick={() => setContactMode('customers')} />
          </div>
        </FilterSection>

        {/* Policy types */}
        {policyTypes.length > 0 && (
          <CollapsibleFilter label="Policy Types">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              <Chip label="All" selected={policyFilter === 'all'} onClick={() => setPolicyFilter(policyFilter === 'all' ? [] : 'all')} />
              <Chip label="None" selected={policyFilter === 'undefined'} onClick={() => setPolicyFilter(policyFilter === 'undefined' ? [] : 'undefined')} />
              {policyTypes.map(pt => (
                <Chip key={pt.id} label={pt.name} selected={isPolicySelected(pt.id)} onClick={() => togglePolicyType(pt.id)} />
              ))}
            </div>
          </CollapsibleFilter>
        )}

        {/* Flag states */}
        {flagStates.length > 0 && (
          <FilterSection label="Flag States">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
              <Chip label="All" selected={selectedFlagStates.length === 0 && !flagUnassigned} onClick={() => { setSelectedFlagStates([]); setFlagUnassigned(false) }} />
              <Chip label="None" selected={selectedFlagStates.length === 0 && flagUnassigned} onClick={() => { setSelectedFlagStates([]); setFlagUnassigned(true) }} />
              <Chip label="Unassigned" selected={flagUnassigned && selectedFlagStates.length > 0} onClick={() => setFlagUnassigned(v => !v)} />
            </div>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setFlagDropdownOpen(v => !v)}
                style={{
                  width: '100%', padding: '6px 10px', borderRadius: '6px',
                  border: '1px solid var(--input-border)', background: 'var(--bg-primary)',
                  color: 'var(--text-primary)', fontSize: '0.78rem', textAlign: 'left',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedFlagStates.length === 0 ? 'Select flag states...' : `${selectedFlagStates.length} selected`}
                </span>
                <ChevronDown size={13} style={{ flexShrink: 0, transform: flagDropdownOpen ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
              </button>
              {flagDropdownOpen && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: 'var(--bg-primary)', border: '1px solid var(--input-border)',
                  borderRadius: '6px', marginTop: '2px', maxHeight: '200px', overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                }}>
                  <div style={{ padding: '6px', borderBottom: '1px solid var(--table-border)', position: 'sticky', top: 0, background: 'var(--bg-primary)' }}>
                    <input
                      placeholder="Search..."
                      value={flagSearch}
                      onChange={e => setFlagSearch(e.target.value)}
                      autoFocus
                      style={{ width: '100%', padding: '4px 8px', fontSize: '0.78rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                    />
                  </div>
                  {flagStates.filter(fs => !flagSearch || fs.name.toLowerCase().includes(flagSearch.toLowerCase())).map(fs => (
                    <label key={fs.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={selectedFlagStates.includes(fs.id)}
                        onChange={() => toggleFlag(fs.id)}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      {fs.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </FilterSection>
        )}

        {/* Vessel status */}
        <FilterSection label="Vessel Status">
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['active', 'inactive', 'all'] as const).map(s => (
              <Chip key={s} label={s.charAt(0).toUpperCase() + s.slice(1)} selected={vesselStatus === s} onClick={() => setVesselStatus(s)} />
            ))}
          </div>
        </FilterSection>

        {/* Customer type */}
        <FilterSection label="Customer Type">
          <div style={{ display: 'flex', gap: '6px' }}>
            <Chip label="All" selected={customerType === 'both'} onClick={() => setCustomerType('both')} />
            <Chip label="Broker" selected={customerType === 'broker'} onClick={() => setCustomerType('broker')} />
            <Chip label="Direct" selected={customerType === 'direct'} onClick={() => setCustomerType('direct')} />
          </div>
        </FilterSection>

        {/* Export */}
        <FilterSection label="Export Fields">
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <Chip label="All" selected={exportType === 'all'} onClick={() => setExportType('all')} />
            <Chip label="Email" selected={exportType === 'email'} onClick={() => setExportType('email')} />
            <Chip label="Phone" selected={exportType === 'phone'} onClick={() => setExportType('phone')} />
            <Chip label="Both" selected={exportType === 'both'} onClick={() => setExportType('both')} />
          </div>
        </FilterSection>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={!hasAnyCriteria || loading}
          className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', marginTop: '4px' }}
        >
          {loading ? <Loader2 size={16} className="spinner" /> : <Search size={16} />}
          {loading ? 'Searching…' : 'Run Query'}
        </button>
      </aside>

      {/* ── Right Panel: Results ─────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Results card */}
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Card header */}
          <div style={{
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--table-border)',
            flexWrap: 'wrap',
            gap: '10px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <BookOpen size={18} color="var(--accent-primary)" />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                Address Book
              </span>
              {hasSearched && (
                <span style={{
                  padding: '2px 10px',
                  borderRadius: '10px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: 'rgba(0, 210, 255, 0.12)',
                  color: 'var(--accent-primary)',
                  border: '1px solid rgba(0, 210, 255, 0.2)',
                }}>
                  {filteredResults.length} contact{filteredResults.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {hasSearched && filteredResults.length > 0 && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleCopyForOutlook}
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.82rem' }}
                >
                  <Mail size={14} /> Copy for Outlook
                </button>
                <button
                  onClick={handleCopyToClipboard}
                  className="btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', fontSize: '0.82rem' }}
                >
                  <Copy size={14} /> Copy to Clipboard
                </button>
              </div>
            )}
          </div>

          {/* Table / empty state */}
          {!hasSearched ? (
            <div style={{ padding: '72px 40px', textAlign: 'center' }}>
              <Users size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.25 }} />
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                No query run yet
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                Select filters on the left, then click <strong>Run Query</strong> to find contacts.
              </p>
            </div>
          ) : loading ? (
            <div style={{ padding: '72px 40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <Loader2 size={32} className="spinner" style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ margin: 0 }}>Searching…</p>
            </div>
          ) : filteredResults.length === 0 ? (
            <div style={{ padding: '72px 40px', textAlign: 'center' }}>
              <Search size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.25 }} />
              <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                No contacts found
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                Try adjusting your filter criteria.
              </p>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600,
                      color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
                      borderBottom: '1px solid var(--table-border)', whiteSpace: 'nowrap',
                    }}>
                      Name
                    </th>
                    <th style={{
                      padding: '12px 12px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600,
                      color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
                      borderBottom: '1px solid var(--table-border)', whiteSpace: 'nowrap',
                    }}>
                      Type
                    </th>
                    {contactMode === 'customers' && (
                      <th style={{
                        padding: '12px 12px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600,
                        color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
                        borderBottom: '1px solid var(--table-border)',
                      }}>
                        Role
                      </th>
                    )}
                    {(exportType === 'email' || exportType === 'both') && (
                      <th style={{
                        padding: '12px 12px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600,
                        color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
                        borderBottom: '1px solid var(--table-border)',
                      }}>
                        Email
                      </th>
                    )}
                    {(exportType === 'phone' || exportType === 'both') && (
                      <th style={{
                        padding: '12px 12px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600,
                        color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
                        borderBottom: '1px solid var(--table-border)',
                      }}>
                        Phone
                      </th>
                    )}
                    <th style={{
                      padding: '12px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 600,
                      color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
                      borderBottom: '1px solid var(--table-border)',
                    }}>
                      Associated Vessels
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r, idx) => (
                    <tr
                      key={r.entityId}
                      style={{
                        borderBottom: '1px solid var(--table-border)',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                      }}
                      className="hover-effect"
                    >
                      {/* Name */}
                      <td style={{ padding: '11px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {r.entityType === 'company'
                            ? <Building2 size={14} color="var(--accent-primary)" style={{ flexShrink: 0, opacity: 0.7 }} />
                            : <User size={14} color="#c084fc" style={{ flexShrink: 0, opacity: 0.8 }} />}
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                            {r.entityName}
                          </span>
                        </div>
                      </td>

                      {/* Type badge */}
                      <td style={{ padding: '11px 12px' }}>
                        <span style={{
                          padding: '2px 9px',
                          borderRadius: '10px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: r.entityType === 'company' ? 'rgba(0, 210, 255, 0.1)' : 'rgba(192, 132, 252, 0.12)',
                          color: r.entityType === 'company' ? 'var(--accent-primary)' : '#c084fc',
                          border: `1px solid ${r.entityType === 'company' ? 'rgba(0, 210, 255, 0.2)' : 'rgba(192, 132, 252, 0.25)'}`,
                          textTransform: 'capitalize',
                        }}>
                          {r.entityType}
                        </span>
                      </td>

                      {/* Role (customers mode) */}
                      {contactMode === 'customers' && (
                        <td style={{ padding: '11px 12px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                          {[r.isCustomer && 'Customer', r.isBroker && 'Broker'].filter(Boolean).join(', ') || '—'}
                        </td>
                      )}

                      {/* Email */}
                      {(exportType === 'email' || exportType === 'both') && (
                        <td style={{ padding: '11px 12px' }}>
                          {r.email ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Mail size={12} color="var(--text-secondary)" style={{ opacity: 0.5, flexShrink: 0 }} />
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                                {r.email}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>—</span>
                          )}
                        </td>
                      )}

                      {/* Phone */}
                      {(exportType === 'phone' || exportType === 'both') && (
                        <td style={{ padding: '11px 12px' }}>
                          {r.phone ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <Phone size={12} color="var(--text-secondary)" style={{ opacity: 0.5, flexShrink: 0 }} />
                              <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                                {r.phone}
                              </span>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>—</span>
                          )}
                        </td>
                      )}

                      {/* Vessels */}
                      <td style={{ padding: '11px 16px', color: 'var(--text-secondary)', fontSize: '0.82rem', maxWidth: '260px' }}>
                        {r.vesselNames || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
