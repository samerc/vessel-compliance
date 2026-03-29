import { Quotation } from '../../../../shared/types'

export default function InsuredValueTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (prev: Quotation) => Quotation) => void
}) {
    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Insured Value</h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Currency</label>
                    <input value={quotation.insuredValueCurrency || 'USD'}
                        onChange={e => setQ(prev => ({ ...prev, insuredValueCurrency: e.target.value }))}
                        onBlur={e => updateField('insuredValueCurrency', e.target.value)}
                        style={{ width: '80px', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.88rem' }} />
                </div>
                <div style={{ flex: 3 }}>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Amount</label>
                    <input type="number" value={quotation.insuredValueAmount ?? ''}
                        onChange={e => setQ(prev => ({ ...prev, insuredValueAmount: e.target.value ? parseFloat(e.target.value) : undefined }))}
                        onBlur={e => updateField('insuredValueAmount', e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="0.00"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.88rem' }} />
                </div>
            </div>
            <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Description</label>
                <textarea value={quotation.insuredValueText || ''}
                    onChange={e => setQ(prev => ({ ...prev, insuredValueText: e.target.value }))}
                    onBlur={e => updateField('insuredValueText', e.target.value || null)}
                    placeholder="e.g. Total Contract Value"
                    rows={3}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
        </div>
    )
}
