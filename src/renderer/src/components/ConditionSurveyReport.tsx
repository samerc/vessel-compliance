import { useState, useEffect, useMemo, Fragment } from 'react'
import { Download, Search, FileText, ClipboardCheck } from 'lucide-react'
import { SurveyWarranty } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { getReportSettings } from '../services/ReportSettingsService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx-js-style'

type StatusFilter = 'all' | 'pending' | 'done' | 'waived'

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
  status: SurveyWarranty['status']
  monthKey: string
  monthLabel: string
}

const STATUS_META: Record<SurveyWarranty['status'], { label: string; color: string }> = {
  pending: { label: 'Pending', color: '#e0912f' },
  survey_done: { label: 'Survey Done', color: '#3b9bd6' },
  completed: { label: 'Completed', color: '#2fa66a' },
  waived: { label: 'Waived', color: '#8a8f9a' }
}

function calcDueDate(w: SurveyWarranty): Date | null {
  if (w.deadlineType === 'days' && w.deadlineDays != null && w.inceptionDate) {
    const d = new Date(w.inceptionDate)
    if (isNaN(d.getTime())) return null
    d.setDate(d.getDate() + w.deadlineDays)
    return d
  }
  return null
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function ConditionSurveyReport() {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
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
        setWarranties(Array.isArray(w) ? w : [])
      } catch (err: any) {
        showError(err?.message || 'Failed to load survey warranties')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const rows = useMemo<ReportRow[]>(() => {
    return warranties.map((w) => {
      const due = calcDueDate(w)
      const dueISO = due ? due.toISOString().split('T')[0] : null
      const monthKey = due ? `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}` : NO_DATE_KEY
      const monthLabel = due
        ? due.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : NO_DATE_LABEL
      return {
        vesselName: w.vesselName || '',
        imo: w.imoNumber || '',
        policyType: w.policyTypeName || '',
        description: w.description || '',
        dueDate: dueISO,
        deadlineText: w.deadlineType === 'event' ? w.deadlineEvent || '' : '',
        surveyDate: w.surveyDate || (w.status === 'completed' || w.status === 'survey_done' ? w.completedAt || null : null),
        surveyType: w.conditionSurveyType || '',
        surveyor: w.surveyorName || '',
        status: w.status,
        monthKey,
        monthLabel
      }
    })
  }, [warranties])

  const displayRows = useMemo(() => {
    let r = rows
    if (statusFilter !== 'all') {
      r = r.filter((row) =>
        statusFilter === 'done'
          ? row.status === 'completed' || row.status === 'survey_done'
          : row.status === statusFilter
      )
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
      if (!map.has(row.monthKey)) map.set(row.monthKey, { key: row.monthKey, label: row.monthLabel, rows: [] })
      map.get(row.monthKey)!.rows.push(row)
    }
    const arr = Array.from(map.values())
    arr.sort((a, b) => a.key.localeCompare(b.key)) // NO_DATE_KEY (9999-99) sorts last
    // within each month, sort by due date then vessel
    for (const g of arr) {
      g.rows.sort(
        (a, b) => (a.dueDate || '').localeCompare(b.dueDate || '') || a.vesselName.localeCompare(b.vesselName)
      )
    }
    return arr
  }, [displayRows])

  const stats = useMemo(() => {
    const done = displayRows.filter((r) => r.status === 'completed' || r.status === 'survey_done').length
    const pending = displayRows.filter((r) => r.status === 'pending').length
    return { total: displayRows.length, done, pending }
  }, [displayRows])

  const dueCell = (row: ReportRow) => (row.dueDate ? fmtDate(row.dueDate) : row.deadlineText || 'No due date')

  const exportExcel = () => {
    if (displayRows.length === 0) return
    const data: any[] = []
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

  const exportPdf = async () => {
    if (groups.length === 0) return
    try {
      const s = await getReportSettings()
      const doc = new jsPDF({ orientation: 'landscape' })
      const pw = doc.internal.pageSize.getWidth()
      const ph = doc.internal.pageSize.getHeight()
      const navy: [number, number, number] = s.primaryColor || [10, 22, 40]
      const teal: [number, number, number] = [0, 170, 200]
      const margin = 14

      const drawHeader = () => {
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

      const drawFooter = (pageNum: number, totalPages: number) => {
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
      doc.text(`${stats.total} survey warranties  —  ${stats.done} done  —  ${stats.pending} pending`, margin, y)
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
        doc.text(`${g.rows.length} survey${g.rows.length !== 1 ? 's' : ''}`, pw - margin - 2, y + 6, {
          align: 'right'
        })
        y += 11

        const head = [['Vessel', 'IMO', 'Policy', 'Warranty', 'Due Date', 'Carried Out', 'Surveyor', 'Status']]
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
          styles: { fontSize: 7, cellPadding: { top: 2, bottom: 2, left: 3, right: 3 }, textColor: [40, 40, 40], overflow: 'linebreak' },
          headStyles: { fillColor: [235, 240, 248], textColor: [60, 70, 90], fontStyle: 'bold', fontSize: 6.8 },
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
          didParseCell: (d: any) => {
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
        y = (doc as any).lastAutoTable.finalY + 6
      }

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        drawFooter(i, totalPages)
      }

      doc.save('Condition Survey Report.pdf')
      showSuccess('Exported to PDF')
    } catch (err: any) {
      showError(err?.message || 'PDF export failed')
    }
  }

  if (loading)
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>
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
          {(['all', 'pending', 'done', 'waived'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              style={{
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                cursor: 'pointer',
                textTransform: 'capitalize',
                border: statusFilter === f ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                background: statusFilter === f ? 'rgba(0,210,255,0.08)' : 'transparent',
                color: statusFilter === f ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: statusFilter === f ? 600 : 400
              }}
            >
              {f}
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
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
          >
            <Download size={14} /> Excel
          </button>
          <button
            onClick={exportPdf}
            disabled={displayRows.length === 0}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}
          >
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '14px' }}>
        <span>
          <strong style={{ color: 'var(--text-primary)' }}>{stats.total}</strong> survey warranties
        </span>
        <span>
          <strong style={{ color: '#2fa66a' }}>{stats.done}</strong> done
        </span>
        <span>
          <strong style={{ color: '#e0912f' }}>{stats.pending}</strong> pending
        </span>
      </div>

      {groups.length === 0 ? (
        <div
          className="glass-card"
          style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}
        >
          <ClipboardCheck size={28} style={{ opacity: 0.4, marginBottom: '10px' }} />
          <div>No survey warranties recorded.</div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr
                style={{
                  background: isLight ? '#f0f2f8' : 'rgba(255,255,255,0.03)',
                  borderBottom: '2px solid var(--table-border)'
                }}
              >
                <th style={thStyle}>Vessel</th>
                <th style={thStyle}>IMO</th>
                <th style={thStyle}>Policy</th>
                <th style={thStyle}>Warranty</th>
                <th style={thStyle}>Due Date</th>
                <th style={thStyle}>Carried Out</th>
                <th style={thStyle}>Surveyor</th>
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <tr>
                    <td
                      colSpan={8}
                      style={{
                        padding: '8px 12px',
                        background: isLight ? 'rgba(0,150,200,0.07)' : 'rgba(0,210,255,0.05)',
                        borderTop: '1px solid var(--table-border)',
                        borderBottom: '1px solid var(--table-border)',
                        fontWeight: 700,
                        fontSize: '0.8rem',
                        color: 'var(--accent-primary)',
                        letterSpacing: '0.4px'
                      }}
                    >
                      {g.label.toUpperCase()}
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 400, marginLeft: '8px' }}>
                        · {g.rows.length}
                      </span>
                    </td>
                  </tr>
                  {g.rows.map((r, ri) => (
                    <tr key={`${g.key}-${ri}`} style={{ borderBottom: '1px solid var(--table-border)' }}>
                      <td style={{ ...tdStyle, fontWeight: 600, textTransform: 'uppercase' }}>{r.vesselName}</td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.imo}</td>
                      <td style={{ ...tdStyle, fontSize: '0.78rem' }}>{r.policyType}</td>
                      <td style={{ ...tdStyle, fontSize: '0.8rem' }}>{r.description}</td>
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
                      <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.surveyor}</td>
                      <td style={tdStyle}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            background: (STATUS_META[r.status]?.color || '#888') + '22',
                            color: STATUS_META[r.status]?.color || 'var(--text-secondary)'
                          }}
                        >
                          {STATUS_META[r.status]?.label || r.status}
                        </span>
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

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
  whiteSpace: 'nowrap'
}
const tdStyle: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
