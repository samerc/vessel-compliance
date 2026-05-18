import { useState, useEffect, useMemo, useRef } from 'react'
import { Download, Search, Ship, Layers, X, FileText } from 'lucide-react'
import { Vessel, Entity, VesselAssured, Fleet } from '../../../shared/types'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { getReportSettings } from '../services/ReportSettingsService'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx-js-style'

interface AssuredRow {
  vesselName: string
  vesselImo: string
  fleetName: string
  assuredName: string
  role: string
  entityType: string
  email: string
  phone: string
}

export default function AssuredReport() {
  const { theme } = useTheme()
  const isLight = theme === 'light' || theme === 'aurora'
  const { showError, showSuccess } = useToast()

  const [vessels, setVessels] = useState<Vessel[]>([])
  const [allAssureds, setAllAssureds] = useState<VesselAssured[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [fleets, setFleets] = useState<Fleet[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [filterMode, setFilterMode] = useState<'all' | 'fleet' | 'vessels'>('all')
  const [selectedFleetId, setSelectedFleetId] = useState('')
  const [selectedVesselIds, setSelectedVesselIds] = useState<Set<string>>(new Set())
  const [vesselSearch, setVesselSearch] = useState('')
  const [vesselDropdownOpen, setVesselDropdownOpen] = useState(false)
  const [fleetSearch, setFleetSearch] = useState('')
  const [fleetDropdownOpen, setFleetDropdownOpen] = useState(false)
  const [assuredSearch, setAssuredSearch] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [v, a, e, f] = await Promise.all([
        window.api.getVessels(),
        window.api.getVesselAssureds(),
        window.api.getEntities(),
        window.api.getFleets()
      ])
      setVessels((Array.isArray(v) ? v : []).filter((vv: Vessel) => vv.isActive))
      setAllAssureds(Array.isArray(a) ? a : [])
      setEntities(Array.isArray(e) ? e : [])
      setFleets(Array.isArray(f) ? f : [])
    } catch (err: any) {
      showError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of entities) m.set(e.id, e)
    return m
  }, [entities])

  const fleetMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const f of fleets) m.set(f.id, f.name)
    return m
  }, [fleets])

  const filteredVessels = useMemo(() => {
    if (filterMode === 'fleet' && selectedFleetId) return vessels.filter(v => v.fleetId === selectedFleetId)
    if (filterMode === 'vessels' && selectedVesselIds.size > 0) return vessels.filter(v => selectedVesselIds.has(v.id))
    return vessels
  }, [vessels, filterMode, selectedFleetId, selectedVesselIds])

  const rows = useMemo(() => {
    const result: AssuredRow[] = []
    for (const v of filteredVessels) {
      const vesselAssureds = allAssureds.filter(a => a.vesselId === v.id)
      if (vesselAssureds.length === 0) {
        result.push({ vesselName: v.name, vesselImo: v.imoNumber || '', fleetName: v.fleetId ? (fleetMap.get(v.fleetId) || '') : '', assuredName: '', role: '', entityType: '', email: '', phone: '' })
        continue
      }
      for (const a of vesselAssureds) {
        const entity = a.entityId ? entityMap.get(a.entityId) : null
        result.push({
          vesselName: v.name, vesselImo: v.imoNumber || '', fleetName: v.fleetId ? (fleetMap.get(v.fleetId) || '') : '',
          assuredName: entity?.name || a.entityId || '', role: a.role || '', entityType: entity?.type || '', email: entity?.email || '', phone: entity?.phone || ''
        })
      }
    }
    return result
  }, [filteredVessels, allAssureds, entityMap, fleetMap])

  const displayRows = useMemo(() => {
    if (!assuredSearch) return rows
    const q = assuredSearch.toLowerCase()
    return rows.filter(r => r.vesselName.toLowerCase().includes(q) || r.assuredName.toLowerCase().includes(q) || r.role.toLowerCase().includes(q) || r.vesselImo.includes(q))
  }, [rows, assuredSearch])

  const groupedByVessel = useMemo(() => {
    const groups: { vessel: string; imo: string; fleet: string; assureds: AssuredRow[] }[] = []
    const seen = new Map<string, typeof groups[0]>()
    for (const r of displayRows) {
      if (!seen.has(r.vesselName)) {
        const g = { vessel: r.vesselName, imo: r.vesselImo, fleet: r.fleetName, assureds: [] as AssuredRow[] }
        seen.set(r.vesselName, g)
        groups.push(g)
      }
      seen.get(r.vesselName)!.assureds.push(r)
    }
    return groups
  }, [displayRows])

  const uniqueAssureds = useMemo(() => {
    const names = new Set<string>()
    for (const r of displayRows) if (r.assuredName) names.add(r.assuredName)
    return names.size
  }, [displayRows])

  const getLabel = () => filterMode === 'fleet' && selectedFleetId ? fleetMap.get(selectedFleetId) || 'Fleet' : filterMode === 'vessels' ? 'Selected Vessels' : 'All Vessels'

  const exportExcel = () => {
    if (displayRows.length === 0) return
    const data = displayRows.map(r => ({ 'Vessel': r.vesselName, 'IMO': r.vesselImo, 'Fleet': r.fleetName, 'Assured Name': r.assuredName, 'Role': r.role, 'Type': r.entityType, 'Email': r.email, 'Phone': r.phone }))
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 28 }, { wch: 18 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assured Report')
    XLSX.writeFile(wb, `Assured Report - ${getLabel()}.xlsx`)
    showSuccess('Exported to Excel')
  }

  const exportPdf = async () => {
    if (displayRows.length === 0) return
    try {
      const s = await getReportSettings()
      const doc = new jsPDF({ orientation: 'landscape' })
      const accent: [number, number, number] = s.primaryColor || [0, 170, 200]

      // Header
      doc.setFillColor(accent[0], accent[1], accent[2])
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 14, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(255, 255, 255)
      doc.text(s.companyName || 'Assured Report', 14, 9)
      doc.setFontSize(9)
      doc.text(`Assured Report — ${getLabel()}`, doc.internal.pageSize.getWidth() - 14, 9, { align: 'right' })

      // Table
      const head = [['Vessel', 'IMO', 'Fleet', 'Assured', 'Role', 'Type', 'Email', 'Phone']]
      const body = displayRows.map(r => [r.vesselName.toUpperCase(), r.vesselImo, r.fleetName, r.assuredName, r.role, r.entityType, r.email, r.phone])

      autoTable(doc, {
        startY: 18,
        head,
        body,
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        headStyles: { fillColor: accent, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [245, 247, 252] },
        didDrawPage: () => {
          // Footer
          doc.setFontSize(7)
          doc.setTextColor(150)
          doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, doc.internal.pageSize.getHeight() - 6)
          doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, doc.internal.pageSize.getWidth() - 14, doc.internal.pageSize.getHeight() - 6, { align: 'right' })
        }
      })

      doc.save(`Assured Report - ${getLabel()}.pdf`)
      showSuccess('Exported to PDF')
    } catch (err: any) {
      showError(err.message || 'PDF export failed')
    }
  }

  // Vessel search + select
  const vesselDropdownRef = useRef<HTMLDivElement>(null)
  const filteredVesselOptions = useMemo(() => {
    if (!vesselSearch) return []
    const q = vesselSearch.toLowerCase()
    return vessels.filter(v => !selectedVesselIds.has(v.id) && (v.name.toLowerCase().includes(q) || (v.imoNumber || '').includes(q))).slice(0, 15)
  }, [vessels, vesselSearch, selectedVesselIds])

  // Fleet search
  const filteredFleetOptions = useMemo(() => {
    if (!fleetSearch) return fleets
    const q = fleetSearch.toLowerCase()
    return fleets.filter(f => f.name.toLowerCase().includes(q))
  }, [fleets, fleetSearch])

  const selectedVesselNames = useMemo(() => {
    return vessels.filter(v => selectedVesselIds.has(v.id))
  }, [vessels, selectedVesselIds])

  if (loading) return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>

  return (
    <div>
      {/* Filter Controls */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '20px', overflow: 'visible' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['all', 'fleet', 'vessels'] as const).map(mode => (
            <button key={mode} onClick={() => { setFilterMode(mode); setSelectedFleetId(''); setSelectedVesselIds(new Set()); setVesselSearch(''); setFleetSearch('') }}
              style={{
                padding: '7px 16px', borderRadius: '8px', fontSize: '0.82rem', cursor: 'pointer',
                border: filterMode === mode ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                background: filterMode === mode ? 'rgba(0,210,255,0.08)' : 'transparent',
                color: filterMode === mode ? 'var(--accent-primary)' : 'var(--text-secondary)',
                fontWeight: filterMode === mode ? 600 : 400,
                display: 'flex', alignItems: 'center', gap: '6px'
              }}>
              {mode === 'all' && <><Ship size={14} /> All Active Vessels</>}
              {mode === 'fleet' && <><Layers size={14} /> By Fleet</>}
              {mode === 'vessels' && <><Ship size={14} /> Select Vessels</>}
            </button>
          ))}
        </div>

        {/* Fleet: searchable dropdown */}
        {filterMode === 'fleet' && (
          <div style={{ position: 'relative', maxWidth: '320px' }}>
            <input type="text" value={fleetSearch} onChange={e => { setFleetSearch(e.target.value); setFleetDropdownOpen(true) }}
              onFocus={() => setFleetDropdownOpen(true)} onBlur={() => setTimeout(() => setFleetDropdownOpen(false), 150)}
              placeholder="Search fleets..." style={{ width: '100%' }} />
            {fleetDropdownOpen && filteredFleetOptions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)', borderRadius: '8px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                {filteredFleetOptions.map(f => (
                  <div key={f.id} onMouseDown={() => { setSelectedFleetId(f.id); setFleetSearch(f.name); setFleetDropdownOpen(false) }}
                    style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)', fontWeight: selectedFleetId === f.id ? 600 : 400, color: selectedFleetId === f.id ? 'var(--accent-primary)' : 'var(--text-primary)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    {f.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Vessels: search + select chips */}
        {filterMode === 'vessels' && (
          <div>
            {/* Selected vessel chips */}
            {selectedVesselNames.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                {selectedVesselNames.map(v => (
                  <span key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px 3px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600, background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)', border: '1px solid rgba(0,210,255,0.25)' }}>
                    {v.name}
                    <button onClick={() => setSelectedVesselIds(prev => { const n = new Set(prev); n.delete(v.id); return n })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '0 2px', display: 'flex' }}><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <div style={{ position: 'relative', maxWidth: '320px' }} ref={vesselDropdownRef}>
              <input type="text" value={vesselSearch} onChange={e => { setVesselSearch(e.target.value); setVesselDropdownOpen(true) }}
                onFocus={() => { if (vesselSearch) setVesselDropdownOpen(true) }} onBlur={() => setTimeout(() => setVesselDropdownOpen(false), 150)}
                placeholder="Search and select vessels..." style={{ width: '100%' }} />
              {vesselDropdownOpen && filteredVesselOptions.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', maxHeight: '200px', overflowY: 'auto', background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)', borderRadius: '8px', zIndex: 100, boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
                  {filteredVesselOptions.map(v => (
                    <div key={v.id} onMouseDown={() => { setSelectedVesselIds(prev => new Set(prev).add(v.id)); setVesselSearch(''); setVesselDropdownOpen(false) }}
                      style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '0.85rem', borderBottom: '1px solid var(--table-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = isLight ? 'rgba(0,150,200,0.06)' : 'rgba(0,210,255,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <span style={{ fontWeight: 600 }}>{v.name}</span>
                      <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.78rem' }}>IMO: {v.imoNumber}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats + Search + Export */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '16px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
          <span><strong style={{ color: 'var(--text-primary)' }}>{filteredVessels.length}</strong> vessels</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{uniqueAssureds}</strong> assureds</span>
          <span><strong style={{ color: 'var(--text-primary)' }}>{displayRows.length}</strong> rows</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input type="text" value={assuredSearch} onChange={e => setAssuredSearch(e.target.value)}
              placeholder="Search results..." style={{ paddingLeft: '30px', width: '200px', fontSize: '0.82rem' }} />
          </div>
          <button onClick={exportExcel} disabled={displayRows.length === 0} className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}>
            <Download size={14} /> Excel
          </button>
          <button onClick={exportPdf} disabled={displayRows.length === 0} className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', padding: '7px 14px' }}>
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>

      {/* Report Table */}
      {groupedByVessel.length === 0 ? (
        <div className="glass-card" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          {filterMode === 'vessels' && selectedVesselIds.size === 0 ? 'Select vessels to generate the report' :
           filterMode === 'fleet' && !selectedFleetId ? 'Select a fleet to generate the report' :
           'No assureds found for the selected vessels'}
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: isLight ? '#f0f2f8' : 'rgba(255,255,255,0.03)', borderBottom: '2px solid var(--table-border)' }}>
                <th style={thStyle}>Vessel</th>
                <th style={thStyle}>IMO</th>
                <th style={thStyle}>Fleet</th>
                <th style={thStyle}>Assured</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Phone</th>
              </tr>
            </thead>
            <tbody>
              {groupedByVessel.map((group, gi) => (
                group.assureds.map((r, ri) => (
                  <tr key={`${gi}-${ri}`} style={{ borderBottom: '1px solid var(--table-border)', background: ri === 0 && gi % 2 === 0 ? (isLight ? 'rgba(0,150,200,0.02)' : 'rgba(0,210,255,0.015)') : 'transparent' }}>
                    {ri === 0 ? (
                      <>
                        <td style={{ ...tdStyle, fontWeight: 600, textTransform: 'uppercase' }} rowSpan={group.assureds.length}>{group.vessel}</td>
                        <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--text-secondary)' }} rowSpan={group.assureds.length}>{group.imo}</td>
                        <td style={{ ...tdStyle, fontSize: '0.78rem' }} rowSpan={group.assureds.length}>{group.fleet}</td>
                      </>
                    ) : null}
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{r.assuredName || <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>No assureds</span>}</td>
                    <td style={tdStyle}>{r.role && <span style={{ padding: '1px 6px', borderRadius: '6px', background: 'rgba(0,210,255,0.08)', color: 'var(--accent-primary)', fontSize: '0.75rem' }}>{r.role}</span>}</td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.entityType}</td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem' }}>{r.email}</td>
                    <td style={{ ...tdStyle, fontSize: '0.78rem' }}>{r.phone}</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 12px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '0.78rem', whiteSpace: 'nowrap' }
const tdStyle: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
