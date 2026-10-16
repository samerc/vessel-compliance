import { Quotation } from '../../../../shared/types'
import { MoneyInput } from './shared'
import { Field } from '../ui'

export default function InsuredValueTab({
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
      <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Insured Value</h3>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 3fr' }}>
        <Field label="Currency">
          <input
            value={quotation.insuredValueCurrency || 'USD'}
            onChange={(e) => setQ((prev) => ({ ...prev, insuredValueCurrency: e.target.value }))}
            onBlur={(e) => updateField('insuredValueCurrency', e.target.value)}
            style={{ width: '80px' }}
          />
        </Field>
        <Field label="Amount">
          <MoneyInput
            value={quotation.insuredValueAmount}
            onChange={(val) => setQ((prev) => ({ ...prev, insuredValueAmount: val }))}
            onBlur={(val) => updateField('insuredValueAmount', val ?? null)}
            placeholder="0.00"
            showZero
          />
        </Field>
        <Field label="Description" span="all">
          <textarea
            value={quotation.insuredValueText || ''}
            onChange={(e) => setQ((prev) => ({ ...prev, insuredValueText: e.target.value }))}
            onBlur={(e) => updateField('insuredValueText', e.target.value || null)}
            placeholder="e.g. Total Contract Value"
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </Field>
      </div>
    </div>
  )
}
