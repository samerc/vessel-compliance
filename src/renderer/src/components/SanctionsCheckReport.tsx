import React, { useState, useEffect, useRef } from 'react'
import {
  Search,
  FileText,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  X,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { getReportSettings } from '../services/ReportSettingsService'
import { formatDate } from '../utils/dateUtils'
import { Entity, SanctionsMatch, SanctionsReportListResult } from '../../../shared/types'
import { Field } from './ui'

const SOURCES: { code: string; label: string }[] = [
  { code: 'OFAC', label: 'OFAC (US Treasury)' },
  { code: 'EU', label: 'European Union' },
  { code: 'UK', label: 'UK (FCDO)' },
  { code: 'UN', label: 'United Nations' },
  { code: 'ISF', label: 'ISF (Lebanon)' },
  { code: 'SIC', label: 'SIC (Lebanon)' }
]

type Decision = 'CLEARED' | 'SANCTIONED' | null

export default function SanctionsCheckReport(): React.JSX.Element {
  const { showError, showSuccess } = useToast()
  const { user } = useAuth()

  const [subjectName, setSubjectName] = useState('')
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null)
  const [entities, setEntities] = useState<Entity[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const [threshold, setThreshold] = useState(user?.sanctionsThreshold || 60)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<SanctionsReportListResult[] | null>(null)
  const [decision, setDecision] = useState<Decision>(null)
  // The decision already stored for this run (audit record + linked entity's status)
  const [savedDecision, setSavedDecision] = useState<Decision>(null)
  const [savingDecision, setSavingDecision] = useState(false)
  // The list entries above the threshold, shown so the decision can be made on the facts
  const [matches, setMatches] = useState<SanctionsMatch[]>([])
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    window.api
      .getEntities()
      .then((e) => setEntities(Array.isArray(e) ? e : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  // Reset results when the subject changes
  const resetResults = (): void => {
    setResults(null)
    setDecision(null)
    setSavedDecision(null)
    setMatches([])
    setCheckedAt(null)
  }

  const entityMatches = subjectName.trim()
    ? entities
        .filter((e) => e.name.toLowerCase().includes(subjectName.trim().toLowerCase()))
        .slice(0, 8)
    : entities.slice(0, 8)

  const anyPotential = results ? results.some((r) => r.status === 'POTENTIAL_MATCH') : false

  const runCheck = async (): Promise<void> => {
    const query = subjectName.trim()
    if (!query) {
      showError('Enter a name or pick an entity to screen')
      return
    }
    setRunning(true)
    resetResults()
    try {
      const resp = await window.api.checkSanctions(
        query,
        threshold / 100,
        SOURCES.map((s) => s.code)
      )
      // Lists not loaded: nothing was screened, so no list may read as clear
      if (resp?.status === 'ERROR') throw new Error(resp.error || 'The sanctions check failed')
      const found: SanctionsMatch[] = (resp?.matches || [])
        .filter((m: SanctionsMatch) => Math.round((m.score || 0) * 100) >= threshold)
        .sort((a: SanctionsMatch, b: SanctionsMatch) => (b.score || 0) - (a.score || 0))
      setMatches(found)
      const perList: SanctionsReportListResult[] = SOURCES.map((s) => {
        const cnt = found.filter((m) => (m.source || '').toUpperCase() === s.code).length
        return { source: s.code, status: cnt > 0 ? 'POTENTIAL_MATCH' : 'CLEAR', matchCount: cnt }
      })
      setResults(perList)
      setCheckedAt(new Date())
      // Auto-clear when every list is clean; otherwise require an explicit decision
      setDecision(perList.some((r) => r.status === 'POTENTIAL_MATCH') ? null : 'CLEARED')
    } catch (err) {
      setResults(null)
      setDecision(null)
      showError((err instanceof Error && err.message) || 'Sanctions check failed')
    } finally {
      setRunning(false)
    }
  }

  // Stores a decision as soon as it is made: the screening record for the audit history and,
  // when a stored entity was screened, its sanctions status. Errors are reported, not hidden
  const recordDecision = async (d: 'CLEARED' | 'SANCTIONED'): Promise<boolean> => {
    if (!results || !checkedAt) return false
    setSavingDecision(true)
    try {
      await window.api.sanctionsReportSave({
        subjectName: subjectName.trim(),
        entityId: selectedEntity?.id || null,
        entityType: selectedEntity ? 'entity' : null,
        threshold,
        decision: d,
        results,
        checkedBy: user?.fullName || user?.username || null
      })
      if (selectedEntity) {
        await window.api.updateEntity(selectedEntity.id, {
          ofacStatus: d === 'SANCTIONED' ? 'MATCH' : 'CLEARED',
          ofacCheckedAt: checkedAt.toISOString(),
          ofacMatchFound: d === 'SANCTIONED'
        })
      }
      setDecision(d)
      setSavedDecision(d)
      showSuccess(
        selectedEntity
          ? `${selectedEntity.name} marked ${d === 'SANCTIONED' ? 'sanctioned' : 'cleared'}`
          : `Decision saved: ${d === 'SANCTIONED' ? 'sanctioned' : 'cleared'}`
      )
      return true
    } catch (err) {
      showError(
        `The decision was not saved: ${(err instanceof Error && err.message) || 'unknown error'}`
      )
      return false
    } finally {
      setSavingDecision(false)
    }
  }

  const handleExport = async (): Promise<void> => {
    if (!results || !checkedAt) return
    if (!decision) {
      showError('Clear or sanction the subject before exporting')
      return
    }
    // A clean run decides itself: it is stored with the export
    if (savedDecision !== decision && !(await recordDecision(decision))) return
    setExporting(true)
    try {
      const checkedBy = user?.fullName || user?.username || null
      await exportPdf({
        subjectName: subjectName.trim(),
        entity: selectedEntity,
        threshold,
        decision,
        results,
        checkedBy,
        checkedAt
      })
      showSuccess('Sanctions report exported')
    } catch {
      showError('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  // ── styles ──
  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: 'var(--glass-border)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '16px'
  }

  return (
    <div style={{ maxWidth: '820px' }}>
      {/* Subject picker */}
      <div style={card}>
        <Field label="Name or entity to screen" htmlFor="sanctions-report-subject">
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                id="sanctions-report-subject"
                type="text"
                value={subjectName}
                onChange={(e) => {
                  setSubjectName(e.target.value)
                  setSelectedEntity(null)
                  resetResults()
                }}
                onFocus={() => setPickerOpen(true)}
                placeholder="Type a name, or pick an existing entity…"
                style={{ flex: 1 }}
              />
              <button
                onClick={runCheck}
                className="btn-primary"
                disabled={running || !subjectName.trim()}
                style={{ whiteSpace: 'nowrap' }}
              >
                {running ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Run Check
              </button>
            </div>
            {pickerOpen && entityMatches.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  zIndex: 50,
                  maxHeight: '260px',
                  overflowY: 'auto',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border-color)',
                  background: 'var(--bg-primary)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
                }}
              >
                {entityMatches.map((e) => (
                  <div
                    key={e.id}
                    onClick={() => {
                      setSelectedEntity(e)
                      setSubjectName(e.name)
                      setPickerOpen(false)
                      resetResults()
                    }}
                    style={{
                      padding: '8px 12px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      borderBottom: '1px solid var(--table-border)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '8px'
                    }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = 'var(--row-hover)')}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = 'transparent')}
                  >
                    <span>{e.name}</span>
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontSize: '0.72rem',
                        textTransform: 'capitalize'
                      }}
                    >
                      {e.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginTop: '12px',
            flexWrap: 'wrap'
          }}
        >
          {selectedEntity ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.78rem',
                padding: '3px 10px',
                borderRadius: '12px',
                background: 'rgba(var(--accent-primary-rgb), 0.1)',
                color: 'var(--accent-primary)'
              }}
            >
              Linked entity: {selectedEntity.name}
              <X
                size={13}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedEntity(null)
                  resetResults()
                }}
              />
            </span>
          ) : (
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              Free-text name (not linked to a stored entity)
            </span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              Match threshold
            </span>
            <input
              type="range"
              min={10}
              max={95}
              step={5}
              value={threshold}
              onChange={(e) => {
                setThreshold(parseInt(e.target.value))
                resetResults()
              }}
              style={{ width: '120px' }}
            />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: '34px' }}>
              {threshold}%
            </span>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div style={card}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '12px'
            }}
          >
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Screening Result — {subjectName.trim()}</h3>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
              {checkedAt && formatDate(checkedAt)}
            </span>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Sanctions List</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Matches</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const label = SOURCES.find((s) => s.code === r.source)?.label || r.source
                  const clear = r.status === 'CLEAR'
                  return (
                    <tr key={r.source}>
                      <td style={{ fontWeight: 500 }}>{label}</td>
                      <td>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 600,
                            color: clear ? 'var(--success)' : 'var(--warning)'
                          }}
                        >
                          {clear ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                          {clear ? 'Clear' : 'Potential Match'}
                        </span>
                      </td>
                      <td className="muted" style={{ textAlign: 'center' }}>
                        {r.matchCount || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* The list entries behind the potential matches */}
          {matches.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 600, marginBottom: '8px' }}>
                Matched list entries ({matches.length})
              </div>
              <div className="table-wrap" style={{ maxHeight: '320px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name on the list</th>
                      <th>List</th>
                      <th style={{ textAlign: 'right' }}>Score</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matches.map((m) => (
                      <tr key={`${m.source}:${m.id}`}>
                        <td style={{ fontWeight: 500 }}>
                          {m.names?.[0] || '-'}
                          {m.names && m.names.length > 1 && (
                            <div className="muted" style={{ fontSize: '0.75rem', fontWeight: 400 }}>
                              Also: {m.names.slice(1, 4).join('; ')}
                              {m.names.length > 4 ? ` +${m.names.length - 4}` : ''}
                            </div>
                          )}
                        </td>
                        <td>
                          {m.source}
                          {m.source_id && (
                            <div className="muted" style={{ fontSize: '0.75rem' }}>
                              {m.source_id}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {Math.round((m.score || 0) * 100)}%
                        </td>
                        <td className="muted" style={{ fontSize: '0.78rem', maxWidth: '320px' }}>
                          {[
                            m.target_type,
                            m.imo_number && `IMO ${m.imo_number}`,
                            m.listed_on && `Listed ${formatDate(m.listed_on)}`,
                            m.remarks &&
                              (m.remarks.length > 160 ? m.remarks.slice(0, 160) + '...' : m.remarks)
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Decision */}
          <div
            style={{
              marginTop: '16px',
              paddingTop: '14px',
              borderTop: '1px solid var(--table-border)'
            }}
          >
            {anyPotential ? (
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.84rem',
                    color: 'var(--warning)',
                    marginBottom: '10px'
                  }}
                >
                  <AlertTriangle size={16} /> Potential matches found — clear or sanction the
                  subject before exporting.
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button
                    onClick={() => void recordDecision('CLEARED')}
                    disabled={savingDecision || savedDecision === 'CLEARED'}
                    className="btn-secondary"
                    style={{
                      borderColor: decision === 'CLEARED' ? 'var(--success)' : undefined,
                      color: decision === 'CLEARED' ? 'var(--success)' : undefined,
                      background: decision === 'CLEARED' ? 'rgba(22,163,74,0.1)' : undefined
                    }}
                  >
                    <ShieldCheck size={16} /> Clear Subject
                  </button>
                  <button
                    onClick={() => void recordDecision('SANCTIONED')}
                    disabled={savingDecision || savedDecision === 'SANCTIONED'}
                    className="btn-secondary"
                    style={{
                      borderColor: decision === 'SANCTIONED' ? 'var(--danger)' : undefined,
                      color: decision === 'SANCTIONED' ? 'var(--danger)' : undefined,
                      background: decision === 'SANCTIONED' ? 'rgba(255,77,77,0.1)' : undefined
                    }}
                  >
                    <ShieldAlert size={16} /> Sanction Subject
                  </button>
                  {savingDecision && <Loader2 size={16} className="spin" />}
                  {savedDecision && !savingDecision && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      Saved{selectedEntity ? ` on ${selectedEntity.name}` : ''}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '0.86rem',
                  color: 'var(--success)'
                }}
              >
                <CheckCircle size={16} /> No matches above {threshold}% — subject is clear on all
                lists.
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={handleExport}
              className="btn-primary"
              disabled={exporting || !decision}
            >
              {exporting ? <Loader2 size={16} className="spin" /> : <FileText size={16} />} Export
              PDF
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── PDF generation (mirrors the app's other report exports) ──
async function exportPdf(opts: {
  subjectName: string
  entity: Entity | null
  threshold: number
  decision: 'CLEARED' | 'SANCTIONED'
  results: SanctionsReportListResult[]
  checkedBy: string | null
  checkedAt: Date
}): Promise<void> {
  const [{ jsPDF }, { default: autoTable }, s] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    getReportSettings()
  ])
  const primary = s.primaryColor
  const doc = new jsPDF()

  // Header band
  doc.setFillColor(15, 18, 24)
  doc.rect(0, 5, 210, s.companySubtitle ? 50 : 46, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(s.companyName, 14, 20)
  if (s.companySubtitle) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(190, 190, 190)
    doc.text(s.companySubtitle, 14, 28)
  }
  const titleY = s.companySubtitle ? 40 : 34
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Sanctions Screening Report', 14, titleY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(190, 190, 190)
  doc.text(opts.subjectName, 14, titleY + 8)

  // Subject meta block
  let y = s.companySubtitle ? 62 : 58
  doc.setTextColor(60, 60, 60)
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  const meta: [string, string][] = [
    ['Subject', opts.subjectName],
    ['Type', opts.entity ? `Registered entity (${opts.entity.type})` : 'Free-text name'],
    ['Match threshold', `${opts.threshold}%`],
    ['Checked by', opts.checkedBy || '—'],
    ['Date', formatDate(opts.checkedAt)]
  ]
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold')
    doc.text(`${k}:`, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(String(v), 50, y)
    y += 6
  }

  // Overall decision badge
  y += 2
  const cleared = opts.decision === 'CLEARED'
  const badge: [number, number, number] = cleared ? [22, 163, 74] : [192, 0, 0]
  doc.setFillColor(...badge)
  doc.roundedRect(14, y - 4, 70, 9, 1.5, 1.5, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`RESULT: ${cleared ? 'CLEARED' : 'SANCTIONED'}`, 18, y + 2)
  y += 12

  // Per-list table
  const SRC_LABELS: Record<string, string> = {
    OFAC: 'OFAC (US Treasury)',
    EU: 'European Union',
    UK: 'UK (FCDO)',
    UN: 'United Nations',
    ISF: 'ISF (Lebanon)',
    SIC: 'SIC (Lebanon)'
  }
  const dateStr = formatDate(opts.checkedAt)
  const body = opts.results.map((r) => {
    const clear = r.status === 'CLEAR'
    return [
      SRC_LABELS[r.source] || r.source,
      {
        content: clear ? 'Clear' : 'Potential Match',
        styles: {
          fontStyle: 'bold' as const,
          textColor: (clear ? [22, 163, 74] : [217, 119, 6]) as [number, number, number]
        }
      },
      { content: dateStr, styles: { halign: 'center' as const } }
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { top: 14, right: 14, bottom: 42, left: 14 },
    head: [['Sanctions List', 'Status', 'Checked']],
    body,
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }
    },
    columnStyles: {
      0: { cellWidth: 90 },
      1: { cellWidth: 50 },
      2: { cellWidth: 42, halign: 'center' as const }
    },
    styles: {
      fontSize: 9,
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
      overflow: 'linebreak',
      lineColor: [210, 215, 220] as [number, number, number],
      lineWidth: 0.3
    },
    alternateRowStyles: { fillColor: [250, 251, 252] as [number, number, number] }
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200)
    doc.setLineWidth(0.3)
    doc.line(14, 270, 196, 270)
    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(s.footerText, 14, 274)
    doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
  }

  doc.save(
    `Sanctions_${opts.subjectName.replace(/[^a-z0-9]/gi, '_')}_${opts.checkedAt.toISOString().split('T')[0]}.pdf`
  )
}
