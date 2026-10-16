import React, { useState, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ArrowUpDown } from 'lucide-react'
import { Modal } from '../ui'
import { Quotation, QuotationCustomSection } from '../../../../shared/types'
import { SECTION_LABELS, getDefaultSectionOrder } from '../quotationSettingsConstants'

export default function SectionOrderModal({
  quotation,
  onClose,
  onSave,
  showSuccess,
  showError,
  persist,
  docLabel,
  defaultsLoader
}: {
  quotation: Quotation
  onClose: () => void
  onSave: (order: string[]) => void
  showSuccess: (m: string) => void
  showError: (m: string) => void
  // Kept for callers; the dialog follows the theme by itself
  isLight?: boolean
  // Optional custom persistence (e.g. save onto a policy instead of the quotation)
  persist?: (order: string[]) => Promise<void>
  docLabel?: string
  // Optional custom defaults loader (e.g. policy settings defaults instead of quotation)
  defaultsLoader?: (typeCode: string) => Promise<string[]>
}): React.JSX.Element {
  const loadTypeDefaults = (tc: string): Promise<string[]> =>
    defaultsLoader ? defaultsLoader(tc) : window.api.piGetSectionOrderDefaultsByType(tc)
  const [order, setOrder] = useState<string[]>([])
  const [customSections, setCustomSections] = useState<QuotationCustomSection[]>([])
  const [loading, setLoading] = useState(true)

  const typeCode = quotation.quotationTypeCode || 'P'
  const typeDefaultOrder = getDefaultSectionOrder(typeCode)

  // The order is loaded once when the modal opens, from the props it opened with
  const openedWith = useRef({ quotation, typeCode, typeDefaultOrder, loadTypeDefaults })

  useEffect(() => {
    const { quotation, typeCode, typeDefaultOrder, loadTypeDefaults } = openedWith.current
    const loadData = async (): Promise<void> => {
      setLoading(true)
      const [cs, typeDefaults] = await Promise.all([
        window.api.getQuotationCustomSections(quotation.id),
        loadTypeDefaults(typeCode)
      ])
      const safeSections = Array.isArray(cs) ? cs : []
      setCustomSections(safeSections)

      // Build order: use quotation's saved order, or type-specific defaults, or hardcoded default
      const baseOrder =
        quotation.sectionOrder && quotation.sectionOrder.length > 0
          ? [...quotation.sectionOrder]
          : Array.isArray(typeDefaults) && typeDefaults.length > 0
            ? [...typeDefaults]
            : [...typeDefaultOrder]

      // Add any custom sections not already in the order
      const customKeys = safeSections.map((s) => `custom:${s.id}`)
      for (const ck of customKeys) {
        if (!baseOrder.includes(ck)) baseOrder.push(ck)
      }

      // Remove custom keys that no longer exist
      const validCustomKeys = new Set(customKeys)
      const filtered = baseOrder.filter((k) => !k.startsWith('custom:') || validCustomKeys.has(k))

      // Ensure all type-relevant default keys are present
      for (const dk of typeDefaultOrder) {
        if (!filtered.includes(dk)) filtered.push(dk)
      }

      // Remove sections that don't belong to this type
      const typeKeys = new Set(typeDefaultOrder)
      const finalOrder = filtered.filter((k) => k.startsWith('custom:') || typeKeys.has(k))

      setOrder(finalOrder)
      setLoading(false)
    }
    void loadData()
  }, [])

  const handleMove = (index: number, dir: 'up' | 'down'): void => {
    const newOrder = [...order]
    const swapIdx = dir === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= newOrder.length) return
    ;[newOrder[index], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[index]]
    setOrder(newOrder)
  }

  const handleSave = async (): Promise<void> => {
    try {
      if (persist) await persist(order)
      else await window.api.updateQuotation(quotation.id, { sectionOrder: order })
      showSuccess('Section order saved')
      onSave(order)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save order')
    }
  }

  const handleReset = async (): Promise<void> => {
    const defaults = await loadTypeDefaults(typeCode)
    const baseOrder =
      Array.isArray(defaults) && defaults.length > 0 ? [...defaults] : [...typeDefaultOrder]
    const customKeys = customSections.map((s) => `custom:${s.id}`)
    for (const ck of customKeys) {
      if (!baseOrder.includes(ck)) baseOrder.push(ck)
    }
    setOrder(baseOrder)
  }

  const getLabel = (key: string): string => {
    if (key.startsWith('custom:')) {
      const id = key.replace('custom:', '')
      const section = customSections.find((s) => s.id === id)
      return section ? section.title : 'Unknown Section'
    }
    return SECTION_LABELS[key] || key
  }

  const isCustom = (key: string): boolean => key.startsWith('custom:')

  return (
    <Modal
      title="Section Order"
      icon={<ArrowUpDown size={18} />}
      onClose={onClose}
      width={480}
      closeOnOverlay={false}
      footer={
        <>
          <button onClick={handleReset} className="btn-secondary" style={{ marginRight: 'auto' }}>
            Reset to Defaults
          </button>
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSave} className="btn-primary">
            Save Order
          </button>
        </>
      }
    >
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
        Reorder how sections appear in the exported {docLabel || 'quotation'}.
      </p>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      ) : (
        <div>
          {order.map((key, i) => (
            <div
              key={key}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: `1px solid ${isCustom(key) ? 'rgba(160,100,255,0.3)' : 'var(--table-border)'}`,
                marginBottom: '4px',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                background: isCustom(key) ? 'rgba(160,100,255,0.06)' : 'transparent'
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono)',
                  minWidth: '22px'
                }}
              >
                {i + 1}.
              </span>
              <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>
                {getLabel(key)}
                {isCustom(key) && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--violet)', marginLeft: '8px' }}>
                    (Custom)
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button
                  title="Move up"
                  aria-label="Move up"
                  onClick={() => handleMove(i, 'up')}
                  disabled={i === 0}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: 'var(--text-secondary)',
                    opacity: i === 0 ? 0.3 : 1
                  }}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  title="Move down"
                  aria-label="Move down"
                  onClick={() => handleMove(i, 'down')}
                  disabled={i === order.length - 1}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px',
                    color: 'var(--text-secondary)',
                    opacity: i === order.length - 1 ? 0.3 : 1
                  }}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
