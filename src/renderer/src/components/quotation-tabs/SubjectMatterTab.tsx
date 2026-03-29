import { Quotation } from '../../../../shared/types'
import RichTextEditor from '../RichTextEditor'

export default function SubjectMatterTab({ quotation, updateField, setQ }: {
    quotation: Quotation
    updateField: (field: string, value: any) => void
    setQ: (fn: (prev: Quotation) => Quotation) => void
}) {
    return (
        <div>
            <h3 style={{ fontSize: '1rem', marginBottom: '16px' }}>Subject Matter Insured</h3>
            <RichTextEditor
                value={quotation.subjectMatter || ''}
                onChange={val => {
                    setQ(prev => ({ ...prev, subjectMatter: val }))
                    updateField('subjectMatter', val || null)
                }}
                minHeight={150}
            />
        </div>
    )
}
