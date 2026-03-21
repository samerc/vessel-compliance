import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft,
  FileCheck,
  Ship,
  DollarSign,
  Clock,
  ExternalLink,
  Download,
  Loader2,
  Trash2,
  MapPin,
  CreditCard,
  Users
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { formatDateShort, formatDate } from '../utils/dateUtils'
import {
  exportPolicyDocx,
  exportDebitAdviceDocx,
  exportCreditAdviceDocx,
  exportBlueCardsDocx
} from '../services/PolicyExportService'
import { getReportSettings } from '../services/ReportSettingsService'

interface PolicyDetailProps {
  policyId: string
  onBack: () => void
  onNavigateToVessel?: (vesselId: string) => void
}

interface PolicyRecord {
  id: string
  quotationId: string
  vesselId: string
  policyNumber: string
  status: string
  revisionNumber: number
  inceptionDate: string
  inceptionTime: string
  expiryDate: string
  expiryTime: string
  timezone: string
  commissionPercent: number | null
  showAddresses: boolean
  bankId: string | null
  bankName: string | null
  bankDetails: string | null
  proRata: boolean
  perAnnumPremium: number | null
  premiumAmount: number | null
  createdBy: string
  createdAt: string
  quotationTypeCode: string
  quotationTypeName: string
  vesselName: string
  imoNumber: string
  vesselType: string
  flagStateId: string
  builtYear: number | null
  grossTonnage: number | null
  flagStateName: string
  customerName: string
  callSign?: string
}

interface Instalment {
  instalmentNumber: number
  dueDate: string
  premiumAmount: number
  commissionAmount: number
  isNonRefundable: boolean
}

interface PolicyAddress {
  entityId: string
  entityName: string
  role: string
  addressText: string
}

interface BlueCard {
  cardType: string
  cardNumber: string
  inceptionDate: string
  expiryDate: string
  revisionNumber: number
  issuedDate: string
}

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
  expired: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
  cancelled: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
  inactive: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' }
}

const typeColors: Record<string, { bg: string; text: string; lightText: string }> = {
  P: { bg: 'rgba(100, 100, 255, 0.12)', text: '#6464ff', lightText: '#4a4adf' },
  H: { bg: 'rgba(255, 100, 200, 0.12)', text: '#ff64c8', lightText: '#c84a9a' },
  W: { bg: 'rgba(255, 176, 32, 0.12)', text: '#ffb020', lightText: '#b07a10' }
}

function formatAmount(amount?: number | null, currency?: string): string {
  if (amount == null) return '-'
  return `${currency || 'USD'} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPeriod(date?: string, time?: string): string {
  if (!date) return '-'
  const formatted = formatDateShort(date)
  if (time) return `${formatted} ${time}`
  return formatted
}

export default function PolicyDetail({ policyId, onBack, onNavigateToVessel }: PolicyDetailProps) {
  const [policy, setPolicy] = useState<PolicyRecord | null>(null)
  const [instalments, setInstalments] = useState<Instalment[]>([])
  const [addresses, setAddresses] = useState<PolicyAddress[]>([])
  const [blueCards, setBlueCards] = useState<BlueCard[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingPolicy, setExportingPolicy] = useState(false)
  const [exportingDA, setExportingDA] = useState(false)
  const [exportingCA, setExportingCA] = useState(false)
  const [exportingBC, setExportingBC] = useState(false)
  const { showError, showSuccess } = useToast()
  const { hasPermission } = useAuth()
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [found, inst, addr, bc] = await Promise.all([
        window.api.policyGetById(policyId),
        window.api.policyGetInstalments(policyId),
        window.api.policyGetAddresses(policyId),
        window.api.policyGetBlueCards(policyId)
      ])

      if (!found || (found as any).error) {
        showError('Policy not found')
        onBack()
        return
      }

      setPolicy(found as PolicyRecord)
      setInstalments(Array.isArray(inst) ? inst : [])
      setAddresses(Array.isArray(addr) ? addr : [])
      setBlueCards(Array.isArray(bc) ? bc : [])
    } catch (err: any) {
      showError(err.message || 'Failed to load policy')
    } finally {
      setLoading(false)
    }
  }, [policyId])

  useEffect(() => {
    loadData()
  }, [loadData])

  const cardStyle: React.CSSProperties = {
    background: isLight ? '#ffffff' : 'var(--bg-card)',
    border: '1px solid var(--glass-border)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px'
  }

  const cardHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--glass-border)'
  }

  const cardTitleStyle: React.CSSProperties = {
    fontSize: '0.95rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-primary)'
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '0.72rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--text-secondary)',
    marginBottom: '4px'
  }

  const valueStyle: React.CSSProperties = {
    fontSize: '0.88rem',
    color: 'var(--text-primary)',
    fontWeight: 500
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: '0.73rem',
    color: 'var(--text-secondary)',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  }

  const tdStyle: React.CSSProperties = {
    padding: '10px 14px',
    fontSize: '0.85rem'
  }

  const exportBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px'
  }

  if (loading) {
    return (
      <div
        style={{
          padding: '32px',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}
      >
        Loading policy...
      </div>
    )
  }

  if (!policy) return null

  const sc = statusColors[policy.status] || statusColors.inactive
  const tc = typeColors[policy.quotationTypeCode] || typeColors.P
  const isPIType = policy.quotationTypeCode === 'P'
  const commissionAmount =
    policy.commissionPercent && policy.premiumAmount
      ? (policy.commissionPercent / 100) * policy.premiumAmount
      : null

  const handleExportPolicy = async () => {
    setExportingPolicy(true)
    try {
      await exportPolicyDocx(policyId)
      showSuccess('Policy document exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export policy')
    } finally {
      setExportingPolicy(false)
    }
  }

  const handleExportDA = async () => {
    setExportingDA(true)
    try {
      await exportDebitAdviceDocx(policyId)
      showSuccess('Debit advice exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export debit advice')
    } finally {
      setExportingDA(false)
    }
  }

  const handleExportCA = async () => {
    setExportingCA(true)
    try {
      await exportCreditAdviceDocx(policyId)
      showSuccess('Credit advice exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export credit advice')
    } finally {
      setExportingCA(false)
    }
  }

  const handleExportBC = async () => {
    setExportingBC(true)
    try {
      if (blueCards.length === 0) {
        showError('No blue cards found for this policy')
        return
      }
      const cardTypes = blueCards.map((bc) => bc.cardType as 'BBC' | 'WRC' | 'MLC4.2' | 'MLC2.5.2')
      const reportSettings = await getReportSettings()
      await exportBlueCardsDocx(
        {
          policyNumber: policy.policyNumber || '',
          vesselName: policy.vesselName || '',
          imoNumber: policy.imoNumber || '',
          flagState: policy.flagStateName || '',
          grossTonnage: policy.grossTonnage || 0,
          inceptionDate: policy.inceptionDate || '',
          inceptionTime: policy.inceptionTime || '',
          expiryDate: policy.expiryDate || '',
          expiryTime: policy.expiryTime || '',
          timezone: policy.timezone || 'GMT',
          callSign: policy.callSign || '',
          companyName: reportSettings.companyName || 'Insurance Company'
        },
        cardTypes
      )
      showSuccess('Blue cards exported')
    } catch (err: any) {
      showError(err.message || 'Failed to export blue cards')
    } finally {
      setExportingBC(false)
    }
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button
          onClick={onBack}
          className="btn-secondary"
          style={{ padding: '8px', display: 'flex', alignItems: 'center' }}
          title="Back to Policies"
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1 }}>
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}
          >
            <h1
              style={{
                fontSize: '1.6rem',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <FileCheck size={26} />
              {policy.policyNumber || 'Untitled Policy'}
            </h1>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '8px',
                fontSize: '0.75rem',
                fontWeight: 700,
                background: tc.bg,
                color: isLight ? tc.lightText : tc.text
              }}
            >
              {policy.quotationTypeName}
            </span>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                background: sc.bg,
                color: sc.text
              }}
            >
              {policy.status}
            </span>
            {policy.revisionNumber > 0 && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  background: 'rgba(100, 100, 255, 0.10)',
                  color: isLight ? '#4a4adf' : '#6464ff'
                }}
              >
                Rev. {policy.revisionNumber}
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            style={exportBtnStyle}
            onClick={handleExportPolicy}
            disabled={exportingPolicy}
            title="Export Policy DOCX"
          >
            {exportingPolicy ? (
              <Loader2 size={14} className="spinner" />
            ) : (
              <Download size={14} />
            )}
            Export Policy
          </button>
          <button
            className="btn-secondary"
            style={exportBtnStyle}
            onClick={handleExportDA}
            disabled={exportingDA}
            title="Export Debit Advice DOCX"
          >
            {exportingDA ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
            Export DA
          </button>
          {commissionAmount != null && commissionAmount > 0 && (
            <button
              className="btn-secondary"
              style={exportBtnStyle}
              onClick={handleExportCA}
              disabled={exportingCA}
              title="Export Credit Advice DOCX"
            >
              {exportingCA ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              Export CA
            </button>
          )}
          {isPIType && blueCards.length > 0 && (
            <button
              className="btn-secondary"
              style={exportBtnStyle}
              onClick={handleExportBC}
              disabled={exportingBC}
              title="Export Blue Cards DOCX"
            >
              {exportingBC ? <Loader2 size={14} className="spinner" /> : <Download size={14} />}
              Export Blue Cards
            </button>
          )}
          {hasPermission('policies:manage') && (
            <button
              onClick={async () => {
                if (
                  !confirm(
                    'Are you sure you want to delete this policy? This cannot be undone.'
                  )
                )
                  return
                try {
                  await window.api.policyDelete(policyId)
                  showSuccess('Policy deleted')
                  onBack()
                } catch (err: any) {
                  showError(err.message || 'Failed to delete')
                }
              }}
              style={{
                background: 'transparent',
                border: '1px solid var(--danger)',
                color: 'var(--danger)',
                padding: '6px 14px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Overview Card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Ship size={18} style={{ color: 'var(--accent-primary)' }} />
            <span style={cardTitleStyle}>Overview</span>
          </div>

          {/* Vessel */}
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}>Vessel</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={valueStyle}>{policy.vesselName || '-'}</span>
              {policy.imoNumber && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  IMO {policy.imoNumber}
                </span>
              )}
              {onNavigateToVessel && policy.vesselId && (
                <button
                  onClick={() => onNavigateToVessel(policy.vesselId)}
                  className="btn-secondary"
                  style={{
                    padding: '3px 6px',
                    fontSize: '0.72rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  title="View vessel"
                >
                  <ExternalLink size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Vessel details grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}
          >
            {policy.vesselType && (
              <div>
                <div style={labelStyle}>Type</div>
                <div style={valueStyle}>{policy.vesselType}</div>
              </div>
            )}
            {policy.flagStateName && (
              <div>
                <div style={labelStyle}>Flag</div>
                <div style={valueStyle}>{policy.flagStateName}</div>
              </div>
            )}
            {policy.builtYear && (
              <div>
                <div style={labelStyle}>Built</div>
                <div style={valueStyle}>{policy.builtYear}</div>
              </div>
            )}
            {policy.grossTonnage && (
              <div>
                <div style={labelStyle}>Gross Tonnage</div>
                <div style={valueStyle}>{Number(policy.grossTonnage).toLocaleString()}</div>
              </div>
            )}
          </div>

          {/* Customer */}
          <div style={{ marginBottom: '16px' }}>
            <div style={labelStyle}>Customer</div>
            <div style={valueStyle}>
              {policy.customerName || (
                <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>-</span>
              )}
            </div>
          </div>

          {/* Period */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '12px'
            }}
          >
            <div>
              <div style={labelStyle}>Inception</div>
              <div style={valueStyle}>
                {formatPeriod(policy.inceptionDate, policy.inceptionTime)}
              </div>
            </div>
            <div>
              <div style={labelStyle}>Expiry</div>
              <div style={valueStyle}>
                {formatPeriod(policy.expiryDate, policy.expiryTime)}
              </div>
            </div>
          </div>

          {policy.timezone && (
            <div style={{ marginBottom: '12px' }}>
              <div style={labelStyle}>Timezone</div>
              <div style={valueStyle}>{policy.timezone}</div>
            </div>
          )}

          {/* Source quotation */}
          {policy.quotationId && (
            <div>
              <div style={labelStyle}>Source Quotation</div>
              <div style={{ ...valueStyle, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {policy.quotationId}
              </div>
            </div>
          )}
        </div>

        {/* Financial Card */}
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <DollarSign size={18} style={{ color: '#00c864' }} />
            <span style={cardTitleStyle}>Financial Details</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}
          >
            <div>
              <div style={labelStyle}>Premium</div>
              <div style={{ ...valueStyle, fontWeight: 600 }}>
                {formatAmount(policy.premiumAmount)}
              </div>
            </div>
            {policy.perAnnumPremium != null && (
              <div>
                <div style={labelStyle}>Per Annum Premium</div>
                <div style={{ ...valueStyle, fontWeight: 600 }}>
                  {formatAmount(policy.perAnnumPremium)}
                </div>
              </div>
            )}
            {policy.commissionPercent != null && (
              <div>
                <div style={labelStyle}>Commission</div>
                <div style={valueStyle}>
                  {policy.commissionPercent}%
                  {commissionAmount != null && (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '6px' }}>
                      ({formatAmount(commissionAmount)})
                    </span>
                  )}
                </div>
              </div>
            )}
            {policy.bankName && (
              <div>
                <div style={labelStyle}>Bank</div>
                <div style={valueStyle}>{policy.bankName}</div>
              </div>
            )}
            {policy.proRata && (
              <div>
                <div style={labelStyle}>Pro Rata</div>
                <div style={valueStyle}>Yes</div>
              </div>
            )}
          </div>

          {/* Instalment table */}
          {instalments.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ ...labelStyle, marginBottom: '8px' }}>Instalments</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Due Date</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Premium</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Commission</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>NR</th>
                  </tr>
                </thead>
                <tbody>
                  {instalments.map((inst, idx) => (
                    <tr
                      key={inst.instalmentNumber}
                      style={{
                        borderBottom: '1px solid var(--table-border)',
                        background:
                          idx % 2 === 0
                            ? 'transparent'
                            : isLight
                              ? 'rgba(0,0,0,0.02)'
                              : 'rgba(255,255,255,0.02)'
                      }}
                    >
                      <td style={tdStyle}>{inst.instalmentNumber}</td>
                      <td style={tdStyle}>
                        {inst.dueDate ? formatDateShort(inst.dueDate) : '-'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                        {formatAmount(inst.premiumAmount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatAmount(inst.commissionAmount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {inst.isNonRefundable ? (
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 600,
                              background: 'rgba(255, 176, 32, 0.15)',
                              color: '#ffb020'
                            }}
                          >
                            NR
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {policy.premiumAmount == null && instalments.length === 0 && (
            <div
              style={{
                padding: '24px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem'
              }}
            >
              No financial data recorded
            </div>
          )}
        </div>
      </div>

      {/* Addresses Card */}
      {addresses.length > 0 && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <Users size={18} style={{ color: '#6464ff' }} />
            <span style={cardTitleStyle}>Addresses</span>
            <span
              style={{
                marginLeft: 'auto',
                padding: '2px 10px',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: 'rgba(100, 100, 255, 0.12)',
                color: isLight ? '#4a4adf' : '#6464ff'
              }}
            >
              {addresses.length}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {addresses.map((addr, idx) => (
              <div
                key={`${addr.entityId}-${idx}`}
                style={{
                  padding: '12px 16px',
                  borderRadius: '8px',
                  background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--glass-border)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>
                    {addr.entityName}
                  </span>
                  {addr.role && (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background: 'rgba(0, 170, 200, 0.08)',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {addr.role}
                    </span>
                  )}
                </div>
                {addr.addressText && (
                  <div
                    style={{
                      fontSize: '0.82rem',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px'
                    }}
                  >
                    <MapPin size={13} style={{ marginTop: '2px', flexShrink: 0 }} />
                    {addr.addressText}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blue Cards Card */}
      {isPIType && blueCards.length > 0 && (
        <div style={cardStyle}>
          <div style={cardHeaderStyle}>
            <CreditCard size={18} style={{ color: '#00aac8' }} />
            <span style={cardTitleStyle}>Blue Cards</span>
            <span
              style={{
                marginLeft: 'auto',
                padding: '2px 10px',
                borderRadius: '10px',
                fontSize: '0.72rem',
                fontWeight: 600,
                background: 'rgba(0, 170, 200, 0.12)',
                color: isLight ? '#007a91' : '#00aac8'
              }}
            >
              {blueCards.length}
            </span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--table-border)' }}>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Card Number</th>
                <th style={thStyle}>Inception</th>
                <th style={thStyle}>Expiry</th>
                <th style={thStyle}>Revision</th>
                <th style={thStyle}>Issued</th>
              </tr>
            </thead>
            <tbody>
              {blueCards.map((bc, idx) => (
                <tr
                  key={`${bc.cardType}-${idx}`}
                  style={{
                    borderBottom: '1px solid var(--table-border)',
                    background:
                      idx % 2 === 0
                        ? 'transparent'
                        : isLight
                          ? 'rgba(0,0,0,0.02)'
                          : 'rgba(255,255,255,0.02)'
                  }}
                >
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        background: 'rgba(0, 170, 200, 0.10)',
                        color: isLight ? '#007a91' : '#00aac8'
                      }}
                    >
                      {bc.cardType}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{bc.cardNumber || '-'}</td>
                  <td style={tdStyle}>
                    {bc.inceptionDate ? formatDateShort(bc.inceptionDate) : '-'}
                  </td>
                  <td style={tdStyle}>
                    {bc.expiryDate ? formatDateShort(bc.expiryDate) : '-'}
                  </td>
                  <td style={tdStyle}>{bc.revisionNumber ?? '-'}</td>
                  <td style={tdStyle}>
                    {bc.issuedDate ? formatDateShort(bc.issuedDate) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Revision History Card */}
      <div style={cardStyle}>
        <div style={cardHeaderStyle}>
          <Clock size={18} style={{ color: 'var(--text-secondary)' }} />
          <span style={cardTitleStyle}>Revision History</span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '12px',
            marginBottom: '8px'
          }}
        >
          <div>
            <div style={labelStyle}>Revision</div>
            <div style={valueStyle}>{policy.revisionNumber}</div>
          </div>
          <div>
            <div style={labelStyle}>Created</div>
            <div style={valueStyle}>
              {policy.createdAt ? formatDate(policy.createdAt) : '-'}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Created By</div>
            <div style={valueStyle}>{policy.createdBy || '-'}</div>
          </div>
        </div>
      </div>

    </div>
  )
}
