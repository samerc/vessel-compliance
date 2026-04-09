import { useState, useEffect, useRef } from 'react'
import { Plus, RefreshCcw, ChevronDown, FileText, Loader2, ExternalLink, Users } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { Vessel } from '../../../shared/types'
import { formatDate } from '../utils/dateUtils'

interface VesselQuotationsViewProps {
  vessel: Vessel
  onNavigateToQuotation: (quotationId: string) => void
}

const typeColor = (code?: string) => {
  switch (code) {
    case 'P': return '#00aac8'
    case 'H': return '#6464ff'
    case 'W': return '#ff64c8'
    case 'F': return '#ffb020'
    case 'L': return '#44cc88'
    case 'C': return '#ff8c00'
    default: return '#888'
  }
}

export default function VesselQuotationsView({ vessel, onNavigateToQuotation }: VesselQuotationsViewProps) {
  const [quotations, setQuotations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [quotationTypes, setQuotationTypes] = useState<any[]>([])
  const [creating, setCreating] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { theme } = useTheme()
  const { showSuccess, showError } = useToast()
  const { user } = useAuth()
  const isLight = theme === 'light'

  useEffect(() => {
    loadQuotations()
    loadQuotationTypes()
  }, [vessel.id])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowTypeMenu(false)
      }
    }
    if (showTypeMenu) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showTypeMenu])

  const loadQuotations = async () => {
    setLoading(true)
    try {
      const rows = await window.api.vesselGetQuotations(vessel.id)
      setQuotations(Array.isArray(rows) ? rows : [])
    } catch {
      setQuotations([])
    } finally {
      setLoading(false)
    }
  }

  const loadQuotationTypes = async () => {
    try {
      const types = await window.api.getQuotationTypes()
      setQuotationTypes(Array.isArray(types) ? types : [])
    } catch {
      setQuotationTypes([])
    }
  }

  const handleNewQuotation = async (typeCode: string) => {
    setShowTypeMenu(false)
    setCreating(true)
    try {
      const qt = quotationTypes.find((t: any) => t.code === typeCode)
      if (!qt) throw new Error('Quotation type not found')

      const q = await window.api.addQuotation({
        quotationTypeId: qt.id,
        createdBy: user?.username
      } as any)
      if (!q || (q as any).error) throw new Error('Failed to create quotation')

      // Add vessel to quotation
      const flagStates = await window.api.getFlagStates()
      const flagName = vessel.flagStateId
        ? ((Array.isArray(flagStates) ? flagStates : []).find((f: any) => f.id === vessel.flagStateId)?.name || '')
        : ''

      await window.api.addQuotationVessel({
        quotationId: q.id,
        vesselId: vessel.id,
        vesselLabel: 'V1',
        order: 0,
        name: vessel.name,
        imoNumber: vessel.imoNumber,
        builtYear: vessel.builtYear,
        grossTonnage: vessel.grossTonnage,
        flag: flagName,
        vesselType: vessel.vesselType,
        classification: vessel.classificationSociety,
        callSign: vessel.callSign
      })

      // Auto-load vessel assureds
      try {
        const allEntities = await window.api.getEntities()
        const assuredRoles = await window.api.getAssuredRoles()
        const roleOrder = new Map((Array.isArray(assuredRoles) ? assuredRoles : []).map((r: any, idx: number) => [r.name?.toLowerCase(), r.order ?? idx]))
        const vassureds = await window.api.getVesselAssureds(vessel.id)
        const toAdd = (Array.isArray(vassureds) ? vassureds : [])
          .sort((a: any, b: any) => (roleOrder.get(a.role?.toLowerCase()) ?? 999) - (roleOrder.get(b.role?.toLowerCase()) ?? 999))
        let assuredOrder = 0
        for (const va of toAdd) {
          const entity = allEntities.find((e: any) => e.id === va.entityId)
          if (!entity) continue
          if (va.role && va.role.toLowerCase().replace(/[^a-z]/g, '') === 'co') {
            if (!q.coName) await window.api.updateQuotation(q.id, { coName: entity.name } as any)
            continue
          }
          await window.api.addQuotationAssured({
            quotationId: q.id,
            entityId: va.entityId,
            name: entity.name,
            role: va.role || undefined,
            order: assuredOrder++
          })
        }
      } catch { /* ignore assured loading errors */ }

      showSuccess(`Quotation created`)
      onNavigateToQuotation(q.id)
    } catch (err: any) {
      showError(err.message || 'Failed to create quotation')
    } finally {
      setCreating(false)
    }
  }

  const formatPremium = (amount: number | null, currency: string | null) => {
    if (!amount) return ''
    const cur = currency || 'USD'
    if (amount >= 1000000) return `${cur} ${(amount / 1000000).toFixed(1)}M`
    if (amount >= 1000) return `${cur} ${(amount / 1000).toFixed(0)}K`
    return `${cur} ${amount.toLocaleString()}`
  }

  const getStatusStyle = (status: string | null, workflowColor: string | null) => {
    if (workflowColor) {
      return {
        background: workflowColor + '22',
        color: workflowColor,
        border: `1px solid ${workflowColor}44`
      }
    }
    switch (status) {
      case 'draft': return { background: 'rgba(136,136,136,0.12)', color: isLight ? '#666' : '#aaa', border: '1px solid rgba(136,136,136,0.2)' }
      case 'sent': return { background: 'rgba(100,100,255,0.12)', color: isLight ? '#4444cc' : '#8888ff', border: '1px solid rgba(100,100,255,0.2)' }
      case 'approved': return { background: 'rgba(68,204,136,0.12)', color: isLight ? '#228844' : '#44cc88', border: '1px solid rgba(68,204,136,0.2)' }
      default: return { background: 'rgba(136,136,136,0.12)', color: isLight ? '#666' : '#aaa', border: '1px solid rgba(136,136,136,0.2)' }
    }
  }

  return (
    <div className="glass-card" style={{ padding: '0', overflowX: 'auto' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', borderBottom: '1px solid var(--table-border)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {quotations.length} quotation{quotations.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ position: 'relative' }} ref={menuRef}>
            <button
              onClick={() => setShowTypeMenu(!showTypeMenu)}
              disabled={creating}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px', border: 'none',
                background: 'var(--accent-primary)', color: '#fff',
                fontSize: '0.82rem', fontWeight: 600, cursor: creating ? 'wait' : 'pointer',
                opacity: creating ? 0.6 : 1
              }}
            >
              {creating ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
              New Quotation
              <ChevronDown size={14} />
            </button>
            {showTypeMenu && quotationTypes.length > 0 && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: '4px',
                background: isLight ? '#fff' : '#1e222a',
                border: '1px solid var(--glass-border)', borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)', zIndex: 100,
                minWidth: '180px', padding: '6px', overflow: 'hidden'
              }}>
                {quotationTypes.map((qt: any) => (
                  <button
                    key={qt.id}
                    onClick={() => handleNewQuotation(qt.code)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      width: '100%', padding: '8px 12px', border: 'none',
                      background: 'transparent', borderRadius: '6px',
                      color: 'var(--text-primary)', fontSize: '0.84rem',
                      cursor: 'pointer', textAlign: 'left'
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'var(--bg-hover)' }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '24px', height: '20px', borderRadius: '4px',
                      fontSize: '0.7rem', fontWeight: 700,
                      background: typeColor(qt.code) + '22', color: typeColor(qt.code)
                    }}>{qt.code}</span>
                    {qt.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={loadQuotations}
            title="Refresh"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '7px', borderRadius: '8px', border: '1px solid var(--glass-border)',
              background: 'transparent', color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <RefreshCcw size={15} />
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <Loader2 size={22} className="spin" style={{ margin: '0 auto 8px' }} />
          Loading quotations...
        </div>
      ) : quotations.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center' }}>
          <FileText size={36} style={{ color: 'var(--text-secondary)', opacity: 0.4, marginBottom: '12px' }} />
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>No quotations for this vessel yet</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', opacity: 0.6, marginTop: '4px' }}>
            Click "New Quotation" to create one
          </p>
        </div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
              {['Reference', 'Type', 'Status', 'Date', 'Premium', 'Conditions', ''].map(h => (
                <th key={h} style={{
                  padding: '10px 14px', textAlign: 'left',
                  fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: '0.5px', color: 'var(--text-secondary)'
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {quotations.map(q => {
              const statusStyle = getStatusStyle(q.status, q.workflowStepColor)
              const statusLabel = q.workflowStepName || q.status || 'draft'
              return (
                <tr
                  key={q.id}
                  onClick={() => onNavigateToQuotation(q.id)}
                  style={{
                    borderBottom: '1px solid var(--table-border)',
                    cursor: 'pointer',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(0,210,255,0.04)' }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                        {q.referenceNumber || 'DRAFT'}
                      </span>
                      {q.revisionNumber > 0 && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600,
                          padding: '1px 5px', borderRadius: '4px',
                          background: 'rgba(100,100,255,0.1)', color: isLight ? '#4444cc' : '#8888ff'
                        }}>R{q.revisionNumber}</span>
                      )}
                      {q.isRenewal && (
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 600,
                          padding: '1px 5px', borderRadius: '4px',
                          background: 'rgba(68,204,136,0.1)', color: isLight ? '#228844' : '#44cc88'
                        }}>RNW</span>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: '28px', height: '22px', borderRadius: '5px',
                      fontSize: '0.72rem', fontWeight: 700,
                      background: typeColor(q.quotationTypeCode) + '22',
                      color: typeColor(q.quotationTypeCode)
                    }}>{q.quotationTypeCode}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      display: 'inline-block', padding: '3px 10px',
                      borderRadius: '6px', fontSize: '0.76rem', fontWeight: 600,
                      ...statusStyle
                    }}>{statusLabel}</span>
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {formatDate(q.quotationDate || q.createdAt)}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '0.85rem', fontWeight: 500 }}>
                    {formatPremium(q.premiumAmount, q.premiumCurrency)}
                  </td>
                  <td style={{
                    padding: '12px 14px', fontSize: '0.82rem',
                    color: 'var(--text-secondary)', maxWidth: '200px',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                  }}>
                    {q.conditionsSummary || ''}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                      {q.vesselCount > 1 && (
                        <span title={`${q.vesselCount} vessels`} style={{
                          display: 'inline-flex', alignItems: 'center', gap: '3px',
                          fontSize: '0.74rem', color: 'var(--text-secondary)', opacity: 0.7
                        }}>
                          <Users size={13} />
                          {q.vesselCount}
                        </span>
                      )}
                      <ExternalLink size={14} style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
