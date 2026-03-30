import { useState, useEffect } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import XLSX from 'xlsx-js-style'
import { Download, FileText, Users, AlertCircle, CheckCircle, Briefcase } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { getReportSettings, tintColor } from '../services/ReportSettingsService'
import { exportCustomerPortfolioPDF } from '../services/CustomerPortfolioService'
import { formatDate } from '../utils/dateUtils'

interface CustomerVesselRow {
  vesselId: string
  vesselName: string
  imoNumber: string
  customerType: string | null
  assured: string
  totalRequired: number
  compliant: number
  missing: number
  expiringSoon: number
  expired: number
  pct: number
}

interface CustomerGroup {
  customerId: string | null
  customerName: string
  customerType: string | null
  vessels: CustomerVesselRow[]
}

const isExpired = (d: string | null | undefined) => !!d && new Date(d) < new Date(new Date().setHours(0, 0, 0, 0))
const isExpiringSoon = (d: string | null | undefined) => {
  if (!d) return false
  const today = new Date(new Date().setHours(0, 0, 0, 0))
  const exp = new Date(d)
  const threshold = new Date(today); threshold.setDate(today.getDate() + 60)
  return exp >= today && exp <= threshold
}

function docStatus(hasFile: boolean, expiry: string | null | undefined): string {
  if (!hasFile) return 'MISSING'
  if (isExpired(expiry)) return 'EXPIRED'
  if (isExpiringSoon(expiry)) return 'EXPIRING SOON'
  return 'COMPLIANT'
}

function buildVesselRow(
  vessel: any,
  docTypes: any[],
  allVesselDocs: any[],
  allAssureds: any[],
  allCustomDocTypes: any[],
): CustomerVesselRow {
  const vesselDocs = allVesselDocs.filter(d => d.vesselId === vessel.id)
  const customTypes = allCustomDocTypes.filter(t => t.vesselId === vessel.id)

  const allTypes = [
    ...docTypes.map((t: any) => {
      const d = vesselDocs.find((v: any) => v.documentTypeId === t.id)
      return { name: t.name, required: d ? d.required : t.required, doc: d }
    }),
    ...(customTypes as any[]).map((t: any) => {
      const d = vesselDocs.find((v: any) => v.documentTypeId === t.id)
      return { name: `${t.name} (Custom)`, required: true, doc: d }
    }),
  ].filter(t => t.required)

  let compliant = 0, missing = 0, expiringSoonCount = 0, expiredCount = 0
  for (const t of allTypes) {
    const status = docStatus(!!(t.doc?.filePath), t.doc?.expiryDate || null)
    if (status === 'COMPLIANT') compliant++
    else if (status === 'MISSING') missing++
    else if (status === 'EXPIRING SOON') expiringSoonCount++
    else if (status === 'EXPIRED') expiredCount++
  }

  const vesselAssureds = allAssureds.filter(a => a.vesselId === vessel.id)
  const assured = vesselAssureds.map(a => a.entityName || a.name || '').filter(Boolean).join(', ') || '—'

  const totalRequired = allTypes.length
  const pct = totalRequired > 0 ? Math.round((compliant / totalRequired) * 100) : 100

  return {
    vesselId: vessel.id,
    vesselName: vessel.name,
    imoNumber: vessel.imoNumber,
    customerType: vessel.customerType || null,
    assured,
    totalRequired,
    compliant,
    missing,
    expiringSoon: expiringSoonCount,
    expired: expiredCount,
    pct,
  }
}

export async function exportCustomerCompliancePDF(
  customerId: string,
  customerName: string,
  customerType: string | null,
): Promise<void> {
  const [vesselsRaw, docTypesRaw, allVesselDocsRaw, allAssuredsRaw] = await Promise.all([
    window.api.getVessels(),
    window.api.getDocumentTypes(),
    window.api.getVesselDocuments(),
    window.api.getVesselAssureds(),
  ])
  const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : []
  const docTypes = Array.isArray(docTypesRaw) ? docTypesRaw : []
  const allVesselDocs = Array.isArray(allVesselDocsRaw) ? allVesselDocsRaw : []
  const allAssureds = Array.isArray(allAssuredsRaw) ? allAssuredsRaw : []

  const customerVessels = vessels.filter(v => v.isActive && v.customerId === customerId)
  if (customerVessels.length === 0) return

  const customDocResults = await Promise.all(
    customerVessels.map(v => window.api.getVesselCustomDocTypes(v.id))
  )
  const allCustomDocTypes = customDocResults.filter(Array.isArray).flat()

  const vesselRows: CustomerVesselRow[] = customerVessels.map(vessel =>
    buildVesselRow(vessel, docTypes, allVesselDocs, allAssureds, allCustomDocTypes)
  )

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
  doc.text('Compliance Report', 14, titleY)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(190, 190, 190)
  doc.text(`${customerName}${customerType ? ` · ${customerType.toUpperCase()}` : ''}`, 14, titleY + 8)
  doc.text(`Date: ${formatDate(new Date())}`, 14, titleY + 16)

  const bodyRows: any[][] = vesselRows.map(v => {
    const pctColor: [number, number, number] = v.pct === 100 ? [0, 140, 70] : v.missing > 0 ? [192, 0, 0] : [180, 83, 9]
    return [
      v.vesselName,
      v.imoNumber,
      v.assured,
      { content: `${v.compliant}/${v.totalRequired}`, styles: { halign: 'center' as const } },
      { content: v.missing > 0 ? String(v.missing) : '—', styles: { halign: 'center' as const, textColor: v.missing > 0 ? [192, 0, 0] as [number, number, number] : [100, 100, 100] as [number, number, number] } },
      { content: v.expiringSoon > 0 ? String(v.expiringSoon) : '—', styles: { halign: 'center' as const, textColor: v.expiringSoon > 0 ? [180, 83, 9] as [number, number, number] : [100, 100, 100] as [number, number, number] } },
      { content: `${v.pct}%`, styles: { halign: 'center' as const, fontStyle: 'bold' as const, textColor: pctColor } },
    ]
  })

  autoTable(doc, {
    startY: s.companySubtitle ? 72 : 68,
    margin: { top: 14, right: 14, bottom: 42, left: 14 },
    head: [['Vessel', 'IMO', 'Assured', 'Docs', 'Missing', 'Expiring', '%']],
    body: bodyRows,
    theme: 'grid',
    headStyles: {
      fillColor: primary,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
    },
    columnStyles: {
      0: { cellWidth: 46 },
      1: { cellWidth: 22 },
      2: { cellWidth: 46 },
      3: { cellWidth: 18, halign: 'center' as const },
      4: { cellWidth: 18, halign: 'center' as const },
      5: { cellWidth: 18, halign: 'center' as const },
      6: { cellWidth: 14, halign: 'center' as const },
    },
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      overflow: 'linebreak',
      lineColor: [210, 215, 220] as [number, number, number],
      lineWidth: 0.3,
    },
    alternateRowStyles: { fillColor: [250, 251, 252] as [number, number, number] },
  })

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3)
    doc.line(14, 270, 196, 270)
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
    doc.text(s.footerText, 14, 274)
    doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
  }

  doc.save(`Compliance_${customerName.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`)
}

export default function CustomerComplianceReport() {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all')
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [groups, setGroups] = useState<CustomerGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportingPortfolio, setExportingPortfolio] = useState<string | null>(null)

  useEffect(() => { loadCustomers() }, [])

  const loadCustomers = async () => {
    const vesselsRaw = await window.api.getVessels()
    const entitiesRaw = await window.api.getEntities()
    const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : []
    const entities = Array.isArray(entitiesRaw) ? entitiesRaw : []
    const customerIds = new Set(vessels.filter(v => v.customerId).map(v => v.customerId))
    const list = entities.filter(e => customerIds.has(e.id))
      .sort((a, b) => a.name.localeCompare(b.name))
    setCustomers(list)
  }

  const loadReport = async () => {
    setLoading(true)
    try {
      const [vesselsRaw, entitiesRaw, docTypesRaw, allVesselDocsRaw, allAssuredsRaw] = await Promise.all([
        window.api.getVessels(),
        window.api.getEntities(),
        window.api.getDocumentTypes(),
        window.api.getVesselDocuments(),
        window.api.getVesselAssureds(),
      ])
      const vessels = Array.isArray(vesselsRaw) ? vesselsRaw : []
      const entities = Array.isArray(entitiesRaw) ? entitiesRaw : []
      const docTypes = Array.isArray(docTypesRaw) ? docTypesRaw : []
      const allVesselDocs = Array.isArray(allVesselDocsRaw) ? allVesselDocsRaw : []
      const allAssureds = Array.isArray(allAssuredsRaw) ? allAssuredsRaw : []

      const activeVessels = vessels.filter(v => v.isActive)
      const filtered = selectedCustomerId === 'all'
        ? activeVessels
        : activeVessels.filter(v => v.customerId === selectedCustomerId)

      const customDocResults = await Promise.all(
        filtered.map((v: any) => window.api.getVesselCustomDocTypes(v.id))
      )
      const allCustomDocTypes = customDocResults.filter(Array.isArray).flat()

      const customerMap = new Map<string, CustomerGroup>()

      for (const vessel of filtered) {
        const customerId = vessel.customerId || null
        const entity = customerId ? entities.find(e => e.id === customerId) : null
        const groupKey = customerId || '__unassigned__'

        if (!customerMap.has(groupKey)) {
          customerMap.set(groupKey, {
            customerId,
            customerName: entity ? entity.name : '(No Customer)',
            customerType: vessel.customerType || null,
            vessels: [],
          })
        }

        const row = buildVesselRow(vessel, docTypes, allVesselDocs, allAssureds, allCustomDocTypes)
        customerMap.get(groupKey)!.vessels.push(row)
      }

      setGroups([...customerMap.values()].sort((a, b) => a.customerName.localeCompare(b.customerName)))
    } finally {
      setLoading(false)
    }
  }

  const exportToPDF = async () => {
    if (groups.length === 0) return
    setExporting(true)
    try {
      const s = await getReportSettings()
      const primary = s.primaryColor
      const vesselBg = tintColor(primary, 0.93)
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
      doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
      doc.text('Customer Compliance Report', 14, titleY)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(190, 190, 190)
      doc.text(`Date: ${formatDate(new Date())}`, 14, titleY + 9)

      let startY = s.companySubtitle ? 64 : 60

      for (const group of groups) {
        const bodyRows: any[][] = []

        // Customer header row (colSpan all 7 columns)
        bodyRows.push([{
          content: `${group.customerName}${group.customerType ? `  ·  ${group.customerType.toUpperCase()}` : ''}`,
          colSpan: 7,
          styles: {
            fillColor: primary,
            textColor: [255, 255, 255] as [number, number, number],
            fontStyle: 'bold' as const,
            fontSize: 9.5,
          },
        }])

        for (const v of group.vessels) {
          const pctColor: [number, number, number] =
            v.pct === 100 ? [0, 140, 70] : v.missing > 0 ? [192, 0, 0] : [180, 83, 9]
          bodyRows.push([
            { content: v.vesselName, styles: { fillColor: vesselBg, fontStyle: 'bold' as const } },
            { content: v.imoNumber, styles: { fillColor: vesselBg } },
            { content: v.assured, styles: { fillColor: vesselBg } },
            { content: `${v.compliant}/${v.totalRequired}`, styles: { fillColor: vesselBg, halign: 'center' as const } },
            {
              content: v.missing > 0 ? String(v.missing) : '—',
              styles: {
                fillColor: vesselBg,
                halign: 'center' as const,
                textColor: v.missing > 0 ? [192, 0, 0] as [number, number, number] : [160, 160, 160] as [number, number, number],
                fontStyle: v.missing > 0 ? 'bold' as const : 'normal' as const,
              },
            },
            {
              content: v.expiringSoon > 0 ? String(v.expiringSoon) : '—',
              styles: {
                fillColor: vesselBg,
                halign: 'center' as const,
                textColor: v.expiringSoon > 0 ? [180, 83, 9] as [number, number, number] : [160, 160, 160] as [number, number, number],
              },
            },
            {
              content: `${v.pct}%`,
              styles: {
                fillColor: vesselBg,
                halign: 'center' as const,
                fontStyle: 'bold' as const,
                textColor: pctColor,
              },
            },
          ])
        }

        autoTable(doc, {
          startY,
          margin: { top: 14, right: 14, bottom: 42, left: 14 },
          head: [['', 'IMO', 'Assured', 'Docs', 'Missing', 'Expiring', '%']],
          body: bodyRows,
          theme: 'grid',
          headStyles: {
            fillColor: primary,
            textColor: [255, 255, 255],
            fontSize: 7.5,
            fontStyle: 'bold',
            cellPadding: { top: 3, right: 3, bottom: 3, left: 3 },
          },
          columnStyles: {
            0: { cellWidth: 46 },
            1: { cellWidth: 22 },
            2: { cellWidth: 46 },
            3: { cellWidth: 18, halign: 'center' },
            4: { cellWidth: 18, halign: 'center' },
            5: { cellWidth: 18, halign: 'center' },
            6: { cellWidth: 14, halign: 'center' },
          },
          styles: {
            fontSize: 8,
            cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
            overflow: 'linebreak',
            lineColor: [210, 215, 220],
            lineWidth: 0.3,
          },
          alternateRowStyles: { fillColor: [250, 251, 252] },
        })

        startY = (doc as any).lastAutoTable.finalY + 12
      }

      // Page footers
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3)
        doc.line(14, 270, 196, 270)
        doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100)
        doc.text(s.footerText, 14, 274)
        doc.text(`Page ${i} of ${pageCount}`, 196, 274, { align: 'right' })
      }

      doc.save(`Customer_Compliance_${new Date().toISOString().split('T')[0]}.pdf`)
    } finally {
      setExporting(false)
    }
  }

  const exportToExcel = () => {
    const rows: any[] = []
    for (const group of groups) {
      rows.push({
        'Customer': group.customerName,
        'Type': group.customerType || '',
        'Vessel': '',
        'IMO': '',
        'Assured': '',
        'Total Docs': '',
        'Compliant': '',
        'Missing': '',
        'Expiring Soon': '',
        'Expired': '',
        'Compliance %': '',
      })
      for (const v of group.vessels) {
        rows.push({
          'Customer': '',
          'Type': '',
          'Vessel': v.vesselName,
          'IMO': v.imoNumber,
          'Assured': v.assured,
          'Total Docs': v.totalRequired,
          'Compliant': v.compliant,
          'Missing': v.missing,
          'Expiring Soon': v.expiringSoon,
          'Expired': v.expired,
          'Compliance %': `${v.pct}%`,
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Customer Compliance')
    XLSX.writeFile(wb, `Customer_Compliance_${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handlePortfolioPDF = async (custId: string, custName: string, custType: string | null) => {
    setExportingPortfolio(custId)
    try {
      await exportCustomerPortfolioPDF(custId, custName, custType)
    } finally {
      setExportingPortfolio(null)
    }
  }

  const border = isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.06)'
  const totalVessels = groups.reduce((s, g) => s + g.vessels.length, 0)
  const totalMissing = groups.reduce((s, g) => g.vessels.reduce((sv, v) => sv + v.missing, s), 0)
  const avgPct = totalVessels > 0
    ? Math.round(groups.reduce((s, g) => g.vessels.reduce((sv, v) => sv + v.pct, s), 0) / totalVessels)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: '500' }}>Customer</label>
          <select
            value={selectedCustomerId}
            onChange={e => setSelectedCustomerId(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '8px', fontSize: '0.9rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)', minWidth: '220px' }}
          >
            <option value="all">All Customers</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={loadReport} disabled={loading} className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.9rem' }}>
          {loading ? 'Loading...' : 'Generate Report'}
        </button>
        {groups.length > 0 && (
          <>
            <button onClick={exportToPDF} disabled={exporting} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={16} /> {exporting ? 'Exporting...' : 'Export PDF'}
            </button>
            <button onClick={exportToExcel} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Download size={16} /> Export Excel
            </button>
          </>
        )}
      </div>

      {/* Stats */}
      {groups.length > 0 && (
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {[
            { label: 'Customers', value: groups.length, icon: <Users size={18} /> },
            { label: 'Vessels', value: totalVessels, icon: <FileText size={18} /> },
            { label: 'Missing Docs', value: totalMissing, icon: <AlertCircle size={18} />, color: totalMissing > 0 ? 'var(--danger)' : undefined },
            {
              label: 'Avg. Compliance',
              value: `${avgPct}%`,
              icon: <CheckCircle size={18} />,
              color: avgPct === 100 ? (isLight ? '#008c46' : '#00c264') : avgPct >= 70 ? (isLight ? '#b45309' : '#f59e0b') : 'var(--danger)',
            },
          ].map(s => (
            <div key={s.label} style={{ padding: '14px 20px', background: 'var(--bg-card)', borderRadius: '10px', border, display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ color: s.color || 'var(--accent-primary)' }}>{s.icon}</span>
              <div>
                <div style={{ fontSize: '1.4rem', fontWeight: '700', color: s.color || 'var(--text-primary)' }}>{s.value}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customer groups */}
      {groups.map(group => (
        <div key={group.customerId || '__unassigned__'} style={{ background: 'var(--bg-card)', borderRadius: '12px', border, overflow: 'hidden' }}>
          {/* Customer header */}
          <div style={{ padding: '12px 18px', background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--table-border)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Users size={16} color="var(--accent-primary)" />
            <span style={{ fontWeight: '700', fontSize: '1rem', color: 'var(--text-primary)' }}>{group.customerName}</span>
            {group.customerType && (
              <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(99,102,241,0.12)', color: isLight ? '#4f46e5' : '#818cf8', fontWeight: '600', textTransform: 'uppercase' }}>
                {group.customerType}
              </span>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {group.vessels.length} vessel{group.vessels.length !== 1 ? 's' : ''}
              </span>
              {group.customerId && (
                <button
                  onClick={(e) => { e.stopPropagation(); handlePortfolioPDF(group.customerId!, group.customerName, group.customerType) }}
                  disabled={exportingPortfolio === group.customerId}
                  className="btn-secondary"
                  style={{ padding: '3px 10px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px' }}
                >
                  <Briefcase size={13} />
                  {exportingPortfolio === group.customerId ? 'Exporting...' : 'Portfolio PDF'}
                </button>
              )}
            </span>
          </div>

          {/* Vessel table */}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--table-header-bg)' }}>
                {['Vessel', 'IMO', 'Assured', 'Docs', 'Missing', 'Expiring', '%'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', fontSize: '0.73rem', fontWeight: '600', color: 'var(--text-secondary)', textAlign: ['Docs', 'Missing', 'Expiring', '%'].includes(h) ? 'center' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--table-border)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.vessels.map(v => {
                const pctColor = v.pct === 100
                  ? (isLight ? '#008c46' : '#00c264')
                  : v.missing > 0 ? 'var(--danger)'
                  : (isLight ? '#b45309' : '#f59e0b')
                return (
                  <tr key={v.vesselId} style={{ borderTop: '1px solid var(--table-border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--text-primary)', fontSize: '0.85rem' }}>{v.vesselName}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.82rem', fontFamily: 'monospace' }}>{v.imoNumber}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>{v.assured}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--text-primary)', fontSize: '0.82rem' }}>{v.compliant}/{v.totalRequired}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.82rem', fontWeight: v.missing > 0 ? '700' : '400', color: v.missing > 0 ? 'var(--danger)' : 'var(--text-secondary)' }}>
                      {v.missing > 0 ? v.missing : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontSize: '0.82rem', fontWeight: v.expiringSoon > 0 ? '600' : '400', color: v.expiringSoon > 0 ? (isLight ? '#b45309' : '#f59e0b') : 'var(--text-secondary)' }}>
                      {v.expiringSoon > 0 ? v.expiringSoon : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: pctColor, fontSize: '0.85rem' }}>{v.pct}%</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {groups.length === 0 && !loading && (
        <div style={{ padding: '64px', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border }}>
          <Users size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.3 }} />
          <div style={{ fontSize: '1rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>No report generated yet</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Select a customer and click Generate Report.</p>
        </div>
      )}
    </div>
  )
}
