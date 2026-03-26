import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Play,
  Save,
  FileSpreadsheet,
  FileText,
  Trash2,
  Share2,
  ChevronDown,
  ChevronRight,
  Layers,
  ArrowUpDown,
  Filter,
  Columns3,
  Database,
  X,
  FolderOpen
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { getReportSettings } from '../services/ReportSettingsService'
import type { SavedReport, ReportConfig } from '../../../shared/types'

// ── Data Source Definitions ─────────────────────────────────────────────────

interface ColumnDef {
  key: string
  label: string
  defaultSelected?: boolean
}

interface FilterDef {
  key: string
  label: string
  type: 'select' | 'text' | 'date'
  options?: { value: string; label: string }[]
  loadOptions?: () => Promise<{ value: string; label: string }[]>
  placeholder?: string
}

interface GroupByDef {
  key: string
  label: string
}

interface DataSourceDef {
  label: string
  columns: ColumnDef[]
  filters: FilterDef[]
  groupBy: GroupByDef[]
  defaultSort?: string
}

const DATA_SOURCES: Record<string, DataSourceDef> = {
  vessels: {
    label: 'Vessels',
    columns: [
      { key: 'name', label: 'Vessel Name', defaultSelected: true },
      { key: 'imoNumber', label: 'IMO Number', defaultSelected: true },
      { key: 'vesselType', label: 'Vessel Type', defaultSelected: true },
      { key: 'flagState', label: 'Flag State', defaultSelected: true },
      { key: 'builtYear', label: 'Built Year' },
      { key: 'rebuiltYear', label: 'Rebuilt Year' },
      { key: 'grossTonnage', label: 'Gross Tonnage' },
      { key: 'classification', label: 'Classification' },
      { key: 'customer', label: 'Customer', defaultSelected: true },
      { key: 'fleet', label: 'Fleet', defaultSelected: true },
      { key: 'isActive', label: 'Status', defaultSelected: true },
      { key: 'callSign', label: 'Call Sign' },
      { key: 'customerType', label: 'Customer Type' },
      { key: 'createdAt', label: 'Created Date' }
    ],
    filters: [
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' }
        ]
      },
      { key: 'fleetId', label: 'Fleet', type: 'select', loadOptions: loadFleetOptions },
      {
        key: 'flagStateId',
        label: 'Flag State',
        type: 'select',
        loadOptions: loadFlagStateOptions
      },
      { key: 'customerId', label: 'Customer', type: 'select', loadOptions: loadEntityOptions },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Vessel name, IMO...' }
    ],
    groupBy: [
      { key: 'customer', label: 'Customer' },
      { key: 'fleet', label: 'Fleet' },
      { key: 'vesselType', label: 'Vessel Type' },
      { key: 'flagState', label: 'Flag State' }
    ],
    defaultSort: 'name'
  },
  policies: {
    label: 'Policies',
    columns: [
      { key: 'vesselName', label: 'Vessel', defaultSelected: true },
      { key: 'imoNumber', label: 'IMO Number', defaultSelected: true },
      { key: 'policyType', label: 'Policy Type', defaultSelected: true },
      { key: 'policyNumber', label: 'Policy Number', defaultSelected: true },
      { key: 'status', label: 'Status', defaultSelected: true },
      { key: 'currency', label: 'Currency' },
      { key: 'customerName', label: 'Customer', defaultSelected: true },
      { key: 'fleetName', label: 'Fleet' },
      { key: 'brokerName', label: 'Broker' },
      { key: 'inceptionDate', label: 'Inception Date' },
      { key: 'expiryDate', label: 'Expiry Date' },
      { key: 'premium', label: 'Premium', defaultSelected: true },
      { key: 'createdAt', label: 'Created Date' }
    ],
    filters: [
      {
        key: 'policyTypeId',
        label: 'Policy Type',
        type: 'select',
        loadOptions: loadPolicyTypeOptions
      },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' }
        ]
      },
      {
        key: 'vesselActive',
        label: 'Vessel Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active Vessels' },
          { value: 'inactive', label: 'Inactive Vessels' }
        ]
      },
      { key: 'dateFrom', label: 'Inception From', type: 'date' },
      { key: 'dateTo', label: 'Expiry To', type: 'date' },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Vessel, policy #, customer...' }
    ],
    groupBy: [
      { key: 'policyType', label: 'Policy Type' },
      { key: 'customer', label: 'Customer' },
      { key: 'fleet', label: 'Fleet' },
      { key: 'status', label: 'Status' }
    ],
    defaultSort: 'vesselName'
  },
  entities: {
    label: 'Entities',
    columns: [
      { key: 'name', label: 'Name', defaultSelected: true },
      { key: 'type', label: 'Type', defaultSelected: true },
      { key: 'email', label: 'Email', defaultSelected: true },
      { key: 'phone', label: 'Phone', defaultSelected: true },
      { key: 'identifier', label: 'Identifier' },
      { key: 'vesselCount', label: 'Vessels', defaultSelected: true },
      { key: 'createdAt', label: 'Created Date' }
    ],
    filters: [
      {
        key: 'type',
        label: 'Type',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'company', label: 'Company' },
          { value: 'person', label: 'Person' }
        ]
      },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Name, email, identifier...' }
    ],
    groupBy: [{ key: 'type', label: 'Type' }],
    defaultSort: 'name'
  },
  renewals: {
    label: 'Renewals',
    columns: [
      { key: 'vesselName', label: 'Vessel', defaultSelected: true },
      { key: 'imoNumber', label: 'IMO Number', defaultSelected: true },
      { key: 'policyType', label: 'Policy Type', defaultSelected: true },
      { key: 'policyNumber', label: 'Policy Number', defaultSelected: true },
      { key: 'endDate', label: 'End Date', defaultSelected: true },
      { key: 'customerName', label: 'Customer', defaultSelected: true },
      { key: 'fleetName', label: 'Fleet' },
      { key: 'renewalStatus', label: 'Renewal Status', defaultSelected: true },
      { key: 'daysUntilExpiry', label: 'Days Until Expiry', defaultSelected: true }
    ],
    filters: [
      {
        key: 'policyTypeId',
        label: 'Policy Type',
        type: 'select',
        loadOptions: loadPolicyTypeOptions
      },
      {
        key: 'status',
        label: 'Policy Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' }
        ]
      },
      { key: 'dateFrom', label: 'End Date From', type: 'date' },
      { key: 'dateTo', label: 'End Date To', type: 'date' },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Vessel, policy #, customer...' }
    ],
    groupBy: [
      { key: 'policyType', label: 'Policy Type' },
      { key: 'customer', label: 'Customer' },
      { key: 'fleet', label: 'Fleet' },
      { key: 'renewalStatus', label: 'Renewal Status' }
    ],
    defaultSort: 'endDate'
  },
  quotations: {
    label: 'Quotations',
    columns: [
      { key: 'referenceNumber', label: 'Reference', defaultSelected: true },
      { key: 'typeName', label: 'Type', defaultSelected: true },
      { key: 'status', label: 'Status', defaultSelected: true },
      { key: 'vesselNames', label: 'Vessels', defaultSelected: true },
      { key: 'premiumAmount', label: 'Premium', defaultSelected: true },
      { key: 'premiumCurrency', label: 'Currency' },
      { key: 'quotationDate', label: 'Date', defaultSelected: true },
      { key: 'createdAt', label: 'Created', defaultSelected: true },
      { key: 'createdBy', label: 'Created By' }
    ],
    filters: [
      { key: 'typeId', label: 'Type', type: 'select', loadOptions: loadQuotationTypeOptions },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'draft', label: 'Draft' },
          { value: 'approved', label: 'Approved' },
          { value: 'sent', label: 'Sent' }
        ]
      },
      { key: 'dateFrom', label: 'Date From', type: 'date' },
      { key: 'dateTo', label: 'Date To', type: 'date' },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Name, email, identifier...' }
    ],
    groupBy: [
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' }
    ],
    defaultSort: 'createdAt'
  },
  policyDocuments: {
    label: 'Policy Documents',
    columns: [
      { key: 'policyNumber', label: 'Policy Number', defaultSelected: true },
      { key: 'typeName', label: 'Type', defaultSelected: true },
      { key: 'vesselName', label: 'Vessel', defaultSelected: true },
      { key: 'customerName', label: 'Customer', defaultSelected: true },
      { key: 'inceptionDate', label: 'Inception Date', defaultSelected: true },
      { key: 'expiryDate', label: 'Expiry Date', defaultSelected: true },
      { key: 'premiumAmount', label: 'Premium' },
      { key: 'commissionPercent', label: 'Commission %' },
      { key: 'bankName', label: 'Bank' },
      { key: 'status', label: 'Status', defaultSelected: true },
      { key: 'revisionNumber', label: 'Revision' },
      { key: 'exchangeRate', label: 'Exchange Rate' },
      { key: 'createdAt', label: 'Created' },
      { key: 'exportedAt', label: 'Exported At' },
      { key: 'daysUntilExpiry', label: 'Days Until Expiry' }
    ],
    filters: [
      { key: 'typeCode', label: 'Type', type: 'select', loadOptions: loadQuotationTypeOptions },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active' },
          { value: 'superseded', label: 'Superseded' },
          { value: 'cancelled', label: 'Cancelled' }
        ]
      },
      { key: 'dateFrom', label: 'Inception From', type: 'date' },
      { key: 'dateTo', label: 'Inception To', type: 'date' },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Policy #, vessel, customer...' }
    ],
    groupBy: [
      { key: 'typeName', label: 'Type' },
      { key: 'customerName', label: 'Customer' },
      { key: 'status', label: 'Status' },
      { key: 'bankName', label: 'Bank' }
    ],
    defaultSort: 'createdAt'
  },
  documents: {
    label: 'Documents',
    columns: [
      { key: 'vesselName', label: 'Vessel', defaultSelected: true },
      { key: 'docTypeName', label: 'Document Type', defaultSelected: true },
      { key: 'requirement', label: 'Requirement', defaultSelected: true },
      { key: 'fileStatus', label: 'File Status', defaultSelected: true },
      { key: 'receivedDate', label: 'Received Date' },
      { key: 'expiryDate', label: 'Expiry Date' },
      { key: 'daysUntilExpiry', label: 'Days Until Expiry' }
    ],
    filters: [
      {
        key: 'status',
        label: 'File Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'linked', label: 'Linked' },
          { value: 'missing', label: 'Missing' },
          { value: 'expired', label: 'Expired' }
        ]
      },
      {
        key: 'vesselActive',
        label: 'Vessel Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'active', label: 'Active Vessels' },
          { value: 'inactive', label: 'Inactive Vessels' }
        ]
      },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Vessel, document type...' }
    ],
    groupBy: [
      { key: 'vesselName', label: 'Vessel' },
      { key: 'docTypeName', label: 'Document Type' },
      { key: 'fileStatus', label: 'File Status' }
    ],
    defaultSort: 'vesselName'
  },
  surveys: {
    label: 'Surveys',
    columns: [
      { key: 'vesselName', label: 'Vessel', defaultSelected: true },
      { key: 'surveyorName', label: 'Surveyor', defaultSelected: true },
      { key: 'surveyType', label: 'Survey Type', defaultSelected: true },
      { key: 'surveyDate', label: 'Survey Date', defaultSelected: true },
      { key: 'location', label: 'Location', defaultSelected: true },
      { key: 'defectCount', label: 'Defects' },
      { key: 'openDefects', label: 'Open Defects' },
      { key: 'status', label: 'Status', defaultSelected: true }
    ],
    filters: [
      { key: 'dateFrom', label: 'Date From', type: 'date' },
      { key: 'dateTo', label: 'Date To', type: 'date' },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Vessel, surveyor, location...' }
    ],
    groupBy: [
      { key: 'vesselName', label: 'Vessel' },
      { key: 'surveyorName', label: 'Surveyor' },
      { key: 'surveyType', label: 'Survey Type' },
      { key: 'status', label: 'Status' }
    ],
    defaultSort: 'surveyDate'
  },
  warranties: {
    label: 'Warranties',
    columns: [
      { key: 'vesselName', label: 'Vessel', defaultSelected: true },
      { key: 'description', label: 'Description', defaultSelected: true },
      { key: 'deadlineType', label: 'Deadline Type', defaultSelected: true },
      { key: 'inceptionDate', label: 'Inception Date', defaultSelected: true },
      { key: 'status', label: 'Status', defaultSelected: true },
      { key: 'policyTypeName', label: 'Policy Type' },
      { key: 'createdAt', label: 'Created' }
    ],
    filters: [
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: [
          { value: 'all', label: 'All' },
          { value: 'pending', label: 'Pending' },
          { value: 'survey_done', label: 'Survey Done' },
          { value: 'completed', label: 'Completed' },
          { value: 'waived', label: 'Waived' }
        ]
      },
      { key: 'search', label: 'Search', type: 'text', placeholder: 'Vessel, description...' }
    ],
    groupBy: [
      { key: 'vesselName', label: 'Vessel' },
      { key: 'status', label: 'Status' },
      { key: 'policyTypeName', label: 'Policy Type' }
    ],
    defaultSort: 'createdAt'
  }
}

// ── Dynamic Filter Option Loaders ─────────────────────────────────────────

async function loadFleetOptions(): Promise<{ value: string; label: string }[]> {
  const fleets = await window.api.getFleets()
  return [
    { value: 'all', label: 'All' },
    ...fleets.map((f: any) => ({ value: f.id, label: f.name }))
  ]
}

async function loadFlagStateOptions(): Promise<{ value: string; label: string }[]> {
  const flags = await window.api.getFlagStates()
  return [
    { value: 'all', label: 'All' },
    ...flags.map((f: any) => ({ value: f.id, label: f.name }))
  ]
}

async function loadEntityOptions(): Promise<{ value: string; label: string }[]> {
  const entities = await window.api.getEntities()
  return [
    { value: 'all', label: 'All' },
    ...entities.map((e: any) => ({ value: e.id, label: e.name }))
  ]
}

async function loadPolicyTypeOptions(): Promise<{ value: string; label: string }[]> {
  const types = await window.api.getPolicyTypes()
  return [
    { value: 'all', label: 'All' },
    ...types.map((t: any) => ({ value: t.id, label: t.name }))
  ]
}

async function loadQuotationTypeOptions(): Promise<{ value: string; label: string }[]> {
  const types = await window.api.getQuotationTypes()
  return [
    { value: 'all', label: 'All' },
    ...types.map((t: any) => ({ value: t.id, label: t.name }))
  ]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DATE_FIELDS = new Set([
  'createdAt', 'quotationDate', 'endDate', 'inceptionDate', 'expiryDate',
  'receivedDate', 'exportedAt', 'surveyDate', 'deadlineDate'
])

const NUMBER_FIELDS = new Set([
  'premiumAmount', 'grossTonnage', 'premium', 'exchangeRate',
  'defectCount', 'openDefects', 'revisionNumber'
])

function formatCellValue(value: any, colKey: string): string {
  if (value === null || value === undefined) return ''
  if (colKey === 'isActive') return value ? 'Active' : 'Inactive'
  if (DATE_FIELDS.has(colKey)) {
    const d = new Date(value)
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0')
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const year = d.getFullYear()
      return `${day}/${month}/${year}`
    }
  }
  if (colKey === 'commissionPercent') {
    const n = Number(value)
    if (!isNaN(n)) return n.toFixed(2) + '%'
  }
  if (NUMBER_FIELDS.has(colKey)) {
    const n = Number(value)
    if (!isNaN(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return String(value)
}

// Chart metric definitions per data source
const CHART_METRICS: Record<string, { value: string; label: string; field?: string }[]> = {
  vessels: [{ value: 'count', label: 'Count' }],
  policies: [
    { value: 'count', label: 'Count' },
    { value: 'sumPremium', label: 'Sum of Premium', field: 'premium' },
    { value: 'avgPremium', label: 'Avg Premium', field: 'premium' }
  ],
  entities: [{ value: 'count', label: 'Count' }],
  renewals: [{ value: 'count', label: 'Count' }],
  quotations: [
    { value: 'count', label: 'Count' },
    { value: 'sumPremium', label: 'Sum of Premium', field: 'premiumAmount' },
    { value: 'avgPremium', label: 'Avg Premium', field: 'premiumAmount' }
  ],
  policyDocuments: [
    { value: 'count', label: 'Count' },
    { value: 'sumPremium', label: 'Sum of Premium', field: 'premiumAmount' },
    { value: 'avgPremium', label: 'Avg Premium', field: 'premiumAmount' }
  ],
  documents: [{ value: 'count', label: 'Count' }],
  surveys: [
    { value: 'count', label: 'Count' },
    { value: 'sumDefects', label: 'Total Defects', field: 'defectCount' }
  ],
  warranties: [{ value: 'count', label: 'Count' }]
}

// ── Component ─────────────────────────────────────────────────────────────

export default function ReportBuilder() {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const { showError, showSuccess } = useToast()

  // State
  const [dataSource, setDataSource] = useState<string>('vessels')
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set())
  const [filters, setFilters] = useState<Record<string, any>>({})
  const [groupBy, setGroupBy] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  // Saved reports
  const [savedReports, setSavedReports] = useState<SavedReport[]>([])
  const [savedDropdownOpen, setSavedDropdownOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveShared, setSaveShared] = useState(false)
  const [editingReportId, setEditingReportId] = useState<string | null>(null)

  // Dynamic filter options
  const [dynamicOptions, setDynamicOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({})

  // Chart view
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table')
  const [chartMetric, setChartMetric] = useState<'count' | 'sumPremium' | 'avgPremium' | 'sumDefects'>('count')

  // Collapsible sections
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())

  const sourceDef = DATA_SOURCES[dataSource]

  // Initialize columns when data source changes
  useEffect(() => {
    const def = DATA_SOURCES[dataSource]
    if (!def) return
    const defaults = new Set(def.columns.filter((c) => c.defaultSelected).map((c) => c.key))
    setSelectedColumns(defaults)
    setFilters({})
    setGroupBy(null)
    setSortBy(def.defaultSort || null)
    setSortDir('asc')
    setResults([])
    setHasRun(false)
    setDynamicOptions({})
  }, [dataSource])

  // Load dynamic filter options
  useEffect(() => {
    const def = DATA_SOURCES[dataSource]
    if (!def) return
    def.filters.forEach(async (f) => {
      if (f.loadOptions) {
        try {
          const opts = await f.loadOptions()
          setDynamicOptions((prev) => ({ ...prev, [f.key]: opts }))
        } catch {
          // silently ignore
        }
      }
    })
  }, [dataSource])

  // Load saved reports
  const loadSavedReports = useCallback(async () => {
    try {
      const reports = await window.api.reportBuilderGetSaved()
      if (Array.isArray(reports)) setSavedReports(reports)
    } catch {
      // silently ignore
    }
  }, [])

  useEffect(() => {
    loadSavedReports()
  }, [loadSavedReports])

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  const toggleColumn = (key: string) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const selectAllColumns = () => {
    setSelectedColumns(new Set(sourceDef.columns.map((c) => c.key)))
  }

  const deselectAllColumns = () => {
    setSelectedColumns(new Set())
  }

  const updateFilter = (key: string, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  // Run report
  const runReport = async () => {
    if (selectedColumns.size === 0) {
      showError('Please select at least one column')
      return
    }
    setLoading(true)
    try {
      const config: ReportConfig = {
        columns: Array.from(selectedColumns),
        filters,
        groupBy,
        sortBy,
        sortDir
      }
      const data = await window.api.reportBuilderRun(dataSource, config)
      if (Array.isArray(data)) {
        setResults(data)
      } else if (data && (data as any).error) {
        showError((data as any).message || 'Failed to run report')
        setResults([])
      } else {
        setResults([])
      }
      setHasRun(true)
    } catch (err: any) {
      showError(err?.message || 'Failed to run report')
    } finally {
      setLoading(false)
    }
  }

  // Grouped results
  const groupedResults = useMemo(() => {
    if (!groupBy || !results.length) return null
    const groups: Record<string, any[]> = {}
    for (const row of results) {
      const key = row[groupBy] ?? '(None)'
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }
    return groups
  }, [results, groupBy])

  // Chart data
  const chartData = useMemo(() => {
    if (!groupBy || !results.length) return []
    const groups: Record<string, any[]> = {}
    for (const row of results) {
      const key = String(row[groupBy] ?? '(None)')
      if (!groups[key]) groups[key] = []
      groups[key].push(row)
    }

    const metricDef = (CHART_METRICS[dataSource] || []).find((m) => m.value === chartMetric)
    const field = metricDef?.field

    const items = Object.entries(groups).map(([label, rows]) => {
      let value = rows.length
      if (chartMetric === 'sumPremium' || chartMetric === 'sumDefects') {
        value = rows.reduce((sum, r) => sum + (Number(r[field!]) || 0), 0)
      } else if (chartMetric === 'avgPremium') {
        const total = rows.reduce((sum, r) => sum + (Number(r[field!]) || 0), 0)
        value = rows.length > 0 ? total / rows.length : 0
      }
      return { label, value }
    })

    items.sort((a, b) => b.value - a.value)
    const maxVal = Math.max(...items.map((i) => i.value), 1)
    return items.map((i) => ({ ...i, percent: (i.value / maxVal) * 100 }))
  }, [results, groupBy, chartMetric, dataSource])

  // Save report
  const handleSave = async () => {
    if (!saveName.trim()) {
      showError('Please enter a report name')
      return
    }
    try {
      const config: ReportConfig = {
        columns: Array.from(selectedColumns),
        filters,
        groupBy,
        sortBy,
        sortDir
      }
      await window.api.reportBuilderSave({
        id: editingReportId || undefined,
        name: saveName.trim(),
        description: saveDescription.trim() || null,
        dataSource,
        config,
        isShared: saveShared
      })
      showSuccess(editingReportId ? 'Report updated' : 'Report saved')
      setSaveModalOpen(false)
      setSaveName('')
      setSaveDescription('')
      setSaveShared(false)
      setEditingReportId(null)
      loadSavedReports()
    } catch (err: any) {
      showError(err?.message || 'Failed to save report')
    }
  }

  // Load saved report
  const loadReport = (report: SavedReport) => {
    setDataSource(report.dataSource)
    // Need to defer setting columns/filters so the data source change effect runs first
    setTimeout(() => {
      if (report.config.columns) setSelectedColumns(new Set(report.config.columns))
      if (report.config.filters) setFilters(report.config.filters)
      setGroupBy(report.config.groupBy || null)
      setSortBy(report.config.sortBy || null)
      setSortDir(report.config.sortDir || 'asc')
      setEditingReportId(report.id)
      setSaveName(report.name)
      setSaveDescription(report.description || '')
      setSaveShared(report.isShared)
    }, 50)
    setSavedDropdownOpen(false)
  }

  // Delete saved report
  const deleteReport = async (id: string) => {
    try {
      await window.api.reportBuilderDelete(id)
      showSuccess('Report deleted')
      loadSavedReports()
      if (editingReportId === id) setEditingReportId(null)
    } catch (err: any) {
      showError(err?.message || 'Failed to delete report')
    }
  }

  // Export Excel
  const exportExcel = async () => {
    if (!results.length) return
    try {
      const XLSX = await import('xlsx')
      const cols = Array.from(selectedColumns)
      const headers = cols.map((c) => sourceDef.columns.find((d) => d.key === c)?.label || c)
      const data = results.map((row) => cols.map((c) => formatCellValue(row[c], c)))
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data])

      // Auto-width
      const colWidths = headers.map((h, i) => {
        let max = h.length
        for (const row of data) {
          if (row[i] && row[i].length > max) max = row[i].length
        }
        return { wch: Math.min(max + 2, 50) }
      })
      ws['!cols'] = colWidths

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, sourceDef.label)
      XLSX.writeFile(wb, `${sourceDef.label}_Report_${new Date().toISOString().split('T')[0]}.xlsx`)
      showSuccess('Excel exported')
    } catch (err: any) {
      showError(err?.message || 'Failed to export Excel')
    }
  }

  // Export PDF
  const exportPdf = async () => {
    if (!results.length) return
    try {
      const { default: jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')
      const settings = await getReportSettings()

      const doc = new jsPDF({ orientation: 'landscape' })
      const cols = Array.from(selectedColumns)
      const headers = cols.map((c) => sourceDef.columns.find((d) => d.key === c)?.label || c)
      const body = results.map((row) => cols.map((c) => formatCellValue(row[c], c)))

      // Header
      const primary = settings.primaryColor || [28, 52, 95]
      doc.setFillColor(primary[0], primary[1], primary[2])
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 18, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(settings.companyName || 'Report', 14, 12)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`${sourceDef.label} Report`, doc.internal.pageSize.getWidth() - 14, 12, {
        align: 'right'
      })

      // Date + row count
      doc.setTextColor(100, 100, 100)
      doc.setFontSize(8)
      doc.text(`Generated: ${new Date().toLocaleDateString()} | Rows: ${results.length}`, 14, 24)

      autoTable(doc, {
        head: [headers],
        body,
        startY: 28,
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: {
          fillColor: primary,
          textColor: [255, 255, 255],
          fontStyle: 'bold'
        },
        alternateRowStyles: { fillColor: [245, 247, 250] },
        margin: { left: 14, right: 14 }
      })

      // Footer
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        const pageH = doc.internal.pageSize.getHeight()
        const pageW = doc.internal.pageSize.getWidth()
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(settings.footerText || '', 14, pageH - 8)
        doc.text(`Page ${i} of ${pageCount}`, pageW - 14, pageH - 8, { align: 'right' })
      }

      doc.save(`${sourceDef.label}_Report_${new Date().toISOString().split('T')[0]}.pdf`)
      showSuccess('PDF exported')
    } catch (err: any) {
      showError(err?.message || 'Failed to export PDF')
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: 'var(--glass-border)',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '12px'
  }

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: '600',
    color: 'var(--text-primary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '8px',
    userSelect: 'none'
  }

  const checkboxLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '0.82rem',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    padding: '3px 0'
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '8px',
    border: '1px solid var(--input-border)',
    background: 'var(--input-bg)',
    color: 'var(--text-primary)',
    fontSize: '0.82rem',
    outline: 'none'
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none' as const
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
          flexWrap: 'wrap',
          gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Database size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '700', margin: 0 }}>Report Builder</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              Build custom reports with flexible data sources, columns, and filters
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          {/* Saved Reports Dropdown */}
          <button
            className="btn-secondary"
            onClick={() => setSavedDropdownOpen(!savedDropdownOpen)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              padding: '8px 14px'
            }}
          >
            <FolderOpen size={14} />
            Saved Reports
            <ChevronDown size={14} />
          </button>
          {savedDropdownOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 99 }}
                onClick={() => setSavedDropdownOpen(false)}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  minWidth: '280px',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  background: isLight ? '#ffffff' : '#1a1d28',
                  border: 'var(--glass-border)',
                  borderRadius: '10px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                  zIndex: 100,
                  padding: '4px'
                }}
              >
                {savedReports.length === 0 && (
                  <div
                    style={{
                      padding: '16px',
                      textAlign: 'center',
                      color: 'var(--text-secondary)',
                      fontSize: '0.82rem'
                    }}
                  >
                    No saved reports yet
                  </div>
                )}
                {savedReports.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'background 0.15s'
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'var(--bg-card-hover)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => loadReport(r)}>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {r.name}
                        {r.isShared && (
                          <Share2 size={11} style={{ marginLeft: '6px', opacity: 0.5 }} />
                        )}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                        {DATA_SOURCES[r.dataSource]?.label || r.dataSource}
                        {r.description ? ` — ${r.description}` : ''}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteReport(r.id)
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--danger)',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '4px',
                        display: 'flex'
                      }}
                      title="Delete report"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button
            className="btn-secondary"
            onClick={() => {
              setEditingReportId(null)
              setSaveName('')
              setSaveDescription('')
              setSaveShared(false)
              setSaveModalOpen(true)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.82rem',
              padding: '8px 14px'
            }}
          >
            <Save size={14} />
            Save Report
          </button>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
        {/* Config Panel */}
        <div
          style={{
            width: '280px',
            flexShrink: 0,
            overflowY: 'auto',
            maxHeight: 'calc(100vh - 220px)',
            paddingRight: '4px'
          }}
        >
          {/* Data Source */}
          <div style={cardStyle}>
            <div style={{ ...sectionHeaderStyle, marginBottom: '10px' }}>
              <Database size={14} style={{ color: 'var(--accent-primary)' }} />
              Data Source
            </div>
            <select
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              style={selectStyle}
            >
              {Object.entries(DATA_SOURCES).map(([key, def]) => (
                <option key={key} value={key}>
                  {def.label}
                </option>
              ))}
            </select>
          </div>

          {/* Columns */}
          <div style={cardStyle}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection('columns')}>
              {collapsedSections.has('columns') ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              <Columns3 size={14} style={{ color: 'var(--accent-primary)' }} />
              Columns
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: '0.7rem',
                  padding: '1px 8px',
                  borderRadius: '10px',
                  background: 'rgba(0,210,255,0.1)',
                  color: 'var(--accent-primary)',
                  fontWeight: '600'
                }}
              >
                {selectedColumns.size}/{sourceDef.columns.length}
              </span>
            </div>
            {!collapsedSections.has('columns') && (
              <>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <button
                    onClick={selectAllColumns}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: 'transparent',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer'
                    }}
                  >
                    All
                  </button>
                  <button
                    onClick={deselectAllColumns}
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    None
                  </button>
                </div>
                {sourceDef.columns.map((col) => (
                  <label key={col.key} style={checkboxLabelStyle}>
                    <input
                      type="checkbox"
                      checked={selectedColumns.has(col.key)}
                      onChange={() => toggleColumn(col.key)}
                      style={{ accentColor: 'var(--accent-primary)' }}
                    />
                    {col.label}
                  </label>
                ))}
              </>
            )}
          </div>

          {/* Filters */}
          <div style={cardStyle}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection('filters')}>
              {collapsedSections.has('filters') ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              <Filter size={14} style={{ color: 'var(--accent-primary)' }} />
              Filters
            </div>
            {!collapsedSections.has('filters') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sourceDef.filters.map((f) => (
                  <div key={f.key}>
                    <label
                      style={{
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)',
                        marginBottom: '3px',
                        display: 'block'
                      }}
                    >
                      {f.label}
                    </label>
                    {f.type === 'select' && (
                      <select
                        value={filters[f.key] || 'all'}
                        onChange={(e) => updateFilter(f.key, e.target.value)}
                        style={selectStyle}
                      >
                        {(f.options || dynamicOptions[f.key] || []).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {f.type === 'text' && (
                      <input
                        type="text"
                        value={filters[f.key] || ''}
                        onChange={(e) => updateFilter(f.key, e.target.value)}
                        placeholder={f.placeholder || 'Search...'}
                        style={inputStyle}
                      />
                    )}
                    {f.type === 'date' && (
                      <input
                        type="date"
                        value={filters[f.key] || ''}
                        onChange={(e) => updateFilter(f.key, e.target.value)}
                        style={inputStyle}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Group By */}
          <div style={cardStyle}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection('grouping')}>
              {collapsedSections.has('grouping') ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              <Layers size={14} style={{ color: 'var(--accent-primary)' }} />
              Group By
            </div>
            {!collapsedSections.has('grouping') && (
              <select
                value={groupBy || ''}
                onChange={(e) => setGroupBy(e.target.value || null)}
                style={selectStyle}
              >
                <option value="">No grouping</option>
                {sourceDef.groupBy.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Sort */}
          <div style={cardStyle}>
            <div style={sectionHeaderStyle} onClick={() => toggleSection('sort')}>
              {collapsedSections.has('sort') ? (
                <ChevronRight size={14} />
              ) : (
                <ChevronDown size={14} />
              )}
              <ArrowUpDown size={14} style={{ color: 'var(--accent-primary)' }} />
              Sort
            </div>
            {!collapsedSections.has('sort') && (
              <div style={{ display: 'flex', gap: '6px' }}>
                <select
                  value={sortBy || ''}
                  onChange={(e) => setSortBy(e.target.value || null)}
                  style={{ ...selectStyle, flex: 1 }}
                >
                  <option value="">Default</option>
                  {sourceDef.columns
                    .filter((c) => selectedColumns.has(c.key))
                    .map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                </select>
                <button
                  className="btn-secondary"
                  onClick={() => setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  style={{ padding: '6px 10px', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                >
                  {sortDir === 'asc' ? 'A-Z' : 'Z-A'}
                </button>
              </div>
            )}
          </div>

          {/* Run Button */}
          <button
            className="btn-primary"
            onClick={runReport}
            disabled={loading || selectedColumns.size === 0}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              fontSize: '0.9rem',
              opacity: loading || selectedColumns.size === 0 ? 0.6 : 1
            }}
          >
            <Play size={16} />
            {loading ? 'Running...' : 'Run Report'}
          </button>
        </div>

        {/* Results Panel */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-card)',
            border: 'var(--glass-border)',
            borderRadius: '12px',
            overflow: 'hidden'
          }}
        >
          {/* Results Header */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--table-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>Results</span>
              {hasRun && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 10px',
                    borderRadius: '10px',
                    background: 'rgba(0,210,255,0.1)',
                    color: 'var(--accent-primary)',
                    fontWeight: '600'
                  }}
                >
                  {results.length} rows
                </span>
              )}
              {groupBy && hasRun && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 10px',
                    borderRadius: '10px',
                    background: 'rgba(99,102,241,0.1)',
                    color: isLight ? '#4f46e5' : '#818cf8',
                    fontWeight: '600'
                  }}
                >
                  Grouped by: {sourceDef.groupBy.find((g) => g.key === groupBy)?.label || groupBy}
                </span>
              )}
            </div>
            {hasRun && results.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                {/* View mode toggle */}
                <div
                  style={{
                    display: 'flex',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    overflow: 'hidden'
                  }}
                >
                  <button
                    onClick={() => setViewMode('table')}
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      border: 'none',
                      cursor: 'pointer',
                      background:
                        viewMode === 'table' ? 'var(--accent-primary)' : 'transparent',
                      color: viewMode === 'table' ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    Table
                  </button>
                  <button
                    onClick={() => setViewMode('chart')}
                    style={{
                      padding: '5px 10px',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      border: 'none',
                      borderLeft: '1px solid var(--input-border)',
                      cursor: 'pointer',
                      background:
                        viewMode === 'chart' ? 'var(--accent-primary)' : 'transparent',
                      color: viewMode === 'chart' ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    Chart
                  </button>
                </div>

                {/* Chart metric selector */}
                {viewMode === 'chart' && groupBy && (
                  <select
                    value={chartMetric}
                    onChange={(e) => setChartMetric(e.target.value as any)}
                    style={{
                      ...selectStyle,
                      width: 'auto',
                      padding: '5px 8px',
                      fontSize: '0.75rem'
                    }}
                  >
                    {(CHART_METRICS[dataSource] || [{ value: 'count', label: 'Count' }]).map(
                      (m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      )
                    )}
                  </select>
                )}

                <button
                  className="btn-secondary"
                  onClick={exportExcel}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.78rem',
                    padding: '6px 12px'
                  }}
                >
                  <FileSpreadsheet size={13} />
                  Excel
                </button>
                <button
                  className="btn-secondary"
                  onClick={exportPdf}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.78rem',
                    padding: '6px 12px'
                  }}
                >
                  <FileText size={13} />
                  PDF
                </button>
              </div>
            )}
          </div>

          {/* Table Container */}
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
            {!hasRun && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 20px',
                  color: 'var(--text-secondary)'
                }}
              >
                <Database size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: '500', marginBottom: '4px' }}>
                  No report generated yet
                </p>
                <p style={{ fontSize: '0.8rem' }}>
                  Configure your data source, columns, and filters, then click Run Report
                </p>
              </div>
            )}

            {hasRun && results.length === 0 && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 20px',
                  color: 'var(--text-secondary)'
                }}
              >
                <Filter size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: '500', marginBottom: '4px' }}>
                  No results found
                </p>
                <p style={{ fontSize: '0.8rem' }}>
                  Try adjusting your filters or selecting different columns
                </p>
              </div>
            )}

            {/* Chart View */}
            {hasRun && results.length > 0 && viewMode === 'chart' && groupBy && (
              <div style={{ padding: '20px 24px' }}>
                <h4
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    marginBottom: '16px',
                    color: 'var(--text-primary)'
                  }}
                >
                  {sourceDef.groupBy.find((g) => g.key === groupBy)?.label || groupBy} -{' '}
                  {(CHART_METRICS[dataSource] || []).find((m) => m.value === chartMetric)
                    ?.label || 'Count'}
                </h4>
                {chartData.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px'
                    }}
                  >
                    <span
                      style={{
                        width: '200px',
                        fontSize: '0.85rem',
                        textAlign: 'right',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        color: 'var(--text-primary)',
                        flexShrink: 0
                      }}
                      title={item.label}
                    >
                      {item.label}
                    </span>
                    <div
                      style={{
                        flex: 1,
                        height: '24px',
                        background: 'var(--table-border)',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}
                    >
                      <div
                        style={{
                          width: `${item.percent}%`,
                          height: '100%',
                          background: 'var(--accent-primary)',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }}
                      />
                    </div>
                    <span
                      style={{
                        width: '80px',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        flexShrink: 0
                      }}
                    >
                      {chartMetric === 'count'
                        ? item.value
                        : item.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                {chartData.length === 0 && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    No data to chart. Select a Group By field to see chart data.
                  </p>
                )}
              </div>
            )}

            {hasRun && results.length > 0 && viewMode === 'chart' && !groupBy && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '60px 20px',
                  color: 'var(--text-secondary)'
                }}
              >
                <Layers size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                <p style={{ fontSize: '0.95rem', fontWeight: '500', marginBottom: '4px' }}>
                  No grouping selected
                </p>
                <p style={{ fontSize: '0.8rem' }}>
                  Select a Group By field in the sidebar to generate a chart
                </p>
              </div>
            )}

            {/* Table View */}
            {hasRun && results.length > 0 && viewMode === 'table' && !groupedResults && (
              <ResultsTable
                columns={sourceDef.columns.filter((c) => selectedColumns.has(c.key))}
                rows={results}
                isLight={isLight}
              />
            )}

            {hasRun && results.length > 0 && viewMode === 'table' && groupedResults && (
              <div>
                {Object.entries(groupedResults).map(([group, rows]) => (
                  <div key={group}>
                    <div
                      style={{
                        padding: '8px 16px',
                        background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                        borderBottom: '1px solid var(--table-border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <span style={{ fontWeight: '600', fontSize: '0.85rem' }}>{group}</span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          padding: '1px 8px',
                          borderRadius: '10px',
                          background: 'rgba(0,210,255,0.1)',
                          color: 'var(--accent-primary)',
                          fontWeight: '600'
                        }}
                      >
                        {rows.length}
                      </span>
                    </div>
                    <ResultsTable
                      columns={sourceDef.columns.filter((c) => selectedColumns.has(c.key))}
                      rows={rows}
                      isLight={isLight}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Modal */}
      {saveModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setSaveModalOpen(false)}
        >
          <div
            style={{
              background: isLight ? '#ffffff' : '#1a1d28',
              borderRadius: '14px',
              padding: '24px',
              width: '400px',
              maxWidth: '90vw',
              border: 'var(--glass-border)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}
            >
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', margin: 0 }}>
                {editingReportId ? 'Update Report' : 'Save Report'}
              </h3>
              <button
                onClick={() => setSaveModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: '4px'
                  }}
                >
                  Report Name *
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g. Active Vessels by Fleet"
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    display: 'block',
                    marginBottom: '4px'
                  }}
                >
                  Description
                </label>
                <input
                  type="text"
                  value={saveDescription}
                  onChange={(e) => setSaveDescription(e.target.value)}
                  placeholder="Optional description"
                  style={inputStyle}
                />
              </div>
              <label style={{ ...checkboxLabelStyle, fontSize: '0.82rem' }}>
                <input
                  type="checkbox"
                  checked={saveShared}
                  onChange={(e) => setSaveShared(e.target.checked)}
                  style={{ accentColor: 'var(--accent-primary)' }}
                />
                <Share2 size={14} />
                Share with all users
              </label>
            </div>

            <div
              style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}
            >
              <button
                className="btn-secondary"
                onClick={() => setSaveModalOpen(false)}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSave}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '0.82rem'
                }}
              >
                <Save size={14} />
                {editingReportId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Results Table Sub-Component ──────────────────────────────────────────

function ResultsTable({
  columns,
  rows,
  isLight
}: {
  columns: ColumnDef[]
  rows: any[]
  isLight: boolean
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
      <thead>
        <tr>
          {columns.map((col) => (
            <th
              key={col.key}
              style={{
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: '600',
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--text-secondary)',
                borderBottom: '1px solid var(--table-border)',
                background: isLight ? '#eef0f3' : '#181b24',
                position: 'sticky',
                top: 0,
                whiteSpace: 'nowrap'
              }}
            >
              {col.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            style={{
              borderBottom: '1px solid var(--table-border)',
              background:
                i % 2 === 0
                  ? 'transparent'
                  : isLight
                    ? 'rgba(0,0,0,0.015)'
                    : 'rgba(255,255,255,0.015)'
            }}
          >
            {columns.map((col) => {
              const val = row[col.key]
              // daysUntilExpiry color coding
              if (col.key === 'daysUntilExpiry' && val !== null && val !== undefined) {
                const n = Number(val)
                let bg = 'rgba(0,255,136,0.1)'
                let fg = isLight ? '#008c46' : '#00ff88'
                if (n < 0) {
                  bg = 'rgba(255,77,77,0.1)'; fg = 'var(--danger)'
                } else if (n < 30) {
                  bg = 'rgba(255,160,0,0.1)'; fg = isLight ? '#b45309' : '#ffaa00'
                } else if (n < 60) {
                  bg = 'rgba(255,204,0,0.1)'; fg = isLight ? '#92700c' : '#ffcc00'
                }
                return (
                  <td key={col.key} style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: '600', background: bg, color: fg }}>
                      {n < 0 ? `${Math.abs(n)}d overdue` : `${n}d`}
                    </span>
                  </td>
                )
              }
              // fileStatus badge
              if (col.key === 'fileStatus') {
                const linked = val === 'Linked'
                return (
                  <td key={col.key} style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: '600',
                      background: linked ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                      color: linked ? (isLight ? '#008c46' : '#00ff88') : 'var(--danger)'
                    }}>
                      {val || ''}
                    </span>
                  </td>
                )
              }
              // requirement badge
              if (col.key === 'requirement') {
                const mandatory = val === 'Mandatory'
                return (
                  <td key={col.key} style={{ padding: '7px 12px', whiteSpace: 'nowrap' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: '600',
                      background: mandatory ? 'rgba(255,160,0,0.1)' : 'rgba(0,210,255,0.1)',
                      color: mandatory ? (isLight ? '#b45309' : '#ffaa00') : 'var(--accent-primary)'
                    }}>
                      {val || ''}
                    </span>
                  </td>
                )
              }
              return (
                <td
                  key={col.key}
                  style={{
                    padding: '7px 12px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '250px'
                  }}
                >
                  {col.key === 'isActive' ? (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        background: val ? 'rgba(0,255,136,0.1)' : 'rgba(255,77,77,0.1)',
                        color: val ? (isLight ? '#008c46' : '#00ff88') : 'var(--danger)'
                      }}
                    >
                      {val ? 'Active' : 'Inactive'}
                    </span>
                  ) : col.key === 'status' ? (
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '0.72rem',
                        fontWeight: '600',
                        background:
                          val === 'active' || val === 'Closed' || val === 'completed'
                            ? 'rgba(0,255,136,0.1)'
                            : val === 'draft' || val === 'pending' || val === 'Open'
                              ? 'rgba(255,204,0,0.1)'
                              : val === 'inactive' || val === 'cancelled' || val === 'superseded'
                                ? 'rgba(255,77,77,0.1)'
                                : 'rgba(0,210,255,0.1)',
                        color:
                          val === 'active' || val === 'Closed' || val === 'completed'
                            ? isLight ? '#008c46' : '#00ff88'
                            : val === 'draft' || val === 'pending' || val === 'Open'
                              ? isLight ? '#b45309' : '#ffcc00'
                              : val === 'inactive' || val === 'cancelled' || val === 'superseded'
                                ? 'var(--danger)'
                                : 'var(--accent-primary)'
                      }}
                    >
                      {val || ''}
                    </span>
                  ) : (
                    formatCellValue(val, col.key)
                  )}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
