import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, Users, Ship, Shield, FileText, Globe, AlertTriangle, DollarSign, Info, StickyNote, Scale, Anchor, Clock, CheckSquare, Ban, Download, Layers, LayoutList, ClipboardCheck, ExternalLink } from 'lucide-react'
import { Quotation, Vessel, QuotationVessel, PISectionTexts, PISanctionsVersion, QuotationPIAlternative } from '../../../shared/types'
import { useToast } from '../contexts/ToastContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { Plus, Trash2, ChevronDown, GitBranch, RefreshCw, Lock, MoreHorizontal, Copy, Search, X, History } from 'lucide-react'
import { exportQuotationToWord } from '../services/QuotationExportService'
import { DEFAULT_SECTION_TEXTS } from './quotationSettingsConstants'
import InsuredTab from './quotation-tabs/InsuredTab'
import VesselTab from './quotation-tabs/VesselTab'
import LiabilityTab from './quotation-tabs/LiabilityTab'
import ConditionsTab from './quotation-tabs/ConditionsTab'
import PeriodTab from './quotation-tabs/PeriodTab'
import TradingTab from './quotation-tabs/TradingTab'
import WarrantiesTab from './quotation-tabs/WarrantiesTab'
import DeductiblesTab from './quotation-tabs/DeductiblesTab'
import ExclusionsTab from './quotation-tabs/ExclusionsTab'
import SanctionsTab from './quotation-tabs/SanctionsTab'
import SubjectivitiesTab from './quotation-tabs/SubjectivitiesTab'
import PremiumTab from './quotation-tabs/PremiumTab'
import InformationTab from './quotation-tabs/InformationTab'
import SurveyWarrantiesTab from './quotation-tabs/SurveyWarrantiesTab'
import NotesTab from './quotation-tabs/NotesTab'
import CustomSectionsTab from './quotation-tabs/CustomSectionsTab'
import SectionOrderModal from './quotation-tabs/SectionOrderModal'
import AgreedValueTab from './quotation-tabs/AgreedValueTab'
import SumInsuredTab from './quotation-tabs/SumInsuredTab'
import WarConditionsTab from './quotation-tabs/WarConditionsTab'
import WarTradingTab from './quotation-tabs/WarTradingTab'
import HullConditionsTab from './quotation-tabs/HullConditionsTab'
import InsuredValueTab from './quotation-tabs/InsuredValueTab'
import VoyageTab from './quotation-tabs/VoyageTab'
import SubjectMatterTab from './quotation-tabs/SubjectMatterTab'
import CargoClausesTab from './quotation-tabs/CargoClausesTab'

const statusColors: Record<string, { bg: string; text: string }> = {
    draft: { bg: 'rgba(150, 150, 150, 0.15)', text: '#999' },
    sent: { bg: 'rgba(0, 150, 255, 0.15)', text: '#0096ff' },
    approved: { bg: 'rgba(0, 200, 100, 0.15)', text: '#00c864' },
    rejected: { bg: 'rgba(255, 77, 77, 0.15)', text: '#ff4d4d' },
    converted: { bg: 'rgba(180, 100, 255, 0.15)', text: '#b464ff' }
}

type EditorTab = 'insured' | 'vessel' | 'liability' | 'conditions' | 'agreedValue' | 'hullConditions' | 'sumInsured' | 'warConditions' | 'warTrading' | 'period' | 'trading' | 'warranties' | 'surveyWarranties' | 'deductibles' | 'exclusions' | 'sanctions' | 'subjectivities' | 'premium' | 'information' | 'customSections' | 'notes' | 'insuredValue' | 'voyage' | 'subjectMatter' | 'cargoConditions' | 'cargoSpecial' | 'cargoLaw'

type TabDef = { key: EditorTab; label: string; icon: any; types?: string[] }

const allTabs: TabDef[] = [
    { key: 'vessel', label: 'Vessel', icon: Ship },
    { key: 'insured', label: 'Insured', icon: Users },
    { key: 'agreedValue', label: 'Agreed Value', icon: Shield, types: ['H'] },
    { key: 'sumInsured', label: 'Sum Insured', icon: Shield, types: ['W'] },
    { key: 'insuredValue', label: 'Insured Value', icon: Shield, types: ['C'] },
    { key: 'liability', label: 'Limit of Liability', icon: Shield, types: ['P'] },
    { key: 'hullConditions', label: 'Conditions', icon: FileText, types: ['H'] },
    { key: 'warConditions', label: 'Conditions', icon: FileText, types: ['W'] },
    { key: 'conditions', label: 'Conditions', icon: FileText, types: ['P'] },
    { key: 'cargoConditions', label: 'Conditions', icon: FileText, types: ['C'] },
    { key: 'subjectMatter', label: 'Subject Matter', icon: FileText, types: ['C'] },
    { key: 'voyage', label: 'Voyage', icon: Globe, types: ['C'] },
    { key: 'period', label: 'Period', icon: Clock, types: ['P', 'H', 'W', 'F', 'L'] },
    { key: 'trading', label: 'Trading', icon: Globe, types: ['P', 'H'] },
    { key: 'warTrading', label: 'Trading Warranty', icon: Globe, types: ['W'] },
    { key: 'warranties', label: 'Warranties', icon: CheckSquare, types: ['P', 'H', 'W', 'F', 'L'] },
    { key: 'surveyWarranties', label: 'Survey Warranties', icon: ClipboardCheck, types: ['P', 'H', 'F', 'L'] },
    { key: 'deductibles', label: 'Deductibles', icon: Scale, types: ['P'] },
    { key: 'exclusions', label: 'Exclusions', icon: Ban, types: ['P'] },
    { key: 'cargoSpecial', label: 'Special Conditions', icon: FileText, types: ['C'] },
    { key: 'sanctions', label: 'Sanctions', icon: AlertTriangle, types: ['P', 'H', 'W', 'F', 'L'] },
    { key: 'subjectivities', label: 'Subjectivities', icon: Anchor },
    { key: 'cargoLaw', label: 'Law & Jurisdiction', icon: Scale, types: ['C'] },
    { key: 'premium', label: 'Premium', icon: DollarSign },
    { key: 'information', label: 'Information', icon: Info },
    { key: 'customSections', label: 'Custom Sections', icon: Layers },
    { key: 'notes', label: 'Notes', icon: StickyNote }
]

function getTabsForType(typeCode?: string): TabDef[] {
    const code = typeCode || 'P'
    return allTabs.filter(t => !t.types || t.types.includes(code))
}

interface QuotationEditorProps {
    quotation: Quotation
    onBack: () => void
    onOpenQuotation?: (quotation: Quotation) => void
    onNavigateToPolicy?: (policyId: string) => void
    onNavigateToPolicySetup?: (quotationId: string) => void
    policyContext?: { policyId: string; policyNumber: string } | null
    onReturnToPolicy?: (policyId: string) => void
}

export default function QuotationEditor({ quotation, onBack, onOpenQuotation, onNavigateToPolicy: _onNavigateToPolicy, onNavigateToPolicySetup, policyContext, onReturnToPolicy }: QuotationEditorProps) {
    const [activeTab, setActiveTab] = useState<EditorTab>('vessel')
    const [q, setQ] = useState<Quotation>(quotation)
    // policyTypes removed — type shown as badge, not editable
    const [vessels, setVessels] = useState<Vessel[]>([])
    const [qVessels, setQVessels] = useState<QuotationVessel[]>([])
    const [vesselVersion, setVesselVersion] = useState(0)
    const [globalTexts, setGlobalTexts] = useState<PISectionTexts>(DEFAULT_SECTION_TEXTS)
    const [sanctionsVersions, setSanctionsVersions] = useState<PISanctionsVersion[]>([])
    const [showSectionOrder, setShowSectionOrder] = useState(false)
    const [revisions, setRevisions] = useState<Quotation[]>([])
    const [showRevisionHistory, setShowRevisionHistory] = useState(false)
    const [reachableSteps, setReachableSteps] = useState<import('../../../shared/types').WorkflowStep[]>([])
    const [allWorkflowSteps, setAllWorkflowSteps] = useState<import('../../../shared/types').WorkflowStep[]>([])
    const [showStepMenu, setShowStepMenu] = useState(false)
    const [showActionsMenu, setShowActionsMenu] = useState(false)
    const actionsRef = useRef<HTMLDivElement>(null)
    const stepMenuRef = useRef<HTMLButtonElement>(null)
    const [stepComment, setStepComment] = useState('')
    const [showStepCommentModal, setShowStepCommentModal] = useState<string | null>(null)
    const [workflowLog, setWorkflowLog] = useState<import('../../../shared/types').QuotationWorkflowLog[]>([])
    const [showWorkflowLog, setShowWorkflowLog] = useState(false)
    const [piAlternatives, setPiAlternatives] = useState<QuotationPIAlternative[]>([])
    const [selectedPIAltId, setSelectedPIAltId] = useState<string | null>(null)
    const [showDraftExportModal, setShowDraftExportModal] = useState<'pdf' | 'word' | null>(null)
    const [exportWarnings, setExportWarnings] = useState<{ warnings: string[]; format: 'pdf' | 'word'; action: 'direct' | 'approve' | 'draft' } | null>(null)
    const [showCopyFromQuotation, setShowCopyFromQuotation] = useState(false)
    const [deleteModal, setDeleteModal] = useState<{
        show: boolean
        revisionCount: number
        deleteMode: 'single' | 'all'
    } | null>(null)
    const [isLockedByOther, setIsLockedByOther] = useState(false)
    const [lockedByName, setLockedByName] = useState<string | null>(null)
    const hasEdited = useRef(false)
    const { showSuccess, showError } = useToast()
    const { theme } = useTheme()
    const { hasPermission } = useAuth()
    const isLight = theme === 'light'
    const currentStep = allWorkflowSteps.find(s => s.id === q.workflowStepId)
    const stepCanEdit = currentStep ? currentStep.canEdit !== false : true
    const stepCanExport = currentStep ? currentStep.canExport !== false : true
    const canExport = hasPermission('quotations:export') && stepCanExport

    // Lock quotation on mount, unlock on unmount
    useEffect(() => {
        let mounted = true
        ;(async () => {
            try {
                const result = await window.api.quotationLock(quotation.id)
                if (!mounted) return
                if (!result.success) {
                    setIsLockedByOther(true)
                    setLockedByName(result.lockedByName || 'another user')
                }
            } catch {}
        })()
        return () => {
            mounted = false
            window.api.quotationUnlock(quotation.id).catch(() => {})
        }
    }, [quotation.id])

    const canEdit = hasPermission('quotations:edit') && !isLockedByOther && stepCanEdit

    useEffect(() => {
        loadMasterData()
    }, [])

    // Reload quotation vessels when vessel list changes
    useEffect(() => {
        if (vesselVersion === 0) return
        window.api.getQuotationVessels(quotation.id).then(qv => {
            setQVessels(Array.isArray(qv) ? qv : [])
        }).catch(() => {})
    }, [vesselVersion])

    // Track recent item view
    useEffect(() => {
        const label = quotation.referenceNumber || 'Quotation'
        const sublabel = (quotation as any).quotationTypeName || undefined
        window.api.recentItemsAdd('quotation', quotation.id, label, sublabel).then(() => {
            window.dispatchEvent(new Event('recent-item-added'))
        }).catch(() => {})
    }, [quotation.id])

    const loadMasterData = async () => {
        const [fullQ, , v, gt, sv, qv] = await Promise.all([
            window.api.getQuotation(quotation.id),
            window.api.getPolicyTypes(),
            window.api.getVessels(),
            window.api.piGetSectionTexts(),
            window.api.piGetSanctionsVersions(),
            window.api.getQuotationVessels(quotation.id)
        ])
        if (fullQ) {
            // Set war defaults on first load (non-refundable 25%)
            if (fullQ.quotationTypeCode === 'W' && !fullQ.nonRefundableType && !fullQ.premiumAmount) {
                fullQ.nonRefundableType = 'percentage'
                fullQ.nonRefundablePercent = 25
                await window.api.updateQuotation(fullQ.id, { nonRefundableType: 'percentage', nonRefundablePercent: 25 } as any)
            }
            setQ(fullQ)
            // Load revision history
            const groupId = fullQ.revisionGroupId || fullQ.id
            const revs = await window.api.getQuotationRevisions(groupId)
            setRevisions(Array.isArray(revs) ? revs : [])
            // Load workflow steps
            try {
                const [steps, allSteps] = await Promise.all([
                    window.api.workflowGetReachableSteps(fullQ.id),
                    window.api.workflowGetSteps()
                ])
                setReachableSteps(Array.isArray(steps) ? steps : [])
                setAllWorkflowSteps(Array.isArray(allSteps) ? allSteps : [])
            } catch { setReachableSteps([]); setAllWorkflowSteps([]) }
            // Load workflow log
            try {
                const log = await window.api.workflowGetQuotationLog(fullQ.id)
                setWorkflowLog(Array.isArray(log) ? log : [])
            } catch { setWorkflowLog([]) }
            // Load PI alternatives
            if (fullQ.quotationTypeCode === 'P') {
                const piAlts = await window.api.piGetQuotationAlternatives(fullQ.id)
                const safeAlts = Array.isArray(piAlts) ? piAlts : []
                setPiAlternatives(safeAlts)
                if (safeAlts.length >= 2 && !selectedPIAltId) setSelectedPIAltId(safeAlts[0].id)
            }
        }
        // policyTypes removed
        setVessels(Array.isArray(v) ? v : [])
        setQVessels(Array.isArray(qv) ? qv : [])
        if (gt && Object.keys(gt).length > 0) setGlobalTexts({ ...DEFAULT_SECTION_TEXTS, ...gt })
        setSanctionsVersions(sv)
    }

    const getEffectiveText = (key: keyof PISectionTexts): string => {
        return String(q.sectionTextsOverride?.[key] ?? globalTexts[key] ?? DEFAULT_SECTION_TEXTS[key] ?? '')
    }

    const isLocked = q.isLocked === true

    const openDeleteModal = async () => {
        const groupId = q.revisionGroupId || q.id
        let count = 1
        try {
            count = await window.api.getQuotationRevisionCount(groupId)
        } catch { /* fallback */ }
        setDeleteModal({ show: true, revisionCount: count, deleteMode: 'single' })
    }

    const handleDeleteFromEditor = async () => {
        if (!deleteModal) return
        try {
            if (deleteModal.deleteMode === 'all' && deleteModal.revisionCount > 1) {
                const groupId = q.revisionGroupId || q.id
                await window.api.deleteQuotationGroup(groupId)
                showSuccess('All revisions deleted')
            } else {
                await window.api.deleteQuotation(q.id)
                showSuccess('Quotation deleted')
            }
            setDeleteModal(null)
            onBack()
        } catch (err: any) {
            showError(err.message || 'Failed to delete quotation')
        }
    }

    const handleCreateRevision = async () => {
        try {
            const newRev = await window.api.createQuotationRevision(q.id)
            if ((newRev as any)?.error) { showError((newRev as any).message || 'Failed to create revision'); return }
            showSuccess(`Revision R${newRev.revisionNumber} created`)
            if (onOpenQuotation) onOpenQuotation(newRev)
        } catch (err: any) {
            showError(err.message || 'Failed to create revision')
        }
    }

    const handleMoveToStep = async (stepId: string, comment?: string) => {
        try {
            const result = await window.api.workflowMoveQuotation(q.id, stepId, comment)
            if ((result as any)?.error) { showError((result as any).message || 'Failed to move'); return }
            showSuccess('Workflow step updated')
            setShowStepMenu(false)
            setShowStepCommentModal(null)
            setStepComment('')
            // Reload quotation to get updated step
            const fullQ = await window.api.getQuotation(q.id)
            if (fullQ && !(fullQ as any).error) {
                setQ(fullQ)
                // Reload reachable steps
                const steps = await window.api.workflowGetReachableSteps(fullQ.id)
                setReachableSteps(Array.isArray(steps) ? steps : [])
                const log = await window.api.workflowGetQuotationLog(fullQ.id)
                setWorkflowLog(Array.isArray(log) ? log : [])
            }
        } catch (err: any) {
            showError(err.message || 'Failed to move to step')
        }
    }

    const handleReloadFromSettings = async () => {
        try {
            // Clear export snapshot
            if (q.exportSnapshot) {
                await window.api.clearExportSnapshot(q.id)
            }
            // Always reload excluded/DDQ countries from master list, filtered by quotation type
            const masterCountries = await window.api.piGetTradingExcludedCountries()
            if (Array.isArray(masterCountries) && masterCountries.length > 0) {
                const typeCode = q.quotationTypeCode || 'P'
                const filtered = masterCountries.filter((c: any) => {
                    if (!c.excludeTypes) return true // null = all types
                    return c.excludeTypes.split(',').includes(typeCode)
                })
                await window.api.setQuotationExcludedCountries(q.id, filtered.map((c: any) => ({
                    name: c.name,
                    listType: c.listType
                })))
            }
            // Reload quotation to pick up fresh settings
            const fullQ = await window.api.getQuotation(q.id)
            if (fullQ && !(fullQ as any).error) {
                setQ({ ...fullQ, exportSnapshot: undefined })
            }
            showSuccess('Reloaded texts and data from settings')
        } catch (err: any) {
            showError(err.message || 'Failed to reload from settings')
        }
    }

    const isDraft = (q.referenceNumber || '').startsWith('DRAFT-')

    const validateBeforeExport = async (quotation: Quotation): Promise<string[]> => {
        const warnings: string[] = []
        const typeCode = quotation.quotationTypeCode

        // Premium — required for all types except cargo rate mode and war excess (auto-calculated from rates)
        if ((typeCode !== 'C' || quotation.premiumType !== 'rate') && !(typeCode === 'W' && quotation.warExcessEnabled)) {
            // Check if premium is set on quotation level OR on alternatives/vessels/value options
            let hasPremium = quotation.premiumAmount != null && quotation.premiumAmount !== 0
            if (!hasPremium && typeCode === 'P') {
                // P&I alternatives may have per-alternative premiums
                try {
                    const piAlts = await window.api.piGetQuotationAlternatives(quotation.id)
                    if (Array.isArray(piAlts) && piAlts.length > 0 && piAlts.some((a: any) => a.premiumAmount)) hasPremium = true
                } catch {}
            }
            if (!hasPremium && typeCode === 'H') {
                // Hull alternatives or value options may have premiums
                try {
                    const hullAlts = await window.api.hullGetQuotationAlternatives(quotation.id)
                    if (Array.isArray(hullAlts) && hullAlts.some((a: any) => a.premiumAmount)) hasPremium = true
                    const valOpts = await window.api.hullGetAgreedValueOptions(quotation.id)
                    if (Array.isArray(valOpts) && valOpts.some((o: any) => o.premiumAmount)) hasPremium = true
                } catch {}
            }
            if (!hasPremium) {
                // Check per-vessel premiums (including war excess section premiums)
                try {
                    const qv = await window.api.getQuotationVessels(quotation.id)
                    if (Array.isArray(qv) && qv.some((v: any) => v.premiumAmount || v.warSection1Premium || v.warSection2Premium)) hasPremium = true
                } catch {}
            }
            if (!hasPremium && typeCode === 'P') {
                // Check LOL alternative premiums
                try {
                    const lolOpts = await window.api.lolGetOptions(quotation.id)
                    if (Array.isArray(lolOpts) && lolOpts.some((o: any) => o.premiumAmount)) hasPremium = true
                } catch {}
            }
            if (!hasPremium) {
                warnings.push('Premium amount is not set')
            }
        }

        // P&I: Limit of Liability (skip if LOL alternatives are set)
        if (typeCode === 'P' && (quotation.limitOfLiabilityAmount == null || quotation.limitOfLiabilityAmount === 0)) {
            try {
                const lolOpts = await window.api.lolGetOptions(quotation.id)
                if (!Array.isArray(lolOpts) || lolOpts.length === 0) {
                    warnings.push('Limit of Liability amount is not set')
                }
            } catch {
                warnings.push('Limit of Liability amount is not set')
            }
        }

        // Hull: Agreed Value + per-alternative premiums
        if (typeCode === 'H') {
            if (quotation.agreedValue == null || quotation.agreedValue === 0) {
                warnings.push('Agreed Insured Value is not set')
            }
            try {
                const hullAlts = await window.api.hullGetQuotationAlternatives(quotation.id)
                const safeAlts = Array.isArray(hullAlts) ? hullAlts : []
                if (safeAlts.length > 1) {
                    for (const alt of safeAlts) {
                        if (alt.premiumAmount == null || alt.premiumAmount === 0) {
                            const label = alt.label || `Alternative ${safeAlts.indexOf(alt) + 1}`
                            warnings.push(`Premium for ${label} is not set`)
                        }
                    }
                }
            } catch { /* ignore — hull alternatives check is best-effort */ }
        }

        // War: Sum Insured (skip if war excess — per-vessel values used instead)
        if (typeCode === 'W' && !quotation.warExcessEnabled && (quotation.agreedValue == null || quotation.agreedValue === 0)) {
            warnings.push('Sum Insured is not set')
        }

        // Cargo: Insured Value (when not rate mode)
        if (typeCode === 'C' && quotation.premiumType !== 'rate' && (quotation.insuredValueAmount == null || quotation.insuredValueAmount === 0)) {
            warnings.push('Insured Value is not set')
        }

        return warnings
    }

    const doExport = async (quotation: Quotation, _format: 'pdf' | 'word', successMsg: string) => {
        await exportQuotationToWord(quotation)
        showSuccess(successMsg)
    }

    const runExportWithValidation = async (
        quotation: Quotation,
        format: 'pdf' | 'word',
        action: 'direct' | 'approve' | 'draft'
    ): Promise<boolean> => {
        const warnings = await validateBeforeExport(quotation)
        if (warnings.length > 0) {
            setExportWarnings({ warnings, format, action })
            return false
        }
        return true
    }

    const handleExportWithDraftCheck = async (format: 'pdf' | 'word') => {
        if (isDraft && hasPermission('quotations:approve')) {
            const ok = await runExportWithValidation(q, format, 'approve')
            if (ok) setShowDraftExportModal(format)
            return
        }
        // If draft but no approve permission, just export as-is with draft number
        const ok = await runExportWithValidation(q, format, 'direct')
        if (!ok) return
        try {
            await doExport(q, format, `${format.toUpperCase()} exported`)
        } catch (err: any) {
            showError(err.message || `${format.toUpperCase()} export failed`)
        }
    }

    const handleApproveAndExport = async (format: 'pdf' | 'word') => {
        try {
            // First move to Approved step
            const steps = await window.api.workflowGetReachableSteps(q.id)
            const approvedStep = (Array.isArray(steps) ? steps : []).find(
                (s: any) => s.name.toLowerCase() === 'approved'
            )
            if (approvedStep) {
                await window.api.workflowMoveQuotation(q.id, approvedStep.id)
            } else {
                // No Approved step reachable — just assign number directly
                await window.api.workflowAssignQuotationNumber(q.id)
            }
            // Reload quotation to get updated reference
            const fullQ = await window.api.getQuotation(q.id)
            if (fullQ && !(fullQ as any).error) {
                setQ(fullQ)
                // Reload reachable steps
                const newSteps = await window.api.workflowGetReachableSteps(fullQ.id)
                setReachableSteps(Array.isArray(newSteps) ? newSteps : [])
                // Export with updated data
                await doExport(fullQ, format, `Approved and ${format.toUpperCase()} exported`)
            }
        } catch (err: any) {
            showError(err.message || 'Failed to approve and export')
        }
        setShowDraftExportModal(null)
    }

    const handleExportAsDraft = async (format: 'pdf' | 'word') => {
        setShowDraftExportModal(null)
        try {
            await doExport(q, format, `${format.toUpperCase()} exported (as draft)`)
        } catch (err: any) {
            showError(err.message || `${format.toUpperCase()} export failed`)
        }
    }

    const handleExportWarningProceed = async () => {
        if (!exportWarnings) return
        const { format, action } = exportWarnings
        setExportWarnings(null)
        if (action === 'approve') {
            // User confirmed — show the draft export modal now
            setShowDraftExportModal(format)
        } else if (action === 'draft') {
            await handleExportAsDraft(format)
        } else {
            try {
                await doExport(q, format, `${format.toUpperCase()} exported`)
            } catch (err: any) {
                showError(err.message || `${format.toUpperCase()} export failed`)
            }
        }
    }

    const updateField = async (field: string, value: any) => {
        if (isLocked || !canEdit) return
        try {
            await window.api.updateQuotation(q.id, { [field]: value } as any)
            setQ(prev => ({ ...prev, [field]: value }))
            hasEdited.current = true
        } catch (err: any) {
            showError(err.message || 'Failed to update')
        }
    }

    // P&I Alternatives management
    const piAltColors = ['#00aac8', '#6464ff', '#ff64c8', '#ffb020', '#44cc88']
    const isPIType = q.quotationTypeCode === 'P'
    const piAltTabs: EditorTab[] = ['conditions', 'warranties', 'deductibles', 'exclusions']
    const showPIAltBar = isPIType && piAltTabs.includes(activeTab)

    const handleAddPIAlternatives = async () => {
        if (isLocked || !canEdit) return
        try {
            const a1 = await window.api.piAddQuotationAlternative(q.id, 'Alternative 1')
            const a2 = await window.api.piAddQuotationAlternative(q.id, 'Alternative 2')
            if ((a1 as any)?.error || (a2 as any)?.error) { showError('Failed to create alternatives'); return }
            // Migrate existing shared items (alternative_id = NULL) to Alt 1
            await window.api.piMigrateSharedToAlternative(q.id, a1.id)
            setPiAlternatives([a1, a2])
            setSelectedPIAltId(a1.id)
            showSuccess('Alternatives created')
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const handleAddPIAlternative = async () => {
        if (isLocked) return
        try {
            const label = `Alternative ${piAlternatives.length + 1}`
            const a = await window.api.piAddQuotationAlternative(q.id, label)
            if ((a as any)?.error) { showError((a as any).message); return }
            setPiAlternatives(prev => [...prev, a])
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const handleRemoveLastPIAlternative = async () => {
        if (isLocked || !canEdit || piAlternatives.length < 2) return
        try {
            if (piAlternatives.length === 2) {
                // Remove both — exit alternatives mode
                for (const alt of piAlternatives) await window.api.piDeleteQuotationAlternative(alt.id)
                setPiAlternatives([])
                setSelectedPIAltId(null)
                showSuccess('Alternatives removed')
            } else {
                const last = piAlternatives[piAlternatives.length - 1]
                await window.api.piDeleteQuotationAlternative(last.id)
                setPiAlternatives(prev => prev.slice(0, -1))
                if (selectedPIAltId === last.id) setSelectedPIAltId(null)
                showSuccess('Alternative removed')
            }
        } catch (err: any) { showError(err.message || 'Failed') }
    }

    const _handleRenamePIAlternative = async (id: string, label: string) => {
        try {
            await window.api.piUpdateQuotationAlternative(id, { label })
            setPiAlternatives(prev => prev.map(a => a.id === id ? { ...a, label } : a))
        } catch (err: any) { showError(err.message || 'Failed') }
    }
    void _handleRenamePIAlternative

    // statusColors used for future status display
    void statusColors

    const handleBack = async () => {
        // If draft quotation with no edits, created very recently, and has no vessels — delete it (abandoned creation)
        if (isDraft && !hasEdited.current) {
            const createdAt = q.createdAt ? new Date(q.createdAt).getTime() : 0
            const ageSeconds = (Date.now() - createdAt) / 1000
            if (ageSeconds < 60) {
                try {
                    const vess = await window.api.getQuotationVessels(q.id)
                    if (!Array.isArray(vess) || vess.length === 0) {
                        await window.api.deleteQuotation(q.id)
                    }
                } catch { /* ignore */ }
            }
        }
        onBack()
    }

    return (
        <div className="fade-in">
            {policyContext ? (
                <button onClick={() => onReturnToPolicy ? onReturnToPolicy(policyContext.policyId) : handleBack()} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <ArrowLeft size={18} /> Return to Policy
                </button>
            ) : (
                <button onClick={handleBack} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                    <ArrowLeft size={18} /> Back to Quotations
                </button>
            )}

            {/* Policy editing context banner */}
            {policyContext && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', marginBottom: '12px',
                    borderRadius: '10px', background: 'rgba(0, 170, 200, 0.1)', border: '1px solid rgba(0, 170, 200, 0.3)',
                    color: isLight ? '#007a91' : '#00aac8', fontSize: '0.85rem', fontWeight: 600
                }}>
                    <FileText size={16} /> Editing coverage for Policy {policyContext.policyNumber || policyContext.policyId}
                    <button
                        onClick={() => onReturnToPolicy ? onReturnToPolicy(policyContext.policyId) : onBack()}
                        className="btn-primary"
                        style={{ marginLeft: 'auto', padding: '6px 16px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        Done — Return to Policy <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
                    </button>
                </div>
            )}

            {/* Locked banner */}
            {isLockedByOther && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', marginBottom: '12px',
                    borderRadius: '10px', background: 'rgba(255, 176, 32, 0.12)', border: '1px solid rgba(255, 176, 32, 0.3)',
                    color: isLight ? '#8a6400' : '#ffb020', fontSize: '0.85rem', fontWeight: 600
                }}>
                    <Lock size={16} /> {q.workflowStepName?.toLowerCase() === 'converted'
                        ? 'This quotation has been converted to a policy (read-only).'
                        : (q.revisionNumber || 0) > 0 && revisions.some(r => (r.revisionNumber || 0) > (q.revisionNumber || 0))
                            ? `This is an older revision (read-only). ${revisions.length > 1 ? 'Switch to the latest revision to make changes.' : ''}`
                            : 'This quotation is locked (read-only).'}
                </div>
            )}

            {/* Renewal indicator banner */}
            {q.renewedFromPolicyId && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', marginBottom: '12px',
                    borderRadius: '10px', background: 'rgba(0, 200, 100, 0.1)', border: '1px solid rgba(0, 200, 100, 0.3)',
                    color: isLight ? '#008844' : '#00c864', fontSize: '0.85rem', fontWeight: 600
                }}>
                    <RefreshCw size={16} /> Renewal of Policy {q.renewedFromPolicyNumber || q.renewedFromPolicyId}
                    {_onNavigateToPolicy && (
                        <button
                            onClick={() => _onNavigateToPolicy(q.renewedFromPolicyId!)}
                            className="btn-secondary"
                            style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '5px' }}
                        >
                            View Policy <ExternalLink size={12} />
                        </button>
                    )}
                </div>
            )}

            {/* Locked banner */}
            {isLockedByOther && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', marginBottom: '12px', borderRadius: '8px',
                    background: isLight ? 'rgba(255,176,32,0.1)' : 'rgba(255,176,32,0.15)',
                    border: '1px solid rgba(255,176,32,0.3)',
                    color: isLight ? '#92400e' : '#fbbf24',
                    fontSize: '0.85rem', fontWeight: 600
                }}>
                    <Lock size={16} />
                    This quotation is being edited by {lockedByName}. You are viewing in read-only mode.
                </div>
            )}

            {!stepCanEdit && !isLockedByOther && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 16px', marginBottom: '12px', borderRadius: '8px',
                    background: isLight ? 'rgba(100,100,255,0.08)' : 'rgba(100,100,255,0.12)',
                    border: '1px solid rgba(100,100,255,0.3)',
                    color: isLight ? '#4338ca' : '#818cf8',
                    fontSize: '0.85rem', fontWeight: 600
                }}>
                    <Lock size={16} />
                    Editing is disabled at the &quot;{currentStep?.name}&quot; workflow step.
                </div>
            )}

            {/* Type title */}
            {q.quotationTypeName && (
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: isLight ? '#007a91' : '#00aac8', margin: '0 0 14px', letterSpacing: '0.02em' }}>
                    {q.quotationTypeName} Quotation
                </h2>
            )}

            {/* Header — Row 1: Identity + Badges + Actions */}
            <div className="glass-card" style={{ padding: '16px 20px', marginBottom: '20px', overflow: 'visible' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    {/* Reference number */}
                    <input
                        type="text"
                        value={q.referenceNumber || ''}
                        onChange={e => setQ(prev => ({ ...prev, referenceNumber: e.target.value }))}
                        onBlur={e => updateField('referenceNumber', e.target.value)}
                        placeholder="Reference"
                        disabled={isLocked || !canEdit}
                        style={{ padding: '6px 10px', borderRadius: '6px', width: '150px', fontSize: '1rem', fontWeight: 700 }}
                    />
                    {/* DRAFT badge */}
                    {(q.referenceNumber || '').startsWith('DRAFT-') && (
                        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', background: 'rgba(150, 150, 150, 0.15)', color: isLight ? '#666' : '#999', letterSpacing: '0.05em' }}>
                            Draft
                        </span>
                    )}
                    {/* Type badge */}
                    {q.quotationTypeName && (
                        <span style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, background: 'rgba(0,170,200,0.15)', color: isLight ? '#007a91' : '#00aac8' }}>
                            {q.quotationTypeName}
                        </span>
                    )}
                    {/* Vessel/Fleet name */}
                    {qVessels.length > 0 && (
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            {qVessels.length === 1
                                ? (qVessels[0].name || qVessels[0].vesselLabel)
                                : q.title || qVessels.map(v => v.name || v.vesselLabel).join(' / ')
                            }
                        </span>
                    )}
                    {/* Workflow step badge */}
                    {q.workflowStepName && (
                        <div style={{ position: 'relative' }}>
                            <button
                                ref={stepMenuRef}
                                onClick={() => reachableSteps.length > 0 && setShowStepMenu(!showStepMenu)}
                                style={{
                                    padding: '4px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                    background: (q.workflowStepColor || '#6b7280') + '22',
                                    color: q.workflowStepColor || '#6b7280',
                                    border: `1.5px solid ${q.workflowStepColor || '#6b7280'}`,
                                    cursor: reachableSteps.length > 0 ? 'pointer' : 'default',
                                    display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: q.workflowStepColor || '#6b7280' }} />
                                {q.workflowStepName}
                                {reachableSteps.length > 0 && <ChevronDown size={12} />}
                            </button>
                            {showStepMenu && createPortal(
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowStepMenu(false)} />
                                    <div style={{
                                        position: 'fixed',
                                        top: (stepMenuRef.current?.getBoundingClientRect().bottom || 0) + 4,
                                        left: stepMenuRef.current?.getBoundingClientRect().left || 0,
                                        zIndex: 9999,
                                        background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                                        borderRadius: '10px', padding: '6px', minWidth: '220px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                                    }}>
                                        <div style={{ padding: '6px 10px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Move to...</div>
                                        {reachableSteps.map(step => (
                                            <button
                                                key={step.id}
                                                onClick={() => { setShowStepMenu(false); setShowStepCommentModal(step.id) }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                                    padding: '8px 12px', border: 'none', borderRadius: '6px',
                                                    background: 'transparent', color: 'var(--text-primary)',
                                                    cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left'
                                                }}
                                                className="hover-effect"
                                            >
                                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: step.color, flexShrink: 0 }} />
                                                {step.name}
                                                {step.isLockPoint && <Lock size={12} style={{ opacity: 0.4, marginLeft: 'auto' }} />}
                                            </button>
                                        ))}
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>
                    )}
                    {/* Workflow log toggle */}
                    {workflowLog.length > 0 && (
                        <div style={{ position: 'relative' }}>
                            <button onClick={() => setShowWorkflowLog(!showWorkflowLog)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '3px' }} title="Workflow history">
                                <History size={13} /> {workflowLog.length}
                            </button>
                            {showWorkflowLog && (
                                <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 200, marginTop: '4px', padding: '10px', background: isLight ? '#ffffff' : '#1e222a', border: '1px solid var(--glass-border)', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.4)', minWidth: '280px', maxHeight: '200px', overflowY: 'auto' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Workflow History</div>
                                    {workflowLog.map(entry => (
                                        <div key={entry.id} style={{ fontSize: '0.75rem', padding: '4px 0', borderBottom: '1px solid var(--table-border)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <div><span style={{ fontWeight: 600 }}>{entry.fromStepName || '—'}</span> → <span style={{ fontWeight: 600 }}>{entry.toStepName}</span></div>
                                            <div style={{ color: 'var(--text-secondary)' }}>{entry.username} · {new Date(entry.createdAt).toLocaleDateString()}{entry.comment ? ` · "${entry.comment}"` : ''}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                    {/* Revision badge */}
                    {revisions.length > 1 && (
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowRevisionHistory(!showRevisionHistory)}
                                style={{
                                    padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                    background: (q.revisionNumber || 0) > 0 ? 'rgba(180,100,255,0.15)' : 'rgba(0,200,100,0.15)',
                                    color: (q.revisionNumber || 0) > 0 ? (isLight ? '#7a3db8' : '#b464ff') : (isLight ? '#008c46' : '#00c864'),
                                    border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                {(q.revisionNumber || 0) > 0 ? `R${q.revisionNumber}` : 'Original'}
                                {isLocked && <Lock size={11} />}
                                <ChevronDown size={12} />
                            </button>
                            {showRevisionHistory && (
                                <>
                                    <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowRevisionHistory(false)} />
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, marginTop: '4px', zIndex: 100,
                                        background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                                        borderRadius: '10px', padding: '6px', minWidth: '260px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                                    }}>
                                        {revisions.map(rev => (
                                            <button
                                                key={rev.id}
                                                onClick={() => { setShowRevisionHistory(false); if (rev.id !== q.id && onOpenQuotation) onOpenQuotation(rev) }}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                                                    padding: '10px 14px', border: 'none', borderRadius: '6px',
                                                    background: rev.id === q.id ? (isLight ? 'rgba(0,170,200,0.08)' : 'rgba(0,170,200,0.12)') : 'transparent',
                                                    color: 'var(--text-primary)', cursor: rev.id === q.id ? 'default' : 'pointer',
                                                    fontSize: '0.85rem', textAlign: 'left'
                                                }}
                                                className={rev.id !== q.id ? 'hover-effect' : undefined}
                                            >
                                                <span style={{ fontWeight: 600, minWidth: '70px' }}>{rev.revisionNumber === 0 ? 'Original' : `R${rev.revisionNumber}`}</span>
                                                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', flex: 1 }}>{rev.referenceNumber}</span>
                                                {rev.isLocked && <Lock size={13} style={{ opacity: 0.4 }} />}
                                                {rev.id === q.id && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', fontWeight: 700 }}>CURRENT</span>}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                    {/* Date + Currency inline */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Date:</span>
                        <input type="date" value={q.quotationDate || ''} onChange={e => { setQ(prev => ({ ...prev, quotationDate: e.target.value })); updateField('quotationDate', e.target.value) }} disabled={isLocked || !canEdit} style={{ padding: '4px 6px', borderRadius: '6px', fontSize: '0.8rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Currency:</span>
                        <input type="text" value={q.premiumCurrency || 'USD'} onChange={e => setQ(p => ({ ...p, premiumCurrency: e.target.value }))} onBlur={e => updateField('premiumCurrency', e.target.value)} disabled={isLocked || !canEdit} style={{ width: '50px', padding: '4px 6px', borderRadius: '6px', fontSize: '0.8rem' }} />
                    </div>
                    {/* Spacer */}
                    <div style={{ flex: 1 }} />
                    {/* Actions dropdown */}
                    <div style={{ position: 'relative' }} ref={actionsRef}>
                        <button
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="btn-secondary"
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
                        >
                            <MoreHorizontal size={16} /> Actions
                        </button>
                        {showActionsMenu && createPortal(
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setShowActionsMenu(false)} />
                                <div style={{
                                    position: 'fixed',
                                    top: (actionsRef.current?.getBoundingClientRect().bottom || 0) + 4,
                                    right: window.innerWidth - (actionsRef.current?.getBoundingClientRect().right || 0),
                                    zIndex: 9999,
                                    background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                                    borderRadius: '10px', padding: '6px', minWidth: '200px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)'
                                }}>
                                    {!policyContext && canExport && <button onClick={() => { setShowActionsMenu(false); handleExportWithDraftCheck('word') }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><Download size={15} /> Export</button>}
                                    <button onClick={() => { setShowActionsMenu(false); setShowSectionOrder(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><LayoutList size={15} /> Section Order</button>
                                    {!isLocked && canEdit && <button onClick={() => { setShowActionsMenu(false); setShowCopyFromQuotation(true) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><Copy size={15} /> Copy from Quotation</button>}
                                    {!isLocked && canEdit && <button onClick={async () => { setShowActionsMenu(false); await handleReloadFromSettings() }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><RefreshCw size={15} /> Reload from Settings</button>}
                                    {!policyContext && !isLocked && canEdit && <><div style={{ height: '1px', background: 'var(--glass-border)', margin: '4px 0' }} /><button onClick={() => { setShowActionsMenu(false); handleCreateRevision() }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: isLight ? '#7a3db8' : '#b464ff', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><GitBranch size={15} /> Create Revision</button></>}
                                    {!policyContext && canEdit && q.workflowStepName?.toLowerCase() !== 'converted' && <><div style={{ height: '1px', background: 'var(--glass-border)', margin: '4px 0' }} /><button onClick={() => { setShowActionsMenu(false); if (onNavigateToPolicySetup) onNavigateToPolicySetup(q.id) }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: isLight ? '#008c46' : '#00c864', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><FileText size={15} /> Convert to Policy</button></>}
                                    {!policyContext && hasPermission('quotations:delete') && <><div style={{ height: '1px', background: 'var(--glass-border)', margin: '4px 0' }} /><button onClick={() => { setShowActionsMenu(false); openDeleteModal() }} style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '8px 12px', border: 'none', borderRadius: '6px', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.85rem', textAlign: 'left' }} className="hover-effect"><Trash2 size={15} /> Delete Quotation</button></>}
                                </div>
                            </>,
                            document.body
                        )}
                    </div>
                </div>
            </div>

            {/* Step comment modal */}
            {showStepCommentModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setShowStepCommentModal(null); setStepComment('') }}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '14px', padding: '24px', width: '400px', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px', fontSize: '1rem' }}>Move to {reachableSteps.find(s => s.id === showStepCommentModal)?.name}</h3>
                        <textarea
                            value={stepComment}
                            onChange={e => setStepComment(e.target.value)}
                            placeholder="Add a comment (optional)..."
                            rows={3}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg, transparent)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                            <button className="btn-secondary" onClick={() => { setShowStepCommentModal(null); setStepComment('') }}>Cancel</button>
                            <button className="btn-primary" onClick={() => handleMoveToStep(showStepCommentModal, stepComment || undefined)}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Draft export confirmation modal */}
            {showDraftExportModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowDraftExportModal(null)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '14px', padding: '24px', width: '440px', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1rem' }}>Quotation Not Approved</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 20px', lineHeight: 1.5 }}>
                            This quotation still has a draft reference number. Would you like to approve it first to assign an official number?
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn-secondary" onClick={() => setShowDraftExportModal(null)}>Cancel</button>
                            <button className="btn-secondary" onClick={() => handleExportAsDraft(showDraftExportModal)}>Export as Draft</button>
                            <button className="btn-primary" onClick={() => handleApproveAndExport(showDraftExportModal)}>Approve &amp; Export</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Export validation warnings modal */}
            {exportWarnings && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1001 }} onClick={() => setExportWarnings(null)}>
                    <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '14px', padding: '24px', width: '460px', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ background: 'rgba(255, 180, 32, 0.12)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <AlertTriangle size={22} color="#ffb020" />
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>Missing Required Fields</h3>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '0 0 12px', lineHeight: 1.5 }}>
                            The following required amount fields are empty. The export may be incomplete.
                        </p>
                        <ul style={{ margin: '0 0 20px', padding: '0 0 0 20px', listStyle: 'disc' }}>
                            {exportWarnings.warnings.map((w, i) => (
                                <li key={i} style={{ color: 'var(--text-primary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{w}</li>
                            ))}
                        </ul>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button className="btn-secondary" onClick={() => setExportWarnings(null)}>Cancel</button>
                            <button className="btn-primary" onClick={handleExportWarningProceed}>Export Anyway</button>
                        </div>
                    </div>
                </div>
            )}

            {deleteModal?.show && (
                deleteModal.revisionCount <= 1 ? (
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                        }}
                        onClick={() => setDeleteModal(null)}
                    >
                        <div
                            style={{
                                width: '90%', maxWidth: '480px',
                                background: isLight ? '#ffffff' : '#1a1d28',
                                borderRadius: '14px', border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                                boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.2)' : '0 10px 40px rgba(0,0,0,0.5)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '24px 24px 10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(255, 77, 77, 0.1)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Trash2 size={24} color="var(--danger)" />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Delete Quotation?</h3>
                            </div>
                            <div style={{ padding: '10px 24px 24px' }}>
                                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    Delete quotation {q.referenceNumber || '(no ref)'}? This cannot be undone.
                                </p>
                            </div>
                            <div style={{
                                padding: '16px 24px', background: isLight ? '#fafafa' : 'rgba(0,0,0,0.02)',
                                borderTop: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '0 0 14px 14px', display: 'flex', justifyContent: 'flex-end', gap: '12px'
                            }}>
                                <button onClick={() => setDeleteModal(null)} className="btn-secondary" style={{ padding: '8px 16px' }}>Cancel</button>
                                <button onClick={handleDeleteFromEditor} className="btn-primary" style={{ padding: '8px 16px', background: 'var(--danger)', borderColor: 'var(--danger)' }}>Delete</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        style={{
                            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                            background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(4px)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                        }}
                        onClick={() => setDeleteModal(null)}
                    >
                        <div
                            style={{
                                width: '90%', maxWidth: '480px',
                                background: isLight ? '#ffffff' : '#1a1d28',
                                borderRadius: '14px', border: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                                boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.2)' : '0 10px 40px rgba(0,0,0,0.5)'
                            }}
                            onClick={e => e.stopPropagation()}
                        >
                            <div style={{ padding: '24px 24px 10px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: 'rgba(255, 77, 77, 0.1)', padding: '10px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Trash2 size={24} color="var(--danger)" />
                                </div>
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>
                                    Delete Quotation {q.referenceNumber || '(no ref)'}
                                    {(q.revisionNumber || 0) > 0 && (
                                        <span style={{
                                            marginLeft: '6px', padding: '2px 6px', borderRadius: '4px',
                                            fontSize: '0.65rem', fontWeight: 700,
                                            background: 'rgba(180, 100, 255, 0.15)',
                                            color: isLight ? '#7a3db8' : '#b464ff'
                                        }}>R{q.revisionNumber}</span>
                                    )}
                                </h3>
                            </div>

                            <div style={{ padding: '16px 24px 20px 24px' }}>
                                <p style={{ margin: '0 0 16px', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                                    This quotation has {deleteModal.revisionCount} revision{deleteModal.revisionCount > 1 ? 's' : ''}. Choose how to delete:
                                </p>

                                <label
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px',
                                        borderRadius: '8px', cursor: 'pointer', marginBottom: '8px',
                                        border: deleteModal.deleteMode === 'single'
                                            ? '2px solid var(--accent-primary)'
                                            : `1px solid ${isLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)'}`,
                                        background: deleteModal.deleteMode === 'single'
                                            ? (isLight ? 'rgba(0,170,200,0.05)' : 'rgba(0,170,200,0.08)')
                                            : 'transparent'
                                    }}
                                    onClick={() => setDeleteModal(prev => prev ? { ...prev, deleteMode: 'single' } : prev)}
                                >
                                    <input type="radio" name="editorDeleteMode" checked={deleteModal.deleteMode === 'single'} onChange={() => setDeleteModal(prev => prev ? { ...prev, deleteMode: 'single' } : prev)} style={{ marginTop: '2px', accentColor: 'var(--accent-primary)' }} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>
                                            Delete this revision only{(q.revisionNumber || 0) > 0 && ` (R${q.revisionNumber})`}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            {(q.revisionNumber || 0) === 0
                                                ? 'This is the original. The next revision will become the base.'
                                                : 'The previous revision will become the latest version.'}
                                        </div>
                                    </div>
                                </label>

                                <label
                                    style={{
                                        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 14px',
                                        borderRadius: '8px', cursor: 'pointer',
                                        border: deleteModal.deleteMode === 'all'
                                            ? '2px solid var(--danger)'
                                            : `1px solid ${isLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)'}`,
                                        background: deleteModal.deleteMode === 'all'
                                            ? (isLight ? 'rgba(255,77,77,0.05)' : 'rgba(255,77,77,0.08)')
                                            : 'transparent'
                                    }}
                                    onClick={() => setDeleteModal(prev => prev ? { ...prev, deleteMode: 'all' } : prev)}
                                >
                                    <input type="radio" name="editorDeleteMode" checked={deleteModal.deleteMode === 'all'} onChange={() => setDeleteModal(prev => prev ? { ...prev, deleteMode: 'all' } : prev)} style={{ marginTop: '2px', accentColor: 'var(--danger)' }} />
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '2px' }}>Delete all revisions ({deleteModal.revisionCount})</div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>This will permanently remove the entire quotation history.</div>
                                    </div>
                                </label>
                            </div>

                            <div style={{
                                padding: '16px 24px', background: isLight ? '#fafafa' : 'rgba(0,0,0,0.02)',
                                borderTop: isLight ? '1px solid #e0e0e0' : '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '0 0 14px 14px', display: 'flex', justifyContent: 'flex-end', gap: '12px'
                            }}>
                                <button onClick={() => setDeleteModal(null)} className="btn-secondary" style={{ padding: '8px 16px' }}>Cancel</button>
                                <button onClick={handleDeleteFromEditor} className="btn-primary" style={{ padding: '8px 16px', background: 'var(--danger)', borderColor: 'var(--danger)' }}>Delete</button>
                            </div>
                        </div>
                    </div>
                )
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', marginBottom: '20px' }}>
                {getTabsForType(q.quotationTypeCode).map(t => {
                    const Icon = t.icon
                    const active = activeTab === t.key
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px 8px 0 0',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.78rem',
                                fontWeight: active ? '600' : '400',
                                background: active ? 'var(--bg-card)' : 'transparent',
                                color: active ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                borderBottom: active ? '2px solid var(--accent-primary)' : '2px solid transparent',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.15s'
                            }}
                        >
                            <Icon size={14} /> {t.label}
                        </button>
                    )
                })}
            </div>

            {/* P&I Alternatives Bar */}
            {showPIAltBar && (
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px',
                    marginBottom: '8px', borderRadius: '10px',
                    background: isLight ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--glass-border)', flexWrap: 'wrap'
                }}>
                    {piAlternatives.length === 0 ? (
                        <>
                            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No alternatives configured</span>
                            {!isLocked && (
                                <button onClick={handleAddPIAlternatives} className="btn-secondary" style={{ fontSize: '0.78rem', padding: '5px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Plus size={13} /> Add Alternatives
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {piAlternatives.map((alt, idx) => {
                                const color = piAltColors[idx % piAltColors.length]
                                const active = selectedPIAltId === alt.id
                                return (
                                    <button
                                        key={alt.id}
                                        onClick={() => setSelectedPIAltId(alt.id)}
                                        style={{
                                            padding: '5px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 600,
                                            border: active ? `1.5px solid ${color}` : '1px solid var(--input-border)',
                                            background: active ? `${color}18` : 'transparent',
                                            color: active ? color : 'var(--text-secondary)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                                        }}
                                    >
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                                        {alt.label || `Alt ${idx + 1}`}
                                    </button>
                                )
                            })}
                            {!isLocked && (
                                <>
                                    <button onClick={handleAddPIAlternative} className="btn-secondary" style={{ padding: '5px 8px', fontSize: '0.78rem' }} title="Add alternative">
                                        <Plus size={14} />
                                    </button>
                                    <button onClick={handleRemoveLastPIAlternative} className="btn-secondary" style={{ padding: '5px 8px', fontSize: '0.78rem', color: 'var(--danger)' }} title="Remove last alternative">
                                        <Trash2 size={14} />
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Tab Content */}
            {activeTab !== 'hullConditions' && <div className="glass-card" style={{ padding: '24px', minHeight: '300px' }}>
                {qVessels.length >= 2 && (
                    <div style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px 12px',
                        padding: '8px 14px',
                        marginBottom: '2px',
                        fontSize: '0.72rem',
                        color: 'var(--text-secondary)'
                    }}>
                        {qVessels.map(v => (
                            <span key={v.id}>
                                <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{v.vesselLabel}</span>
                                {' '}{(v.name || v.vesselLabel).toUpperCase()}
                            </span>
                        ))}
                    </div>
                )}
                {activeTab === 'insured' && <InsuredTab key={vesselVersion} quotation={q} vessels={vessels} showSuccess={showSuccess} showError={showError} updateField={updateField} />}
                {activeTab === 'vessel' && <VesselTab quotation={q} vessels={vessels} showSuccess={showSuccess} showError={showError} isLight={isLight} onVesselsChanged={() => setVesselVersion(v => v + 1)} setQ={setQ} />}
                {activeTab === 'agreedValue' && <AgreedValueTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'liability' && <LiabilityTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} getEffectiveText={getEffectiveText} />}
                {activeTab === 'sumInsured' && <SumInsuredTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'warConditions' && <WarConditionsTab quotation={q} showError={showError} />}
                {activeTab === 'conditions' && <ConditionsTab quotation={q} showSuccess={showSuccess} showError={showError} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'period' && <PeriodTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'trading' && <TradingTab quotation={q} showSuccess={showSuccess} showError={showError} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} />}
                {activeTab === 'warTrading' && <WarTradingTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'warranties' && <WarrantiesTab quotation={q} showSuccess={showSuccess} showError={showError} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'surveyWarranties' && <SurveyWarrantiesTab quotation={q} showSuccess={showSuccess} showError={showError} piAlternatives={piAlternatives} />}
                {activeTab === 'deductibles' && <DeductiblesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} updateField={updateField} setQ={setQ} getEffectiveText={getEffectiveText} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'exclusions' && <ExclusionsTab quotation={q} showSuccess={showSuccess} showError={showError} piAlternatives={piAlternatives} selectedPIAltId={selectedPIAltId} />}
                {activeTab === 'sanctions' && <SanctionsTab quotation={q} updateField={updateField} setQ={setQ} sanctionsVersions={sanctionsVersions} />}
                {activeTab === 'subjectivities' && <SubjectivitiesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'premium' && <PremiumTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} isLight={isLight} getEffectiveText={getEffectiveText} />}
                {activeTab === 'information' && <InformationTab quotation={q} updateField={updateField} setQ={setQ} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'insuredValue' && <InsuredValueTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'voyage' && <VoyageTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'subjectMatter' && <SubjectMatterTab quotation={q} updateField={updateField} setQ={setQ} />}
                {activeTab === 'cargoConditions' && <CargoClausesTab quotation={q} section="conditions" updateField={updateField} showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'cargoSpecial' && <CargoClausesTab quotation={q} section="special" showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'cargoLaw' && <CargoClausesTab quotation={q} section="law" showSuccess={showSuccess} showError={showError} />}
                {activeTab === 'customSections' && <CustomSectionsTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
                {activeTab === 'notes' && <NotesTab quotation={q} showSuccess={showSuccess} showError={showError} isLight={isLight} />}
            </div>}

            {activeTab === 'hullConditions' && <HullConditionsTab quotation={q} updateField={updateField} showSuccess={showSuccess} showError={showError} />}

            {showSectionOrder && (
                <SectionOrderModal
                    quotation={q}
                    onClose={() => setShowSectionOrder(false)}
                    onSave={(order) => { setQ(prev => ({ ...prev, sectionOrder: order })); setShowSectionOrder(false) }}
                    showSuccess={showSuccess}
                    showError={showError}
                    isLight={isLight}
                />
            )}

            {showCopyFromQuotation && (
                <CopyFromQuotationModal
                    quotation={q}
                    onClose={() => setShowCopyFromQuotation(false)}
                    onCopied={async () => {
                        setShowCopyFromQuotation(false)
                        await loadMasterData()
                        showSuccess('Sections copied successfully')
                    }}
                    showError={showError}
                    isLight={isLight}
                />
            )}

        </div>
    )
}

function CopyFromQuotationModal({ quotation, onClose, onCopied, showError, isLight }: {
    quotation: Quotation
    onClose: () => void
    onCopied: () => void
    showError: (msg: string) => void
    isLight: boolean
}) {
    const [allQuotations, setAllQuotations] = useState<Quotation[]>([])
    const [searchText, setSearchText] = useState('')
    const [sourceId, setSourceId] = useState<string | null>(null)
    const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set())
    const [loading, setLoading] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const sectionOptions = [
        { key: 'insured', label: 'Insured (assureds + c/o broker)' },
        { key: 'vessels', label: 'Vessels' },
        { key: 'trading', label: 'Trading Warranty' },
        { key: 'warranties', label: 'Warranties' },
        { key: 'subjectivities', label: 'Subjectivities' },
        { key: 'premium', label: 'Premium & Instalments' },
        { key: 'period', label: 'Period' },
        { key: 'sanctions', label: 'Sanctions' },
    ]

    useEffect(() => {
        window.api.getQuotations().then(rows => {
            if (Array.isArray(rows)) {
                setAllQuotations(rows.filter(r => r.id !== quotation.id))
            }
        }).catch(() => {})
    }, [quotation.id])

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const filtered = allQuotations.filter(q => {
        if (!searchText) return true
        const s = searchText.toLowerCase()
        return (q.referenceNumber || '').toLowerCase().includes(s)
            || (q.vesselName || '').toLowerCase().includes(s)
            || (q.quotationTypeName || '').toLowerCase().includes(s)
    })

    const selectedQuotation = allQuotations.find(q => q.id === sourceId)

    const toggleSection = (key: string) => {
        setSelectedSections(prev => {
            const next = new Set(prev)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })
    }

    const handleCopy = async () => {
        if (!sourceId || selectedSections.size === 0) return
        setLoading(true)
        try {
            await window.api.copyQuotationSections(quotation.id, sourceId, Array.from(selectedSections))
            onCopied()
        } catch (err: any) {
            showError(err.message || 'Failed to copy sections')
        } finally {
            setLoading(false)
        }
    }

    const typeColor = (code?: string) => {
        switch (code) {
            case 'P': return '#00aac8'
            case 'H': return '#6464ff'
            case 'W': return '#ff64c8'
            case 'F': return '#ffb020'
            case 'L': return '#44cc88'
            case 'C': return '#ff8c00'
            default: return '#888'
        }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: isLight ? '#ffffff' : '#1a1d28', borderRadius: '14px', padding: '24px', width: '520px', maxHeight: '80vh', overflowY: 'auto', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Copy from Quotation</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}><X size={18} /></button>
                </div>

                {/* Source quotation selector */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' }}>Source Quotation</label>
                    <div ref={dropdownRef} style={{ position: 'relative' }}>
                        <div
                            onClick={() => setShowDropdown(!showDropdown)}
                            style={{
                                padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)',
                                background: 'var(--bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                fontSize: '0.85rem', color: selectedQuotation ? 'var(--text-primary)' : 'var(--text-secondary)'
                            }}
                        >
                            {selectedQuotation ? (
                                <>
                                    <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, background: typeColor(selectedQuotation.quotationTypeCode) + '22', color: typeColor(selectedQuotation.quotationTypeCode) }}>{selectedQuotation.quotationTypeCode}</span>
                                    <span>{selectedQuotation.referenceNumber}</span>
                                    {selectedQuotation.vesselName && <span style={{ color: 'var(--text-secondary)' }}>- {selectedQuotation.vesselName}</span>}
                                </>
                            ) : 'Select a quotation...'}
                            <ChevronDown size={14} style={{ marginLeft: 'auto' }} />
                        </div>
                        {showDropdown && (
                            <div style={{
                                position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px', zIndex: 10,
                                background: isLight ? '#ffffff' : '#1a1d28', border: '1px solid var(--glass-border)',
                                borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', maxHeight: '280px', overflowY: 'auto'
                            }}>
                                <div style={{ padding: '8px', position: 'sticky', top: 0, background: isLight ? '#ffffff' : '#1a1d28', zIndex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', background: 'var(--bg-card)' }}>
                                        <Search size={14} style={{ color: 'var(--text-secondary)' }} />
                                        <input
                                            type="text"
                                            value={searchText}
                                            onChange={e => setSearchText(e.target.value)}
                                            placeholder="Search quotations..."
                                            autoFocus
                                            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: '0.82rem', color: 'var(--text-primary)' }}
                                        />
                                    </div>
                                </div>
                                {filtered.length === 0 && (
                                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>No quotations found</div>
                                )}
                                {filtered.map(fq => (
                                    <div
                                        key={fq.id}
                                        onClick={() => { setSourceId(fq.id); setShowDropdown(false); setSearchText('') }}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', cursor: 'pointer',
                                            background: fq.id === sourceId ? 'rgba(0,210,255,0.06)' : 'transparent',
                                            fontSize: '0.83rem'
                                        }}
                                        className="hover-effect"
                                    >
                                        <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 600, background: typeColor(fq.quotationTypeCode) + '22', color: typeColor(fq.quotationTypeCode), flexShrink: 0 }}>{fq.quotationTypeCode}</span>
                                        <span style={{ fontWeight: 500 }}>{fq.referenceNumber}</span>
                                        {fq.vesselName && <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>- {fq.vesselName}{((fq as any).vesselCount || 0) > 1 ? ` +${(fq as any).vesselCount - 1}` : ''}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Section checkboxes */}
                <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px', display: 'block' }}>Sections to Copy</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        {sectionOptions.map(opt => (
                            <label key={opt.key} style={{
                                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px',
                                border: `1px solid ${selectedSections.has(opt.key) ? 'var(--accent)' : 'var(--input-border)'}`,
                                background: selectedSections.has(opt.key) ? 'rgba(0,170,200,0.06)' : 'transparent',
                                cursor: 'pointer', fontSize: '0.82rem', transition: 'all 0.15s'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={selectedSections.has(opt.key)}
                                    onChange={() => toggleSection(opt.key)}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                {opt.label}
                            </label>
                        ))}
                    </div>
                </div>

                {/* Warning */}
                {selectedSections.size > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '8px',
                        background: 'rgba(255,180,0,0.08)', border: '1px solid rgba(255,180,0,0.2)',
                        marginBottom: '16px', fontSize: '0.8rem', color: isLight ? '#9a6700' : '#ffb020'
                    }}>
                        <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                        This will replace existing data in the selected sections.
                    </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button className="btn-secondary" onClick={onClose} style={{ fontSize: '0.85rem' }}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={handleCopy}
                        disabled={!sourceId || selectedSections.size === 0 || loading}
                        style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Copy size={14} />
                        {loading ? 'Copying...' : `Copy ${selectedSections.size} Section${selectedSections.size !== 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    )
}

