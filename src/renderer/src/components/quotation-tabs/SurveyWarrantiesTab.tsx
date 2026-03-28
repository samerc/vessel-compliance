import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { Quotation, SurveyWarrantyTemplate, SurveyWarrantyTemplateSet, QuotationSurveyWarranty } from '../../../../shared/types'
import { useTheme } from '../../contexts/ThemeContext'

const DEADLINE_PRESETS = [
    'prior inception',
    'within 30 days of inception',
    'within 60 days of inception',
    'within 90 days of inception',
    'prior sailing',
    'prior drydocking',
]

export default function SurveyWarrantiesTab({ quotation, showSuccess, showError }: { quotation: Quotation; showSuccess: (m: string) => void; showError: (m: string) => void }) {
    const [items, setItems] = useState<QuotationSurveyWarranty[]>([])
    const [templates, setTemplates] = useState<SurveyWarrantyTemplate[]>([])
    const [sets, setSets] = useState<SurveyWarrantyTemplateSet[]>([])
    const [customText, setCustomText] = useState('')
    const { theme } = useTheme()
    const isLight = theme === 'light'

    useEffect(() => { loadData() }, [quotation.id])

    const loadData = async () => {
        try {
            const [w, t, s] = await Promise.all([
                window.api.quotationSurveyWarrantyGetAll(quotation.id),
                window.api.surveyWarrantyTemplateGetAll(),
                window.api.surveyWarrantyTemplateSetGetAll()
            ])
            if (Array.isArray(w)) setItems(w)
            if (Array.isArray(t)) setTemplates(t)
            if (Array.isArray(s)) setSets(s)
        } catch (e: any) { showError(e.message) }
    }

    const extractPlaceholders = (text: string): string[] => {
        const matches = text.match(/\{[^}]+\}/g)
        return matches ? [...new Set(matches)] : []
    }

    const resolveText = (item: QuotationSurveyWarranty): string => {
        let resolved = item.text
        if (item.deadlineValue) resolved = resolved.replace(/\{deadline\}/g, item.deadlineValue)
        if (item.daysValue) resolved = resolved.replace(/\{days\}/g, item.daysValue)
        if (item.eventValue) resolved = resolved.replace(/\{event\}/g, item.eventValue)
        return resolved
    }

    const addFromTemplate = async (template: SurveyWarrantyTemplate) => {
        try {
            const result = await window.api.quotationSurveyWarrantyAdd({
                quotationId: quotation.id,
                templateId: template.id,
                text: template.text
            }) as any
            if (result?.error) { showError(result.message); return }
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const applySet = async (set: SurveyWarrantyTemplateSet) => {
        try {
            for (const tid of set.templateIds) {
                const tmpl = templates.find(t => t.id === tid)
                if (!tmpl) continue
                // Skip if already added
                if (items.some(i => i.templateId === tid)) continue
                await window.api.quotationSurveyWarrantyAdd({
                    quotationId: quotation.id,
                    templateId: tmpl.id,
                    text: tmpl.text
                })
            }
            showSuccess(`Applied set "${set.name}"`)
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const addCustom = async () => {
        if (!customText.trim()) return
        try {
            const result = await window.api.quotationSurveyWarrantyAdd({
                quotationId: quotation.id,
                text: customText.trim(),
                customText: customText.trim()
            }) as any
            if (result?.error) { showError(result.message); return }
            setCustomText('')
            loadData()
        } catch (e: any) { showError(e.message) }
    }

    const updateItem = async (id: string, data: Partial<QuotationSurveyWarranty>) => {
        try {
            await window.api.quotationSurveyWarrantyUpdate(id, data)
            setItems(prev => prev.map(i => i.id === id ? { ...i, ...data } : i))
        } catch (e: any) { showError(e.message) }
    }

    const deleteItem = async (id: string) => {
        try {
            await window.api.quotationSurveyWarrantyDelete(id)
            setItems(prev => prev.filter(i => i.id !== id))
        } catch (e: any) { showError(e.message) }
    }

    const reorder = async (idx: number, dir: -1 | 1) => {
        const arr = [...items]
        const [item] = arr.splice(idx, 1)
        arr.splice(idx + dir, 0, item)
        setItems(arr)
        try {
            await window.api.quotationSurveyWarrantySet(quotation.id, arr.map((a, i) => ({ ...a, order: i })))
        } catch (e: any) { showError(e.message) }
    }

    const placeholderColor = (p: string) => {
        if (p === '{deadline}') return { bg: 'rgba(0,170,200,0.15)', text: '#00aac8' }
        if (p === '{days}') return { bg: 'rgba(100,100,255,0.15)', text: '#6464ff' }
        if (p === '{event}') return { bg: 'rgba(255,100,200,0.15)', text: '#ff64c8' }
        return { bg: 'rgba(180,180,180,0.15)', text: 'var(--text-secondary)' }
    }

    // Templates not yet added
    const availableTemplates = templates.filter(t => !items.some(i => i.templateId === t.id))

    return (
        <div>
            {/* Set selector buttons */}
            {sets.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', alignSelf: 'center', marginRight: '4px' }}>Apply Set:</span>
                    {sets.map(s => (
                        <button key={s.id} onClick={() => applySet(s)} className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.78rem' }}>
                            {s.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Add from template dropdown */}
            {availableTemplates.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Add from template:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {availableTemplates.map(t => (
                            <button key={t.id} onClick={() => addFromTemplate(t)} style={{
                                textAlign: 'left', padding: '6px 10px', borderRadius: '6px',
                                border: '1px solid var(--glass-border)', cursor: 'pointer',
                                background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                                color: 'var(--text-primary)', fontSize: '0.82rem', lineHeight: 1.4
                            }}>
                                <div>{t.text.length > 100 ? t.text.slice(0, 100) + '...' : t.text}</div>
                                {t.placeholders.length > 0 && (
                                    <div style={{ display: 'flex', gap: '3px', marginTop: '3px' }}>
                                        {t.placeholders.map(p => {
                                            const pc = placeholderColor(p)
                                            return <span key={p} style={{ fontSize: '0.65rem', padding: '0px 4px', borderRadius: '3px', background: pc.bg, color: pc.text }}>{p}</span>
                                        })}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Selected survey warranties list */}
            {items.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No survey warranties added yet. Add from templates above or create a custom entry below.
                </div>
            )}
            {items.map((item, idx) => {
                const placeholders = extractPlaceholders(item.text)
                const resolved = resolveText(item)
                const hasUnresolved = resolved.includes('{')
                return (
                    <div key={item.id} style={{
                        padding: '12px', marginBottom: '6px',
                        background: isLight ? '#f8f9fb' : 'rgba(255,255,255,0.03)',
                        borderRadius: '8px', border: '1px solid var(--glass-border)',
                        borderLeft: item.customText ? '3px solid #ffb020' : '3px solid #00aac8'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                                    {item.customText ? item.customText : item.text}
                                </div>

                                {/* Placeholder inputs */}
                                {!item.customText && placeholders.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                        {placeholders.includes('{deadline}') && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', color: '#00aac8', fontWeight: 600, minWidth: '65px' }}>{'{deadline}'}:</span>
                                                <select
                                                    value={DEADLINE_PRESETS.includes(item.deadlineValue || '') ? item.deadlineValue : '__custom__'}
                                                    onChange={e => {
                                                        const val = e.target.value
                                                        if (val === '__custom__') {
                                                            updateItem(item.id, { deadlineValue: '' })
                                                        } else {
                                                            updateItem(item.id, { deadlineValue: val })
                                                        }
                                                    }}
                                                    style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                                >
                                                    <option value="">-- select --</option>
                                                    {DEADLINE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                                                    <option value="__custom__">Custom...</option>
                                                </select>
                                                {(!DEADLINE_PRESETS.includes(item.deadlineValue || '') && item.deadlineValue !== undefined) && (
                                                    <input
                                                        type="text"
                                                        value={item.deadlineValue || ''}
                                                        onChange={e => updateItem(item.id, { deadlineValue: e.target.value })}
                                                        placeholder="Enter custom deadline..."
                                                        style={{ flex: 1, padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                                    />
                                                )}
                                            </div>
                                        )}
                                        {placeholders.includes('{days}') && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', color: '#6464ff', fontWeight: 600, minWidth: '65px' }}>{'{days}'}:</span>
                                                <input
                                                    type="number"
                                                    value={item.daysValue || ''}
                                                    onChange={e => updateItem(item.id, { daysValue: e.target.value })}
                                                    placeholder="Number of days"
                                                    style={{ width: '100px', padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                        )}
                                        {placeholders.includes('{event}') && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', color: '#ff64c8', fontWeight: 600, minWidth: '65px' }}>{'{event}'}:</span>
                                                <input
                                                    type="text"
                                                    value={item.eventValue || ''}
                                                    onChange={e => updateItem(item.id, { eventValue: e.target.value })}
                                                    placeholder="e.g. prior sailing"
                                                    style={{ flex: 1, padding: '3px 6px', borderRadius: '4px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Preview of resolved text */}
                                {!item.customText && placeholders.length > 0 && (
                                    <div style={{
                                        marginTop: '8px', padding: '6px 10px', borderRadius: '6px',
                                        background: hasUnresolved ? 'rgba(255,176,32,0.08)' : 'rgba(0,170,200,0.06)',
                                        border: `1px solid ${hasUnresolved ? 'rgba(255,176,32,0.2)' : 'rgba(0,170,200,0.15)'}`,
                                        fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5
                                    }}>
                                        <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: hasUnresolved ? '#ffb020' : '#00aac8', marginRight: '6px' }}>Preview:</span>
                                        {resolved}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginLeft: '8px' }}>
                                <button disabled={idx === 0} onClick={() => reorder(idx, -1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={14} /></button>
                                <button disabled={idx === items.length - 1} onClick={() => reorder(idx, 1)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: idx === items.length - 1 ? 'default' : 'pointer', padding: '1px', opacity: idx === items.length - 1 ? 0.3 : 1 }}><ChevronDown size={14} /></button>
                                <button onClick={() => deleteItem(item.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '1px', marginTop: '4px' }}><Trash2 size={14} /></button>
                            </div>
                        </div>
                    </div>
                )
            })}

            {/* Add custom entry */}
            <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Add custom survey warranty:</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <textarea
                        value={customText}
                        onChange={e => setCustomText(e.target.value)}
                        placeholder="Enter custom survey warranty text..."
                        rows={2}
                        style={{ flex: 1, padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--input-border)', background: isLight ? '#fff' : 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }}
                    />
                    <button onClick={addCustom} disabled={!customText.trim()} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start', opacity: !customText.trim() ? 0.5 : 1 }}>
                        <Plus size={14} /> Add
                    </button>
                </div>
            </div>
        </div>
    )
}

