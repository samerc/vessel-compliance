import { useState, useEffect } from 'react'
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  FileText,
  Clock,
  BookOpen,
  Type,
  Globe,
  Hash,
  Landmark,
  AlertTriangle,
  DollarSign,
  Shield,
  Upload,
  X,
  FileCheck,
  Loader2,
  PenTool,
  QrCode,
  Percent
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import RichTextEditor from './RichTextEditor'
import { BC_DEFAULTS } from '../services/PolicyExportService'

type PolicySettingsCategory = 'general' | 'pi' | 'hull' | 'war'

type PolicySettingsTab =
  | 'fontSize'
  | 'timezones'
  | 'pageNumbering'
  | 'footerText'
  | 'headerTitles'
  | 'banks'
  | 'cancelReplace'
  | 'premiumIntro'
  | 'blueCardTexts'
  | 'piOpening'
  | 'piClosing'
  | 'piNotice'
  | 'piPremiumIntro'
  | 'hullOpening'
  | 'hullClosing'
  | 'hullNotice'
  | 'hullPremiumIntro'
  | 'warOpening'
  | 'warClosing'
  | 'warNotice'
  | 'warPremiumIntro'
  | 'tcTemplates'
  | 'signatures'
  | 'qrVerification'
  | 'commissions'

const CATEGORIES: { id: PolicySettingsCategory; label: string; color: string }[] = [
  { id: 'general', label: 'General', color: 'var(--accent-primary)' },
  { id: 'pi', label: 'P&I', color: '#6464ff' },
  { id: 'hull', label: 'H&M', color: '#ff64c8' },
  { id: 'war', label: 'War', color: '#ffb020' },
]

const CATEGORY_TABS: Record<PolicySettingsCategory, { id: PolicySettingsTab; label: string; icon: any }[]> = {
  general: [
    { id: 'fontSize', label: 'Font Size', icon: <Type size={15} /> },
    { id: 'timezones', label: 'Timezones', icon: <Globe size={15} /> },
    { id: 'pageNumbering', label: 'Page Numbering', icon: <Hash size={15} /> },
    { id: 'footerText', label: 'Footer Text', icon: <FileText size={15} /> },
    { id: 'headerTitles', label: 'Header Titles', icon: <BookOpen size={15} /> },
    { id: 'banks', label: 'Banks', icon: <Landmark size={15} /> },
    { id: 'cancelReplace', label: 'Cancel & Replace', icon: <AlertTriangle size={15} /> },
    { id: 'premiumIntro', label: 'Premium Intro', icon: <DollarSign size={15} /> },
    { id: 'blueCardTexts', label: 'Blue Card Texts', icon: <Shield size={15} /> },
    { id: 'tcTemplates', label: 'T&C Templates', icon: <FileCheck size={15} /> },
    { id: 'signatures', label: 'Signatures', icon: <PenTool size={15} /> },
    { id: 'qrVerification', label: 'QR Verification', icon: <QrCode size={15} /> },
    { id: 'commissions', label: 'Commissions', icon: <Percent size={15} /> },
  ],
  pi: [
    { id: 'piOpening', label: 'Opening Clause', icon: <BookOpen size={15} /> },
    { id: 'piClosing', label: 'Closing Text', icon: <FileText size={15} /> },
    { id: 'piNotice', label: 'Important Notice', icon: <AlertTriangle size={15} /> },
    { id: 'piPremiumIntro', label: 'Premium Intro', icon: <DollarSign size={15} /> },
  ],
  hull: [
    { id: 'hullOpening', label: 'Opening Clause', icon: <BookOpen size={15} /> },
    { id: 'hullClosing', label: 'Closing Text', icon: <FileText size={15} /> },
    { id: 'hullNotice', label: 'Important Notice', icon: <AlertTriangle size={15} /> },
    { id: 'hullPremiumIntro', label: 'Premium Intro', icon: <DollarSign size={15} /> },
  ],
  war: [
    { id: 'warOpening', label: 'Opening Clause', icon: <BookOpen size={15} /> },
    { id: 'warClosing', label: 'Closing Text', icon: <FileText size={15} /> },
    { id: 'warNotice', label: 'Important Notice', icon: <AlertTriangle size={15} /> },
    { id: 'warPremiumIntro', label: 'Premium Intro', icon: <DollarSign size={15} /> },
  ],
}

export default function PolicySettings() {
  const [activeCategory, setActiveCategory] = useState<PolicySettingsCategory>('general')
  const [activeTab, setActiveTab] = useState<PolicySettingsTab>('fontSize')
  const { showSuccess, showError } = useToast()
  const { theme } = useTheme()
  const { hasPermission } = useAuth()
  const isLight = theme === 'light'
  const canSettings = hasPermission('admin:settings')

  const handleCategoryChange = (cat: PolicySettingsCategory) => {
    setActiveCategory(cat)
    setActiveTab(CATEGORY_TABS[cat][0].id)
  }

  const catColor = CATEGORIES.find(c => c.id === activeCategory)?.color || 'var(--accent-primary)'

  return (
    <div>
      {/* Category selector */}
      <div style={{
        display: 'flex',
        gap: '2px',
        marginBottom: '16px',
        background: isLight ? '#e8eaf0' : 'rgba(255,255,255,0.06)',
        borderRadius: '10px',
        padding: '3px',
        width: 'fit-content'
      }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => handleCategoryChange(cat.id)}
            style={{
              padding: '8px 22px',
              borderRadius: '8px',
              border: 'none',
              background: activeCategory === cat.id
                ? (isLight ? '#ffffff' : 'rgba(255,255,255,0.12)')
                : 'transparent',
              color: activeCategory === cat.id ? cat.color : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: activeCategory === cat.id ? 600 : 400,
              boxShadow: activeCategory === cat.id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Tab chips filtered by category */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {CATEGORY_TABS[activeCategory].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: activeTab === t.id ? `1px solid ${catColor}` : '1px solid var(--glass-border)',
              background: activeTab === t.id ? `${catColor}1f` : 'transparent',
              color: activeTab === t.id ? catColor : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: activeTab === t.id ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {!canSettings && (
        <div style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', background: 'rgba(255, 180, 0, 0.1)', border: '1px solid rgba(255, 180, 0, 0.3)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
          You do not have permission to modify policy settings. Viewing in read-only mode.
        </div>
      )}
      <fieldset disabled={!canSettings} style={{ border: 'none', padding: 0, margin: 0 }}>
        {activeTab === 'fontSize' && <FontSizeTab showSuccess={showSuccess} />}
        {activeTab === 'timezones' && <TimezonesTab showSuccess={showSuccess} />}
        {activeTab === 'pageNumbering' && <PageNumberingTab showSuccess={showSuccess} />}
        {activeTab === 'footerText' && <FooterTextTab showSuccess={showSuccess} />}
        {activeTab === 'headerTitles' && <HeaderTitlesTab showSuccess={showSuccess} />}
        {activeTab === 'banks' && <BanksTab showSuccess={showSuccess} showError={showError} />}
        {activeTab === 'cancelReplace' && <CancelReplaceTab showSuccess={showSuccess} />}
        {activeTab === 'premiumIntro' && <PremiumIntroTab showSuccess={showSuccess} />}
        {activeTab === 'blueCardTexts' && <BlueCardTextsTab showSuccess={showSuccess} />}
        {activeTab === 'tcTemplates' && <TcTemplatesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
        {activeTab === 'signatures' && <SignaturesTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
        {activeTab === 'qrVerification' && <QrVerificationTab showSuccess={showSuccess} />}
        {activeTab === 'commissions' && <CommissionsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
        {activeTab === 'piOpening' && <RichTextSettingTab settingKey="policy_text_P_openingClause" label="P&I Opening Clause" description="The opening clause text for P&I policy documents." showSuccess={showSuccess} />}
        {activeTab === 'piClosing' && <RichTextSettingTab settingKey="policy_text_P_closingText" label="P&I Closing Text" description="The closing section text for P&I policy documents." showSuccess={showSuccess} />}
        {activeTab === 'piNotice' && <RichTextSettingTab settingKey="policy_text_P_importantNotice" label="P&I Important Notice" description="The important notice section for P&I policy documents." showSuccess={showSuccess} />}
        {activeTab === 'piPremiumIntro' && <RichTextSettingTab settingKey="policy_text_P_premiumIntro" label="P&I Premium Intro" description="The premium introduction text for P&I policy documents. Use placeholders: {currency}, {amount}, {instalments}, {time}, {timezone}." showSuccess={showSuccess} />}
        {activeTab === 'hullOpening' && <RichTextSettingTab settingKey="policy_text_H_openingClause" label="Hull Opening Clause" description="The opening clause text for Hull policy documents." showSuccess={showSuccess} />}
        {activeTab === 'hullClosing' && <RichTextSettingTab settingKey="policy_text_H_closingText" label="Hull Closing Text" description="The closing section text for Hull policy documents." showSuccess={showSuccess} />}
        {activeTab === 'hullNotice' && <RichTextSettingTab settingKey="policy_text_H_importantNotice" label="Hull Important Notice" description="The important notice section for Hull policy documents." showSuccess={showSuccess} />}
        {activeTab === 'hullPremiumIntro' && <RichTextSettingTab settingKey="policy_text_H_premiumIntro" label="Hull Premium Intro" description="The premium introduction text for Hull policy documents. Use placeholders: {currency}, {amount}, {instalments}, {time}, {timezone}." showSuccess={showSuccess} />}
        {activeTab === 'warOpening' && <RichTextSettingTab settingKey="policy_text_W_openingClause" label="War Opening Clause" description="The opening clause text for War Risk policy documents." showSuccess={showSuccess} />}
        {activeTab === 'warClosing' && <RichTextSettingTab settingKey="policy_text_W_closingText" label="War Closing Text" description="The closing section text for War Risk policy documents." showSuccess={showSuccess} />}
        {activeTab === 'warNotice' && <RichTextSettingTab settingKey="policy_text_W_importantNotice" label="War Important Notice" description="The important notice section for War Risk policy documents." showSuccess={showSuccess} />}
        {activeTab === 'warPremiumIntro' && <RichTextSettingTab settingKey="policy_text_W_premiumIntro" label="War Premium Intro" description="The premium introduction text for War Risk policy documents. Use placeholders: {currency}, {amount}, {instalments}, {time}, {timezone}." showSuccess={showSuccess} />}
      </fieldset>
    </div>
  )
}

// ==================== Font Size Tab ====================
function FontSizeTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const [fontSize, setFontSize] = useState(10)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policy_font_size')
        if (raw) setFontSize(parseInt(raw, 10) || 10)
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleChange = async (pt: number) => {
    setFontSize(pt)
    await window.api.setSetting('policy_font_size', String(pt))
    showSuccess(`Font size set to ${pt}pt`)
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Export Font Size</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Font size for policy, debit advice, and credit advice documents (in points).
      </p>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {[8, 9, 10, 11, 12].map(pt => (
          <button
            key={pt}
            onClick={() => handleChange(pt)}
            style={{
              padding: '6px 16px', borderRadius: '8px', fontSize: '0.84rem', fontWeight: 600,
              border: fontSize === pt ? '2px solid var(--accent-primary)' : '1px solid var(--input-border)',
              background: fontSize === pt ? 'rgba(0,170,200,0.1)' : 'transparent',
              color: fontSize === pt ? 'var(--accent-primary)' : 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            {pt}pt
          </button>
        ))}
      </div>
    </div>
  )
}

// ==================== Timezones Tab ====================
function TimezonesTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const [timezones, setTimezones] = useState<string[]>([])
  const [newTz, setNewTz] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadTimezones() }, [])

  const loadTimezones = async () => {
    setLoading(true)
    try {
      const raw = await window.api.getSetting('policy_timezones')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setTimezones(parsed)
      }
      if (!raw) setTimezones(['Lebanon Standard Time', 'Lebanon Local Standard Time', 'GMT', 'UTC'])
    } catch { setTimezones(['Lebanon Standard Time', 'GMT', 'UTC']) }
    finally { setLoading(false) }
  }

  const save = async (updated: string[]) => {
    setTimezones(updated)
    await window.api.setSetting('policy_timezones', JSON.stringify(updated))
    showSuccess('Timezones saved')
  }

  const handleAdd = () => {
    if (!newTz.trim() || timezones.includes(newTz.trim())) return
    save([...timezones, newTz.trim()])
    setNewTz('')
  }

  const handleRemove = (tz: string) => save(timezones.filter(t => t !== tz))

  const handleMove = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= timezones.length) return
    const updated = [...timezones]
    ;[updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]]
    save(updated)
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Timezones</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Timezone options available when converting quotations to policies.
      </p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          value={newTz}
          onChange={e => setNewTz(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="Add timezone (e.g. Central European Time)"
          style={{ flex: 1 }}
        />
        <button onClick={handleAdd} className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.82rem' }}>
          <Plus size={14} /> Add
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {timezones.map((tz, idx) => (
          <div key={tz} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '6px',
            border: '1px solid var(--table-border)',
            background: idx === 0 ? 'rgba(0,170,200,0.06)' : 'transparent'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <button onClick={() => handleMove(idx, -1)} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={12} /></button>
              <button onClick={() => handleMove(idx, 1)} disabled={idx === timezones.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', opacity: idx === timezones.length - 1 ? 0.3 : 1 }}><ChevronDown size={12} /></button>
            </div>
            <span style={{ flex: 1, fontSize: '0.9rem' }}>{tz}</span>
            {idx === 0 && <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)', fontWeight: 600 }}>DEFAULT</span>}
            <button onClick={() => handleRemove(tz)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      {timezones.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px' }}>No timezones configured</p>}
    </div>
  )
}

// ==================== Page Numbering Tab ====================
function PageNumberingTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const defaultPageMap: Record<string, Record<string, number>> = { P: { '3': 30, '4': 31, '5': 32, '6': 33 }, H: { '3': 28, '4': 29, '5': 30 }, W: { '3': 25, '4': 26 } }
  const typeLabels: Record<string, string> = { P: 'P&I', H: 'Hull', W: 'War' }

  const [pageCountMap, setPageCountMap] = useState(defaultPageMap)
  const [newPageType, setNewPageType] = useState('P')
  const [newPageCount, setNewPageCount] = useState('')
  const [newTotalPages, setNewTotalPages] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policyExportSettings')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.pageCountMap) setPageCountMap({ ...defaultPageMap, ...parsed.pageCountMap })
        }
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const save = async (updated: Record<string, Record<string, number>>) => {
    setPageCountMap(updated)
    // Load existing settings and merge
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      const existing = raw ? JSON.parse(raw) : {}
      await window.api.setSetting('policyExportSettings', JSON.stringify({ ...existing, pageCountMap: updated }))
      showSuccess('Page numbering saved')
    } catch {
      await window.api.setSetting('policyExportSettings', JSON.stringify({ pageCountMap: updated }))
      showSuccess('Page numbering saved')
    }
  }

  const addPageCountRow = () => {
    if (!newPageCount || !newTotalPages) return
    const updated = { ...pageCountMap }
    if (!updated[newPageType]) updated[newPageType] = {}
    updated[newPageType][newPageCount] = parseInt(newTotalPages, 10)
    save(updated)
    setNewPageCount('')
    setNewTotalPages('')
  }

  const removePageCountRow = (type: string, pages: string) => {
    const updated = { ...pageCountMap }
    if (updated[type]) {
      delete updated[type][pages]
      if (Object.keys(updated[type]).length === 0) delete updated[type]
    }
    save(updated)
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Page Count Mapping</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Map policy page count to total pages (including attached terms &amp; conditions). Used in footer &quot;Page X of Y&quot;.
      </p>
      <div style={{ marginBottom: '12px' }}>
        {Object.entries(pageCountMap).sort().map(([type, mapping]) => (
          <div key={type} style={{ marginBottom: '8px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--accent-primary)' }}>{typeLabels[type] || type}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
              {Object.entries(mapping).sort(([a], [b]) => Number(a) - Number(b)).map(([pages, total]) => (
                <span key={pages} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px', borderRadius: '6px', fontSize: '0.8rem', border: '1px solid var(--input-border)', background: 'rgba(0,170,200,0.05)' }}>
                  {pages} pg → {total}
                  <button onClick={() => removePageCountRow(type, pages)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>x</button>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select value={newPageType} onChange={e => setNewPageType(e.target.value)} style={{ width: '80px' }}>
          {Object.entries(typeLabels).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
        </select>
        <input type="number" value={newPageCount} onChange={e => setNewPageCount(e.target.value)} placeholder="Pages" style={{ width: '70px' }} min={1} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>&rarr;</span>
        <input type="number" value={newTotalPages} onChange={e => setNewTotalPages(e.target.value)} placeholder="Total" style={{ width: '70px' }} min={1} />
        <button onClick={addPageCountRow} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Add</button>
      </div>
    </div>
  )
}

// ==================== Footer Text Tab ====================
function FooterTextTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const [footerText, setFooterText] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policyExportSettings')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.footerText) setFooterText(parsed.footerText)
        }
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      const existing = raw ? JSON.parse(raw) : {}
      await window.api.setSetting('policyExportSettings', JSON.stringify({ ...existing, footerText }))
      showSuccess('Footer text saved')
    } catch {
      await window.api.setSetting('policyExportSettings', JSON.stringify({ footerText }))
      showSuccess('Footer text saved')
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Footer Text</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Optional text displayed above the page number in the footer.
      </p>
      <RichTextEditor
        value={footerText}
        onChange={setFooterText}
        minHeight={60}
      />
      <button className="btn-primary" onClick={handleSave} style={{ marginTop: '12px', padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ==================== Header Titles Tab ====================
function HeaderTitlesTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const defaultTitles: Record<string, string> = { P: 'Protection and Indemnity Certificate', H: 'Hull & Machinery Certificate', W: 'War Risk Certificate' }
  const typeLabels: Record<string, string> = { P: 'P&I', H: 'Hull', W: 'War' }

  const [headerTitles, setHeaderTitles] = useState(defaultTitles)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policyExportSettings')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.headerTitles) setHeaderTitles({ ...defaultTitles, ...parsed.headerTitles })
        }
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      const existing = raw ? JSON.parse(raw) : {}
      await window.api.setSetting('policyExportSettings', JSON.stringify({ ...existing, headerTitles }))
      showSuccess('Header titles saved')
    } catch {
      await window.api.setSetting('policyExportSettings', JSON.stringify({ headerTitles }))
      showSuccess('Header titles saved')
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Header Titles</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Title shown in the header of each policy type document, followed by the policy number.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {Object.entries(typeLabels).map(([code, label]) => (
          <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '50px' }}>{label}:</span>
            <input
              type="text"
              value={headerTitles[code] || ''}
              onChange={e => setHeaderTitles({ ...headerTitles, [code]: e.target.value })}
              style={{ flex: 1 }}
            />
          </div>
        ))}
      </div>
      <button className="btn-primary" onClick={handleSave} style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ==================== Banks Tab ====================
function BanksTab({ showSuccess, showError }: { showSuccess: (msg: string) => void; showError: (msg: string) => void }) {
  const [banks, setBanks] = useState<{ id: string; name: string; details: string; order: number }[]>([])
  const [newBankName, setNewBankName] = useState('')
  const [newBankDetails, setNewBankDetails] = useState('')
  const [editingBankId, setEditingBankId] = useState<string | null>(null)
  const [editBankName, setEditBankName] = useState('')
  const [editBankDetails, setEditBankDetails] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadBanks() }, [])

  const loadBanks = async () => {
    setLoading(true)
    try {
      const data = await window.api.bankGetAll()
      if (Array.isArray(data)) setBanks(data)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newBankName.trim()) return
    try {
      await window.api.bankAdd(newBankName.trim(), newBankDetails.trim())
      setNewBankName('')
      setNewBankDetails('')
      await loadBanks()
      showSuccess('Bank added')
    } catch (err: any) {
      showError(err.message || 'Failed to add bank')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await window.api.bankDelete(id)
      await loadBanks()
      showSuccess('Bank deleted')
    } catch (err: any) {
      showError(err.message || 'Failed to delete bank')
    }
  }

  const startEditing = (bank: { id: string; name: string; details: string }) => {
    setEditingBankId(bank.id)
    setEditBankName(bank.name)
    setEditBankDetails(bank.details || '')
  }

  const saveEdit = async (id: string) => {
    if (!editBankName.trim()) return
    try {
      await window.api.bankUpdate(id, { name: editBankName.trim(), details: editBankDetails.trim() })
      setEditingBankId(null)
      await loadBanks()
      showSuccess('Bank updated')
    } catch (err: any) {
      showError(err.message || 'Failed to update bank')
    }
  }

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newOrder = [...banks]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= newOrder.length) return
    ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
    setBanks(newOrder)
    try {
      await window.api.bankReorder(newOrder.map(b => b.id))
    } catch { /* ignore */ }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Banks</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Manage bank accounts used for policy documents and quotation exports.
      </p>

      <form onSubmit={handleAdd} style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
          <input
            type="text"
            value={newBankName}
            onChange={e => setNewBankName(e.target.value)}
            placeholder="Bank name"
            style={{ flex: 1 }}
            aria-label="Bank name"
          />
          <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Plus size={18} /> Add Bank
          </button>
        </div>
        <textarea
          value={newBankDetails}
          onChange={e => setNewBankDetails(e.target.value)}
          placeholder="Bank details (IBAN, SWIFT, address, etc.)"
          rows={3}
          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </form>

      {banks.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {banks.map((bank, index) => (
            <div
              key={bank.id}
              style={{
                padding: '14px 16px', borderRadius: '10px',
                border: '1px solid var(--table-border)',
                background: editingBankId === bank.id ? 'rgba(0,210,255,0.04)' : 'transparent'
              }}
            >
              {editingBankId === bank.id ? (
                <div>
                  <input
                    type="text"
                    value={editBankName}
                    onChange={e => setEditBankName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit(bank.id)}
                    autoFocus
                    style={{ width: '100%', marginBottom: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                    aria-label="Edit bank name"
                  />
                  <textarea
                    value={editBankDetails}
                    onChange={e => setEditBankDetails(e.target.value)}
                    rows={3}
                    style={{ width: '100%', marginBottom: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => saveEdit(bank.id)} className="btn-primary" style={{ fontSize: '0.82rem', padding: '4px 12px' }}>Save</button>
                    <button onClick={() => setEditingBankId(null)} className="btn-secondary" style={{ fontSize: '0.82rem', padding: '4px 12px' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <button onClick={() => handleMove(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                    <button onClick={() => handleMove(index, 'down')} disabled={index === banks.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === banks.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === banks.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{bank.name}</div>
                    {bank.details && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', marginTop: '4px' }}>{bank.details}</div>}
                  </div>
                  <button onClick={() => startEditing(bank)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: '4px' }} title="Edit"><Clock size={14} /></button>
                  <button onClick={() => handleDelete(bank.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }} title="Delete"><Trash2 size={14} /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {banks.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px' }}>No banks configured yet. Add one above.</p>}
    </div>
  )
}

// ==================== Cancel & Replace Tab ====================
function CancelReplaceTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const [templates, setTemplates] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  const typeLabels: Record<string, string> = { P: 'P&I', H: 'Hull', W: 'War' }

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policy_cancel_replace_templates')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (typeof parsed === 'object') setTemplates(parsed)
        }
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    await window.api.setSetting('policy_cancel_replace_templates', JSON.stringify(templates))
    showSuccess('Cancel & Replace templates saved')
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Cancel &amp; Replace Text Templates</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Default cancel and replace text templates per policy type. Use {'{{policyNumber}}'} as a placeholder for the previous policy number.
      </p>
      {Object.entries(typeLabels).map(([code, label]) => (
        <div key={code} style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px', display: 'block' }}>{label}</label>
          <RichTextEditor
            value={templates[code] || ''}
            onChange={val => setTemplates(prev => ({ ...prev, [code]: val }))}
            minHeight={60}
          />
        </div>
      ))}
      <button className="btn-primary" onClick={handleSave} style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ==================== Premium Intro Tab ====================
function PremiumIntroTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const [premiumIntroText, setPremiumIntroText] = useState('Premium {currency} {amount} shall be payable in {instalments} Instalments on the following dates, at {time} {timezone}, time being of the essence:')
  const [premiumIntroSingleText, setPremiumIntroSingleText] = useState('Premium of {currency} {amount} shall be payable on {date} as per attached debit note, at {time} {timezone}, time being of the essence.')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policyExportSettings')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.premiumIntroText) setPremiumIntroText(parsed.premiumIntroText)
          if (parsed.premiumIntroSingleText) setPremiumIntroSingleText(parsed.premiumIntroSingleText)
        }
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      const existing = raw ? JSON.parse(raw) : {}
      await window.api.setSetting('policyExportSettings', JSON.stringify({ ...existing, premiumIntroText, premiumIntroSingleText }))
      showSuccess('Premium intro text saved')
    } catch {
      await window.api.setSetting('policyExportSettings', JSON.stringify({ premiumIntroText, premiumIntroSingleText }))
      showSuccess('Premium intro text saved')
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Multiple Instalments</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        Used when 2+ instalments. Placeholders: {'{currency}'}, {'{amount}'}, {'{instalments}'}, {'{time}'}, {'{timezone}'}
      </p>
      <textarea
        value={premiumIntroText}
        onChange={e => setPremiumIntroText(e.target.value)}
        rows={3}
        style={{ width: '100%', marginBottom: '20px', resize: 'vertical' }}
      />

      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Single Instalment</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
        Used when 1 instalment. Placeholders: {'{currency}'}, {'{amount}'}, {'{date}'}, {'{time}'}, {'{timezone}'}
      </p>
      <textarea
        value={premiumIntroSingleText}
        onChange={e => setPremiumIntroSingleText(e.target.value)}
        rows={3}
        style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }}
      />

      <button className="btn-primary" onClick={handleSave} style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ==================== Blue Card Texts Tab ====================

interface BcTextFieldDef {
  key: keyof typeof BC_DEFAULTS
  label: string
  rows: number
}

const BC_CARD_SECTIONS: { cardType: string; color: string; fields: BcTextFieldDef[] }[] = [
  {
    cardType: 'BBC (Bunker)',
    color: '#00aac8',
    fields: [
      { key: 'bc_text_BBC_title', label: 'Title', rows: 3 },
      { key: 'bc_text_BBC_certify', label: 'Certification Text', rows: 4 },
      { key: 'bc_text_BBC_cancel', label: 'Cancellation Text', rows: 4 },
    ],
  },
  {
    cardType: 'WRC (Wreck Removal)',
    color: '#6464ff',
    fields: [
      { key: 'bc_text_WRC_title', label: 'Title', rows: 3 },
      { key: 'bc_text_WRC_certify', label: 'Certification Text', rows: 4 },
      { key: 'bc_text_WRC_cancel', label: 'Cancellation Text', rows: 4 },
    ],
  },
  {
    cardType: 'MLC 4.2',
    color: '#ff64c8',
    fields: [
      { key: 'bc_text_MLC42_title', label: 'Title', rows: 3 },
      { key: 'bc_text_MLC42_certify', label: 'Certification Text', rows: 4 },
      { key: 'bc_text_MLC42_cancel', label: 'Cancellation Text', rows: 4 },
    ],
  },
  {
    cardType: 'MLC 2.5.2',
    color: '#ffb020',
    fields: [
      { key: 'bc_text_MLC252_title', label: 'Title', rows: 3 },
      { key: 'bc_text_MLC252_certify', label: 'Certification Text', rows: 4 },
      { key: 'bc_text_MLC252_cancel', label: 'Cancellation Text', rows: 4 },
    ],
  },
]

const BC_CONTACT_FIELDS: BcTextFieldDef[] = [
  { key: 'bc_mlc_company_address', label: 'Company Address (for MLC cards)', rows: 3 },
  { key: 'bc_mlc_website', label: 'Company Website (for MLC cards)', rows: 1 },
  { key: 'bc_mlc_email', label: 'MLC Contact Email', rows: 1 },
  { key: 'bc_mlc_phone', label: 'MLC Contact Phone (one per line for multiple)', rows: 2 },
]

function BlueCardTextsTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const result: Record<string, string> = {}
      const keys = Object.keys(BC_DEFAULTS) as (keyof typeof BC_DEFAULTS)[]
      await Promise.all(keys.map(async (key) => {
        try {
          const val = await window.api.getSetting(key)
          result[key] = val || BC_DEFAULTS[key]
        } catch {
          result[key] = BC_DEFAULTS[key]
        }
      }))
      setValues(result)
      setLoading(false)
    })()
  }, [])

  const handleSave = async () => {
    const keys = Object.keys(values)
    await Promise.all(keys.map(async (key) => {
      try {
        await window.api.setSetting(key, values[key])
      } catch { /* ignore */ }
    }))
    showSuccess('Blue card texts saved')
  }

  const handleReset = (key: string) => {
    setValues(prev => ({ ...prev, [key]: BC_DEFAULTS[key as keyof typeof BC_DEFAULTS] }))
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Blue Card Texts</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Configurable text content for BBC, WRC, and MLC blue card DOCX exports.
        For BBC/WRC title fields, use line breaks to separate &quot;CERTIFICATE OF INSURANCE&quot;, &quot;PURSUANT&quot;, and the convention reference.
      </p>

      {/* MLC Contact / Company Info */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        borderRadius: '10px',
        border: '1px solid var(--glass-border)',
        background: isLight ? '#f8f9fc' : 'rgba(255,255,255,0.03)'
      }}>
        <h5 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', color: 'var(--accent-primary)' }}>
          MLC Contact & Company Info
        </h5>
        {BC_CONTACT_FIELDS.map(f => (
          <div key={f.key} style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>{f.label}</label>
              <button
                onClick={() => handleReset(f.key)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.72rem' }}
              >
                Reset
              </button>
            </div>
            <textarea
              value={values[f.key] || ''}
              onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
              rows={f.rows}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>
        ))}
      </div>

      {/* Per-card-type sections */}
      {BC_CARD_SECTIONS.map(section => (
        <div key={section.cardType} style={{
          marginBottom: '24px',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid var(--glass-border)',
          borderLeft: `3px solid ${section.color}`,
          background: isLight ? '#f8f9fc' : 'rgba(255,255,255,0.03)'
        }}>
          <h5 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '12px', color: section.color }}>
            {section.cardType}
          </h5>
          {section.fields.map(f => (
            <div key={f.key} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>{f.label}</label>
                <button
                  onClick={() => handleReset(f.key)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.72rem' }}
                >
                  Reset to default
                </button>
              </div>
              <textarea
                value={values[f.key] || ''}
                onChange={e => setValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                rows={f.rows}
                style={{ width: '100%', resize: 'vertical' }}
              />
            </div>
          ))}
        </div>
      ))}

      <button className="btn-primary" onClick={handleSave} style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save All
      </button>
    </div>
  )
}

// ==================== T&C Templates Tab ====================
const TC_TYPE_LABELS: Record<string, string> = {
  P: 'P&I',
  H: 'H&M',
  W: 'War Risk',
  F: 'FDD',
  L: 'Loss of Hire'
}

function TcTemplatesTab({ showSuccess, showError, isLight }: { showSuccess: (msg: string) => void; showError: (msg: string) => void; isLight: boolean }) {
  const [templates, setTemplates] = useState<Array<{ id: string; typeCode: string; fileName: string; pageCount: number; uploadedAt: string }>>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)

  const loadTemplates = async () => {
    try {
      const result = await window.api.tcGetAllTemplates()
      if (Array.isArray(result)) setTemplates(result)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { loadTemplates() }, [])

  const handleUpload = async (typeCode: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.docx'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return

      setUploading(typeCode)
      try {
        const arrayBuffer = await file.arrayBuffer()
        const fileData = Array.from(new Uint8Array(arrayBuffer))
        const result = await window.api.tcUpload({ typeCode, fileName: file.name, fileData })
        if (result && !(result as any).error) {
          showSuccess(`T&C template uploaded for ${TC_TYPE_LABELS[typeCode] || typeCode}`)
          await loadTemplates()
        } else {
          showError((result as any)?.message || 'Upload failed')
        }
      } catch (err: any) {
        showError(err.message || 'Upload failed')
      } finally {
        setUploading(null)
      }
    }
    input.click()
  }

  const handleDelete = async (typeCode: string) => {
    try {
      await window.api.tcDelete(typeCode)
      showSuccess(`T&C template removed for ${TC_TYPE_LABELS[typeCode] || typeCode}`)
      await loadTemplates()
    } catch (err: any) {
      showError(err.message || 'Delete failed')
    }
  }

  const handleDownload = async (typeCode: string, fileName: string) => {
    try {
      const fileData = await window.api.tcGetTemplateFile(typeCode)
      if (!fileData) { showError('Template file not found'); return }
      const blob = new Blob([new Uint8Array(fileData)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      showError(err.message || 'Download failed')
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  const typeCodes = Object.keys(TC_TYPE_LABELS)

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>Terms & Conditions Templates</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
        Upload a Word document (.docx) per policy type. When exporting a policy as PDF + T&C,
        the template will be appended with correct page numbering.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {typeCodes.map(tc => {
          const tmpl = templates.find(t => t.typeCode === tc)
          const isUploading = uploading === tc

          return (
            <div key={tc} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: '10px',
              background: isLight ? '#f4f6fb' : 'rgba(255,255,255,0.04)',
              border: '1px solid var(--glass-border)'
            }}>
              {/* Type label */}
              <div style={{
                minWidth: '80px',
                fontWeight: 600,
                fontSize: '0.88rem',
                color: tc === 'P' ? '#6464ff' : tc === 'H' ? '#ff64c8' : tc === 'W' ? '#ffb020' : 'var(--text-primary)'
              }}>
                {TC_TYPE_LABELS[tc]}
              </div>

              {tmpl ? (
                <>
                  {/* File info */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{tmpl.fileName}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Uploaded {new Date(tmpl.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Download button */}
                  <button
                    onClick={() => handleDownload(tc, tmpl.fileName)}
                    title="Download template"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <FileText size={16} />
                  </button>

                  {/* Replace button */}
                  <button
                    onClick={() => handleUpload(tc)}
                    disabled={isUploading}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '6px',
                      border: '1px solid var(--glass-border)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {isUploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Replace
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(tc)}
                    title="Remove template"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--danger)',
                      cursor: 'pointer',
                      padding: '6px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <div style={{ flex: 1, fontSize: '0.83rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    No template uploaded
                  </div>
                  <button
                    onClick={() => handleUpload(tc)}
                    disabled={isUploading}
                    className="btn-primary"
                    style={{
                      padding: '5px 14px',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    {isUploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Upload
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ==================== Rich Text Setting Tab (reusable) ====================
function RichTextSettingTab({ settingKey, label, description, showSuccess }: { settingKey: string; label: string; description: string; showSuccess: (msg: string) => void }) {
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting(settingKey)
        if (raw) setValue(raw)
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [settingKey])

  const handleSave = async () => {
    await window.api.setSetting(settingKey, value)
    showSuccess(`${label} saved`)
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>{label}</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        {description}
      </p>
      <RichTextEditor
        value={value}
        onChange={setValue}
        minHeight={120}
      />
      <button className="btn-primary" onClick={handleSave} style={{ marginTop: '12px', padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ==================== Signatures Tab ====================
function SignaturesTab({ showSuccess, showError, isLight }: { showSuccess: (msg: string) => void; showError: (msg: string) => void; isLight: boolean }) {
  const [signatures, setSignatures] = useState<Array<{ id: string; userId: string; fileName: string; uploadedAt: string; username: string }>>([])
  const [users, setUsers] = useState<Array<{ id: string; username: string }>>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [previewData, setPreviewData] = useState<Record<string, string>>({})

  const loadData = async () => {
    setLoading(true)
    try {
      const [sigs, allUsers] = await Promise.all([
        window.api.signatureGetAll(),
        window.api.getUsers()
      ])
      if (Array.isArray(sigs)) setSignatures(sigs)
      if (Array.isArray(allUsers)) setUsers(allUsers.map((u: any) => ({ id: u.id, username: u.username })))

      // Load preview images for each signature
      const previews: Record<string, string> = {}
      for (const sig of (Array.isArray(sigs) ? sigs : [])) {
        try {
          const full = await window.api.signatureGetForUser(sig.userId)
          if (full?.imageData) {
            const imgData = full.imageData as any
            const arr = Array.isArray(imgData) ? imgData : (imgData.data || Object.values(imgData))
            const bytes = new Uint8Array(arr)
            let base64 = ''
            const chunk = 8192
            for (let i = 0; i < bytes.length; i += chunk) {
              base64 += String.fromCharCode(...bytes.subarray(i, i + chunk))
            }
            const ext = sig.fileName?.toLowerCase()?.endsWith('.jpg') || sig.fileName?.toLowerCase()?.endsWith('.jpeg') ? 'image/jpeg' : 'image/png'
            previews[sig.userId] = `data:${ext};base64,${btoa(base64)}`
          }
        } catch { /* skip */ }
      }
      setPreviewData(previews)
    } catch (err: any) {
      showError(err.message || 'Failed to load signatures')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const handleUpload = async (userId: string) => {
    setUploading(userId)
    try {
      const result = await window.api.dialogOpenImageFile()
      if (!result) { setUploading(null); return }
      const uploadResult = await window.api.signatureUploadForUser(userId, result.filePath)
      if (uploadResult && (uploadResult as any).error) {
        showError((uploadResult as any).message || 'Failed to upload')
        return
      }
      showSuccess('Signature uploaded')
      await loadData()
    } catch (err: any) {
      showError(err.message || 'Failed to upload signature')
    } finally {
      setUploading(null)
    }
  }

  const handleDelete = async (userId: string) => {
    try {
      await window.api.signatureDeleteForUser(userId)
      showSuccess('Signature deleted')
      await loadData()
    } catch (err: any) {
      showError(err.message || 'Failed to delete signature')
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  const sigMap = new Map(signatures.map(s => [s.userId, s]))

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>User Signatures</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Manage digital signatures for policy signing. Upload PNG or JPG images (transparent background recommended).
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {users.map(u => {
          const sig = sigMap.get(u.id)
          const preview = previewData[u.id]
          return (
            <div key={u.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '12px 16px',
              background: isLight ? '#f4f6fb' : 'rgba(255,255,255,0.04)',
              borderRadius: '10px',
              border: '1px solid var(--glass-border)'
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                background: sig ? '#22c55e' : 'var(--text-secondary)',
                opacity: sig ? 1 : 0.3
              }} title={sig ? 'Signature uploaded' : 'No signature'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {u.username}
                  {sig ? (
                    <span style={{ fontSize: '0.68rem', padding: '1px 8px', borderRadius: '8px', background: 'rgba(34,197,94,0.1)', color: '#22c55e', fontWeight: 600 }}>UPLOADED</span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', padding: '1px 8px', borderRadius: '8px', background: 'rgba(128,128,128,0.1)', color: 'var(--text-secondary)', fontWeight: 600 }}>NO SIGNATURE</span>
                  )}
                </div>
                {sig && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {sig.fileName} &middot; uploaded {new Date(sig.uploadedAt).toLocaleDateString()}
                  </div>
                )}
              </div>

              {preview && (
                <div style={{
                  width: '150px',
                  height: '60px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: isLight ? '#ffffff' : 'rgba(255,255,255,0.06)',
                  borderRadius: '8px',
                  border: '1px solid var(--glass-border)',
                  overflow: 'hidden'
                }}>
                  <img src={preview} alt="Signature" style={{ maxWidth: '140px', maxHeight: '54px', objectFit: 'contain' }} />
                </div>
              )}

              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                  onClick={() => handleUpload(u.id)}
                  disabled={uploading === u.id}
                >
                  {uploading === u.id ? <Loader2 size={14} className="spinning" /> : <Upload size={14} />}
                  {sig ? 'Replace' : 'Upload'}
                </button>
                {sig && (
                  <button
                    className="btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '0.78rem', color: 'var(--danger)' }}
                    onClick={() => handleDelete(u.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ==================== QR Verification Tab ====================
function QrVerificationTab({ showSuccess }: { showSuccess: (msg: string) => void }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('qr_verification_url')
        if (raw) setUrl(raw)
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    await window.api.setSetting('qr_verification_url', url)
    showSuccess('QR verification URL saved')
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>QR Code Verification</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Configure the base URL for policy verification QR codes. The policy number will be appended to generate the full verification URL.
        A QR code and verification link will be embedded on the closing page of exported policy documents.
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
          Verification URL Base
        </label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://your-domain.com/verify/"
          style={{
            width: '100%',
            maxWidth: '500px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid var(--input-border)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '0.88rem'
          }}
        />
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Example: If URL is <code>https://example.com/verify/</code> and policy is <code>P/PI/001</code>,
          the full link will be <code>https://example.com/verify/P/PI/001</code>
        </p>
      </div>

      <button className="btn-primary" onClick={handleSave} style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ==================== Commissions Tab ====================

function CommissionsTab({ showSuccess, showError, isLight }: { showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
  const [policyTypes, setPolicyTypes] = useState<{ id: string; name: string; code: string }[]>([])
  const [defaults, setDefaults] = useState<Record<string, number>>({})
  const [overrides, setOverrides] = useState<{ id: string; entityId: string; policyTypeId: string; commissionPercent: number; entityName?: string }[]>([])
  const [entities, setEntities] = useState<{ id: string; name: string }[]>([])
  const [newEntityId, setNewEntityId] = useState('')
  const [entitySearch, setEntitySearch] = useState('')
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    setLoading(true)
    try {
      const pt = await window.api.getQuotationTypes()
      if (Array.isArray(pt)) setPolicyTypes(pt.map((t: any) => ({ id: t.id, name: t.name, code: t.code })))
    } catch {}
    try {
      const cd = await window.api.commissionGetDefaults()
      if (Array.isArray(cd)) {
        const map: Record<string, number> = {}
        for (const d of cd) map[d.policyTypeId] = d.commissionPercent
        setDefaults(map)
      }
    } catch {}
    try {
      const co = await window.api.commissionGetOverrides()
      if (Array.isArray(co)) setOverrides(co)
    } catch {}
    try {
      const ents = await window.api.getEntities()
      if (Array.isArray(ents)) setEntities(ents.map((e: any) => ({ id: e.id, name: e.name })))
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const handleDefaultChange = async (policyTypeId: string, value: string) => {
    const pct = parseFloat(value)
    if (isNaN(pct)) return
    setDefaults(prev => ({ ...prev, [policyTypeId]: pct }))
    try {
      await window.api.commissionSetDefault(policyTypeId, pct)
      showSuccess('Default commission saved')
    } catch { showError('Failed to save') }
  }

  const handleAddOverride = async () => {
    if (!newEntityId) return
    try {
      for (const pt of policyTypes) {
        const exists = overrides.find(o => o.entityId === newEntityId && o.policyTypeId === pt.id)
        if (!exists) await window.api.commissionSetOverride(newEntityId, pt.id, defaults[pt.id] || 0)
      }
      showSuccess('Customer added')
      setNewEntityId('')
      setEntitySearch('')
      loadData()
    } catch { showError('Failed to add customer override') }
  }

  const handleOverrideChange = async (entityId: string, policyTypeId: string, value: string) => {
    const pct = parseFloat(value)
    if (isNaN(pct)) return
    setOverrides(prev => prev.map(o => o.entityId === entityId && o.policyTypeId === policyTypeId ? { ...o, commissionPercent: pct } : o))
    try { await window.api.commissionSetOverride(entityId, policyTypeId, pct) } catch { showError('Failed to save') }
  }

  const handleDeleteCustomer = async (entityId: string) => {
    try {
      for (const pt of policyTypes) await window.api.commissionDeleteOverride(entityId, pt.id)
      showSuccess('Customer override removed')
      loadData()
    } catch { showError('Failed to delete') }
  }

  if (loading) return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading...</div>

  const entityGroups = new Map<string, { entityId: string; entityName: string; rates: Record<string, number> }>()
  for (const o of overrides) {
    if (!entityGroups.has(o.entityId)) entityGroups.set(o.entityId, { entityId: o.entityId, entityName: o.entityName || 'Unknown', rates: {} })
    entityGroups.get(o.entityId)!.rates[o.policyTypeId] = o.commissionPercent
  }

  const filteredEntities = entities.filter(e => !entityGroups.has(e.id) && e.name.toLowerCase().includes(entitySearch.toLowerCase()))

  return (
    <div>
      <h3 style={{ fontSize: '1rem', margin: '0 0 4px' }}>Commission Rates</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>Default commission percentages per policy type. Customer-specific overrides below.</p>

      <div style={{ marginBottom: '28px' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>Default Rates</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
          {policyTypes.map(pt => (
            <div key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', minWidth: '180px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>{pt.name}</span>
              <input type="number" step="0.01" value={defaults[pt.id] ?? ''} onChange={e => setDefaults(prev => ({ ...prev, [pt.id]: parseFloat(e.target.value) || 0 }))} onBlur={e => handleDefaultChange(pt.id, e.target.value)} style={{ width: '70px', padding: '4px 6px', textAlign: 'right', fontSize: '0.85rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} placeholder="0" />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>%</span>
            </div>
          ))}
        </div>
      </div>

      <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: '10px' }}>Customer Overrides</label>
      {entityGroups.size > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--table-border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>Customer</th>
              {policyTypes.map(pt => (<th key={pt.id} style={{ textAlign: 'center', padding: '6px 10px', color: 'var(--text-secondary)', fontWeight: 500 }}>{pt.code || pt.name}</th>))}
              <th style={{ width: '40px' }} />
            </tr>
          </thead>
          <tbody>
            {Array.from(entityGroups.values()).map(eg => (
              <tr key={eg.entityId} style={{ borderBottom: '1px solid var(--table-border)' }}>
                <td style={{ padding: '6px 10px', fontWeight: 600 }}>{eg.entityName}</td>
                {policyTypes.map(pt => (
                  <td key={pt.id} style={{ padding: '6px 10px', textAlign: 'center' }}>
                    <input type="number" step="0.01" value={eg.rates[pt.id] ?? ''} onChange={e => handleOverrideChange(eg.entityId, pt.id, e.target.value)} onBlur={e => handleOverrideChange(eg.entityId, pt.id, e.target.value)} style={{ width: '60px', padding: '3px 6px', textAlign: 'right', fontSize: '0.82rem', borderRadius: '4px', border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)' }} placeholder={String(defaults[pt.id] || 0)} />
                  </td>
                ))}
                <td style={{ padding: '6px 4px', textAlign: 'center' }}><button onClick={() => handleDeleteCustomer(eg.entityId)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '2px' }}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <input type="text" value={entitySearch} onChange={e => { setEntitySearch(e.target.value); setNewEntityId('') }} placeholder="Search customer to add..." style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }} />
          {entitySearch && filteredEntities.length > 0 && !newEntityId && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, maxHeight: '200px', overflowY: 'auto', background: isLight ? '#fff' : '#1a1d28', border: '1px solid var(--input-border)', borderRadius: '6px', marginTop: '2px' }}>
              {filteredEntities.slice(0, 10).map(e => (
                <div key={e.id} onClick={() => { setNewEntityId(e.id); setEntitySearch(e.name) }} style={{ padding: '6px 10px', cursor: 'pointer', fontSize: '0.82rem' }} onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(0,170,200,0.1)')} onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>{e.name}</div>
              ))}
            </div>
          )}
        </div>
        <button className="btn-primary" onClick={handleAddOverride} disabled={!newEntityId} style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '4px' }}><Plus size={14} /> Add Customer</button>
      </div>
    </div>
  )
}
