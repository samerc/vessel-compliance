import React from 'react'
import { Quotation } from '../../../../shared/types'
import { Field } from '../ui'

export default function VoyageTab({
  quotation,
  updateField,
  setQ
}: {
  quotation: Quotation
  updateField: (field: string, value: unknown) => void
  setQ: (fn: (prev: Quotation) => Quotation) => void
}): React.JSX.Element {
  return (
    <div>
      <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Voyage / Period</h3>
      <div className="form-grid cols-2">
        <Field label="Port of loading">
          <input
            value={quotation.portOfLoading || ''}
            onChange={(e) => setQ((prev) => ({ ...prev, portOfLoading: e.target.value }))}
            onBlur={(e) => updateField('portOfLoading', e.target.value || null)}
            placeholder="e.g. Puerto Montt, Chile"
          />
        </Field>
        <Field label="Port of destination">
          <input
            value={quotation.portOfDestination || ''}
            onChange={(e) => setQ((prev) => ({ ...prev, portOfDestination: e.target.value }))}
            onBlur={(e) => updateField('portOfDestination', e.target.value || null)}
            placeholder="e.g. Mersin, Turkey"
          />
        </Field>
        <Field
          label="Estimated time"
          span="all"
          hint="ETD = Departure · ETA = Arrival · ETC = Completion · ETB = Berthing · ETS = Sailing. Shown before the date on the quotation."
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            <select
              value={quotation.estimatedType || 'ETD'}
              onChange={(e) => {
                setQ((prev) => ({ ...prev, estimatedType: e.target.value }))
                updateField('estimatedType', e.target.value)
              }}
              style={{ flexShrink: 0, width: '90px' }}
            >
              <option value="ETD">ETD</option>
              <option value="ETA">ETA</option>
              <option value="ETC">ETC</option>
              <option value="ETB">ETB</option>
              <option value="ETS">ETS</option>
            </select>
            <input
              value={quotation.estimatedDeparture || ''}
              onChange={(e) => setQ((prev) => ({ ...prev, estimatedDeparture: e.target.value }))}
              onBlur={(e) => updateField('estimatedDeparture', e.target.value || null)}
              placeholder="e.g. Beginning July 2025"
              style={{ flex: 1 }}
            />
          </div>
        </Field>
        <Field label="Voyage description" span="all">
          <textarea
            value={quotation.voyageText || ''}
            onChange={(e) => setQ((prev) => ({ ...prev, voyageText: e.target.value }))}
            onBlur={(e) => updateField('voyageText', e.target.value || null)}
            placeholder="e.g. From commencement of loading at port of loading to completion of discharge at port of destination"
            rows={4}
            style={{ resize: 'vertical' }}
          />
        </Field>
      </div>
    </div>
  )
}
