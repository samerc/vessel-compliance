import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Search, Ship, Building2, FileText, FileCheck, X, Loader2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'

interface GlobalSearchProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (type: string, id: string, extra?: any) => void
}

interface SearchResults {
  vessels: Array<{ id: string; name: string; imoNumber: string; isActive: boolean }>
  entities: Array<{ id: string; name: string; type: string }>
  quotations: Array<{
    id: string
    referenceNumber: string
    quotationDate: string
    quotationTypeName: string
    quotationTypeCode: string
  }>
  policies: Array<{
    id: string
    policyNumber: string
    vesselId: string
    vesselName: string
    policyTypeName: string
    status: string
  }>
}

interface FlatItem {
  category: 'vessel' | 'entity' | 'quotation' | 'policy'
  id: string
  extra?: any
}

export default function GlobalSearch({ isOpen, onClose, onNavigate }: GlobalSearchProps) {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)
  const [loading, setLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const listRef = useRef<HTMLDivElement>(null)

  // Flatten results into ordered list for keyboard navigation
  const flatItems = useMemo<FlatItem[]>(() => {
    if (!results) return []
    const items: FlatItem[] = []
    for (const v of results.vessels) items.push({ category: 'vessel', id: v.id })
    for (const e of results.entities) items.push({ category: 'entity', id: e.id })
    for (const q of results.quotations) items.push({ category: 'quotation', id: q.id })
    for (const p of results.policies) items.push({ category: 'policy', id: p.id, extra: p })
    return items
  }, [results])

  const totalCount = flatItems.length

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setResults(null)
      setHighlightIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Debounced search
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await window.api.globalSearch(q.trim())
      if (res && !(res as any).error) {
        setResults(res)
        setHighlightIndex(0)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value
      setQuery(val)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => doSearch(val), 300)
    },
    [doSearch]
  )

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((prev) => Math.min(prev + 1, totalCount - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && totalCount > 0) {
        e.preventDefault()
        const item = flatItems[highlightIndex]
        if (item) {
          onNavigate(item.category, item.id, item.extra)
          onClose()
        }
      }
    },
    [flatItems, highlightIndex, totalCount, onClose, onNavigate]
  )

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${highlightIndex}"]`) as HTMLElement
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  // Close on backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).getAttribute('data-backdrop') === 'true') {
        onClose()
      }
    },
    [onClose]
  )

  if (!isOpen) return null

  const modalBg = isLight ? '#ffffff' : '#1a1d28'
  const borderColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
  const accentBg = isLight ? 'rgba(0,170,200,0.1)' : 'rgba(0,210,255,0.1)'

  let flatIdx = -1

  const renderCategory = (
    label: string,
    icon: React.ReactNode,
    items: any[],
    category: string,
    renderItem: (item: any, idx: number) => React.ReactNode
  ) => {
    if (items.length === 0) return null
    return (
      <div key={category}>
        <div
          style={{
            padding: '8px 16px 4px',
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          {icon}
          {label}
        </div>
        {items.map((item) => {
          flatIdx++
          const currentFlatIdx = flatIdx
          return renderItem(item, currentFlatIdx)
        })}
      </div>
    )
  }

  const itemStyle = (idx: number): React.CSSProperties => ({
    padding: '8px 16px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    borderRadius: '6px',
    margin: '0 8px',
    transition: 'background 0.1s',
    background: idx === highlightIndex ? accentBg : 'transparent',
  })

  const hasResults =
    results &&
    (results.vessels.length > 0 ||
      results.entities.length > 0 ||
      results.quotations.length > 0 ||
      results.policies.length > 0)

  const noResults = results && !hasResults && query.trim().length >= 2

  return (
    <div
      data-backdrop="true"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
        background: 'rgba(0,0,0,0.5)',
        animation: 'modalFadeIn 0.15s ease',
      }}
    >
      <div
        style={{
          width: '500px',
          maxHeight: '60vh',
          background: modalBg,
          borderRadius: '14px',
          border: `1px solid ${borderColor}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 16px',
            borderBottom: `1px solid ${borderColor}`,
          }}
        >
          {loading ? (
            <Loader2
              size={18}
              style={{ color: 'var(--accent-primary)', animation: 'spin 1s linear infinite', flexShrink: 0 }}
            />
          ) : (
            <Search size={18} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          )}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search everything..."
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '1rem',
              color: 'var(--text-primary)',
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setResults(null)
                inputRef.current?.focus()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={16} />
            </button>
          )}
          <kbd
            style={{
              fontSize: '0.68rem',
              padding: '2px 6px',
              borderRadius: '4px',
              background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)',
              color: 'var(--text-secondary)',
              border: `1px solid ${borderColor}`,
              flexShrink: 0,
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {!results && query.trim().length < 2 && (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
              }}
            >
              Type to search across vessels, entities, quotations, and policies
            </div>
          )}

          {noResults && (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem',
              }}
            >
              No results found for &apos;{query}&apos;
            </div>
          )}

          {hasResults && (
            <>
              {renderCategory(
                'Vessels',
                <Ship size={12} />,
                results!.vessels,
                'vessels',
                (v, idx) => (
                  <div
                    key={v.id}
                    data-idx={idx}
                    style={itemStyle(idx)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => {
                      onNavigate('vessel', v.id)
                      onClose()
                    }}
                  >
                    <Ship
                      size={16}
                      style={{ color: 'var(--accent-primary)', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          opacity: v.isActive ? 1 : 0.5,
                        }}
                      >
                        {v.name}
                        {!v.isActive && (
                          <span
                            style={{
                              fontSize: '0.65rem',
                              marginLeft: '6px',
                              color: 'var(--text-secondary)',
                              fontWeight: 400,
                            }}
                          >
                            (Inactive)
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        IMO: {v.imoNumber || 'N/A'}
                      </div>
                    </div>
                  </div>
                )
              )}

              {renderCategory(
                'Entities',
                <Building2 size={12} />,
                results!.entities,
                'entities',
                (e, idx) => (
                  <div
                    key={e.id}
                    data-idx={idx}
                    style={itemStyle(idx)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => {
                      onNavigate('entity', e.id)
                      onClose()
                    }}
                  >
                    <Building2
                      size={16}
                      style={{ color: '#6464ff', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {e.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {e.type}
                      </div>
                    </div>
                  </div>
                )
              )}

              {renderCategory(
                'Quotations',
                <FileText size={12} />,
                results!.quotations,
                'quotations',
                (q, idx) => (
                  <div
                    key={q.id}
                    data-idx={idx}
                    style={itemStyle(idx)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => {
                      onNavigate('quotation', q.id)
                      onClose()
                    }}
                  >
                    <FileText
                      size={16}
                      style={{ color: '#ff64c8', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {q.referenceNumber}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {q.quotationTypeName || q.quotationTypeCode}
                        {q.quotationDate ? ` — ${q.quotationDate}` : ''}
                      </div>
                    </div>
                  </div>
                )
              )}

              {renderCategory(
                'Policies',
                <FileCheck size={12} />,
                results!.policies,
                'policies',
                (p, idx) => (
                  <div
                    key={p.id}
                    data-idx={idx}
                    style={itemStyle(idx)}
                    onMouseEnter={() => setHighlightIndex(idx)}
                    onClick={() => {
                      onNavigate(p.source === 'vessel_policy' ? 'vessel_policy' : 'policy', p.source === 'vessel_policy' ? p.vesselId : p.id, p)
                      onClose()
                    }}
                  >
                    <FileCheck
                      size={16}
                      style={{ color: '#44cc88', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.88rem',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {p.policyNumber || 'No Number'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {p.policyTypeName ? `${p.policyTypeName} — ` : ''}
                        {p.vesselName || 'Unknown Vessel'}
                        {p.status === 'inactive' && ' (Inactive)'}
                      </div>
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>

        {/* Footer hint */}
        {hasResults && (
          <div
            style={{
              padding: '8px 16px',
              borderTop: `1px solid ${borderColor}`,
              fontSize: '0.72rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span>
              <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', border: `1px solid ${borderColor}`, fontSize: '0.65rem' }}>
                &#8593;&#8595;
              </kbd>{' '}
              to navigate
            </span>
            <span>
              <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', border: `1px solid ${borderColor}`, fontSize: '0.65rem' }}>
                Enter
              </kbd>{' '}
              to select
            </span>
            <span>
              <kbd style={{ padding: '1px 4px', borderRadius: '3px', background: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.08)', border: `1px solid ${borderColor}`, fontSize: '0.65rem' }}>
                Esc
              </kbd>{' '}
              to close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
