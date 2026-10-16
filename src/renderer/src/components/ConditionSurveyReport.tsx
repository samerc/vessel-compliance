import { useState, useEffect, useMemo, Fragment } from 'react'
import { Download, Search, FileText, ClipboardCheck } from 'lucide-react'
import { SurveyWarranty } from '../../../shared/types'
import { Badge, EmptyState, type BadgeTone } from './ui'
import { useToast } from '../contexts/ToastContext'
import { getReportSettings } from '../services/ReportSettingsService'
import type { jsPDF } from 'jspdf'
import type { CellHookData } from 'jspdf-autotable'

type DocWithAutoTable = jsPDF & { lastAutoTable: { finalY: number } }

// Display status derived from the survey's closure state (open defects), not the raw
// warranty status: a survey with open defects reads "Carried Out"; all defects closed
// reads "Survey Done".
type DisplayStatus = 'pending' | 'carried_out' | 'survey_done' | 'waived'
type StatusFilter = 'all' | DisplayStatus

const NO_DATE_KEY = '9999-99'
const NO_DATE_LABEL = 'No Due Date'

interface ReportRow {
  vesselName: string
  imo: string
  policyType: string
  description: string
  dueDate: string | null // ISO or null
  deadlineText: string // event text when no calculable date
  surveyDate: string | null
  surveyType: string
  surveyor: string
  status: DisplayStatus
  monthKey: string
  monthLabel: string
}

const STATUS_META: Record<DisplayStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#e0912f' },
  carried_out: { label: 'Survey Carried Out', color: '#3b9bd6' },
  survey_done: { label: 'Survey Closed', color: '#2fa66a' },
  waived: { label: 'Waived', color: '#8a8f9a' }
}

// On-screen pill tones (STATUS_META colours stay for the PDF)
const STATUS_TONE: Record<DisplayStatus, BadgeTone> = {
  pending: 'warning',
  carried_out: 'info',
  survey_done: 'success',
  waived: 'neutral'
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'carried_out', label: 'Survey Carried Out' },
  { key: 'survey_done', label: 'Survey Closed' },
  { key: 'waived', label: 'Waived' }
]

/** 'YYYY-MM-DD' (optionally with a time part) as local midnight; date-only maths stays in local time */
function parseDateOnly(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s)
}

/** Local date parts as 'YYYY-MM-DD' (toISOString would shift local midnight to the day before) */
function toYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function calcDueDate(w: SurveyWarranty): Date | null {
  if (w.deadlineType === 'days' && w.deadlineDays != null && w.inceptionDate) {
    const d = parseDateOnly(w.inceptionDate)
    if (isNaN(d.getTime())) return null
    d.setDate(d.getDate() + w.deadlineDays)
    return d
  }
  return null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = parseDateOnly(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ConditionSurveyReport(): React.JSX.Element {
  const { showError, showSuccess } = useToast()

  const [warranties, setWarranties] = useState<SurveyWarranty[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const w = await window.api.surveyWarrantyGetAll()
        // Only active vessels — inactive vessels' warranties are excluded from the report
        const active = (Array.isArray(w) ? w : []).filter(
          (x) => x.vesselIsActive !== 0 && x.vesselIsActive !== false
        )
        setWarranties(active)
      } catch (err) {
        showError((err instanceof Error && err.message) || 'Failed to load survey warranties')
      } finally {
        setLoading(false)
      }
    })()
  }, [showError])

  const rows = useMemo<ReportRow[]>(() => {
    return warranties.map((w) => {
      const due = calcDueDate(w)
      const dueISO = due ? toYmd(due) : null
      const monthKey = due
        ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}`
        : NO_DATE_KEY
      const monthLabel = due
        ? due.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : NO_DATE_LABEL
      // A recorded survey (linked, or the vessel's latest via adapter fallback) means the
      // vessel carried out the survey and complied. Whether it reads "Carried Out" or
      // "Survey Done" depends on the survey's open defects: >0 open = still carried out,
      // 0 open = all defects closed = survey done.
      const carriedOut =
        w.surveyDate ||
        (w.status === 'completed' || w.status === 'survey_done' ? w.completedAt || null : null)
      const hasSurvey = !!w.surveyDate
      const surveyClosed = (w.surveyOpenDefects ?? 0) === 0
      let status: DisplayStatus
      if (w.status === 'waived') status = 'waived'
      else if (w.status === 'completed') status = 'survey_done'
      else if (hasSurvey) status = surveyClosed ? 'survey_done' : 'carried_out'
      else status = 'pending'
      return {
        vesselName: w.vesselName || '',
        imo: w.imoNumber || '',
        policyType: w.policyTypeName || '',
        description: w.description || '',
        dueDate: dueISO,
        deadlineText: w.deadlineType === 'event' ? w.deadlineEvent || '' : '',
        surveyDate: carriedOut,
        surveyType: w.conditionSurveyType || '',
        surveyor: w.surveyorName || '',
        status,
        monthKey,
        monthLabel
      }
    })
  }, [warranties])

  const displayRows = useMemo(() => {
    let r = rows
    if (statusFilter !== 'all') {
      r = r.filter((row) => row.status === statusFilter)
    }
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(
        (row) =>
          row.vesselName.toLowerCase().includes(q) ||
          row.imo.includes(q) ||
          row.description.toLowerCase().includes(q) ||
          row.surveyor.toLowerCase().includes(q) ||
          row.policyType.toLowerCase().includes(q)
      )
    }
    return r
  }, [rows, statusFilter, search])

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; rows: ReportRow[] }>()
    for (const row of displayRows) {
      if (!map.has(row.monthKey))
        map.set(row.monthKey, { key: row.monthKey, label: row.monthLabel, rows: [] })
      map.get(row.monthKey)!.rows.push(row)
    }
    const arr = Array.from(map.values())
    arr.sort((a, b) => a.key.localeCompare(b.key)) // NO_DATE_KEY (9999-99) sorts last
    // within each month, sort by due date then vessel
    for (const g of arr) {
      g.rows.sort(
        (a, b) =>
          (a.dueDate || '').localeCompare(b.dueDate || '') ||
          a.vesselName.localeCompare(b.vesselName)
      )
    }
    return arr
  }, [displayRows])

  const stats = useMemo(() => {
    const surveyDone = displayRows.filter((r) => r.status === 'survey_done').length
    const carriedOut = displayRows.filter((r) => r.status === 'carried_out').length
    const pending = displayRows.filter((r) => r.status === 'pending').length
    return { total: displayRows.length, surveyDone, carriedOut, pending }
  }, [displayRows])

  const dueCell = (row: ReportRow): string =>
    row.dueDate ? fmtDate(row.dueDate) : row.deadlineText || 'No due date'

  const exportExcel = async (): Promise<void> => {
    if (displayRows.length === 0) return
    const XLSX = await import('xlsx-js-style')
    const data: Record<string, unknown>[] = []
    for (const g of groups) {
      for (const r of g.rows) {
        data.push({
          Month: g.label,
          Vessel: r.vesselName,
          IMO: r.imo,
          'Policy Type': r.policyType,
          Warranty: r.description,
          'Due Date': dueCell(r),
          'Survey Carried Out': fmtDate(r.surveyDate),
          Surveyor: r.surveyor,
          Status: STATUS_META[r.status]?.label || r.status
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [
      { wch: 16 },
      { wch: 22 },
      { wch: 10 },
      { wch: 14 },
      { wch: 40 },
      { wch: 14 },
      { wch: 16 },
      { wch: 22 },
      { wch: 14 }
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Condition Surveys')
    XLSX.writeFile(wb, 'Condition Survey Report.xlsx')
    showSuccess('Exported to Excel')
  }

  const exportPdf = async (): Promise<void> => {
    if (groups.length === 0) return
    try {
      const s = await getReportSettings()
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ orientation: 'landscape' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const navy: [number, number, number] = s.primaryColor || [10, 22, 40]
      const teal: [number, number, number] = [0, 170, 200]
      const margin = 14

      const drawHeader = (): void => {
        doc.setFillColor(navy[0], navy[1], navy[2])
        doc.rect(0, 0, pw, 16, 'F')
        doc.setFillColor(teal[0], teal[1], teal[2])
        doc.rect(0, 0, 3, 16, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(255, 255, 255)
        doc.text(s.companyName || '', margin, 10.5)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(180, 200, 220)
        doc.text('Condition Survey Report', pw - margin, 10.5, { align: 'right' })
      }

      const drawFooter = (pageNum: number, totalPages: number): void => {
        doc.setDrawColor(200)
        doc.line(margin, ph - 12, pw - margin, ph - 12)
        doc.setFontSize(7)
        doc.setTextColor(140)
        doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, ph - 7)
        doc.text(s.companyName || '', pw / 2, ph - 7, { align: 'center' })
        doc.text(`Page ${pageNum} / ${totalPages}`, pw - margin, ph - 7, { align: 'right' })
      }

      drawHeader()
      let y = 22

      doc.setFontSize(8)
      doc.setTextColor(100)
      doc.text(
        `${stats.total} survey warranties  —  ${stats.surveyDone} survey done  —  ${stats.carriedOut} carried out  —  ${stats.pending} pending`,
        margin,
        y
      )
      y += 6

      for (const g of groups) {
        const estimatedHeight = 12 + g.rows.length * 7 + 8
        if (y + estimatedHeight > ph - 20 && y > 22) {
          doc.addPage()
          drawHeader()
          y = 22
        }

        // Month header bar
        doc.setFillColor(navy[0], navy[1], navy[2])
        doc.rect(margin, y, pw - margin * 2, 9, 'F')
        doc.setFillColor(teal[0], teal[1], teal[2])
        doc.rect(margin, y, 2.5, 9, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(9)
        doc.setTextColor(255, 255, 255)
        doc.text(g.label.toUpperCase(), margin + 6, y + 6)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(160, 185, 210)
        doc.text(
          `${g.rows.length} survey${g.rows.length !== 1 ? 's' : ''}`,
          pw - margin - 2,
          y + 6,
          {
            align: 'right'
          }
        )
        y += 11

        const head = [
          ['Vessel', 'IMO', 'Policy', 'Warranty', 'Due Date', 'Carried Out', 'Surveyor', 'Status']
        ]
        const body = g.rows.map((r) => [
          r.vesselName,
          r.imo,
          r.policyType,
          r.description,
          dueCell(r),
          fmtDate(r.surveyDate),
          r.surveyor,
          STATUS_META[r.status]?.label || r.status
        ])

        autoTable(doc, {
          startY: y,
          head,
          body,
          margin: { left: margin, right: margin },
          styles: {
            fontSize: 7,
            cellPadding: { top: 2, bottom: 2, left: 3, right: 3 },
            textColor: [40, 40, 40],
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [235, 240, 248],
            textColor: [60, 70, 90],
            fontStyle: 'bold',
            fontSize: 6.8
          },
          alternateRowStyles: { fillColor: [250, 251, 254] },
          columnStyles: {
            0: { cellWidth: 40, fontStyle: 'bold' },
            1: { cellWidth: 22 },
            2: { cellWidth: 20 },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 26 },
            5: { cellWidth: 26 },
            6: { cellWidth: 36 },
            7: { cellWidth: 24 }
          },
          didParseCell: (d: CellHookData) => {
            if (d.section === 'body' && d.column.index === 7) {
              const meta = STATUS_META[g.rows[d.row.index].status]
              if (meta) {
                const hex = meta.color.replace('#', '')
                d.cell.styles.textColor = [
                  parseInt(hex.slice(0, 2), 16),
                  parseInt(hex.slice(2, 4), 16),
                  parseInt(hex.slice(4, 6), 16)
                ]
                d.cell.styles.fontStyle = 'bold'
              }
            }
          }
        })
        y = (doc as DocWithAutoTable).lastAutoTable.finalY + 6
      }

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        drawFooter(i, totalPages)
      }

      doc.save('Condition Survey Report.pdf')
      showSuccess('Exported to PDF')
    } catch (err) {
      showError((err instanceof Error && err.message) || 'PDF export failed')
    }
  }

  if (loading)
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        Loading...
      </div>
    )

  return (
    <div>
      {/* Stats + filters + export */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '14px',
          flexWrap: 'wrap',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`chip${statusFilter === f.key ? ' active' : ''}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-secondary)'
              }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search results..."
              style={{ paddingLeft: '30px', width: '200px', fontSize: '0.82rem' }}
            />
          </div>
          <button
            onClick={exportExcel}
            disabled={displayRows.length === 0}
            className="btn-secondary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              padding: '7px 14px'
            }}
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={displayRows.length === 0}
            className="btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              padding: '7px 14px'
            }}
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          marginBottom: '14px'
        }}
      >
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{stats.total}</strong> survey warranties
        </span>
        <span>
          <strong style={{ color: 'var(--success)' }}>{stats.surveyDone}</strong> survey done
        </span>
        <span>
          <strong style={{ color: 'var(--info)' }}>{stats.carriedOut}</strong> carried out
        </span>
        <span>
          <strong style={{ color: 'var(--warning)' }}>{stats.pending}</strong> pending
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="table-wrap">
          <EmptyState icon={<ClipboardCheck size={40} />} title="No survey warranties recorded." />
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Vessel</th>
                <th>IMO</th>
                <th>Policy</th>
                <th>Warranty</th>
                <th>Due Date</th>
                <th>Carried Out</th>
                <th>Surveyor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: '8px 14px',
                        background: 'var(--row-selected)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        color: 'var(--accent-primary)',
                        letterSpacing: '0.4px'
                      }}
                    >
                      {g.label.toUpperCase()}
                      <span
                        style={{
                          color: 'var(--text-secondary)',
                          fontWeight: 400,
                          marginLeft: '8px'
                        }}
                      >
                        · {g.rows.length}
                      </span>
                    </td>
                  </tr>
                  {g.rows.map((r, ri) => (
                    <tr key={`${g.key}-${ri}`}>
                      <td style={{ ...tdStyle, fontWeight: 600, textTransform: 'uppercase' }}>
                        {r.vesselName}
                      </td>
                      <td className="muted" style={tdStyle}>
                        <span className="mono">{r.imo}</span>
                      </td>
                      <td style={tdStyle}>{r.policyType}</td>
                      <td style={tdStyle}>{r.description}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {r.dueDate ? (
                          fmtDate(r.dueDate)
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            {r.deadlineText || 'No due date'}
                          </span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDate(r.surveyDate)}</td>
                      <td className="muted" style={tdStyle}>
                        {r.surveyor}
                      </td>
                      <td style={tdStyle}>
                        <Badge tone={STATUS_TONE[r.status] || 'neutral'}>
                          {STATUS_META[r.status]?.label || r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const tdStyle: React.CSSProperties = { verticalAlign: 'top' }
