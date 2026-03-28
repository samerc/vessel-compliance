import { Quotation, PISanctionsVersion } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'

export default function SanctionsTab({ quotation, updateField, setQ, sanctionsVersions }: { quotation: Quotation; updateField: (f: string, v: any) => void; setQ: (fn: (p: Quotation) => Quotation) => void; sanctionsVersions: PISanctionsVersion[] }) {
    const selectedVersion = sanctionsVersions.find(v => v.key === quotation.sanctionsClauseVersion)
    const defaultText = selectedVersion?.text || ''
    const displayText = quotation.sanctionsTextOverride ?? defaultText
    const isOverridden = quotation.sanctionsTextOverride !== undefined && quotation.sanctionsTextOverride !== null

    const handleVersionChange = (key: string) => {
        setQ(p => ({ ...p, sanctionsClauseVersion: key, sanctionsTextOverride: undefined }))
        updateField('sanctionsClauseVersion', key)
        updateField('sanctionsTextOverride', null)
    }

    const handleTextChange = (text: string) => {
        if (text === defaultText) {
            setQ(p => ({ ...p, sanctionsTextOverride: undefined }))
            updateField('sanctionsTextOverride', null)
        } else {
            setQ(p => ({ ...p, sanctionsTextOverride: text }))
            updateField('sanctionsTextOverride', text)
        }
    }

    const handleReset = () => {
        setQ(p => ({ ...p, sanctionsTextOverride: undefined }))
        updateField('sanctionsTextOverride', null)
    }

    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Sanctions Clause</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                Configure the sanctions clause version for this quotation.
            </p>

            {sanctionsVersions.length > 0 ? (
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Sanctions Version</label>
                    <select
                        value={quotation.sanctionsClauseVersion || ''}
                        onChange={e => handleVersionChange(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'var(--bg-input, var(--table-header-bg))', color: 'var(--text-primary)', fontSize: '0.85rem', minWidth: '250px' }}
                    >
                        <option value="">Select a version...</option>
                        {sanctionsVersions.map(v => (
                            <option key={v.id} value={v.key}>{v.name}</option>
                        ))}
                    </select>
                </div>
            ) : (
                <div style={{ padding: '16px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No sanctions versions configured. Add versions in Quotation Settings &rarr; Sanctions Versions tab.
                </div>
            )}

            {(selectedVersion || quotation.sanctionsClauseVersion) && (
                <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Clause Text {isOverridden && <span style={{ color: 'var(--accent-primary)', fontSize: '0.72rem' }}>(customized)</span>}</label>
                        {isOverridden && (
                            <button onClick={handleReset} className="btn-secondary" style={{ padding: '2px 8px', fontSize: '0.72rem' }}>Reset to default</button>
                        )}
                    </div>
                    <RichTextEditor
                        value={displayText}
                        onChange={handleTextChange}
                        minHeight={180}
                        showFontSize showAlignment showLineSpacing
                    />
                </div>
            )}
        </div>
    )
}

