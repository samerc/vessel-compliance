import React, { useState, useEffect, useRef } from 'react'
import { useRequestedSubTab, SubTabProps } from '../utils/useRequestedSubTab'
import { FileText, Settings, List } from 'lucide-react'
import { Quotation } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import QuotationSettings from './QuotationSettings'
import QuotationList from './QuotationList'
import QuotationEditor from './QuotationEditor'
import { PageHeader, SegmentedControl } from './ui'

type QuotationView = 'list' | 'settings' | 'editor'

interface QuotationManagerProps extends SubTabProps {
  onNavigateToPolicy?: (policyId: string) => void
  onNavigateToPolicySetup?: (quotationId: string) => void
  initialQuotationId?: string | null
  onClearInitialQuotation?: () => void
  policyContext?: { policyId: string; policyNumber: string } | null
  onClearPolicyContext?: () => void
  onReturnToPolicy?: (policyId: string) => void
  openCreate?: boolean
  onCreateConsumed?: () => void
}

export default function QuotationManager({
  onNavigateToPolicy,
  onNavigateToPolicySetup,
  initialQuotationId,
  onClearInitialQuotation,
  policyContext,
  onClearPolicyContext,
  onReturnToPolicy,
  openCreate,
  onCreateConsumed,
  subTab,
  subTabNonce
}: QuotationManagerProps): React.JSX.Element {
  const { hasPermission } = useAuth()
  const canSettings = hasPermission('quotations:settings')
  const [view, setView] = useState<QuotationView>('list')
  const [editingQuotation, setEditingQuotation] = useState<Quotation | null>(null)
  useRequestedSubTab(
    subTab,
    subTabNonce,
    (canSettings ? ['list', 'settings'] : ['list']) as QuotationView[],
    (v) => {
      setEditingQuotation(null)
      setView(v)
    }
  )
  const [activePolicyContext, setActivePolicyContext] = useState<{
    policyId: string
    policyNumber: string
  } | null>(null)
  const [listKey, setListKey] = useState(0)
  const [listSearch, setListSearch] = useState('')
  // The quotation id last opened from outside (Recent, a policy...); cleared with the request
  const initialLoadRef = useRef<string | null>(null)

  // Auto-open quotation when navigating from policy
  useEffect(() => {
    if (!initialQuotationId) {
      initialLoadRef.current = null
      return
    }
    if (initialLoadRef.current !== initialQuotationId) {
      const requestedId = initialQuotationId
      initialLoadRef.current = requestedId
      window.api.getQuotation(requestedId).then((q) => {
        // A newer request (another Recent click) replaced this one
        if (initialLoadRef.current !== requestedId) return
        if (policyContext) setActivePolicyContext(policyContext)
        if (q && !(q as { error?: unknown }).error) {
          setEditingQuotation(q)
          setView('editor')
        }
        if (onClearInitialQuotation) onClearInitialQuotation()
        if (onClearPolicyContext) onClearPolicyContext()
      })
    }
    // initialLoadRef opens each requested id once, so the callbacks/context changing never re-trigger it
  }, [initialQuotationId, policyContext, onClearInitialQuotation, onClearPolicyContext])

  const handleOpenEditor = (quotation: Quotation): void => {
    setEditingQuotation(quotation)
    setView('editor')
  }

  const handleBackToList = (): void => {
    setEditingQuotation(null)
    setActivePolicyContext(null)
    setView('list')
    setListKey((k) => k + 1)
  }

  return (
    <div className="page">
      {view !== 'editor' && (
        <PageHeader
          icon={<FileText size={26} />}
          title="Quotations"
          actions={
            canSettings && (
              <SegmentedControl
                value={view}
                onChange={setView}
                items={[
                  { key: 'list', label: 'Quotations', icon: <List size={15} /> },
                  { key: 'settings', label: 'Settings', icon: <Settings size={15} /> }
                ]}
              />
            )
          }
        />
      )}

      {view === 'list' && (
        <QuotationList
          key={listKey}
          onOpenQuotation={handleOpenEditor}
          initialSearch={listSearch}
          onSearchChange={setListSearch}
          openCreate={openCreate}
          onCreateConsumed={onCreateConsumed}
        />
      )}
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
          onReturnToPolicy={
            onReturnToPolicy
              ? (policyId) => {
                  setActivePolicyContext(null)
                  onReturnToPolicy(policyId)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
