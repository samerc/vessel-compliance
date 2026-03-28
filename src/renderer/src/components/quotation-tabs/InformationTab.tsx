import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Quotation } from '../../../../shared/types'

export default function InformationTab({ quotation, updateField, setQ, showSuccess }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
    const [items, setItems] = useState<any[]>([])
    const [newText, setNewText] = useState('')

    useEffect(() => { loadData() }, [])
    const loadData = async () => { setItems(await window.api.getQuotationInformation(quotation.id)) }

    const handleAdd = async () => {
        if (!newText.trim()) return
        await window.api.addQuotationInformation({ quotationId: quotation.id, text: newText, order: items.length })
        setNewText('')
        showSuccess('Information item added')
        loadData()
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Information</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>Add additional information items and validity period for this quotation.</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', maxWidth: '300px' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Validity (days):</span>
                <input type="number" value={quotation.validityDays} onChange={e => { setQ(p => ({ ...p, validityDays: parseInt(e.target.value) || 14 })) }} onBlur={e => updateField('validityDays', parseInt(e.target.value) || 14)} style={{ width: '80px' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                <input type="text" value={newText} onChange={e => setNewText(e.target.value)} placeholder="Information item..." style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') handleAdd() }} />
                <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Add</button>
            </div>
            {items.map(item => (
                <div key={item.id} style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--table-border)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ flex: 1, fontSize: '0.85rem' }}>{item.text}</span>
                    <button onClick={async () => { await window.api.deleteQuotationInformation(item.id); loadData() }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button>
                </div>
            ))}
        </div>
    )
}
