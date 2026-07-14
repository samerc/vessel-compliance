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
  Percent,
  Edit3,
  LayoutList,
  Star,
  Eye
} from 'lucide-react'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import RichTextEditor from './RichTextEditor'
import { SECTION_LABELS, getDefaultSectionOrder } from './quotationSettingsConstants'
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
  | 'declaration'
  | 'endorsements'
  | 'sectionOrder'

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
    { id: 'declaration', label: 'Declaration', icon: <FileText size={15} /> },
    { id: 'endorsements', label: 'Endorsements', icon: <FileCheck size={15} /> },
    { id: 'sectionOrder', label: 'Section Order', icon: <LayoutList size={15} /> },
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
  const isLight = theme === 'light' || theme === 'aurora'
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
        {activeTab === 'declaration' && <DeclarationSettingsTab showSuccess={showSuccess} />}
        {activeTab === 'endorsements' && <EndorsementSettingsTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
        {activeTab === 'sectionOrder' && <PolicySectionOrderTab showSuccess={showSuccess} showError={showError} isLight={isLight} />}
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
  const [daIntroText, setDaIntroText] = useState('Premium {currency} {amount} shall be payable in {instalments} Instalments on the following dates, at {time} {timezone}, time being of the essence:')
  const [daIntroSingleText, setDaIntroSingleText] = useState('Premium of {currency} {amount} shall be payable on {date} as per attached debit note, at {time} {timezone}, time being of the essence.')
  const [caCommText, setCaCommText] = useState('Commission payable in {instalments} instalments:')
  const [caCommSingleText, setCaCommSingleText] = useState('Commission payable on {date}.')
  const [outstandingText, setOutstandingText] = useState('All outstanding premium to be settled prior inception')
  const [fullPremiumLossText, setFullPremiumLossText] = useState('Full annual premium payable in case of loss.')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('policyExportSettings')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.premiumIntroText) setPremiumIntroText(parsed.premiumIntroText)
          if (parsed.premiumIntroSingleText) setPremiumIntroSingleText(parsed.premiumIntroSingleText)
          if (parsed.debitAdviceIntroText) setDaIntroText(parsed.debitAdviceIntroText)
          if (parsed.debitAdviceIntroSingleText) setDaIntroSingleText(parsed.debitAdviceIntroSingleText)
          if (parsed.creditAdviceCommissionText) setCaCommText(parsed.creditAdviceCommissionText)
          if (parsed.creditAdviceCommissionSingleText) setCaCommSingleText(parsed.creditAdviceCommissionSingleText)
          if (parsed.outstandingPremiumDefaultText) setOutstandingText(parsed.outstandingPremiumDefaultText)
          if (parsed.fullPremiumLossDefaultText) setFullPremiumLossText(parsed.fullPremiumLossDefaultText)
        }
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      const existing = raw ? JSON.parse(raw) : {}
      await window.api.setSetting('policyExportSettings', JSON.stringify({ ...existing, premiumIntroText, premiumIntroSingleText, debitAdviceIntroText: daIntroText, debitAdviceIntroSingleText: daIntroSingleText, creditAdviceCommissionText: caCommText, creditAdviceCommissionSingleText: caCommSingleText, outstandingPremiumDefaultText: outstandingText, fullPremiumLossDefaultText: fullPremiumLossText }))
      showSuccess('Premium intro text saved')
    } catch {
      await window.api.setSetting('policyExportSettings', JSON.stringify({ premiumIntroText, premiumIntroSingleText, debitAdviceIntroText: daIntroText, debitAdviceIntroSingleText: daIntroSingleText, creditAdviceCommissionText: caCommText, creditAdviceCommissionSingleText: caCommSingleText, outstandingPremiumDefaultText: outstandingText, fullPremiumLossDefaultText: fullPremiumLossText }))
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

      <div style={{ borderTop: '1px solid var(--table-border)', marginTop: '24px', paddingTop: '20px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px' }}>Debit Advice</h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px' }}>Premium intro text for the Debit Advice document.</p>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Multiple Instalments — Placeholders: {'{currency}'}, {'{amount}'}, {'{instalments}'}, {'{time}'}, {'{timezone}'}</label>
        <textarea value={daIntroText} onChange={e => setDaIntroText(e.target.value)} rows={3} style={{ width: '100%', marginBottom: '14px', resize: 'vertical' }} />

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Single Instalment — Placeholders: {'{currency}'}, {'{amount}'}, {'{date}'}, {'{time}'}, {'{timezone}'}</label>
        <textarea value={daIntroSingleText} onChange={e => setDaIntroSingleText(e.target.value)} rows={3} style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }} />
      </div>

      <div style={{ borderTop: '1px solid var(--table-border)', marginTop: '24px', paddingTop: '20px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px' }}>Credit Advice</h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px' }}>Commission wording for the Credit Advice document.</p>

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Multiple Instalments — Placeholder: {'{instalments}'}</label>
        <textarea value={caCommText} onChange={e => setCaCommText(e.target.value)} rows={2} style={{ width: '100%', marginBottom: '14px', resize: 'vertical' }} />

        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Single Instalment — Placeholder: {'{date}'}</label>
        <textarea value={caCommSingleText} onChange={e => setCaCommSingleText(e.target.value)} rows={2} style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }} />
      </div>

      <div style={{ borderTop: '1px solid var(--table-border)', marginTop: '24px', paddingTop: '20px' }}>
        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px' }}>Outstanding Premium Notice</h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 12px' }}>Default text when the outstanding premium notice is enabled on a quotation.</p>
        <textarea value={outstandingText} onChange={e => setOutstandingText(e.target.value)} rows={2} style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }} />

        <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '4px', marginTop: '16px' }}>Full Premium in Case of Loss</h4>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0 0 8px' }}>Default text for the full premium loss notice on pro-rata quotations.</p>
        <textarea value={fullPremiumLossText} onChange={e => setFullPremiumLossText(e.target.value)} rows={2} style={{ width: '100%', marginBottom: '12px', resize: 'vertical' }} />
      </div>

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
  const isLight = theme === 'light' || theme === 'aurora'
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
  const typeCodes = Object.keys(TC_TYPE_LABELS)
  const [typeCode, setTypeCode] = useState('P')
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // Rich-text editor modal state
  const [editing, setEditing] = useState<{ id: string | null; name: string; html: string } | null>(null)
  const [previewHtml, setPreviewHtml] = useState<{ name: string; html: string } | null>(null)
  // Footer config (policyExportSettings)
  const [footer, setFooter] = useState({ tcFooterText: '', tcTitleLine: '{type} Cover {number}', tcShowPageNumbers: true })

  const load = async (tc: string) => {
    setLoading(true)
    try { const r = await window.api.tcListByType(tc); setTemplates(Array.isArray(r) ? r : []) } catch { setTemplates([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { load(typeCode) }, [typeCode])
  useEffect(() => {
    ;(async () => {
      try { const raw = await window.api.getSetting('policyExportSettings'); if (raw) { const p = JSON.parse(raw); setFooter(f => ({ tcFooterText: p.tcFooterText ?? f.tcFooterText, tcTitleLine: p.tcTitleLine ?? f.tcTitleLine, tcShowPageNumbers: p.tcShowPageNumbers !== false })) } } catch { /* default */ }
    })()
  }, [])

  const saveFooter = async () => {
    try {
      const raw = await window.api.getSetting('policyExportSettings')
      const p = raw ? JSON.parse(raw) : {}
      await window.api.setSetting('policyExportSettings', JSON.stringify({ ...p, ...footer }))
      showSuccess('T&C footer saved')
    } catch (err: any) { showError(err.message || 'Failed to save footer') }
  }

  const uploadDocx = async () => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.docx'
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return
      setBusy(true)
      try {
        const fileData = Array.from(new Uint8Array(await file.arrayBuffer()))
        const r = await window.api.tcCreate({ typeCode, name: file.name.replace(/\.docx$/i, ''), kind: 'docx', fileData, fileName: file.name }) as any
        if (r?.error) showError(r.message || 'Upload failed'); else { showSuccess('T&C document uploaded'); await load(typeCode) }
      } catch (err: any) { showError(err.message || 'Upload failed') } finally { setBusy(false) }
    }
    input.click()
  }

  const saveHtml = async () => {
    if (!editing) return
    setBusy(true)
    try {
      if (editing.id) { await window.api.tcUpdate(editing.id, { name: editing.name, contentHtml: editing.html }) }
      else { await window.api.tcCreate({ typeCode, name: editing.name || 'T&C', kind: 'html', contentHtml: editing.html }) }
      showSuccess('T&C template saved'); setEditing(null); await load(typeCode)
    } catch (err: any) { showError(err.message || 'Save failed') } finally { setBusy(false) }
  }

  const setDefault = async (id: string) => { try { await window.api.tcSetDefault(id); await load(typeCode) } catch (err: any) { showError(err.message || 'Failed') } }
  const remove = async (id: string) => { try { await window.api.tcDeleteById(id); showSuccess('Template deleted'); await load(typeCode) } catch (err: any) { showError(err.message || 'Delete failed') } }

  const openEdit = async (t: any) => {
    if (t.kind !== 'html') return
    try { const full = await window.api.tcGetById(t.id) as any; setEditing({ id: t.id, name: t.name || '', html: full?.contentHtml || '' }) }
    catch { setEditing({ id: t.id, name: t.name || '', html: '' }) }
  }
  const openPreview = async (t: any) => {
    if (t.kind !== 'html') { showError('Preview is available for rich-text templates. Download the DOCX to preview it.'); return }
    try { const full = await window.api.tcGetById(t.id) as any; setPreviewHtml({ name: t.name || 'T&C', html: full?.contentHtml || '' }) } catch { /* ignore */ }
  }
  const downloadDocx = async (t: any) => {
    try {
      const fileData = await window.api.tcGetFileById(t.id); if (!fileData) { showError('File not found'); return }
      const url = URL.createObjectURL(new Blob([new Uint8Array(fileData)], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
      const a = document.createElement('a'); a.href = url; a.download = t.fileName || `${t.name}.docx`; a.click(); URL.revokeObjectURL(url)
    } catch (err: any) { showError(err.message || 'Download failed') }
  }

  const typeColor = (tc: string) => tc === 'P' ? '#6464ff' : tc === 'H' ? '#ff64c8' : tc === 'W' ? '#ffb020' : 'var(--accent-primary)'

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '6px' }}>Terms & Conditions</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Author T&C as rich text (appended into the exported policy) or upload a Word document. Multiple per type; one is the default.
      </p>

      {/* Type toggle */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {typeCodes.map(tc => (
          <button key={tc} type="button" onClick={() => setTypeCode(tc)}
            style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '0.83rem', cursor: 'pointer', fontWeight: typeCode === tc ? 700 : 400, border: typeCode === tc ? `2px solid ${typeColor(tc)}` : '1px solid var(--input-border)', background: typeCode === tc ? `${typeColor(tc)}18` : 'transparent', color: typeCode === tc ? typeColor(tc) : 'var(--text-secondary)' }}>
            {TC_TYPE_LABELS[tc]}
          </button>
        ))}
      </div>

      {loading ? <p style={{ color: 'var(--text-secondary)' }}>Loading...</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
          {templates.length === 0 && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No T&C templates for {TC_TYPE_LABELS[typeCode]} yet.</p>}
          {templates.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderRadius: '10px', background: isLight ? '#f4f6fb' : 'rgba(255,255,255,0.04)', border: t.isDefault ? `1.5px solid ${typeColor(typeCode)}` : '1px solid var(--glass-border)' }}>
              <button type="button" onClick={() => setDefault(t.id)} title={t.isDefault ? 'Default template' : 'Set as default'} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: t.isDefault ? '#ffb020' : 'var(--text-secondary)' }}>
                <Star size={16} fill={t.isDefault ? '#ffb020' : 'none'} />
              </button>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{t.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{t.kind === 'html' ? 'Rich text' : 'Word document'}{t.isDefault ? ' · Default' : ''}</span>
              </div>
              <span style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', padding: '2px 7px', borderRadius: '5px', background: t.kind === 'html' ? 'rgba(0,170,200,0.12)' : 'rgba(180,100,255,0.12)', color: t.kind === 'html' ? 'var(--accent-primary)' : '#b464ff' }}>{t.kind === 'html' ? 'Rich' : 'DOCX'}</span>
              <button type="button" onClick={() => openPreview(t)} title="Preview" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 5 }}><Eye size={15} /></button>
              {t.kind === 'html'
                ? <button type="button" onClick={() => openEdit(t)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: 5 }}><Edit3 size={15} /></button>
                : <button type="button" onClick={() => downloadDocx(t)} title="Download" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', padding: 5 }}><FileText size={15} /></button>}
              <button type="button" onClick={() => remove(t.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 5 }}><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button type="button" onClick={() => setEditing({ id: null, name: '', html: '' })} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Plus size={14} /> Add Rich-Text</button>
        <button type="button" onClick={uploadDocx} disabled={busy} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>{busy ? <Loader2 size={13} className="spin" /> : <Upload size={13} />} Upload DOCX</button>
      </div>

      {/* T&C footer config */}
      <div style={{ paddingTop: '16px', borderTop: '1px solid var(--glass-border)' }}>
        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '10px' }}>T&C Footer</h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '520px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Title line (placeholders: {'{type}'}, {'{number}'})</label>
            <input type="text" value={footer.tcTitleLine} onChange={e => setFooter({ ...footer, tcTitleLine: e.target.value })} style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg, transparent)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Footer text (optional, shown below the title)</label>
            <input type="text" value={footer.tcFooterText} onChange={e => setFooter({ ...footer, tcFooterText: e.target.value })} style={{ width: '100%', padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg, transparent)', color: 'var(--text-primary)', fontSize: '0.85rem' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={footer.tcShowPageNumbers} onChange={e => setFooter({ ...footer, tcShowPageNumbers: e.target.checked })} style={{ width: '15px', height: '15px', accentColor: 'var(--accent-primary)' }} /> Show page numbers on T&C pages
          </label>
          <div><button type="button" onClick={saveFooter} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Save size={14} /> Save Footer</button></div>
        </div>
      </div>

      {/* Rich-text editor modal */}
      {editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '12px', padding: '20px', width: '760px', maxWidth: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{editing.id ? 'Edit' : 'New'} T&C — {TC_TYPE_LABELS[typeCode]}</h3>
              <button onClick={() => setEditing(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={18} /></button>
            </div>
            <input type="text" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Template name (e.g. Standard P&I T&C)" style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg, transparent)', color: 'var(--text-primary)', fontSize: '0.88rem', marginBottom: '10px', boxSizing: 'border-box' }} />
            <div style={{ flex: 1, overflowY: 'auto', minHeight: '260px' }}>
              <RichTextEditor value={editing.html} onChange={html => setEditing(ed => ed ? { ...ed, html } : ed)} minHeight={340} showHeadings showAlignment showFontSize />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <button onClick={() => setEditing(null)} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Cancel</button>
              <button onClick={saveHtml} disabled={busy} className="btn-primary" style={{ fontSize: '0.82rem' }}>{busy ? 'Saving…' : 'Save Template'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal (rich text) */}
      {previewHtml && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setPreviewHtml(null)}>
          <div style={{ background: '#ffffff', color: '#000', borderRadius: '10px', padding: '32px 40px', width: '720px', maxWidth: '92vw', maxHeight: '86vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', fontWeight: 700, textDecoration: 'underline', marginBottom: '16px' }}>TERMS AND CONDITIONS</div>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: '11pt', lineHeight: 1.5, textAlign: 'justify' }} dangerouslySetInnerHTML={{ __html: previewHtml.html || '<p style="color:#888">(empty)</p>' }} />
          </div>
        </div>
      )}
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
  const [defaultEnabled, setDefaultEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const raw = await window.api.getSetting('qr_verification_url')
        if (raw) setUrl(raw)
        const de = await window.api.getSetting('qr_default_enabled')
        setDefaultEnabled(de === 'true')
      } catch { /* default */ }
      finally { setLoading(false) }
    })()
  }, [])

  const handleSave = async () => {
    await window.api.setSetting('qr_verification_url', url)
    await window.api.setSetting('qr_default_enabled', defaultEnabled ? 'true' : 'false')
    showSuccess('QR verification settings saved')
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '8px' }}>QR Code Verification</h4>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Configure the base URL for policy verification QR codes. The policy number will be appended to generate the full verification URL.
        When enabled for a policy, a QR code and verification link are embedded on the closing page of the exported P&amp;I policy.
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={defaultEnabled}
          onChange={e => setDefaultEnabled(e.target.checked)}
          style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
        />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Include QR code in P&amp;I policies by default</span>
      </label>
      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '-8px 0 16px' }}>
        Pre-selects the &ldquo;Include QR verification code&rdquo; toggle in the policy conversion wizard (Blue Cards step). Off by default; can be overridden per policy.
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

// ==================== Declaration Settings Tab ====================

function DeclarationSettingsTab({ showSuccess }: { showSuccess: (m: string) => void }) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [umr, setUmr] = useState('')
  const [amlinRef, setAmlinRef] = useState('')
  const [riskCode, setRiskCode] = useState('"W" in respect of War Risks Premium\t\t"WB" in respect of War Breach Premium')
  const [loading, setLoading] = useState(true)

  const loadYear = async (y: string) => {
    setLoading(true)
    try {
      const raw = await window.api.getSetting('declaration_settings')
      if (raw) {
        const parsed = JSON.parse(raw)
        const ys = parsed[y] || {}
        setUmr(ys.umr || '')
        setAmlinRef(ys.amlinRef || '')
        if (ys.riskCode) setRiskCode(ys.riskCode)
      }
    } catch {}
    setLoading(false)
  }

  useEffect(() => { loadYear(year) }, [year])

  const handleSave = async () => {
    try {
      const raw = await window.api.getSetting('declaration_settings')
      const existing = raw ? JSON.parse(raw) : {}
      existing[year] = { umr, amlinRef, riskCode }
      await window.api.setSetting('declaration_settings', JSON.stringify(existing))
      showSuccess(`Declaration settings saved for ${year}`)
    } catch {
      await window.api.setSetting('declaration_settings', JSON.stringify({ [year]: { umr, amlinRef, riskCode } }))
      showSuccess(`Declaration settings saved for ${year}`)
    }
  }

  if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

  return (
    <div>
      <h3 style={{ fontSize: '1rem', margin: '0 0 4px' }}>War Declaration Settings</h3>
      <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 20px' }}>
        Configure per-year values for war declaration exports (UMR, Amlin Ref, Risk Code).
      </p>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Year of Account</label>
        <input type="number" value={year} onChange={e => setYear(e.target.value)} style={{ width: '120px', padding: '6px 10px', fontSize: '0.9rem' }} />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>UMR</label>
        <input value={umr} onChange={e => setUmr(e.target.value)} placeholder="e.g., B0572MA255259" style={{ width: '100%', maxWidth: '400px', padding: '6px 10px', fontSize: '0.85rem' }} />
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Amlin Ref</label>
        <input value={amlinRef} onChange={e => setAmlinRef(e.target.value)} placeholder="e.g., WHW1753225RQ" style={{ width: '100%', maxWidth: '400px', padding: '6px 10px', fontSize: '0.85rem' }} />
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Risk Code</label>
        <input value={riskCode} onChange={e => setRiskCode(e.target.value)} style={{ width: '100%', padding: '6px 10px', fontSize: '0.85rem' }} />
      </div>

      <button className="btn-primary" onClick={handleSave} style={{ padding: '6px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Save size={14} /> Save
      </button>
    </div>
  )
}

// ── Endorsement Settings ──────────────────────────────────────

function EndorsementSettingsTab({ showSuccess, showError, isLight }: { showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
  const [closingText, setClosingText] = useState('')
  const [triggerFields, setTriggerFields] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [newTmplName, setNewTmplName] = useState('')
  const [newTmplSection, setNewTmplSection] = useState('general')
  const [newTmplContent, setNewTmplContent] = useState('')
  const [editingTmpl, setEditingTmpl] = useState<string | null>(null)
  const [editTmplName, setEditTmplName] = useState('')
  const [editTmplSection, setEditTmplSection] = useState('')
  const [editTmplContent, setEditTmplContent] = useState('')

  const sectionOptions = [
    { key: 'general', label: 'General (all sections)' },
    { key: 'interest', label: 'Interest / Vessel' },
    { key: 'premium', label: 'Premium' },
    { key: 'conditions', label: 'Conditions' },
    { key: 'warranties', label: 'Warranties' },
    { key: 'deductibles', label: 'Deductibles' },
  ]

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    try {
      const [ct, tf, tmpls] = await Promise.all([
        window.api.getSetting('endorsement_closing_text').catch(() => null),
        window.api.endorsementGetTriggerFields(),
        window.api.endorsementGetTemplates()
      ])
      setClosingText(ct || 'All other terms and conditions of the above-mentioned policy remain unchanged.')
      setTriggerFields(Array.isArray(tf) ? tf : [])
      setTemplates(Array.isArray(tmpls) ? tmpls : [])
    } catch { showError('Failed to load endorsement settings') }
  }

  async function saveClosingText() {
    try {
      await window.api.setSetting('endorsement_closing_text', closingText)
      showSuccess('Closing text saved')
    } catch { showError('Failed to save') }
  }

  async function saveTriggerFields() {
    try {
      await window.api.endorsementSetTriggerFields(triggerFields)
      showSuccess('Trigger fields saved')
    } catch { showError('Failed to save') }
  }

  async function addTemplate() {
    if (!newTmplName.trim()) return
    try {
      await window.api.endorsementAddTemplate({ name: newTmplName, sectionKey: newTmplSection, content: newTmplContent })
      setAddingTemplate(false)
      setNewTmplName(''); setNewTmplSection('general'); setNewTmplContent('')
      showSuccess('Template added')
      await loadData()
    } catch { showError('Failed to add template') }
  }

  async function updateTemplate(id: string) {
    try {
      await window.api.endorsementUpdateTemplate(id, { name: editTmplName, sectionKey: editTmplSection, content: editTmplContent })
      setEditingTmpl(null)
      showSuccess('Template updated')
      await loadData()
    } catch { showError('Failed to update template') }
  }

  async function deleteTemplate(id: string) {
    try {
      await window.api.endorsementDeleteTemplate(id)
      showSuccess('Template deleted')
      await loadData()
    } catch { showError('Failed to delete') }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '6px 10px', fontSize: '0.85rem', borderRadius: '6px',
    border: '1px solid var(--input-border)', background: 'transparent', color: 'var(--text-primary)', fontFamily: 'inherit'
  }

  return (
    <div>
      {/* Closing Text */}
      <div style={{ marginBottom: '24px' }}>
        <h4 style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Closing Text</h4>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
          Default closing text appended to all endorsement documents.
        </p>
        <RichTextEditor value={closingText} onChange={setClosingText} minHeight={80} />
        <button className="btn-primary" onClick={saveClosingText} style={{ marginTop: '8px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Save size={14} /> Save Closing Text
        </button>
      </div>

      {/* Trigger Fields */}
      <div style={{ marginBottom: '24px', borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
        <h4 style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Endorsement Trigger Fields</h4>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          When these vessel fields change, the app will prompt the user to issue an endorsement.
        </p>
        {triggerFields.map(f => (
          <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!f.isActive}
              onChange={() => setTriggerFields(prev => prev.map(x => x.id === f.id ? { ...x, isActive: !x.isActive } : x))} />
            {f.fieldLabel}
          </label>
        ))}
        <button className="btn-primary" onClick={saveTriggerFields} style={{ marginTop: '8px', padding: '6px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Save size={14} /> Save Triggers
        </button>
      </div>

      {/* Templates */}
      <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '0.85rem', margin: 0 }}>Endorsement Templates</h4>
          {!addingTemplate && (
            <button className="btn-secondary" onClick={() => setAddingTemplate(true)} style={{ padding: '4px 12px', fontSize: '0.78rem' }}>
              + Add Template
            </button>
          )}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          Reusable text templates with placeholders. Available: {'{vesselName}'}, {'{imoNumber}'}, {'{policyNumber}'}, {'{policyType}'}, {'{effectiveDate}'}, {'{endorsementNumber}'}, {'{premiumAmount}'}, {'{currency}'}, {'{oldValue}'}, {'{newValue}'}.
        </p>

        {addingTemplate && (
          <div style={{ background: isLight ? '#f8f9fc' : '#161829', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '14px', marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <input value={newTmplName} onChange={e => setNewTmplName(e.target.value)} placeholder="Template name" style={inputStyle} />
              <select value={newTmplSection} onChange={e => setNewTmplSection(e.target.value)} style={inputStyle}>
                {sectionOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </div>
            <RichTextEditor value={newTmplContent} onChange={setNewTmplContent} minHeight={80} />
            <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
              <button className="btn-primary" onClick={addTemplate} style={{ padding: '5px 14px', fontSize: '0.78rem' }}>Add</button>
              <button className="btn-secondary" onClick={() => setAddingTemplate(false)} style={{ padding: '5px 14px', fontSize: '0.78rem' }}>Cancel</button>
            </div>
          </div>
        )}

        {templates.map(t => (
          <div key={t.id} style={{ borderBottom: '1px solid var(--glass-border)', padding: '10px 0' }}>
            {editingTmpl === t.id ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <input value={editTmplName} onChange={e => setEditTmplName(e.target.value)} style={inputStyle} />
                  <select value={editTmplSection} onChange={e => setEditTmplSection(e.target.value)} style={inputStyle}>
                    {sectionOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                </div>
                <RichTextEditor value={editTmplContent} onChange={setEditTmplContent} minHeight={80} />
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button className="btn-primary" onClick={() => updateTemplate(t.id)} style={{ padding: '5px 14px', fontSize: '0.78rem' }}>Save</button>
                  <button className="btn-secondary" onClick={() => setEditingTmpl(null)} style={{ padding: '5px 14px', fontSize: '0.78rem' }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t.name}</span>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(0,170,200,0.1)', color: '#00aac8' }}>
                  {sectionOptions.find(o => o.key === t.sectionKey)?.label || t.sectionKey}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                  <button onClick={() => { setEditingTmpl(t.id); setEditTmplName(t.name); setEditTmplSection(t.sectionKey); setEditTmplContent(t.content) }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => deleteTemplate(t.id)}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {templates.length === 0 && !addingTemplate && (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
            No templates yet
          </div>
        )}
      </div>
    </div>
  )
}

// Default policy section order per type (P&I / Hull / War). Policies inherit this unless
// overridden per-policy in the conversion wizard.
function PolicySectionOrderTab({ showSuccess, showError, isLight }: { showSuccess: (m: string) => void; showError: (m: string) => void; isLight: boolean }) {
  const TYPES: { code: string; label: string; color: string }[] = [
    { code: 'P', label: 'P&I', color: '#6464ff' },
    { code: 'H', label: 'Hull', color: '#ff64c8' },
    { code: 'W', label: 'War', color: '#ffb020' },
  ]
  const [typeCode, setTypeCode] = useState('P')
  const [order, setOrder] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const key = (tc: string) => `policy_section_order_defaults_${tc}`

  const load = async (tc: string) => {
    setLoading(true)
    try {
      const raw = await window.api.getSetting(key(tc))
      let saved: string[] | null = null
      if (raw) { try { saved = JSON.parse(raw) } catch { saved = null } }
      const def = getDefaultSectionOrder(tc)
      // Start from saved (filtered to valid keys), then append any missing default keys
      const base = Array.isArray(saved) && saved.length > 0 ? saved.filter(k => def.includes(k)) : [...def]
      for (const k of def) if (!base.includes(k)) base.push(k)
      setOrder(base)
    } catch { setOrder(getDefaultSectionOrder(tc)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(typeCode) }, [typeCode])

  const move = (i: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= order.length) return
    const next = [...order]
    ;[next[i], next[j]] = [next[j], next[i]]
    setOrder(next)
  }

  const save = async () => {
    try {
      await window.api.setSetting(key(typeCode), JSON.stringify(order))
      showSuccess('Section order saved')
    } catch (err: any) { showError(err.message || 'Failed to save') }
  }

  const reset = () => setOrder(getDefaultSectionOrder(typeCode))

  return (
    <div>
      <h3 style={{ fontSize: '1rem', margin: '0 0 4px' }}>Section Order</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 14px' }}>
        Default order of sections in exported policy documents, per type. Can be overridden per policy in the conversion wizard.
      </p>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {TYPES.map(t => (
          <button key={t.code} type="button" onClick={() => setTypeCode(t.code)}
            style={{ padding: '6px 16px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: typeCode === t.code ? 700 : 400, border: typeCode === t.code ? `2px solid ${t.color}` : '1px solid var(--input-border)', background: typeCode === t.code ? `${t.color}18` : 'transparent', color: typeCode === t.code ? t.color : 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>Loading...</div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          {order.map((k, i) => (
            <div key={k} style={{ padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--table-border)', marginBottom: '4px', display: 'flex', gap: '12px', alignItems: 'center', background: isLight ? '#fafbfc' : 'transparent' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace', minWidth: '22px' }}>{i + 1}.</span>
              <span style={{ flex: 1, fontSize: '0.88rem', fontWeight: 500 }}>{SECTION_LABELS[k] || k}</span>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button onClick={() => move(i, 'up')} disabled={i === 0} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === 0 ? 0.3 : 1 }}><ChevronUp size={16} /></button>
                <button onClick={() => move(i, 'down')} disabled={i === order.length - 1} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-secondary)', opacity: i === order.length - 1 ? 0.3 : 1 }}><ChevronDown size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', justifyContent: 'space-between' }}>
        <button onClick={reset} className="btn-secondary" style={{ fontSize: '0.82rem' }}>Reset to Defaults</button>
        <button onClick={save} className="btn-primary" style={{ fontSize: '0.82rem' }}><Save size={14} /> Save Order</button>
      </div>
    </div>
  )
}
