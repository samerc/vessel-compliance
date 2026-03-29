import { Quotation } from '../../../../shared/types'

export default function VoyageTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (prev: Quotation) => Quotation) => void
}) {
    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Voyage / Period</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Port of Loading</label>
                    <input value={quotation.portOfLoading || ''}
                        onChange={e => setQ(prev => ({ ...prev, portOfLoading: e.target.value }))}
                        onBlur={e => updateField('portOfLoading', e.target.value || null)}
                        placeholder="e.g. Puerto Montt, Chile"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                </div>
                <div>
                    <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Port of Destination</label>
                    <input value={quotation.portOfDestination || ''}
                        onChange={e => setQ(prev => ({ ...prev, portOfDestination: e.target.value }))}
                        onBlur={e => updateField('portOfDestination', e.target.value || null)}
                        placeholder="e.g. Mersin, Turkey"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Estimated Time of Departure (ETD)</label>
                <input value={quotation.estimatedDeparture || ''}
                    onChange={e => setQ(prev => ({ ...prev, estimatedDeparture: e.target.value }))}
                    onBlur={e => updateField('estimatedDeparture', e.target.value || null)}
                    placeholder="e.g. Beginning July 2025"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
            </div>
            <div>
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Voyage Description</label>
                <textarea value={quotation.voyageText || ''}
                    onChange={e => setQ(prev => ({ ...prev, voyageText: e.target.value }))}
                    onBlur={e => updateField('voyageText', e.target.value || null)}
                    placeholder="e.g. From commencement of loading at port of loading to completion of discharge at port of destination"
                    rows={4}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
        </div>
    )
}
