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
                <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Estimated Time</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <select value={quotation.estimatedType || 'ETD'}
                        onChange={e => { setQ(prev => ({ ...prev, estimatedType: e.target.value })); updateField('estimatedType', e.target.value) }}
                        style={{ flexShrink: 0, width: '90px', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        <option value="ETD">ETD</option>
                        <option value="ETA">ETA</option>
                        <option value="ETC">ETC</option>
                        <option value="ETB">ETB</option>
                        <option value="ETS">ETS</option>
                    </select>
                    <input value={quotation.estimatedDeparture || ''}
                        onChange={e => setQ(prev => ({ ...prev, estimatedDeparture: e.target.value }))}
                        onBlur={e => updateField('estimatedDeparture', e.target.value || null)}
                        placeholder="e.g. Beginning July 2025"
                        style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>ETD = Departure · ETA = Arrival · ETC = Completion · ETB = Berthing · ETS = Sailing. Shown before the date on the quotation.</p>
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
