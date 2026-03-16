import { useState, useEffect } from 'react'
import {
  Bell,
  BellOff,
  Copy,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  X,
  ExternalLink
} from 'lucide-react'
import { VesselReminder, ReminderSettings } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDate } from '../utils/dateUtils'

const DEFAULT_TEMPLATE = `Vessel: {vesselName} (IMO: {imoNumber})\n\nVessel Documents:\n{vesselDocuments}\n\nAssured Documents:\n{assuredDocuments}`

export default function ReminderCenter({ onNavigateToVessel }: { onNavigateToVessel?: (vesselId: string) => void } = {}) {
  const [reminders, setReminders] = useState<VesselReminder[]>([])
  const [settings, setSettings] = useState<ReminderSettings>({ periodDays: 7, reminderTemplate: DEFAULT_TEMPLATE })
  const [isLoading, setIsLoading] = useState(false)
  const [expandedVessels, setExpandedVessels] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [fleetFilter, setFleetFilter] = useState('all')
  const [showSnoozed, setShowSnoozed] = useState(false)
  const { user } = useAuth()
  const { showError, showSuccess } = useToast()
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [r, s] = await Promise.all([
        window.api.remindersGetVesselReminders(),
        window.api.remindersGetSettings()
      ])
      setReminders(r)
      setSettings(s)
    } catch (err: any) {
      showError('Failed to load reminders: ' + (err.message || err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const fleets = [...new Set(reminders.filter(r => r.fleetName).map(r => r.fleetName!))].sort()

  const filtered = reminders.filter(r => {
    if (!showSnoozed && r.isSnoozed) return false
    if (fleetFilter !== 'all' && r.fleetName !== fleetFilter) return false
    if (searchTerm && !r.vesselName.toLowerCase().includes(searchTerm.toLowerCase()) && !r.imoNumber.includes(searchTerm)) return false
    return true
  })

  const activeCount = reminders.filter(r => !r.isSnoozed).length

  const toggleExpand = (vesselId: string) => {
    setExpandedVessels(prev => {
      const next = new Set(prev)
      if (next.has(vesselId)) next.delete(vesselId)
      else next.add(vesselId)
      return next
    })
  }

  const handleSnooze = async (vesselId: string) => {
    try {
      await window.api.remindersSnoozeVessel(vesselId, user?.username || 'unknown', settings.periodDays)
      showSuccess('Vessel snoozed for ' + settings.periodDays + ' days')
      await loadData()
    } catch (err: any) {
      showError('Failed to snooze: ' + (err.message || err))
    }
  }

  const handleUnsnooze = async (vesselId: string) => {
    try {
      await window.api.remindersUnsnoozeVessel(vesselId)
      showSuccess('Vessel unsnoozed')
      await loadData()
    } catch (err: any) {
      showError('Failed to unsnooze: ' + (err.message || err))
    }
  }

  const buildCopyText = (reminder: VesselReminder): string => {
    let template = settings.reminderTemplate || DEFAULT_TEMPLATE

    const vesselDocLines = reminder.missingVesselDocs
      .map(d => `- ${d.docTypeName} (${d.status}${d.status === 'expired' && d.expiryDate ? ', expired: ' + d.expiryDate : ''})`)
      .join('\n')

    const assuredDocLines = reminder.assuredAlerts
      .map(a => {
        const docs = a.missingDocs.map(d => `  - ${d}`).join('\n')
        return `${a.entityName} (${a.roleName}, ${a.entityType}):\n${docs}`
      })
      .join('\n')

    template = template.replace('{vesselName}', reminder.vesselName)
    template = template.replace('{imoNumber}', reminder.imoNumber)
    template = template.replace('{vesselDocuments}', vesselDocLines || 'None')
    template = template.replace('{assuredDocuments}', assuredDocLines || 'None')

    return template
  }

  const handleCopy = async (reminder: VesselReminder) => {
    try {
      const text = buildCopyText(reminder)
      await navigator.clipboard.writeText(text)
      showSuccess('Copied to clipboard')
    } catch (err: any) {
      showError('Failed to copy: ' + (err.message || err))
    }
  }

  const handleCopyFleet = async (fleetName: string) => {
    try {
      const fleetReminders = filtered.filter(r => r.fleetName === fleetName)
      const text = fleetReminders.map(r => buildCopyText(r)).join('\n\n---\n\n')
      await navigator.clipboard.writeText(text)
      showSuccess(`Copied ${fleetReminders.length} vessel reminders to clipboard`)
    } catch (err: any) {
      showError('Failed to copy: ' + (err.message || err))
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--text-primary)' }}>Document Reminders</h1>
          <p style={{ margin: '4px 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {activeCount} active reminder{activeCount !== 1 ? 's' : ''} &middot; {reminders.length} total
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className="btn-secondary"
            onClick={loadData}
            disabled={isLoading}
            aria-label="Refresh reminders"
          >
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: '15px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search by vessel name or IMO..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              aria-label="Search reminders"
              style={{ width: '100%', padding: '8px 12px 8px 36px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                aria-label="Clear search"
                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <select
            value={fleetFilter}
            onChange={e => setFleetFilter(e.target.value)}
            aria-label="Filter by fleet"
            style={{ padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
          >
            <option value="all">All Fleets</option>
            {fleets.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={showSnoozed}
              onChange={e => setShowSnoozed(e.target.checked)}
            />
            Show snoozed
          </label>
        </div>
      </div>

      {/* Fleet Copy Buttons */}
      {fleetFilter !== 'all' && filtered.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <button className="btn-secondary" onClick={() => handleCopyFleet(fleetFilter)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Copy size={14} /> Copy All in Fleet ({filtered.length})
          </button>
        </div>
      )}
      {fleetFilter === 'all' && fleets.length > 0 && (
        <div style={{ marginBottom: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {fleets.map(f => {
            const count = filtered.filter(r => r.fleetName === f).length
            if (count === 0) return null
            return (
              <button key={f} className="btn-secondary" onClick={() => handleCopyFleet(f)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
                <Copy size={12} /> {f} ({count})
              </button>
            )
          })}
        </div>
      )}

      {/* Reminders List */}
      <div className="glass-card" style={{ padding: '20px' }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px', color: 'var(--text-primary)' }}>
          Reminders ({filtered.length})
        </h3>

        {isLoading && <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>}

        {!isLoading && filtered.length === 0 && (
          <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '40px 0' }}>
            {reminders.length === 0
              ? 'No document issues found. All vessels are up to date.'
              : 'No reminders match the current filters.'}
          </p>
        )}

        {!isLoading && filtered.map(reminder => {
          const isExpanded = expandedVessels.has(reminder.vesselId)

          return (
            <div
              key={reminder.vesselId}
              className="glass-card"
              style={{
                padding: '16px',
                marginBottom: '12px',
                background: reminder.isSnoozed ? 'var(--input-bg)' : undefined,
                opacity: reminder.isSnoozed ? 0.7 : 1
              }}
            >
              {/* Row Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                  onClick={() => toggleExpand(reminder.vesselId)}
                  aria-expanded={isExpanded}
                  aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '4px' }}
                >
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <strong style={{ color: 'var(--text-primary)', textTransform: 'uppercase' }}>{reminder.vesselName}</strong>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>IMO: {reminder.imoNumber}</span>
                    {reminder.fleetName && (
                      <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: '10px', background: 'var(--accent-primary)', color: '#fff' }}>{reminder.fleetName}</span>
                    )}
                    <span style={{
                      fontSize: '0.8rem',
                      padding: '2px 8px',
                      borderRadius: '10px',
                      background: reminder.isSnoozed ? 'var(--text-secondary)' : 'var(--danger)',
                      color: '#fff'
                    }}>
                      {reminder.isSnoozed ? 'Snoozed' : `${reminder.totalIssues} issue${reminder.totalIssues !== 1 ? 's' : ''}`}
                    </span>
                  </div>
                  {reminder.isSnoozed && reminder.snoozeUntil && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      Snoozed by {reminder.snoozedBy} until {formatDate(reminder.snoozeUntil)}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {onNavigateToVessel && (
                    <button
                      className="btn-secondary"
                      onClick={() => onNavigateToVessel(reminder.vesselId)}
                      title="View vessel"
                      aria-label={'View vessel ' + reminder.vesselName}
                      style={{ padding: '6px 10px' }}
                    >
                      <ExternalLink size={14} />
                    </button>
                  )}
                  <button
                    className="btn-secondary"
                    onClick={() => handleCopy(reminder)}
                    title="Copy reminder text"
                    aria-label={'Copy reminder for ' + reminder.vesselName}
                    style={{ padding: '6px 10px' }}
                  >
                    <Copy size={14} />
                  </button>
                  {reminder.isSnoozed ? (
                    <button
                      className="btn-secondary"
                      onClick={() => handleUnsnooze(reminder.vesselId)}
                      title="Unsnooze"
                      aria-label={'Unsnooze ' + reminder.vesselName}
                      style={{ padding: '6px 10px' }}
                    >
                      <Bell size={14} />
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      onClick={() => handleSnooze(reminder.vesselId)}
                      title={'Snooze for ' + settings.periodDays + ' days'}
                      aria-label={'Snooze ' + reminder.vesselName}
                      style={{ padding: '6px 10px' }}
                    >
                      <BellOff size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {isExpanded && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--table-border)' }}>
                  {/* Vessel Documents */}
                  {reminder.missingVesselDocs.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Vessel Documents</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {reminder.missingVesselDocs.map((doc, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', padding: '4px 8px', borderRadius: '4px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                            <span style={{
                              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                              background: doc.status === 'expired' ? 'var(--warning)' : 'var(--danger)'
                            }} />
                            <span style={{ color: 'var(--text-primary)' }}>{doc.docTypeName}</span>
                            <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                              {doc.status === 'expired' ? `Expired: ${doc.expiryDate}` : 'Missing'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Assured Documents */}
                  {reminder.assuredAlerts.length > 0 && (
                    <div>
                      <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Assured Documents</h4>
                      {reminder.assuredAlerts.map((alert, i) => (
                        <div key={i} style={{ marginBottom: '8px', padding: '8px', borderRadius: '6px', background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                            {alert.entityName}
                            <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: '8px' }}>
                              {alert.roleName} ({alert.entityType})
                            </span>
                          </div>
                          {alert.missingDocs.map((doc, j) => (
                            <div key={j} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', paddingLeft: '12px' }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
                              <span style={{ color: 'var(--text-secondary)' }}>{doc}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
