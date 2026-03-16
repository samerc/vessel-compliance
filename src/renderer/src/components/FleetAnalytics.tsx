import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Ship, Globe, Anchor, Calendar, TrendingUp, Shield, BarChart3,
  RefreshCw, Loader2, ChevronDown, ChevronRight, Save, Trash2,
  FileDown, Users, Filter, X,
} from 'lucide-react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import {
  AnalyticsFilters, AnalyticsPreset,
  PolicyType, Fleet, Entity, FlagState, VesselType,
} from '../../../shared/types'
import { getReportSettings } from '../services/ReportSettingsService'
import { getFlagClass } from '../utils/countryCodeMap'
import 'flag-icons/css/flag-icons.min.css'

const currentYear = new Date().getFullYear()
const fmt = (n: number) => n.toLocaleString()

// ── helpers ───────────────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(item)
  }
  return map
}

const AGE_BUCKETS = [
  { label: '0-5 yrs', min: 0, max: 5, color: '#10b981' },
  { label: '5-10', min: 5, max: 10, color: '#22c55e' },
  { label: '10-15', min: 10, max: 15, color: '#84cc16' },
  { label: '15-20', min: 15, max: 20, color: '#eab308' },
  { label: '20-25', min: 20, max: 25, color: '#f59e0b' },
  { label: '25+', min: 25, max: 999, color: '#ef4444' },
]

const TONNAGE_BUCKETS = [
  { label: '0-5K', min: 0, max: 5000, color: '#06b6d4' },
  { label: '5-10K', min: 5000, max: 10000, color: '#0ea5e9' },
  { label: '10-25K', min: 10000, max: 25000, color: '#3b82f6' },
  { label: '25-50K', min: 25000, max: 50000, color: '#6366f1' },
  { label: '50-100K', min: 50000, max: 100000, color: '#8b5cf6' },
  { label: '100K+', min: 100000, max: Infinity, color: '#a855f7' },
]

const OFAC_STYLES: Record<string, { bg: string; border: string; text: string }> = {
  CLEARED: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#10b981' },
  PENDING: { bg: 'rgba(128,128,128,0.1)', border: 'rgba(128,128,128,0.2)', text: '#888888' },
  POTENTIAL_MATCH: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', text: '#f59e0b' },
  MATCH: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', text: '#ef4444' },
  NOT_CHECKED: { bg: 'rgba(128,128,128,0.08)', border: 'rgba(128,128,128,0.15)', text: '#6b7280' },
}

const DEFAULT_FILTERS: AnalyticsFilters = {
  activeOnly: true,
  policyTypeIds: [],
  fleetIds: [],
  customerIds: [],
  flagStateIds: [],
  vesselTypeIds: [],
}

// ── Chip ──────────────────────────────────────────────────────────────────────

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: '14px',
        fontSize: '0.78rem',
        fontWeight: selected ? 600 : 400,
        cursor: 'pointer',
        border: selected ? '1px solid var(--accent-primary)' : '1px solid var(--input-border)',
        background: selected ? 'rgba(0, 210, 255, 0.12)' : 'transparent',
        color: selected ? 'var(--accent-primary)' : 'var(--text-secondary)',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        lineHeight: '1.4',
      }}
    >
      {label}
    </button>
  )
}

// ── FilterSection ─────────────────────────────────────────────────────────────

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--table-border)' }}>
      <div style={{
        fontSize: '0.7rem',
        fontWeight: 700,
        color: 'var(--text-secondary)',
        textTransform: 'uppercase',
        letterSpacing: '0.6px',
        marginBottom: '10px',
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ── CollapsibleFilter ─────────────────────────────────────────────────────────

function CollapsibleFilter({ label, children, defaultCollapsed = false }: {
  label: string
  children: React.ReactNode
  defaultCollapsed?: boolean
}) {
  const [open, setOpen] = useState(!defaultCollapsed)
  return (
    <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--table-border)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', marginBottom: open ? '10px' : 0,
        }}
      >
        <span style={{
          fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: '0.6px',
        }}>
          {label}
        </span>
        {open
          ? <ChevronDown size={13} color="var(--text-secondary)" />
          : <ChevronRight size={13} color="var(--text-secondary)" />}
      </button>
      {open && children}
    </div>
  )
}

// ── MultiSelectDropdown ───────────────────────────────────────────────────────

function MultiSelectDropdown({ label, options, selectedIds, onChange, isLight }: {
  label: string
  options: { id: string; name: string }[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  isLight: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const dropdownBg = isLight ? '#ffffff' : '#1a1d28'

  const filtered = useMemo(() => {
    if (!search) return options
    const q = search.toLowerCase()
    return options.filter(o => o.name.toLowerCase().includes(q))
  }, [options, search])

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id)
      ? selectedIds.filter(x => x !== id)
      : [...selectedIds, id])
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '6px 10px', borderRadius: '6px',
          border: '1px solid var(--input-border)', background: dropdownBg,
          color: 'var(--text-primary)', fontSize: '0.78rem', textAlign: 'left',
          cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedIds.length === 0 ? `Select ${label}...` : `${selectedIds.length} selected`}
        </span>
        <ChevronDown size={13} style={{
          flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: '0.15s',
        }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
          background: dropdownBg, border: '1px solid var(--input-border)',
          borderRadius: '6px', marginTop: '2px', maxHeight: '240px', overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}>
          {/* All / None buttons */}
          <div style={{
            display: 'flex', gap: '4px', padding: '6px 8px',
            borderBottom: '1px solid var(--table-border)',
            position: 'sticky', top: 0, background: dropdownBg, zIndex: 1,
          }}>
            <button
              onClick={() => onChange(options.map(o => o.id))}
              style={{
                padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
                borderRadius: '4px', border: '1px solid var(--input-border)',
                background: 'transparent', color: 'var(--accent-primary)',
                cursor: 'pointer',
              }}
            >
              All
            </button>
            <button
              onClick={() => onChange([])}
              style={{
                padding: '2px 8px', fontSize: '0.7rem', fontWeight: 600,
                borderRadius: '4px', border: '1px solid var(--input-border)',
                background: 'transparent', color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              None
            </button>
          </div>
          {options.length > 6 && (
            <div style={{
              padding: '6px', borderBottom: '1px solid var(--table-border)',
              position: 'sticky', top: 32, background: dropdownBg, zIndex: 1,
            }}>
              <input
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '4px 8px', fontSize: '0.78rem',
                  borderRadius: '4px', border: '1px solid var(--input-border)',
                  background: dropdownBg, color: 'var(--text-primary)', boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          {filtered.map(o => (
            <label key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '5px 10px', cursor: 'pointer', fontSize: '0.78rem',
              color: 'var(--text-primary)',
            }}>
              <input
                type="checkbox"
                checked={selectedIds.includes(o.id)}
                onChange={() => toggle(o.id)}
                style={{ accentColor: 'var(--accent-primary)' }}
              />
              {o.name}
            </label>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '10px', fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No results
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KPI({ icon, gradient, label, value, sub }: {
  icon: React.ReactNode
  gradient: string
  label: string
  value: string | number
  sub?: string
}) {
  return (
    <div className="glass-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
      <div style={{
        width: '48px', height: '48px', borderRadius: '14px',
        background: gradient,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: '600',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '3px',
        }}>
          {label}
        </div>
        <div style={{
          fontSize: String(value).length > 8 ? '1.4rem' : '1.75rem',
          fontWeight: '800',
          lineHeight: 1,
          letterSpacing: '-0.03em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}>
          {value}
        </div>
        {sub && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ChartCard ─────────────────────────────────────────────────────────────────

function ChartCard({ title, icon, accentColor, count, children }: {
  title: string
  icon: React.ReactNode
  accentColor: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <div className="glass-card" style={{ padding: '20px 22px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid var(--table-border)',
      }}>
        <h3 style={{
          margin: 0, fontSize: '0.8rem', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)',
          display: 'flex', alignItems: 'center', gap: '7px',
        }}>
          <span style={{ color: accentColor, display: 'flex', alignItems: 'center' }}>{icon}</span>
          {title}
        </h3>
        {count !== undefined && (
          <span style={{
            fontSize: '0.74rem', fontWeight: '700',
            color: 'var(--text-secondary)',
            background: 'var(--table-header-bg)',
            padding: '2px 9px', borderRadius: '10px',
            border: '1px solid var(--table-border)',
          }}>
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ── ProgressBar (inline) ──────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{
      height: '6px', borderRadius: '3px',
      background: 'rgba(0,170,200,0.15)',
      flex: 1, minWidth: '60px',
    }}>
      <div style={{
        height: '100%', borderRadius: '3px',
        background: 'var(--accent-primary)',
        width: `${Math.min(pct, 100)}%`,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

// ── table cell style helpers ──────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', fontSize: '0.75rem', fontWeight: 600,
  color: 'var(--text-secondary)', background: 'var(--table-header-bg)',
  borderBottom: '1px solid var(--table-border)', whiteSpace: 'nowrap',
}

const tdStyle = (idx: number): React.CSSProperties => ({
  padding: '9px 14px', fontSize: '0.84rem', color: 'var(--text-primary)',
  borderBottom: '1px solid var(--table-border)',
  background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
})

// ══════════════════════════════════════════════════════════════════════════════
// ── Main component ───────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

export default function FleetAnalytics() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showSuccess, showError } = useToast()
  useAuth()

  // ── Reference data ──────────────────────────────────────────────────────────
  const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
  const [fleets, setFleets] = useState<Fleet[]>([])
  const [entities, setEntities] = useState<Entity[]>([])
  const [flagStates, setFlagStates] = useState<FlagState[]>([])
  const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
  const [presets, setPresets] = useState<AnalyticsPreset[]>([])

  // ── Filter state ────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<AnalyticsFilters>({ ...DEFAULT_FILTERS })
  const [selectedPresetId, setSelectedPresetId] = useState<string>('')

  // ── Result state ────────────────────────────────────────────────────────────
  const [vessels, setVessels] = useState<any[]>([])
  const [policyCoverage, setPolicyCoverage] = useState<{ name: string; vesselCount: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [hasQueried, setHasQueried] = useState(false)

  // ── Export modal ────────────────────────────────────────────────────────────
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel'>('pdf')
  const [exportSections, setExportSections] = useState({
    kpi: true,
    vesselTypes: true,
    flagStates: true,
    ageDistribution: true,
    tonnageDistribution: true,
    policyCoverage: true,
    topCustomers: true,
    ofacStatus: true,
    rawVesselData: true,
  })

  const toggleExportSection = (key: keyof typeof exportSections) => {
    setExportSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Load reference data on mount ────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [pt, fl, en, fs, vt, pr] = await Promise.all([
          window.api.getPolicyTypes(),
          window.api.getFleets(),
          window.api.getEntities(),
          window.api.getFlagStates(),
          window.api.getVesselTypes(),
          window.api.analyticsGetPresets(),
        ])
        setPolicyTypes(Array.isArray(pt) ? pt : [])
        setFleets(Array.isArray(fl) ? fl : [])
        setEntities(Array.isArray(en) ? en : [])
        setFlagStates(Array.isArray(fs) ? fs : [])
        setVesselTypes(Array.isArray(vt) ? vt : [])
        setPresets(Array.isArray(pr) ? pr : [])
      } catch { /* ignore */ }
    }
    load()
  }, [])

  // ── Derived: customers (entities that are customers of at least one vessel) ─
  // We don't know at filter-load time which entities are customers, so we show all entities.
  // The backend filters by customer_id anyway.
  const customerEntities = useMemo(() =>
    entities.filter(e => e.type === 'company'),
  [entities])

  // ── Apply filters ───────────────────────────────────────────────────────────
  const applyFilters = useCallback(async () => {
    setLoading(true)
    setHasQueried(true)
    try {
      const result = await window.api.analyticsGetData(filters) as any
      if (result && !result.error) {
        setVessels(Array.isArray(result.vessels) ? result.vessels : [])
        setPolicyCoverage(Array.isArray(result.policyCoverage) ? result.policyCoverage : [])
      } else {
        showError('Failed to load analytics data')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load analytics data'
      showError(msg)
    } finally {
      setLoading(false)
    }
  }, [filters, showError])

  // ── Preset management ───────────────────────────────────────────────────────
  const handleSavePreset = async () => {
    const name = window.prompt('Preset name:')
    if (!name?.trim()) return
    try {
      const created = await window.api.analyticsAddPreset(name.trim(), filters) as any
      if (created && !created.error) {
        setPresets(p => [...p, created])
        setSelectedPresetId(created.id)
        showSuccess(`Preset "${name.trim()}" saved`)
      }
    } catch {
      showError('Failed to save preset')
    }
  }

  const handleLoadPreset = (id: string) => {
    setSelectedPresetId(id)
    const preset = presets.find(p => p.id === id)
    if (preset?.filters) {
      setFilters({
        ...DEFAULT_FILTERS,
        ...preset.filters,
      })
    }
  }

  const handleDeletePreset = async (id: string) => {
    try {
      await window.api.analyticsDeletePreset(id)
      setPresets(p => p.filter(x => x.id !== id))
      if (selectedPresetId === id) setSelectedPresetId('')
      showSuccess('Preset deleted')
    } catch {
      showError('Failed to delete preset')
    }
  }

  // ── Filter update helpers ───────────────────────────────────────────────────
  const updateFilter = <K extends keyof AnalyticsFilters>(key: K, value: AnalyticsFilters[K]) => {
    setFilters(f => ({ ...f, [key]: value }))
  }

  // ── Vessel status helper ────────────────────────────────────────────────────
  type VesselStatusFilter = 'active' | 'inactive' | 'all'
  const vesselStatus: VesselStatusFilter = filters.activeOnly ? 'active' : 'all'
  const setVesselStatus = (s: VesselStatusFilter) => {
    updateFilter('activeOnly', s === 'active')
  }

  // ── Export functions ────────────────────────────────────────────────────────
  const exportPDF = async (sections: typeof exportSections) => {
    setExportModalOpen(false)
    try {
      const settings = await getReportSettings()
      const navy: [number, number, number] = [10, 22, 40]
      const accent: [number, number, number] = settings.primaryColor ?? [0, 170, 200]
      const date = new Date().toLocaleDateString()
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pw = doc.internal.pageSize.getWidth()

      // ── Header bar ──
      doc.setFillColor(...navy)
      doc.rect(0, 0, pw, 22, 'F')
      doc.setFillColor(...accent)
      doc.rect(0, 0, 3, 22, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(settings.companyName || 'Fleet Analytics', 10, 10)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.text('Fleet Analytics Report', 10, 16)
      doc.setFontSize(8)
      doc.text(`Generated: ${date}`, pw - 10, 14, { align: 'right' })

      let y = 30
      let needNewPage = false

      const ensurePage = () => {
        if (needNewPage) { doc.addPage(); y = 15; needNewPage = false }
      }

      // ── KPI summary (2 rows of 3) ──
      if (sections.kpi) {
        const kpiItems = [
          { label: 'Vessels', value: String(kpis.total) },
          { label: 'Avg Age', value: kpis.avgAge != null ? `${kpis.avgAge} yrs` : 'N/A' },
          { label: 'Avg Tonnage', value: kpis.avgTonnage != null ? fmt(kpis.avgTonnage) : 'N/A' },
          { label: 'Total Tonnage', value: fmt(kpis.totalTonnage) },
          { label: 'Flags', value: String(kpis.flags) },
          { label: 'Policy Coverage', value: `${kpis.policyCoveragePct}%` },
        ]
        const boxW = (pw - 20 - 8) / 3
        const boxH = 14
        for (let i = 0; i < kpiItems.length; i++) {
          const col = i % 3
          const row = Math.floor(i / 3)
          const bx = 10 + col * (boxW + 4)
          const by = y + row * (boxH + 4)
          doc.setFillColor(240, 244, 250)
          doc.roundedRect(bx, by, boxW, boxH, 2, 2, 'F')
          doc.setTextColor(...navy)
          doc.setFontSize(7)
          doc.setFont('helvetica', 'normal')
          doc.text(kpiItems[i].label.toUpperCase(), bx + 4, by + 5)
          doc.setFontSize(11)
          doc.setFont('helvetica', 'bold')
          doc.text(kpiItems[i].value, bx + 4, by + 11)
        }
        y += 2 * (boxH + 4) + 8
      }

      // ── Vessel Type Distribution table ──
      if (sections.vesselTypes) {
        ensurePage()
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Vessel Type Distribution', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Type', 'Count', '%', 'Avg Age', 'Avg Tonnage']],
          body: vesselTypeBreakdown.map(r => [
            r.name,
            String(r.count),
            `${r.pct.toFixed(1)}%`,
            r.avgAge != null ? `${r.avgAge} yrs` : 'N/A',
            r.avgTonnage != null ? fmt(r.avgTonnage) : 'N/A',
          ]),
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      // ── Flag States ──
      if (sections.flagStates) {
        needNewPage = true
        ensurePage()
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Flag State Distribution (Top 15)', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Flag', 'Count', '%']],
          body: [
            ...flagDistribution.rows.map(r => [r.name, String(r.count), `${r.pct.toFixed(1)}%`]),
            ...(flagDistribution.othersCount > 0
              ? [['Others', String(flagDistribution.othersCount),
                `${pool.length > 0 ? ((flagDistribution.othersCount / pool.length) * 100).toFixed(1) : 0}%`]]
              : []),
          ],
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      // ── Age Distribution ──
      if (sections.ageDistribution) {
        const ageStartY = y
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Age Distribution', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Range', 'Count', '%']],
          body: ageProfile.map(r => [r.label, String(r.count), `${r.pct.toFixed(1)}%`]),
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: sections.tonnageDistribution ? pw / 2 + 5 : 10 },
        })
        const ageTableBottom = (doc as any).lastAutoTable.finalY

        // ── Tonnage Distribution (side by side if both selected) ──
        if (sections.tonnageDistribution) {
          doc.setTextColor(...navy)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'bold')
          doc.text('Tonnage Distribution', pw / 2 + 5, ageStartY)

          autoTable(doc, {
            startY: ageStartY + 2,
            head: [['Range', 'Count', '%']],
            body: tonnageProfile.map(r => [r.label, String(r.count), `${r.pct.toFixed(1)}%`]),
            theme: 'grid',
            headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
            bodyStyles: { fontSize: 7.5 },
            margin: { left: pw / 2 + 5, right: 10 },
          })
          y = Math.max(ageTableBottom, (doc as any).lastAutoTable.finalY) + 8
        } else {
          y = ageTableBottom + 8
        }
      } else if (sections.tonnageDistribution) {
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Tonnage Distribution', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Range', 'Count', '%']],
          body: tonnageProfile.map(r => [r.label, String(r.count), `${r.pct.toFixed(1)}%`]),
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      // ── Policy Coverage ──
      if (sections.policyCoverage) {
        needNewPage = true
        ensurePage()
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Policy Coverage', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Policy Type', 'Vessels Covered', '%']],
          body: policyCoverage.map(r => [
            r.name,
            String(r.vesselCount),
            `${pool.length > 0 ? ((r.vesselCount / pool.length) * 100).toFixed(1) : 0}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      // ── Top Customers ──
      if (sections.topCustomers) {
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('Top Customers', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Customer', 'Vessels', '%', 'Types']],
          body: customerConcentration.map(r => [
            r.name,
            String(r.count),
            `${r.pct.toFixed(1)}%`,
            r.types,
          ]),
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: 10 },
        })
        y = (doc as any).lastAutoTable.finalY + 8
      }

      // ── OFAC Status ──
      if (sections.ofacStatus) {
        doc.setTextColor(...navy)
        doc.setFontSize(10)
        doc.setFont('helvetica', 'bold')
        doc.text('OFAC / Sanctions Status', 10, y)
        y += 2

        autoTable(doc, {
          startY: y,
          head: [['Status', 'Count', '%']],
          body: ofacStatus.map(r => [
            r.label,
            String(r.count),
            `${pool.length > 0 ? ((r.count / pool.length) * 100).toFixed(1) : 0}%`,
          ]),
          theme: 'grid',
          headStyles: { fillColor: navy, fontSize: 7.5, fontStyle: 'bold' },
          bodyStyles: { fontSize: 7.5 },
          margin: { left: 10, right: 10 },
        })
      }

      // ── Page footers ──
      const totalPages = doc.getNumberOfPages()
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p)
        const ph = doc.internal.pageSize.getHeight()
        doc.setDrawColor(200, 200, 200)
        doc.line(10, ph - 12, pw - 10, ph - 12)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(130, 130, 130)
        doc.text(`Generated ${date}`, 10, ph - 7)
        doc.text(settings.companyName || '', pw / 2, ph - 7, { align: 'center' })
        doc.text(`Page ${p} of ${totalPages}`, pw - 10, ph - 7, { align: 'right' })
      }

      const dateStr = new Date().toISOString().slice(0, 10)
      doc.save(`Fleet_Analytics_${dateStr}.pdf`)
      showSuccess('PDF exported successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export PDF'
      showError(msg)
    }
  }

  const exportExcel = (sections: typeof exportSections) => {
    setExportModalOpen(false)
    try {
      const dateStr = new Date().toISOString().slice(0, 10)
      const wb = XLSX.utils.book_new()

      // ── Sheet 1: Summary ──
      if (sections.kpi) {
        const summaryData = [
          ['Fleet Analytics Report'],
          [],
          ['Generated:', new Date().toLocaleDateString()],
          ['Vessels in Selection:', kpis.total],
          [],
          ['Metric', 'Value'],
          ['Average Age', kpis.avgAge != null ? `${kpis.avgAge} yrs` : 'N/A'],
          ['Average Tonnage', kpis.avgTonnage != null ? fmt(kpis.avgTonnage) : 'N/A'],
          ['Total Tonnage', fmt(kpis.totalTonnage)],
          ['Flags', kpis.flags],
          ['Policy Coverage', `${kpis.policyCoveragePct}%`],
        ]
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
        wsSummary['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }]
        wsSummary['!cols'] = [{ wch: 22 }, { wch: 18 }]
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')
      }

      // ── Sheet 2: Vessel Type Distribution ──
      if (sections.vesselTypes) {
        const typeData = [
          ['Type', 'Count', 'Percentage', 'Avg Age', 'Avg Tonnage'],
          ...vesselTypeBreakdown.map(r => [
            r.name,
            r.count,
            `${r.pct.toFixed(1)}%`,
            r.avgAge != null ? r.avgAge : 'N/A',
            r.avgTonnage != null ? r.avgTonnage : 'N/A',
          ]),
        ]
        const wsTypes = XLSX.utils.aoa_to_sheet(typeData)
        wsTypes['!cols'] = [{ wch: 24 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 14 }]
        XLSX.utils.book_append_sheet(wb, wsTypes, 'Vessel Type Distribution')
      }

      // ── Sheet 3: Flag States (all, not just top 15) ──
      if (sections.flagStates) {
        const allFlags = Array.from(
          groupBy(pool, (v: any) => v.flagStateId || '__none__').entries()
        ).map(([flagId, vs]) => {
          const fs = flagMap.get(flagId)
          return {
            name: fs?.name ?? '(Unassigned)',
            count: vs.length,
            pct: pool.length > 0 ? (vs.length / pool.length) * 100 : 0,
          }
        }).sort((a, b) => b.count - a.count)

        const flagData = [
          ['Flag', 'Count', 'Percentage'],
          ...allFlags.map(r => [r.name, r.count, `${r.pct.toFixed(1)}%`]),
        ]
        const wsFlags = XLSX.utils.aoa_to_sheet(flagData)
        wsFlags['!cols'] = [{ wch: 28 }, { wch: 8 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsFlags, 'Flag States')
      }

      // ── Sheet 4: Age Distribution ──
      if (sections.ageDistribution) {
        const ageData = [
          ['Range', 'Count', 'Percentage'],
          ...ageProfile.map(r => [r.label, r.count, `${r.pct.toFixed(1)}%`]),
        ]
        const wsAge = XLSX.utils.aoa_to_sheet(ageData)
        wsAge['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsAge, 'Age Distribution')
      }

      // ── Sheet 5: Tonnage Distribution ──
      if (sections.tonnageDistribution) {
        const tonnageData = [
          ['Range', 'Count', 'Percentage'],
          ...tonnageProfile.map(r => [r.label, r.count, `${r.pct.toFixed(1)}%`]),
        ]
        const wsTonnage = XLSX.utils.aoa_to_sheet(tonnageData)
        wsTonnage['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsTonnage, 'Tonnage Distribution')
      }

      // ── Sheet 6: Policy Coverage ──
      if (sections.policyCoverage) {
        const policyData = [
          ['Policy Type', 'Vessels Covered', 'Percentage'],
          ...policyCoverage.map(r => [
            r.name,
            r.vesselCount,
            `${pool.length > 0 ? ((r.vesselCount / pool.length) * 100).toFixed(1) : 0}%`,
          ]),
        ]
        const wsPolicy = XLSX.utils.aoa_to_sheet(policyData)
        wsPolicy['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsPolicy, 'Policy Coverage')
      }

      // ── Sheet 7: Customers (top 10) ──
      if (sections.topCustomers) {
        const customerData = [
          ['Customer', 'Vessels', 'Percentage', 'Types'],
          ...customerConcentration.map(r => [r.name, r.count, `${r.pct.toFixed(1)}%`, r.types]),
        ]
        const wsCustomers = XLSX.utils.aoa_to_sheet(customerData)
        wsCustomers['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 30 }]
        XLSX.utils.book_append_sheet(wb, wsCustomers, 'Customers')
      }

      // ── Sheet 8: OFAC Status ──
      if (sections.ofacStatus) {
        const ofacData = [
          ['Status', 'Count', 'Percentage'],
          ...ofacStatus.map(r => [
            r.label,
            r.count,
            `${pool.length > 0 ? ((r.count / pool.length) * 100).toFixed(1) : 0}%`,
          ]),
        ]
        const wsOfac = XLSX.utils.aoa_to_sheet(ofacData)
        wsOfac['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 12 }]
        XLSX.utils.book_append_sheet(wb, wsOfac, 'OFAC Status')
      }

      // ── Sheet 9: Vessels (raw data) ──
      if (sections.rawVesselData) {
        const vesselData = [
          ['Name', 'IMO', 'Type', 'Flag', 'Built Year', 'Age', 'Gross Tonnage',
            'Active', 'Customer Type', 'OFAC Status'],
          ...pool.map((v: any) => {
            const fs = flagMap.get(v.flagStateId)
            const age = v.builtYear ? currentYear - v.builtYear : ''
            return [
              v.name || '',
              v.imoNumber || '',
              v.vesselType || '',
              fs?.name ?? '',
              v.builtYear || '',
              age,
              v.grossTonnage ? Number(v.grossTonnage) : '',
              v.isActive ? 'Yes' : 'No',
              v.customerType || '',
              v.ofacStatus || 'NOT_CHECKED',
            ]
          }),
        ]
        const wsVessels = XLSX.utils.aoa_to_sheet(vesselData)
        wsVessels['!cols'] = [
          { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 12 },
          { wch: 6 }, { wch: 14 }, { wch: 8 }, { wch: 14 }, { wch: 16 },
        ]
        XLSX.utils.book_append_sheet(wb, wsVessels, 'Vessels')
      }

      XLSX.writeFile(wb, `Fleet_Analytics_${dateStr}.xlsx`)
      showSuccess('Excel exported successfully')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to export Excel'
      showError(msg)
    }
  }

  // ── Derived analytics ───────────────────────────────────────────────────────
  const pool = vessels

  const flagMap = useMemo(() => new Map(flagStates.map(f => [f.id, f])), [flagStates])
  const entityMap = useMemo(() => new Map(entities.map(e => [e.id, e])), [entities])

  const kpis = useMemo(() => {
    const withAge = pool.filter((v: any) => v.builtYear)
    const avgAge = withAge.length > 0
      ? (withAge.reduce((s: number, v: any) => s + (currentYear - v.builtYear), 0) / withAge.length)
      : null
    const withTonnage = pool.filter((v: any) => v.grossTonnage)
    const avgTonnage = withTonnage.length > 0
      ? Math.round(withTonnage.reduce((s: number, v: any) => s + Number(v.grossTonnage), 0) / withTonnage.length)
      : null
    const totalTonnage = withTonnage.reduce((s: number, v: any) => s + Number(v.grossTonnage), 0)
    const flags = new Set(pool.filter((v: any) => v.flagStateId).map((v: any) => v.flagStateId)).size
    const withPolicy = policyCoverage.length > 0
      ? new Set(policyCoverage.flatMap(() => pool.filter((v: any) => v.id).map((v: any) => v.id)))
      : new Set<string>()
    // Policy coverage % = vessels with at least 1 active policy / total
    const coveredVesselIds = new Set<string>()
    for (const pc of policyCoverage) {
      // We know vesselCount but not which vessels; approximate with ratio
      void pc
    }
    // Better: count vessels that appear in policyCoverage data
    // Since we only have aggregated counts, use the total covered count
    const totalCoveredVessels = policyCoverage.reduce((s, pc) => Math.max(s, Number(pc.vesselCount)), 0)
    const policyCoveragePct = pool.length > 0
      ? Math.round((totalCoveredVessels / pool.length) * 100)
      : 0

    void withPolicy
    void coveredVesselIds

    return {
      total: pool.length,
      avgAge: avgAge != null ? +avgAge.toFixed(1) : null,
      avgTonnage,
      totalTonnage,
      flags,
      policyCoveragePct,
    }
  }, [pool, policyCoverage])

  // ── Vessel Type Breakdown ───────────────────────────────────────────────────
  const vesselTypeBreakdown = useMemo(() => {
    const grouped = groupBy(pool, (v: any) => v.vesselType || '(Unknown)')
    return Array.from(grouped.entries())
      .map(([name, items]) => {
        const withAge = items.filter((v: any) => v.builtYear)
        const avgAge = withAge.length > 0
          ? +(withAge.reduce((s: number, v: any) => s + (currentYear - v.builtYear), 0) / withAge.length).toFixed(1)
          : null
        const withTonnage = items.filter((v: any) => v.grossTonnage)
        const avgTonnage = withTonnage.length > 0
          ? Math.round(withTonnage.reduce((s: number, v: any) => s + Number(v.grossTonnage), 0) / withTonnage.length)
          : null
        return { name, count: items.length, pct: pool.length > 0 ? (items.length / pool.length) * 100 : 0, avgAge, avgTonnage }
      })
      .sort((a, b) => b.count - a.count)
  }, [pool])

  // ── Flag State Distribution ─────────────────────────────────────────────────
  const flagDistribution = useMemo(() => {
    const grouped = groupBy(pool, (v: any) => v.flagStateId || '__none__')
    const items = Array.from(grouped.entries())
      .map(([flagId, vessels]) => {
        const fs = flagMap.get(flagId)
        return {
          name: fs?.name ?? '(Unassigned)',
          iso3: fs?.iso3Code ?? '',
          count: vessels.length,
          pct: pool.length > 0 ? (vessels.length / pool.length) * 100 : 0,
        }
      })
      .sort((a, b) => b.count - a.count)
    if (items.length <= 15) return { rows: items, othersCount: 0 }
    const top15 = items.slice(0, 15)
    const othersCount = items.slice(15).reduce((s, i) => s + i.count, 0)
    return { rows: top15, othersCount }
  }, [pool, flagMap])

  // ── Age Profile ─────────────────────────────────────────────────────────────
  const ageProfile = useMemo(() => {
    return AGE_BUCKETS.map(b => {
      const count = pool.filter((v: any) => {
        if (!v.builtYear) return false
        const age = currentYear - v.builtYear
        return age >= b.min && age < b.max
      }).length
      return { ...b, count, pct: pool.length > 0 ? (count / pool.length) * 100 : 0 }
    })
  }, [pool])

  // ── Tonnage Profile ─────────────────────────────────────────────────────────
  const tonnageProfile = useMemo(() => {
    return TONNAGE_BUCKETS.map(b => {
      const count = pool.filter((v: any) => {
        const gt = Number(v.grossTonnage)
        if (!gt) return false
        return gt >= b.min && gt < b.max
      }).length
      return { ...b, count, pct: pool.length > 0 ? (count / pool.length) * 100 : 0 }
    })
  }, [pool])

  // ── Customer Concentration ──────────────────────────────────────────────────
  const customerConcentration = useMemo(() => {
    const withCustomer = pool.filter((v: any) => v.customerId)
    const grouped = groupBy(withCustomer, (v: any) => v.customerId)
    return Array.from(grouped.entries())
      .map(([customerId, vessels]) => {
        const entity = entityMap.get(customerId)
        const types = [...new Set(vessels.map((v: any) => v.vesselType).filter(Boolean))].join(', ')
        return {
          name: entity?.name ?? '(Unknown)',
          count: vessels.length,
          pct: pool.length > 0 ? (vessels.length / pool.length) * 100 : 0,
          types,
        }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }, [pool, entityMap])

  // ── OFAC Status ─────────────────────────────────────────────────────────────
  const ofacStatus = useMemo(() => {
    const groups = groupBy(pool, (v: any) => v.ofacStatus || 'NOT_CHECKED')
    const order = ['CLEARED', 'PENDING', 'POTENTIAL_MATCH', 'MATCH', 'NOT_CHECKED'] as const
    return order.map(status => ({
      label: status.replace(/_/g, ' '),
      key: status,
      count: groups.get(status)?.length ?? 0,
    }))
  }, [pool])

  // ══════════════════════════════════════════════════════════════════════════════
  // ── Render ─────────────────────────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════════════════════

  const G = {
    blue: 'linear-gradient(135deg, #0ea5e9, #2563eb)',
    purple: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    green: 'linear-gradient(135deg, #10b981, #059669)',
    amber: 'linear-gradient(135deg, #f59e0b, #d97706)',
    pink: 'linear-gradient(135deg, #ec4899, #be185d)',
    teal: 'linear-gradient(135deg, #14b8a6, #0d9488)',
  }

  return (
    <div className="fade-in" style={{ display: 'flex', gap: '20px', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>

      {/* ── Left Sidebar: Filters ─────────────────────────────────── */}
      <aside style={{
        width: '280px',
        flexShrink: 0,
        background: 'var(--bg-card)',
        borderRadius: '14px',
        border: '1px solid var(--table-border)',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        overflowY: 'auto',
      }}>
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          paddingBottom: '16px', borderBottom: '1px solid var(--table-border)',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Filter size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Filters</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Refine your analysis</div>
          </div>
        </div>

        {/* Saved Presets */}
        <FilterSection label="Saved Presets">
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={selectedPresetId}
              onChange={e => handleLoadPreset(e.target.value)}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '0.78rem',
                border: '1px solid var(--input-border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
              }}
            >
              <option value="">Select preset...</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button
              onClick={handleSavePreset}
              title="Save current filters"
              style={{
                background: 'none', border: '1px solid var(--input-border)',
                borderRadius: '6px', padding: '5px 7px', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center',
              }}
            >
              <Save size={14} />
            </button>
          </div>
          {selectedPresetId && (
            <button
              onClick={() => handleDeletePreset(selectedPresetId)}
              style={{
                marginTop: '6px', background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--danger)', fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px',
                padding: 0,
              }}
            >
              <Trash2 size={12} /> Delete preset
            </button>
          )}
        </FilterSection>

        {/* Vessel Status */}
        <FilterSection label="Vessel Status">
          <div style={{ display: 'flex', gap: '6px' }}>
            {(['active', 'inactive', 'all'] as const).map(s => (
              <Chip
                key={s}
                label={s.charAt(0).toUpperCase() + s.slice(1)}
                selected={vesselStatus === s || (s === 'all' && !filters.activeOnly)}
                onClick={() => setVesselStatus(s)}
              />
            ))}
          </div>
        </FilterSection>

        {/* Policy Types */}
        {policyTypes.length > 0 && (
          <CollapsibleFilter label="Policy Types">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {policyTypes.map(pt => (
                <Chip
                  key={pt.id}
                  label={pt.name}
                  selected={filters.policyTypeIds.includes(pt.id)}
                  onClick={() => updateFilter('policyTypeIds',
                    filters.policyTypeIds.includes(pt.id)
                      ? filters.policyTypeIds.filter(x => x !== pt.id)
                      : [...filters.policyTypeIds, pt.id]
                  )}
                />
              ))}
            </div>
          </CollapsibleFilter>
        )}

        {/* Flag States */}
        <CollapsibleFilter label="Flag States">
          <MultiSelectDropdown
            label="flag states"
            options={flagStates.map(f => ({ id: f.id, name: f.name }))}
            selectedIds={filters.flagStateIds}
            onChange={ids => updateFilter('flagStateIds', ids)}
            isLight={isLight}
          />
        </CollapsibleFilter>

        {/* Vessel Types */}
        <CollapsibleFilter label="Vessel Types">
          <MultiSelectDropdown
            label="vessel types"
            options={vesselTypes.map(vt => ({ id: vt.name, name: vt.name }))}
            selectedIds={filters.vesselTypeIds}
            onChange={ids => updateFilter('vesselTypeIds', ids)}
            isLight={isLight}
          />
        </CollapsibleFilter>

        {/* Fleets */}
        <CollapsibleFilter label="Fleets" defaultCollapsed>
          <MultiSelectDropdown
            label="fleets"
            options={fleets.map(f => ({ id: f.id, name: f.name }))}
            selectedIds={filters.fleetIds}
            onChange={ids => updateFilter('fleetIds', ids)}
            isLight={isLight}
          />
        </CollapsibleFilter>

        {/* Customers */}
        <CollapsibleFilter label="Customers" defaultCollapsed>
          <MultiSelectDropdown
            label="customers"
            options={customerEntities.map(e => ({ id: e.id, name: e.name }))}
            selectedIds={filters.customerIds}
            onChange={ids => updateFilter('customerIds', ids)}
            isLight={isLight}
          />
        </CollapsibleFilter>

        {/* Age Range */}
        <FilterSection label="Age Range (years)">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              placeholder="Min"
              value={filters.ageMin ?? ''}
              onChange={e => updateFilter('ageMin', e.target.value ? Number(e.target.value) : undefined)}
              min={0}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '0.78rem',
                border: '1px solid var(--input-border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', width: '100%',
              }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.ageMax ?? ''}
              onChange={e => updateFilter('ageMax', e.target.value ? Number(e.target.value) : undefined)}
              min={0}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '0.78rem',
                border: '1px solid var(--input-border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', width: '100%',
              }}
            />
          </div>
        </FilterSection>

        {/* Tonnage Range */}
        <FilterSection label="Tonnage Range (GT)">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="number"
              placeholder="Min"
              value={filters.tonnageMin ?? ''}
              onChange={e => updateFilter('tonnageMin', e.target.value ? Number(e.target.value) : undefined)}
              min={0}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '0.78rem',
                border: '1px solid var(--input-border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', width: '100%',
              }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>to</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.tonnageMax ?? ''}
              onChange={e => updateFilter('tonnageMax', e.target.value ? Number(e.target.value) : undefined)}
              min={0}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: '6px', fontSize: '0.78rem',
                border: '1px solid var(--input-border)', background: 'var(--bg-primary)',
                color: 'var(--text-primary)', width: '100%',
              }}
            />
          </div>
        </FilterSection>

        {/* Apply button */}
        <button
          onClick={applyFilters}
          disabled={loading}
          className="btn-primary"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', width: '100%', marginTop: '4px',
          }}
        >
          {loading ? <Loader2 size={16} className="spinner" /> : <BarChart3 size={16} />}
          {loading ? 'Loading...' : 'Apply Filters'}
        </button>
      </aside>

      {/* ── Right Panel: Analytics Content ──────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.6rem', margin: 0, fontWeight: 800 }}>Fleet Analytics</h1>
            {hasQueried && (
              <span style={{
                padding: '3px 12px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 700,
                background: 'rgba(0, 210, 255, 0.12)', color: 'var(--accent-primary)',
                border: '1px solid rgba(0, 210, 255, 0.2)',
              }}>
                {pool.length} vessel{pool.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {hasQueried && (
              <button
                onClick={applyFilters}
                className="btn-secondary"
                style={{ padding: '8px 10px' }}
                title="Refresh data"
                disabled={loading}
              >
                {loading ? <Loader2 size={16} className="spinner" /> : <RefreshCw size={16} />}
              </button>
            )}
            {hasQueried && pool.length > 0 && (
              <button
                onClick={() => setExportModalOpen(true)}
                className="btn-secondary"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 14px', fontSize: '0.84rem',
                }}
              >
                <FileDown size={16} /> Export
              </button>
            )}
          </div>
        </div>

        {/* ── Content ── */}
        {!hasQueried ? (
          <div className="glass-card" style={{ padding: '80px 40px', textAlign: 'center' }}>
            <BarChart3 size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.25 }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              No analysis run yet
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Configure filters on the left, then click <strong>Apply Filters</strong> to generate analytics.
            </p>
          </div>
        ) : loading ? (
          <div className="glass-card" style={{ padding: '80px 40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            <Loader2 size={32} className="spinner" style={{ marginBottom: '12px', opacity: 0.5 }} />
            <p style={{ margin: 0 }}>Analyzing fleet data...</p>
          </div>
        ) : pool.length === 0 ? (
          <div className="glass-card" style={{ padding: '80px 40px', textAlign: 'center' }}>
            <Ship size={48} color="var(--text-secondary)" style={{ marginBottom: '16px', opacity: 0.25 }} />
            <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
              No vessels match filters
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
              Try adjusting your filter criteria.
            </p>
          </div>
        ) : (
          <>
            {/* ── Section 1: KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <KPI
                icon={<Ship size={20} color="#fff" />}
                gradient={G.blue}
                label="Vessels"
                value={kpis.total}
                sub={filters.activeOnly ? 'active only' : 'all vessels'}
              />
              <KPI
                icon={<Calendar size={20} color="#fff" />}
                gradient={G.amber}
                label="Avg Age"
                value={kpis.avgAge != null ? `${kpis.avgAge} yr` : '--'}
                sub={kpis.avgAge != null ? `Built ~${currentYear - Math.round(kpis.avgAge)}` : 'No age data'}
              />
              <KPI
                icon={<TrendingUp size={20} color="#fff" />}
                gradient={G.pink}
                label="Avg Tonnage"
                value={kpis.avgTonnage != null ? `${fmt(kpis.avgTonnage)} GT` : '--'}
                sub="gross tonnage"
              />
              <KPI
                icon={<Anchor size={20} color="#fff" />}
                gradient={G.teal}
                label="Total Tonnage"
                value={kpis.totalTonnage > 0 ? `${fmt(Math.round(kpis.totalTonnage))} GT` : '--'}
                sub="fleet total"
              />
              <KPI
                icon={<Globe size={20} color="#fff" />}
                gradient={G.purple}
                label="Flags"
                value={kpis.flags}
                sub={`${kpis.flags} unique flag${kpis.flags !== 1 ? 's' : ''}`}
              />
              <KPI
                icon={<Shield size={20} color="#fff" />}
                gradient={G.green}
                label="Policy Coverage"
                value={`${kpis.policyCoveragePct}%`}
                sub="vessels with active policy"
              />
            </div>

            {/* ── Section 2: Vessel Type Breakdown ── */}
            <ChartCard
              title="Vessel Type Distribution"
              icon={<Ship size={13} />}
              accentColor="#8b5cf6"
              count={vesselTypeBreakdown.length}
            >
              {vesselTypeBreakdown.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No type data</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Type</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                        <th style={{ ...thStyle, minWidth: '120px' }}>%</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Avg Age</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Avg Tonnage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vesselTypeBreakdown.map((row, idx) => (
                        <tr key={row.name}>
                          <td style={{ ...tdStyle(idx), fontWeight: 600 }}>{row.name}</td>
                          <td style={{ ...tdStyle(idx), textAlign: 'right', fontWeight: 700 }}>{row.count}</td>
                          <td style={tdStyle(idx)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <ProgressBar pct={row.pct} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'right' }}>
                                {row.pct.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle(idx), textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {row.avgAge != null ? `${row.avgAge} yr` : '--'}
                          </td>
                          <td style={{ ...tdStyle(idx), textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {row.avgTonnage != null ? fmt(row.avgTonnage) : '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <div style={{ height: '14px' }} />

            {/* ── Section 3: Flag State Distribution ── */}
            <ChartCard
              title="Flag State Distribution"
              icon={<Globe size={13} />}
              accentColor="#0ea5e9"
              count={flagDistribution.rows.length + (flagDistribution.othersCount > 0 ? 1 : 0)}
            >
              {flagDistribution.rows.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No flag data</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Flag</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Count</th>
                        <th style={{ ...thStyle, minWidth: '120px' }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flagDistribution.rows.map((row, idx) => {
                        const flagCls = row.iso3 ? getFlagClass(row.iso3) : ''
                        return (
                          <tr key={row.name}>
                            <td style={tdStyle(idx)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {flagCls ? (
                                  <span className={`fi ${flagCls}`} style={{ width: '20px', height: '14px', borderRadius: '2px', display: 'block', flexShrink: 0 }} />
                                ) : (
                                  <span style={{ display: 'block', width: '20px', height: '14px', borderRadius: '2px', background: 'var(--table-border)', flexShrink: 0 }} />
                                )}
                                <span style={{ fontWeight: 600 }}>{row.name}</span>
                              </div>
                            </td>
                            <td style={{ ...tdStyle(idx), textAlign: 'right', fontWeight: 700 }}>{row.count}</td>
                            <td style={tdStyle(idx)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ProgressBar pct={row.pct} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'right' }}>
                                  {row.pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {flagDistribution.othersCount > 0 && (
                        <tr>
                          <td style={{ ...tdStyle(flagDistribution.rows.length), fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                            Others
                          </td>
                          <td style={{ ...tdStyle(flagDistribution.rows.length), textAlign: 'right', fontWeight: 700 }}>
                            {flagDistribution.othersCount}
                          </td>
                          <td style={tdStyle(flagDistribution.rows.length)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <ProgressBar pct={pool.length > 0 ? (flagDistribution.othersCount / pool.length) * 100 : 0} />
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'right' }}>
                                {pool.length > 0 ? ((flagDistribution.othersCount / pool.length) * 100).toFixed(0) : 0}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <div style={{ height: '14px' }} />

            {/* ── Section 4: Age Profile ── */}
            <ChartCard
              title="Age Distribution"
              icon={<Calendar size={13} />}
              accentColor="#f59e0b"
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {ageProfile.map(b => (
                  <div key={b.label} style={{
                    padding: '12px 16px', borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                    minWidth: '100px', flex: '1 1 100px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: b.color, marginBottom: '4px' }}>
                      {b.count}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      {b.pct.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {b.label}
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <div style={{ height: '14px' }} />

            {/* ── Section 5: Tonnage Profile ── */}
            <ChartCard
              title="Tonnage Distribution"
              icon={<TrendingUp size={13} />}
              accentColor="#14b8a6"
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {tonnageProfile.map(b => (
                  <div key={b.label} style={{
                    padding: '12px 16px', borderRadius: '8px',
                    border: '1px solid var(--glass-border)',
                    background: isLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)',
                    minWidth: '100px', flex: '1 1 100px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: b.color, marginBottom: '4px' }}>
                      {b.count}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      {b.pct.toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      {b.label}
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>

            <div style={{ height: '14px' }} />

            {/* ── Section 6: Policy Coverage Matrix ── */}
            <ChartCard
              title="Policy Coverage"
              icon={<Shield size={13} />}
              accentColor="#10b981"
              count={policyCoverage.length}
            >
              {policyCoverage.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No active policies found</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Policy Type</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Vessels Covered</th>
                        <th style={{ ...thStyle, minWidth: '120px' }}>% of Selection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policyCoverage.map((row, idx) => {
                        const pct = pool.length > 0 ? (Number(row.vesselCount) / pool.length) * 100 : 0
                        return (
                          <tr key={row.name}>
                            <td style={{ ...tdStyle(idx), fontWeight: 600 }}>{row.name}</td>
                            <td style={{ ...tdStyle(idx), textAlign: 'right', fontWeight: 700 }}>{row.vesselCount}</td>
                            <td style={tdStyle(idx)}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <ProgressBar pct={pct} />
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: '36px', textAlign: 'right' }}>
                                  {pct.toFixed(0)}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <div style={{ height: '14px' }} />

            {/* ── Section 7: Customer Concentration ── */}
            <ChartCard
              title="Top Customers"
              icon={<Users size={13} />}
              accentColor="#6366f1"
              count={customerConcentration.length}
            >
              {customerConcentration.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No customer data</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Customer</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>Vessels</th>
                        <th style={{ ...thStyle, textAlign: 'right' }}>%</th>
                        <th style={thStyle}>Types</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerConcentration.map((row, idx) => (
                        <tr key={row.name}>
                          <td style={{ ...tdStyle(idx), fontWeight: 600 }}>{row.name}</td>
                          <td style={{ ...tdStyle(idx), textAlign: 'right', fontWeight: 700 }}>{row.count}</td>
                          <td style={{ ...tdStyle(idx), textAlign: 'right', color: 'var(--text-secondary)' }}>
                            {row.pct.toFixed(0)}%
                          </td>
                          <td style={{ ...tdStyle(idx), color: 'var(--text-secondary)', fontSize: '0.8rem', maxWidth: '200px' }}>
                            {row.types || '--'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <div style={{ height: '14px' }} />

            {/* ── Section 8: OFAC Status ── */}
            <ChartCard
              title="OFAC / Sanctions Status"
              icon={<Shield size={13} />}
              accentColor="#ef4444"
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {ofacStatus.map(s => {
                  const style = OFAC_STYLES[s.key] ?? OFAC_STYLES.PENDING
                  return (
                    <div key={s.key} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 14px', borderRadius: '20px',
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                    }}>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 700, color: style.text,
                        textTransform: 'uppercase', letterSpacing: '0.02em',
                      }}>
                        {s.label}:
                      </span>
                      <span style={{
                        fontSize: '0.95rem', fontWeight: 800, color: style.text,
                      }}>
                        {s.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </ChartCard>
          </>
        )}
      </div>

      {/* ── Export Modal ── */}
      {exportModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) setExportModalOpen(false) }}
        >
          <div style={{
            background: isLight ? '#ffffff' : '#1a1d28',
            borderRadius: '16px', padding: '24px', width: '440px', maxWidth: '90vw',
            boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: '20px',
            }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>Export Analytics</h3>
              <button
                onClick={() => setExportModalOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-secondary)', padding: '4px',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Format selector */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{
                fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
              }}>
                Format
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['pdf', 'excel'] as const).map(fmt => (
                  <label key={fmt} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    cursor: 'pointer', fontSize: '0.88rem',
                    padding: '6px 14px', borderRadius: '8px',
                    border: `1px solid ${exportFormat === fmt ? 'var(--accent-primary)' : 'var(--input-border)'}`,
                    background: exportFormat === fmt
                      ? (isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,170,200,0.12)')
                      : 'transparent',
                  }}>
                    <input
                      type="radio"
                      name="exportFormat"
                      value={fmt}
                      checked={exportFormat === fmt}
                      onChange={() => setExportFormat(fmt)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {fmt === 'pdf' ? 'PDF Report' : 'Excel Spreadsheet'}
                  </label>
                ))}
              </div>
            </div>

            {/* Section checkboxes */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px',
              }}>
                Sections to include
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {([
                  { key: 'kpi' as const, label: 'KPI Summary' },
                  { key: 'vesselTypes' as const, label: 'Vessel Type Distribution' },
                  { key: 'flagStates' as const, label: 'Flag State Distribution' },
                  { key: 'ageDistribution' as const, label: 'Age Distribution' },
                  { key: 'tonnageDistribution' as const, label: 'Tonnage Distribution' },
                  { key: 'policyCoverage' as const, label: 'Policy Coverage' },
                  { key: 'topCustomers' as const, label: 'Top Customers' },
                  { key: 'ofacStatus' as const, label: 'OFAC Status' },
                  { key: 'rawVesselData' as const, label: 'Raw Vessel Data' },
                ]).map(item => {
                  const isExcelOnly = item.key === 'rawVesselData'
                  const disabled = isExcelOnly && exportFormat === 'pdf'
                  return (
                    <label key={item.key} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      cursor: disabled ? 'default' : 'pointer',
                      fontSize: '0.86rem',
                      color: disabled ? 'var(--text-secondary)' : 'var(--text-primary)',
                      opacity: disabled ? 0.5 : 1,
                      padding: '3px 0',
                    }}>
                      <input
                        type="checkbox"
                        checked={disabled ? false : exportSections[item.key]}
                        onChange={() => !disabled && toggleExportSection(item.key)}
                        disabled={disabled}
                        style={{ accentColor: 'var(--accent-primary)' }}
                      />
                      {item.label}
                      {isExcelOnly && (
                        <span style={{
                          fontSize: '0.68rem', color: 'var(--text-secondary)',
                          fontStyle: 'italic',
                        }}>
                          (Excel only)
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn-secondary"
                onClick={() => setExportModalOpen(false)}
                style={{ padding: '8px 18px', fontSize: '0.86rem' }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  if (exportFormat === 'pdf') {
                    exportPDF(exportSections)
                  } else {
                    exportExcel(exportSections)
                  }
                }}
                style={{ padding: '8px 18px', fontSize: '0.86rem' }}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
