import { Fragment, useState, useEffect, useCallback } from 'react'
import { useRequestedSubTab, SubTabProps } from '../utils/useRequestedSubTab'
import {
  Search,
  Shield,
  AlertTriangle,
  Info,
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Upload,
  X,
  Users,
  Settings,
  FileText,
  Download,
  RefreshCw,
  Loader2,
  ScanText
} from 'lucide-react'
import { SanctionsMatch, SicEntityInput } from '../../../shared/types'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import SanctionsCheckReport from './SanctionsCheckReport'
import SicLetterImport from './SicLetterImport'
import { PageHeader, Modal, Field, Tabs } from './ui'
import { ok, isIpcError } from '../utils/ipc'
import { formatDate } from '../utils/dateUtils'
import { hasArabic } from '../utils/arabicNames'
import { saveFile, SaveCancelledError } from '../utils/saveFile'
import {
  checkBirth,
  checkImo,
  checkNationality,
  daysSince,
  nationalityName,
  scoreBand,
  updatedAgo,
  type DetailCheck
} from '../utils/sanctionsDetails'

interface SicEntry {
  id: number
  name: string
  entity_type: string
  source_id: string | null
  aliases: string[]
  date_of_birth: string | null
  nationality: string | null
  remarks: string | null
  listed_date: string | null
  mother_name: string | null
  father_name: string | null
}

const MATCHED_ON_LABEL: Record<string, string> = {
  name: 'name',
  alias: 'alias',
  imo: 'IMO',
  father: "father's name",
  mother: "mother's name"
}

const wordKey = (w: string): string =>
  w
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '')

/** The listed name with the words that were searched for in bold */
function HighlightWords({ text, query }: { text: string; query: string }): React.JSX.Element {
  const wanted = new Set(query.split(/\s+/).map(wordKey).filter(Boolean))
  return (
    <>
      {text.split(/(\s+)/).map((part, i) =>
        wanted.has(wordKey(part)) ? (
          <mark
            key={i}
            style={{
              background: 'color-mix(in srgb, var(--accent-primary) 25%, transparent)',
              color: 'inherit',
              borderRadius: '3px',
              padding: '0 2px'
            }}
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

const EMPTY_FORM: Omit<SicEntry, 'id'> = {
  name: '',
  entity_type: 'individual',
  source_id: '',
  aliases: [],
  date_of_birth: '',
  nationality: '',
  remarks: '',
  listed_date: '',
  mother_name: '',
  father_name: ''
}

interface RemarkTemplate {
  label: string
  text: string
}

export default function SanctionsSearch({
  subTab,
  subTabNonce
}: SubTabProps = {}): React.JSX.Element {
  const { user, hasPermission } = useAuth()
  // Editing the local SIC list (same gate as the server)
  const canEditSic = hasPermission('compliance:review') || hasPermission('admin:settings')
  const { theme } = useTheme()
  const { showSuccess, showError } = useToast()
  const isLight = theme === 'light' || theme === 'aurora'

  const [activeTab, setActiveTab] = useState<'search' | 'sic' | 'report'>('search')
  // A searched name taken to the Check Report tab (remounts it with that subject)
  const [reportSubject, setReportSubject] = useState<{ name: string; nonce: number } | null>(null)
  useRequestedSubTab(subTab, subTabNonce, ['search', 'sic', 'report'] as const, setActiveTab)
  const [updatingLists, setUpdatingLists] = useState(false)
  const [updateProgress, setUpdateProgress] = useState('')

  // Search state
  const [query, setQuery] = useState('')
  const [threshold, setThreshold] = useState(user?.sanctionsThreshold || 60)
  // The user's saved default; moving the slider only changes this search until saved
  const [savedThreshold, setSavedThreshold] = useState(user?.sanctionsThreshold || 60)
  const [sources, setSources] = useState<string[]>(['ofac', 'un', 'eu', 'uk', 'isf', 'sic'])
  const [results, setResults] = useState<SanctionsMatch[]>([])
  // The words searched for (highlighted in the results; the box may already hold a new search)
  const [searchedQuery, setSearchedQuery] = useState('')
  // Optional details that narrow the results
  const [showDetails, setShowDetails] = useState(false)
  const [dob, setDob] = useState('')
  const [nationality, setNationality] = useState('')
  const [imo, setImo] = useState('')
  const [searchedDetails, setSearchedDetails] = useState({ dob: '', nationality: '', imo: '' })
  const [showLeftOut, setShowLeftOut] = useState(false)
  // When each list was last updated (shown by the list chips)
  const [listStatus, setListStatus] = useState<Record<string, string>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // SIC state
  const [sicEntries, setSicEntries] = useState<SicEntry[]>([])
  const [sicSearch, setSicSearch] = useState('')
  const [sicLoading, setSicLoading] = useState(false)
  const [showSicModal, setShowSicModal] = useState(false)
  const [editingSic, setEditingSic] = useState<SicEntry | null>(null)
  const [sicForm, setSicForm] = useState<Omit<SicEntry, 'id'>>(EMPTY_FORM)
  const [aliasInput, setAliasInput] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)
  const [remarkTemplates, setRemarkTemplates] = useState<RemarkTemplate[]>([])
  // Scanned SIC letters being imported (one after the other)
  const [letterFiles, setLetterFiles] = useState<string[] | null>(null)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [templateForm, setTemplateForm] = useState<RemarkTemplate>({ label: '', text: '' })
  const [editingTemplateIdx, setEditingTemplateIdx] = useState<number | null>(null)

  // Follow the user's saved threshold when the user object changes (login / profile save)
  const [thresholdUser, setThresholdUser] = useState(user)
  if (user !== thresholdUser) {
    setThresholdUser(user)
    if (user?.sanctionsThreshold !== undefined) {
      setThreshold(user.sanctionsThreshold)
      setSavedThreshold(user.sanctionsThreshold)
    }
  }

  const loadSicEntries = useCallback(async () => {
    setSicLoading(true)
    try {
      const entries = await window.api.sicGetEntities()
      setSicEntries(Array.isArray(entries) ? entries : [])
    } catch {
      /* ignore */
    }
    setSicLoading(false)
  }, [])

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      try {
        const templates = await window.api.sicGetRemarkTemplates()
        if (alive) setRemarkTemplates(Array.isArray(templates) ? templates : [])
      } catch {
        /* ignore */
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'sic') return
    let alive = true
    const run = async (): Promise<void> => {
      setSicLoading(true)
      try {
        const entries = await window.api.sicGetEntities()
        if (alive) setSicEntries(Array.isArray(entries) ? entries : [])
      } catch {
        /* ignore */
      }
      if (alive) setSicLoading(false)
    }
    void run()
    return () => {
      alive = false
    }
  }, [activeTab])

  // Last searches (this computer, per user): chips under the search box
  const recentKey = `sanctions_recent_u${user?.id || ''}`
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(recentKey)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const rememberSearch = (q: string): void => {
    const next = [q, ...recent.filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, 10)
    setRecent(next)
    try {
      localStorage.setItem(recentKey, JSON.stringify(next))
    } catch {
      /* storage unavailable: kept for this session only */
    }
  }
  const clearRecent = (): void => {
    setRecent([])
    try {
      localStorage.removeItem(recentKey)
    } catch {
      /* ignore */
    }
  }

  const handleSearch = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault()
    await runSearch(query)
  }

  const runSearch = async (raw: string): Promise<void> => {
    const q = raw.trim()
    if (!q) return
    // One or two letters match parts of thousands of names: not a useful screening
    if (q.replace(/\s+/g, '').length < 3) {
      setHasSearched(true)
      setResults([])
      setError('Type at least 3 letters to search')
      return
    }

    setIsSearching(true)
    setError(null)
    setHasSearched(true)
    setExpandedId(null)
    setShowLeftOut(false)
    setSearchedQuery(q)
    setSearchedDetails({ dob: dob.trim(), nationality: nationality.trim(), imo: imo.trim() })
    rememberSearch(q)

    try {
      const response = await window.api.checkSanctions(q, threshold / 100, sources)

      if (response.status === 'ERROR') {
        setError(
          ('error' in response && typeof response.error === 'string' && response.error) ||
            'An error occurred during search'
        )
        setResults([])
      } else {
        let matches: SanctionsMatch[] = response.matches || []
        // An IMO typed in the details is searched too: a renamed vessel is still found
        const imoDigits = imo.replace(/\D/g, '')
        if (imoDigits.length === 7 && imoDigits !== q) {
          const byImo = await window.api.checkSanctions(imoDigits, threshold / 100, sources)
          if (byImo.status !== 'ERROR')
            for (const m of byImo.matches || [])
              if (!matches.some((x) => x.id === m.id)) matches = [...matches, m]
        }
        const filteredMatches = matches
          .filter((m: SanctionsMatch) => Math.round((m.score || 0) * 100) >= threshold)
          .sort((a, b) => (b.score || 0) - (a.score || 0))
        setResults(filteredMatches)
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Failed to connect to sanctions service')
    } finally {
      setIsSearching(false)
    }
  }

  // Extra details (optional): a result whose listed date of birth, nationality or IMO differs
  // is left out (it can be shown again); a matching one is ticked
  const detailChecks = (
    m: SanctionsMatch
  ): { birth: DetailCheck; nat: DetailCheck; imo: DetailCheck } => ({
    birth: checkBirth(searchedDetails.dob, m.date_of_birth),
    nat: checkNationality(searchedDetails.nationality, m.nationality),
    imo: checkImo(searchedDetails.imo, m.imo_number)
  })
  const leftOut = results.filter((m) => Object.values(detailChecks(m)).includes('differs'))
  const shownResults = showLeftOut ? results : results.filter((m) => !leftOut.includes(m))
  // Results by kind (individual, entity, vessel...), in that order
  const resultGroups: [string, SanctionsMatch[]][] = (() => {
    const groups = new Map<string, SanctionsMatch[]>()
    for (const m of shownResults) {
      const t = (m.target_type || 'unknown').toLowerCase()
      groups.set(t, [...(groups.get(t) || []), m])
    }
    // The kind with the strongest match first; then individual, entity, vessel, aircraft
    const order = ['individual', 'entity', 'vessel', 'aircraft']
    const rank = (t: string): number => (order.indexOf(t) === -1 ? 99 : order.indexOf(t))
    const best = (l: SanctionsMatch[]): number => Math.max(...l.map((m) => m.score || 0))
    return [...groups].sort((a, b) => best(b[1]) - best(a[1]) || rank(a[0]) - rank(b[0]))
  })()

  const saveThresholdAsDefault = async (): Promise<void> => {
    if (!user) return
    try {
      await window.api.updateSanctionsThreshold(threshold)
      setSavedThreshold(threshold)
      showSuccess(`${threshold}% is now your default match threshold`)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save the threshold')
    }
  }

  const exportResults = async (): Promise<void> => {
    try {
      const XLSX = (await import('xlsx-js-style')).default
      const rows = shownResults.map((m) => ({
        'Searched name': searchedQuery,
        'Name on list': m.names?.[0] || '',
        'Matched on': m.matched_on
          ? `${MATCHED_ON_LABEL[m.matched_on.field]}: ${m.matched_on.value}`
          : '',
        'Also known as': (m.names || []).slice(1).join('; '),
        List: m.source,
        'List reference': m.source_id,
        Kind: m.target_type,
        'Score %': Math.round((m.score || 0) * 100),
        Strength: scoreBand(m.score).label,
        Born: m.date_of_birth || '',
        Nationality: nationalityName(m.nationality),
        IMO: m.imo_number || '',
        'Listed on': m.listed_on || '',
        Remarks: m.remarks || ''
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      ws['!cols'] = [22, 30, 30, 40, 8, 16, 12, 8, 10, 14, 14, 10, 12, 60].map((wch) => ({ wch }))
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Results')
      const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
      await saveFile(
        new Blob([out], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }),
        `Sanctions search - ${query.trim().slice(0, 40) || 'results'}.xlsx`
      )
      showSuccess('Results exported')
    } catch (err) {
      if (err instanceof SaveCancelledError) return
      showError((err instanceof Error && err.message) || 'Export failed')
    }
  }

  const toggleSource = (source: string): void => {
    setSources((prev) =>
      prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]
    )
  }

  const getSourceColor = (
    source: string
  ): '#ff6b6b' | '#4dabf7' | '#69db7c' | '#ffd43b' | '#ff922b' | '#e599f7' => {
    switch (source.toLowerCase()) {
      case 'ofac':
        return '#ff6b6b'
      case 'eu':
        return '#4dabf7'
      case 'uk':
        return '#ff922b'
      case 'un':
        return '#69db7c'
      case 'isf':
        return '#e599f7'
      case 'sic':
        return '#ffd43b'
      default:
        return '#ffd43b'
    }
  }

  // SIC handlers
  const openAddSic = (): void => {
    setEditingSic(null)
    setSicForm({ ...EMPTY_FORM })
    setAliasInput('')
    setShowSicModal(true)
  }

  const openEditSic = (entry: SicEntry): void => {
    setEditingSic(entry)
    setSicForm({
      name: entry.name,
      entity_type: entry.entity_type || 'individual',
      source_id: entry.source_id || '',
      aliases: entry.aliases || [],
      date_of_birth: entry.date_of_birth || '',
      nationality: entry.nationality || '',
      remarks: entry.remarks || '',
      listed_date: entry.listed_date || '',
      mother_name: entry.mother_name || '',
      father_name: entry.father_name || ''
    })
    setAliasInput('')
    setShowSicModal(true)
  }

  const handleSaveSic = async (): Promise<void> => {
    if (!sicForm.name.trim()) return
    try {
      const payload = {
        name: sicForm.name.trim(),
        entityType: sicForm.entity_type as SicEntityInput['entityType'],
        sourceId: sicForm.source_id || null,
        aliases: sicForm.aliases,
        dateOfBirth: sicForm.date_of_birth || null,
        nationality: sicForm.nationality || null,
        remarks: sicForm.remarks || null,
        listedDate: sicForm.listed_date || null,
        motherName: sicForm.mother_name || null,
        fatherName: sicForm.father_name || null
      }
      const res = editingSic
        ? await window.api.sicUpdateEntity(editingSic.id, payload)
        : await window.api.sicAddEntity(payload)
      // safeHandle returns { error: true, message } instead of throwing
      if (isIpcError(res)) {
        showError(res.message || 'Failed to save SIC entry')
        return
      }
      showSuccess(editingSic ? 'SIC entry updated' : 'SIC entry added')
      setShowSicModal(false)
      await loadSicEntries()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save')
    }
  }

  const handleDeleteSic = async (id: number): Promise<void> => {
    try {
      const res = await window.api.sicDeleteEntity(id)
      if (isIpcError(res)) {
        showError(res.message || 'Failed to delete')
        return
      }
      showSuccess('SIC entry deleted')
      setDeleteConfirm(null)
      await loadSicEntries()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to delete')
    }
  }

  const handleImportSic = async (): Promise<void> => {
    try {
      const filePath = await window.api.dialogOpenFile()
      if (!filePath) return
      const importResult = await window.api.sicImport(filePath)
      if (isIpcError(importResult)) {
        showError(importResult.message || 'Failed to import')
        return
      }
      showSuccess(`Imported ${importResult.count} SIC entries`)
      loadSicEntries()
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Import failed')
    }
  }

  const addAlias = (): void => {
    const a = aliasInput.trim()
    if (!a || sicForm.aliases.includes(a)) return
    setSicForm((prev) => ({ ...prev, aliases: [...prev.aliases, a] }))
    setAliasInput('')
  }

  const removeAlias = (idx: number): void => {
    setSicForm((prev) => ({ ...prev, aliases: prev.aliases.filter((_, i) => i !== idx) }))
  }

  const openTemplateManager = (): void => {
    setEditingTemplateIdx(null)
    setTemplateForm({ label: '', text: '' })
    setShowTemplateManager(true)
  }

  const startEditTemplate = (t: RemarkTemplate, idx: number): void => {
    setEditingTemplateIdx(idx)
    setTemplateForm({ label: t.label, text: t.text })
  }

  const saveTemplate = async (): Promise<void> => {
    if (!templateForm.label.trim() || !templateForm.text.trim()) return
    const updated = [...remarkTemplates]
    if (editingTemplateIdx !== null) {
      updated[editingTemplateIdx] = { ...templateForm }
    } else {
      updated.push({ ...templateForm })
    }
    try {
      await window.api.sicSetRemarkTemplates(updated)
      setRemarkTemplates(updated)
      setEditingTemplateIdx(null)
      setTemplateForm({ label: '', text: '' })
      showSuccess(editingTemplateIdx !== null ? 'Template updated' : 'Template added')
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to save')
    }
  }

  const deleteTemplate = async (idx: number): Promise<void> => {
    const updated = remarkTemplates.filter((_, i) => i !== idx)
    try {
      ok(await window.api.sicSetRemarkTemplates(updated))
      setRemarkTemplates(updated)
      if (editingTemplateIdx === idx) {
        setEditingTemplateIdx(null)
        setTemplateForm({ label: '', text: '' })
      }
      showSuccess('Template deleted')
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to delete')
    }
  }

  const filteredSic = sicEntries.filter((e) => {
    if (!sicSearch) return true
    const q = sicSearch.toLowerCase()
    return (
      e.name.toLowerCase().includes(q) ||
      (e.nationality || '').toLowerCase().includes(q) ||
      (e.mother_name || '').toLowerCase().includes(q) ||
      (e.father_name || '').toLowerCase().includes(q) ||
      (e.source_id || '').toLowerCase().includes(q) ||
      (e.aliases || []).some((a) => a.toLowerCase().includes(q))
    )
  })

  const statusMap = (
    st: Awaited<ReturnType<typeof window.api.sanctionsGetStatus>>
  ): Record<string, string> =>
    Object.fromEntries((st?.sources || []).map((x) => [x.source, x.updated_at || '']))
  const loadListStatus = (): void => {
    window.api
      .sanctionsGetStatus()
      .then((st) => setListStatus(statusMap(st)))
      .catch(() => {
        /* freshness is informative only */
      })
  }
  useEffect(() => {
    window.api
      .sanctionsGetStatus()
      .then((st) => setListStatus(statusMap(st)))
      .catch(() => {
        /* freshness is informative only */
      })
  }, [])

  const handleUpdateLists = async (): Promise<void> => {
    const SANCTION_SOURCES = ['OFAC', 'EU', 'UK', 'UN', 'ISF']
    setUpdatingLists(true)
    let total = 0
    const failed: string[] = []
    try {
      // Refresh one source at a time so the user sees live progress
      for (let i = 0; i < SANCTION_SOURCES.length; i++) {
        const src = SANCTION_SOURCES[i]
        setUpdateProgress(`${src} (${i + 1}/${SANCTION_SOURCES.length})`)
        try {
          const res = await window.api.sanctionsRefresh(src)
          // One source was requested, so the result is a single object
          const single = Array.isArray(res) ? undefined : res
          if (single && (single.error || single.status === 'error')) {
            failed.push(src)
          } else {
            total += single?.count || 0
          }
        } catch {
          failed.push(src)
        }
      }
      if (failed.length > 0) {
        showError(
          `Updated with errors — failed: ${failed.join(', ')}. ${total.toLocaleString()} entities loaded from the rest.`
        )
      } else {
        showSuccess(`All sanctions lists updated — ${total.toLocaleString()} entities loaded`)
      }
    } finally {
      setUpdatingLists(false)
      setUpdateProgress('')
      loadListStatus()
    }
  }

  return (
    <div className="fade-in page">
      <PageHeader
        icon={<Search size={26} />}
        title="Sanctions Search"
        subtitle="Ad-hoc lookup across global sanctions databases and local SIC list."
        actions={
          <button
            onClick={handleUpdateLists}
            disabled={updatingLists}
            className="btn-secondary"
            title="Download the latest OFAC, EU, UK, UN and ISF sanctions lists"
          >
            {updatingLists ? <Loader2 size={16} className="spinner" /> : <RefreshCw size={16} />}
            {updatingLists ? `Updating ${updateProgress}…` : 'Update Lists'}
          </button>
        }
      />

      <Tabs
        style={{ marginBottom: '24px' }}
        value={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'search', label: 'Search', icon: <Search size={15} /> },
          {
            key: 'sic',
            label: 'SIC List',
            icon: <Users size={15} />,
            count: sicEntries.length || undefined
          },
          { key: 'report', label: 'Check Report', icon: <FileText size={15} /> }
        ]}
      />

      {/* ============ SEARCH TAB ============ */}
      {activeTab === 'search' && (
        <>
          <div className="glass-card" style={{ padding: '24px', marginBottom: '24px' }}>
            <form
              onSubmit={handleSearch}
              style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
            >
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={20}
                    style={{
                      position: 'absolute',
                      left: '14px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-secondary)'
                    }}
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name, entity, or vessel..."
                    style={{
                      width: '100%',
                      padding: '12px 12px 12px 48px',
                      fontSize: '1rem'
                    }}
                    aria-label="Entity name search"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSearching || !query.trim()}
                  style={{ padding: '0 32px' }}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              <div
                style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', alignItems: 'flex-end' }}
              >
                <div style={{ flex: '1 1 300px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}
                  >
                    <label
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      MINIMUM MATCH THRESHOLD
                    </label>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        color: scoreBand(threshold / 100).color
                      }}
                    >
                      {threshold}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="95"
                    step="5"
                    value={threshold}
                    onChange={(e) => setThreshold(parseInt(e.target.value))}
                    style={{ width: '100%', height: '6px', cursor: 'pointer' }}
                    aria-label="Minimum match threshold"
                  />
                  {threshold !== savedThreshold && user && (
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        alignItems: 'center',
                        marginTop: '6px',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      <span>For this search only (your default is {savedThreshold}%)</span>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => void saveThresholdAsDefault()}
                      >
                        Save as my default
                      </button>
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => setThreshold(savedThreshold)}
                      >
                        Reset
                      </button>
                    </div>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: '4px',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <span>Broader (10%)</span>
                    <span>Exact (95%)</span>
                  </div>
                </div>

                <div style={{ flex: '1 1 300px' }}>
                  <label
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: 'var(--text-secondary)',
                      display: 'block',
                      marginBottom: '12px'
                    }}
                  >
                    SANCTIONS LISTS
                  </label>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {['OFAC', 'UN', 'EU', 'UK', 'ISF', 'SIC'].map((source) => {
                      // SIC is kept by hand: no download date to show
                      const updated = source === 'SIC' ? '' : updatedAgo(listStatus[source])
                      const stale = source !== 'SIC' && daysSince(listStatus[source]) > 7
                      return (
                        <button
                          key={source}
                          type="button"
                          onClick={() => toggleSource(source.toLowerCase())}
                          title={
                            source === 'SIC'
                              ? 'SIC list (kept by hand in the SIC List tab)'
                              : listStatus[source]
                                ? `${source} list last updated ${updated}${stale ? ' - use Update Lists' : ''}`
                                : `${source} list never downloaded - use Update Lists`
                          }
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            lineHeight: 1.2,
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: `1px solid ${sources.includes(source.toLowerCase()) ? getSourceColor(source) : 'var(--input-border)'}`,
                            background: sources.includes(source.toLowerCase())
                              ? `${getSourceColor(source)}15`
                              : 'transparent',
                            color: sources.includes(source.toLowerCase())
                              ? getSourceColor(source)
                              : 'var(--text-secondary)',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {source}
                          {source !== 'SIC' && (
                            <span
                              style={{
                                fontSize: '0.64rem',
                                fontWeight: 500,
                                color: stale ? 'var(--warning)' : 'var(--text-secondary)'
                              }}
                            >
                              {updated || 'never'}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setShowDetails((v) => !v)}
                  aria-expanded={showDetails}
                >
                  {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />} More
                  details (date of birth, nationality, IMO)
                  {(dob || nationality || imo) && !showDetails ? ' - in use' : ''}
                </button>
                {showDetails && (
                  <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    <Field label="Date of birth (or year)">
                      <input
                        type="text"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        placeholder="e.g. 1965 or 15/03/1965"
                      />
                    </Field>
                    <Field label="Nationality">
                      <input
                        type="text"
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                        placeholder="e.g. Lebanese"
                      />
                    </Field>
                    <Field label="IMO">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={imo}
                        onChange={(e) => setImo(e.target.value)}
                        placeholder="7 digits"
                      />
                    </Field>
                    <div
                      style={{
                        gridColumn: '1 / -1',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      A result whose listed date of birth (year), nationality or IMO is different is
                      left out (you can still show it); one that matches is ticked. The IMO is also
                      searched on its own.
                    </div>
                  </div>
                )}
                {recent.length > 0 && (
                  <div
                    style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}
                  >
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Recent:
                    </span>
                    {recent.map((r) => (
                      <button
                        key={r}
                        type="button"
                        className="btn-ghost btn-sm"
                        style={{ padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem' }}
                        onClick={() => {
                          setQuery(r)
                          void runSearch(r)
                        }}
                        title={`Search ${r} again`}
                      >
                        {r}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}
                      onClick={clearRecent}
                      title="Clear the recent searches"
                    >
                      <X size={12} /> Clear
                    </button>
                  </div>
                )}
              </div>
            </form>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              style={{
                padding: '16px',
                background: 'rgba(255, 77, 77, 0.1)',
                border: '1px solid rgba(255, 77, 77, 0.3)',
                borderRadius: '12px',
                color: 'var(--danger)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '24px'
              }}
            >
              <AlertTriangle size={20} />
              <span>{error}</span>
            </div>
          )}

          {!isSearching && hasSearched && results.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '64px 24px' }}>
              <Shield
                size={48}
                style={{ color: 'var(--text-secondary)', opacity: 0.3, marginBottom: '16px' }}
              />
              <h3>No matches found</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                No entities in the selected databases exceeded the {threshold}% threshold.
              </p>
            </div>
          )}

          {!hasSearched && (
            <div style={{ textAlign: 'center', padding: '64px 24px', opacity: 0.5 }}>
              <Info size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
              <h3>Enter a name to begin</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                Search results will appear here with detailed match information.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: '10px',
                marginBottom: '12px',
                flexWrap: 'wrap',
                alignItems: 'center'
              }}
            >
              <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>
                {shownResults.length} result{shownResults.length !== 1 ? 's' : ''}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>—</span>
              {resultGroups.map(([type, list]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    document
                      .getElementById(`sanctions-group-${type}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  title={`Go to the ${type} results`}
                  style={{
                    fontSize: '0.78rem',
                    padding: '3px 10px',
                    borderRadius: '12px',
                    border: 'none',
                    cursor: 'pointer',
                    background: 'color-mix(in srgb, var(--text-primary) 5%, transparent)',
                    color: 'var(--text-secondary)'
                  }}
                >
                  {type}: {list.length}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => void exportResults()}
                  title="Export these results to Excel"
                >
                  <Download size={14} /> Export
                </button>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setReportSubject({ name: searchedQuery || query.trim(), nonce: Date.now() })
                    setActiveTab('report')
                  }}
                  title="Screen this name as a check report: link it to an entity, record the decision, export a PDF"
                >
                  <FileText size={14} /> Check report
                </button>
              </div>
            </div>
          )}

          {leftOut.length > 0 && (
            <div
              style={{
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginBottom: '12px',
                display: 'flex',
                gap: '8px',
                alignItems: 'center'
              }}
            >
              <Info size={14} />
              {leftOut.length} result{leftOut.length !== 1 ? 's' : ''}{' '}
              {showLeftOut ? 'shown with' : 'left out:'} a different date of birth, nationality or
              IMO.
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setShowLeftOut((v) => !v)}
              >
                {showLeftOut ? 'Hide them' : 'Show them'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {resultGroups.map(([type, list]) => (
              <div key={type}>
                <div
                  id={`sanctions-group-${type}`}
                  style={{
                    scrollMarginTop: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '6px 2px',
                    marginBottom: '6px'
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {type}
                  </span>
                  <span className="badge">{list.length}</span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name on list</th>
                        <th style={{ width: '70px' }}>List</th>
                        <th style={{ width: '220px' }}>Born / nationality / IMO</th>
                        <th style={{ width: '200px' }}>Programmes</th>
                        <th className="num" style={{ width: '90px' }}>
                          Score
                        </th>
                        <th style={{ width: '28px' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((match) => {
                        const checks = detailChecks(match)
                        const band = scoreBand(match.score)
                        const tick = (c: DetailCheck): string =>
                          c === 'match' ? ' ✓' : c === 'differs' ? ' ✗' : ''
                        const facts = [
                          match.date_of_birth
                            ? `Born ${match.date_of_birth}${tick(checks.birth)}`
                            : '',
                          match.nationality
                            ? `${nationalityName(match.nationality)}${tick(checks.nat)}`
                            : '',
                          match.imo_number ? `IMO ${match.imo_number}${tick(checks.imo)}` : ''
                        ].filter(Boolean)
                        const open = expandedId === match.id
                        return (
                          <Fragment key={match.id}>
                            <tr
                              className={`clickable${open ? ' selected' : ''}`}
                              onClick={() => setExpandedId(open ? null : match.id)}
                              style={{
                                opacity: Object.values(checks).includes('differs') ? 0.6 : 1
                              }}
                            >
                              <td>
                                <div style={{ fontWeight: 600 }}>
                                  <HighlightWords text={match.names[0]} query={searchedQuery} />
                                </div>
                                {match.matched_on && match.matched_on.field !== 'name' && (
                                  <div
                                    style={{
                                      fontSize: '0.76rem',
                                      color: 'var(--text-secondary)',
                                      marginTop: '2px'
                                    }}
                                  >
                                    Matched on {MATCHED_ON_LABEL[match.matched_on.field]}:{' '}
                                    <HighlightWords
                                      text={match.matched_on.value}
                                      query={searchedQuery}
                                    />
                                  </div>
                                )}
                              </td>
                              <td>
                                <span
                                  style={{
                                    padding: '2px 7px',
                                    borderRadius: '4px',
                                    background: `${getSourceColor(match.source)}20`,
                                    color: getSourceColor(match.source),
                                    fontSize: '0.66rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase'
                                  }}
                                >
                                  {match.source}
                                </span>
                              </td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {facts.length > 0 ? facts.map((f) => <div key={f}>{f}</div>) : '-'}
                              </td>
                              <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {match.positions?.length
                                  ? match.positions.slice(0, 2).join(', ') +
                                    (match.positions.length > 2
                                      ? ` +${match.positions.length - 2}`
                                      : '')
                                  : '-'}
                              </td>
                              <td className="num">
                                <div style={{ fontWeight: 800, color: band.color }}>
                                  {Math.round((match.score || 0) * 100)}%
                                </div>
                                <div style={{ fontSize: '0.68rem', color: band.color }}>
                                  {band.label}
                                </div>
                              </td>
                              <td>
                                {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={6} style={{ background: 'var(--bg-secondary)' }}>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: '1fr 1fr',
                                      gap: '20px',
                                      padding: '8px 4px'
                                    }}
                                  >
                                    <div>
                                      <div className="field-label" style={{ marginBottom: '8px' }}>
                                        Aliases and known names
                                      </div>
                                      <div
                                        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}
                                      >
                                        {match.names.map((n, i) => (
                                          <span
                                            key={i}
                                            style={{
                                              padding: '3px 9px',
                                              borderRadius: '6px',
                                              background: 'var(--input-bg)',
                                              fontSize: '0.78rem'
                                            }}
                                          >
                                            <HighlightWords text={n} query={searchedQuery} />
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: '0.82rem', lineHeight: 1.6 }}>
                                      <div className="field-label" style={{ marginBottom: '8px' }}>
                                        Details and remarks
                                      </div>
                                      <div style={{ color: 'var(--text-secondary)' }}>
                                        {match.remarks || 'No additional remarks provided.'}
                                      </div>
                                      {match.positions?.length > 0 && (
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>
                                            Programmes:{' '}
                                          </span>
                                          {match.positions.join(', ')}
                                        </div>
                                      )}
                                      {match.listed_on && (
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>
                                            Listed on:{' '}
                                          </span>
                                          {match.listed_on}
                                        </div>
                                      )}
                                      {match.source_id && (
                                        <div>
                                          <span style={{ color: 'var(--text-secondary)' }}>
                                            List reference:{' '}
                                          </span>
                                          <code>{match.source_id}</code>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ============ SIC LIST TAB ============ */}
      {activeTab === 'sic' && (
        <div>
          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)'
                }}
              />
              <input
                type="text"
                value={sicSearch}
                onChange={(e) => setSicSearch(e.target.value)}
                placeholder="Search SIC entries..."
                style={{ width: '100%', padding: '8px 12px 8px 36px', fontSize: '0.88rem' }}
              />
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              {filteredSic.length} of {sicEntries.length} entries
            </span>
            {canEditSic && (
              <>
                <button className="btn-secondary btn-sm" onClick={openTemplateManager}>
                  <Settings size={14} /> Templates
                </button>
                {hasPermission('admin:settings') && (
                  <button className="btn-secondary btn-sm" onClick={handleImportSic}>
                    <Upload size={14} /> Import Excel
                  </button>
                )}
                <button
                  className="btn-secondary btn-sm"
                  title="Read scanned SIC letters (PDF or image) and add the names they list"
                  onClick={async () => {
                    const picked = await window.api.sicLetterPick()
                    if (Array.isArray(picked) && picked.length) setLetterFiles(picked)
                  }}
                >
                  <ScanText size={14} /> Import Letters
                </button>
                <button className="btn-primary btn-sm" onClick={openAddSic}>
                  <Plus size={14} /> Add Entry
                </button>
              </>
            )}
          </div>

          {/* Table */}
          {sicLoading ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-secondary)' }}>
              Loading...
            </div>
          ) : filteredSic.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '64px 24px', opacity: 0.5 }}>
              <Users size={48} style={{ color: 'var(--text-secondary)', marginBottom: '16px' }} />
              <h3>{sicEntries.length === 0 ? 'No SIC entries yet' : 'No matching entries'}</h3>
              <p style={{ color: 'var(--text-secondary)' }}>
                {sicEntries.length === 0
                  ? 'Import from an Excel file or add entries manually.'
                  : 'Try a different search term.'}
              </p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Father</th>
                    <th>Mother</th>
                    <th>Nationality</th>
                    <th>DOB</th>
                    <th>Date</th>
                    <th>SIC Ref</th>
                    <th style={{ textAlign: 'right', width: '80px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSic.map((entry) => (
                    <tr key={entry.id}>
                      <td style={{ fontWeight: 600 }}>
                        {entry.name}
                        {entry.aliases
                          ?.filter((a) => hasArabic(a))
                          .map((a, i) => (
                            <div
                              key={i}
                              dir="rtl"
                              style={{
                                fontSize: '0.8rem',
                                fontWeight: 500,
                                color: 'var(--text-secondary)',
                                marginTop: '2px',
                                textAlign: 'left'
                              }}
                            >
                              {a}
                            </div>
                          ))}
                        {entry.aliases?.some((a) => !hasArabic(a)) && (
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: 'var(--text-secondary)',
                              marginTop: '2px'
                            }}
                          >
                            aka: {entry.aliases.filter((a) => !hasArabic(a)).join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="muted">{entry.father_name || '—'}</td>
                      <td className="muted">{entry.mother_name || '—'}</td>
                      <td className="muted">{entry.nationality || '—'}</td>
                      <td className="muted">{entry.date_of_birth || '—'}</td>
                      <td className="muted">
                        {formatDate(entry.listed_date) || entry.listed_date || '—'}
                      </td>
                      <td className="muted">
                        <span className="mono">{entry.source_id || '—'}</span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {canEditSic && (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => openEditSic(entry)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--accent-primary)',
                                padding: '4px'
                              }}
                              title="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                            {deleteConfirm === entry.id ? (
                              <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                  onClick={() => handleDeleteSic(entry.id)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--danger)',
                                    padding: '4px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700
                                  }}
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDeleteConfirm(null)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-secondary)',
                                    padding: '4px',
                                    fontSize: '0.7rem'
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirm(entry.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  color: 'var(--danger)',
                                  padding: '4px'
                                }}
                                title="Delete"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {letterFiles && (
        <SicLetterImport
          files={letterFiles}
          existing={sicEntries}
          templates={remarkTemplates}
          onClose={() => setLetterFiles(null)}
          onSaved={loadSicEntries}
        />
      )}

      {/* ============ SIC MODAL ============ */}
      {showSicModal && (
        <Modal
          title={editingSic ? 'Edit SIC Entry' : 'Add SIC Entry'}
          icon={editingSic ? <Pencil size={18} /> : <Plus size={18} />}
          onClose={() => setShowSicModal(false)}
          width={560}
          closeOnOverlay={false}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setShowSicModal(false)}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveSic}
                disabled={!sicForm.name.trim()}
              >
                {editingSic ? 'Save Changes' : 'Add Entry'}
              </button>
            </>
          }
        >
          <div className="form-grid cols-2">
            <Field label="Full name" required span="all">
              <input
                value={sicForm.name}
                onChange={(e) => setSicForm((p) => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field label="Father's name">
              <input
                value={sicForm.father_name || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, father_name: e.target.value }))}
              />
            </Field>
            <Field label="Mother's name">
              <input
                value={sicForm.mother_name || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, mother_name: e.target.value }))}
              />
            </Field>
            <Field label="Nationality">
              <input
                value={sicForm.nationality || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, nationality: e.target.value }))}
              />
            </Field>
            <Field label="Date of birth">
              <input
                value={sicForm.date_of_birth || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                placeholder="e.g. 1985 or 1985-03-15"
              />
            </Field>
            <Field label="Date added">
              <input
                type="date"
                value={sicForm.listed_date || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, listed_date: e.target.value }))}
              />
            </Field>
            <Field label="SIC reference">
              <input
                value={sicForm.source_id || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, source_id: e.target.value }))}
                placeholder="e.g. SIC Ref 1149/26/9446"
              />
            </Field>
            <Field label="Type" span="all">
              <select
                value={sicForm.entity_type}
                onChange={(e) => setSicForm((p) => ({ ...p, entity_type: e.target.value }))}
              >
                <option value="individual">Individual</option>
                <option value="entity">Entity / Organization</option>
                <option value="vessel">Vessel</option>
              </select>
            </Field>
            <Field label="Aliases" span="all">
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addAlias()
                    }
                  }}
                  placeholder="Add alias and press Enter"
                  style={{ flex: 1 }}
                />
                <button className="btn-secondary btn-sm" onClick={addAlias}>
                  Add
                </button>
              </div>
              {sicForm.aliases.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                  {sicForm.aliases.map((a, i) => (
                    <span
                      key={i}
                      dir="auto"
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        background: isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {a}
                      <button
                        title="Remove"
                        aria-label="Remove"
                        onClick={() => removeAlias(i)}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          padding: 0,
                          lineHeight: 1
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Field>
            <Field
              span="all"
              label={
                <span
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  Remarks / subject
                  <button
                    type="button"
                    onClick={() => {
                      setShowSicModal(false)
                      openTemplateManager()
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--accent-primary)',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      padding: 0
                    }}
                  >
                    Manage Templates
                  </button>
                </span>
              }
            >
              {remarkTemplates.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {remarkTemplates.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSicForm((p) => ({ ...p, remarks: t.text }))}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        border: `1px solid ${sicForm.remarks === t.text ? 'var(--accent-primary)' : 'var(--input-border)'}`,
                        background:
                          sicForm.remarks === t.text ? 'var(--accent-tint)' : 'transparent',
                        color:
                          sicForm.remarks === t.text
                            ? 'var(--accent-primary)'
                            : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
              <textarea
                value={sicForm.remarks || ''}
                onChange={(e) => setSicForm((p) => ({ ...p, remarks: e.target.value }))}
                style={{ minHeight: '60px', resize: 'vertical' }}
                rows={3}
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* ============ TEMPLATE MANAGER MODAL ============ */}
      {showTemplateManager && (
        <Modal
          title="Remark Templates"
          icon={<Settings size={18} />}
          onClose={() => setShowTemplateManager(false)}
          width={620}
          closeOnOverlay={false}
        >
          {/* Existing templates */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}
          >
            {remarkTemplates.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem'
                }}
              >
                No templates yet. Add one below.
              </div>
            )}
            {remarkTemplates.map((t, idx) => (
              <div
                key={idx}
                style={{
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border:
                    editingTemplateIdx === idx
                      ? '1px solid var(--accent-primary)'
                      : '1px solid var(--glass-border-color)',
                  background: editingTemplateIdx === idx ? 'var(--row-selected)' : 'transparent'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.label}</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => startEditTemplate(t, idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--accent-primary)',
                        padding: '4px'
                      }}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => deleteTemplate(idx)}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--danger)',
                        padding: '4px'
                      }}
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap',
                    maxHeight: '60px',
                    overflow: 'hidden'
                  }}
                >
                  {t.text}
                </div>
              </div>
            ))}
          </div>

          {/* Add / Edit form */}
          <div style={{ borderTop: '1px solid var(--table-border)', paddingTop: '16px' }}>
            <h4 className="form-section-title">
              {editingTemplateIdx !== null ? 'Edit template' : 'Add template'}
            </h4>
            <div className="form-grid cols-2">
              <Field label="Label" span="all">
                <input
                  value={templateForm.label}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, label: e.target.value }))}
                  placeholder="Short name for the template"
                />
              </Field>
              <Field label="Text" span="all">
                <textarea
                  value={templateForm.text}
                  onChange={(e) => setTemplateForm((p) => ({ ...p, text: e.target.value }))}
                  placeholder="Full remark text..."
                  style={{ minHeight: '80px', resize: 'vertical' }}
                  rows={3}
                />
              </Field>
            </div>
            <div
              className="form-actions"
              style={{ justifyContent: 'flex-start', marginTop: '12px' }}
            >
              <button
                className="btn-primary btn-sm"
                onClick={saveTemplate}
                disabled={!templateForm.label.trim() || !templateForm.text.trim()}
              >
                {editingTemplateIdx !== null ? 'Save Changes' : 'Add Template'}
              </button>
              {editingTemplateIdx !== null && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    setEditingTemplateIdx(null)
                    setTemplateForm({ label: '', text: '' })
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ============ CHECK REPORT TAB ============ */}
      {activeTab === 'report' && (
        <SanctionsCheckReport
          key={reportSubject?.nonce ?? 0}
          initialSubject={reportSubject?.name}
        />
      )}
    </div>
  )
}
