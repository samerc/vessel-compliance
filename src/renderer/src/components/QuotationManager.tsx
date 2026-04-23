import { useState, useEffect, useRef } from 'react'
import { FileText, Settings, List } from 'lucide-react'
import { Quotation } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import QuotationSettings from './QuotationSettings'
import QuotationList from './QuotationList'
import QuotationEditor from './QuotationEditor'

type QuotationView = 'list' | 'settings' | 'editor'

interface QuotationManagerProps {
    onNavigateToPolicy?: (policyId: string) => void
    onNavigateToPolicySetup?: (quotationId: string) => void
    initialQuotationId?: string | null
    onClearInitialQuotation?: () => void
    policyContext?: { policyId: string; policyNumber: string } | null
    onClearPolicyContext?: () => void
    onReturnToPolicy?: (policyId: string) => void
}

export default function QuotationManager({ onNavigateToPolicy, onNavigateToPolicySetup, initialQuotationId, onClearInitialQuotation, policyContext, onClearPolicyContext, onReturnToPolicy }: QuotationManagerProps) {
    const { hasPermission } = useAuth()
    const canSettings = hasPermission('quotations:settings')
    const [view, setView] = useState<QuotationView>('list')
    const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null)
    const [activePolicyContext, setActivePolicyContext] = useState<{ policyId: string; policyNumber: string } | null>(null)
    const [listKey, setListKey] = useState(0)
    const initialLoadRef = useRef(false)

    // Auto-open quotation when navigating from policy
    useEffect(() => {
        if (initialQuotationId && !initialLoadRef.current) {
            initialLoadRef.current = true
            if (policyContext) setActivePolicyContext(policyContext)
            window.api.getQuotation(initialQuotationId).then(q => {
                if (q && !(q as any).error) {
                    setEditingQuotation(q)
                    setView('editor')
                }
                if (onClearInitialQuotation) onClearInitialQuotation()
                if (onClearPolicyContext) onClearPolicyContext()
            })
        }
    }, [initialQuotationId])

    const handleOpenEditor = (quotation: Quotation) => {
        setEditingQuotation(quotation)
        setView('editor')
    }

    const handleBackToList = () => {
        setEditingQuotation(null)
        setActivePolicyContext(null)
        setView('list')
        setListKey(k => k + 1)
    }

    return (
        <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
            {view !== 'editor' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <FileText size={28} /> Quotations
                    </h1>
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-card)', borderRadius: '10px', padding: '4px', border: '1px solid var(--glass-border)' }}>
                        <button
                            onClick={() => setView('list')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                fontWeight: view === 'list' ? '600' : '400',
                                background: view === 'list' ? 'var(--accent-primary)' : 'transparent',
                                color: view === 'list' ? '#fff' : 'var(--text-secondary)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.2s'
                            }}
                        >
                            <List size={16} /> Quotations
                        </button>
                        {canSettings && (
                            <button
                                onClick={() => setView('settings')}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: view === 'settings' ? '600' : '400',
                                    background: view === 'settings' ? 'var(--accent-primary)' : 'transparent',
                                    color: view === 'settings' ? '#fff' : 'var(--text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <Settings size={16} /> Settings
                            </button>
                        )}
                    </div>
                </div>
            )}

            {view === 'list' && <QuotationList key={listKey} onOpenQuotation={handleOpenEditor} />}
            {view === 'settings' && canSettings && <QuotationSettings />}
            {view === 'editor' && editingQuotation && (
                <QuotationEditor
                    key={editingQuotation.id}
                    quotation={editingQuotation}
                    onBack={handleBackToList}
                    onOpenQuotation={handleOpenEditor}
                    onNavigateToPolicy={onNavigateToPolicy}
                    onNavigateToPolicySetup={onNavigateToPolicySetup}
                    policyContext={activePolicyContext}
                    onReturnToPolicy={onReturnToPolicy ? (policyId) => { setActivePolicyContext(null); onReturnToPolicy(policyId) } : undefined}
                />
            )}
        </div>
    )
}
