import { useState, useEffect, useRef } from 'react'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  X,
  Pencil,
  Save,
  Search,
  Download
} from 'lucide-react'
import {
  Quotation,
  PISubjectivity,
  QuotationSubjectivity,
  QuotationVessel,
  DocumentType
} from '../../../../shared/types'
import VesselScopeChips from '../VesselScopeChips'
import { ok } from '../../utils/ipc'
import { confirmDelete } from './sharedUtils'
import {
  loadSubjectivities,
  autoPopulate,
  autoSetSubjectivityScopes,
  type SubjectivitySink
} from './subjectivityDefaults'

export default function SubjectivitiesTab({
  quotation,
  showSuccess
}: {
  quotation: Quotation
  showSuccess: (m: string) => void
  showError: (m: string) => void
  isLight: boolean
}): React.JSX.Element {
  const [items, setItems] = useState<QuotationSubjectivity[]>([])
  const [masterList, setMasterList] = useState<PISubjectivity[]>([])
  const [docTypes, setDocTypes] = useState<DocumentType[]>([])
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [showMasterPicker, setShowMasterPicker] = useState(false)
  const [subjectivityDays, setSubjectivityDays] = useState(quotation.subjectivityDays ?? 0)
  const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
  const [scopeAutoDetected, setScopeAutoDetected] = useState(false)
  const autoPopulateRan = useRef(false)

  const sink: SubjectivitySink = {
    setItems,
    setMasterList,
    setDocTypes,
    setQVessels,
    setScopeAutoDetected
  }
  // The settings lists come from the editor-session cache, so a reload re-reads only this
  // quotation's rows
  const loadData = (): Promise<void> =>
    loadSubjectivities(
      quotation.id,
      quotation.quotationTypeCode,
      sink,
      autoPopulateRan,
      !!quotation.subjectivitiesFilled
    )

  useEffect(() => {
    void loadSubjectivities(
      quotation.id,
      quotation.quotationTypeCode,
      { setItems, setMasterList, setDocTypes, setQVessels, setScopeAutoDetected },
      autoPopulateRan,
      !!quotation.subjectivitiesFilled
    )
    // subjectivitiesFilled is read once per quotation: the first load decides
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quotation.id, quotation.quotationTypeCode])

  const handleAddCustom = async (): Promise<void> => {
    if (!newText.trim()) return
    await window.api.addQuotationSubjectivity({
      quotationId: quotation.id,
      text: newText.trim(),
      isCustom: true,
      order: items.length
    })
    setNewText('')
    showSuccess('Custom subjectivity added')
    loadData()
  }

  const handleAddFromMaster = async (m: PISubjectivity): Promise<void> => {
    if (items.some((i) => i.piSubjectivityId === m.id)) return
    await window.api.addQuotationSubjectivity({
      quotationId: quotation.id,
      piSubjectivityId: m.id,
      text: m.text,
      order: m.order ?? items.length
    })
    showSuccess('Added from master')
    // Re-sort all items by master order
    await resortByMasterOrder()
  }

  const resortByMasterOrder = async (): Promise<void> => {
    const refreshed = await window.api.getQuotationSubjectivities(quotation.id)
    const safeItems = Array.isArray(refreshed) ? refreshed : []
    // Build order map from master list
    const masterOrderMap = new Map(masterList.map((m) => [m.id, m.order ?? 999]))
    // Sort: master items by their settings order, custom items at end
    safeItems.sort((a, b) => {
      const aOrder = a.piSubjectivityId ? (masterOrderMap.get(a.piSubjectivityId) ?? 999) : 9999
      const bOrder = b.piSubjectivityId ? (masterOrderMap.get(b.piSubjectivityId) ?? 999) : 9999
      return aOrder - bOrder
    })
    // Save the new order
    for (let i = 0; i < safeItems.length; i++) {
      if (safeItems[i].order !== i) {
        ok(await window.api.updateQuotationSubjectivity(safeItems[i].id, { order: i }))
      }
    }
    setItems(safeItems.map((s, i) => ({ ...s, order: i })))
  }

  const handleUpdate = async (): Promise<void> => {
    if (!editingId || !editText.trim()) return
    ok(await window.api.updateQuotationSubjectivity(editingId, { text: editText.trim() }))
    setEditingId(null)
    loadData()
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!(await confirmDelete('subjectivity', items.find((x) => x.id === id)?.text))) return
    await window.api.deleteQuotationSubjectivity(id)
    loadData()
  }

  const handleMove = async (idx: number, dir: -1 | 1): Promise<void> => {
    const arr = [...items]
    const targetIdx = idx + dir
    if (targetIdx < 0 || targetIdx >= arr.length) return
    ;[arr[idx], arr[targetIdx]] = [arr[targetIdx], arr[idx]]
    setItems(arr)
    for (let i = 0; i < arr.length; i++) {
      ok(await window.api.updateQuotationSubjectivity(arr[i].id, { order: i }))
    }
  }

  const updateSubjectivityScope = async (id: string, scope: string[] | null): Promise<void> => {
    setItems((prev) => prev.map((s) => (s.id === id ? { ...s, vesselScope: scope } : s)))
    ok(await window.api.updateQuotationSubjectivity(id, { vesselScope: scope }))
  }

  const handleAutoDetectScopes = async (): Promise<void> => {
    if (qVessels.length < 2) {
      showSuccess('Auto-detect requires 2 or more vessels')
      return
    }
    try {
      const scopes = await autoSetSubjectivityScopes(items, qVessels, masterList)
      const updated = items.map((s) => ({
        ...s,
        vesselScope: scopes[s.id] !== undefined ? scopes[s.id] : s.vesselScope
      }))
      setItems(updated)
      for (const s of updated) {
        if (scopes[s.id] !== undefined) {
          await window.api.updateQuotationSubjectivity(s.id, { vesselScope: scopes[s.id] })
        }
      }
      setScopeAutoDetected(true)
      showSuccess('Vessel scopes auto-detected from uploaded documents')
    } catch (err) {
      console.error('Auto-detect scopes error:', err)
    }
  }

  const handleRePopulate = async (): Promise<void> => {
    if (masterList.length === 0) {
      showSuccess('No master subjectivities configured — add them in Quotation Settings first')
      return
    }
    // Remove all non-custom items (auto-populated + old items without flag), then re-run
    const nonCustomItems = items.filter((i) => !i.isCustom)
    for (const item of nonCustomItems) {
      await window.api.deleteQuotationSubjectivity(item.id)
    }
    await autoPopulate(quotation.id, masterList, docTypes, sink)
    showSuccess('Re-populated from vessel documents')
  }

  const addedMasterIds = new Set(
    items.filter((i) => i.piSubjectivityId).map((i) => i.piSubjectivityId)
  )
  const availableMasters = masterList.filter((m) => !addedMasterIds.has(m.id))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '14px' }}>Subjectivities</h3>
        <span
          style={{
            fontSize: '0.72rem',
            padding: '2px 8px',
            borderRadius: '10px',
            background: 'var(--table-header-bg)',
            color: 'var(--text-secondary)'
          }}
        >
          {items.length}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {qVessels.length >= 2 && items.length > 0 && (
            <button
              onClick={handleAutoDetectScopes}
              className="btn-secondary"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Search size={14} /> Auto-detect Scopes
            </button>
          )}
          {availableMasters.length > 0 && (
            <button
              onClick={() => setShowMasterPicker(!showMasterPicker)}
              className="btn-secondary"
              style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Plus size={14} /> From Master
            </button>
          )}
          <button
            onClick={handleRePopulate}
            className="btn-secondary"
            style={{ fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Download size={14} /> Re-populate
          </button>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '14px',
          padding: '10px 14px',
          borderRadius: '8px',
          background: 'color-mix(in srgb, var(--text-primary) 3%, transparent)',
          border: '1px solid var(--table-border)'
        }}
      >
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          Documents to be provided
        </span>
        <input
          type="number"
          min={0}
          value={subjectivityDays}
          onChange={(e) => {
            const v = Math.max(0, parseInt(e.target.value) || 0)
            setSubjectivityDays(v)
            window.api
              .updateQuotation(quotation.id, { subjectivityDays: v })
              .then(ok)
              .catch(() => {})
          }}
          style={{
            width: '60px',
            textAlign: 'center'
          }}
        />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          {subjectivityDays === 0 ? 'days (0 = prior inception)' : 'days prior inception'}
        </span>
      </div>

      {/* Master picker dropdown */}
      {showMasterPicker && availableMasters.length > 0 && (
        <div
          style={{
            marginBottom: '12px',
            padding: '10px',
            borderRadius: '8px',
            border: '1px solid var(--accent-primary)',
            background: 'rgba(var(--accent-primary-rgb), 0.05)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Select from master list:
            </span>
            <button
              className="btn-secondary"
              style={{ padding: '3px 10px', fontSize: '0.72rem' }}
              onClick={async () => {
                for (const m of availableMasters) {
                  if (items.some((i) => i.piSubjectivityId === m.id)) continue
                  // Skip if all linked doc types are non-required (optional)
                  if (
                    m.docTypeIds &&
                    m.docTypeIds.length > 0 &&
                    m.docTypeIds.every((id) => {
                      const dt = docTypes.find((d) => d.id === id)
                      return dt && !dt.required
                    })
                  )
                    continue
                  await window.api.addQuotationSubjectivity({
                    quotationId: quotation.id,
                    piSubjectivityId: m.id,
                    text: m.text,
                    order: m.order ?? items.length
                  })
                }
                showSuccess('All subjectivities added')
                await resortByMasterOrder()
                setShowMasterPicker(false)
              }}
            >
              Select All
            </button>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              {availableMasters.length} available
            </span>
          </div>
          {availableMasters.map((m) => (
            <div
              key={m.id}
              onClick={() => {
                handleAddFromMaster(m)
                setShowMasterPicker(false)
              }}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '0.82rem',
                cursor: 'pointer',
                marginBottom: '4px',
                border: '1px solid var(--table-border)'
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(var(--accent-primary-rgb), 0.08)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {m.text}
              {m.docTypeIds && m.docTypeIds.length > 0 && (
                <span
                  style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginLeft: '8px' }}
                >
                  (
                  {m.docTypeIds
                    .map((dtId) => docTypes.find((d) => d.id === dtId)?.name)
                    .filter(Boolean)
                    .join(', ')}
                  )
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Item list */}
      {items.map((item, idx) => (
        <div
          key={item.id}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid var(--table-border)',
            marginBottom: '6px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editingId === item.id ? (
              <div style={{ flex: 1, display: 'flex', gap: '6px', alignItems: 'center' }}>
                <input
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{ flex: 1 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdate()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  autoFocus
                />
                <button
                  title="Save"
                  aria-label="Save"
                  onClick={handleUpdate}
                  className="btn-primary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                >
                  <Save size={12} />
                </button>
                <button
                  title="Cancel"
                  aria-label="Cancel"
                  onClick={() => setEditingId(null)}
                  className="btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '0.85rem' }}>
                  {item.text}
                  {item.isAutoPopulated && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--accent-primary)',
                        marginLeft: '6px'
                      }}
                    >
                      (auto)
                    </span>
                  )}
                  {item.isCustom && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        color: 'var(--text-secondary)',
                        marginLeft: '6px'
                      }}
                    >
                      (custom)
                    </span>
                  )}
                  {scopeAutoDetected && item.vesselScope && item.vesselScope.length > 0 && (
                    <span
                      style={{ fontSize: '0.68rem', color: 'var(--success)', marginLeft: '4px' }}
                    >
                      (scope auto-detected)
                    </span>
                  )}
                </span>
                <button
                  title="Move up"
                  aria-label="Move up"
                  onClick={() => handleMove(idx, -1)}
                  disabled={idx === 0}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '2px'
                  }}
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  title="Move down"
                  aria-label="Move down"
                  onClick={() => handleMove(idx, 1)}
                  disabled={idx === items.length - 1}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '2px'
                  }}
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  title="Edit"
                  aria-label="Edit"
                  onClick={() => {
                    setEditingId(item.id)
                    setEditText(item.text)
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '2px'
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  title="Delete"
                  aria-label="Delete"
                  onClick={() => handleDelete(item.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--danger)',
                    padding: '2px'
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
          <div style={{ paddingLeft: '30px' }}>
            <VesselScopeChips
              vessels={qVessels}
              vesselScope={item.vesselScope}
              onChange={(scope) => updateSubjectivityScope(item.id, scope)}
            />
          </div>
        </div>
      ))}

      {/* Custom add */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="Add custom subjectivity..."
          style={{ flex: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAddCustom()
          }}
        />
        <button
          onClick={handleAddCustom}
          className="btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '0.8rem',
            flexShrink: 0
          }}
        >
          <Plus size={14} /> Add
        </button>
      </div>
    </div>
  )
}
