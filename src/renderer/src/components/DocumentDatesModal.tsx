import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Field, Modal } from './ui'
import { useToast } from '../contexts/ToastContext'
import { formatDate } from '../utils/dateUtils'

export interface DocumentDatesRequest {
  vesselId: string
  documentTypeId: string
  documentName: string
  /** Annual documents follow the P&I end date for compliance */
  annualRenewal?: boolean
  piEndDate?: string
}

interface Props {
  request: DocumentDatesRequest
  onClose: () => void
  onSaved: () => void
}

/**
 * Asked right after a vessel document file is linked or replaced: when it was received and when
 * it expires. A new file never takes over the previous file's expiry, so this is where it is set
 */
export default function DocumentDatesModal({
  request,
  onClose,
  onSaved
}: Props): React.JSX.Element {
  const { showSuccess, showError } = useToast()
  const [received, setReceived] = useState(new Date().toISOString().split('T')[0])
  const [expiry, setExpiry] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      if (received)
        await window.api.updateVesselDocumentReceivedDate(
          request.vesselId,
          request.documentTypeId,
          received
        )
      await window.api.updateVesselDocumentExpiry(
        request.vesselId,
        request.documentTypeId,
        expiry || null
      )
      showSuccess(
        expiry
          ? `${request.documentName}: expires ${formatDate(expiry)}`
          : `${request.documentName} saved`
      )
      onSaved()
      onClose()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save the dates')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Document dates"
      icon={<CalendarClock size={18} />}
      onClose={onClose}
      closeOnOverlay={false}
      width={460}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Later
          </button>
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
        <strong style={{ color: 'var(--text-primary)' }}>{request.documentName}</strong> is linked.
        When was it received and when does it expire?
      </p>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Field label="Received" htmlFor="doc-dates-received">
          <input
            id="doc-dates-received"
            type="date"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            min="1900-01-01"
            max="2100-12-31"
          />
        </Field>
        <Field
          label="Expires"
          htmlFor="doc-dates-expiry"
          hint={
            request.annualRenewal
              ? 'Annual: compliance follows the P&I end date'
              : 'Leave empty if it does not expire'
          }
        >
          <input
            id="doc-dates-expiry"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            min="1900-01-01"
            max="2100-12-31"
            autoFocus
          />
        </Field>
      </div>
      {request.annualRenewal && request.piEndDate && (
        <div style={{ marginTop: '10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          P&I end date: {formatDate(request.piEndDate)}{' '}
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => setExpiry(request.piEndDate!.split('T')[0])}
          >
            Use it
          </button>
        </div>
      )}
    </Modal>
  )
}
