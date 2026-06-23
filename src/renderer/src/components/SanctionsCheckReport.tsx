import { useState, useEffect, useRef } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Search, FileText, ShieldCheck, ShieldAlert, Loader2, X, CheckCircle, AlertTriangle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { getReportSettings } from '../services/ReportSettingsService'
import { formatDate } from '../utils/dateUtils'
import { Entity, SanctionsMatch, SanctionsReportListResult } from '../../../shared/types'

const SOURCES: { code: string; label: string }[] = [
  { code: 'OFAC', label: 'OFAC (US Treasury)' },
  { code: 'EU', label: 'European Union' },
  { code: 'UK', label: 'UK (FCDO)' },
  { code: 'UN', label: 'United Nations' },
  { code: 'ISF', label: 'ISF (Lebanon)' },
  { code: 'SIC', label: 'SIC (Lebanon)' }
]

type Decision = 'CLEARED' | 'SANCTIONED' | null

export default function SanctionsCheckReport() {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
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
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    window.api.getEntities().then(e => setEntities(Array.isArray(e) ? e : [])).catch(() => {})
  }, [])

  useEffect(() => {
    if (!pickerOpen) return
    const handler = (e: MouseEvent) => { if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen])

  // Reset results when the subject changes
  const resetResults = () => { setResults(null); setDecision(null); setCheckedAt(null) }

  const entityMatches = subjectName.trim()
    ? entities.filter(e => e.name.toLowerCase().includes(subjectName.trim().toLowerCase())).slice(0, 8)
    : entities.slice(0, 8)

  const anyPotential = results ? results.some(r => r.status === 'POTENTIAL_MATCH') : false

  const runCheck = async () => {
    const query = subjectName.trim()
    if (!query) { showError('Enter a name or pick an entity to screen'); return }
    setRunning(true)
    resetResults()
    try {
      const resp = await (window.api as any).checkSanctions(query, threshold / 100, SOURCES.map(s => s.code))
      const matches: SanctionsMatch[] = (resp?.matches || []).filter(
        (m: SanctionsMatch) => Math.round((m.score || 0) * 100) >= threshold
      )
      const perList: SanctionsReportListResult[] = SOURCES.map(s => {
        const cnt = matches.filter(m => (m.source || '').toUpperCase() === s.code).length
        return { source: s.code, status: cnt > 0 ? 'POTENTIAL_MATCH' : 'CLEAR', matchCount: cnt }
      })
      setResults(perList)
      setCheckedAt(new Date())
      // Auto-clear when every list is clean; otherwise require an explicit decision
      setDecision(perList.some(r => r.status === 'POTENTIAL_MATCH') ? null : 'CLEARED')
    } catch {
      showError('Sanctions check failed')
    } finally {
      setRunning(false)
    }
  }

  const handleExport = async () => {
    if (!results || !checkedAt) return
    if (!decision) { showError('Clear or sanction the subject before exporting'); return }
    setExporting(true)
    try {
      const checkedBy = user?.fullName || user?.username || null
      // Save the screening record for audit history
      await window.api.sanctionsReportSave({
        subjectName: subjectName.trim(),
        entityId: selectedEntity?.id || null,
        entityType: selectedEntity ? 'entity' : null,
        threshold,
        decision,
        results,
        checkedBy
      }).catch(() => {})
      // If a stored entity was screened, update its sanctions status to match the decision
      if (selectedEntity) {
        await window.api.updateEntity(selectedEntity.id, {
          ofacStatus: decision === 'SANCTIONED' ? 'MATCH' : 'CLEARED',
          ofacCheckedAt: checkedAt.toISOString(),
          ofacMatchFound: decision === 'SANCTIONED'
        } as any).catch(() => {})
      }
      await exportPdf({ subjectName: subjectName.trim(), entity: selectedEntity, threshold, decision, results, checkedBy, checkedAt })
      showSuccess('Sanctions report exported')
    } catch {
      showError('Failed to export report')
    } finally {
      setExporting(false)
    }
  }

  // ── styles ──
  const card: React.CSSProperties = {
    background: isLight ? '#ffffff' : 'rgba(255,255,255,0.03)',
    border: '1px solid var(--table-border)', borderRadius: '12px', padding: '20px', marginBottom: '16px'
  }

  return (
    <div style={{ maxWidth: '820px' }}>
      {/* Subject picker */}
      <div style={card}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Name or Entity to Screen
        </label>
        <div ref={pickerRef} style={{ position: 'relative' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={subjectName}
              onChange={e => { setSubjectName(e.target.value); setSelectedEntity(null); resetResults() }}
              onFocus={() => setPickerOpen(true)}
              placeholder="Type a name, or pick an existing entity…"
              style={{ flex: 1 }}
            />
            <button onClick={runCheck} className="btn-primary" disabled={running || !subjectName.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              {running ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Run Check
            </button>
          </div>
          {pickerOpen && entityMatches.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 50,
              maxHeight: '260px', overflowY: 'auto', borderRadius: '8px',
              border: '1px solid var(--glass-border)', background: isLight ? '#ffffff' : '#1a1d28',
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)'
            }}>
              {entityMatches.map(e => (
                <div key={e.id}
                  onClick={() => { setSelectedEntity(e); setSubjectName(e.name); setPickerOpen(false); resetResults() }}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
                  onMouseEnter={ev => ev.currentTarget.style.background = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'}
                  onMouseLeave={ev => ev.currentTarget.style.background = 'transparent'}
                >
                  <span>{e.name}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', textTransform: 'capitalize' }}>{e.type}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '12px', flexWrap: 'wrap' }}>
          {selectedEntity ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', padding: '3px 10px', borderRadius: '12px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)' }}>
              Linked entity: {selectedEntity.name}
              <X size={13} style={{ cursor: 'pointer' }} onClick={() => { setSelectedEntity(null); resetResults() }} />
            </span>
          ) : (
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Free-text name (not linked to a stored entity)</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Match threshold</span>
            <input type="range" min={10} max={95} step={5} value={threshold} onChange={e => { setThreshold(parseInt(e.target.value)); resetResults() }} style={{ width: '120px' }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, minWidth: '34px' }}>{threshold}%</span>
          </div>
        </div>
      </div>

      {/* Results */}
      {results && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>Screening Result — {subjectName.trim()}</h3>
            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>{checkedAt && formatDate(checkedAt)}</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--table-border)' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Sanctions List</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '8px 10px', fontWeight: 600, textAlign: 'center' }}>Matches</th>
              </tr>
            </thead>
            <tbody>
              {results.map(r => {
                const label = SOURCES.find(s => s.code === r.source)?.label || r.source
                const clear = r.status === 'CLEAR'
                return (
                  <tr key={r.source} style={{ borderBottom: '1px solid var(--table-border)' }}>
                    <td style={{ padding: '8px 10px' }}>{label}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: clear ? '#16a34a' : '#d97706' }}>
                        {clear ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}
                        {clear ? 'Clear' : 'Potential Match'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-secondary)' }}>{r.matchCount || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Decision */}
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--table-border)' }}>
            {anyPotential ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#d97706', marginBottom: '10px' }}>
                  <AlertTriangle size={16} /> Potential matches found — clear or sanction the subject before exporting.
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={() => setDecision('CLEARED')}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: decision === 'CLEARED' ? '#16a34a' : undefined, color: decision === 'CLEARED' ? '#16a34a' : undefined, background: decision === 'CLEARED' ? 'rgba(22,163,74,0.1)' : undefined }}
                  >
                    <ShieldCheck size={16} /> Clear Subject
                  </button>
                  <button
                    onClick={() => setDecision('SANCTIONED')}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px', borderColor: decision === 'SANCTIONED' ? 'var(--danger)' : undefined, color: decision === 'SANCTIONED' ? 'var(--danger)' : undefined, background: decision === 'SANCTIONED' ? 'rgba(255,77,77,0.1)' : undefined }}
                  >
                    <ShieldAlert size={16} /> Sanction Subject
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.86rem', color: '#16a34a' }}>
                <CheckCircle size={16} /> No matches above {threshold}% — subject is clear on all lists.
              </div>
            )}
          </div>

          <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleExport} className="btn-primary" disabled={exporting || !decision} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {exporting ? <Loader2 size={16} className="spin" /> : <FileText size={16} />} Export PDF
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
  const s = await getReportSettings()
  const primary = s.primaryColor
  const doc = new jsPDF()

  // Header band
  doc.setFillColor(15, 18, 24)
  doc.rect(0, 5, 210, s.companySubtitle ? 50 : 46, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text(s.companyName, 14, 20)
  if (s.companySubtitle) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(190, 190, 190)
    doc.text(s.companySubtitle, 14, 28)
  }
  const titleY = s.companySubtitle ? 40 : 34
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Sanctions Screening Report', 14, titleY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(190, 190, 190)
  doc.text(opts.subjectName, 14, titleY + 8)

  // Subject meta block
  let y = (s.companySubtitle ? 62 : 58)
  doc.setTextColor(60, 60, 60); doc.setFontSize(9.5); doc.setFont('helvetica', 'normal')
  const meta: [string, string][] = [
    ['Subject', opts.subjectName],
    ['Type', opts.entity ? `Registered entity (${opts.entity.type})` : 'Free-text name'],
    ['Match threshold', `${opts.threshold}%`],
    ['Checked by', opts.checkedBy || '—'],
    ['Date', formatDate(opts.checkedAt)]
  ]
  for (const [k, v] of meta) {
    doc.setFont('helvetica', 'bold'); doc.text(`${k}:`, 14, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(v), 50, y)
    y += 6
  }

  // Overall decision badge
  y += 2
  const cleared = opts.decision === 'CLEARED'
  const badge: [number, number, number] = cleared ? [22, 163, 74] : [192, 0, 0]
  doc.setFillColor(...badge)
  doc.roundedRect(14, y - 4, 70, 9, 1.5, 1.5, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text(`RESULT: ${cleared ? 'CLEARED' : 'SANCTIONED'}`, 18, y + 2)
  y += 12

  // Per-list table
  const SRC_LABELS: Record<string, string> = {
    OFAC: 'OFAC (US Treasury)', EU: 'European Union', UK: 'UK (FCDO)', UN: 'United Nations', ISF: 'ISF (Lebanon)', SIC: 'SIC (Lebanon)'
  }
  const dateStr = formatDate(opts.checkedAt)
  const body = opts.results.map(r => {
    const clear = r.status === 'CLEAR'
    return [
      SRC_LABELS[r.source] || r.source,
      { content: clear ? 'Clear' : 'Potential Match', styles: { fontStyle: 'bold' as const, textColor: (clear ? [22, 163, 74] : [217, 119, 6]) as [number, number, number] } },
      { content: dateStr, styles: { halign: 'center' as const } }
    ]
  })

  autoTable(doc, {
    startY: y,
    margin: { top: 14, right: 14, bottom: 42, left: 14 },
    head: [['Sanctions List', 'Status', 'Checked']],
    body,
    theme: 'grid',
    headStyles: { fillColor: primary, textColor: [255, 255, 255], fontSize: 8.5, fontStyle: 'bold', cellPadding: { top: 3, right: 3, bottom: 3, left: 3 } },
    columnStyles: { 0: { cellWidth: 90 }, 1: { cellWidth: 50 }, 2: { cellWidth: 42, halign: 'center' as const } },
    styles: { fontSize: 9, cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }, overflow: 'linebreak', lineColor: [210, 215, 220] as [number, number, number], lineWidth: 0.3 },
    alternateRowStyles: { fillColor: [250, 251, 252] as [number, number, number] }
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3)
    doc.line(14, 270, 196, 270)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
    doc.text(s.footerText, 14, 274)
    doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
  }

  doc.save(`Sanctions_${opts.subjectName.replace(/[^a-z0-9]/gi, '_')}_${opts.checkedAt.toISOString().split('T')[0]}.pdf`)
}
